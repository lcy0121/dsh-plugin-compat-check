/** Real viewport acceptance for the shipped controls, not a custom popup implementation. */
import assert from "node:assert/strict";

/** CDP mouse coordinates use visual-viewport CSS pixels, not physical scaled pixels. */
export function viewportPoint(rect, viewport) {
  for (const n of [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    viewport.offsetLeft,
    viewport.offsetTop,
    viewport.width,
    viewport.height,
  ])
    assert(Number.isFinite(n), "viewport geometry must be finite");
  assert(rect.width > 0 && rect.height > 0, "control must be visible");
  const x = rect.left + rect.width / 2 - viewport.offsetLeft,
    y = rect.top + rect.height / 2 - viewport.offsetTop;
  assert(
    x >= 0 && y >= 0 && x < viewport.width && y < viewport.height,
    "control center is clipped by the visual viewport",
  );
  return { x, y };
}

/** Only finite observed offset changes count as a scroll. */
export function scrollChanged(before, after) {
  assert(
    Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length &&
      before.length > 0,
    "scroll chain missing",
  );
  for (const p of [...before, ...after])
    assert(
      Number.isFinite(p.top) && Number.isFinite(p.left),
      "invalid scroll offsets",
    );
  return before.some(
    (p, i) => p.top !== after[i].top || p.left !== after[i].left,
  );
}

export async function verifyViewportControls({ chrome, evaluate, poll }) {
  const original = await evaluate(
    `({scale:visualViewport.scale,touchPoints:navigator.maxTouchPoints})`,
  );
  assert.equal(original.scale, 1, "owned browser must start without page zoom");
  const rows = [];
  const target = `[aria-label="展开插件及 loader 条目"], [aria-label="收起插件及 loader 条目"]`;
  const scrollChain = `(()=>{const chain=[];for(let e=document.querySelector(${JSON.stringify(target)})?.parentElement;e;e=e.parentElement){const s=getComputedStyle(e);if((/(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight)||(/(auto|scroll)/.test(s.overflowX)&&e.scrollWidth>e.clientWidth))chain.push(e);}if(document.scrollingElement&&!chain.includes(document.scrollingElement))chain.push(document.scrollingElement);return chain;})()`;
  const offsets = `${scrollChain}.map(e=>({top:e.scrollTop,left:e.scrollLeft}))`;
  const originalOffsets = await evaluate(offsets);
  const click = async () => {
    const geometry = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(target)});const r=e.getBoundingClientRect(),v=visualViewport;return {rect:{left:r.left,top:r.top,width:r.width,height:r.height},viewport:{offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,width:v.width,height:v.height},expanded:e.getAttribute('aria-expanded')}})()`,
    );
    const point = viewportPoint(geometry.rect, geometry.viewport);
    await chrome.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await chrome.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await poll(
      () =>
        evaluate(
          `document.querySelector(${JSON.stringify(target)})?.getAttribute('aria-expanded')===${JSON.stringify(geometry.expanded === "true" ? "false" : "true")}`,
        ),
      "Viewport-transformed pointer did not toggle the real control",
    );
    return geometry;
  };
  try {
    await chrome.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    for (const scale of [1.25, 1.5]) {
      await chrome.send("Emulation.setPageScaleFactor", {
        pageScaleFactor: scale,
      });
      const before = await evaluate(offsets);
      await evaluate(
        `${scrollChain}.forEach(e=>{const max=e.scrollHeight-e.clientHeight;if(max>0)e.scrollTop=e.scrollTop>max/2?0:max;})`,
      );
      const displaced = await evaluate(offsets);
      assert(
        scrollChanged(before, displaced),
        "No controlled container/window scroll was observed",
      );
      await evaluate(
        `document.querySelector(${JSON.stringify(target)}).scrollIntoView({block:'center',inline:'center'})`,
      );
      await poll(
        () => evaluate(`Math.abs(visualViewport.scale-${scale})<0.01`),
        "Page zoom did not settle",
      );
      await chrome.send("Input.synthesizeScrollGesture", {
        x: 200,
        y: 200,
        xDistance: -40,
        yDistance: -30,
        speed: 400,
        gestureSourceType: "touch",
      });
      await evaluate(
        `document.querySelector(${JSON.stringify(target)}).scrollIntoView({block:'center',inline:'center'})`,
      );
      const aligned = await evaluate(offsets);
      const first = await click();
      await evaluate(
        `document.querySelector(${JSON.stringify(target)}).scrollIntoView({block:'center',inline:'center'})`,
      );
      await click();
      rows.push({
        scale,
        offsetLeft: first.viewport.offsetLeft,
        offsetTop: first.viewport.offsetTop,
        pointerToggleAndRestore: true,
        scroll: { before, displaced, aligned },
      });
      await chrome.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    }
    assert(
      rows.some((r) => r.offsetLeft > 0 || r.offsetTop > 0),
      "No actual visual viewport pan was observed",
    );
    return {
      realBrowser: true,
      pageZoom: true,
      visualViewportPan: true,
      scrolling: rows.every((r) =>
        scrollChanged(r.scroll.before, r.scroll.displaced),
      ),
      controls: rows,
      nativeControls: true,
    };
  } finally {
    await chrome.send("Emulation.setPageScaleFactor", {
      pageScaleFactor: original.scale,
    });
    await evaluate(
      `${scrollChain}.forEach((e,i)=>{const p=${JSON.stringify(originalOffsets)}[i];if(p){e.scrollTop=p.top;e.scrollLeft=p.left;}})`,
    );
    await chrome.send("Emulation.setTouchEmulationEnabled", {
      enabled: original.touchPoints > 0,
      ...(original.touchPoints > 0
        ? { maxTouchPoints: original.touchPoints }
        : {}),
    });
  }
}
