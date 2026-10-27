/** Controlled actual-browser history acceptance; only owned profile/fixtures. */
import fs from "node:fs";
import path from "node:path";
export async function verifyLocalHistory({
  chrome,
  evalx,
  poll,
  profile,
  screenshotDir,
}) {
  const requireTrue = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const baselineDir = path.join(
    path.dirname(path.dirname(profile)),
    "dsh-plugin-compat-check",
  );
  const baseline = () =>
    fs.existsSync(baselineDir)
      ? fs
          .readdirSync(baselineDir)
          .filter((n) => n.startsWith("baseline."))
          .sort()
          .map((n) => [n, fs.readFileSync(path.join(baselineDir, n), "utf8")])
      : [];
  const beforeBaseline = baseline();
  const read = () =>
    evalx(
      `fetch('/plugin-compat-check/report',{headers:{'X-DSH-Compat-Request':'1'}}).then(r=>r.json())`,
    );
  const before = await read();
  const click = async (label) => {
    await evalx(
      `[...document.querySelectorAll('button')].find(b=>b.innerText===${JSON.stringify(label)}).click()`,
    );
  };
  const field = (label) => `document.querySelector('[aria-label="${label}"]')`;
  const input = async (label, text) => {
    await evalx(`${field(label)}.focus();${field(label)}.select()`);
    await chrome.send("Input.insertText", { text });
  };
  const select = async (label, value) => {
    await evalx(
      `(()=>{const select=${field(label)};select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  };
  const upload = async (label, data, name) => {
    const cursor = chrome.events.length;
    const file = path.join(profile, name);
    fs.writeFileSync(file, JSON.stringify(data) + "\n", { mode: 0o600 });
    try {
      const document = await chrome.send("DOM.getDocument", {});
      const node = await chrome.send("DOM.querySelector", {
        nodeId: document.root.nodeId,
        selector: `input[aria-label="${label}"]`,
      });
      await chrome.send("DOM.setFileInputFiles", {
        nodeId: node.nodeId,
        files: [file],
      });
      await poll(() => {
        const request = chrome.events
          .slice(cursor)
          .find(
            (e) =>
              e.method === "Network.requestWillBeSent" &&
              e.params?.request?.url?.includes("/plugin-compat-check/history"),
          );
        if (!request) return false;
        return chrome.events
          .slice(cursor)
          .some(
            (e) =>
              e.method === "Network.loadingFinished" &&
              e.params.requestId === request.params.requestId,
          );
      }, "History import did not finish its authenticated request");
    } finally {
      fs.rmSync(file, { force: true });
    }
  };
  requireTrue(
    !chrome.events.some(
      (e) =>
        e.method === "Network.requestWillBeSent" &&
        e.params?.request?.url?.includes("/plugin-compat-check/history"),
    ),
    "History requested without an explicit action",
  );
  await evalx(
    `document.querySelector('[aria-label="展开人工处置记录管理"]').scrollIntoView({block:'center'});document.querySelector('[aria-label="展开人工处置记录管理"]').click()`,
  );
  await click("加载处置容量与归档");
  await poll(
    () =>
      evalx(
        `!![...document.querySelectorAll('button')].find(b=>b.innerText==='预览导出活动处置')`,
      ),
    "Review management did not load",
  );
  await click("预览导出活动处置");
  await poll(
    () => evalx(`!!${field("历史JSON导出预览")}`),
    "Active export preview missing",
  );
  const exported = JSON.parse(
    await evalx(`${field("历史JSON导出预览")}.value`),
  );
  requireTrue(
    exported.document.records.length > 0,
    "Owned review fixture has no saved record",
  );
  await click("关闭导出预览");
  await click("归档全部处置");
  requireTrue(
    (await read()).reviews.items.some(
      (i) => i.status === "reviewed" || i.status === "needs-review",
    ) || exported.document.records.length > 0,
    "Unexpected pre-archive state",
  );
  await click("确认归档或移除");
  await poll(
    async () => !(await read()).reviews.items.some((i) => i.record),
    "Archive failed to free active status",
  );
  await poll(
    () =>
      evalx(
        `!![...document.querySelectorAll('button')].find(b=>b.innerText==='查看或恢复为参考')`,
      ),
    "Archive listing missing",
  );
  await click("查看或恢复为参考");
  await poll(
    () =>
      evalx(
        `document.body.innerText.includes('历史处置参考（不是当前已复核）')`,
      ),
    "Reference-only view missing",
  );
  await upload(
    "导入处置归档（仅参考）",
    exported,
    ".owned-review-history.json",
  );
  await poll(
    () => evalx(`${field("导入处置归档（仅参考）")}.value===''`),
    "Archive import did not finish",
  );
  requireTrue(
    !(await read()).reviews.items.some((i) => i.record),
    "Import promoted old reviewed status",
  );
  await evalx(
    `document.querySelector('[aria-label="展开本地历史报告与趋势"]').scrollIntoView({block:'center'});document.querySelector('[aria-label="展开本地历史报告与趋势"]').click()`,
  );
  for (const label of ["owned-before", "owned-after"]) {
    await input("快照备注", label);
    await click("保存当前报告快照");
    await poll(
      () =>
        evalx(
          `!![...document.querySelectorAll('article')].find(a=>a.innerText.includes(${JSON.stringify(label)})&&a.innerText.includes('查看快照'))`,
        ),
      "Explicit snapshot was not listed",
    );
  }
  const options = await evalx(
      `[...${field("对照起点快照")}.options].filter(o=>o.value).map(o=>({id:o.value,label:o.textContent}))`,
    ),
    a = options.find((o) => o.label.includes("owned-before")),
    b = options.find((o) => o.label.includes("owned-after"));
  await select("对照起点快照", a.id);
  await select("对照终点快照", b.id);
  await click("对照两份历史报告");
  await poll(
    () =>
      evalx(
        `document.body.innerText.includes('仅为相同判定身份的历史静态/观测报告差分')`,
      ),
    "Comparable history diff missing",
  );
  await evalx(
    `[...document.querySelectorAll('article')].find(a=>a.innerText.includes('owned-before')&&a.innerText.includes('查看快照')).querySelector('button').click()`,
  );
  await poll(
    () => evalx(`document.body.innerText.includes('历史报告明细')`),
    "Historical report view missing",
  );
  await click("预览导出历史快照");
  await poll(
    () => evalx(`!!${field("历史JSON导出预览")}`),
    "Snapshot export preview missing",
  );
  const snapshot = JSON.parse(
    await evalx(`${field("历史JSON导出预览")}.value`),
  );
  requireTrue(
    JSON.stringify(snapshot.report) === JSON.stringify(before.report),
    "Saved snapshot lost original report",
  );
  await click("关闭导出预览");
  const different = structuredClone(snapshot);
  different.label = "owned-different-rules";
  different.identity.rulesSha256 = "e".repeat(64);
  await upload(
    "导入历史快照（不认证当前）",
    different,
    ".owned-report-history.json",
  );
  await poll(
    () =>
      evalx(
        `[...${field("对照终点快照")}.options].some(o=>o.textContent.includes('owned-different-rules'))`,
      ),
    "Snapshot import missing",
  );
  const other = await evalx(
    `[...${field("对照终点快照")}.options].find(o=>o.textContent.includes('owned-different-rules')).value`,
  );
  await select("对照终点快照", other);
  await click("对照两份历史报告");
  await poll(
    () =>
      evalx(
        `document.body.innerText.includes('仅可并列阅读，不判断改善或恶化')`,
      ),
    "Mismatched criteria were presented as a trend",
  );
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await evalx(`${field("对照终点快照")}.scrollIntoView({block:'center'})`);
    const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(screenshotDir, "local-history.png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  await evalx(
    `[...document.querySelectorAll('article')].find(a=>a.innerText.includes('owned-different-rules')&&a.innerText.includes('移除快照')).querySelectorAll('button')[1].click()`,
  );
  await click("确认移除快照");
  await poll(
    () =>
      evalx(
        `![...${field("对照终点快照")}.options].some(o=>o.textContent.includes('owned-different-rules'))`,
      ),
    "Explicit snapshot delete failed",
  );
  requireTrue(
    JSON.stringify((await read()).report) === JSON.stringify(before.report),
    "History operations changed original report",
  );
  requireTrue(
    JSON.stringify(baseline()) === JSON.stringify(beforeBaseline),
    "History operations advanced baseline bytes",
  );
  return {
    realBrowser: true,
    explicitSnapshotSave: true,
    archiveCapacityFreed: true,
    referenceImportOnly: true,
    fullExportPreview: true,
    comparison: true,
    criteriaMismatchNeutral: true,
    explicitDelete: true,
    originalReportAndBaselineUnchanged: true,
  };
}
