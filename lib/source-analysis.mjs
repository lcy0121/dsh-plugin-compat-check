import { parseSource, childNodes } from "./syntax.mjs";

const members = new Set(["MemberExpression", "OptionalMemberExpression"]);
const calls = new Set(["CallExpression", "OptionalCallExpression"]);
const functions = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);
const propertyName = (n) =>
  n?.computed
    ? n.property?.type === "StringLiteral"
      ? n.property.value
      : null
    : n?.property?.name;
const keyName = (n) => n?.key?.name ?? n?.key?.value;
const unwrap = (n) =>
  [
    "TSAsExpression",
    "TSTypeAssertion",
    "TSNonNullExpression",
    "ParenthesizedExpression",
  ].includes(n?.type)
    ? unwrap(n.expression)
    : n;
const namesIn = (n, out = []) => {
  if (!n) return out;
  if (n.type === "Identifier") out.push(n.name);
  else if (n.type === "AssignmentPattern") namesIn(n.left, out);
  else if (n.type === "RestElement") namesIn(n.argument, out);
  else if (n.type === "ObjectPattern")
    for (const p of n.properties) namesIn(p.value ?? p.argument, out);
  else if (n.type === "ArrayPattern")
    for (const p of n.elements) namesIn(p, out);
  return out;
};

class Scope {
  constructor(parent, id, isFunction = !parent) {
    this.parent = parent;
    this.isFunction = isFunction;
    this.id = id;
    this.values = new Map();
  }
  functionScope() {
    return this.isFunction ? this : this.parent.functionScope();
  }
  find(name) {
    return this.values.has(name) ? this : this.parent?.find(name);
  }
  get(name) {
    return this.find(name)?.values.get(name) ?? null;
  }
  set(name, value) {
    (this.find(name) || this).values.set(name, value);
  }
}

