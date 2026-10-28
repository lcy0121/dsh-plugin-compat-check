/** Real shipped UI acceptance. Uses owned report/host only; never saves the draft. */
import fs from "node:fs";
import path from "node:path";
import { messages } from "../plugin/src/i18n/runtime.mjs";
export async function verifyUiI18n({
  chrome,
  evalx,
  poll,
  readReport,
  screenshotDir,
}) {
  const requireTrue = (value, message) => {
    if (!value) throw Error(message);
  };
  const before = await readReport();
  const original = await evalx(
    `({lang:document.documentElement.lang,preference:document.querySelector('[data-ui-language]').value})`,
  );
  const select = async (value) => {
    await evalx(
      `(()=>{const s=document.querySelector('[data-ui-language]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  };
  const screenshot = async (name) => {
    if (!screenshotDir) return;
    fs.mkdirSync(screenshotDir, { recursive: true });
    const result = await chrome.send("Page.captureScreenshot", {
      format: "png",
    });
    fs.writeFileSync(
      path.join(screenshotDir, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  };
  await evalx(
    `document.querySelector('[aria-label="发现的人工处置"]')?.scrollIntoView({block:'center'})`,
  );
  await poll(
    () => evalx(`!!document.querySelector('[data-review-finding] textarea')`),
    "Review editor unavailable for locale preservation acceptance",
  );
  const previousNote = await evalx(
    `document.querySelector('[data-review-finding] textarea').value`,
  );
  const note = "搜索插件 · 原始依据 <not-html> · 한국어 evidence";
  const setNote = async (value) => {
    await evalx(
      `(()=>{const e=document.querySelector('[data-review-finding] textarea');e.focus();e.select()})()`,
    );
    await chrome.send("Input.insertText", { text: value });
    await poll(
      () =>
        evalx(
          `document.querySelector('[data-review-finding] textarea')?.value===${JSON.stringify(value)}`,
        ),
      "Locale draft input did not settle",
    );
  };
  try {
    await setNote(note);
    await evalx(
      `void (window.__dscLocaleEditor=document.querySelector('[data-review-finding] textarea'))`,
    );
    await select("auto");
    await evalx(`document.documentElement.lang='en-US'`);
    await poll(
      () =>
        evalx(
          `document.querySelector('.compat-title')?.textContent==='Compatibility check'`,
        ),
      "UI did not follow host document language",
    );
    requireTrue(
      await evalx(
        `document.activeElement===window.__dscLocaleEditor && window.__dscLocaleEditor.value===${JSON.stringify(note)}`,
      ),
      "Host locale change reset focus or draft",
    );
    const metrics = [];
    for (const [locale, title] of [
      ["zh", "兼容性检查"],
      ["en", "Compatibility check"],
      ["ko", "호환성 검사"],
    ]) {
      await select(locale);
      await poll(
        () =>
          evalx(
            `document.querySelector('.compat-title')?.textContent===${JSON.stringify(title)}`,
          ),
        `Locale ${locale} did not update controls`,
      );
      requireTrue(
        await evalx(
          `window.__dscLocaleEditor===document.querySelector('[data-review-finding] textarea') && window.__dscLocaleEditor.value===${JSON.stringify(note)}`,
        ),
        "Language switch remounted or translated the draft",
      );
      await evalx(
        `document.querySelector('.compat-primary').scrollIntoView({block:'start'})`,
      );
      requireTrue(
        await evalx(
          `Array.from(document.querySelectorAll('.compat-metrics [data-slot="badge"]')).every(b=>{const r=b.getBoundingClientRect(),p=b.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1})`,
        ),
        "Translated verdict badge escaped its summary card",
      );
      if (locale === "en")
        requireTrue(
          await evalx(
            `(()=>{const b=[...document.querySelectorAll('.compat-metrics [data-slot="badge"]')].find(b=>b.textContent==='Incompatible');return b&&b.getBoundingClientRect().height<=parseFloat(getComputedStyle(b).lineHeight)+8})()`,
          ),
          "Short verdict word was split across lines",
        );
      const vocabulary = messages[locale];
      await evalx(
        `document.querySelector('[data-advanced-tools] > .compat-fold-header button[aria-expanded="false"]')?.click()`,
      );
      await evalx(
        `document.querySelector('[data-advanced-tools]').scrollIntoView({block:'end'})`,
      );
      await poll(
        () => evalx(`!!document.querySelector('.compat-file-upload')`),
        "Advanced file controls did not mount",
      );
      const layout = await evalx(`(()=>{
        const graph=document.querySelector('[aria-label=${JSON.stringify(vocabulary["依赖关系与潜在影响"])}]');
        const paragraphs=[...graph.querySelectorAll(':scope > p')].map(p=>p.textContent);
        const headers=[...document.querySelectorAll('.dsc-ui .compat-fold-header')].filter(h=>h.getBoundingClientRect().height>0).map(h=>{
          const title=h.querySelector('.compat-fold-title').getBoundingClientRect(),toggle=h.querySelector('button').getBoundingClientRect(),fold=h.parentElement,r=fold.getBoundingClientRect();
          return {centerDelta:Math.abs((title.top+title.bottom-toggle.top-toggle.bottom)/2),inset:title.left-r.left,expectedInset:16+parseFloat(getComputedStyle(fold).borderLeftWidth),framed:!fold.classList.contains('compat-disclosure')};
        });
        const editor=document.querySelector('[data-review-finding] textarea'),label=editor.parentElement,row=editor.closest('[data-review-finding]'),save=[...row.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(vocabulary["保存人工处置"])});
        const range=document.createRange();range.selectNode(label.firstChild);const labelRect=range.getBoundingClientRect(),editRect=editor.getBoundingClientRect();
        const output=document.querySelector('.compat-report-export'),table=document.querySelector('.compat-primary [data-slot="table-container"]');
        return {paragraphs,headers,noteGap:editRect.top-labelRect.bottom,saveGap:save.getBoundingClientRect().top-editRect.bottom,exportGap:output.getBoundingClientRect().top-table.getBoundingClientRect().bottom,fileLabels:[...document.querySelectorAll('.compat-file-upload')].map(e=>e.textContent)};
      })()`);
      requireTrue(
        layout.headers.length >= 8 &&
          layout.headers.every(
            (h) =>
              h.centerDelta <= 1.5 &&
              (!h.framed || Math.abs(h.inset - h.expectedInset) <= 1.5),
          ),
        "Disclosure headings have inconsistent alignment: " +
          JSON.stringify(layout.headers),
      );
      requireTrue(
        layout.noteGap >= 6 && layout.saveGap >= 10 && layout.exportGap >= 12,
        "Form or report controls touch adjacent content: " +
          JSON.stringify(layout),
      );
      requireTrue(
        layout.fileLabels.every((label) =>
          label.includes(vocabulary["选择文件"]),
        ) &&
          layout.fileLabels.some((label) =>
            label.includes(vocabulary["未选择文件"]),
          ),
        "File control follows browser language instead of plugin language: " +
          JSON.stringify(layout.fileLabels),
      );
      if (locale !== "zh")
        requireTrue(
          layout.paragraphs.every((p) => !/[\p{Script=Han}]/u.test(p)),
          "Dependency explanations retain untranslated built-in Chinese",
        );
      metrics.push({ locale, alignmentAndSpacing: layout });
      await evalx(
        `document.querySelector('[aria-label=${JSON.stringify(vocabulary["依赖关系与潜在影响"])}]').scrollIntoView({block:'start'})`,
      );
      await screenshot("ui-dependencies-" + locale);
      await evalx(
        `document.querySelector('[data-review-finding]').scrollIntoView({block:'start'})`,
      );
      await screenshot("ui-review-spacing-" + locale);
      await evalx(
        `document.querySelector('[data-advanced-tools]').scrollIntoView({block:'start'})`,
      );
      await screenshot("ui-section-alignment-" + locale);
      await evalx(
        `document.querySelector('.compat-primary').scrollIntoView({block:'start'})`,
      );
      await screenshot("ui-language-" + locale);
      if (locale !== "zh") {
        const narrow = await evalx(
          `(()=>{const fixture=document.createElement('div');fixture.className='dsc-ui';fixture.lang=${JSON.stringify(locale)};fixture.dataset.theme='dark';fixture.dataset.localeFixture='';fixture.style.cssText='position:fixed;left:10px;top:10px;width:360px;height:85vh;overflow:auto;z-index:2147483647;background:hsl(var(--dsc-background))';const original=document.querySelector('.compat-primary');const clone=original.cloneNode(true);clone.querySelectorAll('select').forEach((e,i)=>e.value=original.querySelectorAll('select')[i].value);fixture.append(clone);document.body.append(fixture);const scope=fixture.firstElementChild;return {width:fixture.clientWidth,scroll:fixture.scrollWidth,theme:getComputedStyle(scope).backgroundColor,buttonWrap:[...scope.querySelectorAll('button')].every(b=>getComputedStyle(b).whiteSpace!=='nowrap')};})()`,
        );
        requireTrue(
          narrow.scroll <= narrow.width + 2 && narrow.buttonWrap,
          "Translated controls overflowed narrow container: " +
            JSON.stringify(narrow),
        );
        metrics.push({ locale, ...narrow });
        await screenshot("ui-language-" + locale + "-narrow");
        await evalx(
          `document.querySelector('[data-locale-fixture]')?.remove()`,
        );
      }
    }
    const after = await readReport();
    requireTrue(
      JSON.stringify(before.report) === JSON.stringify(after.report) &&
        JSON.stringify(before.baseline) === JSON.stringify(after.baseline) &&
        JSON.stringify(before.reviews) === JSON.stringify(after.reviews),
      "Presentation locale changed canonical report/reviews/baseline",
    );
    return {
      realBrowser: true,
      hostLanguage: true,
      threeLanguages: true,
      draftPreserved: true,
      identityPreserved: true,
      narrowAndTheme: true,
      canonicalReportUnchanged: true,
      metrics,
    };
  } finally {
    await evalx(
      `document.querySelector('[data-locale-fixture]')?.remove();document.documentElement.lang=${JSON.stringify(original.lang)}`,
    );
    await select(original.preference);
    await setNote(previousNote);
    await evalx(`delete window.__dscLocaleEditor`);
  }
}
