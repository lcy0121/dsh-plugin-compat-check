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

/** Prove only immutable lexical primitive expressions; never evaluate target code. */
export function localImports(text, file, check = () => {}) {
  const { ast, error } = parseSource(text, file);
  if (!ast) return { imports: [], edges: [], diagnostics: [], error };
  const imports = new Set(),
    edges = [],
    diagnostics = [],
    scopes = new WeakMap(),
    nodes = [];
  const names = (n, out = []) => {
    if (!n) return out;
    if (n.type === "Identifier") out.push(n.name);
    else if (n.type === "RestElement") names(n.argument, out);
    else if (n.type === "TSParameterProperty") names(n.parameter, out);
    else if (n.type === "AssignmentPattern") names(n.left, out);
    else if (n.type === "ObjectPattern")
      for (const p of n.properties) names(p.value ?? p.argument, out);
    else if (n.type === "ArrayPattern")
      for (const p of n.elements) names(p, out);
    return out;
  };
  const makeScope = (parent, fn = false) => ({
    parent,
    fn,
    bindings: new Map(),
  });
  const root = makeScope(null, true),
    queue = [{ node: ast, scope: root }];
  const find = (scope, name) => {
    for (let s = scope; s; s = s.parent)
      if (s.bindings.has(name)) return s.bindings.get(name);
    return null;
  };
  const functionScope = (scope) => {
    while (!scope.fn) scope = scope.parent;
    return scope;
  };
  const declare = (scope, name, binding = {}) =>
    scope.bindings.set(name, binding);
  const note = (kind, node, message) => {
    if (diagnostics.length < 100)
      diagnostics.push({ kind, start: node?.start ?? null, message });
  };
  while (queue.length) {
    if (nodes.length % 128 === 0) check();
    if (nodes.length >= 200000) {
      note("module-path-budget", null, "Module path AST budget exceeded");
      return { imports: [], edges: [], diagnostics, error: null };
    }
    const { node, scope: parent } = queue.pop();
    let scope = parent;
    const fn =
      /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod)$/.test(
        node.type,
      );
    if (node.type === "FunctionDeclaration" && node.id)
      declare(parent, node.id.name);
    if (
      [
        "ClassDeclaration",
        "TSEnumDeclaration",
        "TSDeclareFunction",
        "TSImportEqualsDeclaration",
        "TSModuleDeclaration",
      ].includes(node.type) &&
      node.id?.type === "Identifier"
    )
      declare(parent, node.id.name);
    if (fn) {
      scope = makeScope(parent, true);
      if (node.id) declare(scope, node.id.name);
      for (const p of node.params)
        for (const name of names(p)) declare(scope, name);
    } else if (
      ["ClassDeclaration", "ClassExpression", "TSModuleDeclaration"].includes(
        node.type,
      )
    ) {
      scope = makeScope(parent, node.type === "TSModuleDeclaration");
      if (node.id?.type === "Identifier") declare(scope, node.id.name);
    } else if (node.type === "StaticBlock") scope = makeScope(parent, true);
    else if (
      [
        "BlockStatement",
        "TSModuleBlock",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "CatchClause",
        "SwitchStatement",
        "ClassBody",
        "WithStatement",
      ].includes(node.type)
    )
      scope = makeScope(parent);
    if (node.type === "WithStatement") scope.opaque = true;
    if (node.type === "CatchClause")
      for (const name of names(node.param)) declare(scope, name);
    if (node.type === "VariableDeclaration")
      for (const d of node.declarations)
        for (const name of names(d.id))
          declare(node.kind === "var" ? functionScope(scope) : scope, name, {
            constant: node.kind === "const" && d.id.type === "Identifier",
            init: d.init,
            start: d.start,
          });
    if (node.type === "ImportDeclaration")
      for (const spec of node.specifiers) declare(scope, spec.local.name);
    scopes.set(node, scope);
    nodes.push(node);
    for (const child of childNodes(node)) queue.push({ node: child, scope });
  }
  // Hoisted declarations and all writes are known before proving any path.
  for (const [index, node] of nodes.entries()) {
    if (index % 128 === 0) check();
    const scope = scopes.get(node);
    if (
      node.type === "AssignmentExpression" ||
      node.type === "UpdateExpression"
    )
      for (const name of names(node.left ?? node.argument)) {
        const binding = find(scope, name);
        if (binding) binding.changed = true;
        else if (name === "require") root.requireChanged = true;
      }
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "eval" &&
      !find(scope, "eval")
    ) {
      functionScope(scope).opaque = true;
      root.requireChanged = true;
    }
  }
  const opaque = (scope, key = "opaque") => {
    for (let s = scope; s; s = s.parent) if (s[key]) return true;
    return false;
  };
  for (const [index, node] of nodes.entries()) {
    if (index % 128 === 0) check();
    const dynamic = node.type === "ImportExpression";
    const required =
      ["CallExpression", "OptionalCallExpression"].includes(node.type) &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "require";
    const declared =
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(node.type) && !!node.source;
    if (!dynamic && !required && !declared) continue;
    const scope = scopes.get(node);
    if (required && find(scope, "require")) continue;
    const source = required ? node.arguments[0] : node.source;
    let steps = 0,
      budget = false;
    const evaluate = (n, seen = new Set(), depth = 0) => {
      if (!n) return null;
      if (++steps > 128 || depth > 32) {
        budget = true;
        return null;
      }
      let value;
      if (
        [
          "TSAsExpression",
          "TSTypeAssertion",
          "TSNonNullExpression",
          "ParenthesizedExpression",
        ].includes(n.type)
      )
        return evaluate(n.expression, seen, depth + 1);
      if (
        ["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(n.type)
      )
        value = n.value;
      else if (n.type === "Identifier") {
        const binding = find(scopes.get(n), n.name);
        if (
          opaque(scopes.get(n)) ||
          !binding?.constant ||
          binding.changed ||
          !binding.init ||
          binding.start >= n.start ||
          seen.has(binding)
        )
          return null;
        const next = new Set(seen);
        next.add(binding);
        return evaluate(binding.init, next, depth + 1);
      } else if (n.type === "BinaryExpression" && n.operator === "+") {
        const a = evaluate(n.left, seen, depth + 1),
          b = evaluate(n.right, seen, depth + 1);
        if (a === null || b === null) return null;
        value = a + b;
      } else if (n.type === "TemplateLiteral") {
        value = "";
        for (let i = 0; i < n.quasis.length; i++) {
          if (n.quasis[i].value.cooked === null) return null;
          value += n.quasis[i].value.cooked;
          if (i < n.expressions.length) {
            const part = evaluate(n.expressions[i], seen, depth + 1);
            if (part === null) return null;
            value += String(part);
          }
          if (value.length > 8192) {
            budget = true;
            return null;
          }
        }
      } else return null;
      if (typeof value === "string" && value.length > 8192) {
        budget = true;
        return null;
      }
      return value;
    };
    const spec =
      required && (opaque(scope) || opaque(scope, "requireChanged"))
        ? null
        : evaluate(source);
    if (typeof spec !== "string" || !spec) {
      note(
        budget ? "module-path-budget" : "module-path-uncertain",
        node,
        budget
          ? "Constant module path exceeds evaluation budget"
          : "Module path cannot be proved as an immutable lexical string",
      );
      continue;
    }
    if (!spec.startsWith(".")) continue;
    if (edges.length >= 4096) {
      note("module-path-budget", node, "Module reference budget exceeded");
      break;
    }
    imports.add(spec);
    edges.push({
      source: spec,
      kind: required ? "require" : "import",
      start: node.start,
    });
  }
  return { imports: [...imports].sort(), edges, diagnostics, error: null };
}
