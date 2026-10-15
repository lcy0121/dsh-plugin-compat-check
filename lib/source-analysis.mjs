import { parseSource, childNodes } from "./syntax.mjs";
import { hasEvidence, hasProof, mergedValue } from "./flow-values.mjs";

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

/** Bounded static value flow over canonical package-local source. No evaluation. */
export function analyzeSources(
  blob,
  catalogNames,
  pkgName,
  fileSides = {},
  entryFiles = null,
  moduleLinks = new Map(),
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
  let scopeId = 0,
    invocationCount = 0,
    constantCalls = 0;
  const identifierCache = new WeakMap();
  const capturesEvidence = (fn, seen = new Set()) => {
    if (!fn?.node || seen.has(fn)) return false;
    if (seen.size >= 64) {
      diagnose(
        "flow-capture-budget",
        fn.file || "",
        fn.node,
        "Captured-function graph exceeds 64 nodes",
      );
      return false;
    }
    seen.add(fn);
    let names = identifierCache.get(fn.node);
    if (!names) {
      names = new Set();
      const queue = [fn.node.body];
      while (queue.length) {
        const n = queue.pop();
        if (!n) continue;
        if (n.type === "Identifier") names.add(n.name);
        queue.push(...childNodes(n));
      }
      identifierCache.set(fn.node, names);
    }
    for (const name of names) {
      const value = fn.scope.get(name);
      if (
        hasProof(value) ||
        (value?.kind === "function" && capturesEvidence(value, seen))
      )
        return true;
    }
    return false;
  };
  const constantOnly = (node) => {
    if (!node) return false;
    if (
      [
        "StringLiteral",
        "NumericLiteral",
        "BooleanLiteral",
        "Identifier",
      ].includes(node.type)
    )
      return true;
    if (node.type === "BinaryExpression" && node.operator === "+")
      return constantOnly(node.left) && constantOnly(node.right);
    if (node.type === "TemplateLiteral")
      return node.expressions.every(constantOnly);
    return false;
  };
  const knownParameters = new Map();
  const concreteFunctions = new Set(),
    exportReads = new Set();
  const journals = [];
  const newJournal = () => ({
    objects: new Map(),
    bindings: new Map(),
    scopeCeiling: scopeId,
  });
  const put = (owner, key, value) => {
    for (const journal of journals)
      if (owner.id <= journal.scopeCeiling) {
        if (!journal.bindings.has(owner))
          journal.bindings.set(owner, new Map());
        const before = journal.bindings.get(owner);
        if (!before.has(key))
          before.set(key, {
            present: owner.values.has(key),
            value: owner.values.get(key),
          });
      }
    owner.values.set(key, value);
  };
  const noteMutation = (object) => {
    for (const journal of journals)
      if (!journal.objects.has(object))
        journal.objects.set(object, {
          fields: object.fields,
          opaque: object.opaque,
        });
  };
  const undo = (journal) => {
    for (const [object, state] of journal.objects) {
      object.fields = state.fields;
      object.opaque = state.opaque;
    }
    for (const [owner, keys] of journal.bindings)
      for (const [key, before] of keys) {
        if (before.present) owner.values.set(key, before.value);
        else owner.values.delete(key);
      }
  };
  const writeField = (object, key, value) => {
    noteMutation(object);
    if (journals.length) object.fields = new Map(object.fields);
    object.fields.set(key, value);
  };
  const markOpaque = (object) => {
    noteMutation(object);
    object.opaque = true;
  };
  const modules = new Map(),
    frames = [],
    invoking = new Set();
  const diagnose = (kind, file, node, message) => {
    if (
      diagnostics.length < 100 &&
      !diagnostics.some(
        (d) => d.kind === kind && d.file === file && d.start === node?.start,
      )
    )
      diagnostics.push({
        kind,
        file,
        line: node?.loc?.start.line ?? 1,
        start: node?.start ?? null,
        message,
      });
  };

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
    const module = {
      file,
      root,
      initializing: false,
      initialized: false,
      deferred: [],
      exports: new Map(),
      stars: [],
    };
    modules.set(file, module);
    const callResults = new WeakMap();
    let activeSides = null;
    const cjsExports = { kind: "object", fields: new Map() };
    const cjsModule = {
      kind: "object",
      fields: new Map([["exports", cjsExports]]),
    };
    let currentDeferred = null;
    const imported = (spec, name) => ({
      kind: "import",
      target: moduleLinks.get(file)?.get(spec),
      name,
    });
    const lookupExport = (target, name, seen = new Set()) => {
      const other = modules.get(target),
        key = target + ":" + name;
      if (seen.size >= 32 || exportReads.size >= 32) {
        diagnose(
          "flow-module-budget",
          file,
          null,
          "Export chain exceeds 32 modules",
        );
        return null;
      }
      if (!other || seen.has(key) || exportReads.has(key)) {
        if (seen.has(key) || exportReads.has(key))
          diagnose(
            "flow-import-cycle",
            file,
            null,
            "Cyclic export cannot be proven",
          );
        return null;
      }
      seen.add(key);
      other.initialize();
      const entry = other.exports.get(name);
      if (entry) {
        exportReads.add(key);
        try {
          return entry.source
            ? lookupExport(
                moduleLinks.get(target)?.get(entry.source),
                entry.name,
                seen,
              )
            : other.resolveExport(entry, seen);
        } finally {
          exportReads.delete(key);
        }
      }
      if (other.stars.length) {
        const values = other.stars
          .map((spec) =>
            lookupExport(
              moduleLinks.get(target)?.get(spec),
              name,
              new Set(seen),
            ),
          )
          .filter(Boolean);
        if (values.length === 1) return values[0];
        if (values.length > 1)
          diagnose(
            "flow-ambiguous-export",
            file,
            null,
            "Multiple star exports cannot prove ownership",
          );
      }
      const value = other.cjs();
      return name === "default" ? value : value?.fields?.get(name) || null;
    };
    const namespace = (target) => ({ kind: "namespace", target });
    const fnValue = (node, scope) => ({
      kind: "function",
      node,
      scope,
      file,
      guardFor: (args) => predicateFor(node, scope, args),
      invoke: (args, guards, invokeSides, receiver) => {
        const key = file + ":" + node.start;
        const concreteCall =
          frames.at(-1)?.executing || (!frames.length && module.initializing);
        if (concreteCall) {
          const old = knownParameters.get(key);
          knownParameters.set(
            key,
            old
              ? Array.from(
                  { length: Math.max(old.length, args.length) },
                  (_, i) => mergedValue([old[i] || null, args[i] || null]),
                )
              : args,
          );
        }
        if (node.generator) {
          if (concreteCall) concreteFunctions.add(key);
          diagnose(
            "flow-generator",
            file,
            node,
            "Creating an iterator does not execute its body",
          );
          return null;
        }
        const relevant =
          hasProof(receiver) ||
          args.some(
            (v) =>
              hasProof(v) || (v?.kind === "function" && capturesEvidence(v)),
          ) ||
          capturesEvidence({ node, scope, file });
        if (!relevant) {
          if (hasEvidence(receiver) || args.some((v) => hasEvidence(v)))
            diagnose(
              "flow-inferred-forwarding",
              file,
              node,
              "Only proven Context/service bindings are expanded across calls",
            );
          const body =
            node.body.type === "BlockStatement" &&
            node.body.body.length === 1 &&
            node.body.body[0].type === "ReturnStatement"
              ? node.body.body[0].argument
              : node.body;
          if (
            !args.every((v) => v?.kind === "constant") ||
            !constantOnly(body) ||
            ++constantCalls > 512
          )
            return null;
        }
        if (invoking.has(key)) {
          diagnose(
            "flow-recursion",
            file,
            node,
            "Recursive call is not executed",
          );
          return null;
        }
        if (invoking.size >= 16 || (relevant && ++invocationCount > 256)) {
          if (concreteCall) concreteFunctions.add(key);
          diagnose(
            "flow-budget-exceeded",
            file,
            node,
            "Bounded call analysis limit reached",
          );
          return null;
        }
        if (concreteCall) concreteFunctions.add(key);
        invoking.add(key);
        const priorSides = activeSides;
        activeSides = invokeSides;
        try {
          const value = visitFunction(
            node,
            scope,
            guards,
            0,
            null,
            args,
            receiver,
          );
          return node.async
            ? { kind: "promise", value }
            : node.generator
              ? null
              : value;
        } finally {
          activeSides = priorSides;
          invoking.delete(key);
        }
      },
    });
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
        sides: [...(activeSides || sides)],
      });
    };
    const literalNames = (node, scope) => {
      node = unwrap(node);
      if (node?.type === "Identifier")
        return scope.get(node.name)?.strings || [];
      if (node?.type !== "ArrayExpression") return [];
      return node.elements.flatMap((n) => {
        if (n?.type === "SpreadElement") return literalNames(n.argument, scope);
        const value = constant(n, scope);
        return value === null ? [] : [value];
      });
    };
    const keyFor = (node, scope, guards) =>
      node?.computed
        ? constant(node.property, scope, guards)
        : propertyName(node);
    const constant = (node, scope, guards) => {
      const value = resolve(node, scope, guards);
      return value?.kind === "constant" && typeof value.value === "string"
        ? value.value
        : null;
    };
    const resolve = (node, scope, guards = new Set()) => {
      node = unwrap(node);
      if (!node) return null;
      if (node.type === "Identifier") {
        if (scope.find(node.name)) {
          const value = scope.get(node.name);
          return value?.kind === "import"
            ? value.name === "*"
              ? namespace(value.target)
              : lookupExport(value.target, value.name)
            : value;
        }
        if (node.name === "exports") return cjsExports;
        if (node.name === "module") return cjsModule;
        return node.name === "ctx"
          ? { kind: "context", head: "ctx", inferred: true }
          : null;
      }
      if (
        ["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(
          node.type,
        )
      )
        return { kind: "constant", value: node.value };
      if (node.type === "TemplateLiteral") {
        const values = node.expressions.map((n) => resolve(n, scope, guards));
        if (values.every((v) => v?.kind === "constant")) {
          const chunks = node.quasis.flatMap((q, i) => [
            q.value.cooked ?? q.value.raw,
            i < values.length ? String(values[i].value) : "",
          ]);
          if (chunks.reduce((n, v) => n + v.length, 0) > 8192) {
            diagnose(
              "flow-string-budget",
              file,
              node,
              "Constant template expansion exceeds budget",
            );
            return null;
          }
          return { kind: "constant", value: chunks.join("") };
        }
      }
      if (node.type === "BinaryExpression" && node.operator === "+") {
        const left = resolve(node.left, scope, guards),
          right = resolve(node.right, scope, guards);
        if (left?.kind === "constant" && right?.kind === "constant") {
          if (
            (typeof left.value === "string" ||
              typeof right.value === "string") &&
            String(left.value).length + String(right.value).length > 8192
          ) {
            diagnose(
              "flow-string-budget",
              file,
              node,
              "Constant concatenation exceeds budget",
            );
            return null;
          }
          return { kind: "constant", value: left.value + right.value };
        }
      }
      if (node.type === "ConditionalExpression") {
        const values = [
            resolve(node.consequent, scope, guards),
            resolve(node.alternate, scope, guards),
          ],
          result = mergedValue(values);
        if (!result && values.some((v) => hasEvidence(v)))
          diagnose(
            "flow-ambiguous-value",
            file,
            node,
            "Conditional ownership is unknown",
          );
        return result;
      }
      if (functions.has(node.type)) return fnValue(node, scope);
      if (
        node.type === "NewExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "Proxy" &&
        !scope.find("Proxy")
      ) {
        const target = resolve(node.arguments[0], scope, guards),
          handler = resolve(node.arguments[1], scope, guards);
        if (hasEvidence(target)) {
          if (
            handler?.kind === "object" &&
            !handler.opaque &&
            handler.fields.size === 0
          )
            return target;
          diagnose(
            "flow-opaque-proxy",
            file,
            node,
            "Proxy traps can replace Context/service access",
          );
        }
        return null;
      }
      if (node.type === "ThisExpression")
        return scope.functionScope().receiver || { kind: "instance" };
      if (node.type === "ArrayExpression")
        return { kind: "literal", strings: literalNames(node, scope) };
      if (node.type === "ObjectExpression") {
        const fields = new Map();
        for (const p of node.properties)
          if (p.type === "ObjectProperty")
            fields.set(
              p.computed ? constant(p.key, scope, guards) : keyName(p),
              resolve(p.value, scope, guards),
            );
          else if (p.type === "ObjectMethod")
            fields.set(
              p.computed ? constant(p.key, scope, guards) : keyName(p),
              fnValue(p, scope),
            );
        const opaque = node.properties.some(
          (p) =>
            p.type === "SpreadElement" ||
            (p.type === "ObjectMethod" && p.kind !== "method") ||
            (p.computed && constant(p.key, scope, guards) === null),
        );
        return { kind: "object", fields, opaque };
      }
      if (members.has(node.type)) {
        const object = resolve(node.object, scope, guards),
          key = keyFor(node, scope, guards);
        if (!key) {
          if (hasEvidence(object))
            diagnose(
              "flow-dynamic-access",
              file,
              node,
              "Computed property cannot be resolved to one string",
            );
          return null;
        }
        if (object?.kind === "promise") {
          diagnose(
            "flow-async-return",
            file,
            node,
            "Async factory does not return a synchronous service",
          );
          return null;
        }
        if (object?.opaque) {
          if (hasEvidence(object))
            diagnose(
              "flow-opaque-object",
              file,
              node,
              "Unknown mutation/spread/accessor prevents field proof",
            );
          return null;
        }
        if (object?.kind === "namespace")
          return lookupExport(object.target, key);
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
      if (calls.has(node.type)) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          !scope.find("require") &&
          node.arguments[0]?.type === "StringLiteral"
        )
          return namespace(moduleLinks.get(file)?.get(node.arguments[0].value));
        let callee = resolve(node.callee, scope, guards);
        if (callee?.kind === "namespace")
          callee = lookupExport(callee.target, "default");
        if (callee?.kind === "function") {
          let memo = callResults.get(node);
          if (!memo) {
            memo = new Map();
            callResults.set(node, memo);
          }
          if (memo.has(scope.id)) return memo.get(scope.id);
          memo.set(scope.id, null);
          const values = node.arguments.map((arg) =>
            resolve(arg, scope, guards),
          );
          const receiver = members.has(node.callee.type)
            ? resolve(node.callee.object, scope, guards)
            : null;
          const result = callee.invoke(
            values,
            guards,
            activeSides || sides,
            receiver,
          );
          memo.set(scope.id, result);
          return result;
        }
      }
      if (
        calls.has(node.type) &&
        members.has(node.callee?.type) &&
        keyFor(node.callee, scope, guards) === "get" &&
        resolve(node.callee.object, scope, guards)?.kind === "context" &&
        constant(node.arguments[0], scope, guards) !== null
      ) {
        return {
          kind: "service",
          service: constant(node.arguments[0], scope, guards),
          form: "ctx-get",
          inferred:
            resolve(node.callee.object, scope, guards)?.inferred === true,
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
        put(scope, pattern.name, value);
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
          const key = p.computed ? constant(p.key, scope) : keyName(p);
          if (key === null || key === undefined) {
            if (hasEvidence(value))
              diagnose(
                "flow-dynamic-pattern",
                file,
                p,
                "Destructured key cannot establish one service",
              );
            bind(p.value, null, scope);
            continue;
          }
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
      } else for (const name of namesIn(pattern)) put(scope, name, null);
    };
    const predeclare = (body, scope) => {
      for (const entry of body) {
        const n = entry.declaration || entry;
        if (n.type === "VariableDeclaration")
          for (const d of n.declarations)
            for (const name of namesIn(d.id)) {
              const owner = n.kind === "var" ? scope.functionScope() : scope;
              if (n.kind !== "var" || !owner.values.has(name))
                put(owner, name, null);
            }
        if (n.type === "FunctionDeclaration" && n.id)
          put(scope, n.id.name, fnValue(n, scope));
        if (n.type === "ClassDeclaration" && n.id) put(scope, n.id.name, null);
        if (n.type === "ImportDeclaration")
          for (const s of n.specifiers)
            put(
              scope,
              s.local.name,
              imported(
                n.source.value,
                s.type === "ImportDefaultSpecifier"
                  ? "default"
                  : s.type === "ImportNamespaceSpecifier"
                    ? "*"
                    : (s.imported.name ?? s.imported.value),
              ),
            );
      }
    };
    const methodKey = (n, scope) => {
      const r = resolve(n, scope);
      return r?.kind === "method" ? `${r.service}.${r.method}` : null;
    };
    // Only a helper whose boolean result exactly follows the capability test is accepted.
    const predicateFor = (fn, definitionScope, values) => {
      if (!fn || fn.async || fn.generator || fn.body?.type !== "BlockStatement")
        return null;
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
      const parameters = new Scope(definitionScope, ++scopeId, true);
      for (const [i, p] of fn.params.entries())
        bind(p, values[i] || null, parameters);
      const resolved = resolve(target, parameters);
      return resolved?.kind === "method"
        ? `${resolved.service}.${resolved.method}`
        : null;
    };
    const helperCondition = (call, scope) => {
      if (!calls.has(call?.type)) return null;
      let fn = resolve(call.callee, scope);
      if (fn?.kind === "namespace") fn = lookupExport(fn.target, "default");
      return (
        fn?.guardFor?.(call.arguments.map((n) => resolve(n, scope))) || null
      );
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
      (n?.type === "IfStatement" &&
        exits(n.consequent) &&
        exits(n.alternate)) ||
      (n?.type === "BlockStatement" &&
        n.body.length > 0 &&
        exits(n.body.at(-1)));
    const statementList = (body, scope, guards, depth) => {
      predeclare(body, scope);
      let active = new Set(guards);
      for (const n of body) {
        visit(n, scope, active, depth + 1);
        if (exits(n)) break;
        if (n.type === "IfStatement" && !n.alternate && exits(n.consequent))
          active = merged(active, conditionGuards(n.test, scope, false));
      }
    };
    const recordCall = (node, scope, guards) => {
      const value = resolve(node.callee, scope, guards);
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
        sides: [...(activeSides || sides)],
      });
    };
    const visitFunction = (
      node,
      scope,
      guards,
      depth,
      contextParams,
      argumentsForCall = null,
      receiverForCall = null,
    ) => {
      const entryBody =
        (scope === root &&
          node.id &&
          isEntry &&
          applyNames.has(node.id.name)) ||
        contextParams?.size > 0;
      if (
        argumentsForCall === null &&
        concreteFunctions.has(file + ":" + node.start)
      )
        return null;
      if (
        argumentsForCall === null &&
        (module.initializing || (!entryBody && currentDeferred !== node))
      ) {
        const queuedSides = activeSides;
        module.deferred.push({
          node,
          entry: !!entryBody,
          run: () => {
            const before = activeSides;
            activeSides = queuedSides;
            try {
              return visitFunction(node, scope, guards, depth, contextParams);
            } finally {
              activeSides = before;
            }
          },
        });
        return null;
      }
      // Only synchronous, directly resolved calls can inherit controlling guards.
      if (argumentsForCall === null || node.async || node.generator)
        guards = new Set();
      // Inspect a deferred function without applying its assignments to callers.
      const journal = argumentsForCall === null ? newJournal() : null;
      if (journal) journals.push(journal);
      const child = new Scope(scope, ++scopeId, true);
      child.receiver =
        node.type === "ArrowFunctionExpression"
          ? scope.functionScope().receiver
          : receiverForCall;
      if (node.id) put(child, node.id.name, fnValue(node, scope));
      const provenApply =
        scope === root && node.id && isEntry && applyNames.has(node.id.name);
      const parameterFacts =
        argumentsForCall ??
        knownParameters.get(file + ":" + node.start) ??
        null;
      for (const [index, p] of (node.params || []).entries()) {
        const known =
          contextParams?.has(p.start) || (provenApply && index === 0);
        const inferred = known ? contextParams?.get?.(p.start) === true : true;
        bind(
          p,
          parameterFacts !== null
            ? parameterFacts[index] || null
            : known || (p.type === "Identifier" && p.name === "ctx")
              ? { kind: "context", head: namesIn(p)[0], inferred }
              : null,
          child,
        );
      }
      const frame = {
        returns: [],
        guards,
        executing:
          argumentsForCall !== null
            ? (frames.at(-1)?.executing ?? module.initializing)
            : !!entryBody,
      };
      frames.push(frame);
      try {
        if (node.body.type === "BlockStatement")
          statementList(node.body.body, child, guards, depth + 1);
        else {
          visit(node.body, child, guards, depth + 1);
          frame.returns.push(resolve(node.body, child, guards));
        }
        if (node.body.type === "BlockStatement" && !exits(node.body))
          frame.returns.push(null);
        const result = mergedValue(frame.returns);
        if (
          argumentsForCall !== null &&
          !result &&
          frame.returns.some((v) => hasEvidence(v))
        )
          diagnose(
            "flow-ambiguous-return",
            file,
            node,
            "Function returns do not establish one receiver",
          );
        return result;
      } finally {
        frames.pop();
        if (journal) {
          journals.pop();
          undo(journal);
        }
      }
    };
    const branch = (scope, branches, depth) => {
      const mutations = [],
        bindings = [],
        originals = new Map(),
        originalBindings = new Map();
      for (const [node, guards, after] of branches) {
        const journal = newJournal();
        journals.push(journal);
        try {
          visit(node, scope, guards, depth + 1);
          visit(after, scope, guards, depth + 1);
          mutations.push(
            new Map(
              [...journal.objects].map(([object]) => [
                object,
                { fields: object.fields, opaque: object.opaque },
              ]),
            ),
          );
          bindings.push(
            new Map(
              [...journal.bindings].map(([owner, keys]) => [
                owner,
                new Map(
                  [...keys].map(([key]) => [
                    key,
                    {
                      present: owner.values.has(key),
                      value: owner.values.get(key),
                    },
                  ]),
                ),
              ]),
            ),
          );
        } finally {
          journals.pop();
          for (const [object, state] of journal.objects)
            if (!originals.has(object)) originals.set(object, state);
          for (const [owner, keys] of journal.bindings) {
            if (!originalBindings.has(owner))
              originalBindings.set(owner, new Map());
            for (const [key, value] of keys)
              if (!originalBindings.get(owner).has(key))
                originalBindings.get(owner).set(key, value);
          }
          undo(journal);
        }
      }
      for (const [object, original] of originals) {
        const variants = mutations.map((m) => m.get(object) || original),
          keys = new Set(variants.flatMap((v) => [...v.fields.keys()])),
          fields = new Map();
        for (const key of keys) {
          const values = variants.map((v) => v.fields.get(key) || null),
            value = mergedValue(values);
          fields.set(key, value);
          if (!value && values.some((v) => hasEvidence(v)))
            diagnose(
              "flow-ambiguous-binding",
              file,
              branches[0][0],
              "Object fields differ between branches",
            );
        }
        noteMutation(object);
        object.fields = fields;
        object.opaque = variants.some((v) => v.opaque);
      }
      for (const [owner, keys] of originalBindings)
        for (const [key, before] of keys) {
          const variants = bindings.map(
              (m) => m.get(owner)?.get(key) || before,
            ),
            values = variants.map((v) => (v.present ? v.value : null)),
            value = mergedValue(values);
          if (!value && values.some((v) => hasEvidence(v)))
            diagnose(
              "flow-ambiguous-binding",
              file,
              branches[0][0],
              "Branch assignments do not prove one receiver",
            );
          put(owner, key, value);
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
      if (node.type === "ReturnStatement") {
        visit(node.argument, scope, guards, depth + 1);
        frames.at(-1)?.returns.push(resolve(node.argument, scope, guards));
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
        const value = resolve(node.init, scope, guards);
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
        if (overwritten) {
          guards.delete(overwritten);
          for (const frame of frames) frame.guards.delete(overwritten);
        }
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
            resolve(node.right, scope, guards),
            scope.find(node.left.name) || scope,
          );
        else if (members.has(node.left.type)) {
          const object = resolve(node.left.object, scope, guards),
            key = keyFor(node.left, scope, guards);
          if (object?.fields)
            writeField(object, key, resolve(node.right, scope, guards));
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
        branch(
          scope,
          [
            [
              node.consequent,
              merged(guards, conditionGuards(node.test, scope, true)),
            ],
            [
              node.alternate,
              merged(guards, conditionGuards(node.test, scope, false)),
            ],
          ],
          depth,
        );
        return;
      }
      if (node.type === "ConditionalExpression") {
        visit(node.test, scope, guards, depth + 1);
        branch(
          scope,
          [
            [
              node.consequent,
              merged(guards, conditionGuards(node.test, scope, true)),
            ],
            [
              node.alternate,
              merged(guards, conditionGuards(node.test, scope, false)),
            ],
          ],
          depth,
        );
        return;
      }
      if (
        [
          "WhileStatement",
          "DoWhileStatement",
          "ForStatement",
          "ForInStatement",
          "ForOfStatement",
        ].includes(node.type)
      ) {
        visit(node.init || node.left, scope, guards, depth + 1);
        visit(node.test || node.right, scope, guards, depth + 1);
        branch(
          scope,
          [
            [node.body, new Set(guards), node.update],
            [null, new Set(guards)],
          ],
          depth,
        );
        return;
      }
      if (node.type === "LogicalExpression") {
        visit(node.left, scope, guards, depth + 1);
        branch(
          scope,
          [
            [
              node.right,
              merged(
                guards,
                conditionGuards(node.left, scope, node.operator === "&&"),
              ),
            ],
            [null, new Set(guards)],
          ],
          depth,
        );
        return;
      }
      if (calls.has(node.type)) {
        recordCall(node, scope, guards);
        resolve(node, scope, guards);
        let target = resolve(node.callee, scope, guards);
        if (target?.kind === "namespace")
          target = lookupExport(target.target, "default");
        if (
          !target ||
          !["function", "method", "service"].includes(target.kind)
        ) {
          const args = node.arguments.map((a) => resolve(a, scope, guards));
          if (args.some((v) => hasEvidence(v)))
            diagnose(
              "flow-unknown-target",
              file,
              node,
              "Context/service passed to an unresolved call",
            );
          for (const arg of args) if (arg?.kind === "object") markOpaque(arg);
        }
        if (
          members.has(node.callee?.type) &&
          resolve(node.callee.object, scope)?.kind === "context"
        ) {
          const operation = keyFor(node.callee, scope, guards);
          if (
            operation === "get" &&
            constant(node.arguments[0], scope, guards) !== null
          )
            dependency(
              constant(node.arguments[0], scope, guards),
              node.arguments[1]?.value === false ||
                node.arguments[1]?.value === 0
                ? "optional-read"
                : "read",
              node,
              resolve(node.callee.object, scope)?.inferred === true,
            );
          if (
            operation === "provide" &&
            constant(node.arguments[0], scope, guards) !== null
          ) {
            provided.add(constant(node.arguments[0], scope, guards));
            mention(constant(node.arguments[0], scope, guards));
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
    for (const n of program.body) {
      if (n.type === "ExportDefaultDeclaration")
        module.exports.set("default", { node: n.declaration });
      if (n.type === "ExportNamedDeclaration") {
        const d = n.declaration;
        if (d?.id) module.exports.set(d.id.name, { local: d.id.name });
        if (d?.type === "VariableDeclaration")
          for (const v of d.declarations)
            for (const name of namesIn(v.id))
              module.exports.set(name, { local: name });
        for (const spec of n.specifiers || [])
          module.exports.set(
            spec.exported.name ?? spec.exported.value,
            n.source
              ? {
                  source: n.source.value,
                  name: spec.local.name ?? spec.local.value,
                }
              : { local: spec.local.name },
          );
      }
      if (n.type === "ExportAllDeclaration") module.stars.push(n.source.value);
    }
    module.resolveExport = (entry) =>
      entry.local
        ? resolve({ type: "Identifier", name: entry.local }, root)
        : resolve(entry.node, root);
    module.cjs = () => cjsModule.fields.get("exports");
    module.entry = () => {
      if (!isEntry) return;
      const apply = lookupExport(file, "apply");
      if (apply?.kind !== "function") return;
      const guards = new Set();
      frames.push({ executing: true, guards });
      try {
        apply.invoke([{ kind: "context", inferred: false }], guards, sides);
      } finally {
        frames.pop();
      }
    };
    module.initialize = () => {
      if (module.initialized || module.initializing) return;
      module.initializing = true;
      try {
        visit(program, root, new Set());
      } catch (error) {
        diagnose("analysis-error", file, null, error.message);
      } finally {
        module.initializing = false;
        module.initialized = true;
      }
    };
    module.scan = (entryOnly) => {
      module.initialize();
      for (const deferred of module.deferred)
        if (deferred.entry === entryOnly) {
          currentDeferred = deferred.node;
          try {
            deferred.run();
          } catch (error) {
            diagnose("analysis-error", file, deferred.node, error.message);
          } finally {
            currentDeferred = null;
          }
        }
      if (!entryOnly) subContexts.push({ file, names: [...heads].sort() });
    };
  }
  for (const module of modules.values()) module.initialize();
  for (const module of modules.values()) module.entry();
  for (const pass of [true, false])
    for (const module of modules.values()) module.scan(pass);
  // A helper may be seen both standalone and through proved callers. Preserve
  // each service/side, prefer proved evidence, and keep every unguarded path.
  const unique = new Map();
  for (const site of sites) {
    const key = [
      site.file,
      site.start,
      site.service,
      site.method,
      site.sides.join(","),
    ].join(":");
    const old = unique.get(key);
    if (!old) unique.set(key, site);
    else {
      old.inferredReceiver = old.inferredReceiver && site.inferredReceiver;
      old.guarded = old.guarded && site.guarded;
      old.capabilityGuarded = old.capabilityGuarded && site.capabilityGuarded;
    }
  }
  sites.splice(0, sites.length, ...unique.values());
  for (const site of sites) if (!site.guarded) site.guardKind = "none";
  const uniqueBindings = new Map();
  for (const binding of bindings) {
    const key = [
      binding.file,
      binding.start,
      binding.variable,
      binding.service,
      binding.form,
      binding.from ?? "",
    ].join(":");
    if (!uniqueBindings.has(key)) uniqueBindings.set(key, binding);
  }
  bindings.splice(0, bindings.length, ...uniqueBindings.values());
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
