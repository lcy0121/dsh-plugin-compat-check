/** Host http boundary; pure factories preserve generation ownership. */
import { requestRejection } from "./local-request.js";
import { failureEnvelope } from "./report-contract.js";

export function createHttpRuntime({
  serveReport,
  serveUpgradePreview,
  log,
  errText,
}) {
  function registerUpgradeRoute(ctx, state) {
    if (typeof ctx.inject !== "function") return;
    ctx.inject(["webServer"], (scope) => {
      try {
        return scope.webServer.register({
          name: "dsh-plugin-compat-check/upgrade-preview",
          kind: "exact",
          path: "/plugin-compat-check/upgrade-preview",
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
                error: "请求未通过宿主身份与同源校验；请重新打开宿主登录页面",
              });
            if (req.method !== "GET")
              return send(405, { error: "升级预检仅支持 GET" });
            try {
              const url = new URL(req.url || "/", "http://127.0.0.1");
              const invalid =
                (req.url || "").length > 2048 ||
                [...url.searchParams.keys()].some(
                  (k) => !["targetVersion", "currentVersion"].includes(k),
                );
              const out = await serveUpgradePreview(state, {
                targetVersion: url.searchParams.get("targetVersion"),
                currentVersion: url.searchParams.get("currentVersion"),
                invalidRequest: invalid ? "升级预检请求参数无效" : null,
              });
              send(200, out);
            } catch (error) {
              send(500, {
                error: "升级预检无法完成，请在本机核对插件与宿主版本",
              });
            }
          },
        });
      } catch (error) {
        log("Upgrade preview route registration failed: " + errText(error));
      }
    });
  }
  function registerReportRoute(ctx, state) {
    try {
      if (typeof ctx.inject === "function") {
        ctx.inject(["webServer"], (scope) => {
          try {
            const dispose = scope.webServer.register({
              name: "dsh-plugin-compat-check",
              kind: "exact",
              path: "/plugin-compat-check/report",
              handler: async (req, res) => {
                // 体检结论是本机信息（装了哪些插件、用了哪些 API），
                // 不该被这台机器上的任意页面读到。
                const rejection = requestRejection(ctx, req);
                if (rejection !== null) {
                  res.writeHead(rejection, {
                    "content-type": "application/json; charset=utf-8",
                    "cache-control": "no-store",
                  });
                  res.end(
                    JSON.stringify({
                      error:
                        "请求未通过宿主身份与同源校验；请重新打开宿主登录页面",
                    }),
                  );
                  return;
                }
                if (req.method !== "GET") {
                  res.writeHead(405, {
                    "content-type": "application/json; charset=utf-8",
                    "cache-control": "no-store",
                  });
                  res.end(JSON.stringify({ error: "体检报告仅支持 GET" }));
                  return;
                }
                try {
                  const url = new URL(req.url || "/", "http://127.0.0.1");
                  const force = url.searchParams.get("refresh") === "1";
                  const out = await serveReport(state, ctx, force);
                  res.writeHead(200, {
                    "content-type": "application/json; charset=utf-8",
                    "cache-control": "no-store",
                  });
                  res.end(
                    JSON.stringify(
                      url.searchParams.get("metadata") === "1" && out.ok
                        ? {
                            kind: "plugin-compat-check/report-metadata",
                            ok: true,
                            computedAt: out.computedAt,
                            nodeModules: out.nodeModules,
                            dshVersion: out.report.dshVersion,
                            cache: out.cache || null,
                            reviewsRevision: out.reviews?.revision || null,
                            reviewsError: out.reviews?.error || null,
                            reviewsContextToken:
                              out.reviews?.contextToken || null,
                          }
                        : out,
                    ),
                  );
                } catch (error) {
                  // 连处理器里都不抛：把错误变成一条可读的 JSON，而不是 500 空响应。
                  res.writeHead(200, {
                    "content-type": "application/json; charset=utf-8",
                  });
                  res.end(JSON.stringify(failureEnvelope(errText(error))));
                }
              },
            });
            log("C2 route registered: GET /plugin-compat-check/report");
            return dispose;
          } catch (error) {
            log(`WARN C2 route registration failed: ${errText(error)}`);
          }
        });
      } else {
        log("C2 route skipped: ctx.inject is not a function");
      }
    } catch (error) {
      log(`WARN C2 route setup threw: ${errText(error)}`);
    }
  }

  return { registerUpgradeRoute, registerReportRoute };
}
