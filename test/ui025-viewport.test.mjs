import test from "node:test";
import assert from "node:assert/strict";
import { viewportPoint, scrollChanged } from "../tools/ui025-viewport.mjs";
test("pointer geometry accounts for visual pan without multiplying by page zoom", () => {
  const rect = { left: 100, top: 90, width: 20, height: 20 };
  assert.deepEqual(
    viewportPoint(rect, {
      offsetLeft: 51,
      offsetTop: 20,
      width: 600,
      height: 400,
      scale: 1.5,
    }),
    { x: 59, y: 80 },
  );
  assert.deepEqual(
    viewportPoint(rect, {
      offsetLeft: 0,
      offsetTop: 0,
      width: 1000,
      height: 700,
    }),
    { x: 110, y: 100 },
  );
});
test("clipped, hidden or unknown controls cannot be counted as a successful UI pointer check", () => {
  const viewport = { offsetLeft: 51, offsetTop: 20, width: 600, height: 400 };
  for (const rect of [
    { left: 0, top: 0, width: 20, height: 20 },
    { left: 700, top: 100, width: 20, height: 20 },
    { left: 100, top: 100, width: 0, height: 20 },
    { left: NaN, top: 100, width: 20, height: 20 },
  ])
    assert.throws(() => viewportPoint(rect, viewport));
});

test("scroll evidence requires actual finite container or window offset change", () => {
  assert.equal(
    scrollChanged([{ top: 0, left: 0 }], [{ top: 20, left: 0 }]),
    true,
  );
  assert.equal(
    scrollChanged([{ top: 20, left: 0 }], [{ top: 20, left: 0 }]),
    false,
  );
  assert.throws(() => scrollChanged([], []));
  assert.throws(() =>
    scrollChanged([{ top: 0, left: 0 }], [{ top: NaN, left: 0 }]),
  );
});
