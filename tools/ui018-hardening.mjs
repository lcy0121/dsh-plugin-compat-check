/** Owned acceptance for authenticated HTTP and presentation-only large pages. */
import fs from "node:fs";
import path from "node:path";
const requireTrue = (condition, message) => {
  if (!condition) throw Error(message);
};
export async function verifyHostHttpAuth({ url, headers }) {
  const token = new URL(url).searchParams.get("token");
  for (const route of [
    "/report?refresh=1",
    "/report?metadata=1",
    "/upgrade-preview?targetVersion=0.2.0-rc.2",
    "/reviews",
  ]) {
    for (const [kind, credential] of [
      ["missing", {}],
      ["forged", { Cookie: "dsh-auth-forged=v1.invalid.signature" }],
      ["launch-bearer", { Authorization: "Bearer " + token }],
      ["query-only", {}],
    ]) {
      const target = new URL("/plugin-compat-check" + route, url);
      if (kind === "query-only") target.searchParams.set("token", token);
      const response = await fetch(target, {
        method: route === "/reviews" ? "POST" : "GET",
        headers: {
          "X-DSH-Compat-Request": "1",
          ...credential,
          ...(route === "/reviews"
            ? { "content-type": "application/json" }
            : {}),
        },
        ...(route === "/reviews" ? { body: "{}" } : {}),
        signal: AbortSignal.timeout(10000),
      });
      requireTrue(
        response.status === 401,
        "Unauthenticated " +
          kind +
          " request was admitted on " +
          route.split("?")[0],
      );
      requireTrue(
        response.headers.get("cache-control") === "no-store",
        "Auth rejection was cacheable",
      );
      requireTrue(
        !(await response.text()).includes('"nodeModules"'),
        "Denied request leaked a report",
      );
    }
  }
  const response = await fetch(new URL("/acceptance/auth-expiry", url), {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const expiry = await response.json();
  requireTrue(
    response.ok && expiry.current === null && expiry.expired === 401,
    "Official signed-session expiry check failed",
  );
  return {
    realHost: true,
    missingAndForgedDenied: true,
    launchBearerAndQueryNotBypasses: true,
    officialSignedCookieExpiry: true,
    expiryClock:
      "Controlled synchronous +31 days in owned test fixture, restored immediately",
    sameOriginCookieRecovery: true,
  };
}

export async function verifyUi018Hardening({
  chrome,
  evalx,
  poll,
  profile,
  refresh,
  submitUpgrade,
  screenshotDir,
}) {
  // Inactive package copies: the host never executes these target plugins.
  for (let i = 0; i < 123; i++) {
    const name = "@hardening/upgrade-" + String(i).padStart(3, "0"),
      dir = path.join(profile, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        type: "module",
        main: "index.js",
        engines: { dsh: ">=0.2.1-rc.3" },
        peerDependencies: { "@deepseek-ai/dsh": ">=0.2.1-rc.3" },
        dsh: { bundle: { patch: "cordis.patch.yml" } },
      }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), "export function apply(){}\n");
    fs.writeFileSync(
      path.join(dir, "cordis.patch.yml"),
      "- insert:\n    - name: ./index.js\n",
    );
  }
  const name = "@hardening/dense",
    dir = path.join(profile, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "cordis.patch.yml"),
    "- insert:\n    - name: ./index.js\n",
  );
  fs.writeFileSync(
    path.join(dir, "index.js"),
    "export const inject=" +
      JSON.stringify([
        ...Array.from({ length: 123 }, (_, i) => "missingDenseService" + i),
        "hardeningBudget",
      ]) +
      ";export function apply(){}\n",
  );
  await evalx(
    `document.querySelector('.compat-primary').scrollIntoView({block:'start'});[...document.querySelectorAll('button')].find(b=>b.innerText==='清除筛选').click()`,
  );
  const data = await refresh();
  requireTrue(
    data.report.plugins[name]?.findings.length === 123,
    "Dense real report did not retain all123 findings",
  );
  requireTrue(
    data.report.observation.notes.some(
      (note) => note.includes("hardeningBudget") && note.includes("截断"),
    ),
    "Actual host sampling lost truncation coverage",
  );
  requireTrue(
    !JSON.stringify(data).includes("OWNED_VALUE_NOT_FOR_EXPORT"),
    "Sampling serialized a property value",
  );
  await evalx(
    `document.querySelector('[aria-label="搜索插件"]').focus();document.querySelector('[aria-label="搜索插件"]').select()`,
  );
  await chrome.send("Input.insertText", { text: name });
  await poll(
    () => evalx(`document.querySelectorAll('[data-compat-plugin]').length===1`),
    "Dense plugin filter failed",
  );
  await evalx(
    `document.querySelector('[aria-label="展开查看 123 条发现与未验证项"]').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelectorAll('.compat-primary [data-compat-finding]').length===50`,
      ),
    "Dense first page was not bounded",
  );
  await evalx(
    `document.querySelector('[aria-label="下一页插件发现"]').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelector('.compat-primary [data-compat-finding]')?.getAttribute('data-compat-finding')==='51'`,
      ),
    "Dense second page did not advance",
  );
  await evalx(
    `document.querySelector('[aria-label="下一页插件发现"]').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelectorAll('.compat-primary [data-compat-finding]').length===23`,
      ),
    "Dense final page missing",
  );
  await evalx(
    `[...document.querySelectorAll('button')].find(b=>b.innerText==='预览故障报告').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelector('[aria-label="故障报告预览"]')?.value.includes('missingDenseService122')`,
      ),
    "Export was truncated by finding pagination",
  );
  const preview = await submitUpgrade("0.2.0-rc.2");
  requireTrue(
    preview.summary.added >= 123,
    "Upgrade did not compare all synthetic plugins",
  );
  await poll(
    () =>
      evalx(
        `document.querySelectorAll('[data-upgrade-change="added"]').length===50`,
      ),
    "Added risk first page unbounded",
  );
  await evalx(
    `document.querySelector('[aria-label="下一页新增风险"]').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelector('[aria-label="新增风险分页"]').innerText.includes('第 2 /')`,
      ),
    "Risk next page did not advance",
  );
  await evalx(
    `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('展开目标版本静态结果')).click()`,
  );
  await poll(
    () =>
      evalx(`document.querySelectorAll('[data-upgrade-plugin]').length===50`),
    "Version inventory page unbounded",
  );
  await evalx(
    `document.querySelector('[aria-label="下一页目标版本插件"]').click()`,
  );
  await poll(
    () =>
      evalx(
        `document.querySelector('[aria-label="目标版本插件分页"]').innerText.includes('第 2 /')`,
      ),
    "Version inventory next page failed",
  );
  const elements = await evalx(
    `document.querySelector('.dsc-ui').querySelectorAll('*').length`,
  );
  requireTrue(elements < 5000, "Large sections built excessive DOM");
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(screenshotDir, "large-upgrade.png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  return {
    realBrowser: true,
    inactiveSyntheticPlugins: 124,
    findings: 123,
    findingPageSize: 50,
    finalFindingPage: 23,
    addedRiskCount: preview.summary.added,
    addedRiskPageSize: 50,
    versionPluginPageSize: 50,
    elements,
    completeExport: true,
    actualSamplingTruncation: true,
    propertyValuesAbsent: true,
  };
}
