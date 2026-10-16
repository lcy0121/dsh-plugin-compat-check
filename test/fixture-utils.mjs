import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function packageFixture(source, { meta = {}, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-case-'));
  const nm = path.join(root, 'node_modules');
  const pkg = path.join(nm, 'sample');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({
    name: 'sample', version: '1.0.0', main: 'index.js',
    dsh: { bundle: { patch: 'cordis.patch.yml' } }, ...meta,
  }));
  fs.writeFileSync(path.join(pkg, 'cordis.patch.yml'), '- name: ./index.js\n');
  fs.writeFileSync(path.join(pkg, 'index.js'), source);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
    fs.writeFileSync(path.join(pkg, file), text);
  }
  return { root, nm, pkg, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export const fixtureCatalog = { host: {
  settings: { methods: ['known'] }, tools: { methods: ['register'] }, jobs: { methods: ['list'] },
}, client: {} };
