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
test("extractor retains generic methods alongside decorated and abstract methods", () => {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import sys
sys.argv=['extract','unused']
s=open('tools/catalog/extract-host-api.py').read().rsplit('main()',1)[0]
n={};exec(s,n)
x=n['method_names']("key: 'cards', signature: 'register<Details>(kind: Kind<Details>): void', signature: '@Remote async run<K extends keyof Map>(key: K): Promise<void>', signature: 'abstract retain<T extends { value: string }>(value: T): void'")
assert x == {'cards':['register','retain','run']},x
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
test("extractor reads escaped quotes inside decorator arguments before method names", () => {
  const r = spawnSync(
    "python3",
    [
      "-c",
      String.raw`import sys
sys.argv=['extract','unused']
s=open('tools/catalog/extract-host-api.py').read().rsplit('main()',1)[0]
n={};exec(s,n)
x=n['method_names'](r"""key: 'api', signature: '@Remote(\'document\') async readDocument<T>(value: T): Promise<T>', signature: "@Remote(\"list\") list(): void" """)
assert x == {'api':['list','readDocument']},x
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
test("extractor includes generator and optional callable signatures without treating fields as methods", () => {
  const r = spawnSync(
    "python3",
    [
      "-c",
      String.raw`import sys
sys.argv=['extract','unused'];n={};exec(open('tools/catalog/extract-host-api.py').read().rsplit('main()',1)[0],n)
x=n['method_names']("key: 'stream', signature: 'async *follow(): AsyncIterable<string>', signature: 'flush?(): void', signature: 'readonly field: string'")
assert x == {'stream':['flush','follow']},x
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
