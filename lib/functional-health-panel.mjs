/** Offline UI for explicitly imported health evidence. Never starts a runner. */
export function createFunctionalHealthPanel(React, HealthContract) {
  const h = React.createElement;
  const statusLabels = {
    "tested-pass": "所选检查通过",
    "tested-failed": "所选检查失败",
    error: "检查未完成",
    pass: "通过",
    failed: "失败",
  };
  return function FunctionalHealthPanel({ report }) {
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const request = React.useRef(0);
    React.useEffect(
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
          throw new Error("记录超过大小限制（512 KiB）");
        const parsed = JSON.parse(await file.text());
        const checked = HealthContract.validateFunctionalHealthResult(parsed);
        if (!checked.valid) throw new Error(checked.errors.join("；"));
        if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined")
          throw new Error("当前浏览器无法核验记录摘要");
        const bytes = new TextEncoder().encode(
          HealthContract.canonicalFunctionalManifest(parsed.declaration),
        );
        const digest = Array.from(
          new Uint8Array(
            await globalThis.crypto.subtle.digest("SHA-256", bytes),
          ),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== parsed.identity.manifestSha256)
          throw new Error("检查声明与记录摘要不一致");
        if (request.current === id) setResult(parsed);
      } catch (reason) {
        if (request.current === id)
          setError("导入失败：" + (reason?.message || reason));
      } finally {
        if (request.current === id) setBusy(false);
      }
    };
    const artifact = result?.identity.artifact,
      current = artifact && report?.plugins?.[artifact.name];
    const versionsMatch =
      current?.version === artifact?.version &&
      report?.dshVersion === result?.identity.dshVersion;
    return h(
      "section",
      { "aria-label": "功能健康检查", style: { marginTop: "16px" } },
      h("h3", null, "功能健康检查（独立实测记录）"),
      h(
        "p",
        null,
        "在仓库CLI中显式运行所选HTTP/DOM检查后，可导入JSON记录。本面板只读取所选文件，不执行检查、安装插件或访问目标服务。",
      ),
      h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "导入功能健康检查记录",
        disabled: busy,
        onChange: load,
      }),
      busy ? h("p", { role: "status" }, "正在核验记录…") : null,
      error ? h("p", { role: "alert" }, error) : null,
      !result
        ? h(
            "p",
            null,
            "尚未导入功能实测记录。静态发现、宿主状态和业务健康是不同证据。",
          )
        : h(
            "div",
            { "data-functional-health": result.status },
            h(
              "p",
              null,
              `${artifact.name}@${artifact.version} · DSH ${result.identity.dshVersion} · ${statusLabels[result.status]}`,
            ),
            h(
              "p",
              { role: "status" },
              versionsMatch
                ? "插件与DSH版本相符；当前安装制品尚未核验，此处保留所选制品的历史记录。"
                : "记录与当前报告目标不一致或插件未安装；不用于认证当前目标。",
            ),
            h(
              "p",
              null,
              "测量时间：" + result.startedAt + " → " + result.completedAt,
            ),
            h("p", null, "制品 SHA-256：" + artifact.sha256),
            h(
              "p",
              null,
              "声明 SHA-256：" +
                result.identity.manifestSha256 +
                "；摘要校验不是作者签名或业务认证。",
            ),
            h(
              "table",
              { "aria-label": "功能健康检查结果" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, "检查与声明"),
                  h("th", null, "独立实测"),
                ),
              ),
              h(
                "tbody",
                null,
                result.checks.map((check, i) => {
                  const declaration = result.declaration.checks[i],
                    expected =
                      declaration.type === "http"
                        ? `GET ${declaration.path}，HTTP ${declaration.status}` +
                          (declaration.json
                            ? `，JSON ${declaration.json.pointer} = ${JSON.stringify(declaration.json.equals)}`
                            : "")
                        : `${declaration.path} · ${declaration.selector} · 数量 ${declaration.minCount}–${declaration.maxCount}`;
                  return h(
                    "tr",
                    { key: check.id },
                    h("td", null, `${check.id} · ${expected}`),
                    h(
                      "td",
                      null,
                      `${statusLabels[check.status] || check.status} · ${JSON.stringify(check.evidence)}`,
                    ),
                  );
                }),
              ),
            ),
            result.error ? h("p", { role: "alert" }, result.error) : null,
            h(
              "p",
              null,
              "资源清理：" +
                (result.cleanup.stopped && result.cleanup.removed
                  ? "已停止并清理自有环境"
                  : "未确认完整清理"),
            ),
            h(
              "ul",
              null,
              result.limitations.map((text, i) => h("li", { key: i }, text)),
            ),
            h(
              "p",
              null,
              "仅证明记录中的所选检查结果，不改普通兼容性结论、风险计数、基线或人工处置；不认证全部业务。",
            ),
            h(
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
              "清除健康检查记录",
            ),
          ),
    );
  };
}
