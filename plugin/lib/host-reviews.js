/** Host reviews boundary; pure factories preserve generation ownership. */
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import { requestRejection } from "./local-request.js";
import { failureEnvelope } from "./report-contract.js";

export function createReviewRuntime({ resolveNodeModules, log, errText }) {
  async function attachFindingReviews(state, out, key, kernel) {
    try {
      const store = await import(
        pathToFileURL(join(kernel, "lib", "finding-review-store.mjs")).href
      );
      const inputIdentity = state.reportService.identityForReport(
        key,
        out.report,
      );
      if (typeof inputIdentity !== "string")
        throw new Error("当前报告缺少可绑定的分析输入身份");
      const { ReviewSidecarCache } = await import(
        pathToFileURL(join(kernel, "lib", "review-sidecar-cache.mjs")).href
      );
      state.reviewSidecars ||= new ReviewSidecarCache({ store });
      const { context, reviews } = await state.reviewSidecars.get(key, {
        report: out.report,
        inputIdentity,
        nodeModules: out.nodeModules,
        rulesIdentity: out.analysisIdentity?.rulesSha256,
        catalogIdentity: out.report.catalog?.sha256,
        toolVersion: out.toolVersion,
        signal: state.reportService.states.get(key)?.controller.signal,
      });
      if (state.disposed)
        return failureEnvelope("Plugin generation disposed / 已卸载", out);
      if (
        state.reportService.identityForReport(key, out.report) !== inputIdentity
      )
        throw new Error("报告缓存已回收或变化，请刷新后操作");
      state.reviewTargets ||= new Map();
      state.reviewTargets.set(context.contextToken, {
        context,
        key,
        report: out.report,
        nodeModules: out.nodeModules,
        store,
      });
      while (state.reviewTargets.size > 32)
        state.reviewTargets.delete(state.reviewTargets.keys().next().value);
      return { ...out, reviews };
    } catch (error) {
      return {
        ...out,
        reviews: {
          schemaVersion: 1,
          contextToken: null,
          revision: null,
          items: [],
          history: [],
          error: "人工处置记录不可用：" + errText(error),
        },
      };
    }
  }

  function readReviewRequest(req, signal, maxBytes = 16384) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let bytes = 0,
        settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.removeListener("data", data);
        req.removeListener("end", end);
        req.removeListener("error", errorEvent);
        req.removeListener("aborted", abort);
        signal.removeEventListener("abort", abort);
        if (error) {
          req.pause?.();
          reject(error);
        } else resolve(value);
      };
      const invalid = (message, status) =>
        Object.assign(new Error(message), { status });
      const data = (chunk) => {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes)
          return finish(invalid("人工处置请求超过大小限制", 413));
        chunks.push(buffer);
      };
      const end = () => {
        try {
          finish(
            null,
            JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(
                Buffer.concat(chunks),
              ),
            ),
          );
        } catch {
          finish(invalid("人工处置请求不是有效JSON", 400));
        }
      };
      const errorEvent = () => finish(invalid("人工处置请求读取失败", 400));
      const abort = () =>
        finish(invalid("人工处置请求已取消或插件已卸载", 409));
      const timer = setTimeout(
        () => finish(invalid("人工处置请求读取超时", 408)),
        5000,
      );
      timer.unref?.();
      req.on("data", data);
      req.once("end", end);
      req.once("error", errorEvent);
      req.once("aborted", abort);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      const length = req.headers?.["content-length"];
      if (
        length !== undefined &&
        (!/^\d+$/.test(String(length)) || Number(length) > maxBytes)
      )
        finish(invalid("人工处置请求超过大小限制", 413));
    });
  }

  function registerFindingReviewRoute(ctx, state) {
    if (typeof ctx.inject !== "function") return;
    ctx.inject(["webServer"], (scope) => {
      try {
        return scope.webServer.register({
          name: "dsh-plugin-compat-check/reviews",
          kind: "exact",
          path: "/plugin-compat-check/reviews",
          handler: async (req, res) => {
            const send = (status, body) => {
              res.writeHead(status, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(JSON.stringify(body));
            };
            const rejection = requestRejection(ctx, req);
            if (rejection !== null)
              return send(rejection, {
                ok: false,
                error: "请求未通过宿主身份与同源校验；请重新打开宿主登录页面",
              });
            if (req.method !== "POST")
              return send(405, { ok: false, error: "人工处置仅支持POST" });
            if (
              !/^application\/json(?:\s*;|$)/i.test(
                req.headers?.["content-type"] || "",
              )
            )
              return send(415, {
                ok: false,
                error: "人工处置需要application/json",
              });
            if (state.disposed)
              return send(409, {
                ok: false,
                error: "Plugin generation disposed / 已卸载",
              });
            const controller = new AbortController();
            state.reviewRequests ||= new Set();
            state.reviewRequests.add(controller);
            try {
              const body = await readReviewRequest(req, controller.signal);
              const target = state.reviewTargets?.get(body?.contextToken);
              if (!target)
                return send(409, {
                  ok: false,
                  error: "报告已变化，请重新检查后核实此发现",
                });
              const canCommit = async () => {
                if (state.disposed || controller.signal.aborted) return false;
                const current = resolveNodeModules();
                if (
                  !current.dir ||
                  path.resolve(current.dir) !== path.resolve(target.nodeModules)
                )
                  return false;
                return state.reportService.isCurrent(target.key, target.report);
              };
              if (!(await canCommit()))
                return send(409, {
                  ok: false,
                  error: "体检输入已变化，请重新检查后核实此发现",
                });
              const reviews = await target.store.saveReview(
                target.context,
                body,
                { canCommit },
              );
              send(200, { ok: true, reviews });
            } catch (error) {
              const status =
                error.status ||
                (error.code === "REVIEW_STALE" || error.code === "REVIEW_BUSY"
                  ? 409
                  : error.code === "REVIEW_STORAGE"
                    ? 422
                    : 400);
              send(status, { ok: false, error: errText(error) });
            } finally {
              state.reviewRequests.delete(controller);
            }
          },
        });
      } catch (error) {
        log("Review route registration failed: " + errText(error));
      }
    });
  }
  return {
    attachFindingReviews,
    readReviewRequest,
    registerFindingReviewRoute,
  };
}
