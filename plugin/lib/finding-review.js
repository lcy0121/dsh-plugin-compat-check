// Generated from lib/finding-review.mjs; run node plugin/scripts/stage-contract.mjs
/** Browser-safe manual-review contract. Reviews never modify canonical findings. */
export const REVIEW_STATUS_LABELS = Object.freeze({
  pending: "待确认",
  reviewed: "已复核",
  "false-positive": "误报",
  fixed: "已修复",
  "needs-review": "待重审",
});
export const REVIEW_LIMITS = Object.freeze({
  fileBytes: 1024 * 1024,
  records: 1000,
  note: 4000,
  findings: 5000,
  identityBytes: 128 * 1024,
});
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const hash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const safe = (x) =>
  typeof x === "string" &&
  !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
    x,
  );
function fail(message) {
  throw Object.assign(new Error(message), { code: "REVIEW_INVALID" });
}
export function stableIdentity(value) {
  const seen = new Set();
  let nodes = 0;
  function visit(x, depth = 0) {
    if (++nodes > 50000 || depth > 30) fail("Review identity exceeds limits");
    if (x === null || typeof x === "string" || typeof x === "boolean") return x;
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x !== "object" || seen.has(x)) fail("Invalid review identity");
    seen.add(x);
    const out = Array.isArray(x)
      ? x.map((v) => visit(v, depth + 1))
      : Object.fromEntries(
          Object.keys(x)
            .sort()
            .filter((k) => x[k] !== undefined)
            .map((k) => [k, visit(x[k], depth + 1)]),
        );
    seen.delete(x);
    return out;
  }
  const result = JSON.stringify(visit(value));
  if (result.length > REVIEW_LIMITS.identityBytes)
    fail("Review identity exceeds limits");
  return result;
}
export function validateReviewInput(input) {
  if (
    !object(input) ||
    Object.keys(input).sort().join(",") !== "contextToken,findingId,note,status"
  )
    fail("Invalid review fields");
  if (!hash(input.contextToken) || !hash(input.findingId))
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
export function validateReviewDocument(doc) {
  if (
    !object(doc) ||
    Object.keys(doc).sort().join(",") !== "records,revision,schemaVersion" ||
    doc.schemaVersion !== 1 ||
    !hash(doc.revision) ||
    !Array.isArray(doc.records) ||
    doc.records.length > REVIEW_LIMITS.records
  )
    fail("Invalid review storage");
  const seen = new Set();
  for (const record of doc.records) {
    if (
      !object(record) ||
      Object.keys(record).sort().join(",") !==
        "findingId,identity,lineage,note,pluginName,pluginVersion,status,updatedAt"
    )
      fail("Invalid review record");
    validateReviewInput({
      contextToken: doc.revision,
      findingId: record.findingId,
      status: record.status,
      note: record.note,
    });
    if (
      !safe(record.pluginName) ||
      !record.pluginName ||
      record.pluginName.length > 500 ||
      !safe(record.pluginVersion) ||
      !record.pluginVersion ||
      record.pluginVersion.length > 200 ||
      typeof record.identity !== "string" ||
      record.identity.length > REVIEW_LIMITS.identityBytes ||
      typeof record.lineage !== "string" ||
      record.lineage.length > 2000 ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      seen.has(record.findingId)
    )
      fail("Invalid review record identity");
    const binding = JSON.parse(record.identity);
    if (
      !object(binding) ||
      !object(binding.scope) ||
      !object(binding.finding) ||
      binding.pluginName !== record.pluginName ||
      binding.pluginVersion !== record.pluginVersion ||
      !safe(binding.finding.category) ||
      !binding.finding.category ||
      [
        "profileId",
        "originalPath",
        "mode",
        "toolVersion",
        "dshVersion",
        "rulesIdentity",
        "catalogIdentity",
        "sourceIdentity",
      ].some((key) => !safe(binding.scope[key]) || !binding.scope[key]) ||
      stableIdentity(binding) !== record.identity ||
      stableIdentity([
        record.pluginName,
        binding.finding.category,
        binding.finding.service ?? null,
        binding.finding.method ?? null,
      ]) !== record.lineage
    )
      fail("Invalid review binding");
    seen.add(record.findingId);
  }
  return doc;
}
/** Validate an optional API sidecar without trusting it to be a renderable review. */
export function validateReviewEnvelope(value, report) {
  try {
    const keys = (x, want) =>
      object(x) && Object.keys(x).sort().join(",") === want;
    const text = (x, max) => safe(x) && x.length > 0 && x.length <= max;
    const note = (x) => safe(x) && x.length <= REVIEW_LIMITS.note;
    const manual = (x) =>
      Object.hasOwn(REVIEW_STATUS_LABELS, x) && x !== "needs-review";
    const record = (r, summary = false) =>
      keys(
        r,
        summary
          ? "findingId,note,noteTruncated,pluginName,pluginVersion,status,updatedAt"
          : "findingId,note,pluginName,pluginVersion,status,updatedAt",
      ) &&
      hash(r.findingId) &&
      text(r.pluginName, 500) &&
      text(r.pluginVersion, 200) &&
      manual(r.status) &&
      note(r.note) &&
      (r.status === "pending" ||
        r.note.trim().length > 0 ||
        (summary && r.noteTruncated)) &&
      text(r.updatedAt, 40) &&
      Number.isFinite(Date.parse(r.updatedAt)) &&
      (!summary ||
        (typeof r.noteTruncated === "boolean" && r.note.length <= 200));
    if (
      !keys(value, "contextToken,error,history,items,revision,schemaVersion") ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > REVIEW_LIMITS.findings ||
      !Array.isArray(value.history) ||
      value.history.length > REVIEW_LIMITS.records ||
      !(value.error === null || text(value.error, 4000))
    )
      return false;
    if (value.error && value.contextToken === null && value.revision === null)
      return value.items.length === 0 && value.history.length === 0;
    if (!hash(value.contextToken) || !hash(value.revision)) return false;
    const seenSlots = new Set(),
      seenHistory = new Set();
    for (const item of value.items) {
      if (
        !keys(
          item,
          "findingId,findingIndex,history,historyCount,note,pluginName,pluginVersion,record,reviewReason,status",
        ) ||
        !hash(item.findingId) ||
        !text(item.pluginName, 500) ||
        !text(item.pluginVersion, 200) ||
        !Number.isSafeInteger(item.findingIndex) ||
        item.findingIndex < 0 ||
        !Object.hasOwn(REVIEW_STATUS_LABELS, item.status) ||
        !note(item.note) ||
        !Array.isArray(item.history) ||
        item.history.length > 3 ||
        !Number.isSafeInteger(item.historyCount) ||
        item.historyCount < item.history.length ||
        item.historyCount > REVIEW_LIMITS.records ||
        !(item.reviewReason === null || text(item.reviewReason, 4000))
      )
        return false;
      const slot = JSON.stringify([item.pluginName, item.findingIndex]);
      if (seenSlots.has(slot)) return false;
      seenSlots.add(slot);
      if (report) {
        const plugin = report.plugins?.[item.pluginName];
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
          !record(item.record) ||
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
      const local = new Set();
      for (const previous of item.history) {
        if (
          !record(previous, true) ||
          previous.findingId === item.findingId ||
          previous.pluginName !== item.pluginName ||
          local.has(previous.findingId)
        )
          return false;
        local.add(previous.findingId);
      }
    }
    for (const previous of value.history) {
      if (!record(previous) || seenHistory.has(previous.findingId))
        return false;
      seenHistory.add(previous.findingId);
    }
    if (report) {
      let count = 0;
      for (const plugin of Object.values(report.plugins || {})) {
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
/** Exact identity includes evidence; lineage only offers old records as review history. */
export function combineReviews(
  context,
  records,
  { revision = "0".repeat(64), error = null } = {},
) {
  const byId = new Map(),
    byLineage = new Map(),
    currentIds = new Set(context.findings.map((f) => f.findingId));
  const publicRecord = (r) => ({
    findingId: r.findingId,
    pluginName: r.pluginName,
    pluginVersion: r.pluginVersion,
    status: r.status,
    note: r.note,
    updatedAt: r.updatedAt,
  });
  for (const record of records) {
    byId.set(record.findingId, record);
    if (!byLineage.has(record.lineage)) byLineage.set(record.lineage, []);
    byLineage.get(record.lineage).push(record);
  }
  const items = context.findings.map((entry) => {
    const exact = byId.get(entry.findingId);
    const record =
      exact?.identity === entry.identity ? publicRecord(exact) : null;
    const previous = byLineage.get(entry.lineage) || [];
    const historyCount = previous.length - (exact ? 1 : 0);
    // Keep row summaries bounded; the independent history retains each full note once.
    const history = [];
    for (let i = previous.length - 1; i >= 0 && history.length < 3; i--) {
      if (previous[i].findingId === entry.findingId) continue;
      const old = publicRecord(previous[i]);
      history.push({
        ...old,
        note: old.note.slice(0, 200),
        noteTruncated: old.note.length > 200,
      });
    }
    return {
      findingId: entry.findingId,
      pluginName: entry.pluginName,
      pluginVersion: entry.pluginVersion,
      findingIndex: entry.findingIndex,
      status: record?.status || (historyCount ? "needs-review" : "pending"),
      note: record?.note || "",
      record,
      history,
      historyCount,
      reviewReason: historyCount
        ? "插件源码或版本、规则、目录、工具、观察目标或发现证据已变化；旧处置仅供参考，需要重新核实。"
        : null,
    };
  });
  return {
    schemaVersion: 1,
    contextToken: context.contextToken,
    revision,
    error,
    items,
    history: records
      .filter((r) => !currentIds.has(r.findingId))
      .map(publicRecord),
  };
}
