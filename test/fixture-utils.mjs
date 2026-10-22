import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function writePackageFixture(dir, manifest, source, patch = null) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'index.js'), source);
  if (patch !== null) fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), patch);
}

export function packageFixture(source, { meta = {}, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-case-'));
  const nm = path.join(root, 'node_modules');
  const pkg = path.join(nm, 'sample');
  writePackageFixture(pkg, {
    name: 'sample', version: '1.0.0', main: 'index.js',
    dsh: { bundle: { patch: 'cordis.patch.yml' } }, ...meta,
  }, source, '- name: ./index.js\n');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
    fs.writeFileSync(path.join(pkg, file), text);
  }
  return { root, nm, pkg, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export const fixtureCatalog = { host: {
  settings: { methods: ['known'] }, tools: { methods: ['register'] }, jobs: { methods: ['list'] },
}, client: {} };
