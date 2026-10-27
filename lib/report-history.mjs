/** Explicit local snapshot persistence. Never writes or advances compatibility baselines. */
import {
  REPORT_HISTORY_LIMITS,
  validateReportSnapshot,
} from "./report-history-contract.mjs";
import {
  getContent,
  historyHash,
  historyId,
  historyFault,
  contentObjects,
  putContent,
  removeContent,
  historyLock,
  assertHistoryCommit,
} from "./local-history-store.mjs";
function objects(target, options) {
  return contentObjects(
    "report-snapshot",
    target,
    REPORT_HISTORY_LIMITS.files,
    REPORT_HISTORY_LIMITS.fileBytes,
    REPORT_HISTORY_LIMITS.totalBytes,
    options,
  ).map((x) => {
    validateReportSnapshot(x.data);
    if (historyHash(x.data.identity.profileId) !== target)
      throw historyFault("Snapshot target mismatch / 快照目标与当前对象不同");
    return x;
  });
}
export async function listReportSnapshots(target, options = {}) {
  const all = objects(target, options);
  return {
    items: all
      .map((x) => ({
        id: x.id,
        savedAt: x.data.savedAt,
        computedAt: x.data.computedAt,
        label: x.data.label,
        identity: x.data.identity,
        summary: x.data.report.summary,
        plugins: Object.keys(x.data.report.plugins),
        bytes: x.bytes,
      }))
      .sort(
        (a, b) =>
          b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id),
      ),
    capacity: {
      records: all.length,
      recordLimit: REPORT_HISTORY_LIMITS.files,
      bytes: all.reduce((n, x) => n + x.bytes, 0),
      byteLimit: REPORT_HISTORY_LIMITS.totalBytes,
      fileByteLimit: REPORT_HISTORY_LIMITS.fileBytes,
    },
  };
}
export async function saveReportSnapshot(target, data, options = {}) {
  validateReportSnapshot(data);
  if (!historyId(target) || historyHash(data.identity.profileId) !== target)
    throw historyFault("Snapshot target mismatch / 快照目标与当前对象不同");
  const held = historyLock("report-snapshot", target, options);
  try {
    const all = objects(target, options),
      bytes = Buffer.byteLength(JSON.stringify(data) + "\n"),
      id = historyHash(JSON.stringify(data) + "\n");
    if (
      !all.some((x) => x.id === id) &&
      (all.length >= REPORT_HISTORY_LIMITS.files ||
        all.reduce((n, x) => n + x.bytes, 0) + bytes >
          REPORT_HISTORY_LIMITS.totalBytes)
    )
      throw historyFault("历史报告容量已满；请先导出并显式移除不再保留的快照");
    await assertHistoryCommit(options);
    putContent(
      "report-snapshot",
      target,
      data,
      REPORT_HISTORY_LIMITS.fileBytes,
      options,
    );
    return listReportSnapshots(target, options);
  } finally {
    held.release();
  }
}
export async function readReportSnapshot(target, id, options = {}) {
  if (!historyId(id)) throw historyFault("Invalid snapshot ID");
  const found = getContent(
    "report-snapshot",
    target,
    id,
    REPORT_HISTORY_LIMITS.fileBytes,
    options,
  );
  validateReportSnapshot(found.data);
  if (historyHash(found.data.identity.profileId) !== target)
    throw historyFault("Snapshot target mismatch / 快照目标与当前对象不同");
  return { id, historicalOnly: true, data: found.data };
}
export async function deleteReportSnapshot(target, id, options = {}) {
  const held = historyLock("report-snapshot", target, options);
  try {
    await assertHistoryCommit(options);
    removeContent(
      "report-snapshot",
      target,
      id,
      REPORT_HISTORY_LIMITS.fileBytes,
      options,
    );
    return listReportSnapshots(target, options);
  } finally {
    held.release();
  }
}
