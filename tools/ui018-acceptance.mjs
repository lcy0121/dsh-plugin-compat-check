/** Opt-in checks against the actual installed UI and its computed browser styles. */
import fs from "node:fs";
import path from "node:path";
export async function verifyUi018(chrome, evaluate, poll) {
  const requireTrue = (value, message) => {
    if (!value) throw Error(message);
  };
  const screenshot = async (name) => {
    const directory = process.env.DSC_UI018_SCREENSHOTS;
    if (!directory) return;
    fs.mkdirSync(directory, { recursive: true });
    const result = await chrome.send("Page.captureScreenshot", {
      format: "png",
    });
    fs.writeFileSync(
      path.join(directory, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  };
  const initial = await evaluate(`(()=>{
    const main=document.querySelector('table[aria-label="插件兼容性结果"]');
    const aux=document.querySelector('.compat-auxiliary');
    const folds=[...document.querySelectorAll('.compat-auxiliary [data-slot="collapsible"]')];
    return {order:!!(main&&aux&&(main.compareDocumentPosition(aux)&Node.DOCUMENT_POSITION_FOLLOWING)),
      rows:main?.querySelectorAll('[data-compat-plugin]').length, domElements:document.querySelector('.dsc-ui')?.querySelectorAll('*').length,
      collapsed:folds.length>0&&folds.every(f=>f.querySelector('button')?.getAttribute('aria-expanded')==='false'&&!f.querySelector('table')),
      styles:document.querySelectorAll('style[data-dsh-compat-styles]').length};
  })()`);
  requireTrue(
    initial.order && initial.rows > 0,
    "Primary results are absent or follow auxiliary workflows",
  );
  requireTrue(
    initial.collapsed && initial.styles === 1,
    "Auxiliary tables mounted prematurely or styles duplicated",
  );
  const originalTheme = await evaluate(
    `({className:document.documentElement.className, theme:document.documentElement.getAttribute('data-theme')})`,
  );
  const colors = {};
  const controls = {};
  try {
    for (const theme of ["light", "dark"]) {
      await evaluate(
        `(()=>{const root=document.documentElement;root.classList.remove('light','dark');root.classList.add('${theme}');root.dataset.theme='${theme}';document.querySelector('.compat-primary').scrollIntoView({block:'start'});})()`,
      );
      await poll(
        () =>
          evaluate(
            `document.querySelector('.dsc-ui')?.dataset.theme==='${theme}'`,
          ),
        "UI theme did not follow host",
      );
      colors[theme] = await evaluate(
        `getComputedStyle(document.querySelector('.compat-primary')).backgroundColor`,
      );
      const controlColors = `(()=>{const scope=document.querySelector('.dsc-ui');const probe=document.createElement('span');probe.style.cssText='color:hsl(var(--dsc-foreground));background-color:hsl(var(--dsc-background))';scope.append(probe);const expected={color:getComputedStyle(probe).color,background:getComputedStyle(probe).backgroundColor};probe.remove();const input=scope.querySelector('input');const cell=scope.querySelector('tbody td');return {expected,input:{color:getComputedStyle(input).color,background:getComputedStyle(input).backgroundColor},cell:getComputedStyle(cell).color};})()`;
      await poll(async () => {
        const c = await evaluate(controlColors);
        return (
          c.input.color === c.expected.color &&
          c.input.background === c.expected.background &&
          c.cell === c.expected.color
        );
      }, "Theme foreground or input background did not settle correctly");
      controls[theme] = await evaluate(controlColors);
      await screenshot("overview-" + theme);
    }
    requireTrue(
      colors.light !== colors.dark,
      "UI colors did not change with host theme",
    );
    await evaluate(
      `(()=>{const button=document.querySelector('[aria-label="展开插件及 loader 条目"]');button.focus();})()`,
    );
    await chrome.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      text: "\r",
      unmodifiedText: "\r",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await chrome.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await poll(
      () =>
        evaluate(
          `!!document.querySelector('table[aria-label="插件及 loader 条目"]')`,
        ),
      "Keyboard expansion did not mount loader table",
    );
    await poll(
      () =>
        evaluate(
          `getComputedStyle(document.querySelector('[aria-label="收起插件及 loader 条目"]')).backgroundColor==='rgba(0, 0, 0, 0)'`,
        ),
      "Ghost button did not retain a transparent background",
    );
    const layout = await evaluate(
      `(()=>{const table=document.querySelector('table[aria-label="插件及 loader 条目"]');const cells=table.querySelectorAll('th');return {domElements:document.querySelector('.dsc-ui')?.querySelectorAll('*').length,first:cells[0].getBoundingClientRect().width,second:cells[1].getBoundingClientRect().width,wordBreak:getComputedStyle(cells[0]).wordBreak,expanded:document.querySelector('[aria-label="收起插件及 loader 条目"]')?.getAttribute('aria-expanded')};})()`,
    );
    requireTrue(
      layout.first >= 240 &&
        layout.second >= 280 &&
        layout.wordBreak !== "break-all" &&
        layout.expanded === "true",
      "Loader columns or expansion state are unreadable",
    );
    // A disposable clone exercises the real shipped CSS with long input and a
    // narrow containing block, without changing the report or React-owned DOM.
    const narrow = await evaluate(
      `(()=>{const original=document.querySelector('table[aria-label="插件及 loader 条目"]');const fixture=document.createElement('div');fixture.className='dsc-ui';fixture.dataset.theme='dark';fixture.style.cssText='position:fixed;inset:20px auto auto 20px;width:360px;max-height:80vh;overflow:auto;z-index:2147483647;background:hsl(var(--dsc-background));padding:12px';fixture.dataset.ui018Fixture='';const wrap=original.parentElement.cloneNode(true);fixture.append(wrap);document.body.append(fixture);const cells=wrap.querySelectorAll('tbody tr td');cells[0].textContent='@organization-with-a-long-scope/dsh-plugin-long-compatibility-name';cells[1].textContent='long-loader-entry-identifier: include:genui: ACTIVE';const rect=wrap.getBoundingClientRect();return {viewport:rect.width,scroll:wrap.scrollWidth,first:cells[0].getBoundingClientRect().width,second:cells[1].getBoundingClientRect().width,wordBreak:getComputedStyle(cells[0]).wordBreak,outer:fixture.scrollWidth};})()`,
    );
    await screenshot("loader-narrow-fixture");
    requireTrue(
      narrow.viewport <= 360 &&
        narrow.scroll >= 900 &&
        narrow.first >= 240 &&
        narrow.second >= 280 &&
        narrow.outer <= 360,
      "Narrow table escaped its scroll container: " + JSON.stringify(narrow),
    );
    await evaluate(
      `document.querySelector('[data-ui018-fixture]')?.remove();document.querySelector('[aria-label="收起插件及 loader 条目"]').focus()`,
    );
    await chrome.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      text: "\r",
      unmodifiedText: "\r",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await chrome.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await poll(
      () =>
        evaluate(
          `!document.querySelector('table[aria-label="插件及 loader 条目"]') && !!document.querySelector('[aria-label="展开插件及 loader 条目"][aria-expanded="false"]')`,
        ),
      "Keyboard collapse did not remove table",
    );
    return {
      controls,
      initial,
      colors,
      layout,
      narrow,
      keyboard: true,
      syntheticLongNameFixture: true,
    };
  } finally {
    await evaluate(
      `(()=>{document.querySelector('[data-ui018-fixture]')?.remove();const root=document.documentElement;root.className=${JSON.stringify(originalTheme.className)};${originalTheme.theme === null ? "root.removeAttribute('data-theme')" : `root.setAttribute('data-theme',${JSON.stringify(originalTheme.theme)})`};})()`,
    );
  }
}
