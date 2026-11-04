import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync("plugin/index.js", "utf8");
const body = source.slice(
  source.indexOf("function strictToolJson("),
  source.indexOf("\nfunction registerTool("),
);
function result(value) {
  return vm.runInNewContext(`${body};toolResult(input,'evidence')`, {
    input: value,
  });
}
test("required nullable tool fields are explicit null", () => {
  const r = result({ ok: true, exitCode: 0 });
  for (const k of ["error", "toolVersion", "report", "baseline"])
    assert.equal(r[k], null);
});
test("tool result rejects non JSON evidence rather than dropping it", () => {
  for (const value of [NaN, Infinity, 1n, new Date(), new Map(), undefined])
    assert.throws(
      () => result({ ok: true, exitCode: 0, report: { finding: value } }),
      /JSON/,
    );
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => result({ ok: true, exitCode: 0, report: cycle }), /JSON/);
});
test("arrays reject evidence lost by JSON while preserving dense arrays and repeated references", () => {
  const extra = [];
  extra.extra = "evidence";
  const badKeys = ["01", "-1", "1.0", "4294967295"];
  const invalid = [
    extra,
    new Array(1),
    ...badKeys.map((key) => {
      const a = [];
      a[key] = "evidence";
      return a;
    }),
  ];
  const symbol = [];
  symbol[Symbol("evidence")] = 1;
  invalid.push(symbol);
  let invoked = false;
  const getter = [];
  Object.defineProperty(getter, "0", {
    get() {
      invoked = true;
      return "evidence";
    },
    enumerable: true,
  });
  invalid.push(getter);
  for (const array of invalid)
    assert.throws(
      () => result({ ok: true, exitCode: 0, report: { array } }),
      /JSON/,
    );
  assert.equal(invoked, false);
  const shared = { finding: "evidence" };
  const array = [shared, shared, null, 1, "coverage"];
  const output = result({ ok: true, exitCode: 0, report: { array } });
  assert.equal(JSON.stringify(output.report.array), JSON.stringify(array));
});
