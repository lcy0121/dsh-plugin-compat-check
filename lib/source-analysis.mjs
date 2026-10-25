import { parseSource, childNodes } from "./syntax.mjs";
import { hasEvidence, hasProof, mergedValue } from "./flow-values.mjs";
import {
  captureSemanticArguments,
  mergeSemanticArguments,
  semanticTarget,
} from "./api-semantics.mjs";

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
    provideSites = [],
    diagnostics = [],
    subContexts = [];
  const provideSiteKeys = new Set();
  let scopeId = 0,
    invocationCount = 0,
    constantCalls = 0,
    semanticGeneration = 0;
  const identifierCache = new WeakMap();
  const guardSets = new Set();
  const guardSet = (values = []) => {
    const set = new Set(values);
    if (set.size) guardSets.add(set);
    return set;
  };
  const serviceCache = new WeakMap();
  const stateFor = (value) => {
    if (value?.kind === "object" || value?.kind === "literal") return value;
    if (value?.kind === "context" || value?.kind === "service")
      return (value.state ||= { fields: new Map(), opaque: false });
    return null;
  };
  const serviceFor = (context, key, form = "ctx-member") => {
    let cache = serviceCache.get(context);
    if (!cache) serviceCache.set(context, (cache = new Map()));
    if (!cache.has(key))
      cache.set(key, {
        kind: "service",
        service: key,
        inferred: context.inferred === true,
        state: { fields: new Map(), opaque: false },
      });
    return { ...cache.get(key), form };
  };
  let escapeBudgetExceeded = false;
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
    if (object.injectMetadata || object.kind === "literal") markOpaque(object);
    if (journals.length) object.fields = new Map(object.fields);
    object.fields.set(key, value);
  };
  const markOpaque = (object) => {
    noteMutation(object);
    object.opaque = true;
  };
  const taint = (value, seen = new Set()) => {
    if (!value || seen.has(value)) return;
    if (seen.size >= 128) {
      escapeBudgetExceeded = true;
      diagnose(
        "flow-escape-budget",
        "",
        null,
        "Reachable escape graph exceeds 128 nodes; remaining ownership proof is withheld",
      );
      return;
    }
    seen.add(value);
    if (value.kind === "proxy") {
      taint(value.target, seen);
      taint(value.handler, seen);
      return;
    }
    const state = stateFor(value);
    if (!state) return;
    const children = [...state.fields.values()];
    markOpaque(state);
    for (const child of children) taint(child, seen);
    if (value.kind === "context")
      for (const service of serviceCache.get(value)?.values() || [])
        taint(service, seen);
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
    const semanticSnapshots = new WeakMap();
    const effects = new WeakMap();
    const hasEffect = (node, scope) => effects.get(node)?.has(scope.id);
    const effectValue = (node, scope) =>
      effects.get(node)?.get(scope.id) ?? null;
    const remember = (node, scope, value) => {
      let map = effects.get(node);
      if (!map) effects.set(node, (map = new Map()));
      map.set(scope.id, value);
      return value;
    };
    const transparent = (value, node) => {
      if (value?.kind !== "proxy") return value;
      if (
        value.handler?.kind === "object" &&
        !value.handler.opaque &&
        value.handler.fields.size === 0
      )
        return transparent(value.target, node);
      diagnose(
        "flow-opaque-proxy",
        file,
        node,
        "Proxy handler was mutated or escaped",
      );
      return null;
    };
    const join = (values, node) => {
      const value = mergedValue(values);
      if (!value && values.some((v) => hasEvidence(v))) {
        for (const v of values)
          if (stateFor(v) || v?.kind === "proxy") taint(v);
        diagnose(
          "flow-ambiguous-value",
          file,
          node,
          "Alternative values do not establish one identity",
        );
      }
      return value;
    };
    let activeSides = null;
    const cjsExports = { kind: "object", fields: new Map() };
    const cjsModule = {
      kind: "object",
      fields: new Map([["exports", cjsExports]]),
    };
    const cjsInjectCandidates = [],
      entryInjectCandidates = [];
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
          ) {
            // Ordinary closures are not expanded. Their writes can invalidate
            // scalar/options evidence without changing Context value-flow rules.
            semanticGeneration++;
            return null;
          }
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
        const asyncJournal = node.async ? newJournal() : null;
        if (asyncJournal) journals.push(asyncJournal);
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
          if (asyncJournal) {
            journals.pop();
            const objects = [...asyncJournal.objects].map(
              ([object, before]) => [
                object,
                before,
                { fields: object.fields, opaque: object.opaque },
              ],
            );
            const bindings = [...asyncJournal.bindings].flatMap(
              ([owner, keys]) =>
                [...keys].map(([name, before]) => [
                  owner,
                  name,
                  before,
                  owner.values.get(name),
                ]),
            );
            undo(asyncJournal);
            if (objects.length || bindings.length) {
              diagnose(
                "flow-async-effects",
                file,
                node,
                "Async caller effects may occur after suspension",
              );
              for (const [object] of objects) markOpaque(object);
              for (const [owner, name, before, after] of bindings)
                put(owner, name, join([before.value, after], node));
            }
          }
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
      const row = {
        service,
        kind,
        inferred,
        file,
        line: node.loc?.start.line ?? 1,
        start: node.start,
        end: node.end,
        sides: [...(activeSides || sides)],
      };
      dependencies.push(row);
      return row;
    };
    const provide = (service, node) => {
      provided.add(service);
      mention(service);
      const sides = [...(activeSides || fileSides[file] || ["unknown"])];
      const site = {
        service,
        file,
        line: node.loc?.start.line ?? 1,
        start: node.start,
        end: node.end,
        sides,
      };
      const key = JSON.stringify([service, file, site.start, sides]);
      if (!provideSiteKeys.has(key)) {
        provideSiteKeys.add(key);
        provideSites.push(site);
      }
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
    // Cordis Inject.resolve treats object keys as service names, not lists
    // named required/optional. Unknown spreads/accessors cannot prove a map.
    const injectServices = (node, scope, value = resolve(node, scope)) => {
      if (value) value.injectMetadata = true;
      if (value?.kind === "literal" && value.complete && !value.opaque)
        return value.strings;
      if (value?.kind === "object" && !value.opaque)
        return [...value.fields.keys()].filter(
          (key) => typeof key === "string",
        );
      diagnose(
        "inject-unresolved",
        file,
        node,
        "Injection declaration cannot be established as an array or service map",
      );
      return [];
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
    const readField = (value, key, node) => {
      value = transparent(value, node);
      const state = stateFor(value);
      if (
        (escapeBudgetExceeded &&
          ["context", "service"].includes(value?.kind)) ||
        state?.opaque
      ) {
        if (hasEvidence(value))
          diagnose(
            "flow-opaque-object",
            file,
            node,
            "Unknown mutation/spread/accessor prevents field proof",
          );
        return null;
      }
      if (state?.fields.has(key)) return state.fields.get(key);
      if (value?.kind === "context") return serviceFor(value, key);
      if (value?.kind === "service")
        return {
          kind: "method",
          service: value.service,
          method: key,
          receiver: value,
        };
      return null;
    };
    const resolve = (node, scope, guards = guardSet()) => {
      node = unwrap(node);
      if (!node) return null;
      if (
        [
          "AssignmentExpression",
          "UpdateExpression",
          "SequenceExpression",
          "AwaitExpression",
        ].includes(node.type) ||
        (node.type === "UnaryExpression" && node.operator === "delete")
      ) {
        visit(node, scope, guards);
        return effectValue(node, scope);
      }
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
        return { kind: "constant", value: node.value, semanticGeneration };
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
          return {
            kind: "constant",
            value: chunks.join(""),
            semanticGeneration: values.reduce(
              (min, v) => Math.min(min, v.semanticGeneration ?? -1),
              semanticGeneration,
            ),
          };
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
          return {
            kind: "constant",
            value: left.value + right.value,
            semanticGeneration: Math.min(
              left.semanticGeneration ?? -1,
              right.semanticGeneration ?? -1,
            ),
          };
        }
      }
      if (node.type === "ConditionalExpression") {
        const values = [
            resolve(node.consequent, scope, guards),
            resolve(node.alternate, scope, guards),
          ],
          result = join(values, node);
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
            return { kind: "proxy", target, handler };
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
      if (node.type === "ArrayExpression") {
        const strings = [];
        let complete = true;
        for (const element of node.elements) {
          const spread = element?.type === "SpreadElement";
          const value = resolve(
            spread ? element.argument : element,
            scope,
            guards,
          );
          if (
            spread &&
            value?.kind === "literal" &&
            value.complete &&
            !value.opaque
          )
            strings.push(...value.strings);
          else if (
            !spread &&
            value?.kind === "constant" &&
            typeof value.value === "string"
          )
            strings.push(value.value);
          else complete = false;
        }
        return {
          kind: "literal",
          strings,
          complete,
          fields: new Map(),
          opaque: false,
          node,
        };
      }
      if (node.type === "ObjectExpression") {
        const fields = new Map();
        for (const p of node.properties)
          if (p.type === "ObjectProperty") {
            const key = p.computed
              ? constant(p.key, scope, guards)
              : keyName(p);
            const value = resolve(p.value, scope, guards);
            if (key === "inject" && value) value.injectMetadata = true;
            fields.set(key, value);
          } else if (p.type === "ObjectMethod")
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
        return { kind: "object", fields, opaque, node, semanticGeneration };
      }
      if (members.has(node.type)) {
        const object = transparent(resolve(node.object, scope, guards), node),
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
        if (object?.kind === "namespace")
          return lookupExport(object.target, key);
        if (object?.kind === "instance" && key === "ctx")
          return { kind: "context", head: "this.ctx", inferred: true };
        const value = readField(object, key, node);
        if (value?.kind === "context")
          heads.add(text.slice(node.start, node.end));
        return value;
      }
      if (calls.has(node.type)) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          !scope.find("require")
        )
          return namespace(moduleLinks.get(file)?.get("require@" + node.start));
        let memo = callResults.get(node);
        if (!memo) {
          memo = new Map();
          callResults.set(node, memo);
        }
        if (memo.has(scope.id)) return memo.get(scope.id);
        memo.set(scope.id, null);
        visit(node.callee, scope, guards);
        let callee = resolve(node.callee, scope, guards);
        if (callee?.kind === "namespace")
          callee = lookupExport(callee.target, "default");
        const receiver = members.has(node.callee.type)
          ? resolve(node.callee.object, scope, guards)
          : null;
        const values = node.arguments.map((arg) => {
          visit(arg, scope, guards);
          return resolve(arg, scope, guards);
        });
        if (callee?.kind === "method") {
          const captured = captureSemanticArguments(
            callee.service,
            callee.method,
            values,
            node.arguments,
            (arg) =>
              arg?.type === "Identifier" &&
              arg.name === "undefined" &&
              !scope.find("undefined"),
            semanticGeneration,
          );
          if (captured) {
            if (!semanticSnapshots.has(node))
              semanticSnapshots.set(node, new Map());
            semanticSnapshots.get(node).set(scope.id, captured);
          }
        }
        if (callee?.kind === "function") {
          const result = callee.invoke(
            values,
            guards,
            activeSides || sides,
            receiver,
          );
          memo.set(scope.id, result);
          return result;
        }
        if (
          !callee ||
          !["method", "service"].includes(callee.kind) ||
          (!semanticTarget(callee.service, callee.method) &&
            values.some((v) =>
              ["object", "literal", "function"].includes(v?.kind),
            ))
        )
          semanticGeneration++;
        if (receiver?.injectMetadata || receiver?.kind === "literal")
          taint(receiver);
      }
      if (
        calls.has(node.type) &&
        members.has(node.callee?.type) &&
        keyFor(node.callee, scope, guards) === "get" &&
        resolve(node.callee.object, scope, guards)?.kind === "context" &&
        constant(node.arguments[0], scope, guards) !== null
      ) {
        const context = resolve(node.callee.object, scope, guards);
        const value = {
          ...serviceFor(
            context,
            constant(node.arguments[0], scope, guards),
            "ctx-get",
          ),
          optional:
            node.arguments[1]?.value === false ||
            node.arguments[1]?.value === 0,
        };
        callResults.get(node)?.set(scope.id, value);
        return value;
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
          const child = readField(value, key, p);
          if (child?.kind === "method") child.form = "ctx-get-destructure";
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
        !body[0].alternate &&
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
    const merged = (a, b) => guardSet([...a, ...b]);
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
      let active = guardSet(guards);
      for (const n of body) {
        visit(n, scope, active, depth + 1);
        if (
          exits(n) ||
          ["BreakStatement", "ContinueStatement"].includes(n.type)
        )
          break;
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
      const site = {
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
      };
      sites.push(site);
      return site;
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
        guards = guardSet();
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
      if (
        parameterFacts !== null &&
        node.params.some(
          (p) => p.type === "AssignmentPattern" || p.type === "RestElement",
        )
      )
        diagnose(
          "flow-parameter-pattern",
          file,
          node,
          "Default/rest parameter flow is not expanded",
        );
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
        const result = join(frame.returns, node);
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
            value = join(values, branches[0][0]);
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
            value = join(values, branches[0][0]);
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
      if (node.type === "StaticBlock")
        return statementList(
          node.body,
          new Scope(scope, ++scopeId, true),
          guards,
          depth,
        );
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
          if (
            injectNames.has(field) ||
            /^inject(?:Deps|Scope|s)?$/.test(field)
          ) {
            const kind =
              scope === root && isEntry && injectNames.has(field)
                ? "required-inject"
                : "descriptor-inject";
            const rows = injectServices(node.init, scope, value).map((s) =>
              dependency(s, kind, node),
            );
            if (kind === "required-inject")
              entryInjectCandidates.push({ value, node, rows });
          }
          if (provideNames.has(field))
            for (const s of literalNames(node.init, scope)) {
              provide(s, node);
            }
        }
        return;
      }
      const invalidate = (target) => {
        const value = resolve(target, scope, guards),
          overwritten = methodKey(target, scope);
        for (const set of guardSets)
          for (const key of [...set])
            if (
              overwritten === key ||
              (value?.kind === "service" && key.startsWith(value.service + "."))
            ) {
              set.delete(key);
              if (!set.size) guardSets.delete(set);
            }
      };
      const targetOf = (target) => {
        if (target.type === "Identifier")
          return {
            owner: scope.find(target.name) || scope,
            key: target.name,
            old: scope.get(target.name),
          };
        if (members.has(target.type)) {
          visit(target.object, scope, guards, depth + 1);
          if (target.computed) visit(target.property, scope, guards, depth + 1);
          const object = transparent(
              resolve(target.object, scope, guards),
              target,
            ),
            key = keyFor(target, scope, guards);
          return {
            object,
            key,
            old: key === null ? null : readField(object, key, target),
          };
        }
        return {};
      };
      const writeTarget = (target, slot, value) => {
        invalidate(target);
        if (slot.owner) return bind(target, value, slot.owner);
        const state = stateFor(slot.object);
        if (!state) return;
        if (slot.key === null || slot.key === undefined) {
          taint(slot.object);
          diagnose(
            "flow-dynamic-mutation",
            file,
            node,
            "Unknown write key may replace existing fields",
          );
        } else {
          if (
            node.type === "UnaryExpression" &&
            node.operator === "delete" &&
            slot.object.kind === "object"
          ) {
            noteMutation(state);
            if (state.injectMetadata) markOpaque(state);
            if (journals.length) state.fields = new Map(state.fields);
            state.fields.delete(slot.key);
          } else writeField(state, slot.key, value);
          if (["context", "service"].includes(slot.object.kind))
            diagnose(
              "flow-service-mutation",
              file,
              node,
              "Context/service member was replaced locally",
            );
        }
      };
      if (node.type === "SequenceExpression") {
        if (hasEffect(node, scope)) return;
        remember(node, scope, null);
        let value = null;
        for (const expression of node.expressions) {
          visit(expression, scope, guards, depth + 1);
          value = resolve(expression, scope, guards);
        }
        remember(node, scope, value);
        return;
      }
      if (node.type === "AwaitExpression") {
        if (hasEffect(node, scope)) return;
        remember(node, scope, null);
        visit(node.argument, scope, guards, depth + 1);
        const value = resolve(node.argument, scope, guards);
        if (value?.kind === "promise" && hasEvidence(value.value))
          diagnose(
            "flow-async-return",
            file,
            node,
            "Awaited factory value is not expanded",
          );
        for (const set of guardSets) set.clear();
        guardSets.clear();
        return;
      }
      if (node.type === "UnaryExpression" && node.operator === "delete") {
        if (hasEffect(node, scope)) return;
        remember(node, scope, null);
        const slot = targetOf(node.argument);
        writeTarget(node.argument, slot, null);
        return;
      }
      if (
        node.type === "AssignmentExpression" ||
        node.type === "UpdateExpression"
      ) {
        if (hasEffect(node, scope)) return;
        remember(node, scope, null);
        const target =
          node.type === "AssignmentExpression" ? node.left : node.argument;
        const slot = targetOf(target);
        let value = null;
        if (node.type === "AssignmentExpression") {
          visit(node.right, scope, guards, depth + 1);
          const right = resolve(node.right, scope, guards);
          if (node.operator === "=") value = right;
          else if (
            node.operator === "+=" &&
            slot.old?.kind === "constant" &&
            right?.kind === "constant"
          ) {
            const result = slot.old.value + right.value;
            if (typeof result !== "string" || result.length <= 8192)
              value = {
                kind: "constant",
                value: result,
                semanticGeneration: Math.min(
                  slot.old.semanticGeneration ?? -1,
                  right.semanticGeneration ?? -1,
                ),
              };
          }
        } else if (slot.old?.kind === "constant")
          value = {
            kind: "constant",
            semanticGeneration: slot.old.semanticGeneration ?? -1,
            value: Number(slot.old.value) + (node.operator === "++" ? 1 : -1),
          };
        if (!value && node.operator !== "=")
          diagnose(
            "flow-mutation-value",
            file,
            node,
            "Mutation does not establish a constant value",
          );
        writeTarget(target, slot, value);
        remember(
          node,
          scope,
          node.type === "UpdateExpression" && !node.prefix ? slot.old : value,
        );
        if (node.type === "AssignmentExpression" && slot.key === "inject") {
          const rows = injectServices(node.right, scope, value).map((name) =>
            dependency(name, "descriptor-inject", node),
          );
          cjsInjectCandidates.push({ owner: slot.object, value, node, rows });
        }
        if (node.type === "AssignmentExpression" && slot.key === "provide")
          for (const name of literalNames(node.right, scope)) {
            provide(name, node);
          }
        return;
      }
      if (node.type === "ObjectProperty" && keyName(node) === "inject") {
        const rows = injectServices(node.value, scope).map((name) =>
          dependency(name, "descriptor-inject", node),
        );
        cjsInjectCandidates.push({
          value: resolve(node.value, scope),
          node,
          rows,
        });
      }
      if (node.type === "CatchClause") {
        const caught = new Scope(scope, ++scopeId);
        bind(node.param, null, caught);
        visit(node.body, caught, guards, depth + 1);
        return;
      }
      if (node.type === "SwitchStatement") {
        visit(node.discriminant, scope, guards, depth + 1);
        diagnose(
          "flow-control-join",
          file,
          node,
          "Switch paths are conservatively joined",
        );
        const child = new Scope(scope, ++scopeId);
        predeclare(
          node.cases.flatMap((c) => c.consequent),
          child,
        );
        for (const c of node.cases)
          if (c.test)
            branch(
              child,
              [
                [c.test, guardSet(guards)],
                [null, guardSet(guards)],
              ],
              depth,
            );
        branch(
          child,
          node.cases
            .map((c, index) => [
              {
                type: "BlockStatement",
                body: node.cases.slice(index).flatMap((c) => c.consequent),
                loc: c.loc,
                start: c.start,
              },
              guardSet(guards),
            ])
            .concat([[null, guardSet(guards)]]),
          depth,
        );
        return;
      }
      if (node.type === "TryStatement") {
        diagnose(
          "flow-control-join",
          file,
          node,
          "Exception paths are conservatively joined",
        );
        // Collect and join writes before a catch reads them: an exception can
        // occur before or after any assignment in the try block.
        branch(
          scope,
          [
            [node.block, guardSet(guards)],
            [null, guardSet(guards)],
          ],
          depth,
        );
        if (node.handler)
          branch(
            scope,
            [
              [node.handler, guardSet(guards)],
              [null, guardSet(guards)],
            ],
            depth,
          );
        visit(node.finalizer, scope, guards, depth + 1);
        return;
      }
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
            [node.body, guardSet(guards), node.update],
            [null, guardSet(guards)],
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
            [null, guardSet(guards)],
          ],
          depth,
        );
        return;
      }
      if (calls.has(node.type)) {
        const site = recordCall(node, scope, guards);
        resolve(node, scope, guards);
        const captured = semanticSnapshots.get(node)?.get(scope.id);
        if (site && captured) site.semanticArguments = captured;
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
          for (const arg of args) taint(arg);
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
            provide(constant(node.arguments[0], scope, guards), node);
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
      if (calls.has(node.type)) return;
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
        for (const spec of n.specifiers || []) {
          if (!spec.local) {
            diagnose(
              "module-export-uncertain",
              file,
              spec,
              "Namespace re-export binding is not established",
            );
            continue;
          }
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
      for (const candidate of entryInjectCandidates) {
        if (!candidate.value?.opaque) continue;
        diagnose(
          "inject-unresolved",
          file,
          candidate.node,
          "Injection metadata was mutated or escaped before activation",
        );
        for (const row of candidate.rows) {
          row.kind = "descriptor-inject";
          row.inferred = true;
        }
      }
      const exported = module.cjs();
      const injected = readField(exported, "inject", program);
      if (injected?.opaque || (exported?.opaque && cjsInjectCandidates.length))
        diagnose(
          "inject-unresolved",
          file,
          program,
          "CommonJS injection metadata or its export owner was mutated or escaped",
        );
      if (
        exported?.kind === "object" &&
        !exported.opaque &&
        injected &&
        !injected.opaque
      ) {
        for (const candidate of cjsInjectCandidates) {
          const sameOwner =
            candidate.owner === exported ||
            exported.node?.properties?.includes(candidate.node);
          const sameInput =
            candidate.value === injected ||
            (injected.node && candidate.value?.node === injected.node);
          if (!sameOwner || !sameInput) continue;
          for (const row of candidate.rows) {
            row.kind = "required-inject";
            row.inferred = false;
          }
        }
      }
      const apply = lookupExport(file, "apply");
      if (apply?.kind !== "function") return;
      const guards = guardSet();
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
      if (old.semanticArguments || site.semanticArguments) {
        if (old.inferredReceiver && !site.inferredReceiver)
          old.semanticArguments = site.semanticArguments;
        else if (!old.inferredReceiver && site.inferredReceiver) {
          /* Preserve the proved call. */
        } else
          old.semanticArguments = mergeSemanticArguments(
            old.semanticArguments,
            site.semanticArguments,
          );
      }
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
    provideSites,
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
