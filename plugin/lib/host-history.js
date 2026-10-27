/** Optional, authenticated local archive/snapshot management; no report recomputation. */
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { requestRejection } from "./local-request.js";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const fields = {
  "review-state": [],
  "review-export": [],
  "review-read": ["id"],
  "review-archive": ["revision", "mode", "confirm"],
  "review-import": ["data"],
  "review-delete": ["id", "confirm"],
  "snapshot-list": [],
  "snapshot-save": ["label"],
  "snapshot-read": ["id"],
  "snapshot-import": ["data"],
  "snapshot-delete": ["id", "confirm"],
};
export function createHistoryRuntime({
  resolveNodeModules,
  resolveKernelDir,
  readRequest,
  log,
  errText,
  timeoutMs = 20000,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000)
    throw Error("Invalid history deadline");
  function registerHistoryRoute(ctx, state) {
    if (typeof ctx.inject !== "function") return;
    ctx.inject(["webServer"], (scope) => {
      try {
        return scope.webServer.register({
          name: "dsh-plugin-compat-check/history",
          kind: "exact",
          path: "/plugin-compat-check/history",
          handler: async (req, res) => {
            const send = (status, body) => {
              if (res.destroyed || res.writableEnded) return;
              res.writeHead(status, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(JSON.stringify(body));
            };
            const rejected = requestRejection(ctx, req);
            if (rejected !== null)
              return send(rejected, {
                ok: false,
                error: "请求未通过宿主身份与同源校验",
              });
            if (req.method !== "POST")
              return send(405, { ok: false, error: "本地历史管理仅支持POST" });
            if (
              !/^application\/json(?:\s*;|$)/i.test(
                req.headers?.["content-type"] || "",
              )
            )
              return send(415, { ok: false, error: "需要application/json" });
            if (state.disposed)
              return send(409, { ok: false, error: "插件已卸载" });
            state.historyRequests ||= new Set();
            if (state.historyRequests.size >= 2)
              return send(503, {
                ok: false,
                error: "历史管理正在处理其他请求，请稍后重试",
              });
            const controller = new AbortController();
            state.historyRequests.add(controller);
            const started = Date.now();
            const check = () => {
              if (
                state.disposed ||
                controller.signal.aborted ||
                Date.now() - started > timeoutMs
              )
                throw Object.assign(Error("历史操作已取消或超时"), {
                  status: 409,
                });
            };
            const abort = () => controller.abort();
            req.once?.("aborted", abort);
            res.once?.("close", abort);
            const deadline = setTimeout(abort, timeoutMs);
            let rejectCancelled;
            const cancelled = new Promise((_, reject) => {
              rejectCancelled = () =>
                reject(
                  Object.assign(Error("历史操作已取消或超时"), { status: 409 }),
                );
              controller.signal.addEventListener("abort", rejectCancelled, {
                once: true,
              });
            });
            if (req.aborted || res.destroyed) controller.abort();
            try {
              const operation = async () => {
                const body = await readRequest(
                  req,
                  controller.signal,
                  8 * 1024 * 1024 + 16384,
                );
                check();
                if (
                  !body ||
                  !Object.hasOwn(fields, body.action) ||
                  Object.keys(body).sort().join(",") !==
                    [
                      "action",
                      "computedAt",
                      "contextToken",
                      ...fields[body.action],
                    ]
                      .sort()
                      .join(",") ||
                  typeof body.computedAt !== "string"
                )
                  return send(400, {
                    ok: false,
                    error: "历史管理请求字段无效",
                  });
                if (
                  [
                    "review-archive",
                    "review-delete",
                    "snapshot-delete",
                  ].includes(body.action) &&
                  body.confirm !== true
                )
                  return send(400, {
                    ok: false,
                    error: "请显式确认归档或移除操作",
                  });
                const nm = resolveNodeModules();
                if (!nm.dir) throw Error("当前目标不可用");
                const canonical = await fs.realpath(nm.dir),
                  target = hash(canonical),
                  kernel = resolveKernelDir();
                if (!kernel) throw Error("找不到判定内核");
                const load = (name) =>
                  import(pathToFileURL(path.join(kernel, "lib", name)).href);
                const [{ bounded }, archives, history] = await Promise.all([
                  load("async-boundary.mjs"),
                  load("review-archive.mjs"),
                  load("report-history.mjs"),
                ]);
                const published = [...(state.reportService?.states || [])].find(
                  ([, s]) =>
                    s.report?.computedAt === body.computedAt &&
                    path.resolve(s.report.nodeModules) === path.resolve(nm.dir),
                );
                const out = published?.[1]?.report;
                const current = async () => {
                  check();
                  const active = resolveNodeModules();
                  return (
                    !!active.dir &&
                    path.resolve(active.dir) === path.resolve(nm.dir) &&
                    (await fs.realpath(active.dir)) === canonical
                  );
                };
                const fresh = async () =>
                  (await current()) &&
                  !!out &&
                  (await state.reportService.isCurrent(
                    published[0],
                    out.report,
                  ));
                const options = { check, canCommit: current };
                const task = async () => {
                  let result;
                  const action = body.action;
                  if (action.startsWith("review-")) {
                    const bound = state.reviewTargets?.get(body.contextToken);
                    if (
                      !bound ||
                      path.resolve(bound.nodeModules) !== path.resolve(nm.dir)
                    )
                      throw Object.assign(Error("处置报告已变化，请重新加载"), {
                        status: 409,
                      });
                    const reviewOptions = {
                      ...options,
                      canCommit: async () =>
                        (await current()) &&
                        (await state.reportService.isCurrent(
                          bound.key,
                          bound.report,
                        )),
                    };
                    if (action === "review-state")
                      result = await archives.reviewArchiveState(
                        bound.context,
                        options,
                      );
                    if (action === "review-export")
                      result = await archives.exportActiveReviews(
                        bound.context,
                        options,
                      );
                    if (action === "review-read")
                      result = await archives.readReviewArchive(
                        bound.context,
                        body.id,
                        options,
                      );
                    if (action === "review-archive")
                      result = await archives.archiveReviews(
                        bound.context,
                        {
                          contextToken: body.contextToken,
                          revision: body.revision,
                          mode: body.mode,
                        },
                        reviewOptions,
                      );
                    if (action === "review-import")
                      result = await archives.importReviewArchive(
                        bound.context,
                        body.data,
                        reviewOptions,
                      );
                    if (action === "review-delete")
                      result = await archives.deleteReviewArchive(
                        bound.context,
                        body.id,
                        options,
                      );
                  } else if (action === "snapshot-list")
                    result = await history.listReportSnapshots(target, options);
                  else if (action === "snapshot-read")
                    result = await history.readReportSnapshot(
                      target,
                      body.id,
                      options,
                    );
                  else if (action === "snapshot-delete")
                    result = await history.deleteReportSnapshot(
                      target,
                      body.id,
                      options,
                    );
                  else if (action === "snapshot-import")
                    result = await history.saveReportSnapshot(
                      target,
                      body.data,
                      options,
                    );
                  else if (action === "snapshot-save") {
                    if (!out || !(await fresh()))
                      throw Object.assign(
                        Error("报告已变化，请重新检查后保存快照"),
                        { status: 409 },
                      );
                    const source = state.reportService.identityForReport(
                      published[0],
                      out.report,
                    );
                    if (typeof source !== "string")
                      throw Error("报告缺少源码身份");
                    const snapshot = {
                      schemaVersion: 1,
                      kind: "plugin-compat-check/report-snapshot",
                      computedAt: out.computedAt,
                      savedAt: new Date().toISOString(),
                      label: body.label,
                      identity: {
                        profileId: canonical,
                        originalPath: path.resolve(out.nodeModules),
                        toolVersion: out.toolVersion,
                        dshVersion: out.report.dshVersion,
                        mode: out.report.observation.mode,
                        rulesSha256: out.analysisIdentity?.rulesSha256,
                        catalogSha256: out.report.catalog?.sha256,
                        sourceSha256: hash(source),
                      },
                      report: out.report,
                    };
                    result = await history.saveReportSnapshot(
                      target,
                      snapshot,
                      {
                        ...options,
                        canCommit: fresh,
                      },
                    );
                  }
                  check();
                  return result;
                };
                const result = await bounded(task, {
                  timeoutMs,
                  signal: controller.signal,
                  label: "本地历史管理",
                });
                check();
                send(200, {
                  ok: true,
                  computedAt: body.computedAt,
                  contextToken: body.contextToken,
                  result,
                });
              };
              await Promise.race([operation(), cancelled]);
            } catch (error) {
              send(
                error.status || (error.code === "REVIEW_STALE" ? 409 : 400),
                { ok: false, error: errText(error) },
              );
            } finally {
              clearTimeout(deadline);
              controller.signal.removeEventListener("abort", rejectCancelled);
              req.removeListener?.("aborted", abort);
              res.removeListener?.("close", abort);
              controller.abort();
              state.historyRequests.delete(controller);
            }
          },
        });
      } catch (error) {
        log("History route registration failed: " + errText(error));
      }
    });
  }
  return { registerHistoryRoute };
}