/** Scope-aware, bounded intrafile syntax analysis. No cross-function execution. */
export function analyzeSources(
  blob,
  catalogNames,
  pkgName,
  fileSides = {},
  entryFiles = null,
) {
  const services = new Set(),
    declared = new Set(),
    softDeclared = new Set(),
    addressable = new Set();
  const callMap = new Map(),
    serviceFiles = new Map(),
    provided = new Set();
  const sites = [],
    bindings = [],
    dependencies = [],
    diagnostics = [],
    subContexts = [];
  let scopeId = 0;

  for (const [file, text] of blob) {
    const parsed = parseSource(text, file);
    if (!parsed.ast) {
      diagnostics.push(parsed.error);
      continue;
    }
    const program = parsed.ast.program;
    const exported = new Set(),
      applyNames = new Set(),
      injectNames = new Set(),
      provideNames = new Set();
    const isEntry = entryFiles === null || entryFiles.includes(file);
    for (const n of program.body) {
      if (n.type !== "ExportNamedDeclaration") continue;
      for (const spec of n.specifiers || []) {
        exported.add(spec.local?.name);
        if (spec.exported?.name === "inject") injectNames.add(spec.local?.name);
        if (spec.exported?.name === "provide")
          provideNames.add(spec.local?.name);
        if (spec.exported?.name === "apply") applyNames.add(spec.local?.name);
      }
      if (n.declaration?.id) {
        exported.add(n.declaration.id.name);
        if (n.declaration.id.name === "apply") applyNames.add("apply");
      }
      if (n.declaration?.type === "VariableDeclaration")
        for (const d of n.declaration.declarations)
          for (const name of namesIn(d.id)) {
            exported.add(name);
            if (name === "apply") applyNames.add(name);
            if (name === "inject") injectNames.add(name);
            if (name === "provide") provideNames.add(name);
          }
    }
    const root = new Scope(null, ++scopeId);
    const heads = new Set();
    const declarationOwners = new Map();
    const sides = fileSides[file] || ["host"];
    const mention = (svc) => {
      if (!svc || typeof svc !== "string") return;
      services.add(svc);
      if (!serviceFiles.has(svc)) serviceFiles.set(svc, new Set());
      serviceFiles.get(svc).add(file);
    };
    const dependency = (
      service,
      kind,
      node,
      inferred = kind === "descriptor-inject",
    ) => {
      mention(service);
      declared.add(service);
      if (kind === "optional-read" || kind === "read")
        softDeclared.add(service);
      dependencies.push({
        service,
        kind,
        inferred,
        file,
        line: node.loc?.start.line ?? 1,
        start: node.start,
        end: node.end,
        sides: [...sides],
      });
    };
    const literalNames = (node, scope) => {
      node = unwrap(node);
      if (node?.type === "Identifier")
        return scope.get(node.name)?.strings || [];
      if (node?.type !== "ArrayExpression") return [];
      return node.elements
        .filter((n) => n?.type === "StringLiteral")
        .map((n) => n.value);
    };
    const resolve = (node, scope) => {
      node = unwrap(node);
      if (!node) return null;
      if (node.type === "Identifier") {
        if (scope.find(node.name)) return scope.get(node.name);
        return node.name === "ctx"
          ? { kind: "context", head: "ctx", inferred: true }
          : null;
      }
      if (node.type === "ThisExpression") return { kind: "instance" };
      if (node.type === "ArrayExpression")
        return { kind: "literal", strings: literalNames(node, scope) };
      if (node.type === "ObjectExpression") {
        const fields = new Map();
        for (const p of node.properties)
          if (p.type === "ObjectProperty")
            fields.set(keyName(p), resolve(p.value, scope));
        return { kind: "object", fields };
      }
      if (members.has(node.type)) {
        const object = resolve(node.object, scope),
          key = propertyName(node);
        if (!key) return null;
        if (object?.kind === "instance" && key === "ctx")
          return { kind: "context", head: "this.ctx", inferred: true };
        if (object?.kind === "object") {
          const value = object.fields.get(key) || null;
          if (value?.kind === "context")
            heads.add(text.slice(node.start, node.end));
          return value;
        }
        if (object?.kind === "context")
          return {
            kind: "service",
            service: key,
            head: text.slice(node.start, node.end),
            inferred: object.inferred === true,
            form: "ctx-member",
          };
        if (object?.kind === "service")
          return {
            kind: "method",
            service: object.service,
            method: key,
            receiver: object,
            optionalService: node.optional === true,
          };
        return null;
      }
      if (
        calls.has(node.type) &&
        members.has(node.callee?.type) &&
        propertyName(node.callee) === "get" &&
        resolve(node.callee.object, scope)?.kind === "context" &&
        node.arguments[0]?.type === "StringLiteral"
      ) {
        return {
          kind: "service",
          service: node.arguments[0].value,
          form: "ctx-get",
          inferred: resolve(node.callee.object, scope)?.inferred === true,
          optional:
            node.arguments[1]?.value === false ||
            node.arguments[1]?.value === 0,
        };
      }
      return null;
    };
    const bind = (pattern, value, scope, from) => {
      if (pattern?.type === "AssignmentPattern")
        return bind(pattern.left, value, scope, from);
      if (pattern?.type === "Identifier") {
        scope.values.set(pattern.name, value);
        if (value?.kind === "context") heads.add(pattern.name);
        if (value?.kind === "service" || value?.kind === "method") {
          mention(value.service);
          bindings.push({
            variable: pattern.name,
            file,
            scopeId: scope.id,
            start: pattern.start,
            service: value.service,
            form:
              value.form ||
              (value.kind === "method" ? "ctx-get-destructure" : "alias"),
            ...(from ? { from } : {}),
          });
        }
        return;
      }
      if (pattern?.type === "ObjectPattern") {
        for (const p of pattern.properties) {
          if (p.type !== "ObjectProperty") continue;
          const key = keyName(p);
          const child =
            value?.kind === "service"
              ? {
                  kind: "method",
                  service: value.service,
                  method: key,
                  form: "ctx-get-destructure",
                  receiver: value,
                }
              : value?.kind === "context"
                ? {
                    kind: "service",
                    service: key,
                    form: "ctx-member",
                    inferred: value.inferred === true,
                  }
                : value?.fields?.get(key) || null;
          bind(p.value, child, scope);
        }
      } else for (const name of namesIn(pattern)) scope.values.set(name, null);
    };
    const predeclare = (body, scope) => {
      for (const entry of body) {
        const n = entry.declaration || entry;
        if (n.type === "VariableDeclaration")
          for (const d of n.declarations)
            for (const name of namesIn(d.id)) {
              const owner = n.kind === "var" ? scope.functionScope() : scope;
              if (n.kind !== "var" || !owner.values.has(name))
                owner.values.set(name, null);
            }
        if (n.type === "FunctionDeclaration" && n.id)
          scope.values.set(n.id.name, { kind: "function", node: n });
        if (n.type === "ClassDeclaration" && n.id)
          scope.values.set(n.id.name, null);
        if (n.type === "ImportDeclaration")
          for (const s of n.specifiers) scope.values.set(s.local.name, null);
      }
    };
    const methodKey = (n, scope) => {
      const r = resolve(n, scope);
      return r?.kind === "method" ? `${r.service}.${r.method}` : null;
    };
    // Only a helper whose boolean result exactly follows the capability test is accepted.
    const helperCondition = (call, scope) => {
      if (!calls.has(call?.type) || call.callee?.type !== "Identifier")
        return null;
      const fn = scope.get(call.callee.name)?.node;
      if (!fn || fn.body?.type !== "BlockStatement") return null;
      const body = fn.body.body;
      let condition = null;
      if (body.length === 1 && body[0].type === "ReturnStatement")
        condition = body[0].argument;
      else if (
        body[0]?.type === "IfStatement" &&
        body[0].consequent.type === "ReturnStatement" &&
        body[0].consequent.argument?.value === true &&
        body.at(-1)?.type === "ReturnStatement" &&
        body.at(-1).argument?.value === false &&
        body.slice(1, -1).every((s) => s.type === "ExpressionStatement")
      )
        condition = body[0].test;
      if (
        !condition ||
        condition.type !== "BinaryExpression" ||
        !["===", "=="].includes(condition.operator)
      )
        return null;
      const target =
        condition.left.type === "UnaryExpression" &&
        condition.left.operator === "typeof" &&
        condition.right.value === "function"
          ? condition.left.argument
          : condition.right.type === "UnaryExpression" &&
              condition.right.operator === "typeof" &&
              condition.left.value === "function"
            ? condition.right.argument
            : null;
      if (!members.has(target?.type) || target.object.type !== "Identifier")
        return null;
      const index = fn.params.findIndex(
        (p) => p.type === "Identifier" && p.name === target.object.name,
      );
      const receiver = resolve(call.arguments[index], scope);
      return receiver?.kind === "service"
        ? `${receiver.service}.${propertyName(target)}`
        : null;
    };
    const conditionGuards = (node, scope, truth = true) => {
      node = unwrap(node);
      const out = new Set();
      if (!node) return out;
      if (node.type === "UnaryExpression" && node.operator === "!")
        return conditionGuards(node.argument, scope, !truth);
      if (
        node.type === "LogicalExpression" &&
        ((truth && node.operator === "&&") ||
          (!truth && node.operator === "||"))
      ) {
        for (const k of conditionGuards(node.left, scope, truth)) out.add(k);
        for (const k of conditionGuards(node.right, scope, truth)) out.add(k);
      }
      if (node.type === "BinaryExpression") {
        const equals = ["===", "=="].includes(node.operator),
          differs = ["!==", "!="].includes(node.operator);
        if ((truth && equals) || (!truth && differs)) {
          const target =
            node.left.type === "UnaryExpression" &&
            node.left.operator === "typeof" &&
            node.right.value === "function"
              ? node.left.argument
              : node.right.type === "UnaryExpression" &&
                  node.right.operator === "typeof" &&
                  node.left.value === "function"
                ? node.right.argument
                : null;
          const key = methodKey(target, scope);
          if (key) out.add(key);
        }
      }
      if (truth) {
        const key = helperCondition(node, scope);
        if (key) out.add(key);
      }
      return out;
    };
    const merged = (a, b) => new Set([...a, ...b]);
    const exits = (n) =>
      n?.type === "ReturnStatement" ||
      n?.type === "ThrowStatement" ||
      (n?.type === "BlockStatement" &&
        n.body.length > 0 &&
        exits(n.body.at(-1)));
    const statementList = (body, scope, guards, depth) => {
      predeclare(body, scope);
      let active = new Set(guards);
      for (const n of body) {
        visit(n, scope, active, depth + 1);
        if (n.type === "IfStatement" && !n.alternate && exits(n.consequent))
          active = merged(active, conditionGuards(n.test, scope, false));
      }
    };
    const recordCall = (node, scope, guards) => {
      const value = resolve(node.callee, scope);
      if (value?.kind !== "method") return;
      mention(value.service);
      addressable.add(value.service);
      declared.add(value.service);
      const receiver = members.has(node.callee.type)
        ? node.callee.object
        : node.callee;
      const isAlias =
        receiver.type === "Identifier" && value.receiver?.kind !== "context";
      const via = isAlias ? "alias" : "ctx-member";
      const matched = isAlias
        ? receiver.name
        : text.slice(receiver.start, receiver.end);
      const guarded =
        node.optional === true ||
        guards.has(`${value.service}.${value.method}`);
      if (!callMap.has(value.service)) callMap.set(value.service, new Set());
      callMap.get(value.service).add(value.method);
      sites.push({
        service: value.service,
        method: value.method,
        plugin: pkgName,
        file,
        line: node.loc.start.line,
        column: node.loc.start.column,
        start: node.start,
        end: node.end,
        via,
        matched,
        guarded,
        capabilityGuarded: guards.has(`${value.service}.${value.method}`),
        guardKind: node.optional
          ? "optional-method"
          : guarded
            ? "controlling-capability-check"
            : "none",
        evidenceSource: "ast",
        inferredReceiver: value.receiver?.inferred === true,
        sides: [...sides],
      });
    };
    const visitFunction = (node, scope, guards, depth, contextParams) => {
      // A surrounding check cannot prove a deferred callback's future method shape.
      guards = new Set();
      // Inspect a deferred function without applying its assignments to callers.
      const cloneBinding = (value, memo) => {
        if (!value?.fields) return value;
        if (memo.has(value)) return memo.get(value);
        const copied = { ...value, fields: new Map() };
        memo.set(value, copied);
        for (const [key, field] of value.fields)
          copied.fields.set(key, cloneBinding(field, memo));
        return copied;
      };
      const memo = new Map();
      const ancestors = [];
      for (let outer = scope; outer; outer = outer.parent)
        ancestors.push([
          outer,
          new Map(
            [...outer.values].map(([name, value]) => [
              name,
              cloneBinding(value, memo),
            ]),
          ),
        ]);
      const child = new Scope(scope, ++scopeId, true);
      if (node.id) child.values.set(node.id.name, { kind: "function", node });
      const provenApply =
        scope === root && node.id && isEntry && applyNames.has(node.id.name);
      for (const [index, p] of (node.params || []).entries()) {
        const known =
          contextParams?.has(p.start) || (provenApply && index === 0);
        const inferred = known ? contextParams?.get?.(p.start) === true : true;
        bind(
          p,
          known || (p.type === "Identifier" && p.name === "ctx")
            ? { kind: "context", head: namesIn(p)[0], inferred }
            : null,
          child,
        );
      }
      try {
        if (node.body.type === "BlockStatement")
          statementList(node.body.body, child, guards, depth + 1);
        else visit(node.body, child, guards, depth + 1);
      } finally {
        for (const [outer, values] of ancestors) outer.values = values;
      }
    };
    const visit = (node, scope, guards, depth = 0) => {
      if (!node) return;
      if (depth > 512) {
        diagnostics.push({
          kind: "analysis-depth-limit",
          file,
          line: node.loc?.start.line,
        });
        return;
      }
      if (node.type === "Program")
        return statementList(node.body, scope, guards, depth);
      if (node.type === "BlockStatement")
        return statementList(
          node.body,
          new Scope(scope, ++scopeId),
          guards,
          depth,
        );
      if (functions.has(node.type))
        return visitFunction(node, scope, guards, depth);
      if (node.type === "VariableDeclaration") {
        for (const d of node.declarations) {
          declarationOwners.set(
            d.start,
            node.kind === "var" ? scope.functionScope() : scope,
          );
          visit(d, scope, guards, depth + 1);
        }
        return;
      }
      if (node.type === "VariableDeclarator") {
        if (
          isEntry &&
          scope === root &&
          node.id.type === "Identifier" &&
          applyNames.has(node.id.name) &&
          functions.has(node.init?.type)
        )
          visitFunction(
            node.init,
            scope,
            guards,
            depth + 1,
            new Map(
              node.init.params[0] ? [[node.init.params[0].start, false]] : [],
            ),
          );
        else visit(node.init, scope, guards, depth + 1);
        const value = resolve(node.init, scope);
        bind(
          node.id,
          value,
          declarationOwners.get(node.start) || scope,
          node.init?.type === "Identifier" ? node.init.name : null,
        );
        if (node.id.type === "Identifier") {
          const field = node.id.name;
          if (injectNames.has(field) || /^inject(?:Deps|Scope|s)?$/.test(field))
            for (const s of literalNames(node.init, scope))
              dependency(
                s,
                scope === root && isEntry && injectNames.has(field)
                  ? "required-inject"
                  : "descriptor-inject",
                node,
              );
          if (provideNames.has(field))
            for (const s of literalNames(node.init, scope)) {
              provided.add(s);
              mention(s);
            }
        }
        return;
      }
      const invalidate = (target) => {
        const value = resolve(target, scope);
        const overwritten = methodKey(target, scope);
        if (overwritten) guards.delete(overwritten);
        if (value?.kind === "service")
          for (const key of [...guards])
            if (key.startsWith(value.service + ".")) guards.delete(key);
      };
      if (node.type === "UnaryExpression" && node.operator === "delete")
        invalidate(node.argument);
      if (node.type === "AssignmentExpression") {
        invalidate(node.left);
        visit(node.right, scope, guards, depth + 1);
        if (node.left.type === "Identifier")
          bind(
            node.left,
            resolve(node.right, scope),
            scope.find(node.left.name) || scope,
          );
        else if (members.has(node.left.type)) {
          const object = resolve(node.left.object, scope),
            key = propertyName(node.left);
          if (object?.fields)
            object.fields.set(key, resolve(node.right, scope));
          if (key === "inject")
            for (const s of literalNames(node.right, scope))
              dependency(s, "descriptor-inject", node);
          if (key === "provide")
            for (const s of literalNames(node.right, scope)) {
              provided.add(s);
              mention(s);
            }
        }
        return;
      }
      if (node.type === "ObjectProperty" && keyName(node) === "inject")
        for (const s of literalNames(node.value, scope))
          dependency(s, "descriptor-inject", node);
      if (node.type === "IfStatement") {
        visit(node.test, scope, guards, depth + 1);
        visit(
          node.consequent,
          scope,
          merged(guards, conditionGuards(node.test, scope, true)),
          depth + 1,
        );
        visit(
          node.alternate,
          scope,
          merged(guards, conditionGuards(node.test, scope, false)),
          depth + 1,
        );
        return;
      }
      if (node.type === "ConditionalExpression") {
        visit(node.test, scope, guards, depth + 1);
        visit(
          node.consequent,
          scope,
          merged(guards, conditionGuards(node.test, scope, true)),
          depth + 1,
        );
        visit(
          node.alternate,
          scope,
          merged(guards, conditionGuards(node.test, scope, false)),
          depth + 1,
        );
        return;
      }
      if (node.type === "LogicalExpression") {
        visit(node.left, scope, guards, depth + 1);
        visit(
          node.right,
          scope,
          merged(
            guards,
            conditionGuards(node.left, scope, node.operator === "&&"),
          ),
          depth + 1,
        );
        return;
      }
      if (calls.has(node.type)) {
        recordCall(node, scope, guards);
        if (
          members.has(node.callee?.type) &&
          resolve(node.callee.object, scope)?.kind === "context"
        ) {
          const operation = propertyName(node.callee);
          if (
            operation === "get" &&
            node.arguments[0]?.type === "StringLiteral"
          )
            dependency(
              node.arguments[0].value,
              node.arguments[1]?.value === false ||
                node.arguments[1]?.value === 0
                ? "optional-read"
                : "read",
              node,
              resolve(node.callee.object, scope)?.inferred === true,
            );
          if (
            operation === "provide" &&
            node.arguments[0]?.type === "StringLiteral"
          ) {
            provided.add(node.arguments[0].value);
            mention(node.arguments[0].value);
          }
          if (operation === "inject") {
            const injected = literalNames(node.arguments[0], scope);
            for (const s of injected)
              dependency(
                s,
                "scoped-inject",
                node,
                resolve(node.callee.object, scope)?.inferred === true,
              );
            const callback = node.arguments.find((a) => functions.has(a?.type));
            visit(node.callee, scope, guards, depth + 1);
            for (const arg of node.arguments)
              if (arg !== callback) visit(arg, scope, guards, depth + 1);
            if (callback)
              visitFunction(
                callback,
                scope,
                guards,
                depth + 1,
                new Map(
                  callback.params[0]
                    ? [
                        [
                          callback.params[0].start,
                          resolve(node.callee.object, scope)?.inferred === true,
                        ],
                      ]
                    : [],
                ),
              );
            return;
          }
        }
      }
      for (const child of childNodes(node))
        visit(child, scope, guards, depth + 1);
    };
    try {
      visit(program, root, new Set());
    } catch (error) {
      diagnostics.push({
        kind: "analysis-error",
        file,
        message: error.message,
      });
    }
    subContexts.push({ file, names: [...heads].sort() });
  }
  const guardedPairs = [],
    unguardedPairs = [];
  for (const [svc, methods] of callMap)
    for (const method of methods) {
      const relevant = sites.filter(
        (s) => s.service === svc && s.method === method,
      );
      (relevant.every((s) => s.guarded) ? guardedPairs : unguardedPairs).push(
        `${svc}.${method}`,
      );
    }
  sites.sort(
    (a, b) =>
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.start - b.start,
  );
  return {
    services,
    declared,
    softDeclared,
    addressable,
    calls: callMap,
    serviceFiles,
    sites,
    provided,
    bindings,
    dependencies,
    diagnostics,
    subContexts,
    ambiguousAliases: [],
    shadowedBare: [],
    unresolvedBindings: [],
    guardedPairs: guardedPairs.sort(),
    unguardedPairs: unguardedPairs.sort(),
  };
}
