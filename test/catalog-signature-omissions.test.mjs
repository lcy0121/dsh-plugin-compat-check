import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("extractor recognizes decorated and abstract signatures", () => {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import runpy,sys
sys.argv=['extract','unused']
s= open('tools/catalog/extract-host-api.py').read().rsplit('main()',1)[0]
n={};exec(s,n)
x=n['method_names']('''key: 'llm', signature: '@Remote listProviders(): Info[]', signature: '@Remote listConfigurableProviders(): Info[]', key: 'attachments', signature: 'abstract readImage(ref: Ref): Promise<Image>' ''')
assert x == {'llm':['listConfigurableProviders','listProviders'],'attachments':['readImage']}, x
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
