/** Actual installed UI navigation; stable context/IDs rather than row positions. */
import fs from "node:fs";
import path from "node:path";
export async function verifyReviewNavigation({
  chrome,
  evalx,
  poll,
  readReport,
  screenshotDir,
}) {
  const before = await readReport(),
    name = "@hardening/dense";
  const target = before.reviews.items.find(
    (item) => item.pluginName === name && item.findingIndex === 122,
  );
  if (!target) throw Error("Review navigation requires the full dense fixture");
  const id = JSON.stringify(target.findingId),
    token = JSON.stringify(before.reviews.contextToken);
  const input = async (label, value) => {
    await evalx(
      `(()=>{const field=document.querySelector('[aria-label="${label}"]');field.focus();field.select();})()`,
    );
    await chrome.send("Input.insertText", { text: value });
  };
  const jump = () =>
    evalx(
      `[...document.querySelectorAll('[data-review-link]')].find(b=>b.dataset.reviewLink===${id}).click()`,
    );
  await jump();
  await poll(
    () =>
      evalx(
        `document.activeElement?.dataset.reviewFinding===${id}&&document.activeElement.dataset.reviewContext===${token}`,
      ),
    "Review jump did not focus the identity-bound editor",
  );
  const details = await evalx(`document.activeElement.innerText`);
  if (
    !details.includes("类别：") ||
    !details.includes("API：") ||
    !details.includes("源码：")
  )
    throw Error("Review lost finding details");
  const count = await evalx(
    `document.querySelectorAll('[data-review-finding]').length`,
  );
  if (count > 21) throw Error("Review jump expanded all intervening editors");
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(screenshotDir, "review-navigation.png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  await input("筛选处置插件", "@nothing-matches");
  await poll(
    () =>
      evalx(`document.querySelectorAll('[data-review-finding]').length===0`),
    "Plugin review filter failed",
  );
  await evalx(
    `[...document.querySelectorAll('button')].find(b=>b.innerText==='清除处置筛选').click()`,
  );
  await input("筛选处置插件", name);
  await evalx(
    `(()=>{const select=document.querySelector('[aria-label="筛选人工状态"]');select.value='reviewed';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await poll(
    () =>
      evalx(`document.querySelectorAll('[data-review-finding]').length===0`),
    "Status review filter hid the wrong rows",
  );
  await jump();
  await poll(
    () => evalx(`document.activeElement?.dataset.reviewFinding===${id}`),
    "Repeated jump did not restore target",
  );
  await input("搜索插件", "@nothing-matches");
  await poll(
    () => evalx(`document.querySelectorAll('[data-compat-plugin]').length===0`),
    "Main filter setup failed",
  );
  await evalx(
    `[...document.querySelectorAll('[data-main-link]')].find(b=>b.dataset.mainLink===${id}).click()`,
  );
  await poll(
    () =>
      evalx(
        `document.activeElement?.dataset.findingId===${id}&&document.activeElement.dataset.findingContext===${token}&&document.activeElement.closest('[data-compat-plugin]').dataset.compatPlugin==='${name}'`,
      ),
    "Reverse jump lost source identity, page or keyboard focus",
  );
  if (
    JSON.stringify((await readReport()).report) !==
    JSON.stringify(before.report)
  )
    throw Error("Review navigation changed the original report");
  return {
    realBrowser: true,
    bidirectional: true,
    identityBound: true,
    filters: true,
    keyboardFocus: true,
    originalReportUnchanged: true,
    targetFindingIndex: 122,
    maxMountedEditors: count,
  };
}
