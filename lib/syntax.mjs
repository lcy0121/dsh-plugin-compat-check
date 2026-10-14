import { parse } from "@babel/parser";

/** Parse data only. Never import, evaluate, or execute the inspected module. */
export function parseSource(text, file = "") {
  const typescript = /\.[cm]?tsx?$/.test(file);
  try {
    const ast = parse(text, {
      sourceType: "unambiguous",
      attachComment: false,
      errorRecovery: false,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowUndeclaredExports: true,
      createImportExpressions: true,
      plugins: [
        ...(typescript ? ["typescript"] : []),
        "jsx",
        "decorators-legacy",
      ],
    });
    return { ast, error: null };
  } catch (error) {
    return {
      ast: null,
      error: {
        kind: "parse-error",
        file,
        line: error.loc?.line ?? null,
        column: error.loc?.column ?? null,
        message: error.message,
      },
    };
  }
}

export function childNodes(node) {
  const out = [];
  for (const [key, value] of Object.entries(node || {})) {
    if (["loc", "extra", "tokens", "comments", "errors"].includes(key))
      continue;
    if (Array.isArray(value)) {
      for (const item of value)
        if (item && typeof item.type === "string") out.push(item);
    } else if (value && typeof value.type === "string") out.push(value);
  }
  return out;
}

export function localImports(text, file) {
  const { ast, error } = parseSource(text, file);
  if (!ast) return { imports: [], error };
  const imports = new Set(),
    queue = [ast];
  while (queue.length) {
    const n = queue.pop();
    const source = [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
      "ImportExpression",
    ].includes(n.type)
      ? n.source
      : n.type === "CallExpression" &&
          n.callee?.type === "Identifier" &&
          n.callee.name === "require"
        ? n.arguments[0]
        : null;
    if (source?.type === "StringLiteral" && source.value.startsWith("."))
      imports.add(source.value);
    queue.push(...childNodes(n));
  }
  return { imports: [...imports].sort(), error: null };
}
