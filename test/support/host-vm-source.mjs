import { parse } from "@babel/parser";

/** Transform trusted host source for VM evaluation without depending on layout.
 * Imports stay explicit so a new dependency cannot silently escape the sandbox.
 */
export function hostVmSource(source) {
  const ast = parse(source, { sourceType: "module" });
  const edits = [];
  for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration") {
      if (!node.specifiers.length)
        throw new Error("Unsupported host side-effect import");
      const module = JSON.stringify(node.source.value);
      const declarations = node.specifiers.map((item) => {
        const value =
          item.type === "ImportNamespaceSpecifier"
            ? `__modules[${module}]`
            : item.type === "ImportDefaultSpecifier"
              ? `(__modules[${module}].default ?? __modules[${module}])`
              : `__modules[${module}][${JSON.stringify(item.imported.name ?? item.imported.value)}]`;
        return `const ${item.local.name} = ${value};`;
      });
      edits.push({
        start: node.start,
        end: node.end,
        text:
          `if (!Object.hasOwn(__modules, ${module})) throw new Error("Unmapped host import: " + ${module});\n` +
          declarations.join("\n"),
      });
    } else if (node.type === "ExportNamedDeclaration") {
      if (!node.declaration) throw new Error("Unsupported host re-export");
      edits.push({ start: node.start, end: node.declaration.start, text: "" });
    } else if (node.type === "ExportDefaultDeclaration") {
      edits.push({
        start: node.start,
        end: node.declaration.start,
        text: "const __default = ",
      });
    }
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "MemberExpression" &&
      node.object?.type === "MetaProperty" &&
      node.object.meta.name === "import" &&
      node.property.name === "url"
    ) {
      edits.push({ start: node.start, end: node.end, text: "__importMetaUrl" });
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast.program);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
