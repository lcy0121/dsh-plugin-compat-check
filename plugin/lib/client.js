// Generated from plugin/src/client.jsx and shared lib sources. Run npm run build:client.
// React is supplied by DSH; CSS is precompiled and scoped to .dsc-ui.
window.__ModuleLoader__.load({
  id: "dsh-plugin-compat-check",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if ((from && typeof from === "object") || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, {
              get: () => from[key],
              enumerable:
                !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
            });
      }
      return to;
    };
    var __toESM = (mod, isNodeMode, target) => (
      (target = mod != null ? __create(__getProtoOf(mod)) : {}),
      __copyProps(
        // If the importer is in node compatibility mode or this is not an ESM
        // file that has been converted to a CommonJS file using a Babel-
        // compatible transform (i.e. "__esModule" has not been set), then set
        // "default" to the CommonJS "module.exports" for node compatibility.
        isNodeMode || !mod || !mod.__esModule
          ? __defProp(target, "default", { value: mod, enumerable: true })
          : target,
        mod,
      )
    );
    var __toCommonJS = (mod) =>
      __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // plugin/src/client.jsx
    var client_exports = {};
    __export(client_exports, {
      apply: () => apply,
      inject: () => inject,
      name: () => name,
    });
    module.exports = __toCommonJS(client_exports);
    var React2 = __toESM(require("react"), 1);

    // lib/contracts.mjs
    var REPORT_SCHEMA = 1;
    var REPORT_KIND = "plugin-compat-check/result";
    var ENVELOPE_KIND = "plugin-compat-check/report";
    var CATALOG_REFERENCES = Object.freeze([
      Object.freeze({
        version: "0.2.0-rc.2",
        file: "dsh-api-catalog.json",
        sha256:
          "1331bf3220c1e06cfe087237077118d002dc04c32d027ce01da74c6a0d1dc9ad",
      }),
      Object.freeze({
        version: "0.2.1-rc.2",
        file: "dsh-api-catalog-0.2.1-rc.2.json",
        sha256:
          "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
      }),
      Object.freeze({
        version: "0.2.1-rc.3",
        file: "dsh-api-catalog-0.2.1-rc.3.json",
        sha256:
          "dd253bc418a787d881e402f3650857c2d8e7631b818927743a5f2b81104f25a5",
      }),
    ]);
    function describeCatalog({
      targetVersion = null,
      referenceVersion = null,
      sha256,
      override = false,
    }) {
      const known =
        !override &&
        CATALOG_REFERENCES.find(
          (c) => c.version === referenceVersion && c.sha256 === sha256,
        );
      const verified = Boolean(known && targetVersion === referenceVersion);
      return {
        targetVersion,
        referenceVersion,
        sha256,
        selection: override ? "override" : verified ? "exact" : "fallback",
        verified,
        certifiedVersions: known ? [known.version] : [],
        scope:
          "\u4EC5\u6838\u9A8C\u5185\u7F6E\u76EE\u5F55\u5B57\u8282\u53CA\u5BF9\u5E94\u7CBE\u786E\u7248\u672C\u7684\u96C6\u6210\uFF1B\u4E0D\u4EE3\u8868\u4E1A\u52A1\u9A8C\u6536\u6216\u8FD0\u884C\u65F6\u89C2\u6D4B\u3002",
        warning: verified
          ? null
          : override
            ? "\u81EA\u5B9A\u4E49\u53C2\u8003\u76EE\u5F55\u672A\u8BA4\u8BC1\uFF1B\u76EE\u5F55\u81EA\u62A5\u7248\u672C\u6216\u76F8\u540C\u5B57\u8282\u4E0D\u6269\u5927\u5DF2\u9A8C\u6536\u8303\u56F4\uFF0C\u8BF7\u5728\u5B9E\u9645\u76EE\u6807\u5BBF\u4E3B\u590D\u6838\u3002"
            : "\u76EE\u6807 DSH \u7248\u672C\u672A\u77E5\u6216\u672A\u8BA4\u8BC1\uFF1B\u666E\u901A\u4F53\u68C0\u4F7F\u7528\u53C2\u8003\u76EE\u5F55\u56DE\u9000\uFF0C\u4E0D\u80FD\u636E\u6B64\u8BA4\u5B9A\u8BE5\u7248\u672C\u5DF2\u9A8C\u6536\u3002",
      };
    }
    function catalogLines(c) {
      if (!c)
        return [
          "API \u76EE\u5F55\u8EAB\u4EFD\u672A\u63D0\u4F9B\uFF1B\u7248\u672C\u8303\u56F4\u672A\u8BA4\u8BC1\uFF0C\u8BF7\u91CD\u65B0\u4F53\u68C0\u3002",
        ];
      return [
        "\u76EE\u6807 DSH\uFF1A" + (c.targetVersion || "\u672A\u77E5"),
        "\u53C2\u8003\u76EE\u5F55\uFF1A" +
          (c.referenceVersion || "\u672A\u77E5") +
          " \xB7 SHA-256\uFF1A" +
          c.sha256,
        "\u76EE\u5F55\u8BA4\u8BC1\u8303\u56F4\uFF1A" +
          (c.certifiedVersions.join("\u3001") || "\u65E0") +
          "\uFF1B" +
          c.scope,
        ...(c.warning ? [c.warning] : []),
      ];
    }
    var record = (v) =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    var text = (v) => typeof v === "string" && v.length > 0;
    var nullableText = (v) => v === null || typeof v === "string";
    var integer = (v) => Number.isSafeInteger(v) && v >= 0;
    var strings = (v) =>
      Array.isArray(v) && v.every((x) => typeof x === "string");
    var verdicts = ["ok", "partial", "broken", "unknown"];
    var severities = ["fatal", "feature-dead", "degraded"];
    var certainties = ["certain", "suspected"];
    var dispositions = [
      "finding",
      "client-side",
      "self-provided",
      "runtime-facility",
      "filtered",
      "abstained",
      "guarded",
      "no-calls",
      "unknown",
    ];
    function coherentVerdict(p) {
      if (!Array.isArray(p.findings)) return false;
      return (
        p.verdict === "unknown" ||
        p.verdict ===
          (p.findings.some((f) => f?.severity === "fatal")
            ? "broken"
            : p.findings.length
              ? "partial"
              : "ok")
      );
    }
    function snapshotFinding(f) {
      return (
        record(f) &&
        text(f.key) &&
        text(f.category) &&
        severities.includes(f.severity) &&
        certainties.includes(f.certainty) &&
        nullableText(f.location) &&
        (f.entryId === void 0 || nullableText(f.entryId)) &&
        (f.column === void 0 || integer(f.column))
      );
    }
    function checkedEntry(v) {
      return (
        record(v) && text(v.service) && dispositions.includes(v.disposition)
      );
    }
    function pathIdentity(v) {
      const normalized = v.replace(/\\/g, "/");
      const parts = [];
      for (const part of normalized.split("/")) {
        if (part === "..") parts.pop();
        else if (part && part !== ".") parts.push(part);
      }
      return (normalized.startsWith("/") ? "/" : "") + parts.join("/");
    }
    function need(errors, condition, path) {
      if (!condition) errors.push(path);
    }
    function exitCodeForSummary(summary) {
      return summary.broken > 0
        ? 2
        : summary.partial > 0 || summary.unknown > 0
          ? 1
          : 0;
    }
    function validateObservation(value) {
      const e = [];
      if (!record(value)) return ["observation"];
      need(
        e,
        ["runtime", "catalogue"].includes(value.mode),
        "observation.mode",
      );
      need(e, typeof value.bound === "boolean", "observation.bound");
      need(e, typeof value.usable === "boolean", "observation.usable");
      need(e, strings(value.notes), "observation.notes");
      for (const key of ["profileId", "dshVersion", "probedAt"])
        need(e, nullableText(value[key]), "observation." + key);
      if (value.probedAt !== null)
        need(
          e,
          Number.isFinite(Date.parse(value.probedAt)),
          "observation.probedAt",
        );
      need(
        e,
        (value.mode === "runtime") === value.usable,
        "observation.mode/usable",
      );
      return e;
    }
    function validateFinding(f) {
      const e = [];
      if (!record(f)) return ["finding"];
      need(e, text(f.category), "finding.category");
      need(e, severities.includes(f.severity), "finding.severity");
      need(e, certainties.includes(f.certainty), "finding.certainty");
      need(
        e,
        ["inferred", "measured"].includes(f.impactBasis),
        "finding.impactBasis",
      );
      need(e, text(f.impact), "finding.impact");
      need(e, text(f.basis), "finding.basis");
      for (const key of ["service", "method"])
        if (f[key] !== void 0) need(e, nullableText(f[key]), "finding." + key);
      need(
        e,
        f.location === null ||
          (record(f.location) &&
            text(f.location.file) &&
            Number.isSafeInteger(f.location.line) &&
            f.location.line > 0),
        "finding.location",
      );
      if (f.evidence !== void 0)
        need(e, record(f.evidence), "finding.evidence");
      if (record(f.location)) {
        for (const key of ["column", "start", "end"])
          if (f.location[key] !== void 0 && f.location[key] !== null)
            need(e, integer(f.location[key]), "finding.location." + key);
        if (integer(f.location.start) && integer(f.location.end))
          need(e, f.location.end >= f.location.start, "finding.location.span");
      }
      return e;
    }
    function validateBaselineResult(b) {
      if (b === null) return [];
      const e = [];
      if (!record(b)) return ["baseline result"];
      if (b.error !== void 0) {
        need(e, text(b.error) && text(b.note), "baseline.error");
        return e;
      }
      need(e, typeof b.wrote === "boolean", "baseline.wrote");
      need(e, record(b.badge), "baseline.badge");
      if (record(b.badge)) {
        need(
          e,
          typeof b.badge.show === "boolean" &&
            nullableText(b.badge.text) &&
            nullableText(b.badge.detail) &&
            [null, "worse", "better", "mixed", "neutral"].includes(
              b.badge.direction,
            ),
          "baseline.badge.fields",
        );
      }
      if (b.diff !== null) {
        need(
          e,
          record(b.diff) && typeof b.diff.comparable === "boolean",
          "baseline.diff",
        );
        if (record(b.diff)) {
          for (const key of [
            "added",
            "removed",
            "worsened",
            "improved",
            "updated",
          ]) {
            need(e, Array.isArray(b.diff[key]), "baseline.diff." + key);
            for (const entry of Array.isArray(b.diff[key]) ? b.diff[key] : []) {
              const at = "baseline.diff." + key;
              if (!record(entry)) {
                e.push(at + ".entry");
                continue;
              }
              need(e, text(entry.name), at + ".name");
              if (key === "added" || key === "removed") {
                need(e, nullableText(entry.version), at + ".version");
                continue;
              }
              need(
                e,
                nullableText(entry.versionFrom) &&
                  nullableText(entry.versionTo) &&
                  typeof entry.versionChanged === "boolean" &&
                  verdicts.includes(entry.verdictFrom) &&
                  verdicts.includes(entry.verdictTo) &&
                  text(entry.reason),
                at + ".fields",
              );
              for (const field of ["newFindings", "goneFindings"]) {
                need(
                  e,
                  Array.isArray(entry[field]) &&
                    entry[field].every(snapshotFinding),
                  at + "." + field,
                );
              }
              need(
                e,
                Array.isArray(entry.changedFindings) &&
                  entry.changedFindings.every(
                    (c) =>
                      record(c) &&
                      snapshotFinding(c.from) &&
                      snapshotFinding(c.to),
                  ),
                at + ".changedFindings",
              );
            }
          }
          for (const key of ["dshVersionFrom", "dshVersionTo", "reason"])
            need(e, nullableText(b.diff[key]), "baseline.diff." + key);
          need(
            e,
            typeof b.diff.dshVersionChanged === "boolean",
            "baseline.diff.dshVersionChanged",
          );
        }
      }
      return e;
    }
    function validateReportBody(body) {
      const e = [];
      if (!record(body)) return ["report"];
      need(
        e,
        body.schemaVersion === REPORT_SCHEMA && body.kind === REPORT_KIND,
        "report.schemaVersion/kind",
      );
      need(e, typeof body.ok === "boolean", "report.ok");
      need(e, nullableText(body.toolVersion), "report.toolVersion");
      need(e, record(body.inputs), "report.inputs");
      if (body.ok === false) {
        need(
          e,
          body.exitCode === 3 && text(body.error),
          "report.error/exitCode",
        );
        return e;
      }
      need(e, body.error === null, "report.error");
      need(e, nullableText(body.dshVersion), "report.dshVersion");
      if (body.catalog !== void 0) {
        const c = body.catalog;
        if (
          !record(c) ||
          !nullableText(c.referenceVersion) ||
          !/^[a-f0-9]{64}$/.test(c.sha256)
        )
          e.push("report.catalog");
        else {
          const expected = describeCatalog({
            targetVersion: body.dshVersion,
            referenceVersion: c.referenceVersion,
            sha256: c.sha256,
            override: c.selection === "override",
          });
          if (
            c.selection !== "override" &&
            !CATALOG_REFERENCES.some(
              (k) => k.version === c.referenceVersion && k.sha256 === c.sha256,
            )
          )
            e.push("report.catalog.identity");
          for (const [key, value] of Object.entries(expected))
            need(
              e,
              JSON.stringify(c[key]) === JSON.stringify(value),
              "report.catalog." + key,
            );
        }
      }
      e.push(...validateObservation(body.observation));
      if (
        record(body.observation) &&
        body.observation.bound &&
        body.observation.usable
      ) {
        const o = body.observation;
        if (text(body.dshVersion) && text(o.dshVersion))
          need(
            e,
            o.dshVersion === body.dshVersion,
            "observation/report.dshVersion",
          );
        if (text(body.inputs?.nodeModules) && text(o.profileId))
          need(
            e,
            pathIdentity(o.profileId) === pathIdentity(body.inputs.nodeModules),
            "observation/report.profileId",
          );
      }
      e.push(...validateBaselineResult(body.baseline));
      const summary = body.summary,
        plugins = body.plugins;
      if (!record(summary) || !record(plugins))
        return [...e, "report.summary/plugins"];
      for (const key of [...verdicts, "limited", "vacuousOk"])
        need(e, integer(summary[key]), "summary." + key);
      const counts = {
        ok: 0,
        partial: 0,
        broken: 0,
        unknown: 0,
        limited: 0,
        vacuousOk: 0,
      };
      for (const [name2, p] of Object.entries(plugins)) {
        if (!record(p)) {
          e.push("plugin:" + name2);
          continue;
        }
        need(
          e,
          p.name === name2 &&
            nullableText(p.version) &&
            verdicts.includes(p.verdict),
          "plugin.identity/verdict:" + name2,
        );
        need(e, typeof p.vacuous === "boolean", "plugin.vacuous:" + name2);
        if (verdicts.includes(p.verdict)) counts[p.verdict]++;
        if (p.vacuous && p.verdict === "ok") counts.vacuousOk++;
        const c = p.coverage;
        need(
          e,
          record(c) &&
            ["complete", "limited"].includes(c.status) &&
            integer(c.verifiedCalls) &&
            strings(c.limitations),
          "plugin.coverage:" + name2,
        );
        if (c?.status === "limited") counts.limited++;
        for (const key of [
          "findings",
          "checked",
          "clientSide",
          "filtered",
          "abstained",
          "runtimeFacilities",
        ])
          need(e, Array.isArray(p[key]), "plugin." + key + ":" + name2);
        if (Array.isArray(p.findings))
          for (const f of p.findings)
            e.push(...validateFinding(f).map((x) => name2 + ":" + x));
        need(e, coherentVerdict(p), "plugin.verdict/findings:" + name2);
        if (record(c) && integer(c.verifiedCalls))
          need(
            e,
            p.vacuous === (p.verdict === "ok" && c.verifiedCalls === 0),
            "plugin.vacuous/coverage:" + name2,
          );
        if (record(c) && strings(c.limitations) && Array.isArray(p.clientSide))
          need(
            e,
            (c.status === "limited") ===
              (c.limitations.length > 0 ||
                p.clientSide.length > 0 ||
                p.vacuous === true),
            "plugin.coverage/status:" + name2,
          );
        need(e, record(p.resolved), "plugin.resolved:" + name2);
        if (record(p.resolved))
          for (const [service, value] of Object.entries(p.resolved))
            need(
              e,
              checkedEntry(value) && value.service === service,
              "plugin.resolved.entry:" + name2 + "." + service,
            );
        for (const [key, valid] of [
          ["checked", checkedEntry],
          ["clientSide", (v) => record(v) && text(v.service) && text(v.note)],
          [
            "filtered",
            (v) =>
              record(v) && text(v.service) && text(v.method) && text(v.reason),
          ],
          ["abstained", (v) => record(v) && text(v.service) && text(v.basis)],
          [
            "runtimeFacilities",
            (v) => record(v) && text(v.name) && text(v.reason),
          ],
        ])
          if (Array.isArray(p[key]))
            need(e, p[key].every(valid), "plugin." + key + ".entry:" + name2);
      }
      for (const key of Object.keys(counts))
        need(e, counts[key] === summary[key], "summary.count:" + key);
      need(e, body.exitCode === exitCodeForSummary(summary), "report.exitCode");
      need(
        e,
        record(body.extraction) &&
          typeof body.extraction.scanComplete === "boolean" &&
          Array.isArray(body.extraction.diagnostics) &&
          Array.isArray(body.extraction.manifests),
        "report.extraction",
      );
      return e;
    }
    function validateEnvelope(data) {
      if (
        !record(data) ||
        data.schemaVersion !== REPORT_SCHEMA ||
        data.kind !== ENVELOPE_KIND
      )
        return ["envelope.schemaVersion/kind"];
      const e = validateReportBody(data.report);
      if (Object.hasOwn(data, "issueReport"))
        need(e, typeof data.issueReport === "string", "envelope.issueReport");
      need(
        e,
        typeof data.ok === "boolean" && data.ok === data.report?.ok,
        "envelope.ok",
      );
      need(e, data.exitCode === data.report?.exitCode, "envelope.exitCode");
      need(e, data.error === data.report?.error, "envelope.error");
      need(
        e,
        data.toolVersion === data.report?.toolVersion,
        "envelope.toolVersion",
      );
      need(
        e,
        JSON.stringify(data.baseline) ===
          JSON.stringify(data.report?.baseline ?? null),
        "envelope.baseline",
      );
      return e;
    }
    function assertEnvelope(data) {
      const errors = validateEnvelope(data);
      if (errors.length)
        throw new Error(
          "\u62A5\u544A\u5951\u7EA6\u4E0D\u5339\u914D: " + errors.join(", "),
        );
      return data;
    }

    // lib/finding-guidance.mjs
    function nextSteps(finding2) {
      if (!finding2 || typeof finding2 !== "object") return [];
      switch (finding2.category) {
        case "client-entry-missing":
          return [
            '\u68C0\u67E5\u8BE5\u63D2\u4EF6 package.json \u7684 dsh.client \u4E0E exports["./client"] \u5BA2\u6237\u7AEF\u5165\u53E3\u58F0\u660E\uFF0C\u5E76\u5728\u5B9E\u9645\u5B89\u88C5\u5236\u54C1\u4E2D\u6838\u5BF9\u5165\u53E3\u6587\u4EF6\u662F\u5426\u5B58\u5728\u3001\u53EF\u8BFB\u4E14\u5DF2\u968F\u5305\u4EA4\u4ED8\u3002',
            "\u628A\u5DF2\u88C5\u63D2\u4EF6\u7684\u7CBE\u786E\u7248\u672C\u4E0E\u5236\u54C1\u6587\u4EF6\u6E05\u5355\u5BF9\u7167\uFF1B\u5982\u9700\u4F5C\u8005\u5904\u7406\uFF0C\u63D0\u4F9B\u7F3A\u5931\u5165\u53E3\u7684\u5305\u5185\u76F8\u5BF9\u4F4D\u7F6E\uFF0C\u4E0D\u731C\u6D4B\u4FEE\u590D\u7248\u672C\u3002",
            "\u8865\u5145\u540C\u4E00\u76EE\u6807\u7684\u6D4F\u89C8\u5668\u52A0\u8F7D\u7ED3\u679C\uFF0C\u5E76\u5B9E\u9645\u64CD\u4F5C\u5BA2\u6237\u7AEF\u529F\u80FD\u3001\u6838\u9A8C\u5B9E\u9645\u529F\u80FD\u7ED3\u679C\uFF1B\u9759\u6001\u5165\u53E3\u53D1\u73B0\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u5931\u8D25\u5DF2\u5B9E\u6D4B\u3002",
          ];
        case "declared-incompatible":
          return [
            "\u590D\u6838\u5DF2\u88C5\u63D2\u4EF6 package.json \u7684 engines.dsh \u4E0E\u5B98\u65B9 peerDependencies\u3001\u5B57\u6BB5\u683C\u5F0F\u53CA\u76EE\u6807 DSH \u7248\u672C\uFF1B\u6309\u62A5\u544A\u6240\u7528\u58F0\u660E\u7B56\u7565\u6838\u5BF9\u751F\u6548\u5B57\u6BB5\u3002",
            "\u53EA\u8BFB\u6838\u5BF9\u76EE\u6807 profile \u7684 compatibility.json \u662F\u5426\u6709\u8BE5\u63D2\u4EF6\u540D\u3001\u63D2\u4EF6\u7CBE\u786E\u7248\u672C\u4E0E\u76EE\u6807 DSH \u7CBE\u786E\u7248\u672C\u7684\u8BB0\u5F55\uFF1B\u672A\u89C2\u6D4B\u6216\u672A\u6388\u4E88\u4E0D\u7B49\u4E8E\u53EF\u81EA\u884C\u6DFB\u52A0\u8C41\u514D\u3002",
            "\u8865\u5145\u8BE5\u76EE\u6807\u7684\u5B9E\u9645\u52A0\u8F7D\u4E0E\u529F\u80FD\u7ED3\u679C\uFF1B\u58F0\u660E\u51B2\u7A81\u4E0D\u8BC1\u660E\u5DF2\u7ECF\u5B9E\u9645\u52A0\u8F7D\u5931\u8D25\uFF0C\u8C41\u514D\u4E5F\u4E0D\u8BC1\u660E\u4E1A\u52A1\u901A\u8FC7\u3002",
          ];
        case "host-entry-inactive": {
          const state = finding2.evidence?.state;
          const step =
            state === "FAILED"
              ? "\u5B9A\u4F4D\u8BE5\u5305\u5BF9\u5E94\u7684 FAILED loader \u6761\u76EE\uFF0C\u5148\u5728\u672C\u673A\u67E5\u770B\u5931\u8D25\u539F\u56E0\u4E0E\u540C\u6B21\u542F\u52A8\u65E5\u5FD7\uFF0C\u6838\u5BF9\u5BFC\u5165\u3001\u521D\u59CB\u5316\u5931\u8D25\u53D1\u751F\u5728\u54EA\u4E00\u6B65\u3002"
              : state === "PENDING"
                ? "\u5B9A\u4F4D\u8BE5\u5305\u5BF9\u5E94\u7684 PENDING loader \u6761\u76EE\uFF0C\u6838\u5BF9\u9876\u5C42\u5FC5\u9700 inject \u4E0E\u5404\u4F9D\u8D56\u670D\u52A1\u7684\u63D0\u4F9B\u8005\u662F\u5426\u5728\u540C\u4E00\u5BBF\u4E3B\u5B9E\u9645\u6FC0\u6D3B\u3002"
                : "\u5728\u540C\u4E00\u76EE\u6807\u5BBF\u4E3B\u91CD\u65B0\u8BFB\u53D6\u8BE5\u5305\u6620\u5C04\u7684 loader \u6761\u76EE\u72B6\u6001\uFF0C\u6838\u5BF9\u6761\u76EE\u8EAB\u4EFD\u3001\u542F\u7528\u72B6\u6001\u4E0E\u91C7\u6837\u65F6\u95F4\uFF0C\u4E0D\u4ECE\u8BF4\u660E\u6587\u672C\u731C\u6D4B\u72B6\u6001\u3002";
          return [
            step,
            "\u8865\u5145\u540C\u4E00 profile\u3001DSH \u7248\u672C\u548C\u65F6\u95F4\u7684\u670D\u52A1\u89C2\u6D4B\u53CA loader \u72B6\u6001\uFF1BLOADING\u3001\u7981\u7528\u6216\u65E0\u6CD5\u6620\u5C04\u7684\u6761\u76EE\u4E0D\u80FD\u4EE3\u66FF FAILED \u6216 PENDING \u8BC1\u636E\u3002",
            "\u670D\u52A1\u6216\u6761\u76EE\u72B6\u6001\u6062\u590D\u540E\u4ECD\u9700\u5B9E\u9645\u64CD\u4F5C\u5BF9\u5E94\u529F\u80FD\u5E76\u6838\u9A8C\u7ED3\u679C\uFF1B\u6FC0\u6D3B\u6210\u529F\u4E0D\u80FD\u4EE3\u66FF\u4E1A\u52A1\u9A8C\u6536\u3002",
          ];
        }
        case "unprovided-dependency": {
          const absent = finding2.evidence?.status === "absent";
          const steps = [
            absent
              ? "\u6838\u5BF9\u672C\u6B21\u660E\u786E absent \u7684\u670D\u52A1\u89C2\u6D4B\u662F\u5426\u5C5E\u4E8E\u540C\u4E00 profile\u3001DSH \u7248\u672C\u4E0E\u4F9D\u8D56\u4F5C\u7528\u57DF\uFF0C\u5E76\u67E5\u770B\u8BE5\u670D\u52A1\u7684\u63D0\u4F9B\u8005\u662F\u5426\u5B9E\u9645\u6FC0\u6D3B\u3002"
              : "\u8BE5\u4F9D\u8D56\u4ECD\u5F85\u786E\u8BA4\uFF1A\u8865\u5145\u540C\u4E00 profile\u3001DSH \u7248\u672C\u4E0E\u6709\u6548\u91C7\u6837\u65F6\u95F4\u7684\u670D\u52A1\u89C2\u6D4B\uFF1B\u7701\u7565\u952E\u6216\u672A\u91C7\u6837\u4E0D\u80FD\u786E\u8BA4\u670D\u52A1\u7F3A\u5931\uFF0C\u4E5F\u4E0D\u80FD\u786E\u8BA4\u63D2\u4EF6\u6302\u8D77\u3002",
            finding2.evidence?.hardInject === true
              ? "\u5728\u62A5\u544A\u7ED9\u51FA\u7684\u6E90\u7801\u4F4D\u7F6E\u68C0\u67E5\u9876\u5C42\u5FC5\u9700 inject \u4E0E\u6FC0\u6D3B\u524D\u63D0\uFF0C\u518D\u5BF9\u7167\u5B9E\u9645 loader \u72B6\u6001\uFF1B\u4F9D\u8D56\u58F0\u660E\u672C\u8EAB\u4E0D\u80FD\u8BC1\u660E\u5DF2\u7ECF\u6302\u8D77\u3002"
              : "\u5728\u62A5\u544A\u7ED9\u51FA\u7684\u6E90\u7801\u4F4D\u7F6E\u533A\u5206\u53EF\u9009\u6216\u5B50\u4F5C\u7528\u57DF\u4F9D\u8D56\u4E0E\u9876\u5C42\u786C\u4F9D\u8D56\uFF1B\u4E0D\u63A8\u65AD\u6574\u4E2A\u63D2\u4EF6\u6302\u8D77\uFF0C\u5B9E\u9645\u64CD\u4F5C\u76F8\u5173\u529F\u80FD\u6838\u9A8C\u5F71\u54CD\u3002",
          ];
          if (finding2.evidence?.status === "unreadable")
            steps.push(
              "\u5148\u5728\u672C\u673A\u6838\u5BF9\u91C7\u6837\u8BFB\u53D6\u5931\u8D25\u539F\u56E0\uFF1B\u53EA\u8865\u5B89\u5168\u7684\u7ED3\u6784\u89C2\u6D4B\uFF0C\u4E0D\u6267\u884C getter \u6765\u6D88\u9664\u672A\u77E5\u3002",
            );
          steps.push(
            "\u6838\u5BF9\u670D\u52A1\u63D0\u4F9B\u8005\u7684\u5305\u58F0\u660E\u4E0E\u5B9E\u9645\u8FD0\u884C\u72B6\u6001\uFF1B\u63D0\u4F9B\u58F0\u660E\u53EA\u662F\u7EBF\u7D22\uFF0C\u4E0D\u81EA\u52A8\u5B89\u88C5\u4F9D\u8D56\u6216\u8BA4\u5B9A\u67D0\u5305\u80FD\u63D0\u4F9B\u8BE5\u670D\u52A1\u3002",
          );
          return steps;
        }
        case "host-service-missing":
          return [
            "\u5728\u62A5\u544A\u7ED9\u51FA\u7684\u6E90\u7801\u4F4D\u7F6E\u6838\u5BF9\u670D\u52A1\u8BFB\u53D6\u53CA\u5FC5\u9700 inject \u7684\u4F5C\u7528\u57DF\uFF0C\u5E76\u786E\u8BA4 absent \u89C2\u6D4B\u7ED1\u5B9A\u540C\u4E00 profile\u3001DSH \u7248\u672C\u4E0E\u91C7\u6837\u65F6\u95F4\u3002",
            "\u6838\u5BF9\u8BE5\u670D\u52A1\u7684\u5B9E\u9645\u63D0\u4F9B\u8005\u53CA loader \u72B6\u6001\uFF0C\u8865\u5145\u76F8\u5173\u529F\u80FD\u64CD\u4F5C\u7ED3\u679C\uFF1B\u670D\u52A1\u7F3A\u5931\u7684\u63A8\u65AD\u5F71\u54CD\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u5931\u8D25\u5DF2\u5B9E\u6D4B\u3002",
          ];
        case "api-argument-invalid":
        case "api-option-unsupported":
          return [
            "\u6309\u6E90\u7801\u4F4D\u7F6E\u6838\u5BF9\u9009\u9879\u7C7B\u578B\u3001\u679A\u4E3E\u3001\u5B9E\u9645\u4F20\u503C\u548C\u7CBE\u786E\u76EE\u6807\u7248\u672C\uFF0C\u67E5\u9605 evidence \u4E2D\u56FA\u5B9A\u6E90\u7801\u53CA\u5F52\u6863\u6458\u8981\uFF1B\u65B9\u6CD5\u5B58\u5728\u6216\u80FD\u529B\u5B88\u536B\u4E0D\u8BC1\u660E\u53C2\u6570\u6709\u6548\u3002",
            "\u5728\u72EC\u7ACB\u76EE\u6807\u4F1A\u8BDD\u6838\u9A8C\u8349\u7A3F\u4FDD\u7559\u3001\u66FF\u6362\u6216\u8FFD\u52A0\uFF1B\u672C\u9879\u4EC5\u662F\u9759\u6001\u53C2\u6570\u98CE\u9669\uFF0C\u4E0D\u8BC1\u660E\u4E1A\u52A1\u5931\u8D25\uFF0C\u4E5F\u4E0D\u81EA\u52A8\u4FEE\u6539\u6216\u63D0\u4EA4\u8349\u7A3F\u3002",
          ];
        case "host-method-missing":
          return [
            "\u5728\u62A5\u544A\u7ED9\u51FA\u7684\u6587\u4EF6\u4E0E\u884C\u53F7\u6838\u5BF9\u5B9E\u9645\u65B9\u6CD5\u8C03\u7528\u3001Context \u7ED1\u5B9A\u53CA\u80FD\u529B\u5B88\u536B\uFF0C\u68C0\u67E5\u662F\u5426\u5B58\u5728\u62A5\u544A\u5C1A\u672A\u8BC6\u522B\u7684\u515C\u5E95\u3002",
            "\u8865\u5145\u540C\u4E00\u76EE\u6807\u670D\u52A1\u7684\u5B8C\u6574\u65B9\u6CD5\u7ED3\u6784\u89C2\u6D4B\uFF0C\u533A\u5206\u76EE\u5F55\u7EBF\u7D22\u3001\u672A\u91C7\u6837\u65B9\u6CD5\u4E0E\u660E\u786E\u7F3A\u5931\uFF1B\u5B9E\u9645\u64CD\u4F5C\u5BF9\u5E94\u529F\u80FD\u6838\u9A8C\u63A8\u65AD\u5F71\u54CD\u3002",
            "\u9700\u8981\u66FF\u4EE3 API \u65F6\u5148\u67E5\u8BE5\u76EE\u6807\u7248\u672C\u7684\u6E90\u7801\u6216\u5B98\u65B9\u5951\u7EA6\u5E76\u4FDD\u7559\u51FA\u5904\uFF1B\u672C\u62A5\u544A\u4E0D\u731C\u6D4B\u66FF\u4EE3\u65B9\u6CD5\u6216\u4FEE\u590D\u7248\u672C\u3002",
          ];
        case "declaration-mismatch":
          return [
            "\u5BF9\u7167\u5DF2\u88C5\u63D2\u4EF6\u7684\u517C\u5BB9\u58F0\u660E\u3001\u7CBE\u786E\u76EE\u6807\u7248\u672C\u53CA\u62A5\u544A\u4E2D\u7684\u5177\u4F53 API \u53D1\u73B0\uFF0C\u5206\u522B\u6838\u5BF9\u58F0\u660E\u8303\u56F4\u4E0E\u8FD0\u884C\u65F6\u8BC1\u636E\u3002",
            "\u5728\u5DF2\u6709\u6E90\u7801\u4F4D\u7F6E\u68C0\u67E5\u8C03\u7528\u4E0E\u5B88\u536B\uFF0C\u5E76\u8865\u5145\u540C\u4E00\u76EE\u6807\u7684\u670D\u52A1\u89C2\u6D4B\u548C\u5B9E\u9645\u529F\u80FD\u7ED3\u679C\uFF1B\u58F0\u660E\u653E\u884C\u4E0D\u8BC1\u660E\u4E1A\u52A1\u901A\u8FC7\u3002",
          ];
        default:
          return [
            "\u5148\u6838\u5BF9\u8BE5\u53D1\u73B0\u7684\u7C7B\u522B\u3001\u4F9D\u636E\u3001\u5DF2\u6709\u5305\u5185\u4F4D\u7F6E\u548C\u76EE\u6807\u7248\u672C\uFF1B\u7F3A\u5C11\u4F4D\u7F6E\u6216\u72B6\u6001\u65F6\u4FDD\u7559\u5F85\u786E\u8BA4\uFF0C\u4E0D\u8865\u9020\u8BC1\u636E\u3002",
            "\u8865\u5145\u540C\u4E00 profile\u3001DSH \u7248\u672C\u4E0E\u91C7\u6837\u65F6\u95F4\u7684\u76F8\u5173\u89C2\u6D4B\uFF0C\u518D\u5B9E\u9645\u64CD\u4F5C\u5BF9\u5E94\u529F\u80FD\u6838\u9A8C\u5F71\u54CD\uFF1B\u4E0D\u6839\u636E\u672A\u77E5\u7C7B\u522B\u731C\u6D4B\u4FEE\u590D\u3002",
          ];
      }
    }

    // lib/upgrade-contract.mjs
    var SUPPORTED_PREVIEW_VERSIONS = Object.freeze([
      "0.2.0-rc.2",
      "0.2.1-rc.2",
      "0.2.1-rc.3",
    ]);
    var record2 = (x) =>
      x !== null && typeof x === "object" && !Array.isArray(x);
    var text2 = (x) => typeof x === "string" && x.length > 0;
    var strings2 = (x) =>
      Array.isArray(x) && x.every((v) => typeof v === "string");
    var hash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
    var integer2 = (x) => Number.isSafeInteger(x) && x >= 0;
    var severityRank = { degraded: 0, "feature-dead": 1, fatal: 2 };
    var certaintyRank = { suspected: 0, certain: 1 };
    var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    var findingKey = (plugin, f) =>
      JSON.stringify([
        plugin,
        f.category,
        f.service ?? null,
        f.method ?? null,
        f.location?.file ?? null,
        f.location?.line ?? null,
        f.location?.column ?? null,
        f.location?.start ?? null,
        f.location?.end ?? null,
      ]);
    function compareUpgradeFindings(currentReport, targetReport) {
      const changes = {
        added: [],
        worsened: [],
        resolved: [],
        unchanged: [],
        improved: [],
      };
      const collect = (report2) => {
        const entries = /* @__PURE__ */ new Map();
        for (const plugin of Object.keys(report2.plugins).sort())
          for (const finding2 of report2.plugins[plugin].findings) {
            const key = findingKey(plugin, finding2);
            if (!entries.has(key)) entries.set(key, []);
            entries.get(key).push({ plugin, finding: finding2 });
          }
        return entries;
      };
      const before = collect(currentReport),
        after = collect(targetReport);
      for (const key of [
        .../* @__PURE__ */ new Set([...before.keys(), ...after.keys()]),
      ].sort()) {
        const old = before.get(key) || [],
          next = after.get(key) || [];
        for (let i = 0; i < Math.max(old.length, next.length); i++) {
          if (!old[i]) {
            changes.added.push(next[i]);
            continue;
          }
          if (!next[i]) {
            changes.resolved.push(old[i]);
            continue;
          }
          const a = old[i].finding,
            b = next[i].finding;
          const severity = severityRank[b.severity] - severityRank[a.severity];
          const certainty =
            certaintyRank[b.certainty] - certaintyRank[a.certainty];
          if (severity > 0 || certainty > 0)
            changes.worsened.push({
              plugin: old[i].plugin,
              before: a,
              after: b,
            });
          else if (severity < 0 || certainty < 0)
            changes.improved.push({
              plugin: old[i].plugin,
              before: a,
              after: b,
            });
          else changes.unchanged.push(next[i]);
        }
      }
      return changes;
    }
    function upgradeExitCode(changes) {
      const risks = [
        ...changes.added.map((x) => x.finding),
        ...changes.worsened.map((x) => x.after),
      ];
      return risks.some((f) => f.severity === "fatal")
        ? 2
        : risks.length
          ? 1
          : 0;
    }
    function finding(f) {
      return (
        record2(f) &&
        text2(f.category) &&
        Object.hasOwn(severityRank, f.severity) &&
        Object.hasOwn(certaintyRank, f.certainty) &&
        ["inferred", "measured"].includes(f.impactBasis) &&
        text2(f.impact) &&
        text2(f.basis) &&
        (f.evidence === void 0 || record2(f.evidence)) &&
        [f.service, f.method].every(
          (x) => x === void 0 || x === null || typeof x === "string",
        ) &&
        (f.location === null ||
          (record2(f.location) &&
            text2(f.location.file) &&
            Number.isSafeInteger(f.location.line) &&
            f.location.line > 0 &&
            ["column", "start", "end"].every(
              (k) =>
                f.location[k] === void 0 ||
                f.location[k] === null ||
                integer2(f.location[k]),
            ) &&
            (!(integer2(f.location.start) && integer2(f.location.end)) ||
              f.location.end >= f.location.start)))
      );
    }
    function report(body, version, artifactHash) {
      if (
        !record2(body) ||
        body.schemaVersion !== 1 ||
        body.kind !== "plugin-compat-check/result" ||
        body.ok !== true ||
        body.error !== null ||
        body.dshVersion !== version ||
        !text2(body.toolVersion) ||
        body.baseline !== null ||
        body.cache !== null ||
        !record2(body.inputs) ||
        body.inputs.artifactSha256 !== artifactHash ||
        body.inputs.hasRuntimeSurface !== false ||
        !record2(body.observation) ||
        body.observation.mode !== "catalogue" ||
        body.observation.usable !== false ||
        body.observation.bound !== false ||
        body.observation.profileId !== null ||
        body.observation.dshVersion !== null ||
        body.observation.probedAt !== null ||
        !strings2(body.observation.notes) ||
        !record2(body.plugins) ||
        !record2(body.summary) ||
        !record2(body.extraction) ||
        typeof body.extraction.scanComplete !== "boolean" ||
        !Array.isArray(body.extraction.diagnostics) ||
        !Array.isArray(body.extraction.manifests)
      )
        return false;
      const counts = {
        ok: 0,
        partial: 0,
        broken: 0,
        unknown: 0,
        limited: 0,
        vacuousOk: 0,
      };
      for (const [name2, p] of Object.entries(body.plugins)) {
        if (
          !record2(p) ||
          p.name !== name2 ||
          !(p.version === null || typeof p.version === "string") ||
          !Object.hasOwn(counts, p.verdict) ||
          ["limited", "vacuousOk"].includes(p.verdict) ||
          typeof p.vacuous !== "boolean" ||
          !Array.isArray(p.findings) ||
          !p.findings.every(finding) ||
          !record2(p.coverage) ||
          !["complete", "limited"].includes(p.coverage.status) ||
          !integer2(p.coverage.verifiedCalls) ||
          !strings2(p.coverage.limitations) ||
          !record2(p.resolved)
        )
          return false;
        for (const key of [
          "checked",
          "clientSide",
          "filtered",
          "abstained",
          "runtimeFacilities",
        ])
          if (!Array.isArray(p[key])) return false;
        if (
          p.verdict !== "unknown" &&
          p.verdict !==
            (p.findings.some((f) => f.severity === "fatal")
              ? "broken"
              : p.findings.length
                ? "partial"
                : "ok")
        )
          return false;
        if (
          p.vacuous !==
            (p.verdict === "ok" && p.coverage.verifiedCalls === 0) ||
          (p.coverage.status === "limited") !==
            (p.coverage.limitations.length > 0 ||
              p.clientSide.length > 0 ||
              p.vacuous)
        )
          return false;
        const dispositions2 = [
          "finding",
          "client-side",
          "self-provided",
          "runtime-facility",
          "filtered",
          "abstained",
          "guarded",
          "no-calls",
          "unknown",
        ];
        const checked = (x) =>
          record2(x) &&
          text2(x.service) &&
          dispositions2.includes(x.disposition);
        if (
          !p.checked.every(checked) ||
          !Object.entries(p.resolved).every(
            ([svc, x]) => checked(x) && x.service === svc,
          ) ||
          !p.clientSide.every(
            (x) => record2(x) && text2(x.service) && text2(x.note),
          ) ||
          !p.filtered.every(
            (x) =>
              record2(x) &&
              text2(x.service) &&
              text2(x.method) &&
              text2(x.reason),
          ) ||
          !p.abstained.every(
            (x) => record2(x) && text2(x.service) && text2(x.basis),
          ) ||
          !p.runtimeFacilities.every(
            (x) => record2(x) && text2(x.name) && text2(x.reason),
          )
        )
          return false;
        counts[p.verdict]++;
        if (p.coverage.status === "limited") counts.limited++;
        if (p.vacuous && p.verdict === "ok") counts.vacuousOk++;
      }
      return (
        Object.entries(counts).every(([k, v]) => body.summary[k] === v) &&
        body.exitCode ===
          (counts.broken ? 2 : counts.partial || counts.unknown ? 1 : 0)
      );
    }
    function assertUpgradePreview(value) {
      const errors = [],
        need2 = (ok, key) => {
          if (!ok) errors.push(key);
        };
      if (!record2(value))
        throw new Error(
          "\u5347\u7EA7\u9884\u68C0\u5951\u7EA6\u4E0D\u5339\u914D: preview",
        );
      need2(
        value.schemaVersion === 1 &&
          value.kind === "plugin-compat-check/upgrade-preview",
        "schemaVersion/kind",
      );
      need2(
        value.mode === "static-version-comparison" &&
          ["compared", "unsupported-version", "error"].includes(value.status),
        "mode/status",
      );
      need2(
        text2(value.toolVersion) &&
          value.baseline === null &&
          value.cache === null &&
          strings2(value.limitations),
        "identity/isolation",
      );
      need2(
        [value.currentVersion, value.targetVersion].every(
          (x) => x === null || typeof x === "string",
        ),
        "versions",
      );
      need2(
        same(value.supportedVersions, SUPPORTED_PREVIEW_VERSIONS),
        "supportedVersions",
      );
      const groups = ["added", "worsened", "resolved", "unchanged", "improved"];
      need2(
        record2(value.changes) && record2(value.summary),
        "changes/summary",
      );
      for (const key of groups) {
        need2(Array.isArray(value.changes?.[key]), "changes." + key);
        need2(
          integer2(value.summary?.[key]) &&
            value.summary[key] === value.changes?.[key]?.length,
          "summary." + key,
        );
        for (const item of Array.isArray(value.changes?.[key])
          ? value.changes[key]
          : [])
          need2(
            record2(item) &&
              text2(item.plugin) &&
              (["worsened", "improved"].includes(key)
                ? finding(item.before) && finding(item.after)
                : finding(item.finding)),
            "finding." + key,
          );
      }
      need2(integer2(value.summary?.limitedPlugins), "summary.limitedPlugins");
      if (value.status === "compared") {
        need2(
          value.ok === true &&
            value.error === null &&
            SUPPORTED_PREVIEW_VERSIONS.includes(value.currentVersion) &&
            SUPPORTED_PREVIEW_VERSIONS.includes(value.targetVersion),
          "compared.versions/ok",
        );
        need2(record2(value.catalogs), "catalogs");
        for (const side of ["current", "target"]) {
          const item = value.catalogs?.[side];
          need2(
            record2(item) &&
              item.version === value[side + "Version"] &&
              text2(item.file) &&
              hash(item.sha256) &&
              record2(item.source) &&
              text2(item.source.host) &&
              text2(item.source.client),
            "catalog." + side,
          );
        }
        need2(
          record2(value.rules) &&
            text2(value.rules.file) &&
            hash(value.rules.sha256),
          "rules",
        );
        need2(
          record2(value.artifact) &&
            hash(value.artifact.sha256) &&
            Array.isArray(value.artifact.packages) &&
            value.artifact.packages.every(
              (p) =>
                record2(p) &&
                text2(p.name) &&
                (p.version === null || typeof p.version === "string") &&
                hash(p.sha256),
            ),
          "artifact",
        );
        const validReports =
          report(
            value.currentReport,
            value.currentVersion,
            value.artifact?.sha256,
          ) &&
          report(
            value.targetReport,
            value.targetVersion,
            value.artifact?.sha256,
          );
        need2(validReports, "canonicalReports");
        if (validReports) {
          const identities = (body) =>
            Object.values(body.plugins)
              .map((p) => JSON.stringify([p.name, p.version]))
              .sort();
          const currentIdentities = identities(value.currentReport);
          const targetIdentities = identities(value.targetReport);
          const artifactIdentities = Array.isArray(value.artifact?.packages)
            ? value.artifact.packages.map((p) =>
                JSON.stringify([p?.name, p?.version]),
              )
            : [];
          const artifactIdentitySet = new Set(artifactIdentities),
            currentIdentitySet = new Set(currentIdentities);
          need2(
            same(currentIdentities, targetIdentities),
            "canonicalReports.same-input",
          );
          need2(
            artifactIdentitySet.size === artifactIdentities.length &&
              currentIdentities.length === artifactIdentities.length &&
              currentIdentities.every((identity) =>
                artifactIdentitySet.has(identity),
              ) &&
              artifactIdentities.every((identity) =>
                currentIdentitySet.has(identity),
              ),
            "artifact.package-identities",
          );
          need2(
            same(
              value.changes,
              compareUpgradeFindings(value.currentReport, value.targetReport),
            ),
            "changes.evidence",
          );
          const limited = new Set(
            [
              ...Object.values(value.currentReport.plugins),
              ...Object.values(value.targetReport.plugins),
            ]
              .filter((p) => p.coverage.status === "limited")
              .map((p) => p.name),
          );
          need2(
            value.summary?.limitedPlugins === limited.size,
            "summary.limitedPlugins/count",
          );
        }
        if (!errors.length)
          need2(value.exitCode === upgradeExitCode(value.changes), "exitCode");
      } else {
        need2(
          value.ok === false && text2(value.error) && value.exitCode === 3,
          "failure.error/exitCode",
        );
        need2(
          [
            "artifact",
            "catalogs",
            "rules",
            "currentReport",
            "targetReport",
          ].every((k) => value[k] === null),
          "failure.evidence",
        );
        need2(
          groups.every((k) => value.changes?.[k]?.length === 0) &&
            value.summary?.limitedPlugins === 0,
          "failure.changes",
        );
        if (value.status === "unsupported-version")
          need2(
            !SUPPORTED_PREVIEW_VERSIONS.includes(value.currentVersion) ||
              !SUPPORTED_PREVIEW_VERSIONS.includes(value.targetVersion),
            "unsupported-version",
          );
      }
      if (errors.length)
        throw new Error(
          "\u5347\u7EA7\u9884\u68C0\u5951\u7EA6\u4E0D\u5339\u914D: " +
            errors.join(", "),
        );
      return value;
    }
    var UPGRADE_PREVIEW_LIMITATIONS = Object.freeze([
      "\u9759\u6001\u7248\u672C\u9884\u6D4B\u672A\u8BA4\u8BC1\u672A\u6765\u73AF\u5883\u6216\u4E1A\u52A1\u901A\u8FC7\uFF1B\u6CA1\u6709\u65B0\u589E\u98CE\u9669\u4EC5\u8868\u793A\u672C\u6B21\u672A\u53D1\u73B0\u65B0\u589E\u9759\u6001\u98CE\u9669\u3002",
      "\u5BF9\u540C\u4E00\u7EC4\u63D2\u4EF6\u7684\u79C1\u6709\u5B57\u8282\u526F\u672C\u8054\u5408\u9759\u6001\u63D0\u53D6\u4E00\u6B21\uFF0C\u8BC6\u522B\u540D\u96C6\u5408\u53D6\u4E24\u4E2A\u76EE\u5F55\u7684\u5E76\u96C6\uFF1B\u968F\u540E\u5404\u6309\u5BF9\u5E94\u7248\u672C\u76EE\u5F55\u72EC\u7ACB\u5224\u5B9A\uFF0C\u4E0D\u80FD\u590D\u7528\u666E\u901A\u5B9E\u65F6\u4F53\u68C0\u8BC1\u660E\u672A\u6765\u73AF\u5883\u3002",
      "API\u76EE\u5F55\u4E0D\u662F\u8FD0\u884C\u65F6\u670D\u52A1\u9762\uFF1B\u786E\u5B9A\u6027\u3001\u63A8\u65AD\u5F71\u54CD\u3001\u8986\u76D6\u9650\u5236\u3001\u65E0\u5DF2\u9A8C\u8BC1\u8C03\u7528\u53CA\u5BA2\u6237\u7AEF\u5F85\u9A8C\u8BC1\u4FE1\u606F\u5747\u4FDD\u7559\u3002",
      "\u5F53\u524D\u5BBF\u4E3B\u8FD0\u884C\u65F6\u3001\u63A2\u9488\u3001\u6761\u76EE\u72B6\u6001\u3001profile\u8C41\u514D\u3001\u7F13\u5B58\u548C\u57FA\u7EBF\u4E0D\u53C2\u4E0E\u9884\u6D4B\uFF1B\u4E0D\u6267\u884C\u63D2\u4EF6\u4EE3\u7801\u3001\u4E0D\u5B89\u88C5\u6216\u5347\u7EA7\u3002",
      "\u8F93\u5165\u91C7\u7528\u6709\u754C\u590D\u5236\u53CA\u4E24\u6B21\u4E00\u81F4\u6027\u89C2\u5BDF\uFF0C\u68C0\u6D4B\u666E\u901A\u5E76\u53D1\u53D8\u66F4\uFF1B\u4E0D\u662F\u64CD\u4F5C\u7CFB\u7EDF\u539F\u5B50\u5FEB\u7167\u3002",
      "\u9000\u51FA\u7801\u4EC5\u53CD\u6620\u65B0\u589E\u6216\u53D8\u91CD\u98CE\u9669\uFF1A0\u65E0\u65B0\u589E\uFF0C1\u65B0\u589E\u975E\u81F4\u547D\uFF0C2\u65B0\u589E\u81F4\u547D\uFF0C3\u9884\u68C0\u4E0D\u53EF\u7528\uFF1B\u76EE\u6807\u7248\u672C\u539F\u6709\u98CE\u9669\u4ECD\u5217\u51FA\u3002",
    ]);

    // lib/dependency-graph.mjs
    var GRAPH_KIND = "plugin-compat-check/dependency-graph";
    var GRAPH_LIMITS = Object.freeze({
      nodes: 1e3,
      edges: 4e3,
      traversal: 2e4,
      items: 2e4,
    });
    var graphRecord = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value);
    var graphText = (value) => typeof value === "string" && value.length > 0;
    var graphId = (...parts) => JSON.stringify(parts);
    var graphRequirement = (kind) =>
      kind === "required-inject"
        ? "required"
        : kind === "scoped-inject"
          ? "subcontext"
          : ["optional-read", "read"].includes(kind)
            ? "optional"
            : "unknown";
    function validateDependencyGraph(graph) {
      if (
        !graphRecord(graph) ||
        graph.kind !== GRAPH_KIND ||
        graph.schemaVersion !== 1
      )
        return false;
      const coverage = graph.coverage;
      if (
        !graphRecord(coverage) ||
        !["limited", "complete"].includes(coverage.status) ||
        typeof coverage.truncated !== "boolean" ||
        !Array.isArray(coverage.reasons) ||
        coverage.reasons.length > 100 ||
        !coverage.reasons.every(graphText) ||
        !graphRecord(coverage.limits)
      )
        return false;
      if (
        (coverage.truncated && coverage.status !== "limited") ||
        (coverage.status === "complete" && coverage.reasons.length) ||
        (coverage.status === "limited" && !coverage.reasons.length)
      )
        return false;
      for (const [key, max] of Object.entries(GRAPH_LIMITS))
        if (
          !Number.isSafeInteger(coverage.limits[key]) ||
          coverage.limits[key] < 0 ||
          coverage.limits[key] > max
        )
          return false;
      if (
        !Array.isArray(graph.nodes) ||
        graph.nodes.length > coverage.limits.nodes ||
        !Array.isArray(graph.edges) ||
        graph.edges.length > coverage.limits.edges ||
        !Array.isArray(graph.impacts) ||
        !Array.isArray(graph.cycles) ||
        !Array.isArray(graph.notes) ||
        graph.notes.length > 100 ||
        !graph.notes.every(graphText)
      )
        return false;
      const nodes = /* @__PURE__ */ new Map(),
        edges = /* @__PURE__ */ new Map();
      const validSide = (side) => ["host", "client", "unknown"].includes(side);
      const nonnegative = (value) =>
        value === null || (Number.isSafeInteger(value) && value >= 0);
      const source = (value) =>
        graphRecord(value) &&
        (value.file === null || typeof value.file === "string") &&
        nonnegative(value.line) &&
        nonnegative(value.start) &&
        nonnegative(value.end) &&
        (value.start === null ||
          value.end === null ||
          value.end >= value.start);
      let nestedItems = 0,
        pathItems = 0;
      for (const node of graph.nodes) {
        if (
          !graphRecord(node) ||
          !graphText(node.id) ||
          nodes.has(node.id) ||
          !graphText(node.name) ||
          !["plugin", "service", "client-package"].includes(node.kind)
        )
          return false;
        if (node.kind === "plugin") {
          if (
            !graphText(node.loaderState) ||
            !Array.isArray(node.entries) ||
            !Array.isArray(node.subContexts)
          )
            return false;
          nestedItems += node.entries.length + node.subContexts.length;
          if (nestedItems > coverage.limits.items) return false;
          if (
            !node.entries.every(
              (row) =>
                graphRecord(row) &&
                (row.id === null || typeof row.id === "string") &&
                graphText(row.state) &&
                typeof row.disabled === "boolean",
            )
          )
            return false;
          for (const context of node.subContexts) {
            if (
              !graphRecord(context) ||
              (context.file !== null && typeof context.file !== "string") ||
              !Array.isArray(context.names)
            )
              return false;
            nestedItems += context.names.length;
            if (
              nestedItems > coverage.limits.items ||
              !context.names.every(graphText)
            )
              return false;
          }
        } else if (
          !validSide(node.side) ||
          (node.kind === "service" && node.state !== "unknown") ||
          (node.kind === "client-package" && node.side !== "client")
        )
          return false;
        nodes.set(node.id, node);
      }
      for (const edge of graph.edges) {
        if (
          !graphRecord(edge) ||
          !graphText(edge.id) ||
          edges.has(edge.id) ||
          !nodes.has(edge.from) ||
          !nodes.has(edge.to) ||
          nodes.get(edge.from).kind !== "plugin" ||
          !validSide(edge.side) ||
          edge.potential !== true
        )
          return false;
        if (edge.kind === "client-package-inject") {
          if (
            nodes.get(edge.to).kind !== "client-package" ||
            edge.side !== "client"
          )
            return false;
        } else if (["dependency", "candidate-provider"].includes(edge.kind)) {
          if (
            nodes.get(edge.to).kind !== "service" ||
            !graphText(edge.service) ||
            nodes.get(edge.to).name !== edge.service ||
            nodes.get(edge.to).side !== edge.side ||
            !source(edge.source)
          )
            return false;
          if (
            edge.kind === "dependency" &&
            (!["required", "optional", "subcontext", "unknown"].includes(
              edge.requirement,
            ) ||
              !graphText(edge.declarationKind) ||
              edge.requirement !== graphRequirement(edge.declarationKind))
          )
            return false;
          if (
            edge.kind === "candidate-provider" &&
            edge.sideMatch !==
              (edge.side === "unknown" ? "unverified" : "source")
          )
            return false;
        } else return false;
        edges.set(edge.id, edge);
      }
      const validPath = (path, from, to, side, requirements, pluginPath) => {
        if (!Array.isArray(path) || path.length < 2 || path.length % 2)
          return false;
        pathItems += path.length;
        if (pathItems > coverage.limits.traversal) return false;
        if (
          requirements &&
          (!Array.isArray(requirements) ||
            requirements.length * 2 !== path.length)
        )
          return false;
        if (
          pluginPath &&
          (!Array.isArray(pluginPath) ||
            pluginPath.length !== path.length / 2 + 1 ||
            pluginPath[0] !== from)
        )
          return false;
        let current = from;
        for (let i = 0; i < path.length; i += 2) {
          const provider = edges.get(path[i]),
            consumer = edges.get(path[i + 1]);
          if (
            provider?.kind !== "candidate-provider" ||
            consumer?.kind !== "dependency" ||
            provider.side !== side ||
            consumer.side !== side ||
            provider.from !== current ||
            provider.to !== consumer.to
          )
            return false;
          if (requirements && requirements[i / 2] !== consumer.requirement)
            return false;
          current = consumer.from;
          if (pluginPath && pluginPath[i / 2 + 1] !== current) return false;
        }
        return current === to;
      };
      if (
        graph.impacts.length > graph.nodes.length ||
        graph.cycles.length > coverage.limits.traversal
      )
        return false;
      const roots = /* @__PURE__ */ new Set();
      let relationships = 0;
      for (const impact of graph.impacts) {
        if (
          !graphRecord(impact) ||
          nodes.get(impact.plugin)?.kind !== "plugin" ||
          roots.has(impact.plugin) ||
          impact.potential !== true ||
          !Array.isArray(impact.affected) ||
          impact.affected.length > coverage.limits.traversal
        )
          return false;
        roots.add(impact.plugin);
        const affected = /* @__PURE__ */ new Set();
        for (const row of impact.affected) {
          if (
            ++relationships > coverage.limits.traversal ||
            !graphRecord(row) ||
            nodes.get(row.plugin)?.kind !== "plugin" ||
            row.plugin === impact.plugin ||
            row.potential !== true ||
            !["host", "client"].includes(row.side) ||
            !Array.isArray(row.requirements) ||
            !validPath(
              row.path,
              impact.plugin,
              row.plugin,
              row.side,
              row.requirements,
            )
          )
            return false;
          const key = graphId(row.plugin, row.side);
          if (affected.has(key)) return false;
          affected.add(key);
        }
      }
      for (const cycle of graph.cycles) {
        if (
          !graphRecord(cycle) ||
          cycle.potential !== true ||
          !["host", "client"].includes(cycle.side) ||
          !Array.isArray(cycle.plugins) ||
          cycle.plugins.length < 2 ||
          cycle.plugins[0] !== cycle.plugins.at(-1) ||
          !cycle.plugins.every((id) => nodes.get(id)?.kind === "plugin") ||
          !validPath(
            cycle.path,
            cycle.plugins[0],
            cycle.plugins[0],
            cycle.side,
            null,
            cycle.plugins,
          )
        )
          return false;
      }
      return true;
    }

    // lib/finding-review.mjs
    var REVIEW_STATUS_LABELS = Object.freeze({
      pending: "\u5F85\u786E\u8BA4",
      reviewed: "\u5DF2\u590D\u6838",
      "false-positive": "\u8BEF\u62A5",
      fixed: "\u5DF2\u4FEE\u590D",
      "needs-review": "\u5F85\u91CD\u5BA1",
    });
    var REVIEW_LIMITS = Object.freeze({
      fileBytes: 1024 * 1024,
      records: 1e3,
      note: 4e3,
      findings: 5e3,
      identityBytes: 128 * 1024,
    });
    var object = (x) =>
      x !== null && typeof x === "object" && !Array.isArray(x);
    var hash2 = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
    var safe = (x) =>
      typeof x === "string" &&
      !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
        x,
      );
    function fail(message) {
      throw Object.assign(new Error(message), { code: "REVIEW_INVALID" });
    }
    function validateReviewInput(input) {
      if (
        !object(input) ||
        Object.keys(input).sort().join(",") !==
          "contextToken,findingId,note,status"
      )
        fail("Invalid review fields");
      if (!hash2(input.contextToken) || !hash2(input.findingId))
        fail("Invalid review context or finding ID");
      if (
        !Object.hasOwn(REVIEW_STATUS_LABELS, input.status) ||
        input.status === "needs-review"
      )
        fail("Invalid manual review status");
      if (!safe(input.note) || input.note.length > REVIEW_LIMITS.note)
        fail("Invalid review note");
      if (input.status !== "pending" && !input.note.trim())
        fail("Review note is required");
      return {
        contextToken: input.contextToken,
        findingId: input.findingId,
        status: input.status,
        note: input.note.trim(),
      };
    }
    function validateReviewEnvelope(value, report2) {
      try {
        const keys2 = (x, want) =>
          object(x) && Object.keys(x).sort().join(",") === want;
        const text3 = (x, max) => safe(x) && x.length > 0 && x.length <= max;
        const note = (x) => safe(x) && x.length <= REVIEW_LIMITS.note;
        const manual = (x) =>
          Object.hasOwn(REVIEW_STATUS_LABELS, x) && x !== "needs-review";
        const record3 = (r2, summary = false) =>
          keys2(
            r2,
            summary
              ? "findingId,note,noteTruncated,pluginName,pluginVersion,status,updatedAt"
              : "findingId,note,pluginName,pluginVersion,status,updatedAt",
          ) &&
          hash2(r2.findingId) &&
          text3(r2.pluginName, 500) &&
          text3(r2.pluginVersion, 200) &&
          manual(r2.status) &&
          note(r2.note) &&
          (r2.status === "pending" ||
            r2.note.trim().length > 0 ||
            (summary && r2.noteTruncated)) &&
          text3(r2.updatedAt, 40) &&
          Number.isFinite(Date.parse(r2.updatedAt)) &&
          (!summary ||
            (typeof r2.noteTruncated === "boolean" && r2.note.length <= 200));
        if (
          !keys2(
            value,
            "contextToken,error,history,items,revision,schemaVersion",
          ) ||
          value.schemaVersion !== 1 ||
          !Array.isArray(value.items) ||
          value.items.length > REVIEW_LIMITS.findings ||
          !Array.isArray(value.history) ||
          value.history.length > REVIEW_LIMITS.records ||
          !(value.error === null || text3(value.error, 4e3))
        )
          return false;
        if (
          value.error &&
          value.contextToken === null &&
          value.revision === null
        )
          return value.items.length === 0 && value.history.length === 0;
        if (!hash2(value.contextToken) || !hash2(value.revision)) return false;
        const seenSlots = /* @__PURE__ */ new Set(),
          seenHistory = /* @__PURE__ */ new Set();
        for (const item of value.items) {
          if (
            !keys2(
              item,
              "findingId,findingIndex,history,historyCount,note,pluginName,pluginVersion,record,reviewReason,status",
            ) ||
            !hash2(item.findingId) ||
            !text3(item.pluginName, 500) ||
            !text3(item.pluginVersion, 200) ||
            !Number.isSafeInteger(item.findingIndex) ||
            item.findingIndex < 0 ||
            !Object.hasOwn(REVIEW_STATUS_LABELS, item.status) ||
            !note(item.note) ||
            !Array.isArray(item.history) ||
            item.history.length > 3 ||
            !Number.isSafeInteger(item.historyCount) ||
            item.historyCount < item.history.length ||
            item.historyCount > REVIEW_LIMITS.records ||
            !(item.reviewReason === null || text3(item.reviewReason, 4e3))
          )
            return false;
          const slot = JSON.stringify([item.pluginName, item.findingIndex]);
          if (seenSlots.has(slot)) return false;
          seenSlots.add(slot);
          if (report2) {
            const plugin = report2.plugins?.[item.pluginName];
            if (
              !plugin ||
              plugin.version !== item.pluginVersion ||
              !Array.isArray(plugin.findings) ||
              item.findingIndex >= plugin.findings.length
            )
              return false;
          }
          if (item.record !== null) {
            if (
              !record3(item.record) ||
              item.record.findingId !== item.findingId ||
              item.record.pluginName !== item.pluginName ||
              item.record.pluginVersion !== item.pluginVersion ||
              item.record.status !== item.status ||
              item.record.note !== item.note
            )
              return false;
          } else if (
            item.note !== "" ||
            !["pending", "needs-review"].includes(item.status)
          )
            return false;
          if (
            item.status === "needs-review" &&
            (!item.historyCount || !item.reviewReason)
          )
            return false;
          if (item.historyCount > 0 && !item.reviewReason) return false;
          const local = /* @__PURE__ */ new Set();
          for (const previous of item.history) {
            if (
              !record3(previous, true) ||
              previous.findingId === item.findingId ||
              previous.pluginName !== item.pluginName ||
              local.has(previous.findingId)
            )
              return false;
            local.add(previous.findingId);
          }
        }
        for (const previous of value.history) {
          if (!record3(previous) || seenHistory.has(previous.findingId))
            return false;
          seenHistory.add(previous.findingId);
        }
        if (report2) {
          let count = 0;
          for (const plugin of Object.values(report2.plugins || {})) {
            if (!Array.isArray(plugin.findings)) return false;
            count += plugin.findings.length;
          }
          if (count !== value.items.length) return false;
        }
        return true;
      } catch {
        return false;
      }
    }

    // lib/functional-health-contract.mjs
    var FUNCTIONAL_HEALTH_KIND = "plugin-compat-check/functional-health";
    var FUNCTIONAL_HEALTH_LIMITS = Object.freeze({
      checks: 32,
      path: 256,
      selector: 160,
      responseBytes: 65536,
      requestMs: 3e3,
      totalMs: 18e4,
    });
    var object2 = (v) =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    var keys = (v, allowed) =>
      object2(v) && Object.keys(v).every((k) => allowed.includes(k));
    var exactVersion = (v) =>
      typeof v === "string" &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
        v,
      );
    var digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
    var bounded = (v, n) =>
      typeof v === "string" && v.length > 0 && v.length <= n;
    var artifactValid = (a) =>
      keys(a, ["name", "version", "sha256"]) &&
      typeof a.name === "string" &&
      /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(a.name) &&
      a.name.length <= 214 &&
      exactVersion(a.version) &&
      digest(a.sha256);
    function validFunctionalPath(v) {
      return (
        bounded(v, FUNCTIONAL_HEALTH_LIMITS.path) &&
        /^\/(?!\/)[A-Za-z0-9/_.,~-]*$/.test(v) &&
        !v.split("/").some((p) => p === ".." || p === ".")
      );
    }
    function validateFunctionalManifest(value) {
      const errors = [];
      if (
        !keys(value, ["schemaVersion", "artifact", "dshVersion", "checks"]) ||
        value.schemaVersion !== 1 ||
        !artifactValid(value.artifact) ||
        !exactVersion(value.dshVersion)
      )
        errors.push("Invalid manifest schema or exact artifact/DSH identity");
      if (
        !Array.isArray(value?.checks) ||
        value.checks.length < 1 ||
        value.checks.length > FUNCTIONAL_HEALTH_LIMITS.checks
      )
        errors.push("Expected 1..32 bounded checks");
      else {
        const seen = /* @__PURE__ */ new Set();
        for (const c of value.checks) {
          if (
            !object2(c) ||
            !bounded(c.id, 64) ||
            !/^[A-Za-z0-9_-]+$/.test(c.id) ||
            seen.has(c.id) ||
            !validFunctionalPath(c.path)
          ) {
            errors.push("Invalid check id/path or duplicate id");
            continue;
          }
          seen.add(c.id);
          if (c.type === "http") {
            if (
              !keys(c, ["id", "type", "path", "status", "json"]) ||
              !Number.isInteger(c.status) ||
              c.status < 200 ||
              c.status > 599 ||
              (c.status >= 300 && c.status < 400)
            )
              errors.push("Invalid HTTP check");
            if (
              c.json !== void 0 &&
              (!keys(c.json, ["pointer", "equals"]) ||
                typeof c.json.pointer !== "string" ||
                c.json.pointer.length > 256 ||
                !/^(?:\/(?:[^~\u0000-\u001f]|~[01])*)*$/.test(c.json.pointer) ||
                !Object.hasOwn(c.json, "equals") ||
                ![null, "string", "boolean", "number"].includes(
                  c.json.equals === null ? null : typeof c.json.equals,
                ) ||
                (typeof c.json.equals === "string" &&
                  c.json.equals.length > 256) ||
                (typeof c.json.equals === "number" &&
                  !Number.isFinite(c.json.equals)))
            )
              errors.push(
                "JSON assertion must be a bounded JSON pointer and scalar value",
              );
          } else if (c.type === "dom") {
            if (
              !keys(c, [
                "id",
                "type",
                "path",
                "selector",
                "minCount",
                "maxCount",
              ]) ||
              !bounded(c.selector, FUNCTIONAL_HEALTH_LIMITS.selector) ||
              !/^[A-Za-z0-9_#.*\[\]="'\- >]+$/.test(c.selector) ||
              !Number.isInteger(c.minCount) ||
              !Number.isInteger(c.maxCount) ||
              c.minCount < 0 ||
              c.maxCount < c.minCount ||
              c.maxCount > 1e3
            )
              errors.push("Invalid bounded DOM selector/count check");
          } else
            errors.push("Only HTTP GET and DOM selector counts are supported");
        }
      }
      return errors.length ? { valid: false, errors } : { valid: true, value };
    }
    function validateFunctionalHealthResult(value, expectedIdentity = {}) {
      const errors = [];
      const iso = (v) =>
        typeof v === "string" &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString() === v;
      if (
        !keys(value, [
          "schemaVersion",
          "kind",
          "status",
          "identity",
          "startedAt",
          "completedAt",
          "checks",
          "cleanup",
          "limitations",
          "error",
          "declaration",
        ]) ||
        value.schemaVersion !== 1 ||
        value.kind !== FUNCTIONAL_HEALTH_KIND ||
        !["tested-pass", "tested-failed", "error"].includes(value.status)
      )
        errors.push("Invalid functional health result schema/status");
      const declarationValidation = validateFunctionalManifest(
        value?.declaration,
      );
      if (!declarationValidation.valid)
        errors.push("Missing or invalid executed declaration");
      const id = value?.identity;
      if (
        declarationValidation.valid &&
        (value.declaration.dshVersion !== id?.dshVersion ||
          ["name", "version", "sha256"].some(
            (k) => value.declaration.artifact[k] !== id?.artifact?.[k],
          ))
      )
        errors.push("Executed declaration identity differs from result");
      if (
        !keys(id, ["artifact", "dshVersion", "manifestSha256"]) ||
        !artifactValid(id.artifact) ||
        !exactVersion(id.dshVersion) ||
        !digest(id.manifestSha256)
      )
        errors.push("Invalid exact evidence identity");
      if (
        !iso(value?.startedAt) ||
        !iso(value?.completedAt) ||
        value.completedAt < value.startedAt ||
        Date.parse(value.completedAt) - Date.parse(value.startedAt) >
          FUNCTIONAL_HEALTH_LIMITS.totalMs + 3e4
      )
        errors.push("Invalid bounded measurement times");
      if (
        !keys(value?.cleanup, ["stopped", "removed", "errors"]) ||
        typeof value.cleanup.stopped !== "boolean" ||
        typeof value.cleanup.removed !== "boolean" ||
        (value.cleanup.errors !== void 0 &&
          (!Array.isArray(value.cleanup.errors) ||
            value.cleanup.errors.length > 8 ||
            value.cleanup.errors.some((x) => !bounded(x, 512))))
      )
        errors.push("Invalid cleanup evidence");
      if (
        !Array.isArray(value?.limitations) ||
        value.limitations.length < 1 ||
        value.limitations.length > 8 ||
        value.limitations.some((x) => !bounded(x, 512)) ||
        (value.error !== void 0 && !bounded(value.error, 1024))
      )
        errors.push("Invalid limitations/error summary");
      const seen = /* @__PURE__ */ new Set();
      if (!Array.isArray(value?.checks) || value.checks.length > 32)
        errors.push("Invalid check evidence");
      else
        for (const c of value.checks) {
          const e = c?.evidence;
          if (
            !keys(c, ["id", "type", "status", "evidence"]) ||
            !bounded(c.id, 64) ||
            !/^[A-Za-z0-9_-]+$/.test(c.id) ||
            seen.has(c.id) ||
            !["http", "dom"].includes(c.type) ||
            !["pass", "failed", "error"].includes(c.status) ||
            !keys(e, [
              "httpStatus",
              "responseBytes",
              "jsonMatched",
              "count",
              "elapsedMs",
              "error",
            ]) ||
            !Number.isFinite(e.elapsedMs) ||
            e.elapsedMs < 0 ||
            e.elapsedMs > FUNCTIONAL_HEALTH_LIMITS.totalMs
          ) {
            errors.push("Invalid check row");
            continue;
          }
          seen.add(c.id);
          if (c.status === "error") {
            if (!bounded(e.error, 256)) errors.push("Missing check error");
          } else if (c.type === "http") {
            if (
              !Number.isInteger(e.httpStatus) ||
              e.httpStatus < 200 ||
              e.httpStatus > 599 ||
              !Number.isInteger(e.responseBytes) ||
              e.responseBytes < 0 ||
              e.responseBytes > 65536 ||
              (e.jsonMatched !== void 0 &&
                typeof e.jsonMatched !== "boolean") ||
              e.count !== void 0 ||
              e.error !== void 0
            )
              errors.push("Invalid HTTP evidence");
          } else if (
            !Number.isInteger(e.count) ||
            e.count < 0 ||
            e.httpStatus !== void 0 ||
            e.responseBytes !== void 0 ||
            e.jsonMatched !== void 0 ||
            e.error !== void 0
          )
            errors.push("Invalid DOM evidence");
        }
      if (errors.length) return { valid: false, errors };
      if (declarationValidation.valid && Array.isArray(value?.checks)) {
        const expected = value.declaration.checks;
        if (
          (value.status !== "error" &&
            value.checks.length !== expected.length) ||
          value.checks.length > expected.length
        )
          errors.push("Evidence must cover every declared check in order");
        for (let i = 0; i < value.checks.length; i++) {
          const row = value.checks[i],
            check = expected[i];
          if (
            !row ||
            !check ||
            row.id !== check.id ||
            row.type !== check.type
          ) {
            errors.push(
              "Evidence check identity/order differs from declaration",
            );
            continue;
          }
          if (row.status === "error") continue;
          const e = row.evidence;
          if (!object2(e)) continue;
          const passed =
            check.type === "http"
              ? e.httpStatus === check.status &&
                (!check.json || e.jsonMatched === true)
              : e.count >= check.minCount && e.count <= check.maxCount;
          if (
            row.status !== (passed ? "pass" : "failed") ||
            (check.type === "http" &&
              Boolean(check.json) !== (e.jsonMatched !== void 0))
          )
            errors.push("Evidence outcome conflicts with executed expectation");
        }
      }
      if (
        value?.status === "tested-pass" &&
        (!value.checks?.length ||
          value.checks.some((c) => c?.status !== "pass") ||
          value.cleanup?.stopped !== true ||
          value.cleanup?.removed !== true ||
          value.cleanup?.errors?.length ||
          value.error !== void 0)
      )
        errors.push("Pass conflicts with checks or cleanup");
      if (
        value?.status === "tested-failed" &&
        (!value.checks?.some((c) => c?.status === "failed") ||
          value.checks.some((c) => c?.status === "error") ||
          value.cleanup?.stopped !== true ||
          value.cleanup?.removed !== true ||
          value.error !== void 0)
      )
        errors.push("Failed measurement conflicts with checks/cleanup");
      if (value?.status === "error" && !bounded(value.error, 1024))
        errors.push("Missing run error");
      if (errors.length) return { valid: false, errors };
      const staleReasons = [];
      if (
        !expectedIdentity.artifact ||
        !["name", "version", "sha256"].every(
          (k) => typeof expectedIdentity.artifact[k] === "string",
        )
      )
        staleReasons.push("Current artifact identity unavailable");
      else
        for (const key of ["name", "version", "sha256"])
          if (id.artifact[key] !== expectedIdentity.artifact[key])
            staleReasons.push("Artifact " + key + " changed");
      if (!expectedIdentity.dshVersion)
        staleReasons.push("Current DSH version unavailable");
      else if (id.dshVersion !== expectedIdentity.dshVersion)
        staleReasons.push("DSH version changed");
      if (!expectedIdentity.manifestSha256)
        staleReasons.push("Current declaration identity unavailable");
      else if (id.manifestSha256 !== expectedIdentity.manifestSha256)
        staleReasons.push("Declaration changed");
      return {
        valid: true,
        value,
        current: staleReasons.length === 0,
        staleReasons,
      };
    }
    function canonicalFunctionalManifest(value) {
      const validation = validateFunctionalManifest(value);
      if (!validation.valid) throw Error(validation.errors.join("; "));
      const ordered = (v) =>
        Array.isArray(v)
          ? v.map(ordered)
          : object2(v)
            ? Object.fromEntries(
                Object.keys(v)
                  .sort()
                  .map((k) => [k, ordered(v[k])]),
              )
            : v;
      return JSON.stringify(ordered(value));
    }

    // lib/workflow-panels.mjs
    function createDisclosure(React3, h2) {
      return function Disclosure2({ title, count, children }) {
        const [open, setOpen] = React3.useState(false);
        const content = Array.isArray(children) ? children[0] : children;
        return h2(
          "section",
          { "data-slot": "collapsible" },
          h2(
            "div",
            null,
            title,
            `\uFF08${count}\uFF09`,
            h2(
              "button",
              {
                type: "button",
                "aria-label": `${open ? "\u6536\u8D77" : "\u5C55\u5F00"}${title}`,
                "aria-expanded": open,
                onClick: () => setOpen((value) => !value),
              },
              open ? "\u6536\u8D77" : "\u5C55\u5F00",
            ),
          ),
          open ? content() : null,
        );
      };
    }
    function createDependencyPanel(React3, GraphContract = {}, UI = {}) {
      const h2 = (type, props, ...children) =>
        React3.createElement(UI[type] || type, props, ...children);
      const requirement = {
        required: "\u5FC5\u9700",
        optional: "\u53EF\u9009 / \u8F6F\u8BFB\u53D6",
        subcontext: "\u5B50\u4F5C\u7528\u57DF",
        unknown: "\u5FC5\u9700\u6027\u672A\u77E5",
      };
      const Disclosure2 = createDisclosure(React3, h2);
      const table = (caption, headers, rows) =>
        h2(
          UI.Fold || Disclosure2,
          { key: caption, title: caption, count: `${rows.length} \u9879` },
          () =>
            h2(
              "table",
              { "aria-label": caption, className: "compat-relation-table" },
              h2("caption", null, `${caption} \xB7 ${rows.length} \u9879`),
              h2(
                "thead",
                null,
                h2(
                  "tr",
                  null,
                  ...headers.map((label, i) =>
                    h2("th", { key: i, scope: "col" }, label),
                  ),
                ),
              ),
              h2(
                "tbody",
                null,
                ...rows.map((row, i) =>
                  h2(
                    "tr",
                    { key: i },
                    ...row.map((cell, j) => h2("td", { key: j }, cell)),
                  ),
                ),
              ),
            ),
        );
      return function DependencyPanel2({ graph } = {}) {
        if (graph === void 0 || graph === null)
          return h2(
            "section",
            {
              "aria-label":
                "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
            },
            h2(
              "h3",
              null,
              "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
            ),
            h2(
              "p",
              null,
              "\u672C\u62A5\u544A\u672A\u63D0\u4F9B\u4F9D\u8D56\u5173\u7CFB\u89C6\u56FE\uFF1B\u8BF7\u91CD\u65B0\u4F53\u68C0\u3002",
            ),
          );
        let valid = false;
        try {
          valid =
            typeof GraphContract.validateDependencyGraph === "function" &&
            GraphContract.validateDependencyGraph(graph);
        } catch {}
        if (!valid)
          return h2(
            "section",
            {
              "aria-label":
                "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
            },
            h2(
              "h3",
              null,
              "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
            ),
            h2(
              "p",
              { role: "status" },
              "\u4F9D\u8D56\u5173\u7CFB\u89C6\u56FE\u4E0D\u53EF\u7528\uFF1A\u6269\u5C55\u6570\u636E\u683C\u5F0F\u6216\u5F15\u7528\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u4F53\u68C0\u3002\u517C\u5BB9\u7ED3\u8BBA\u4ECD\u6309\u539F\u59CB\u8BC1\u636E\u663E\u793A\u3002",
            ),
          );
        const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
        const name2 = (id) => nodes.get(id)?.name || id;
        const entries = (node) =>
          node.entries.length
            ? node.entries
                .map(
                  (row) =>
                    `${row.id || "\u672A\u547D\u540D\u6761\u76EE"}: ${row.disabled ? "disabled / \u5DF2\u7981\u7528" : row.state}`,
                )
                .join("\uFF1B")
            : "unknown / \u672A\u63D0\u4F9B loader \u6761\u76EE";
        const candidates = /* @__PURE__ */ new Map(),
          consumers = /* @__PURE__ */ new Map();
        for (const edge of graph.edges) {
          const map =
            edge.kind === "candidate-provider"
              ? candidates
              : edge.kind === "dependency"
                ? consumers
                : null;
          if (map) {
            if (!map.has(edge.to)) map.set(edge.to, []);
            map.get(edge.to).push(edge);
          }
        }
        const candidateLabel = (edge) =>
          `${name2(edge.from)} [${edge.side}; ${entries(nodes.get(edge.from))}]${edge.side === "unknown" ? "\uFF08\u7AEF\u672A\u77E5\uFF1B\u4E0D\u53C2\u4E0E\u4F20\u64AD\u63A8\u5BFC\uFF09" : ""}`;
        const source = (edge) =>
          edge.source?.file
            ? `${edge.source.file}${edge.source.line === null ? "" : ":" + edge.source.line}`
            : "\u6765\u6E90\u4F4D\u7F6E\u672A\u77E5";
        const relationshipRows = graph.edges
          .filter((edge) => edge.kind === "dependency")
          .map((edge) => {
            const known = candidates.get(edge.to) || [];
            const unknown =
              candidates.get(
                JSON.stringify(["service", "unknown", edge.service]),
              ) || [];
            const choices = [
              ...known,
              ...(edge.side === "unknown" ? [] : unknown),
            ];
            return [
              name2(edge.from),
              edge.service,
              edge.side,
              requirement[edge.requirement],
              choices.length
                ? choices.map(candidateLabel).join("\uFF1B")
                : "\u672A\u627E\u5230\u53EF\u5B9A\u4F4D\u7684\u5019\u9009\u63D0\u4F9B\u8005\uFF08\u4E0D\u7B49\u4E8E\u5BBF\u4E3B\u7F3A\u5931\uFF09",
              source(edge),
            ];
          });
        const providerRows = graph.edges
          .filter((edge) => edge.kind === "candidate-provider")
          .map((edge) => [
            candidateLabel(edge),
            edge.service,
            edge.side,
            (consumers.get(edge.to) || [])
              .map(
                (c) =>
                  `${name2(c.from)}\uFF08${requirement[c.requirement]}\uFF09`,
              )
              .join("\uFF1B") ||
              "\u6CA1\u6709\u540C\u7AEF\u6D88\u8D39\u8005\u8BC1\u636E",
            source(edge),
          ]);
        const packageRows = graph.edges
          .filter((edge) => edge.kind === "client-package-inject")
          .map((edge) => [
            name2(edge.from),
            name2(edge.to),
            "client \u5305\u7EA7 inject\uFF1B\u4E0D\u4F5C\u4E3A host \u670D\u52A1\u5173\u7CFB\u6216\u4F20\u64AD\u4F9D\u636E",
          ]);
        const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
        const pathLabel = (origin, path) => {
          const parts = [name2(origin)];
          for (let i = 0; i < path.length; i += 2) {
            const provider = edgeMap.get(path[i]),
              consumer = edgeMap.get(path[i + 1]);
            parts.push(
              `${provider.service} [${provider.side}]`,
              `${name2(consumer.from)}\uFF08${requirement[consumer.requirement]}\uFF09`,
            );
          }
          return parts.join(" \u2192 ");
        };
        const impactRows = graph.impacts.flatMap((impact) =>
          impact.affected.map((row) => [
            name2(impact.plugin),
            name2(row.plugin),
            row.side,
            "\u6F5C\u5728\u5F71\u54CD\uFF1B\u975E\u5B9E\u6D4B\u6545\u969C",
            pathLabel(impact.plugin, row.path),
          ]),
        );
        const cycleRows = graph.cycles.map((cycle) => [
          cycle.side,
          pathLabel(cycle.plugins[0], cycle.path),
          "\u6F5C\u5728\u58F0\u660E\u73AF\uFF1B\u4E0D\u636E\u6B64\u8BA4\u5B9A\u6302\u8D77\u6216\u5931\u8D25",
        ]);
        return h2(
          "section",
          {
            "aria-label":
              "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
          },
          h2(
            "h3",
            null,
            "\u4F9D\u8D56\u5173\u7CFB\u4E0E\u6F5C\u5728\u5F71\u54CD",
          ),
          ...graph.notes.map((note, i) => h2("p", { key: `note:${i}` }, note)),
          h2(
            "p",
            null,
            `\u5173\u7CFB\u8986\u76D6\uFF1A${graph.coverage.status === "complete" ? "\u5DF2\u8986\u76D6\u672C\u6B21\u63D0\u53D6\u8F93\u5165\uFF08\u4E0D\u7B49\u4E8E\u8FD0\u884C\u65F6\u5B8C\u6574\uFF09" : "\u6709\u9650"}${graph.coverage.truncated ? "\uFF1B\u5DF2\u622A\u65AD\uFF0C\u4E0D\u80FD\u5F53\u4F5C\u5168\u91CF\u5173\u7CFB\u6216\u5168\u91CF\u53D7\u5F71\u54CD\u8005" : ""}\u3002\u8282\u70B9 ${graph.nodes.length}\uFF0C\u5173\u7CFB ${graph.edges.length}\u3002`,
          ),
          ...graph.coverage.reasons.map((reason, i) =>
            h2(
              "p",
              { key: `reason:${i}`, role: "note" },
              `\u8986\u76D6\u9650\u5236\uFF1A${reason}`,
            ),
          ),
          table(
            "\u63D2\u4EF6\u53CA loader \u6761\u76EE",
            [
              "\u63D2\u4EF6",
              "\u5BBF\u4E3B\u6761\u76EE\u72B6\u6001\uFF08\u4E0D\u4EE3\u8868\u670D\u52A1\u72B6\u6001\uFF09",
              "Context \u540D\u79F0\u7EBF\u7D22\uFF08\u975E\u5B50\u4F5C\u7528\u57DF\u8BC1\u660E\uFF09",
            ],
            graph.nodes
              .filter((node) => node.kind === "plugin")
              .map((node) => [
                node.name,
                entries(node),
                node.subContexts
                  .filter((context) => context.names.length)
                  .map(
                    (context) =>
                      `${context.file || "\u4F4D\u7F6E\u672A\u77E5"}: ${context.names.join(", ")}`,
                  )
                  .join("\uFF1B") ||
                  "\u672A\u63D0\u53D6\u5230\u547D\u540D\u7EBF\u7D22",
              ]),
          ),
          relationshipRows.length
            ? table(
                "\u670D\u52A1\u4F9D\u8D56\u53CA\u5019\u9009\u63D0\u4F9B\u8005",
                [
                  "\u6D88\u8D39\u8005",
                  "\u670D\u52A1",
                  "\u7AEF",
                  "\u4F9D\u8D56\u65B9\u5F0F",
                  "\u5019\u9009\u63D0\u4F9B\u8005 / loader \u72B6\u6001",
                  "\u4F9D\u8D56\u6765\u6E90",
                ],
                relationshipRows,
              )
            : h2(
                "p",
                null,
                "\u672C\u6B21\u672A\u63D0\u53D6\u5230\u670D\u52A1\u4F9D\u8D56\uFF1B\u4E0D\u7B49\u4E8E\u6CA1\u6709\u8FD0\u884C\u65F6\u4F9D\u8D56\u3002",
              ),
          providerRows.length
            ? table(
                "\u63D0\u4F9B\u58F0\u660E\uFF08\u4EC5\u5019\u9009\uFF09",
                [
                  "\u5019\u9009\u63D2\u4EF6 / loader \u72B6\u6001",
                  "\u670D\u52A1",
                  "\u7AEF",
                  "\u540C\u7AEF\u6F5C\u5728\u6D88\u8D39\u8005",
                  "\u63D0\u4F9B\u6765\u6E90",
                ],
                providerRows,
              )
            : null,
          packageRows.length
            ? table(
                "\u5BA2\u6237\u7AEF\u5305\u4F9D\u8D56",
                [
                  "\u6D88\u8D39\u8005",
                  "\u5BA2\u6237\u7AEF\u5305",
                  "\u8BED\u4E49",
                ],
                packageRows,
              )
            : null,
          impactRows.length
            ? table(
                "\u6F5C\u5728\u53D7\u5F71\u54CD\u63D2\u4EF6\u53CA\u5173\u7CFB\u8DEF\u5F84",
                [
                  "\u5019\u9009\u8D77\u70B9",
                  "\u6F5C\u5728\u53D7\u5F71\u54CD\u8005",
                  "\u7AEF",
                  "\u8BC1\u636E\u8FB9\u754C",
                  "\u8DEF\u5F84",
                ],
                impactRows,
              )
            : h2(
                "p",
                null,
                "\u672A\u679A\u4E3E\u5230\u53EF\u8BC1\u660E\u540C\u7AEF\u7684\u4F20\u64AD\u8DEF\u5F84\uFF1B\u4E0D\u7B49\u4E8E\u6CA1\u6709\u6F5C\u5728\u5F71\u54CD\u3002",
              ),
          cycleRows.length
            ? table(
                "\u6F5C\u5728\u58F0\u660E\u73AF",
                ["\u7AEF", "\u5173\u7CFB\u8DEF\u5F84", "\u8BF4\u660E"],
                cycleRows,
              )
            : h2(
                "p",
                null,
                "\u672C\u6B21\u8986\u76D6\u5185\u672A\u679A\u4E3E\u5230\u58F0\u660E\u73AF\u3002",
              ),
          h2(
            "p",
            null,
            `\u9884\u7B97\uFF1A\u8282\u70B9 ${graph.coverage.limits.nodes}\uFF1B\u5173\u7CFB ${graph.coverage.limits.edges}\uFF1B\u4F20\u64AD\u904D\u5386\u53CA\u8DEF\u5F84 ${graph.coverage.limits.traversal}\uFF1B\u8F93\u5165\u6761\u76EE ${graph.coverage.limits.items}\u3002`,
          ),
        );
      };
    }
    function createFindingReviewPanel(React3, ReviewContract, UI = {}) {
      const h2 = (type, props, ...children) =>
          React3.createElement(UI[type] || type, props, ...children),
        labels = ReviewContract.REVIEW_STATUS_LABELS;
      function ReviewRow({ item, contextToken, onSave, disabled }) {
        const [status, setStatus] = React3.useState(
          item.record?.status || "pending",
        );
        const [note, setNote] = React3.useState(item.note || "");
        const [busy, setBusy] = React3.useState(false);
        const [error, setError] = React3.useState("");
        const [message, setMessage] = React3.useState("");
        const current = React3.useRef({
          contextToken,
          findingId: item.findingId,
        });
        current.current = { contextToken, findingId: item.findingId };
        React3.useEffect(() => {
          setStatus(item.record?.status || "pending");
          setNote(item.note || "");
          setError("");
          setMessage("");
        }, [contextToken, item.findingId, item.record?.updatedAt]);
        const save = async () => {
          if (busy || disabled) return;
          const target = { contextToken, findingId: item.findingId };
          try {
            const input = ReviewContract.validateReviewInput({
              ...target,
              status,
              note,
            });
            setBusy(true);
            setError("");
            setMessage("");
            await onSave(input);
            if (
              current.current.contextToken === target.contextToken &&
              current.current.findingId === target.findingId
            )
              setMessage("\u4EBA\u5DE5\u5904\u7F6E\u5DF2\u4FDD\u5B58");
          } catch (reason) {
            if (
              current.current.contextToken === target.contextToken &&
              current.current.findingId === target.findingId
            )
              setError(
                reason?.message ||
                  "\u4FDD\u5B58\u4EBA\u5DE5\u5904\u7F6E\u5931\u8D25",
              );
          } finally {
            setBusy(false);
          }
        };
        return h2(
          "article",
          {
            "data-review-finding": item.findingId,
            style: {
              border: "1px solid hsl(var(--dsc-border))",
              padding: "12px",
              marginBottom: "10px",
              borderRadius: "6px",
            },
          },
          h2(
            "strong",
            null,
            `${item.pluginName}@${item.pluginVersion} \xB7 \u53D1\u73B0 ${item.findingIndex + 1} \xB7 ${labels[item.status] || item.status}`,
          ),
          item.reviewReason
            ? h2("p", { role: "status" }, item.reviewReason)
            : null,
          item.record
            ? h2(
                "p",
                null,
                `\u539F\u8BB0\u5F55\uFF1A${labels[item.record.status]} \xB7 ${item.record.updatedAt} \xB7 ${item.record.note}`,
              )
            : null,
          item.history?.length
            ? h2(
                "details",
                null,
                h2(
                  "summary",
                  null,
                  `\u65E7\u5904\u7F6E\u6458\u8981\uFF08${item.historyCount || item.history.length}\uFF1B\u5B8C\u6574\u4F9D\u636E\u89C1\u5386\u53F2\u5904\u7F6E\uFF09`,
                ),
                item.history.map((record3) =>
                  h2(
                    "p",
                    { key: record3.findingId },
                    `${record3.pluginName}@${record3.pluginVersion} \xB7 ${labels[record3.status]} \xB7 ${record3.updatedAt} \xB7 ${record3.note}${record3.noteTruncated ? "\u2026" : ""}`,
                  ),
                ),
              )
            : null,
          h2(
            "label",
            null,
            "\u4EBA\u5DE5\u72B6\u6001 ",
            h2(
              "select",
              {
                "aria-label": `${item.pluginName} \u53D1\u73B0 ${item.findingIndex + 1} \u4EBA\u5DE5\u72B6\u6001`,
                value: status,
                disabled: busy || disabled,
                onChange: (e) => {
                  setStatus(e.target.value);
                  setMessage("");
                },
              },
              Object.keys(labels)
                .filter((x) => x !== "needs-review")
                .map((value) =>
                  h2("option", { key: value, value }, labels[value]),
                ),
            ),
          ),
          h2(
            "label",
            { style: { display: "block", marginTop: "8px" } },
            "\u6838\u5B9E\u4F9D\u636E ",
            h2("textarea", {
              "aria-label": `${item.pluginName} \u53D1\u73B0 ${item.findingIndex + 1} \u6838\u5B9E\u4F9D\u636E`,
              value: note,
              maxLength: ReviewContract.REVIEW_LIMITS.note,
              disabled: busy || disabled,
              rows: 3,
              style: { display: "block", width: "100%" },
              onChange: (e) => {
                setNote(e.target.value);
                setMessage("");
              },
            }),
          ),
          h2(
            "button",
            { type: "button", disabled: busy || disabled, onClick: save },
            busy
              ? "\u4FDD\u5B58\u4E2D\u2026"
              : "\u4FDD\u5B58\u4EBA\u5DE5\u5904\u7F6E",
          ),
          error ? h2("p", { role: "alert" }, error) : null,
          message ? h2("p", { role: "status" }, message) : null,
        );
      }
      return function FindingReviewPanel2({
        report: report2,
        reviews,
        onSave,
      }) {
        const [saved, setSaved] = React3.useState(null);
        const [limit, setLimit] = React3.useState(20);
        const [historyOpen, setHistoryOpen] = React3.useState(false);
        const [historyLimit, setHistoryLimit] = React3.useState(20);
        const current = React3.useRef(reviews?.contextToken);
        current.current = reviews?.contextToken;
        React3.useEffect(() => {
          setSaved(null);
          setLimit(20);
          setHistoryOpen(false);
          setHistoryLimit(20);
        }, [reviews?.contextToken, reviews?.revision]);
        const active =
          saved && saved.contextToken === reviews?.contextToken
            ? saved
            : reviews;
        if (active == null) return null;
        if (!ReviewContract.validateReviewEnvelope(active, report2))
          return h2(
            "section",
            {
              "aria-label": "\u53D1\u73B0\u7684\u4EBA\u5DE5\u5904\u7F6E",
              style: { marginTop: "16px" },
            },
            h2("h3", null, "\u53D1\u73B0\u7684\u4EBA\u5DE5\u5904\u7F6E"),
            h2(
              "p",
              { role: "alert" },
              "\u4EBA\u5DE5\u5904\u7F6E\u6570\u636E\u65E0\u6548\uFF0C\u672C\u8282\u6682\u4E0D\u53EF\u7528\uFF1B\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
            ),
          );
        const save = async (input) => {
          const result = await onSave(input),
            next = result?.reviews || result;
          if (!ReviewContract.validateReviewEnvelope(next, report2))
            throw new Error("\u4FDD\u5B58\u54CD\u5E94\u65E0\u6548");
          if (next.error) throw new Error(next.error);
          if (
            current.current !== input.contextToken ||
            next.contextToken !== input.contextToken
          )
            throw new Error(
              "\u62A5\u544A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5B9E",
            );
          setSaved(next);
          return next;
        };
        const items = (active.items || []).filter(
          (item) =>
            !report2?.plugins ||
            Object.hasOwn(report2.plugins, item.pluginName),
        );
        return h2(
          "section",
          {
            "aria-label": "\u53D1\u73B0\u7684\u4EBA\u5DE5\u5904\u7F6E",
            style: { marginTop: "16px" },
          },
          h2("h3", null, "\u53D1\u73B0\u7684\u4EBA\u5DE5\u5904\u7F6E"),
          h2(
            "p",
            null,
            "\u4EBA\u5DE5\u8BB0\u5F55\u4EC5\u4F9B\u6838\u5B9E\u8FFD\u8E2A\uFF0C\u4E0D\u6539\u53D8\u5185\u6838\u53D1\u73B0\u3001\u603B\u7ED3\u8BBA\u3001\u9000\u51FA\u7801\u3001\u57FA\u7EBF\u6216\u517C\u5BB9\u6027\u8C41\u514D\uFF1B\u65B0\u98CE\u9669\u4ECD\u5B8C\u6574\u663E\u793A\u3002",
          ),
          active.error ? h2("p", { role: "alert" }, active.error) : null,
          items.length
            ? items.slice(0, limit).map((item) =>
                h2(ReviewRow, {
                  key: item.findingId,
                  item,
                  contextToken: active.contextToken,
                  onSave: save,
                  disabled: !!active.error || typeof onSave !== "function",
                }),
              )
            : h2(
                "p",
                null,
                "\u5F53\u524D\u6CA1\u6709\u53EF\u5904\u7F6E\u7684\u53D1\u73B0\u3002",
              ),
          items.length > limit
            ? h2(
                "button",
                { type: "button", onClick: () => setLimit((n) => n + 20) },
                `\u663E\u793A\u66F4\u591A\u5904\u7F6E\uFF08\u5DF2\u663E\u793A ${Math.min(limit, items.length)} / ${items.length}\uFF09`,
              )
            : null,
          active.history?.length
            ? h2(
                "details",
                {
                  open: historyOpen,
                  onToggle: (e) => setHistoryOpen(e.target.open),
                },
                h2(
                  "summary",
                  null,
                  `\u5386\u53F2\u5904\u7F6E\u5B8C\u6574\u4F9D\u636E\uFF08${active.history.length}\uFF09`,
                ),
                historyOpen
                  ? active.history
                      .slice(0, historyLimit)
                      .map((record3) =>
                        h2(
                          "p",
                          { key: record3.findingId },
                          `${record3.pluginName}@${record3.pluginVersion} \xB7 ${labels[record3.status]} \xB7 ${record3.updatedAt} \xB7 ${record3.note}`,
                        ),
                      )
                  : null,
                historyOpen && active.history.length > historyLimit
                  ? h2(
                      "button",
                      {
                        type: "button",
                        onClick: () => setHistoryLimit((n) => n + 20),
                      },
                      "\u663E\u793A\u66F4\u591A\u5386\u53F2\u5904\u7F6E",
                    )
                  : null,
              )
            : null,
        );
      };
    }
    function createFunctionalHealthPanel(React3, HealthContract, UI = {}) {
      const h2 = (type, props, ...children) =>
        React3.createElement(UI[type] || type, props, ...children);
      const Disclosure2 = createDisclosure(React3, h2);
      const statusLabels = {
        "tested-pass": "\u6240\u9009\u68C0\u67E5\u901A\u8FC7",
        "tested-failed": "\u6240\u9009\u68C0\u67E5\u5931\u8D25",
        error: "\u68C0\u67E5\u672A\u5B8C\u6210",
        pass: "\u901A\u8FC7",
        failed: "\u5931\u8D25",
      };
      return function FunctionalHealthPanel2({ report: report2 }) {
        const [result, setResult] = React3.useState(null);
        const [error, setError] = React3.useState("");
        const [busy, setBusy] = React3.useState(false);
        const request = React3.useRef(0);
        React3.useEffect(
          () => () => {
            request.current++;
          },
          [],
        );
        const load = async (event) => {
          const file = event.target.files?.[0],
            id = ++request.current;
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            if (
              !Number.isSafeInteger(file.size) ||
              file.size < 1 ||
              file.size > 512 * 1024
            )
              throw new Error(
                "\u8BB0\u5F55\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\uFF08512 KiB\uFF09",
              );
            const parsed = JSON.parse(await file.text());
            const checked =
              HealthContract.validateFunctionalHealthResult(parsed);
            if (!checked.valid) throw new Error(checked.errors.join("\uFF1B"));
            if (
              !globalThis.crypto?.subtle ||
              typeof TextEncoder === "undefined"
            )
              throw new Error(
                "\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u6838\u9A8C\u8BB0\u5F55\u6458\u8981",
              );
            const bytes = new TextEncoder().encode(
              HealthContract.canonicalFunctionalManifest(parsed.declaration),
            );
            const digest2 = Array.from(
              new Uint8Array(
                await globalThis.crypto.subtle.digest("SHA-256", bytes),
              ),
              (n) => n.toString(16).padStart(2, "0"),
            ).join("");
            if (digest2 !== parsed.identity.manifestSha256)
              throw new Error(
                "\u68C0\u67E5\u58F0\u660E\u4E0E\u8BB0\u5F55\u6458\u8981\u4E0D\u4E00\u81F4",
              );
            if (request.current === id) setResult(parsed);
          } catch (reason) {
            if (request.current === id)
              setError(
                "\u5BFC\u5165\u5931\u8D25\uFF1A" + (reason?.message || reason),
              );
          } finally {
            if (request.current === id) setBusy(false);
          }
        };
        const artifact = result?.identity.artifact,
          current = artifact && report2?.plugins?.[artifact.name];
        const versionsMatch =
          current?.version === artifact?.version &&
          report2?.dshVersion === result?.identity.dshVersion;
        return h2(
          "section",
          {
            "aria-label": "\u529F\u80FD\u5065\u5EB7\u68C0\u67E5",
            style: { marginTop: "16px" },
          },
          h2(
            "h3",
            null,
            "\u529F\u80FD\u5065\u5EB7\u68C0\u67E5\uFF08\u72EC\u7ACB\u5B9E\u6D4B\u8BB0\u5F55\uFF09",
          ),
          h2(
            "p",
            null,
            "\u5728\u4ED3\u5E93CLI\u4E2D\u663E\u5F0F\u8FD0\u884C\u6240\u9009HTTP/DOM\u68C0\u67E5\u540E\uFF0C\u53EF\u5BFC\u5165JSON\u8BB0\u5F55\u3002\u672C\u9762\u677F\u53EA\u8BFB\u53D6\u6240\u9009\u6587\u4EF6\uFF0C\u4E0D\u6267\u884C\u68C0\u67E5\u3001\u5B89\u88C5\u63D2\u4EF6\u6216\u8BBF\u95EE\u76EE\u6807\u670D\u52A1\u3002",
          ),
          h2("input", {
            type: "file",
            accept: ".json,application/json",
            "aria-label":
              "\u5BFC\u5165\u529F\u80FD\u5065\u5EB7\u68C0\u67E5\u8BB0\u5F55",
            disabled: busy,
            onChange: load,
          }),
          busy
            ? h2(
                "p",
                { role: "status" },
                "\u6B63\u5728\u6838\u9A8C\u8BB0\u5F55\u2026",
              )
            : null,
          error ? h2("p", { role: "alert" }, error) : null,
          !result
            ? h2(
                "p",
                null,
                "\u5C1A\u672A\u5BFC\u5165\u529F\u80FD\u5B9E\u6D4B\u8BB0\u5F55\u3002\u9759\u6001\u53D1\u73B0\u3001\u5BBF\u4E3B\u72B6\u6001\u548C\u4E1A\u52A1\u5065\u5EB7\u662F\u4E0D\u540C\u8BC1\u636E\u3002",
              )
            : h2(
                "div",
                { "data-functional-health": result.status },
                h2(
                  "p",
                  null,
                  `${artifact.name}@${artifact.version} \xB7 DSH ${result.identity.dshVersion} \xB7 ${statusLabels[result.status]}`,
                ),
                h2(
                  "p",
                  { role: "status" },
                  versionsMatch
                    ? "\u63D2\u4EF6\u4E0EDSH\u7248\u672C\u76F8\u7B26\uFF1B\u5F53\u524D\u5B89\u88C5\u5236\u54C1\u5C1A\u672A\u6838\u9A8C\uFF0C\u6B64\u5904\u4FDD\u7559\u6240\u9009\u5236\u54C1\u7684\u5386\u53F2\u8BB0\u5F55\u3002"
                    : "\u8BB0\u5F55\u4E0E\u5F53\u524D\u62A5\u544A\u76EE\u6807\u4E0D\u4E00\u81F4\u6216\u63D2\u4EF6\u672A\u5B89\u88C5\uFF1B\u4E0D\u7528\u4E8E\u8BA4\u8BC1\u5F53\u524D\u76EE\u6807\u3002",
                ),
                h2(
                  "p",
                  null,
                  "\u6D4B\u91CF\u65F6\u95F4\uFF1A" +
                    result.startedAt +
                    " \u2192 " +
                    result.completedAt,
                ),
                h2("p", null, "\u5236\u54C1 SHA-256\uFF1A" + artifact.sha256),
                h2(
                  "p",
                  null,
                  "\u58F0\u660E SHA-256\uFF1A" +
                    result.identity.manifestSha256 +
                    "\uFF1B\u6458\u8981\u6821\u9A8C\u4E0D\u662F\u4F5C\u8005\u7B7E\u540D\u6216\u4E1A\u52A1\u8BA4\u8BC1\u3002",
                ),
                h2(
                  UI.Fold || Disclosure2,
                  {
                    title: "\u529F\u80FD\u5065\u5EB7\u68C0\u67E5\u7ED3\u679C",
                    count: `${result.checks.length} \u9879`,
                  },
                  () =>
                    h2(
                      "table",
                      {
                        "aria-label":
                          "\u529F\u80FD\u5065\u5EB7\u68C0\u67E5\u7ED3\u679C",
                      },
                      h2(
                        "thead",
                        null,
                        h2(
                          "tr",
                          null,
                          h2("th", null, "\u68C0\u67E5\u4E0E\u58F0\u660E"),
                          h2("th", null, "\u72EC\u7ACB\u5B9E\u6D4B"),
                        ),
                      ),
                      h2(
                        "tbody",
                        null,
                        result.checks.map((check, i) => {
                          const declaration = result.declaration.checks[i],
                            expected =
                              declaration.type === "http"
                                ? `GET ${declaration.path}\uFF0CHTTP ${declaration.status}` +
                                  (declaration.json
                                    ? `\uFF0CJSON ${declaration.json.pointer} = ${JSON.stringify(declaration.json.equals)}`
                                    : "")
                                : `${declaration.path} \xB7 ${declaration.selector} \xB7 \u6570\u91CF ${declaration.minCount}\u2013${declaration.maxCount}`;
                          return h2(
                            "tr",
                            { key: check.id },
                            h2("td", null, `${check.id} \xB7 ${expected}`),
                            h2(
                              "td",
                              null,
                              `${statusLabels[check.status] || check.status} \xB7 ${JSON.stringify(check.evidence)}`,
                            ),
                          );
                        }),
                      ),
                    ),
                ),
                result.error ? h2("p", { role: "alert" }, result.error) : null,
                h2(
                  "p",
                  null,
                  "\u8D44\u6E90\u6E05\u7406\uFF1A" +
                    (result.cleanup.stopped && result.cleanup.removed
                      ? "\u5DF2\u505C\u6B62\u5E76\u6E05\u7406\u81EA\u6709\u73AF\u5883"
                      : "\u672A\u786E\u8BA4\u5B8C\u6574\u6E05\u7406"),
                ),
                h2(
                  "ul",
                  null,
                  result.limitations.map((text3, i) =>
                    h2("li", { key: i }, text3),
                  ),
                ),
                h2(
                  "p",
                  null,
                  "\u4EC5\u8BC1\u660E\u8BB0\u5F55\u4E2D\u7684\u6240\u9009\u68C0\u67E5\u7ED3\u679C\uFF0C\u4E0D\u6539\u666E\u901A\u517C\u5BB9\u6027\u7ED3\u8BBA\u3001\u98CE\u9669\u8BA1\u6570\u3001\u57FA\u7EBF\u6216\u4EBA\u5DE5\u5904\u7F6E\uFF1B\u4E0D\u8BA4\u8BC1\u5168\u90E8\u4E1A\u52A1\u3002",
                ),
                h2(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      request.current++;
                      setResult(null);
                      setError("");
                      setBusy(false);
                    },
                  },
                  "\u6E05\u9664\u5065\u5EB7\u68C0\u67E5\u8BB0\u5F55",
                ),
              ),
        );
      };
    }

    // plugin/src/components/ui/index.jsx
    var React = __toESM(require("react"), 1);

    // node_modules/clsx/dist/clsx.mjs
    function r(e) {
      var t,
        f,
        n = "";
      if ("string" == typeof e || "number" == typeof e) n += e;
      else if ("object" == typeof e)
        if (Array.isArray(e)) {
          var o = e.length;
          for (t = 0; t < o; t++)
            e[t] && (f = r(e[t])) && (n && (n += " "), (n += f));
        } else for (f in e) e[f] && (n && (n += " "), (n += f));
      return n;
    }
    function clsx() {
      for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++)
        (e = arguments[f]) && (t = r(e)) && (n && (n += " "), (n += t));
      return n;
    }

    // node_modules/class-variance-authority/dist/index.mjs
    var falsyToString = (value) =>
      typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
    var cx = clsx;
    var cva = (base, config) => (props) => {
      var _config_compoundVariants;
      if (
        (config === null || config === void 0 ? void 0 : config.variants) ==
        null
      )
        return cx(
          base,
          props === null || props === void 0 ? void 0 : props.class,
          props === null || props === void 0 ? void 0 : props.className,
        );
      const { variants, defaultVariants } = config;
      const getVariantClassNames = Object.keys(variants).map((variant) => {
        const variantProp =
          props === null || props === void 0 ? void 0 : props[variant];
        const defaultVariantProp =
          defaultVariants === null || defaultVariants === void 0
            ? void 0
            : defaultVariants[variant];
        if (variantProp === null) return null;
        const variantKey =
          falsyToString(variantProp) || falsyToString(defaultVariantProp);
        return variants[variant][variantKey];
      });
      const propsWithoutUndefined =
        props &&
        Object.entries(props).reduce((acc, param) => {
          let [key, value] = param;
          if (value === void 0) {
            return acc;
          }
          acc[key] = value;
          return acc;
        }, {});
      const getCompoundVariantClassNames =
        config === null || config === void 0
          ? void 0
          : (_config_compoundVariants = config.compoundVariants) === null ||
              _config_compoundVariants === void 0
            ? void 0
            : _config_compoundVariants.reduce((acc, param) => {
                let {
                  class: cvClass,
                  className: cvClassName,
                  ...compoundVariantOptions
                } = param;
                return Object.entries(compoundVariantOptions).every(
                  (param2) => {
                    let [key, value] = param2;
                    return Array.isArray(value)
                      ? value.includes(
                          {
                            ...defaultVariants,
                            ...propsWithoutUndefined,
                          }[key],
                        )
                      : {
                          ...defaultVariants,
                          ...propsWithoutUndefined,
                        }[key] === value;
                  },
                )
                  ? [...acc, cvClass, cvClassName]
                  : acc;
              }, []);
      return cx(
        base,
        getVariantClassNames,
        getCompoundVariantClassNames,
        props === null || props === void 0 ? void 0 : props.class,
        props === null || props === void 0 ? void 0 : props.className,
      );
    };

    // node_modules/tailwind-merge/dist/bundle-mjs.mjs
    var CLASS_PART_SEPARATOR = "-";
    var createClassGroupUtils = (config) => {
      const classMap = createClassMap(config);
      const { conflictingClassGroups, conflictingClassGroupModifiers } = config;
      const getClassGroupId = (className) => {
        const classParts = className.split(CLASS_PART_SEPARATOR);
        if (classParts[0] === "" && classParts.length !== 1) {
          classParts.shift();
        }
        return (
          getGroupRecursive(classParts, classMap) ||
          getGroupIdForArbitraryProperty(className)
        );
      };
      const getConflictingClassGroupIds = (
        classGroupId,
        hasPostfixModifier,
      ) => {
        const conflicts = conflictingClassGroups[classGroupId] || [];
        if (
          hasPostfixModifier &&
          conflictingClassGroupModifiers[classGroupId]
        ) {
          return [
            ...conflicts,
            ...conflictingClassGroupModifiers[classGroupId],
          ];
        }
        return conflicts;
      };
      return {
        getClassGroupId,
        getConflictingClassGroupIds,
      };
    };
    var getGroupRecursive = (classParts, classPartObject) => {
      if (classParts.length === 0) {
        return classPartObject.classGroupId;
      }
      const currentClassPart = classParts[0];
      const nextClassPartObject =
        classPartObject.nextPart.get(currentClassPart);
      const classGroupFromNextClassPart = nextClassPartObject
        ? getGroupRecursive(classParts.slice(1), nextClassPartObject)
        : void 0;
      if (classGroupFromNextClassPart) {
        return classGroupFromNextClassPart;
      }
      if (classPartObject.validators.length === 0) {
        return void 0;
      }
      const classRest = classParts.join(CLASS_PART_SEPARATOR);
      return classPartObject.validators.find(({ validator }) =>
        validator(classRest),
      )?.classGroupId;
    };
    var arbitraryPropertyRegex = /^\[(.+)\]$/;
    var getGroupIdForArbitraryProperty = (className) => {
      if (arbitraryPropertyRegex.test(className)) {
        const arbitraryPropertyClassName =
          arbitraryPropertyRegex.exec(className)[1];
        const property = arbitraryPropertyClassName?.substring(
          0,
          arbitraryPropertyClassName.indexOf(":"),
        );
        if (property) {
          return "arbitrary.." + property;
        }
      }
    };
    var createClassMap = (config) => {
      const { theme, prefix } = config;
      const classMap = {
        nextPart: /* @__PURE__ */ new Map(),
        validators: [],
      };
      const prefixedClassGroupEntries = getPrefixedClassGroupEntries(
        Object.entries(config.classGroups),
        prefix,
      );
      prefixedClassGroupEntries.forEach(([classGroupId, classGroup]) => {
        processClassesRecursively(classGroup, classMap, classGroupId, theme);
      });
      return classMap;
    };
    var processClassesRecursively = (
      classGroup,
      classPartObject,
      classGroupId,
      theme,
    ) => {
      classGroup.forEach((classDefinition) => {
        if (typeof classDefinition === "string") {
          const classPartObjectToEdit =
            classDefinition === ""
              ? classPartObject
              : getPart(classPartObject, classDefinition);
          classPartObjectToEdit.classGroupId = classGroupId;
          return;
        }
        if (typeof classDefinition === "function") {
          if (isThemeGetter(classDefinition)) {
            processClassesRecursively(
              classDefinition(theme),
              classPartObject,
              classGroupId,
              theme,
            );
            return;
          }
          classPartObject.validators.push({
            validator: classDefinition,
            classGroupId,
          });
          return;
        }
        Object.entries(classDefinition).forEach(([key, classGroup2]) => {
          processClassesRecursively(
            classGroup2,
            getPart(classPartObject, key),
            classGroupId,
            theme,
          );
        });
      });
    };
    var getPart = (classPartObject, path) => {
      let currentClassPartObject = classPartObject;
      path.split(CLASS_PART_SEPARATOR).forEach((pathPart) => {
        if (!currentClassPartObject.nextPart.has(pathPart)) {
          currentClassPartObject.nextPart.set(pathPart, {
            nextPart: /* @__PURE__ */ new Map(),
            validators: [],
          });
        }
        currentClassPartObject = currentClassPartObject.nextPart.get(pathPart);
      });
      return currentClassPartObject;
    };
    var isThemeGetter = (func) => func.isThemeGetter;
    var getPrefixedClassGroupEntries = (classGroupEntries, prefix) => {
      if (!prefix) {
        return classGroupEntries;
      }
      return classGroupEntries.map(([classGroupId, classGroup]) => {
        const prefixedClassGroup = classGroup.map((classDefinition) => {
          if (typeof classDefinition === "string") {
            return prefix + classDefinition;
          }
          if (typeof classDefinition === "object") {
            return Object.fromEntries(
              Object.entries(classDefinition).map(([key, value]) => [
                prefix + key,
                value,
              ]),
            );
          }
          return classDefinition;
        });
        return [classGroupId, prefixedClassGroup];
      });
    };
    var createLruCache = (maxCacheSize) => {
      if (maxCacheSize < 1) {
        return {
          get: () => void 0,
          set: () => {},
        };
      }
      let cacheSize = 0;
      let cache = /* @__PURE__ */ new Map();
      let previousCache = /* @__PURE__ */ new Map();
      const update = (key, value) => {
        cache.set(key, value);
        cacheSize++;
        if (cacheSize > maxCacheSize) {
          cacheSize = 0;
          previousCache = cache;
          cache = /* @__PURE__ */ new Map();
        }
      };
      return {
        get(key) {
          let value = cache.get(key);
          if (value !== void 0) {
            return value;
          }
          if ((value = previousCache.get(key)) !== void 0) {
            update(key, value);
            return value;
          }
        },
        set(key, value) {
          if (cache.has(key)) {
            cache.set(key, value);
          } else {
            update(key, value);
          }
        },
      };
    };
    var IMPORTANT_MODIFIER = "!";
    var createParseClassName = (config) => {
      const { separator, experimentalParseClassName } = config;
      const isSeparatorSingleCharacter = separator.length === 1;
      const firstSeparatorCharacter = separator[0];
      const separatorLength = separator.length;
      const parseClassName = (className) => {
        const modifiers = [];
        let bracketDepth = 0;
        let modifierStart = 0;
        let postfixModifierPosition;
        for (let index = 0; index < className.length; index++) {
          let currentCharacter = className[index];
          if (bracketDepth === 0) {
            if (
              currentCharacter === firstSeparatorCharacter &&
              (isSeparatorSingleCharacter ||
                className.slice(index, index + separatorLength) === separator)
            ) {
              modifiers.push(className.slice(modifierStart, index));
              modifierStart = index + separatorLength;
              continue;
            }
            if (currentCharacter === "/") {
              postfixModifierPosition = index;
              continue;
            }
          }
          if (currentCharacter === "[") {
            bracketDepth++;
          } else if (currentCharacter === "]") {
            bracketDepth--;
          }
        }
        const baseClassNameWithImportantModifier =
          modifiers.length === 0
            ? className
            : className.substring(modifierStart);
        const hasImportantModifier =
          baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER);
        const baseClassName = hasImportantModifier
          ? baseClassNameWithImportantModifier.substring(1)
          : baseClassNameWithImportantModifier;
        const maybePostfixModifierPosition =
          postfixModifierPosition && postfixModifierPosition > modifierStart
            ? postfixModifierPosition - modifierStart
            : void 0;
        return {
          modifiers,
          hasImportantModifier,
          baseClassName,
          maybePostfixModifierPosition,
        };
      };
      if (experimentalParseClassName) {
        return (className) =>
          experimentalParseClassName({
            className,
            parseClassName,
          });
      }
      return parseClassName;
    };
    var sortModifiers = (modifiers) => {
      if (modifiers.length <= 1) {
        return modifiers;
      }
      const sortedModifiers = [];
      let unsortedModifiers = [];
      modifiers.forEach((modifier) => {
        const isArbitraryVariant = modifier[0] === "[";
        if (isArbitraryVariant) {
          sortedModifiers.push(...unsortedModifiers.sort(), modifier);
          unsortedModifiers = [];
        } else {
          unsortedModifiers.push(modifier);
        }
      });
      sortedModifiers.push(...unsortedModifiers.sort());
      return sortedModifiers;
    };
    var createConfigUtils = (config) => ({
      cache: createLruCache(config.cacheSize),
      parseClassName: createParseClassName(config),
      ...createClassGroupUtils(config),
    });
    var SPLIT_CLASSES_REGEX = /\s+/;
    var mergeClassList = (classList, configUtils) => {
      const { parseClassName, getClassGroupId, getConflictingClassGroupIds } =
        configUtils;
      const classGroupsInConflict = [];
      const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
      let result = "";
      for (let index = classNames.length - 1; index >= 0; index -= 1) {
        const originalClassName = classNames[index];
        const {
          modifiers,
          hasImportantModifier,
          baseClassName,
          maybePostfixModifierPosition,
        } = parseClassName(originalClassName);
        let hasPostfixModifier = Boolean(maybePostfixModifierPosition);
        let classGroupId = getClassGroupId(
          hasPostfixModifier
            ? baseClassName.substring(0, maybePostfixModifierPosition)
            : baseClassName,
        );
        if (!classGroupId) {
          if (!hasPostfixModifier) {
            result =
              originalClassName + (result.length > 0 ? " " + result : result);
            continue;
          }
          classGroupId = getClassGroupId(baseClassName);
          if (!classGroupId) {
            result =
              originalClassName + (result.length > 0 ? " " + result : result);
            continue;
          }
          hasPostfixModifier = false;
        }
        const variantModifier = sortModifiers(modifiers).join(":");
        const modifierId = hasImportantModifier
          ? variantModifier + IMPORTANT_MODIFIER
          : variantModifier;
        const classId = modifierId + classGroupId;
        if (classGroupsInConflict.includes(classId)) {
          continue;
        }
        classGroupsInConflict.push(classId);
        const conflictGroups = getConflictingClassGroupIds(
          classGroupId,
          hasPostfixModifier,
        );
        for (let i = 0; i < conflictGroups.length; ++i) {
          const group = conflictGroups[i];
          classGroupsInConflict.push(modifierId + group);
        }
        result =
          originalClassName + (result.length > 0 ? " " + result : result);
      }
      return result;
    };
    function twJoin() {
      let index = 0;
      let argument;
      let resolvedValue;
      let string = "";
      while (index < arguments.length) {
        if ((argument = arguments[index++])) {
          if ((resolvedValue = toValue(argument))) {
            string && (string += " ");
            string += resolvedValue;
          }
        }
      }
      return string;
    }
    var toValue = (mix) => {
      if (typeof mix === "string") {
        return mix;
      }
      let resolvedValue;
      let string = "";
      for (let k = 0; k < mix.length; k++) {
        if (mix[k]) {
          if ((resolvedValue = toValue(mix[k]))) {
            string && (string += " ");
            string += resolvedValue;
          }
        }
      }
      return string;
    };
    function createTailwindMerge(createConfigFirst, ...createConfigRest) {
      let configUtils;
      let cacheGet;
      let cacheSet;
      let functionToCall = initTailwindMerge;
      function initTailwindMerge(classList) {
        const config = createConfigRest.reduce(
          (previousConfig, createConfigCurrent) =>
            createConfigCurrent(previousConfig),
          createConfigFirst(),
        );
        configUtils = createConfigUtils(config);
        cacheGet = configUtils.cache.get;
        cacheSet = configUtils.cache.set;
        functionToCall = tailwindMerge;
        return tailwindMerge(classList);
      }
      function tailwindMerge(classList) {
        const cachedResult = cacheGet(classList);
        if (cachedResult) {
          return cachedResult;
        }
        const result = mergeClassList(classList, configUtils);
        cacheSet(classList, result);
        return result;
      }
      return function callTailwindMerge() {
        return functionToCall(twJoin.apply(null, arguments));
      };
    }
    var fromTheme = (key) => {
      const themeGetter = (theme) => theme[key] || [];
      themeGetter.isThemeGetter = true;
      return themeGetter;
    };
    var arbitraryValueRegex = /^\[(?:([a-z-]+):)?(.+)\]$/i;
    var fractionRegex = /^\d+\/\d+$/;
    var stringLengths = /* @__PURE__ */ new Set(["px", "full", "screen"]);
    var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
    var lengthUnitRegex =
      /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
    var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch))\(.+\)$/;
    var shadowRegex =
      /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
    var imageRegex =
      /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
    var isLength = (value) =>
      isNumber(value) || stringLengths.has(value) || fractionRegex.test(value);
    var isArbitraryLength = (value) =>
      getIsArbitraryValue(value, "length", isLengthOnly);
    var isNumber = (value) => Boolean(value) && !Number.isNaN(Number(value));
    var isArbitraryNumber = (value) =>
      getIsArbitraryValue(value, "number", isNumber);
    var isInteger = (value) =>
      Boolean(value) && Number.isInteger(Number(value));
    var isPercent = (value) =>
      value.endsWith("%") && isNumber(value.slice(0, -1));
    var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
    var isTshirtSize = (value) => tshirtUnitRegex.test(value);
    var sizeLabels = /* @__PURE__ */ new Set(["length", "size", "percentage"]);
    var isArbitrarySize = (value) =>
      getIsArbitraryValue(value, sizeLabels, isNever);
    var isArbitraryPosition = (value) =>
      getIsArbitraryValue(value, "position", isNever);
    var imageLabels = /* @__PURE__ */ new Set(["image", "url"]);
    var isArbitraryImage = (value) =>
      getIsArbitraryValue(value, imageLabels, isImage);
    var isArbitraryShadow = (value) => getIsArbitraryValue(value, "", isShadow);
    var isAny = () => true;
    var getIsArbitraryValue = (value, label, testValue) => {
      const result = arbitraryValueRegex.exec(value);
      if (result) {
        if (result[1]) {
          return typeof label === "string"
            ? result[1] === label
            : label.has(result[1]);
        }
        return testValue(result[2]);
      }
      return false;
    };
    var isLengthOnly = (value) =>
      // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
      // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
      // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
      lengthUnitRegex.test(value) && !colorFunctionRegex.test(value);
    var isNever = () => false;
    var isShadow = (value) => shadowRegex.test(value);
    var isImage = (value) => imageRegex.test(value);
    var getDefaultConfig = () => {
      const colors = fromTheme("colors");
      const spacing = fromTheme("spacing");
      const blur = fromTheme("blur");
      const brightness = fromTheme("brightness");
      const borderColor = fromTheme("borderColor");
      const borderRadius = fromTheme("borderRadius");
      const borderSpacing = fromTheme("borderSpacing");
      const borderWidth = fromTheme("borderWidth");
      const contrast = fromTheme("contrast");
      const grayscale = fromTheme("grayscale");
      const hueRotate = fromTheme("hueRotate");
      const invert = fromTheme("invert");
      const gap = fromTheme("gap");
      const gradientColorStops = fromTheme("gradientColorStops");
      const gradientColorStopPositions = fromTheme(
        "gradientColorStopPositions",
      );
      const inset = fromTheme("inset");
      const margin = fromTheme("margin");
      const opacity = fromTheme("opacity");
      const padding = fromTheme("padding");
      const saturate = fromTheme("saturate");
      const scale = fromTheme("scale");
      const sepia = fromTheme("sepia");
      const skew = fromTheme("skew");
      const space = fromTheme("space");
      const translate = fromTheme("translate");
      const getOverscroll = () => ["auto", "contain", "none"];
      const getOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
      const getSpacingWithAutoAndArbitrary = () => [
        "auto",
        isArbitraryValue,
        spacing,
      ];
      const getSpacingWithArbitrary = () => [isArbitraryValue, spacing];
      const getLengthWithEmptyAndArbitrary = () => [
        "",
        isLength,
        isArbitraryLength,
      ];
      const getNumberWithAutoAndArbitrary = () => [
        "auto",
        isNumber,
        isArbitraryValue,
      ];
      const getPositions = () => [
        "bottom",
        "center",
        "left",
        "left-bottom",
        "left-top",
        "right",
        "right-bottom",
        "right-top",
        "top",
      ];
      const getLineStyles = () => [
        "solid",
        "dashed",
        "dotted",
        "double",
        "none",
      ];
      const getBlendModes = () => [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ];
      const getAlign = () => [
        "start",
        "end",
        "center",
        "between",
        "around",
        "evenly",
        "stretch",
      ];
      const getZeroAndEmpty = () => ["", "0", isArbitraryValue];
      const getBreaks = () => [
        "auto",
        "avoid",
        "all",
        "avoid-page",
        "page",
        "left",
        "right",
        "column",
      ];
      const getNumberAndArbitrary = () => [isNumber, isArbitraryValue];
      return {
        cacheSize: 500,
        separator: ":",
        theme: {
          colors: [isAny],
          spacing: [isLength, isArbitraryLength],
          blur: ["none", "", isTshirtSize, isArbitraryValue],
          brightness: getNumberAndArbitrary(),
          borderColor: [colors],
          borderRadius: ["none", "", "full", isTshirtSize, isArbitraryValue],
          borderSpacing: getSpacingWithArbitrary(),
          borderWidth: getLengthWithEmptyAndArbitrary(),
          contrast: getNumberAndArbitrary(),
          grayscale: getZeroAndEmpty(),
          hueRotate: getNumberAndArbitrary(),
          invert: getZeroAndEmpty(),
          gap: getSpacingWithArbitrary(),
          gradientColorStops: [colors],
          gradientColorStopPositions: [isPercent, isArbitraryLength],
          inset: getSpacingWithAutoAndArbitrary(),
          margin: getSpacingWithAutoAndArbitrary(),
          opacity: getNumberAndArbitrary(),
          padding: getSpacingWithArbitrary(),
          saturate: getNumberAndArbitrary(),
          scale: getNumberAndArbitrary(),
          sepia: getZeroAndEmpty(),
          skew: getNumberAndArbitrary(),
          space: getSpacingWithArbitrary(),
          translate: getSpacingWithArbitrary(),
        },
        classGroups: {
          // Layout
          /**
           * Aspect Ratio
           * @see https://tailwindcss.com/docs/aspect-ratio
           */
          aspect: [
            {
              aspect: ["auto", "square", "video", isArbitraryValue],
            },
          ],
          /**
           * Container
           * @see https://tailwindcss.com/docs/container
           */
          container: ["container"],
          /**
           * Columns
           * @see https://tailwindcss.com/docs/columns
           */
          columns: [
            {
              columns: [isTshirtSize],
            },
          ],
          /**
           * Break After
           * @see https://tailwindcss.com/docs/break-after
           */
          "break-after": [
            {
              "break-after": getBreaks(),
            },
          ],
          /**
           * Break Before
           * @see https://tailwindcss.com/docs/break-before
           */
          "break-before": [
            {
              "break-before": getBreaks(),
            },
          ],
          /**
           * Break Inside
           * @see https://tailwindcss.com/docs/break-inside
           */
          "break-inside": [
            {
              "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"],
            },
          ],
          /**
           * Box Decoration Break
           * @see https://tailwindcss.com/docs/box-decoration-break
           */
          "box-decoration": [
            {
              "box-decoration": ["slice", "clone"],
            },
          ],
          /**
           * Box Sizing
           * @see https://tailwindcss.com/docs/box-sizing
           */
          box: [
            {
              box: ["border", "content"],
            },
          ],
          /**
           * Display
           * @see https://tailwindcss.com/docs/display
           */
          display: [
            "block",
            "inline-block",
            "inline",
            "flex",
            "inline-flex",
            "table",
            "inline-table",
            "table-caption",
            "table-cell",
            "table-column",
            "table-column-group",
            "table-footer-group",
            "table-header-group",
            "table-row-group",
            "table-row",
            "flow-root",
            "grid",
            "inline-grid",
            "contents",
            "list-item",
            "hidden",
          ],
          /**
           * Floats
           * @see https://tailwindcss.com/docs/float
           */
          float: [
            {
              float: ["right", "left", "none", "start", "end"],
            },
          ],
          /**
           * Clear
           * @see https://tailwindcss.com/docs/clear
           */
          clear: [
            {
              clear: ["left", "right", "both", "none", "start", "end"],
            },
          ],
          /**
           * Isolation
           * @see https://tailwindcss.com/docs/isolation
           */
          isolation: ["isolate", "isolation-auto"],
          /**
           * Object Fit
           * @see https://tailwindcss.com/docs/object-fit
           */
          "object-fit": [
            {
              object: ["contain", "cover", "fill", "none", "scale-down"],
            },
          ],
          /**
           * Object Position
           * @see https://tailwindcss.com/docs/object-position
           */
          "object-position": [
            {
              object: [...getPositions(), isArbitraryValue],
            },
          ],
          /**
           * Overflow
           * @see https://tailwindcss.com/docs/overflow
           */
          overflow: [
            {
              overflow: getOverflow(),
            },
          ],
          /**
           * Overflow X
           * @see https://tailwindcss.com/docs/overflow
           */
          "overflow-x": [
            {
              "overflow-x": getOverflow(),
            },
          ],
          /**
           * Overflow Y
           * @see https://tailwindcss.com/docs/overflow
           */
          "overflow-y": [
            {
              "overflow-y": getOverflow(),
            },
          ],
          /**
           * Overscroll Behavior
           * @see https://tailwindcss.com/docs/overscroll-behavior
           */
          overscroll: [
            {
              overscroll: getOverscroll(),
            },
          ],
          /**
           * Overscroll Behavior X
           * @see https://tailwindcss.com/docs/overscroll-behavior
           */
          "overscroll-x": [
            {
              "overscroll-x": getOverscroll(),
            },
          ],
          /**
           * Overscroll Behavior Y
           * @see https://tailwindcss.com/docs/overscroll-behavior
           */
          "overscroll-y": [
            {
              "overscroll-y": getOverscroll(),
            },
          ],
          /**
           * Position
           * @see https://tailwindcss.com/docs/position
           */
          position: ["static", "fixed", "absolute", "relative", "sticky"],
          /**
           * Top / Right / Bottom / Left
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          inset: [
            {
              inset: [inset],
            },
          ],
          /**
           * Right / Left
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          "inset-x": [
            {
              "inset-x": [inset],
            },
          ],
          /**
           * Top / Bottom
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          "inset-y": [
            {
              "inset-y": [inset],
            },
          ],
          /**
           * Start
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          start: [
            {
              start: [inset],
            },
          ],
          /**
           * End
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          end: [
            {
              end: [inset],
            },
          ],
          /**
           * Top
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          top: [
            {
              top: [inset],
            },
          ],
          /**
           * Right
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          right: [
            {
              right: [inset],
            },
          ],
          /**
           * Bottom
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          bottom: [
            {
              bottom: [inset],
            },
          ],
          /**
           * Left
           * @see https://tailwindcss.com/docs/top-right-bottom-left
           */
          left: [
            {
              left: [inset],
            },
          ],
          /**
           * Visibility
           * @see https://tailwindcss.com/docs/visibility
           */
          visibility: ["visible", "invisible", "collapse"],
          /**
           * Z-Index
           * @see https://tailwindcss.com/docs/z-index
           */
          z: [
            {
              z: ["auto", isInteger, isArbitraryValue],
            },
          ],
          // Flexbox and Grid
          /**
           * Flex Basis
           * @see https://tailwindcss.com/docs/flex-basis
           */
          basis: [
            {
              basis: getSpacingWithAutoAndArbitrary(),
            },
          ],
          /**
           * Flex Direction
           * @see https://tailwindcss.com/docs/flex-direction
           */
          "flex-direction": [
            {
              flex: ["row", "row-reverse", "col", "col-reverse"],
            },
          ],
          /**
           * Flex Wrap
           * @see https://tailwindcss.com/docs/flex-wrap
           */
          "flex-wrap": [
            {
              flex: ["wrap", "wrap-reverse", "nowrap"],
            },
          ],
          /**
           * Flex
           * @see https://tailwindcss.com/docs/flex
           */
          flex: [
            {
              flex: ["1", "auto", "initial", "none", isArbitraryValue],
            },
          ],
          /**
           * Flex Grow
           * @see https://tailwindcss.com/docs/flex-grow
           */
          grow: [
            {
              grow: getZeroAndEmpty(),
            },
          ],
          /**
           * Flex Shrink
           * @see https://tailwindcss.com/docs/flex-shrink
           */
          shrink: [
            {
              shrink: getZeroAndEmpty(),
            },
          ],
          /**
           * Order
           * @see https://tailwindcss.com/docs/order
           */
          order: [
            {
              order: ["first", "last", "none", isInteger, isArbitraryValue],
            },
          ],
          /**
           * Grid Template Columns
           * @see https://tailwindcss.com/docs/grid-template-columns
           */
          "grid-cols": [
            {
              "grid-cols": [isAny],
            },
          ],
          /**
           * Grid Column Start / End
           * @see https://tailwindcss.com/docs/grid-column
           */
          "col-start-end": [
            {
              col: [
                "auto",
                {
                  span: ["full", isInteger, isArbitraryValue],
                },
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Grid Column Start
           * @see https://tailwindcss.com/docs/grid-column
           */
          "col-start": [
            {
              "col-start": getNumberWithAutoAndArbitrary(),
            },
          ],
          /**
           * Grid Column End
           * @see https://tailwindcss.com/docs/grid-column
           */
          "col-end": [
            {
              "col-end": getNumberWithAutoAndArbitrary(),
            },
          ],
          /**
           * Grid Template Rows
           * @see https://tailwindcss.com/docs/grid-template-rows
           */
          "grid-rows": [
            {
              "grid-rows": [isAny],
            },
          ],
          /**
           * Grid Row Start / End
           * @see https://tailwindcss.com/docs/grid-row
           */
          "row-start-end": [
            {
              row: [
                "auto",
                {
                  span: [isInteger, isArbitraryValue],
                },
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Grid Row Start
           * @see https://tailwindcss.com/docs/grid-row
           */
          "row-start": [
            {
              "row-start": getNumberWithAutoAndArbitrary(),
            },
          ],
          /**
           * Grid Row End
           * @see https://tailwindcss.com/docs/grid-row
           */
          "row-end": [
            {
              "row-end": getNumberWithAutoAndArbitrary(),
            },
          ],
          /**
           * Grid Auto Flow
           * @see https://tailwindcss.com/docs/grid-auto-flow
           */
          "grid-flow": [
            {
              "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"],
            },
          ],
          /**
           * Grid Auto Columns
           * @see https://tailwindcss.com/docs/grid-auto-columns
           */
          "auto-cols": [
            {
              "auto-cols": ["auto", "min", "max", "fr", isArbitraryValue],
            },
          ],
          /**
           * Grid Auto Rows
           * @see https://tailwindcss.com/docs/grid-auto-rows
           */
          "auto-rows": [
            {
              "auto-rows": ["auto", "min", "max", "fr", isArbitraryValue],
            },
          ],
          /**
           * Gap
           * @see https://tailwindcss.com/docs/gap
           */
          gap: [
            {
              gap: [gap],
            },
          ],
          /**
           * Gap X
           * @see https://tailwindcss.com/docs/gap
           */
          "gap-x": [
            {
              "gap-x": [gap],
            },
          ],
          /**
           * Gap Y
           * @see https://tailwindcss.com/docs/gap
           */
          "gap-y": [
            {
              "gap-y": [gap],
            },
          ],
          /**
           * Justify Content
           * @see https://tailwindcss.com/docs/justify-content
           */
          "justify-content": [
            {
              justify: ["normal", ...getAlign()],
            },
          ],
          /**
           * Justify Items
           * @see https://tailwindcss.com/docs/justify-items
           */
          "justify-items": [
            {
              "justify-items": ["start", "end", "center", "stretch"],
            },
          ],
          /**
           * Justify Self
           * @see https://tailwindcss.com/docs/justify-self
           */
          "justify-self": [
            {
              "justify-self": ["auto", "start", "end", "center", "stretch"],
            },
          ],
          /**
           * Align Content
           * @see https://tailwindcss.com/docs/align-content
           */
          "align-content": [
            {
              content: ["normal", ...getAlign(), "baseline"],
            },
          ],
          /**
           * Align Items
           * @see https://tailwindcss.com/docs/align-items
           */
          "align-items": [
            {
              items: ["start", "end", "center", "baseline", "stretch"],
            },
          ],
          /**
           * Align Self
           * @see https://tailwindcss.com/docs/align-self
           */
          "align-self": [
            {
              self: ["auto", "start", "end", "center", "stretch", "baseline"],
            },
          ],
          /**
           * Place Content
           * @see https://tailwindcss.com/docs/place-content
           */
          "place-content": [
            {
              "place-content": [...getAlign(), "baseline"],
            },
          ],
          /**
           * Place Items
           * @see https://tailwindcss.com/docs/place-items
           */
          "place-items": [
            {
              "place-items": ["start", "end", "center", "baseline", "stretch"],
            },
          ],
          /**
           * Place Self
           * @see https://tailwindcss.com/docs/place-self
           */
          "place-self": [
            {
              "place-self": ["auto", "start", "end", "center", "stretch"],
            },
          ],
          // Spacing
          /**
           * Padding
           * @see https://tailwindcss.com/docs/padding
           */
          p: [
            {
              p: [padding],
            },
          ],
          /**
           * Padding X
           * @see https://tailwindcss.com/docs/padding
           */
          px: [
            {
              px: [padding],
            },
          ],
          /**
           * Padding Y
           * @see https://tailwindcss.com/docs/padding
           */
          py: [
            {
              py: [padding],
            },
          ],
          /**
           * Padding Start
           * @see https://tailwindcss.com/docs/padding
           */
          ps: [
            {
              ps: [padding],
            },
          ],
          /**
           * Padding End
           * @see https://tailwindcss.com/docs/padding
           */
          pe: [
            {
              pe: [padding],
            },
          ],
          /**
           * Padding Top
           * @see https://tailwindcss.com/docs/padding
           */
          pt: [
            {
              pt: [padding],
            },
          ],
          /**
           * Padding Right
           * @see https://tailwindcss.com/docs/padding
           */
          pr: [
            {
              pr: [padding],
            },
          ],
          /**
           * Padding Bottom
           * @see https://tailwindcss.com/docs/padding
           */
          pb: [
            {
              pb: [padding],
            },
          ],
          /**
           * Padding Left
           * @see https://tailwindcss.com/docs/padding
           */
          pl: [
            {
              pl: [padding],
            },
          ],
          /**
           * Margin
           * @see https://tailwindcss.com/docs/margin
           */
          m: [
            {
              m: [margin],
            },
          ],
          /**
           * Margin X
           * @see https://tailwindcss.com/docs/margin
           */
          mx: [
            {
              mx: [margin],
            },
          ],
          /**
           * Margin Y
           * @see https://tailwindcss.com/docs/margin
           */
          my: [
            {
              my: [margin],
            },
          ],
          /**
           * Margin Start
           * @see https://tailwindcss.com/docs/margin
           */
          ms: [
            {
              ms: [margin],
            },
          ],
          /**
           * Margin End
           * @see https://tailwindcss.com/docs/margin
           */
          me: [
            {
              me: [margin],
            },
          ],
          /**
           * Margin Top
           * @see https://tailwindcss.com/docs/margin
           */
          mt: [
            {
              mt: [margin],
            },
          ],
          /**
           * Margin Right
           * @see https://tailwindcss.com/docs/margin
           */
          mr: [
            {
              mr: [margin],
            },
          ],
          /**
           * Margin Bottom
           * @see https://tailwindcss.com/docs/margin
           */
          mb: [
            {
              mb: [margin],
            },
          ],
          /**
           * Margin Left
           * @see https://tailwindcss.com/docs/margin
           */
          ml: [
            {
              ml: [margin],
            },
          ],
          /**
           * Space Between X
           * @see https://tailwindcss.com/docs/space
           */
          "space-x": [
            {
              "space-x": [space],
            },
          ],
          /**
           * Space Between X Reverse
           * @see https://tailwindcss.com/docs/space
           */
          "space-x-reverse": ["space-x-reverse"],
          /**
           * Space Between Y
           * @see https://tailwindcss.com/docs/space
           */
          "space-y": [
            {
              "space-y": [space],
            },
          ],
          /**
           * Space Between Y Reverse
           * @see https://tailwindcss.com/docs/space
           */
          "space-y-reverse": ["space-y-reverse"],
          // Sizing
          /**
           * Width
           * @see https://tailwindcss.com/docs/width
           */
          w: [
            {
              w: [
                "auto",
                "min",
                "max",
                "fit",
                "svw",
                "lvw",
                "dvw",
                isArbitraryValue,
                spacing,
              ],
            },
          ],
          /**
           * Min-Width
           * @see https://tailwindcss.com/docs/min-width
           */
          "min-w": [
            {
              "min-w": [isArbitraryValue, spacing, "min", "max", "fit"],
            },
          ],
          /**
           * Max-Width
           * @see https://tailwindcss.com/docs/max-width
           */
          "max-w": [
            {
              "max-w": [
                isArbitraryValue,
                spacing,
                "none",
                "full",
                "min",
                "max",
                "fit",
                "prose",
                {
                  screen: [isTshirtSize],
                },
                isTshirtSize,
              ],
            },
          ],
          /**
           * Height
           * @see https://tailwindcss.com/docs/height
           */
          h: [
            {
              h: [
                isArbitraryValue,
                spacing,
                "auto",
                "min",
                "max",
                "fit",
                "svh",
                "lvh",
                "dvh",
              ],
            },
          ],
          /**
           * Min-Height
           * @see https://tailwindcss.com/docs/min-height
           */
          "min-h": [
            {
              "min-h": [
                isArbitraryValue,
                spacing,
                "min",
                "max",
                "fit",
                "svh",
                "lvh",
                "dvh",
              ],
            },
          ],
          /**
           * Max-Height
           * @see https://tailwindcss.com/docs/max-height
           */
          "max-h": [
            {
              "max-h": [
                isArbitraryValue,
                spacing,
                "min",
                "max",
                "fit",
                "svh",
                "lvh",
                "dvh",
              ],
            },
          ],
          /**
           * Size
           * @see https://tailwindcss.com/docs/size
           */
          size: [
            {
              size: [isArbitraryValue, spacing, "auto", "min", "max", "fit"],
            },
          ],
          // Typography
          /**
           * Font Size
           * @see https://tailwindcss.com/docs/font-size
           */
          "font-size": [
            {
              text: ["base", isTshirtSize, isArbitraryLength],
            },
          ],
          /**
           * Font Smoothing
           * @see https://tailwindcss.com/docs/font-smoothing
           */
          "font-smoothing": ["antialiased", "subpixel-antialiased"],
          /**
           * Font Style
           * @see https://tailwindcss.com/docs/font-style
           */
          "font-style": ["italic", "not-italic"],
          /**
           * Font Weight
           * @see https://tailwindcss.com/docs/font-weight
           */
          "font-weight": [
            {
              font: [
                "thin",
                "extralight",
                "light",
                "normal",
                "medium",
                "semibold",
                "bold",
                "extrabold",
                "black",
                isArbitraryNumber,
              ],
            },
          ],
          /**
           * Font Family
           * @see https://tailwindcss.com/docs/font-family
           */
          "font-family": [
            {
              font: [isAny],
            },
          ],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-normal": ["normal-nums"],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-ordinal": ["ordinal"],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-slashed-zero": ["slashed-zero"],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-figure": ["lining-nums", "oldstyle-nums"],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-spacing": ["proportional-nums", "tabular-nums"],
          /**
           * Font Variant Numeric
           * @see https://tailwindcss.com/docs/font-variant-numeric
           */
          "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
          /**
           * Letter Spacing
           * @see https://tailwindcss.com/docs/letter-spacing
           */
          tracking: [
            {
              tracking: [
                "tighter",
                "tight",
                "normal",
                "wide",
                "wider",
                "widest",
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Line Clamp
           * @see https://tailwindcss.com/docs/line-clamp
           */
          "line-clamp": [
            {
              "line-clamp": ["none", isNumber, isArbitraryNumber],
            },
          ],
          /**
           * Line Height
           * @see https://tailwindcss.com/docs/line-height
           */
          leading: [
            {
              leading: [
                "none",
                "tight",
                "snug",
                "normal",
                "relaxed",
                "loose",
                isLength,
                isArbitraryValue,
              ],
            },
          ],
          /**
           * List Style Image
           * @see https://tailwindcss.com/docs/list-style-image
           */
          "list-image": [
            {
              "list-image": ["none", isArbitraryValue],
            },
          ],
          /**
           * List Style Type
           * @see https://tailwindcss.com/docs/list-style-type
           */
          "list-style-type": [
            {
              list: ["none", "disc", "decimal", isArbitraryValue],
            },
          ],
          /**
           * List Style Position
           * @see https://tailwindcss.com/docs/list-style-position
           */
          "list-style-position": [
            {
              list: ["inside", "outside"],
            },
          ],
          /**
           * Placeholder Color
           * @deprecated since Tailwind CSS v3.0.0
           * @see https://tailwindcss.com/docs/placeholder-color
           */
          "placeholder-color": [
            {
              placeholder: [colors],
            },
          ],
          /**
           * Placeholder Opacity
           * @see https://tailwindcss.com/docs/placeholder-opacity
           */
          "placeholder-opacity": [
            {
              "placeholder-opacity": [opacity],
            },
          ],
          /**
           * Text Alignment
           * @see https://tailwindcss.com/docs/text-align
           */
          "text-alignment": [
            {
              text: ["left", "center", "right", "justify", "start", "end"],
            },
          ],
          /**
           * Text Color
           * @see https://tailwindcss.com/docs/text-color
           */
          "text-color": [
            {
              text: [colors],
            },
          ],
          /**
           * Text Opacity
           * @see https://tailwindcss.com/docs/text-opacity
           */
          "text-opacity": [
            {
              "text-opacity": [opacity],
            },
          ],
          /**
           * Text Decoration
           * @see https://tailwindcss.com/docs/text-decoration
           */
          "text-decoration": [
            "underline",
            "overline",
            "line-through",
            "no-underline",
          ],
          /**
           * Text Decoration Style
           * @see https://tailwindcss.com/docs/text-decoration-style
           */
          "text-decoration-style": [
            {
              decoration: [...getLineStyles(), "wavy"],
            },
          ],
          /**
           * Text Decoration Thickness
           * @see https://tailwindcss.com/docs/text-decoration-thickness
           */
          "text-decoration-thickness": [
            {
              decoration: ["auto", "from-font", isLength, isArbitraryLength],
            },
          ],
          /**
           * Text Underline Offset
           * @see https://tailwindcss.com/docs/text-underline-offset
           */
          "underline-offset": [
            {
              "underline-offset": ["auto", isLength, isArbitraryValue],
            },
          ],
          /**
           * Text Decoration Color
           * @see https://tailwindcss.com/docs/text-decoration-color
           */
          "text-decoration-color": [
            {
              decoration: [colors],
            },
          ],
          /**
           * Text Transform
           * @see https://tailwindcss.com/docs/text-transform
           */
          "text-transform": [
            "uppercase",
            "lowercase",
            "capitalize",
            "normal-case",
          ],
          /**
           * Text Overflow
           * @see https://tailwindcss.com/docs/text-overflow
           */
          "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
          /**
           * Text Wrap
           * @see https://tailwindcss.com/docs/text-wrap
           */
          "text-wrap": [
            {
              text: ["wrap", "nowrap", "balance", "pretty"],
            },
          ],
          /**
           * Text Indent
           * @see https://tailwindcss.com/docs/text-indent
           */
          indent: [
            {
              indent: getSpacingWithArbitrary(),
            },
          ],
          /**
           * Vertical Alignment
           * @see https://tailwindcss.com/docs/vertical-align
           */
          "vertical-align": [
            {
              align: [
                "baseline",
                "top",
                "middle",
                "bottom",
                "text-top",
                "text-bottom",
                "sub",
                "super",
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Whitespace
           * @see https://tailwindcss.com/docs/whitespace
           */
          whitespace: [
            {
              whitespace: [
                "normal",
                "nowrap",
                "pre",
                "pre-line",
                "pre-wrap",
                "break-spaces",
              ],
            },
          ],
          /**
           * Word Break
           * @see https://tailwindcss.com/docs/word-break
           */
          break: [
            {
              break: ["normal", "words", "all", "keep"],
            },
          ],
          /**
           * Hyphens
           * @see https://tailwindcss.com/docs/hyphens
           */
          hyphens: [
            {
              hyphens: ["none", "manual", "auto"],
            },
          ],
          /**
           * Content
           * @see https://tailwindcss.com/docs/content
           */
          content: [
            {
              content: ["none", isArbitraryValue],
            },
          ],
          // Backgrounds
          /**
           * Background Attachment
           * @see https://tailwindcss.com/docs/background-attachment
           */
          "bg-attachment": [
            {
              bg: ["fixed", "local", "scroll"],
            },
          ],
          /**
           * Background Clip
           * @see https://tailwindcss.com/docs/background-clip
           */
          "bg-clip": [
            {
              "bg-clip": ["border", "padding", "content", "text"],
            },
          ],
          /**
           * Background Opacity
           * @deprecated since Tailwind CSS v3.0.0
           * @see https://tailwindcss.com/docs/background-opacity
           */
          "bg-opacity": [
            {
              "bg-opacity": [opacity],
            },
          ],
          /**
           * Background Origin
           * @see https://tailwindcss.com/docs/background-origin
           */
          "bg-origin": [
            {
              "bg-origin": ["border", "padding", "content"],
            },
          ],
          /**
           * Background Position
           * @see https://tailwindcss.com/docs/background-position
           */
          "bg-position": [
            {
              bg: [...getPositions(), isArbitraryPosition],
            },
          ],
          /**
           * Background Repeat
           * @see https://tailwindcss.com/docs/background-repeat
           */
          "bg-repeat": [
            {
              bg: [
                "no-repeat",
                {
                  repeat: ["", "x", "y", "round", "space"],
                },
              ],
            },
          ],
          /**
           * Background Size
           * @see https://tailwindcss.com/docs/background-size
           */
          "bg-size": [
            {
              bg: ["auto", "cover", "contain", isArbitrarySize],
            },
          ],
          /**
           * Background Image
           * @see https://tailwindcss.com/docs/background-image
           */
          "bg-image": [
            {
              bg: [
                "none",
                {
                  "gradient-to": ["t", "tr", "r", "br", "b", "bl", "l", "tl"],
                },
                isArbitraryImage,
              ],
            },
          ],
          /**
           * Background Color
           * @see https://tailwindcss.com/docs/background-color
           */
          "bg-color": [
            {
              bg: [colors],
            },
          ],
          /**
           * Gradient Color Stops From Position
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-from-pos": [
            {
              from: [gradientColorStopPositions],
            },
          ],
          /**
           * Gradient Color Stops Via Position
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-via-pos": [
            {
              via: [gradientColorStopPositions],
            },
          ],
          /**
           * Gradient Color Stops To Position
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-to-pos": [
            {
              to: [gradientColorStopPositions],
            },
          ],
          /**
           * Gradient Color Stops From
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-from": [
            {
              from: [gradientColorStops],
            },
          ],
          /**
           * Gradient Color Stops Via
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-via": [
            {
              via: [gradientColorStops],
            },
          ],
          /**
           * Gradient Color Stops To
           * @see https://tailwindcss.com/docs/gradient-color-stops
           */
          "gradient-to": [
            {
              to: [gradientColorStops],
            },
          ],
          // Borders
          /**
           * Border Radius
           * @see https://tailwindcss.com/docs/border-radius
           */
          rounded: [
            {
              rounded: [borderRadius],
            },
          ],
          /**
           * Border Radius Start
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-s": [
            {
              "rounded-s": [borderRadius],
            },
          ],
          /**
           * Border Radius End
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-e": [
            {
              "rounded-e": [borderRadius],
            },
          ],
          /**
           * Border Radius Top
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-t": [
            {
              "rounded-t": [borderRadius],
            },
          ],
          /**
           * Border Radius Right
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-r": [
            {
              "rounded-r": [borderRadius],
            },
          ],
          /**
           * Border Radius Bottom
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-b": [
            {
              "rounded-b": [borderRadius],
            },
          ],
          /**
           * Border Radius Left
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-l": [
            {
              "rounded-l": [borderRadius],
            },
          ],
          /**
           * Border Radius Start Start
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-ss": [
            {
              "rounded-ss": [borderRadius],
            },
          ],
          /**
           * Border Radius Start End
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-se": [
            {
              "rounded-se": [borderRadius],
            },
          ],
          /**
           * Border Radius End End
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-ee": [
            {
              "rounded-ee": [borderRadius],
            },
          ],
          /**
           * Border Radius End Start
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-es": [
            {
              "rounded-es": [borderRadius],
            },
          ],
          /**
           * Border Radius Top Left
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-tl": [
            {
              "rounded-tl": [borderRadius],
            },
          ],
          /**
           * Border Radius Top Right
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-tr": [
            {
              "rounded-tr": [borderRadius],
            },
          ],
          /**
           * Border Radius Bottom Right
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-br": [
            {
              "rounded-br": [borderRadius],
            },
          ],
          /**
           * Border Radius Bottom Left
           * @see https://tailwindcss.com/docs/border-radius
           */
          "rounded-bl": [
            {
              "rounded-bl": [borderRadius],
            },
          ],
          /**
           * Border Width
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w": [
            {
              border: [borderWidth],
            },
          ],
          /**
           * Border Width X
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-x": [
            {
              "border-x": [borderWidth],
            },
          ],
          /**
           * Border Width Y
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-y": [
            {
              "border-y": [borderWidth],
            },
          ],
          /**
           * Border Width Start
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-s": [
            {
              "border-s": [borderWidth],
            },
          ],
          /**
           * Border Width End
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-e": [
            {
              "border-e": [borderWidth],
            },
          ],
          /**
           * Border Width Top
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-t": [
            {
              "border-t": [borderWidth],
            },
          ],
          /**
           * Border Width Right
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-r": [
            {
              "border-r": [borderWidth],
            },
          ],
          /**
           * Border Width Bottom
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-b": [
            {
              "border-b": [borderWidth],
            },
          ],
          /**
           * Border Width Left
           * @see https://tailwindcss.com/docs/border-width
           */
          "border-w-l": [
            {
              "border-l": [borderWidth],
            },
          ],
          /**
           * Border Opacity
           * @see https://tailwindcss.com/docs/border-opacity
           */
          "border-opacity": [
            {
              "border-opacity": [opacity],
            },
          ],
          /**
           * Border Style
           * @see https://tailwindcss.com/docs/border-style
           */
          "border-style": [
            {
              border: [...getLineStyles(), "hidden"],
            },
          ],
          /**
           * Divide Width X
           * @see https://tailwindcss.com/docs/divide-width
           */
          "divide-x": [
            {
              "divide-x": [borderWidth],
            },
          ],
          /**
           * Divide Width X Reverse
           * @see https://tailwindcss.com/docs/divide-width
           */
          "divide-x-reverse": ["divide-x-reverse"],
          /**
           * Divide Width Y
           * @see https://tailwindcss.com/docs/divide-width
           */
          "divide-y": [
            {
              "divide-y": [borderWidth],
            },
          ],
          /**
           * Divide Width Y Reverse
           * @see https://tailwindcss.com/docs/divide-width
           */
          "divide-y-reverse": ["divide-y-reverse"],
          /**
           * Divide Opacity
           * @see https://tailwindcss.com/docs/divide-opacity
           */
          "divide-opacity": [
            {
              "divide-opacity": [opacity],
            },
          ],
          /**
           * Divide Style
           * @see https://tailwindcss.com/docs/divide-style
           */
          "divide-style": [
            {
              divide: getLineStyles(),
            },
          ],
          /**
           * Border Color
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color": [
            {
              border: [borderColor],
            },
          ],
          /**
           * Border Color X
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-x": [
            {
              "border-x": [borderColor],
            },
          ],
          /**
           * Border Color Y
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-y": [
            {
              "border-y": [borderColor],
            },
          ],
          /**
           * Border Color S
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-s": [
            {
              "border-s": [borderColor],
            },
          ],
          /**
           * Border Color E
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-e": [
            {
              "border-e": [borderColor],
            },
          ],
          /**
           * Border Color Top
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-t": [
            {
              "border-t": [borderColor],
            },
          ],
          /**
           * Border Color Right
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-r": [
            {
              "border-r": [borderColor],
            },
          ],
          /**
           * Border Color Bottom
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-b": [
            {
              "border-b": [borderColor],
            },
          ],
          /**
           * Border Color Left
           * @see https://tailwindcss.com/docs/border-color
           */
          "border-color-l": [
            {
              "border-l": [borderColor],
            },
          ],
          /**
           * Divide Color
           * @see https://tailwindcss.com/docs/divide-color
           */
          "divide-color": [
            {
              divide: [borderColor],
            },
          ],
          /**
           * Outline Style
           * @see https://tailwindcss.com/docs/outline-style
           */
          "outline-style": [
            {
              outline: ["", ...getLineStyles()],
            },
          ],
          /**
           * Outline Offset
           * @see https://tailwindcss.com/docs/outline-offset
           */
          "outline-offset": [
            {
              "outline-offset": [isLength, isArbitraryValue],
            },
          ],
          /**
           * Outline Width
           * @see https://tailwindcss.com/docs/outline-width
           */
          "outline-w": [
            {
              outline: [isLength, isArbitraryLength],
            },
          ],
          /**
           * Outline Color
           * @see https://tailwindcss.com/docs/outline-color
           */
          "outline-color": [
            {
              outline: [colors],
            },
          ],
          /**
           * Ring Width
           * @see https://tailwindcss.com/docs/ring-width
           */
          "ring-w": [
            {
              ring: getLengthWithEmptyAndArbitrary(),
            },
          ],
          /**
           * Ring Width Inset
           * @see https://tailwindcss.com/docs/ring-width
           */
          "ring-w-inset": ["ring-inset"],
          /**
           * Ring Color
           * @see https://tailwindcss.com/docs/ring-color
           */
          "ring-color": [
            {
              ring: [colors],
            },
          ],
          /**
           * Ring Opacity
           * @see https://tailwindcss.com/docs/ring-opacity
           */
          "ring-opacity": [
            {
              "ring-opacity": [opacity],
            },
          ],
          /**
           * Ring Offset Width
           * @see https://tailwindcss.com/docs/ring-offset-width
           */
          "ring-offset-w": [
            {
              "ring-offset": [isLength, isArbitraryLength],
            },
          ],
          /**
           * Ring Offset Color
           * @see https://tailwindcss.com/docs/ring-offset-color
           */
          "ring-offset-color": [
            {
              "ring-offset": [colors],
            },
          ],
          // Effects
          /**
           * Box Shadow
           * @see https://tailwindcss.com/docs/box-shadow
           */
          shadow: [
            {
              shadow: ["", "inner", "none", isTshirtSize, isArbitraryShadow],
            },
          ],
          /**
           * Box Shadow Color
           * @see https://tailwindcss.com/docs/box-shadow-color
           */
          "shadow-color": [
            {
              shadow: [isAny],
            },
          ],
          /**
           * Opacity
           * @see https://tailwindcss.com/docs/opacity
           */
          opacity: [
            {
              opacity: [opacity],
            },
          ],
          /**
           * Mix Blend Mode
           * @see https://tailwindcss.com/docs/mix-blend-mode
           */
          "mix-blend": [
            {
              "mix-blend": [...getBlendModes(), "plus-lighter", "plus-darker"],
            },
          ],
          /**
           * Background Blend Mode
           * @see https://tailwindcss.com/docs/background-blend-mode
           */
          "bg-blend": [
            {
              "bg-blend": getBlendModes(),
            },
          ],
          // Filters
          /**
           * Filter
           * @deprecated since Tailwind CSS v3.0.0
           * @see https://tailwindcss.com/docs/filter
           */
          filter: [
            {
              filter: ["", "none"],
            },
          ],
          /**
           * Blur
           * @see https://tailwindcss.com/docs/blur
           */
          blur: [
            {
              blur: [blur],
            },
          ],
          /**
           * Brightness
           * @see https://tailwindcss.com/docs/brightness
           */
          brightness: [
            {
              brightness: [brightness],
            },
          ],
          /**
           * Contrast
           * @see https://tailwindcss.com/docs/contrast
           */
          contrast: [
            {
              contrast: [contrast],
            },
          ],
          /**
           * Drop Shadow
           * @see https://tailwindcss.com/docs/drop-shadow
           */
          "drop-shadow": [
            {
              "drop-shadow": ["", "none", isTshirtSize, isArbitraryValue],
            },
          ],
          /**
           * Grayscale
           * @see https://tailwindcss.com/docs/grayscale
           */
          grayscale: [
            {
              grayscale: [grayscale],
            },
          ],
          /**
           * Hue Rotate
           * @see https://tailwindcss.com/docs/hue-rotate
           */
          "hue-rotate": [
            {
              "hue-rotate": [hueRotate],
            },
          ],
          /**
           * Invert
           * @see https://tailwindcss.com/docs/invert
           */
          invert: [
            {
              invert: [invert],
            },
          ],
          /**
           * Saturate
           * @see https://tailwindcss.com/docs/saturate
           */
          saturate: [
            {
              saturate: [saturate],
            },
          ],
          /**
           * Sepia
           * @see https://tailwindcss.com/docs/sepia
           */
          sepia: [
            {
              sepia: [sepia],
            },
          ],
          /**
           * Backdrop Filter
           * @deprecated since Tailwind CSS v3.0.0
           * @see https://tailwindcss.com/docs/backdrop-filter
           */
          "backdrop-filter": [
            {
              "backdrop-filter": ["", "none"],
            },
          ],
          /**
           * Backdrop Blur
           * @see https://tailwindcss.com/docs/backdrop-blur
           */
          "backdrop-blur": [
            {
              "backdrop-blur": [blur],
            },
          ],
          /**
           * Backdrop Brightness
           * @see https://tailwindcss.com/docs/backdrop-brightness
           */
          "backdrop-brightness": [
            {
              "backdrop-brightness": [brightness],
            },
          ],
          /**
           * Backdrop Contrast
           * @see https://tailwindcss.com/docs/backdrop-contrast
           */
          "backdrop-contrast": [
            {
              "backdrop-contrast": [contrast],
            },
          ],
          /**
           * Backdrop Grayscale
           * @see https://tailwindcss.com/docs/backdrop-grayscale
           */
          "backdrop-grayscale": [
            {
              "backdrop-grayscale": [grayscale],
            },
          ],
          /**
           * Backdrop Hue Rotate
           * @see https://tailwindcss.com/docs/backdrop-hue-rotate
           */
          "backdrop-hue-rotate": [
            {
              "backdrop-hue-rotate": [hueRotate],
            },
          ],
          /**
           * Backdrop Invert
           * @see https://tailwindcss.com/docs/backdrop-invert
           */
          "backdrop-invert": [
            {
              "backdrop-invert": [invert],
            },
          ],
          /**
           * Backdrop Opacity
           * @see https://tailwindcss.com/docs/backdrop-opacity
           */
          "backdrop-opacity": [
            {
              "backdrop-opacity": [opacity],
            },
          ],
          /**
           * Backdrop Saturate
           * @see https://tailwindcss.com/docs/backdrop-saturate
           */
          "backdrop-saturate": [
            {
              "backdrop-saturate": [saturate],
            },
          ],
          /**
           * Backdrop Sepia
           * @see https://tailwindcss.com/docs/backdrop-sepia
           */
          "backdrop-sepia": [
            {
              "backdrop-sepia": [sepia],
            },
          ],
          // Tables
          /**
           * Border Collapse
           * @see https://tailwindcss.com/docs/border-collapse
           */
          "border-collapse": [
            {
              border: ["collapse", "separate"],
            },
          ],
          /**
           * Border Spacing
           * @see https://tailwindcss.com/docs/border-spacing
           */
          "border-spacing": [
            {
              "border-spacing": [borderSpacing],
            },
          ],
          /**
           * Border Spacing X
           * @see https://tailwindcss.com/docs/border-spacing
           */
          "border-spacing-x": [
            {
              "border-spacing-x": [borderSpacing],
            },
          ],
          /**
           * Border Spacing Y
           * @see https://tailwindcss.com/docs/border-spacing
           */
          "border-spacing-y": [
            {
              "border-spacing-y": [borderSpacing],
            },
          ],
          /**
           * Table Layout
           * @see https://tailwindcss.com/docs/table-layout
           */
          "table-layout": [
            {
              table: ["auto", "fixed"],
            },
          ],
          /**
           * Caption Side
           * @see https://tailwindcss.com/docs/caption-side
           */
          caption: [
            {
              caption: ["top", "bottom"],
            },
          ],
          // Transitions and Animation
          /**
           * Tranisition Property
           * @see https://tailwindcss.com/docs/transition-property
           */
          transition: [
            {
              transition: [
                "none",
                "all",
                "",
                "colors",
                "opacity",
                "shadow",
                "transform",
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Transition Duration
           * @see https://tailwindcss.com/docs/transition-duration
           */
          duration: [
            {
              duration: getNumberAndArbitrary(),
            },
          ],
          /**
           * Transition Timing Function
           * @see https://tailwindcss.com/docs/transition-timing-function
           */
          ease: [
            {
              ease: ["linear", "in", "out", "in-out", isArbitraryValue],
            },
          ],
          /**
           * Transition Delay
           * @see https://tailwindcss.com/docs/transition-delay
           */
          delay: [
            {
              delay: getNumberAndArbitrary(),
            },
          ],
          /**
           * Animation
           * @see https://tailwindcss.com/docs/animation
           */
          animate: [
            {
              animate: [
                "none",
                "spin",
                "ping",
                "pulse",
                "bounce",
                isArbitraryValue,
              ],
            },
          ],
          // Transforms
          /**
           * Transform
           * @see https://tailwindcss.com/docs/transform
           */
          transform: [
            {
              transform: ["", "gpu", "none"],
            },
          ],
          /**
           * Scale
           * @see https://tailwindcss.com/docs/scale
           */
          scale: [
            {
              scale: [scale],
            },
          ],
          /**
           * Scale X
           * @see https://tailwindcss.com/docs/scale
           */
          "scale-x": [
            {
              "scale-x": [scale],
            },
          ],
          /**
           * Scale Y
           * @see https://tailwindcss.com/docs/scale
           */
          "scale-y": [
            {
              "scale-y": [scale],
            },
          ],
          /**
           * Rotate
           * @see https://tailwindcss.com/docs/rotate
           */
          rotate: [
            {
              rotate: [isInteger, isArbitraryValue],
            },
          ],
          /**
           * Translate X
           * @see https://tailwindcss.com/docs/translate
           */
          "translate-x": [
            {
              "translate-x": [translate],
            },
          ],
          /**
           * Translate Y
           * @see https://tailwindcss.com/docs/translate
           */
          "translate-y": [
            {
              "translate-y": [translate],
            },
          ],
          /**
           * Skew X
           * @see https://tailwindcss.com/docs/skew
           */
          "skew-x": [
            {
              "skew-x": [skew],
            },
          ],
          /**
           * Skew Y
           * @see https://tailwindcss.com/docs/skew
           */
          "skew-y": [
            {
              "skew-y": [skew],
            },
          ],
          /**
           * Transform Origin
           * @see https://tailwindcss.com/docs/transform-origin
           */
          "transform-origin": [
            {
              origin: [
                "center",
                "top",
                "top-right",
                "right",
                "bottom-right",
                "bottom",
                "bottom-left",
                "left",
                "top-left",
                isArbitraryValue,
              ],
            },
          ],
          // Interactivity
          /**
           * Accent Color
           * @see https://tailwindcss.com/docs/accent-color
           */
          accent: [
            {
              accent: ["auto", colors],
            },
          ],
          /**
           * Appearance
           * @see https://tailwindcss.com/docs/appearance
           */
          appearance: [
            {
              appearance: ["none", "auto"],
            },
          ],
          /**
           * Cursor
           * @see https://tailwindcss.com/docs/cursor
           */
          cursor: [
            {
              cursor: [
                "auto",
                "default",
                "pointer",
                "wait",
                "text",
                "move",
                "help",
                "not-allowed",
                "none",
                "context-menu",
                "progress",
                "cell",
                "crosshair",
                "vertical-text",
                "alias",
                "copy",
                "no-drop",
                "grab",
                "grabbing",
                "all-scroll",
                "col-resize",
                "row-resize",
                "n-resize",
                "e-resize",
                "s-resize",
                "w-resize",
                "ne-resize",
                "nw-resize",
                "se-resize",
                "sw-resize",
                "ew-resize",
                "ns-resize",
                "nesw-resize",
                "nwse-resize",
                "zoom-in",
                "zoom-out",
                isArbitraryValue,
              ],
            },
          ],
          /**
           * Caret Color
           * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
           */
          "caret-color": [
            {
              caret: [colors],
            },
          ],
          /**
           * Pointer Events
           * @see https://tailwindcss.com/docs/pointer-events
           */
          "pointer-events": [
            {
              "pointer-events": ["none", "auto"],
            },
          ],
          /**
           * Resize
           * @see https://tailwindcss.com/docs/resize
           */
          resize: [
            {
              resize: ["none", "y", "x", ""],
            },
          ],
          /**
           * Scroll Behavior
           * @see https://tailwindcss.com/docs/scroll-behavior
           */
          "scroll-behavior": [
            {
              scroll: ["auto", "smooth"],
            },
          ],
          /**
           * Scroll Margin
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-m": [
            {
              "scroll-m": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin X
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-mx": [
            {
              "scroll-mx": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Y
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-my": [
            {
              "scroll-my": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Start
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-ms": [
            {
              "scroll-ms": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin End
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-me": [
            {
              "scroll-me": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Top
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-mt": [
            {
              "scroll-mt": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Right
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-mr": [
            {
              "scroll-mr": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Bottom
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-mb": [
            {
              "scroll-mb": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Margin Left
           * @see https://tailwindcss.com/docs/scroll-margin
           */
          "scroll-ml": [
            {
              "scroll-ml": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-p": [
            {
              "scroll-p": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding X
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-px": [
            {
              "scroll-px": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Y
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-py": [
            {
              "scroll-py": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Start
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-ps": [
            {
              "scroll-ps": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding End
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-pe": [
            {
              "scroll-pe": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Top
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-pt": [
            {
              "scroll-pt": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Right
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-pr": [
            {
              "scroll-pr": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Bottom
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-pb": [
            {
              "scroll-pb": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Padding Left
           * @see https://tailwindcss.com/docs/scroll-padding
           */
          "scroll-pl": [
            {
              "scroll-pl": getSpacingWithArbitrary(),
            },
          ],
          /**
           * Scroll Snap Align
           * @see https://tailwindcss.com/docs/scroll-snap-align
           */
          "snap-align": [
            {
              snap: ["start", "end", "center", "align-none"],
            },
          ],
          /**
           * Scroll Snap Stop
           * @see https://tailwindcss.com/docs/scroll-snap-stop
           */
          "snap-stop": [
            {
              snap: ["normal", "always"],
            },
          ],
          /**
           * Scroll Snap Type
           * @see https://tailwindcss.com/docs/scroll-snap-type
           */
          "snap-type": [
            {
              snap: ["none", "x", "y", "both"],
            },
          ],
          /**
           * Scroll Snap Type Strictness
           * @see https://tailwindcss.com/docs/scroll-snap-type
           */
          "snap-strictness": [
            {
              snap: ["mandatory", "proximity"],
            },
          ],
          /**
           * Touch Action
           * @see https://tailwindcss.com/docs/touch-action
           */
          touch: [
            {
              touch: ["auto", "none", "manipulation"],
            },
          ],
          /**
           * Touch Action X
           * @see https://tailwindcss.com/docs/touch-action
           */
          "touch-x": [
            {
              "touch-pan": ["x", "left", "right"],
            },
          ],
          /**
           * Touch Action Y
           * @see https://tailwindcss.com/docs/touch-action
           */
          "touch-y": [
            {
              "touch-pan": ["y", "up", "down"],
            },
          ],
          /**
           * Touch Action Pinch Zoom
           * @see https://tailwindcss.com/docs/touch-action
           */
          "touch-pz": ["touch-pinch-zoom"],
          /**
           * User Select
           * @see https://tailwindcss.com/docs/user-select
           */
          select: [
            {
              select: ["none", "text", "all", "auto"],
            },
          ],
          /**
           * Will Change
           * @see https://tailwindcss.com/docs/will-change
           */
          "will-change": [
            {
              "will-change": [
                "auto",
                "scroll",
                "contents",
                "transform",
                isArbitraryValue,
              ],
            },
          ],
          // SVG
          /**
           * Fill
           * @see https://tailwindcss.com/docs/fill
           */
          fill: [
            {
              fill: [colors, "none"],
            },
          ],
          /**
           * Stroke Width
           * @see https://tailwindcss.com/docs/stroke-width
           */
          "stroke-w": [
            {
              stroke: [isLength, isArbitraryLength, isArbitraryNumber],
            },
          ],
          /**
           * Stroke
           * @see https://tailwindcss.com/docs/stroke
           */
          stroke: [
            {
              stroke: [colors, "none"],
            },
          ],
          // Accessibility
          /**
           * Screen Readers
           * @see https://tailwindcss.com/docs/screen-readers
           */
          sr: ["sr-only", "not-sr-only"],
          /**
           * Forced Color Adjust
           * @see https://tailwindcss.com/docs/forced-color-adjust
           */
          "forced-color-adjust": [
            {
              "forced-color-adjust": ["auto", "none"],
            },
          ],
        },
        conflictingClassGroups: {
          overflow: ["overflow-x", "overflow-y"],
          overscroll: ["overscroll-x", "overscroll-y"],
          inset: [
            "inset-x",
            "inset-y",
            "start",
            "end",
            "top",
            "right",
            "bottom",
            "left",
          ],
          "inset-x": ["right", "left"],
          "inset-y": ["top", "bottom"],
          flex: ["basis", "grow", "shrink"],
          gap: ["gap-x", "gap-y"],
          p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
          px: ["pr", "pl"],
          py: ["pt", "pb"],
          m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
          mx: ["mr", "ml"],
          my: ["mt", "mb"],
          size: ["w", "h"],
          "font-size": ["leading"],
          "fvn-normal": [
            "fvn-ordinal",
            "fvn-slashed-zero",
            "fvn-figure",
            "fvn-spacing",
            "fvn-fraction",
          ],
          "fvn-ordinal": ["fvn-normal"],
          "fvn-slashed-zero": ["fvn-normal"],
          "fvn-figure": ["fvn-normal"],
          "fvn-spacing": ["fvn-normal"],
          "fvn-fraction": ["fvn-normal"],
          "line-clamp": ["display", "overflow"],
          rounded: [
            "rounded-s",
            "rounded-e",
            "rounded-t",
            "rounded-r",
            "rounded-b",
            "rounded-l",
            "rounded-ss",
            "rounded-se",
            "rounded-ee",
            "rounded-es",
            "rounded-tl",
            "rounded-tr",
            "rounded-br",
            "rounded-bl",
          ],
          "rounded-s": ["rounded-ss", "rounded-es"],
          "rounded-e": ["rounded-se", "rounded-ee"],
          "rounded-t": ["rounded-tl", "rounded-tr"],
          "rounded-r": ["rounded-tr", "rounded-br"],
          "rounded-b": ["rounded-br", "rounded-bl"],
          "rounded-l": ["rounded-tl", "rounded-bl"],
          "border-spacing": ["border-spacing-x", "border-spacing-y"],
          "border-w": [
            "border-w-s",
            "border-w-e",
            "border-w-t",
            "border-w-r",
            "border-w-b",
            "border-w-l",
          ],
          "border-w-x": ["border-w-r", "border-w-l"],
          "border-w-y": ["border-w-t", "border-w-b"],
          "border-color": [
            "border-color-s",
            "border-color-e",
            "border-color-t",
            "border-color-r",
            "border-color-b",
            "border-color-l",
          ],
          "border-color-x": ["border-color-r", "border-color-l"],
          "border-color-y": ["border-color-t", "border-color-b"],
          "scroll-m": [
            "scroll-mx",
            "scroll-my",
            "scroll-ms",
            "scroll-me",
            "scroll-mt",
            "scroll-mr",
            "scroll-mb",
            "scroll-ml",
          ],
          "scroll-mx": ["scroll-mr", "scroll-ml"],
          "scroll-my": ["scroll-mt", "scroll-mb"],
          "scroll-p": [
            "scroll-px",
            "scroll-py",
            "scroll-ps",
            "scroll-pe",
            "scroll-pt",
            "scroll-pr",
            "scroll-pb",
            "scroll-pl",
          ],
          "scroll-px": ["scroll-pr", "scroll-pl"],
          "scroll-py": ["scroll-pt", "scroll-pb"],
          touch: ["touch-x", "touch-y", "touch-pz"],
          "touch-x": ["touch"],
          "touch-y": ["touch"],
          "touch-pz": ["touch"],
        },
        conflictingClassGroupModifiers: {
          "font-size": ["leading"],
        },
      };
    };
    var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

    // compat:styles
    var styles_default =
      '.dsc-ui .relative {\n  position: relative;\n}\n\n.dsc-ui .mb-3 {\n  margin-bottom: 0.75rem;\n}\n\n.dsc-ui .block {\n  display: block;\n}\n\n.dsc-ui .inline {\n  display: inline;\n}\n\n.dsc-ui .flex {\n  display: flex;\n}\n\n.dsc-ui .inline-flex {\n  display: inline-flex;\n}\n\n.dsc-ui .table {\n  display: table;\n}\n\n.dsc-ui .table-caption {\n  display: table-caption;\n}\n\n.dsc-ui .table-cell {\n  display: table-cell;\n}\n\n.dsc-ui .table-row {\n  display: table-row;\n}\n\n.dsc-ui .hidden {\n  display: none;\n}\n\n.dsc-ui .h-10 {\n  height: 2.5rem;\n}\n\n.dsc-ui .h-8 {\n  height: 2rem;\n}\n\n.dsc-ui .h-9 {\n  height: 2.25rem;\n}\n\n.dsc-ui .h-full {\n  height: 100%;\n}\n\n.dsc-ui .h-px {\n  height: 1px;\n}\n\n.dsc-ui .min-h-20 {\n  min-height: 5rem;\n}\n\n.dsc-ui .w-full {\n  width: 100%;\n}\n\n.dsc-ui .w-px {\n  width: 1px;\n}\n\n.dsc-ui .max-w-full {\n  max-width: 100%;\n}\n\n.dsc-ui .shrink-0 {\n  flex-shrink: 0;\n}\n\n.dsc-ui .caption-bottom {\n  caption-side: bottom;\n}\n\n.dsc-ui .items-center {\n  align-items: center;\n}\n\n.dsc-ui .justify-center {\n  justify-content: center;\n}\n\n.dsc-ui .gap-2 {\n  gap: 0.5rem;\n}\n\n.dsc-ui .overflow-auto {\n  overflow: auto;\n}\n\n.dsc-ui .whitespace-nowrap {\n  white-space: nowrap;\n}\n\n.dsc-ui .rounded-lg {\n  border-radius: 0.5rem;\n}\n\n.dsc-ui .rounded-md {\n  border-radius: 0.375rem;\n}\n\n.dsc-ui .rounded-xl {\n  border-radius: 0.75rem;\n}\n\n.dsc-ui .border {\n  border-width: 1px;\n}\n\n.dsc-ui .border-b {\n  border-bottom-width: 1px;\n}\n\n.dsc-ui .border-border {\n  --tw-border-opacity: 1;\n  border-color: hsl(var(--dsc-border) / var(--tw-border-opacity, 1));\n}\n\n.dsc-ui .border-input {\n  --tw-border-opacity: 1;\n  border-color: hsl(var(--dsc-input) / var(--tw-border-opacity, 1));\n}\n\n.dsc-ui .bg-background {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-background) / var(--tw-bg-opacity, 1));\n}\n\n.dsc-ui .bg-border {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-border) / var(--tw-bg-opacity, 1));\n}\n\n.dsc-ui .bg-card {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-card) / var(--tw-bg-opacity, 1));\n}\n\n.dsc-ui .bg-muted\\/40 {\n  background-color: hsl(var(--dsc-muted) / 0.4);\n}\n\n.dsc-ui .bg-primary {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-primary) / var(--tw-bg-opacity, 1));\n}\n\n.dsc-ui .bg-secondary {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-secondary) / var(--tw-bg-opacity, 1));\n}\n\n.dsc-ui .bg-transparent {\n  background-color: transparent;\n}\n\n.dsc-ui .p-3 {\n  padding: 0.75rem;\n}\n\n.dsc-ui .p-4 {\n  padding: 1rem;\n}\n\n.dsc-ui .px-2 {\n  padding-left: 0.5rem;\n  padding-right: 0.5rem;\n}\n\n.dsc-ui .px-3 {\n  padding-left: 0.75rem;\n  padding-right: 0.75rem;\n}\n\n.dsc-ui .px-4 {\n  padding-left: 1rem;\n  padding-right: 1rem;\n}\n\n.dsc-ui .py-0\\.5 {\n  padding-top: 0.125rem;\n  padding-bottom: 0.125rem;\n}\n\n.dsc-ui .py-1 {\n  padding-top: 0.25rem;\n  padding-bottom: 0.25rem;\n}\n\n.dsc-ui .py-2 {\n  padding-top: 0.5rem;\n  padding-bottom: 0.5rem;\n}\n\n.dsc-ui .py-3 {\n  padding-top: 0.75rem;\n  padding-bottom: 0.75rem;\n}\n\n.dsc-ui .text-left {\n  text-align: left;\n}\n\n.dsc-ui .align-top {\n  vertical-align: top;\n}\n\n.dsc-ui .align-middle {\n  vertical-align: middle;\n}\n\n.dsc-ui .text-sm {\n  font-size: var(--dsc-font-body);\n  line-height: 1.6;\n}\n\n.dsc-ui .text-xs {\n  font-size: var(--dsc-font-small);\n  line-height: 1.6;\n}\n\n.dsc-ui .font-medium {\n  font-weight: 500;\n}\n\n.dsc-ui .font-semibold {\n  font-weight: 600;\n}\n\n.dsc-ui .leading-none {\n  line-height: 1;\n}\n\n.dsc-ui .text-card-foreground {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-card-foreground) / var(--tw-text-opacity, 1));\n}\n\n.dsc-ui .text-foreground {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-foreground) / var(--tw-text-opacity, 1));\n}\n\n.dsc-ui .text-muted-foreground {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-muted-foreground) / var(--tw-text-opacity, 1));\n}\n\n.dsc-ui .text-primary-foreground {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-primary-foreground) / var(--tw-text-opacity, 1));\n}\n\n.dsc-ui .text-secondary-foreground {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-secondary-foreground) / var(--tw-text-opacity, 1));\n}\n\n.dsc-ui .shadow-sm {\n  --tw-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);\n  --tw-shadow-colored: 0 1px 2px 0 var(--tw-shadow-color);\n  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);\n}\n\n.dsc-ui .outline {\n  outline-style: solid;\n}\n\n.dsc-ui .filter {\n  filter: var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow);\n}\n\n.dsc-ui .transition-colors {\n  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;\n  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);\n  transition-duration: 150ms;\n}\n\n.dsc-ui {\n  box-sizing: border-box;\n  --dsc-font-body: 13px;\n  --dsc-font-heading: 14px;\n  --dsc-font-small: 12px;\n  --dsc-background: 0 0% 100%;\n  --dsc-foreground: 240 10% 12%;\n  --dsc-card: 0 0% 100%;\n  --dsc-card-foreground: 240 10% 12%;\n  --dsc-primary: 240 6% 18%;\n  --dsc-primary-foreground: 0 0% 98%;\n  --dsc-secondary: 240 5% 96%;\n  --dsc-secondary-foreground: 240 6% 18%;\n  --dsc-muted: 240 5% 96%;\n  --dsc-muted-foreground: 240 4% 40%;\n  --dsc-accent: 240 5% 94%;\n  --dsc-accent-foreground: 240 6% 18%;\n  --dsc-border: 240 6% 88%;\n  --dsc-input: 240 6% 84%;\n  --dsc-ring: 240 5% 40%;\n  font:\n    var(--dsc-font-body) / 1.6 system-ui,\n    -apple-system,\n    sans-serif;\n  color: hsl(var(--dsc-foreground));\n  text-align: left;\n  min-width: 0;\n}\n.dsc-ui[data-theme="dark"] {\n  --dsc-background: 240 6% 11%;\n  --dsc-foreground: 0 0% 94%;\n  --dsc-card: 240 5% 13%;\n  --dsc-card-foreground: 0 0% 94%;\n  --dsc-primary: 0 0% 94%;\n  --dsc-primary-foreground: 240 6% 12%;\n  --dsc-secondary: 240 4% 20%;\n  --dsc-secondary-foreground: 0 0% 94%;\n  --dsc-muted: 240 4% 20%;\n  --dsc-muted-foreground: 240 5% 68%;\n  --dsc-accent: 240 4% 23%;\n  --dsc-accent-foreground: 0 0% 94%;\n  --dsc-border: 240 4% 28%;\n  --dsc-input: 240 4% 34%;\n  --dsc-ring: 240 5% 72%;\n}\n.dsc-ui *,\n.dsc-ui *::before,\n.dsc-ui *::after {\n  box-sizing: border-box;\n  border-style: solid;\n  border-width: 0;\n}\n.dsc-ui button,\n.dsc-ui input,\n.dsc-ui select,\n.dsc-ui textarea {\n  font: inherit;\n  color: inherit;\n}\n.dsc-ui button {\n  cursor: pointer;\n}\n.dsc-ui button:disabled {\n  cursor: not-allowed;\n}\n.dsc-ui p {\n  margin: 8px 0;\n}\n.dsc-ui h3 {\n  margin: 0 0 12px;\n  font-size: var(--dsc-font-heading);\n  font-weight: 600;\n}\n.dsc-ui table {\n  border-collapse: collapse;\n  text-align: left;\n}\n.dsc-ui code {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n}\n.dsc-ui :is(button, input, select, textarea):focus-visible {\n  outline: 2px solid hsl(var(--dsc-ring));\n  outline-offset: 3px;\n}\n.dsc-ui .compat-page {\n  display: grid;\n  gap: 16px;\n  padding: 8px 0 24px;\n  min-width: 0;\n}\n.dsc-ui .compat-primary {\n  padding: 20px;\n  min-width: 0;\n}\n.dsc-ui .compat-heading {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 12px;\n}\n.dsc-ui .compat-title {\n  font-size: var(--dsc-font-heading);\n  font-weight: 600;\n  letter-spacing: normal;\n  margin: 0;\n}\n.dsc-ui .compat-subtitle {\n  color: hsl(var(--dsc-muted-foreground));\n  margin: 0;\n}\n.dsc-ui .compat-toolbar {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  margin: 16px 0 10px;\n}\n.dsc-ui .compat-toolbar input {\n  width: 220px;\n  max-width: 100%;\n}\n.dsc-ui .compat-metrics {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  margin: 16px 0;\n}\n.dsc-ui .compat-metrics > div {\n  flex: 1;\n  min-width: 100px;\n  padding: 10px 14px;\n  border: 1px solid hsl(var(--dsc-border));\n  border-radius: 8px;\n  background: hsl(var(--dsc-muted) / 0.45);\n}\n.dsc-ui .compat-metrics strong {\n  font-size: 22px;\n  font-weight: 600;\n  margin-right: 8px;\n}\n.dsc-ui .compat-meta {\n  color: hsl(var(--dsc-muted-foreground));\n  font-size: var(--dsc-font-body);\n  overflow-wrap: anywhere;\n}\n.dsc-ui .compat-report-context,\n.dsc-ui .compat-report-meta,\n.dsc-ui .compat-report-meta details {\n  min-width: 0;\n  max-width: 100%;\n  overflow-wrap: anywhere;\n  word-break: normal;\n}\n.dsc-ui .compat-report-meta {\n  margin-top: 10px;\n}\n.dsc-ui .compat-section-divider {\n  margin-top: 16px;\n}\n.dsc-ui .compat-results-divider {\n  margin: 14px 0 8px;\n}\n.dsc-ui .compat-report-information {\n  min-width: 0;\n  padding: 16px;\n  overflow-wrap: anywhere;\n}\n.dsc-ui .compat-results {\n  min-width: 580px;\n  table-layout: auto;\n}\n.dsc-ui .compat-results th:first-child,\n.dsc-ui .compat-results td:first-child {\n  min-width: 220px;\n  width: 28%;\n  overflow-wrap: break-word;\n}\n.dsc-ui .compat-results th:nth-child(2),\n.dsc-ui .compat-results td:nth-child(2) {\n  width: 110px;\n  white-space: nowrap;\n}\n.dsc-ui .compat-auxiliary {\n  display: grid;\n  gap: 12px;\n  min-width: 0;\n}\n.dsc-ui .compat-auxiliary > section {\n  padding: 16px;\n  min-width: 0;\n}\n.dsc-ui .compat-fold {\n  min-width: 0;\n  margin: 12px 0;\n}\n.dsc-ui .compat-fold-header {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 16px;\n}\n.dsc-ui .compat-fold-title {\n  display: flex;\n  flex: 1 1 160px;\n  align-items: center;\n  gap: 8px;\n  font-weight: 600;\n  min-width: 0;\n}\n.dsc-ui .compat-count {\n  font-size: var(--dsc-font-body);\n  font-weight: 400;\n  color: hsl(var(--dsc-muted-foreground));\n}\n.dsc-ui .compat-fold-content {\n  padding: 0 16px 16px;\n  min-width: 0;\n}\n.dsc-ui .compat-relation-table {\n  min-width: 900px;\n  table-layout: auto;\n}\n.dsc-ui .compat-relation-table :is(th, td) {\n  min-width: 100px;\n  overflow-wrap: break-word;\n  word-break: normal;\n}\n.dsc-ui .compat-relation-table :is(th, td):first-child {\n  min-width: 240px;\n  width: 26%;\n}\n.dsc-ui .compat-relation-table :is(th, td):nth-child(2) {\n  min-width: 280px;\n  width: 30%;\n}\n.dsc-ui .compat-relation-table th {\n  vertical-align: top;\n}\n.dsc-ui [data-slot="badge"][data-tone="neutral"] {\n  border-color: hsl(var(--dsc-border));\n  background: hsl(var(--dsc-muted));\n  color: hsl(var(--dsc-muted-foreground));\n}\n.dsc-ui [data-slot="badge"][data-tone="ok"] {\n  border-color: #16a34a40;\n  background: #16a34a15;\n  color: #15803d;\n}\n.dsc-ui [data-slot="badge"][data-tone="partial"] {\n  border-color: #d9770640;\n  background: #d9770615;\n  color: #a65306;\n}\n.dsc-ui [data-slot="badge"][data-tone="broken"] {\n  border-color: #dc262640;\n  background: #dc262615;\n  color: #c92525;\n}\n.dsc-ui[data-theme="dark"] [data-slot="badge"][data-tone="ok"] {\n  color: #86efac;\n}\n.dsc-ui[data-theme="dark"] [data-slot="badge"][data-tone="partial"] {\n  color: #fcd34d;\n}\n.dsc-ui[data-theme="dark"] [data-slot="badge"][data-tone="broken"] {\n  color: #fca5a5;\n}\n.dsc-ui.dsc-inline {\n  display: inline;\n}\n@media (max-width: 640px) {\n  .dsc-ui .compat-primary {\n    padding: 14px;\n  }\n  .dsc-ui .compat-title {\n    font-size: var(--dsc-font-heading);\n  }\n  .dsc-ui .compat-heading {\n    gap: 8px;\n  }\n  .dsc-ui .compat-metrics > div {\n    min-width: 90px;\n    padding: 8px 10px;\n  }\n}\n\n.dsc-ui .compat-fold-title {\n  margin: 0;\n  overflow-wrap: anywhere;\n}\n.dsc-ui .compat-fold-header > h3 {\n  font-size: var(--dsc-font-heading);\n}\n.dsc-ui .compat-disclosure {\n  margin: 8px 0;\n}\n.dsc-ui .compat-disclosure > .compat-fold-header {\n  padding: 0;\n  gap: 8px;\n}\n.dsc-ui .compat-disclosure > .compat-fold-content {\n  padding: 8px 0 0;\n}\n.dsc-ui [data-slot="collapsible-content"][hidden] {\n  display: none;\n}\n\n.dsc-ui .compat-fold-header > button {\n  margin-left: auto;\n}\n.dsc-ui .compat-count {\n  white-space: nowrap;\n}\n.dsc-ui .placeholder\\:text-muted-foreground::placeholder {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-muted-foreground) / var(--tw-text-opacity, 1));\n}\n.dsc-ui .hover\\:bg-accent:hover {\n  --tw-bg-opacity: 1;\n  background-color: hsl(var(--dsc-accent) / var(--tw-bg-opacity, 1));\n}\n.dsc-ui .hover\\:bg-muted\\/50:hover {\n  background-color: hsl(var(--dsc-muted) / 0.5);\n}\n.dsc-ui .hover\\:bg-primary\\/90:hover {\n  background-color: hsl(var(--dsc-primary) / 0.9);\n}\n.dsc-ui .hover\\:bg-secondary\\/80:hover {\n  background-color: hsl(var(--dsc-secondary) / 0.8);\n}\n.dsc-ui .hover\\:text-accent-foreground:hover {\n  --tw-text-opacity: 1;\n  color: hsl(var(--dsc-accent-foreground) / var(--tw-text-opacity, 1));\n}\n.dsc-ui .focus-visible\\:outline-none:focus-visible {\n  outline: 2px solid transparent;\n  outline-offset: 2px;\n}\n.dsc-ui .focus-visible\\:ring-2:focus-visible {\n  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);\n  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);\n  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);\n}\n.dsc-ui .focus-visible\\:ring-ring:focus-visible {\n  --tw-ring-opacity: 1;\n  --tw-ring-color: hsl(var(--dsc-ring) / var(--tw-ring-opacity, 1));\n}\n.dsc-ui .focus-visible\\:ring-offset-2:focus-visible {\n  --tw-ring-offset-width: 2px;\n}\n.dsc-ui .disabled\\:pointer-events-none:disabled {\n  pointer-events: none;\n}\n.dsc-ui .disabled\\:cursor-not-allowed:disabled {\n  cursor: not-allowed;\n}\n.dsc-ui .disabled\\:opacity-50:disabled {\n  opacity: 0.5;\n}\n.dsc-ui :is(.\\[\\&_tr\\:last-child\\]\\:border-0 tr:last-child) {\n  border-width: 0px;\n}\n.dsc-ui :is(.\\[\\&_tr\\]\\:border-b tr) {\n  border-bottom-width: 1px;\n}\n';

    // plugin/src/components/ui/index.jsx
    var cn = (...values) => twMerge(clsx(values));
    var buttonVariants = cva(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      {
        variants: {
          variant: {
            default:
              "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
            outline:
              "border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
            secondary:
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ghost:
              "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
          },
          size: { default: "h-9 px-4 py-2", sm: "h-8 rounded-md px-3 text-xs" },
        },
        defaultVariants: { variant: "outline", size: "sm" },
      },
    );
    function Button({ className, variant, size, ...props }) {
      return /* @__PURE__ */ React.createElement("button", {
        "data-slot": "button",
        className: cn(buttonVariants({ variant, size }), className),
        ...props,
      });
    }
    function Card({ className, as: Comp = "section", ...props }) {
      return /* @__PURE__ */ React.createElement(Comp, {
        "data-slot": "card",
        className: cn(
          "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
          className,
        ),
        ...props,
      });
    }
    function Separator({
      className,
      decorative = true,
      orientation = "horizontal",
      ...props
    }) {
      return /* @__PURE__ */ React.createElement("div", {
        "data-slot": "separator",
        role: decorative ? "none" : "separator",
        "aria-orientation": decorative ? void 0 : orientation,
        className: cn(
          "shrink-0 bg-border",
          orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
          className,
        ),
        ...props,
      });
    }
    function Badge({ className, tone = "neutral", ...props }) {
      return /* @__PURE__ */ React.createElement("span", {
        "data-slot": "badge",
        "data-tone": tone,
        className: cn(
          "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
          className,
        ),
        ...props,
      });
    }
    function Input({ className, type, ...props }) {
      return /* @__PURE__ */ React.createElement("input", {
        type,
        "data-slot": "input",
        className: cn(
          "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ),
        ...props,
      });
    }
    function Textarea({ className, ...props }) {
      return /* @__PURE__ */ React.createElement("textarea", {
        "data-slot": "textarea",
        className: cn(
          "flex min-h-20 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          className,
        ),
        ...props,
      });
    }
    function NativeSelect({ className, ...props }) {
      return /* @__PURE__ */ React.createElement("select", {
        "data-slot": "native-select",
        className: cn(
          "h-9 max-w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          className,
        ),
        ...props,
      });
    }
    function Table({ className, ...props }) {
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          "data-slot": "table-container",
          className: "relative w-full overflow-auto",
        },
        /* @__PURE__ */ React.createElement("table", {
          "data-slot": "table",
          className: cn(
            "w-full caption-bottom text-sm text-foreground",
            className,
          ),
          ...props,
        }),
      );
    }
    var element = (tag, slot, classes) =>
      function Primitive({ className, ...props }) {
        return React.createElement(tag, {
          "data-slot": slot,
          className: cn(classes, className),
          ...props,
        });
      };
    var TableHeader = element("thead", "table-header", "[&_tr]:border-b");
    var TableBody = element(
      "tbody",
      "table-body",
      "[&_tr:last-child]:border-0",
    );
    var TableRow = element(
      "tr",
      "table-row",
      "border-b border-border transition-colors hover:bg-muted/50",
    );
    var TableHead = element(
      "th",
      "table-head",
      "h-10 px-3 text-left align-middle font-medium text-muted-foreground",
    );
    var TableCell = element(
      "td",
      "table-cell",
      "p-3 align-top text-foreground",
    );
    var TableCaption = element(
      "caption",
      "table-caption",
      "mb-3 text-left text-sm text-muted-foreground",
    );
    var Label = element("label", "label", "text-sm font-medium leading-none");
    function Alert({ className, ...props }) {
      return /* @__PURE__ */ React.createElement("div", {
        "data-slot": "alert",
        className: cn(
          "relative w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm",
          className,
        ),
        ...props,
      });
    }
    var titleText = (value) => {
      if (value == null || typeof value === "boolean") return "";
      if (Array.isArray(value)) return value.map(titleText).join("");
      if (typeof value === "object")
        return titleText(value.props?.children ?? value.children);
      return String(value);
    };
    function Fold({
      title,
      count,
      children,
      className,
      defaultOpen = false,
      open: controlledOpen,
      onOpenChange,
      framed = true,
      heading = false,
      keepMounted = false,
      ...props
    }) {
      const [internalOpen, setOpen] = React.useState(defaultOpen);
      const open = controlledOpen === void 0 ? internalOpen : controlledOpen;
      const content =
        Array.isArray(children) && children.length === 1
          ? children[0]
          : children;
      const Shell = framed ? Card : "div";
      const Heading = heading ? "h3" : "div";
      return /* @__PURE__ */ React.createElement(
        Shell,
        {
          ...props,
          className: cn(
            "compat-fold",
            !framed && "compat-disclosure",
            className,
          ),
          "data-slot": "collapsible",
          "data-state": open ? "open" : "closed",
        },
        /* @__PURE__ */ React.createElement(
          "div",
          { className: "compat-fold-header" },
          /* @__PURE__ */ React.createElement(
            Heading,
            { className: "compat-fold-title" },
            title,
            count != null
              ? /* @__PURE__ */ React.createElement(
                  "span",
                  { className: "compat-count" },
                  count,
                )
              : null,
          ),
          /* @__PURE__ */ React.createElement(
            Button,
            {
              className: "shrink-0",
              "aria-label": `${open ? "\u6536\u8D77" : "\u5C55\u5F00"}${titleText(title)}`,
              "aria-expanded": open,
              onClick: () => {
                const next = !open;
                if (controlledOpen === void 0) setOpen(next);
                onOpenChange?.(next);
              },
              type: "button",
              variant: "ghost",
            },
            open ? "\u6536\u8D77" : "\u5C55\u5F00",
            /* @__PURE__ */ React.createElement(
              "span",
              { "aria-hidden": "true" },
              open ? "\u2212" : "+",
            ),
          ),
        ),
        open || keepMounted
          ? /* @__PURE__ */ React.createElement(
              "div",
              {
                "data-slot": "collapsible-content",
                hidden: !open,
                className: "compat-fold-content",
              },
              typeof content === "function" ? content() : content,
            )
          : null,
      );
    }
    function Disclosure({ children, open, onToggle, ...props }) {
      const [summary, ...content] = Array.isArray(children)
        ? children
        : [children];
      const title = summary?.props?.children ?? summary?.children;
      return /* @__PURE__ */ React.createElement(
        Fold,
        {
          ...props,
          title,
          framed: false,
          keepMounted: true,
          defaultOpen: Boolean(open),
          open: onToggle ? Boolean(open) : void 0,
          onOpenChange: onToggle
            ? (next) =>
                onToggle({
                  target: { open: next },
                  currentTarget: { open: next },
                })
            : void 0,
        },
        content,
      );
    }
    function hostTheme() {
      if (typeof document === "undefined") return "light";
      const root = document.documentElement,
        body = document.body;
      for (const element2 of [root, body]) {
        if (
          element2?.classList.contains("dark") ||
          element2?.dataset.theme === "dark" ||
          element2?.dataset.colorScheme === "dark"
        )
          return "dark";
        if (
          element2?.classList.contains("light") ||
          element2?.dataset.theme === "light" ||
          element2?.dataset.colorScheme === "light"
        )
          return "light";
      }
      const scheme =
        typeof getComputedStyle === "function"
          ? getComputedStyle(root).colorScheme
          : "";
      return scheme === "dark" ||
        (scheme !== "light" &&
          globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    }
    function Scope({ children, inline = false }) {
      const [theme, setTheme] = React.useState(hostTheme);
      React.useEffect(installStyles, []);
      React.useEffect(() => {
        if (
          typeof document === "undefined" ||
          typeof MutationObserver === "undefined"
        )
          return;
        const update = () => setTheme(hostTheme());
        const observer = new MutationObserver(update);
        for (const element2 of [document.documentElement, document.body])
          if (element2)
            observer.observe(element2, {
              attributes: true,
              attributeFilter: [
                "class",
                "style",
                "data-theme",
                "data-color-scheme",
              ],
            });
        const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
        media?.addEventListener("change", update);
        return () => {
          observer.disconnect();
          media?.removeEventListener("change", update);
        };
      }, []);
      const Comp = inline ? "span" : "div";
      return /* @__PURE__ */ React.createElement(
        Comp,
        {
          className: inline ? "dsc-ui dsc-inline" : "dsc-ui",
          "data-theme": theme,
        },
        children,
      );
    }
    function installStyles() {
      if (typeof document === "undefined") return () => {};
      const key = "__DSH_COMPAT_STYLES__";
      const owner = {};
      const registry = window[key] || (window[key] = /* @__PURE__ */ new Map());
      let entry = registry.get(styles_default);
      if (!entry) {
        const node = document.createElement("style");
        node.setAttribute("data-dsh-compat-styles", "");
        node.textContent = styles_default;
        document.head.appendChild(node);
        entry = { node, owners: /* @__PURE__ */ new Set() };
        registry.set(styles_default, entry);
      }
      entry.owners.add(owner);
      return () => {
        entry.owners.delete(owner);
        if (!entry.owners.size) {
          entry.node.remove();
          registry.delete(styles_default);
        }
        if (!registry.size && window[key] === registry) delete window[key];
      };
    }
    var ui = {
      button: Button,
      input: Input,
      textarea: Textarea,
      select: NativeSelect,
      table: Table,
      thead: TableHeader,
      tbody: TableBody,
      tr: TableRow,
      th: TableHead,
      td: TableCell,
      caption: TableCaption,
      label: Label,
      section: Card,
      details: Disclosure,
      Fold,
    };

    // plugin/src/client.jsx
    var ReportContract = { assertEnvelope, catalogLines };
    var FindingGuidance = { nextSteps };
    var UpgradeContract = { assertUpgradePreview, SUPPORTED_PREVIEW_VERSIONS };
    var DependencyGraphContract = { validateDependencyGraph };
    var FindingReviewContract = {
      REVIEW_STATUS_LABELS,
      REVIEW_LIMITS,
      validateReviewInput,
      validateReviewEnvelope,
    };
    var FunctionalHealthContract = {
      validateFunctionalHealthResult,
      canonicalFunctionalManifest,
    };
    var h = (type, props, ...children) =>
      React2.createElement(ui[type] || type, props, ...children);
    var DependencyPanel = createDependencyPanel(
      React2,
      DependencyGraphContract,
      ui,
    );
    var FindingReviewPanel = createFindingReviewPanel(
      React2,
      FindingReviewContract,
      ui,
    );
    var FunctionalHealthPanel = createFunctionalHealthPanel(
      React2,
      FunctionalHealthContract,
      ui,
    );
    var SLOT = "settings.plugins.tab";
    var LABEL = "\u517C\u5BB9\u6027";
    var ROUTE = "/plugin-compat-check/report";
    var SELF_ITEM_ID = "dsh-plugin-compat-check";
    var SLOT_DETAIL = "plugins.detail.section";
    var SLOT_DETAIL_BADGE = "plugins.detail.badge";
    var VERDICT = {
      broken: { text: "\u4E0D\u517C\u5BB9", color: "#dc2626" },
      partial: { text: "\u90E8\u5206\u53EF\u7528", color: "#d97706" },
      unknown: { text: "\u672A\u77E5", color: "#6b7280" },
      ok: { text: "\u53EF\u7528", color: "#16a34a" },
    };
    var SEVERITY = {
      fatal: "\u81F4\u547D",
      "feature-dead": "\u529F\u80FD\u5931\u6548",
      degraded: "\u964D\u7EA7",
    };
    var CATEGORY = {
      "api-argument-invalid": "API\u53C2\u6570\u4E0D\u7B26",
      "api-option-unsupported": "\u7248\u672C\u9009\u9879\u672A\u652F\u6301",
      "host-service-missing": "\u670D\u52A1\u7F3A\u5931",
      "host-method-missing": "\u65B9\u6CD5\u7F3A\u5931",
      "unprovided-dependency": "\u4F9D\u8D56\u670D\u52A1\u5F85\u786E\u8BA4",
      "declaration-mismatch": "\u58F0\u660E\u4E0E\u5B9E\u6D4B\u4E0D\u7B26",
      "declared-incompatible": "\u7248\u672C\u58F0\u660E\u4E0D\u652F\u6301",
      "client-entry-missing":
        "\u5BA2\u6237\u7AEF\u5165\u53E3\u4E0D\u53EF\u4EA4\u4ED8",
      "host-entry-inactive": "\u5BBF\u4E3B\u6761\u76EE\u672A\u6FC0\u6D3B",
    };
    function mark(extra) {
      try {
        var prev = window.__COMPAT_CHECK__ || {};
        var next = { slot: SLOT, label: LABEL };
        for (var k in prev)
          if (
            Object.prototype.hasOwnProperty.call(prev, k) &&
            prev[k] !== null &&
            prev[k] !== void 0
          )
            next[k] = prev[k];
        for (var j in extra) {
          if (!Object.prototype.hasOwnProperty.call(extra, j)) continue;
          if (extra[j] === null || extra[j] === void 0) continue;
          next[j] = extra[j];
        }
        next.at = Date.now();
        window.__COMPAT_CHECK__ = next;
      } catch (error) {}
    }
    function mergeStyle() {
      var out = {};
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (!a) continue;
        for (var k in a)
          if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
      }
      return out;
    }
    function acceptPayload(data) {
      try {
        return ReportContract.assertEnvelope(data);
      } catch (error) {
        console.warn(
          "[dsh-plugin-compat-check] invalid report",
          String((error && error.message) || error),
        );
        throw new Error(
          "\u65E0\u6CD5\u8BFB\u53D6\u4F53\u68C0\u62A5\u544A\uFF1A\u62A5\u544A\u683C\u5F0F\u6216\u7248\u672C\u4E0D\u53D7\u652F\u6301\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u5E76\u786E\u8BA4\u5BBF\u4E3B\u4E0E\u63D2\u4EF6\u7248\u672C\u4E00\u81F4\u3002",
        );
      }
    }
    function useCompatibility() {
      var state = React2.useState({
        phase: "loading",
        data: null,
        error: null,
      });
      var alive = React2.useRef(true),
        latest = React2.useRef(null),
        pending = React2.useRef(null),
        queuedForce = React2.useRef(false);
      var set = state[1];
      var load = React2.useCallback(function (refresh, background) {
        if (pending.current) {
          if (refresh) queuedForce.current = true;
          return pending.current;
        }
        function read(url) {
          return fetch(url, {
            headers: {
              accept: "application/json",
              "X-DSH-Compat-Request": "1",
            },
            credentials: "same-origin",
          }).then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          });
        }
        var request = Promise.resolve()
          .then(function () {
            return read(
              refresh
                ? ROUTE + "?refresh=1"
                : background
                  ? ROUTE + "?metadata=1"
                  : ROUTE,
            );
          })
          .then(function (data) {
            if (
              background &&
              data.kind === "plugin-compat-check/report-metadata" &&
              data.ok &&
              latest.current &&
              data.computedAt === latest.current.computedAt &&
              data.nodeModules === latest.current.nodeModules &&
              data.dshVersion === latest.current.report.dshVersion &&
              (data.reviewsRevision || null) ===
                ((latest.current.reviews && latest.current.reviews.revision) ||
                  null) &&
              (data.reviewsError || null) ===
                ((latest.current.reviews && latest.current.reviews.error) ||
                  null) &&
              (data.reviewsContextToken || null) ===
                ((latest.current.reviews &&
                  latest.current.reviews.contextToken) ||
                  null)
            ) {
              return Object.assign({}, latest.current, { cache: data.cache });
            }
            return background ? read(ROUTE) : data;
          })
          .then(function (data) {
            data = acceptPayload(data);
            if (!data.ok && latest.current)
              throw new Error(
                data.error || "\u540E\u53F0\u5237\u65B0\u5931\u8D25",
              );
            if (!alive.current) return;
            latest.current = data;
            set({ phase: "done", data, error: null });
          })
          .catch(function (error) {
            if (!alive.current) return;
            var message = String((error && error.message) || error);
            if (latest.current && latest.current.ok) {
              var previous = latest.current;
              var kept = Object.assign({}, previous, {
                cache: Object.assign({}, previous.cache, {
                  hit: true,
                  stale: true,
                  refreshing: false,
                  refreshError: message,
                }),
              });
              set({ phase: "done", data: kept, error: message });
            } else set({ phase: "error", data: null, error: message });
          })
          .then(function () {
            pending.current = null;
            if (queuedForce.current && alive.current) {
              queuedForce.current = false;
              return load(true, false);
            }
          });
        pending.current = request;
        return request;
      }, []);
      React2.useEffect(
        function () {
          alive.current = true;
          var timer;
          function schedule() {
            if (alive.current)
              timer = setTimeout(function () {
                return load(false, true).then(schedule);
              }, 2e3);
          }
          load(false).then(schedule);
          return function () {
            alive.current = false;
            clearTimeout(timer);
          };
        },
        [load],
      );
      return { value: state[0], reload: load };
    }
    var styles = {
      root: { minWidth: 0 },
      head: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        marginBottom: "10px",
      },
      title: { fontSize: "var(--dsc-font-heading)", fontWeight: 600 },
      meta: {
        color: "hsl(var(--dsc-muted-foreground))",
        fontSize: "var(--dsc-font-body)",
      },
      btn: {},
      table: {},
      th: {},
      td: {},
      mono: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "var(--dsc-font-body)",
        overflowWrap: "anywhere",
      },
      pill: {},
      note: {
        color: "hsl(var(--dsc-muted-foreground))",
        fontSize: "var(--dsc-font-body)",
        marginTop: "10px",
      },
      err: {
        padding: "12px",
        border: "1px solid #dc262640",
        borderRadius: "8px",
        background: "#dc262608",
        fontSize: "var(--dsc-font-body)",
      },
      hint: { color: "hsl(var(--dsc-muted-foreground))", padding: "12px 0" },
      finding: {
        marginTop: "12px",
        paddingTop: "10px",
        borderTop: "1px solid hsl(var(--dsc-border))",
      },
      suspect: {
        color: "hsl(var(--dsc-muted-foreground))",
        fontSize: "var(--dsc-font-body)",
      },
      dim: {
        color: "hsl(var(--dsc-muted-foreground))",
        fontSize: "var(--dsc-font-body)",
        marginTop: "4px",
      },
    };
    function Sev(p) {
      var s = p.severity;
      var color =
        s === "fatal"
          ? "#dc2626"
          : s === "feature-dead"
            ? "#d97706"
            : "#6b7280";
      return h("span", { style: { color, fontWeight: 600 } }, SEVERITY[s] || s);
    }
    function Coverage(p) {
      var c = p.plugin.coverage;
      if (!c) return null;
      return h(
        "div",
        { style: styles.dim },
        "\u8BC1\u636E\u8986\u76D6\uFF1A" +
          (c.status === "complete" ? "\u5B8C\u6574" : "\u6709\u9650") +
          "\uFF1B\u5DF2\u9A8C\u8BC1\u8C03\u7528 " +
          c.verifiedCalls,
        c.limitations.length
          ? h(
              "details",
              null,
              h(
                "summary",
                { style: { cursor: "pointer" } },
                "\u8986\u76D6\u9650\u5236\uFF08" +
                  c.limitations.length +
                  "\uFF09",
              ),
              c.limitations.map(function (note, i) {
                return h(
                  "div",
                  { key: i },
                  "\u8986\u76D6\u9650\u5236\uFF1A" + note,
                );
              }),
            )
          : null,
      );
    }
    function EvidenceLegend() {
      return h(
        "div",
        { style: styles.note },
        "\u786E\u5B9A\uFF08certain\uFF09\u53EF\u7531\u660E\u786E\u9759\u6001\u4E8B\u5B9E\u6216\u5408\u683C\u8FD0\u884C\u65F6\u89C2\u6D4B\u652F\u6301\uFF1B\u7591\u4F3C\uFF08suspected\uFF09\u8868\u793A\u5F53\u524D\u8BC1\u636E\u4E0D\u8DB3\u4EE5\u786E\u5B9A\u8BE5\u6761\u53D1\u73B0\u3002",
        "\u5F71\u54CD\u4F9D\u636E\uFF1A\u5B9E\u6D4B\uFF08measured\uFF09\u987B\u6709\u5BF9\u5E94\u89C2\u6D4B\uFF0C\u63A8\u65AD\uFF08inferred\uFF09\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u5F71\u54CD\u5DF2\u5B9E\u6D4B\u3002",
        "\u672A\u89C2\u6D4B\u4E0D\u7B49\u4E8E\u7F3A\u5931\uFF1B\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u8C03\u7528\u4ECD\u53EF\u80FD\u5B58\u5728\u670D\u52A1\u4F9D\u8D56\u6216\u5BA2\u6237\u7AEF\u529F\u80FD\uFF1B\u8C03\u7528\u6838\u9A8C\u548C\u8986\u76D6\u5B8C\u6574\u5747\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u9A8C\u6536\u901A\u8FC7\u3002",
      );
    }
    function Findings(p) {
      var pl = p.plugin;
      if (!pl.findings || pl.findings.length === 0) {
        var parts = [
          p.hideCoverage ? null : h(Coverage, { key: "coverage", plugin: pl }),
        ];
        if (pl.vacuous) {
          parts.push(
            h(
              "div",
              { key: "v", style: styles.suspect },
              "\u672C\u8F6E\u672A\u53D1\u73B0\u51B2\u7A81\uFF0C\u4F46\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u8C03\u7528\uFF1B\u63D2\u4EF6\u4ECD\u53EF\u80FD\u4F9D\u8D56 DSH \u670D\u52A1\u6216\u5305\u542B\u672A\u9A8C\u8BC1\u7684\u5BA2\u6237\u7AEF\u529F\u80FD\uFF0C\u4E0D\u80FD\u636E\u6B64\u786E\u8BA4\u4E1A\u52A1\u53EF\u7528\u3002",
            ),
          );
        }
        var noCalls = Object.keys(pl.resolved || {})
          .map(function (k) {
            return pl.resolved[k];
          })
          .filter(function (c) {
            return c.disposition === "no-calls";
          });
        if (noCalls.length) {
          parts.push(
            h(
              "div",
              { key: "n", style: styles.dim },
              "\u65E0\u8BC1\u636E\u53EF\u5224\uFF08\u53EA\u51FA\u73B0\u540D\u5B57\uFF0C\u6CA1\u6709\u8C03\u7528\u70B9\uFF09\uFF1A" +
                noCalls
                  .map(function (c) {
                    return c.service;
                  })
                  .join("\u3001"),
            ),
          );
        }
        if (pl.clientSide && pl.clientSide.length) {
          parts.push(
            h(
              "div",
              { key: "c", style: styles.dim },
              "\u5BA2\u6237\u7AEF\u534A\u8FB9\uFF08\u547D\u4EE4\u884C\u6D4B\u4E0D\u5230\uFF0C\u9700\u754C\u9762\u9A8C\u8BC1\uFF09\uFF1A" +
                pl.clientSide
                  .map(function (c) {
                    return c.service;
                  })
                  .join("\u3001"),
            ),
          );
        }
        return parts.length ? h("div", null, parts) : null;
      }
      return h(
        "div",
        null,
        p.hideCoverage ? null : h(Coverage, { plugin: pl }),
        pl.findings.map(function (f, i) {
          var api = f.service
            ? f.method
              ? f.service + "." + f.method
              : f.service
            : "(\u5305\u58F0\u660E)";
          var loc = f.location
            ? f.location.file + ":" + f.location.line
            : "\u2014";
          return h(
            "div",
            { key: i, style: styles.finding },
            h(Sev, { severity: f.severity }),
            h("span", null, " " + (CATEGORY[f.category] || f.category) + " "),
            h("code", { style: styles.mono }, api),
            h("span", { style: styles.mono }, " @ " + loc),
            h(
              "span",
              {
                style: styles.suspect,
                title:
                  f.certainty === "certain"
                    ? "\u5F53\u524D\u8BC1\u636E\u8DB3\u4EE5\u652F\u6301\u8BE5\u6761\u53D1\u73B0\uFF0C\u53EF\u6765\u81EA\u660E\u786E\u9759\u6001\u4E8B\u5B9E\u6216\u5408\u683C\u8FD0\u884C\u65F6\u89C2\u6D4B\uFF1B\u4E0D\u7B49\u4E8E\u5F71\u54CD\u5DF2\u5B9E\u6D4B\u3002"
                    : "\u5F53\u524D\u8BC1\u636E\u4E0D\u8DB3\u4EE5\u786E\u5B9A\u8BE5\u6761\u53D1\u73B0\uFF1B\u5B58\u5728\u8FD0\u884C\u65F6\u89C2\u6D4B\u4E5F\u4E0D\u4EE3\u8868\u8BE5\u8C03\u7528\u5DF2\u9A8C\u8BC1\u3002",
              },
              f.certainty === "certain" ? " [\u786E\u5B9A]" : " [\u7591\u4F3C]",
            ),
            f.impact
              ? h(
                  "div",
                  { style: styles.dim },
                  (f.impactBasis === "measured"
                    ? "\u5F71\u54CD\uFF08\u5B9E\u6D4B\uFF09\uFF1A"
                    : f.impactBasis === "inferred"
                      ? "\u5F71\u54CD\uFF08\u63A8\u65AD\uFF0C\u975E\u5B9E\u6D4B\uFF09\uFF1A"
                      : "\u5F71\u54CD\uFF08\u4F9D\u636E\u672A\u63D0\u4F9B\uFF09\uFF1A") +
                    f.impact,
                )
              : null,
            f.basis
              ? h("div", { style: styles.dim }, "\u4F9D\u636E\uFF1A" + f.basis)
              : null,
            h(
              "div",
              { style: { marginTop: "6px" } },
              h("strong", null, "\u4E0B\u4E00\u6B65\u6838\u5B9E"),
              h(
                "ol",
                { style: { margin: "4px 0", paddingLeft: "22px" } },
                FindingGuidance.nextSteps(f).map(function (step, j) {
                  return h("li", { key: j }, step);
                }),
              ),
            ),
          );
        }),
      );
    }
    function pickPlugin(data, props) {
      var report2 = data && data.report;
      if (!report2 || !report2.plugins) return null;
      var plugins = report2.plugins;
      var byPkg = function (name2, how) {
        if (typeof name2 !== "string" || name2 === "") return null;
        return plugins[name2]
          ? { name: name2, plugin: plugins[name2], how }
          : null;
      };
      var subj = props && props.subject;
      if (subj && typeof subj === "object") {
        var pkg = subj.pkg;
        var direct =
          typeof pkg === "string"
            ? pkg
            : pkg && typeof pkg === "object"
              ? pkg.name
              : null;
        var hit = byPkg(direct, "subject.pkg.name");
        if (hit) return hit;
        hit = byPkg(subj.id, "subject.id=\u5305\u540D");
        if (hit) return hit;
        hit = lookupLedger(report2, subj.id);
        if (hit) return hit;
      }
      if (props && typeof props === "object") {
        var hit2 = byPkg(props.id, "props.id=\u5305\u540D");
        if (hit2) return hit2;
        hit2 = lookupLedger(report2, props.id);
        if (hit2) return hit2;
        if (props.view) {
          hit2 = byPkg(SELF_ITEM_ID, "\u81EA\u5BB6\u6761\u76EE id");
          if (hit2) return hit2;
        }
      }
      return null;
    }
    function lookupLedger(report2, id) {
      if (typeof id !== "string" || id === "") return null;
      var items = report2.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || it.id !== id) continue;
        var pkg = it.packageName || it.package || it.name;
        if (typeof pkg === "string" && report2.plugins[pkg]) {
          return {
            name: pkg,
            plugin: report2.plugins[pkg],
            how: "\u53F0\u8D26\u6761\u76EE " + id + " \u2192 " + pkg,
          };
        }
      }
      return null;
    }
    function verdictOf(plugin) {
      if (!plugin) return null;
      return VERDICT[plugin.verdict] || VERDICT.unknown;
    }
    function usePluginState() {
      return useCompatibility();
    }
    function Badge2(p) {
      var b = p.baseline;
      if (!b) return null;
      if (b.note) {
        return h(
          "div",
          {
            style: mergeStyle(styles.dim, {
              marginTop: 0,
              marginBottom: "8px",
            }),
          },
          b.note,
        );
      }
      if (b.error) {
        return h(
          "div",
          { style: styles.dim },
          "\u57FA\u7EBF\u5DEE\u5206\u6CA1\u7B97\u6210\uFF1A" + b.error,
        );
      }
      var badge = b.badge || {};
      if (!badge.show) {
        return h(
          "div",
          {
            style: mergeStyle(styles.dim, {
              marginTop: 0,
              marginBottom: "8px",
            }),
          },
          badge.detail ||
            "\u4E0E\u4E0A\u6B21\u76F8\u6BD4\u6CA1\u6709\u4EFB\u4F55\u53D8\u5316",
        );
      }
      var color =
        badge.direction === "worse"
          ? "#dc2626"
          : badge.direction === "better"
            ? "#16a34a"
            : "#6b7280";
      var diff = b.diff || {};
      var lines = [];
      (diff.worsened || []).forEach(function (e) {
        lines.push(
          "\u2193 " +
            e.name +
            "@" +
            (e.versionFrom || "?") +
            "\u2192" +
            (e.versionTo || "?") +
            "\uFF1A" +
            e.reason,
        );
        (e.newFindings || []).forEach(function (f) {
          lines.push(
            "    \u65B0\u589E\uFF1A" + f.key + " @ " + (f.location || "\u2014"),
          );
        });
      });
      (diff.improved || []).forEach(function (e) {
        lines.push("\u2191 " + e.name + "\uFF1A" + e.reason);
      });
      (diff.added || []).forEach(function (e) {
        lines.push("+ " + e.name + "@" + e.version);
      });
      (diff.removed || []).forEach(function (e) {
        lines.push("\u2212 " + e.name + "@" + e.version);
      });
      return h(
        "div",
        { style: { marginBottom: "10px" } },
        h(
          Badge,
          {
            tone:
              badge.direction === "worse"
                ? "broken"
                : badge.direction === "better"
                  ? "ok"
                  : "neutral",
          },
          badge.text,
        ),
        diff.dshVersionChanged
          ? h(
              "span",
              { style: mergeStyle(styles.dim, { marginLeft: "8px" }) },
              "DSH " +
                (diff.dshVersionFrom || "?") +
                " \u2192 " +
                (diff.dshVersionTo || "?"),
            )
          : null,
        h(
          "div",
          {
            style: mergeStyle(styles.mono, {
              marginTop: "4px",
              whiteSpace: "pre-wrap",
            }),
          },
          lines.join("\n"),
        ),
      );
    }
    function DetailSection(props) {
      try {
        return DetailSectionBody(props);
      } catch (error) {
        mark({ detailSectionError: String((error && error.message) || error) });
        return h(
          "div",
          { style: styles.err },
          "dsh-plugin-compat-check: \u6E32\u67D3\u65F6\u51FA\u9519 \u2014\u2014 " +
            String((error && error.message) || error),
        );
      }
    }
    function DetailSectionBody(props) {
      var st = usePluginState();
      var data = st.value.data;
      var hit = pickPlugin(data, props);
      if (!hit) {
        try {
          var subj = props && props.subject;
          var pkg = subj && subj.pkg;
          mark({
            detailUnmatched: {
              hasProps: Boolean(props),
              hasSubject: Boolean(subj),
              subjectKind: (subj && subj.kind) || null,
              subjectId: (subj && subj.id) || null,
              pkgType: typeof pkg,
              pkgName:
                typeof pkg === "string" ? pkg : (pkg && pkg.name) || null,
              inReport: Boolean(data && data.report && data.report.plugins),
              pluginCount:
                data && data.report && data.report.plugins
                  ? Object.keys(data.report.plugins).length
                  : 0,
            },
          });
        } catch (e) {}
      }
      mark({ detailSectionRendered: true, detailFor: hit ? hit.name : null });
      if (st.value.phase === "loading") {
        return h(
          "div",
          { style: styles.hint },
          "\u6B63\u5728\u4F53\u68C0\u2026",
        );
      }
      if (st.value.phase === "error" || !data || data.ok === false) {
        return h(
          "div",
          { style: styles.err },
          "\u62FF\u4E0D\u5230\u4F53\u68C0\u7ED3\u679C\uFF08\u8FD9\u662F\u5DE5\u5177\u7684\u95EE\u9898\uFF0C\u4E0D\u662F\u8FD9\u4E2A\u63D2\u4EF6\u7684\u7ED3\u8BBA\uFF09\uFF1A" +
            (st.value.error ||
              (data && data.error) ||
              "\u672A\u77E5\u539F\u56E0"),
        );
      }
      if (!hit) {
        return h(
          "div",
          { style: styles.dim },
          "\u8FD9\u4E2A\u63D2\u4EF6\u4E0D\u5728\u672C\u6B21\u4F53\u68C0\u8303\u56F4\u5185\uFF08\u53EF\u80FD\u5B83\u4E0D\u662F\u5E26 dsh \u6E05\u5355\u7684\u793E\u533A\u63D2\u4EF6\uFF0C\u6216\u5B83\u7684\u6761\u76EE\u7528\u4E86\u522B\u7684\u952E\u540D\uFF09\u3002\u8BF7\u4EE5\u300C\u517C\u5BB9\u6027\u300D\u603B\u89C8\u9875\u4E3A\u51C6\u3002",
        );
      }
      var pl = hit.plugin;
      var v = verdictOf(pl);
      return h(
        "div",
        { style: styles.root, "data-compat-detail": hit.name },
        h(
          "div",
          { style: styles.head },
          h(Badge, { tone: pl.verdict }, v.text),
          h(
            "span",
            { style: styles.meta },
            "dsh-plugin-compat-check \xB7 " +
              (pl.findings || []).length +
              " \u6761\u53D1\u73B0",
          ),
          h(
            "button",
            {
              style: styles.btn,
              type: "button",
              onClick: function () {
                st.reload(true);
              },
            },
            "\u91CD\u65B0\u68C0\u67E5",
          ),
        ),
        h(Findings, { plugin: pl }),
        h(EvidenceLegend),
      );
    }
    function DetailBadge(props) {
      var st = usePluginState();
      var data = st.value.data;
      var hit = pickPlugin(data, props);
      mark({
        detailBadgeRendered: true,
        detailBadgeFor: hit ? hit.name : null,
      });
      if (!hit) return null;
      var v = verdictOf(hit.plugin);
      if (!v) return null;
      return h(
        Badge,
        {
          "data-compat-detail-badge": hit.name,
          tone: hit.plugin.verdict,
          title: "dsh-plugin-compat-check",
        },
        v.text,
      );
    }
    function UpgradeDetails(p) {
      var r2 = p.result;
      if (!r2.ok)
        return h("div", { role: "status", style: styles.err }, r2.error);
      var groups = [
        ["added", "\u65B0\u589E"],
        ["worsened", "\u53D8\u91CD"],
        ["resolved", "\u6D88\u5931"],
        ["improved", "\u51CF\u8F7B"],
        ["unchanged", "\u4E0D\u53D8"],
      ];
      return h(
        "div",
        { "data-upgrade-result": "compared" },
        h(
          "p",
          null,
          "\u9759\u6001\u7248\u672C\u5BF9\u6BD4\uFF1A" +
            r2.currentVersion +
            " \u2192 " +
            r2.targetVersion,
        ),
        h(
          "p",
          { role: "status" },
          "\u65B0\u589E " +
            r2.summary.added +
            " \xB7 \u53D8\u91CD " +
            r2.summary.worsened +
            " \xB7 \u6D88\u5931 " +
            r2.summary.resolved +
            " \xB7 \u51CF\u8F7B " +
            r2.summary.improved +
            " \xB7 \u4E0D\u53D8 " +
            r2.summary.unchanged,
        ),
        !r2.summary.added && !r2.summary.worsened
          ? h(
              "p",
              { style: styles.note },
              "\u672C\u6B21\u6CA1\u6709\u53D1\u73B0\u65B0\u589E\u6216\u53D8\u91CD\u7684\u9759\u6001\u98CE\u9669\uFF1B\u76EE\u6807\u7248\u672C\u4ECD\u53EF\u80FD\u6709\u539F\u6709\u98CE\u9669\uFF0C\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u901A\u8FC7\u3002",
            )
          : null,
        groups.map(function (group) {
          return r2.changes[group[0]].length
            ? h(
                "details",
                {
                  key: group[0],
                  open: group[0] === "added" || group[0] === "worsened",
                },
                h(
                  "summary",
                  null,
                  group[1] + "\uFF08" + r2.changes[group[0]].length + "\uFF09",
                ),
                r2.changes[group[0]].map(function (entry, i) {
                  var f = entry.finding || entry.after;
                  return h(
                    "div",
                    { key: i, style: { margin: "8px 0" } },
                    h(
                      "div",
                      null,
                      entry.plugin +
                        " \xB7 " +
                        f.category +
                        " \xB7 " +
                        [f.service, f.method].filter(Boolean).join("."),
                    ),
                    h(
                      "div",
                      { style: styles.mono },
                      f.severity +
                        " / " +
                        f.certainty +
                        " / " +
                        f.impactBasis +
                        (f.location
                          ? " \xB7 " + f.location.file + ":" + f.location.line
                          : ""),
                    ),
                    entry.before
                      ? h(
                          "div",
                          { style: styles.dim },
                          "\u6B64\u524D\uFF1A" +
                            entry.before.severity +
                            " / " +
                            entry.before.certainty +
                            " / " +
                            entry.before.impactBasis,
                        )
                      : null,
                    h("div", null, f.impact),
                    h("div", { style: styles.dim }, f.basis),
                  );
                }),
              )
            : null;
        }),
        ["currentReport", "targetReport"].map(function (side) {
          var report2 = r2[side],
            s = report2.summary;
          return h(
            "details",
            { key: side },
            h(
              "summary",
              null,
              (side === "currentReport"
                ? "\u5F53\u524D\u7248\u672C"
                : "\u76EE\u6807\u7248\u672C") +
                "\u9759\u6001\u7ED3\u679C " +
                report2.dshVersion +
                " \xB7 \u4E0D\u517C\u5BB9 " +
                s.broken +
                " \xB7 \u90E8\u5206\u53EF\u7528 " +
                s.partial +
                " \xB7 \u672A\u77E5 " +
                s.unknown,
            ),
            Object.keys(report2.plugins).map(function (name2) {
              var pl = report2.plugins[name2];
              return h(
                "div",
                { key: name2, style: { margin: "8px 0" } },
                h(
                  "div",
                  null,
                  name2 +
                    "@" +
                    (pl.version || "?") +
                    " \xB7 " +
                    pl.verdict +
                    (pl.vacuous
                      ? " \xB7 \u65E0\u5DF2\u9A8C\u8BC1\u8C03\u7528"
                      : ""),
                ),
                h(Findings, { plugin: pl }),
              );
            }),
          );
        }),
        h(
          "details",
          null,
          h(
            "summary",
            null,
            "\u67E5\u770B\u8F93\u5165\u5236\u54C1\u3001\u76EE\u5F55\u6765\u6E90\u4E0E\u9884\u6D4B\u9650\u5236",
          ),
          h(
            "div",
            { style: styles.mono },
            "\u8F93\u5165 SHA-256\uFF1A" + r2.artifact.sha256,
          ),
          r2.artifact.packages.map(function (item, i) {
            return h(
              "div",
              { key: i, style: styles.mono },
              item.name +
                "@" +
                (item.version || "?") +
                " SHA-256\uFF1A" +
                item.sha256,
            );
          }),
          ["current", "target"].map(function (side) {
            var c = r2.catalogs[side];
            return h(
              "div",
              { key: side, style: styles.mono },
              "API \u76EE\u5F55\uFF1A" +
                c.version +
                " \xB7 " +
                c.file +
                " \xB7 SHA-256\uFF1A" +
                c.sha256 +
                " \xB7 \u6765\u6E90\uFF1A" +
                c.source.host +
                " / " +
                c.source.client,
            );
          }),
          h(
            "div",
            { style: styles.mono },
            "\u89C4\u5219\uFF1A" +
              r2.rules.file +
              " \xB7 SHA-256\uFF1A" +
              r2.rules.sha256,
          ),
          r2.limitations.map(function (note, i) {
            return h("div", { key: i, style: styles.note }, note);
          }),
        ),
      );
    }
    function UpgradePreview(p) {
      var target = React2.useState(""),
        state = React2.useState({ phase: "idle" }),
        generation = React2.useRef(0);
      var currentVersion = p.data.report.dshVersion;
      var reportIdentity = React2.useRef(null);
      if (
        !reportIdentity.current ||
        reportIdentity.current.report !== p.data.report
      ) {
        reportIdentity.current = {
          report: p.data.report,
          content: JSON.stringify(p.data.report),
        };
      }
      React2.useEffect(
        function () {
          generation.current++;
          state[1]({ phase: "idle" });
          return function () {
            generation.current++;
          };
        },
        [
          currentVersion,
          p.data.nodeModules,
          p.data.computedAt,
          p.data.reviews && p.data.reviews.contextToken,
          reportIdentity.current.content,
        ],
      );
      async function run() {
        var requested = String(target[0]).trim(),
          ticket = ++generation.current;
        state[1]({ phase: "loading" });
        try {
          var response = await fetch(
            "/plugin-compat-check/upgrade-preview?targetVersion=" +
              encodeURIComponent(requested) +
              "&currentVersion=" +
              encodeURIComponent(currentVersion || ""),
            {
              credentials: "same-origin",
              headers: {
                Accept: "application/json",
                "X-DSH-Compat-Request": "1",
              },
            },
          );
          if (!response.ok) throw Error("HTTP " + response.status);
          var result;
          try {
            result = UpgradeContract.assertUpgradePreview(
              await response.json(),
            );
          } catch (error) {
            throw Error(
              "\u5347\u7EA7\u9884\u68C0\u7ED3\u679C\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u786E\u8BA4\u5BBF\u4E3B\u4E0E\u5BA2\u6237\u7AEF\u7248\u672C\u4E00\u81F4\u3002",
            );
          }
          if (
            result.currentVersion !== currentVersion ||
            result.targetVersion !== requested
          )
            throw Error(
              "\u5347\u7EA7\u9884\u68C0\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u666E\u901A\u62A5\u544A\u540E\u91CD\u8BD5\u3002",
            );
          if (ticket === generation.current)
            state[1]({ phase: "done", result });
        } catch (error) {
          if (ticket === generation.current)
            state[1]({ phase: "error", error: String(error.message || error) });
        }
      }
      return h(
        "details",
        { "data-upgrade-preview": true, heading: true },
        h(
          "summary",
          { style: { cursor: "pointer" } },
          "\u5347\u7EA7\u524D\u517C\u5BB9\u6027\u9884\u68C0\uFF08\u9759\u6001\uFF09",
        ),
        h(
          "p",
          { style: styles.note },
          "\u6BD4\u8F83\u540C\u4E00\u7EC4\u5DF2\u5B89\u88C5\u5236\u54C1\u5728\u4E24\u4E2A\u7248\u672C\u76EE\u5F55\u4E0B\u7684\u9759\u6001\u98CE\u9669\u3002\u9759\u6001\u9884\u6D4B\u4E0D\u7B49\u4E8E\u76EE\u6807\u7248\u672C\u4E1A\u52A1\u901A\u8FC7\uFF1B\u4E0D\u81EA\u52A8\u5B89\u88C5\u6216\u5347\u7EA7\u3002\u5F53\u524D\u7248\u672C\uFF1A" +
            (currentVersion || "\u672A\u77E5") +
            "\u3002\u53EF\u9009\u76EE\u5F55\u7248\u672C\uFF1A" +
            UpgradeContract.SUPPORTED_PREVIEW_VERSIONS.join("\u3001"),
        ),
        h("input", {
          "aria-label": "\u76EE\u6807 DSH \u7248\u672C",
          placeholder: "\u8F93\u5165\u7CBE\u786E\u76EE\u6807\u7248\u672C",
          value: target[0],
          style: styles.btn,
          onChange: function (event) {
            generation.current++;
            target[1](event.target.value);
            state[1]({ phase: "idle" });
          },
        }),
        h(
          "button",
          {
            type: "button",
            style: styles.btn,
            disabled: state[0].phase === "loading" || !String(target[0]).trim(),
            onClick: run,
          },
          "\u8FD0\u884C\u5347\u7EA7\u9884\u68C0",
        ),
        state[0].phase === "loading"
          ? h(
              "p",
              { role: "status" },
              "\u6B63\u5728\u6355\u83B7\u76F8\u540C\u5236\u54C1\u5E76\u6BD4\u8F83\u9759\u6001\u98CE\u9669\u2026\u2026",
            )
          : null,
        state[0].phase === "error"
          ? h("p", { role: "status", style: styles.err }, state[0].error)
          : null,
        state[0].phase === "done"
          ? h(UpgradeDetails, { result: state[0].result })
          : null,
      );
    }
    function ReportPreview(p) {
      var shown = React2.useState(false),
        copied = React2.useState("");
      var text3 =
        typeof p.data.issueReport === "string" ? p.data.issueReport : null;
      return h(
        "div",
        null,
        h("h3", null, "\u6545\u969C\u62A5\u544A"),
        h(
          "button",
          {
            type: "button",
            style: styles.btn,
            onClick: function () {
              shown[1](!shown[0]);
              copied[1]("");
            },
          },
          shown[0]
            ? "\u5173\u95ED\u62A5\u544A\u9884\u89C8"
            : "\u9884\u89C8\u6545\u969C\u62A5\u544A",
        ),
        shown[0]
          ? h(
              "div",
              { style: { margin: "10px 0" } },
              h(
                "p",
                { style: styles.note },
                "\u8FD9\u662F\u672C\u6B21\u5B8C\u6574\u62A5\u544A\uFF0C\u7B5B\u9009\u4E0D\u4F1A\u5220\u51CF\u5BFC\u51FA\u5185\u5BB9\u3002\u4FDD\u7559\u63D2\u4EF6\u540D\u4E0E\u5305\u5185\u4F4D\u7F6E\uFF1B\u8BF7\u9884\u89C8\u654F\u611F\u4FE1\u606F\u540E\u518D\u5206\u4EAB\u3002",
              ),
              text3 === null
                ? h(
                    "div",
                    { role: "status" },
                    "\u5F53\u524D\u62A5\u544A\u672A\u63D0\u4F9B\u5BFC\u51FA\u6587\u672C\uFF0C\u8BF7\u5237\u65B0\u5E76\u786E\u8BA4\u5BBF\u4E3B\u4E0E\u5BA2\u6237\u7AEF\u7248\u672C\u4E00\u81F4\u3002",
                  )
                : h(
                    "div",
                    null,
                    h("textarea", {
                      "aria-label": "\u6545\u969C\u62A5\u544A\u9884\u89C8",
                      readOnly: true,
                      value: text3,
                      rows: 14,
                      style: mergeStyle(styles.mono, {
                        width: "100%",
                        boxSizing: "border-box",
                        color: "inherit",
                        background: "transparent",
                      }),
                      onFocus: function (event) {
                        event.target.select();
                      },
                    }),
                    h(
                      "button",
                      {
                        type: "button",
                        style: styles.btn,
                        onClick: async function () {
                          try {
                            if (
                              typeof navigator === "undefined" ||
                              !navigator.clipboard ||
                              !navigator.clipboard.writeText
                            )
                              throw Error("Clipboard unavailable");
                            await navigator.clipboard.writeText(text3);
                            copied[1](
                              "\u5DF2\u590D\u5236\u3002\u8BF7\u786E\u8BA4\u654F\u611F\u4FE1\u606F\u540E\u518D\u5206\u4EAB\u3002",
                            );
                          } catch (error) {
                            copied[1](
                              "\u65E0\u6CD5\u81EA\u52A8\u590D\u5236\uFF0C\u8BF7\u9009\u4E2D\u9884\u89C8\u6587\u672C\u624B\u52A8\u590D\u5236\u3002",
                            );
                          }
                        },
                      },
                      "\u590D\u5236\u62A5\u544A",
                    ),
                    h(
                      "span",
                      { role: "status", style: styles.meta },
                      copied[0],
                    ),
                  ),
            )
          : null,
      );
    }
    function ReportMeta(p) {
      var d = p.data,
        c = d.cache;
      var cache =
        c && c.hit
          ? "\u7F13\u5B58\u62A5\u544A\uFF08\u7EA6 " +
            Math.max(0, Math.round(c.ageMs / 1e3)) +
            " \u79D2\u524D\uFF09"
          : "\u672C\u6B21\u91CD\u65B0\u8BA1\u7B97\u7684\u62A5\u544A";
      if (c && c.stale)
        cache +=
          "\uFF1B\u8F93\u5165\u5DF2\u53D8\u5316\uFF0C\u62A5\u544A\u5F85\u5237\u65B0";
      if (c && c.refreshing)
        cache += "\uFF1B\u540E\u53F0\u6B63\u5728\u5237\u65B0";
      return h(
        "div",
        { className: "compat-meta compat-report-meta" },
        h(
          "div",
          null,
          "\u62A5\u544A\u65F6\u95F4\uFF1A" +
            (d.computedAt || "\u672A\u63D0\u4F9B") +
            " \xB7 " +
            cache,
        ),
        h(
          "div",
          null,
          "\u4F53\u68C0\u5BF9\u8C61\uFF1A" +
            (d.nodeModules || "\u672A\u63D0\u4F9B") +
            " \xB7 \u76EE\u6807 DSH\uFF1A" +
            (d.report.dshVersion || "\u672A\u77E5"),
        ),
        h(
          "div",
          {
            "data-catalog-status": d.report.catalog?.verified
              ? "verified"
              : "uncertified",
          },
          !d.report.catalog?.verified
            ? h(
                Alert,
                { role: "alert" },
                d.report.catalog?.warning ||
                  "API\u76EE\u5F55\u8EAB\u4EFD\u672A\u63D0\u4F9B\uFF0C\u76EE\u6807\u7248\u672C\u672A\u8BA4\u8BC1\u3002",
              )
            : null,
          h(
            "details",
            null,
            h(
              "summary",
              null,
              d.report.catalog?.verified
                ? "\u67E5\u770B\u5DF2\u8BA4\u8BC1\u76EE\u5F55\u4E0E\u6765\u6E90"
                : "\u67E5\u770B\u76EE\u5F55\u4E0E\u8986\u76D6\u9650\u5236",
            ),
            ...ReportContract.catalogLines(d.report.catalog).map((line, i) =>
              h("div", { key: i }, line),
            ),
          ),
        ),
        c && c.refreshError
          ? h(
              "div",
              { role: "status", style: styles.err },
              "\u6700\u8FD1\u5237\u65B0\u5931\u8D25\uFF0C\u4FDD\u7559\u4E0A\u6B21\u6210\u529F\u62A5\u544A\uFF1A" +
                c.refreshError,
            )
          : null,
      );
    }
    async function saveFindingReview(body) {
      var response = await fetch("/plugin-compat-check/reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-DSH-Compat-Request": "1",
        },
        body: JSON.stringify(body),
      });
      var result = await response.json();
      if (!response.ok || !result.ok || result.reviews?.error)
        throw new Error(
          result.error ||
            result.reviews?.error ||
            "\u4EBA\u5DE5\u5904\u7F6E\u4FDD\u5B58\u5931\u8D25",
        );
      return result.reviews;
    }
    function Table2(p) {
      var data = p.data;
      var report2 = data && data.report;
      var queryState = React2.useState(""),
        verdictState = React2.useState("all"),
        certaintyState = React2.useState("all"),
        pendingState = React2.useState("all"),
        risksState = React2.useState(false);
      if (!report2) return null;
      var names = Object.keys(report2.plugins);
      names.sort(function (a, b) {
        var rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
        var d =
          rank[report2.plugins[a].verdict] - rank[report2.plugins[b].verdict];
        return d !== 0 ? d : a.localeCompare(b);
      });
      var diff = data.baseline && data.baseline.diff,
        comparable = Boolean(diff && diff.comparable),
        risks = {};
      if (comparable) {
        (diff.worsened || []).forEach(function (entry) {
          risks[entry.name] = true;
        });
        (diff.added || []).forEach(function (entry) {
          if (
            report2.plugins[entry.name] &&
            report2.plugins[entry.name].findings.length
          )
            risks[entry.name] = true;
        });
      }
      var shown = names.filter(function (name2) {
        var pl = report2.plugins[name2];
        var pending =
          pl.coverage.status !== "complete" ||
          pl.vacuous ||
          (pl.clientSide || []).length > 0;
        return (
          name2
            .toLowerCase()
            .includes(String(queryState[0]).trim().toLowerCase()) &&
          (verdictState[0] === "all" || pl.verdict === verdictState[0]) &&
          (certaintyState[0] === "all" ||
            pl.findings.some(function (f) {
              return f.certainty === certaintyState[0];
            })) &&
          (pendingState[0] === "all" ||
            (pendingState[0] === "pending" ? pending : !pending)) &&
          (!risksState[0] || (comparable && risks[name2]))
        );
      });
      var s = report2.summary || {};
      function select(label, state, options) {
        return h(
          "select",
          {
            "aria-label": label,
            value: state[0],
            style: styles.btn,
            onChange: function (event) {
              state[1](event.target.value);
            },
          },
          options.map(function (option) {
            return h("option", { key: option[0], value: option[0] }, option[1]);
          }),
        );
      }
      return h(
        "div",
        { className: "compat-page" },
        h(
          Card,
          {
            className: "compat-primary",
            "aria-label": "\u517C\u5BB9\u6027\u4F53\u68C0\u7ED3\u679C",
          },
          h(
            "div",
            { className: "compat-heading" },
            h(
              "h2",
              { className: "compat-title" },
              "\u517C\u5BB9\u6027\u68C0\u67E5",
            ),
            h(
              "span",
              { className: "compat-subtitle" },
              `${names.length} \u4E2A\u5DF2\u5B89\u88C5\u63D2\u4EF6`,
            ),
            h(
              Button,
              {
                variant: "default",
                type: "button",
                onClick: () => p.onReload(),
                style: { marginLeft: "auto" },
              },
              "\u91CD\u65B0\u68C0\u67E5",
            ),
          ),
          h(
            "div",
            {
              className: "compat-metrics",
              "aria-label": "\u517C\u5BB9\u6027\u6458\u8981",
            },
            ...[
              ["broken", "\u4E0D\u517C\u5BB9"],
              ["partial", "\u90E8\u5206\u53EF\u7528"],
              ["unknown", "\u672A\u77E5"],
              ["ok", "\u53EF\u7528"],
            ].map(([key, label]) =>
              h(
                "div",
                { key },
                h("strong", null, s[key] || 0),
                h(Badge, { tone: key }, label),
              ),
            ),
          ),
          s.vacuousOk
            ? h(
                "p",
                { className: "compat-meta" },
                `${s.vacuousOk} \u4E2A\u201C\u53EF\u7528\u201D\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u8C03\u7528\uFF1B\u672A\u53D1\u73B0\u51B2\u7A81\u4E0D\u7B49\u4E8E\u4E1A\u52A1\u901A\u8FC7\u3002`,
              )
            : null,
          h(
            "div",
            { className: "compat-report-context" },
            h(ReportMeta, { data }),
            h(Badge2, { baseline: data.baseline }),
          ),
          h(Separator, { className: "compat-section-divider" }),
          h(
            "div",
            { className: "compat-toolbar" },
            h("input", {
              "aria-label": "\u641C\u7D22\u63D2\u4EF6",
              placeholder: "\u641C\u7D22\u63D2\u4EF6\u540D\u79F0",
              value: queryState[0],
              style: mergeStyle(styles.btn, { minWidth: "150px" }),
              onChange: function (event) {
                queryState[1](event.target.value);
              },
            }),
            select("\u6309\u7ED3\u8BBA\u7B5B\u9009", verdictState, [
              ["all", "\u5168\u90E8\u7ED3\u8BBA"],
              ["broken", "\u4E0D\u517C\u5BB9"],
              ["partial", "\u90E8\u5206\u53EF\u7528"],
              ["unknown", "\u672A\u77E5"],
              ["ok", "\u53EF\u7528"],
            ]),
            select("\u6309\u786E\u5B9A\u6027\u7B5B\u9009", certaintyState, [
              ["all", "\u5168\u90E8\u786E\u5B9A\u6027"],
              ["certain", "\u542B\u786E\u5B9A\u53D1\u73B0"],
              ["suspected", "\u542B\u7591\u4F3C\u53D1\u73B0"],
            ]),
            select("\u6309\u9A8C\u8BC1\u72B6\u6001\u7B5B\u9009", pendingState, [
              ["all", "\u5168\u90E8\u9A8C\u8BC1\u72B6\u6001"],
              ["pending", "\u6709\u5F85\u9A8C\u8BC1\u90E8\u5206"],
              ["complete", "\u65E0\u5F85\u9A8C\u8BC1\u90E8\u5206"],
            ]),
            h(
              "button",
              {
                type: "button",
                style: styles.btn,
                "aria-pressed": risksState[0],
                onClick: function () {
                  risksState[1](!risksState[0]);
                },
              },
              "\u672C\u6B21\u65B0\u589E\u98CE\u9669",
            ),
            h(
              "button",
              {
                type: "button",
                style: styles.btn,
                onClick: function () {
                  queryState[1]("");
                  verdictState[1]("all");
                  certaintyState[1]("all");
                  pendingState[1]("all");
                  risksState[1](false);
                },
              },
              "\u6E05\u9664\u7B5B\u9009",
            ),
          ),
          risksState[0]
            ? h(
                "div",
                { role: "status", style: styles.note },
                comparable
                  ? "\u4EC5\u663E\u793A\u57FA\u7EBF\u5DEE\u5206\u4E2D\u7684\u65B0\u589E\u6216\u53D8\u91CD\u98CE\u9669\uFF1B\u65E0\u53D8\u5316\u4E0D\u8868\u793A\u4E1A\u52A1\u901A\u8FC7\u3002"
                  : "\u5C1A\u65E0\u53EF\u6BD4\u8F83\u57FA\u7EBF\uFF1B\u672C\u89C6\u56FE\u4E0D\u80FD\u5224\u65AD\u65B0\u589E\u98CE\u9669\uFF0C\u4E0D\u8868\u793A\u6CA1\u6709\u98CE\u9669\u3002",
              )
            : null,
          h(
            "div",
            { style: styles.meta },
            "\u663E\u793A " +
              shown.length +
              " / " +
              names.length +
              " \u4E2A\u63D2\u4EF6\uFF1B\u7B5B\u9009\u4EC5\u6539\u53D8\u5448\u73B0\u3002",
          ),
          !shown.length
            ? h(
                "div",
                { role: "status", style: styles.note },
                "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u63D2\u4EF6\u3002\u6E05\u9664\u7B5B\u9009\u53EF\u67E5\u770B\u5B8C\u6574\u62A5\u544A\u3002",
              )
            : null,
          h(Separator, { className: "compat-results-divider" }),
          h(
            "div",
            { style: { overflowX: "auto" } },
            h(
              "table",
              {
                className: "compat-results",
                "aria-label": "\u63D2\u4EF6\u517C\u5BB9\u6027\u7ED3\u679C",
              },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", { style: styles.th }, "\u63D2\u4EF6"),
                  h("th", { style: styles.th }, "\u7ED3\u8BBA"),
                  h(
                    "th",
                    { style: styles.th },
                    "\u53D1\u73B0\u4E0E\u6838\u5B9E",
                  ),
                ),
              ),
              h(
                "tbody",
                null,
                shown.map(function (n) {
                  var pl = report2.plugins[n],
                    v = VERDICT[pl.verdict] || VERDICT.unknown;
                  return h(
                    "tr",
                    { key: n, "data-compat-plugin": n },
                    h(
                      "td",
                      { style: styles.td },
                      h("div", null, n),
                      h(
                        "div",
                        { style: styles.mono },
                        "@" +
                          (pl.version || "?") +
                          (pl.vacuous
                            ? " \xB7 \u65E0\u5DF2\u9A8C\u8BC1\u8C03\u7528"
                            : ""),
                      ),
                    ),
                    h(
                      "td",
                      { style: styles.td },
                      h(Badge, { tone: pl.verdict }, v.text),
                    ),
                    h(
                      "td",
                      { style: styles.td },
                      h(Coverage, { plugin: pl }),
                      h(
                        "details",
                        null,
                        h(
                          "summary",
                          { style: { cursor: "pointer", marginTop: "6px" } },
                          "\u67E5\u770B " +
                            pl.findings.length +
                            " \u6761\u53D1\u73B0\u4E0E\u672A\u9A8C\u8BC1\u9879",
                        ),
                        h(Findings, {
                          plugin: pl,
                          hideCoverage: true,
                        }),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
        h(
          "div",
          {
            className: "compat-auxiliary",
            "aria-label": "\u8F85\u52A9\u5DE5\u5177\u4E0E\u8BC1\u636E",
          },
          h(Card, { className: "p-4" }, h(ReportPreview, { data })),
          h(
            Card,
            {
              "aria-label": "\u5347\u7EA7\u524D\u517C\u5BB9\u6027\u9884\u68C0",
            },
            h(UpgradePreview, { data }),
          ),
          h(DependencyPanel, { graph: report2.dependencyGraph }),
          h(FindingReviewPanel, {
            report: report2,
            reviews: data.reviews,
            onSave: saveFindingReview,
          }),
          h(FunctionalHealthPanel, { report: report2 }),
        ),
        h(
          Card,
          {
            className: "compat-report-information",
            "aria-label":
              "\u62A5\u544A\u8BF4\u660E\u4E0E\u68C0\u67E5\u4FE1\u606F",
          },
          h(
            "h3",
            null,
            "\u62A5\u544A\u8BF4\u660E\u4E0E\u68C0\u67E5\u4FE1\u606F",
          ),
          h(EvidenceLegend),
          h(
            "div",
            { style: styles.note },
            "\u5DE5\u5177\u7248\u672C\uFF1A" +
              (data.toolVersion || "\u672A\u77E5") +
              " \xB7 " +
              (report2.hasRuntimeSurface
                ? "\u65B9\u6CD5\u7EA7\u8BC1\u636E\u542B\u5BBF\u4E3B\u8FD0\u884C\u65F6\u89C2\u6D4B\uFF1B\u4EE5\u6BCF\u6761\u53D1\u73B0\u4E3A\u51C6\u3002"
                : "\u65B9\u6CD5\u7EA7\u8BC1\u636E\u6765\u81EA\u5B98\u65B9 API \u5951\u7EA6\u76EE\u5F55\uFF0C\u9759\u6001\u4E8B\u5B9E\u5355\u72EC\u5224\u5B9A\u3002"),
          ),
          h(
            "details",
            null,
            h(
              "summary",
              { style: styles.meta },
              "\u67E5\u770B\u91C7\u6837\u4E0E\u68C0\u67E5\u4FE1\u606F",
            ),
            h(
              "div",
              { style: styles.note },
              ((report2.observation && report2.observation.notes) || []).join(
                "\uFF1B",
              ),
            ),
            h(
              "div",
              { style: styles.note },
              "\u5BF9\u8C61\u6765\u6E90\uFF1A" +
                (data.nodeModulesWhy || "\u672A\u63D0\u4F9B") +
                (data.elapsedMs !== void 0
                  ? " \xB7 \u8017\u65F6 " + data.elapsedMs + "ms"
                  : ""),
            ),
          ),
        ),
      );
    }
    function Panel() {
      var st = useCompatibility();
      var value = st.value;
      mark({
        state: value.phase,
        renders: ((window.__COMPAT_CHECK__ || {}).renders || 0) + 1,
        // 验收要能断言"角标真的按差分管了"，所以把它的状态一起标出来
        badgeShow: Boolean(
          value.data &&
            value.data.baseline &&
            value.data.baseline.badge &&
            value.data.baseline.badge.show,
        ),
        badgeText:
          (value.data &&
            value.data.baseline &&
            value.data.baseline.badge &&
            value.data.baseline.badge.text) ||
          null,
      });
      if (value.phase === "loading") {
        return h(
          "div",
          { style: styles.root },
          h(
            "div",
            { style: styles.hint },
            "\u6B63\u5728\u4F53\u68C0\u5DF2\u88C5\u63D2\u4EF6\u2026\u2026",
          ),
        );
      }
      if (value.phase === "error") {
        return h(
          "div",
          { style: styles.root },
          h(
            "div",
            { style: styles.err },
            h(
              "div",
              { style: { fontWeight: 600, marginBottom: "4px" } },
              "\u62FF\u4E0D\u5230\u4F53\u68C0\u7ED3\u679C",
            ),
            h("div", null, value.error),
            h(
              "div",
              { style: { marginTop: "6px", opacity: 0.75 } },
              "\u8FD9\u4E00\u6761\u662F\u5DE5\u5177\u672C\u8EAB\u7684\u95EE\u9898\uFF0C\u4E0D\u662F\u63D2\u4EF6\u7684\u7ED3\u8BBA \u2014\u2014 \u8BF7\u4E0D\u8981\u636E\u6B64\u5224\u65AD\u517C\u5BB9\u6027\u3002",
            ),
          ),
          h(
            "button",
            {
              style: styles.btn,
              type: "button",
              onClick: function () {
                st.reload(true);
              },
            },
            "\u91CD\u8BD5",
          ),
        );
      }
      var data = value.data;
      if (!data || data.ok === false) {
        return h(
          "div",
          { style: styles.root },
          h(
            "div",
            { style: styles.err },
            h(
              "div",
              { style: { fontWeight: 600, marginBottom: "4px" } },
              "\u4F53\u68C0\u6CA1\u8DD1\u6210",
            ),
            h("div", null, (data && data.error) || "\u672A\u77E5\u539F\u56E0"),
          ),
        );
      }
      return h(Table2, {
        data,
        onReload: function () {
          st.reload(true);
        },
      });
    }
    function apply(ctx) {
      console.log("[dsh-plugin-compat-check] CLIENT-HALF-APPLIED");
      try {
        registerSlot(
          ctx,
          SLOT,
          { name: SLOT, id: "dsh-plugin-compat-check", order: 1, label: LABEL },
          Panel,
          "tab",
        );
        registerSlot(
          ctx,
          SLOT_DETAIL,
          { name: SLOT_DETAIL, id: "dsh-plugin-compat-check/detail", order: 1 },
          DetailSection,
          "detail",
        );
        registerSlot(
          ctx,
          SLOT_DETAIL_BADGE,
          {
            name: SLOT_DETAIL_BADGE,
            id: "dsh-plugin-compat-check/detail-badge",
            order: 1,
          },
          DetailBadge,
          "detail-badge",
        );
      } catch (error) {
        console.warn(
          "[dsh-plugin-compat-check] REGISTER-THREW (outer) " + String(error),
        );
      }
    }
    var registered = [];
    function registerSlot(ctx, slot, spec, Comp, tag) {
      try {
        ctx.slots.inject(slot, function () {
          return ctx.slots.register(spec, function ThemedSlot(props) {
            return h(Scope, { inline: tag === "detail-badge" }, h(Comp, props));
          });
        });
        registered.push(slot);
        console.log("[dsh-plugin-compat-check] REGISTERED " + slot);
      } catch (error) {
        console.warn(
          "[dsh-plugin-compat-check] REGISTER-THREW " +
            slot +
            " " +
            String(error),
        );
      }
      mark({ registered: registered.slice() });
    }
    var name = "dsh-plugin-compat-check";
    var inject = ["slots"];

    return module.exports;
  },
});
