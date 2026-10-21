/**
 * 打包自足性测试 —— H3'（npm 发布）的**唯一**自动化保险。
 *
 * ## 为什么需要它
 *
 * 插件半边**不自己实现判定**，它 `import` 内核（`kernel/lib/{extract,verdict,baseline}.mjs`
 * 与 `rules/`）。而内核的**真源在仓库根**（`lib/` / `rules/`），**从不进 git 的 `plugin/`** ——
 * 它由 `prepack` 钩子在打包那几秒暂存进去（见 `plugin/scripts/stage-kernel.mjs`）。
 *
 * 这个安排有个必然的失效模式：**某天 `files` 字段被改掉、或 prepack 挂了，
 * 打出来的包就少内核**。而"少内核"的表现是插件仍然激活成功、
 * 只是每次都说一句"找不到判定内核" —— **静默退化，不会让任何东西变红**。
 * 与这个项目反复踩的那一类完全同型。
 *
 * ## 这里断言的是**行为**，不是文件清单
 *
 * 一条"tarball 里有这几个文件"的断言只能挡住改 `files`；挡不住
 * "文件在里面但 `resolveKernelDir()` 解析不到"。所以反过来做：
 * **真的打包 → 解到临时目录 → 让插件在只有这个包的环境里算出结论**。
 *
 * 代价是这条测试要跑一次 `npm pack`（约 1~2 秒）。相比它防的事，划算。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync, spawnSync}  from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const PLUGIN = path.join(REPO, 'plugin')

test('发布闸门保留TAP失败详情和文档校验错误', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-release-errors-'));
  try {
    for (const sub of ['lib', 'plugin/scripts', 'tools']) fs.mkdirSync(path.join(dir, sub), {recursive:true});
    fs.copyFileSync(path.join(PLUGIN,'scripts/prepublish-check.mjs'), path.join(dir,'plugin/scripts/prepublish-check.mjs'));
    fs.writeFileSync(path.join(dir,'lib/version.mjs'), 'export const TOOL_VERSION="0.1.1";');
    fs.writeFileSync(path.join(dir,'plugin/package.json'), JSON.stringify({version:'0.1.1'}));
    for (const mode of ['test', 'docs']) {
      fs.writeFileSync(path.join(dir,'tools/run-tests.mjs'), mode === 'test'
        ? 'console.log("TAP version 13\\nnot ok 1 - controlled failing case\\n  error: controlled assertion\\n# tests 1\\n# fail 1");process.exitCode=1;'
        : 'console.log("TAP version 13\\nok 1 - sample\\n# tests 1\\n# fail 0");');
      fs.writeFileSync(path.join(dir,'tools/doc-check.mjs'), 'console.error("controlled document mismatch");process.exitCode=1;');
      const out = spawnSync(process.execPath,[path.join(dir,'plugin/scripts/prepublish-check.mjs')],{encoding:'utf8'});
      assert.equal(out.status,1);
      assert.match(out.stderr, mode === 'test' ? /controlled failing case[\s\S]*controlled assertion/ : /controlled document mismatch/);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

describe('打包自足性：npm pack 出来的包必须自己能算结论', () => {
  test('prepack 暂存器本身是可用的、且自证会失败', () => {
    // 这条防的是"暂存器悄悄什么都没干"：它在结束时逐文件复查，
    // 找不到就 exit 1 —— 那样 `npm pack` 会**在打包前**失败，而不是打出一个残包。
    const script = path.join(PLUGIN, 'scripts', 'stage-kernel.mjs')
    assert.ok(fs.existsSync(script), 'stage-kernel.mjs 不见了 —— prepack 会指向一个不存在的文件')
    const src = fs.readFileSync(script, 'utf8')
    assert.match(src, /process\.exit\(1\)/, '暂存器没有失败路径：找不到内核时它会"成功"，然后打出残包')
    assert.match(src, /dsh-api-catalog\.json/, '暂存器没有复查 rules/ 里的目录文件')
  })

  test('npm pack 产物从空缓存安装后可执行，且暂存目录用完即清', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-pack-'))
    try {
      const out = execFileSync('npm', ['pack', '--pack-destination', tmp], {
        cwd: PLUGIN, encoding: 'utf8', timeout: 120000,
      }).trim()
      const tgz = path.join(tmp, path.basename(out.split('\n').pop()))
      assert.ok(fs.existsSync(tgz), `没打出 tarball：${out}`)

      // `postpack` 必须已经清掉暂存的内核副本 —— 它是一份会腐烂的重复实现，
      // 留在工作区里会被下一个人当成真源读到。
      assert.ok(!fs.existsSync(path.join(PLUGIN, 'kernel')),
        'plugin/kernel/ 在打包后仍然存在 —— postpack 没清，工作区里会留下一份会腐烂的内核副本')

      const list = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
      for (const need of ['kernel/lib/extract.mjs', 'kernel/lib/verdict.mjs',
        'kernel/lib/baseline.mjs', 'kernel/rules/dsh-api-catalog.json',
        'kernel/rules/severity.json','kernel/lib/source-analysis.mjs','kernel/lib/extract-worker.mjs','kernel/lib/state-store.mjs','LICENSE', 'lib/client.js', 'index.js']) {
        assert.ok(list.includes(need), `tarball 里缺少 ${need} —— 装上去就是"找不到判定内核"`)
      }
      const install=path.join(tmp,'installed');fs.mkdirSync(install);
      // npm ci caches tarballs, but need not cache registry metadata. Resolve
      // dependencies normally in an owned empty cache, as a fresh user would.
      execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',tgz],{cwd:install,stdio:'pipe',timeout:120000,env:{...process.env,npm_config_cache:path.join(tmp,'npm-cache')}});
      const artifact=path.join(install,'node_modules','dsh-plugin-compat-check');
      const home=path.join(tmp,'home'),profile=path.join(home,'profiles','test');fs.mkdirSync(profile,{recursive:true});
      fs.cpSync(path.join(REPO,'test/fixtures/micro/node_modules'),path.join(profile,'node_modules'),{recursive:true});
      const entry=path.join(tmp,'run.mjs');
      fs.writeFileSync(entry,`
        import {pathToFileURL} from 'node:url';
        const plugin=await import(pathToFileURL(${JSON.stringify(artifact+'/index.js')}).href);
        let tool;
        const loader={entries:()=>[]};
        const ctx={get:k=>k==='loader'?loader:undefined,effect:()=>{},inject:(deps,fn)=>{
          const sub={get:ctx.get};if(deps.includes('tools'))sub.tools={register:t=>tool=t};fn(sub);
        }};
        plugin.apply(ctx);
        const out=await tool.execute({profile:'test'});
        if(out.summary==='无法判定')throw new Error(JSON.stringify(out));
        const upgrade=await tool.execute({profile:'test',upgradeTo:'0.2.1-rc.2'});
        if(!upgrade.ok||upgrade.upgradePreview?.status!=='compared'||upgrade.report!==null||upgrade.baseline!==null||upgrade.cache!==null||upgrade.hasRuntimeSurface!==false)throw new Error('Packaged upgrade tool lost static isolation: '+JSON.stringify(upgrade));
        if(Object.keys(upgrade.upgradePreview.currentReport.plugins).length!==27||Object.keys(upgrade.upgradePreview.targetReport.plugins).length!==27)throw new Error('Packaged upgrade tool lost installed inventory');
        const unsupported=await tool.execute({profile:'test',upgradeTo:'9.9.9'});
        if(unsupported.ok||unsupported.upgradePreview?.status!=='unsupported-version'||unsupported.exitCode!==3)throw new Error('Packaged unknown target was certified');
        const report=await globalThis.__DSH_COMPAT_CHECK__.compatReport();
        if(report.toolVersion!==${JSON.stringify(JSON.parse(fs.readFileSync(path.join(PLUGIN,'package.json'),'utf8')).version)})throw new Error('Artifact lost its kernel version');
        if(!report.ok||report.report.manifests.length!==27)throw new Error('Artifact did not analyze the fixture');
        console.log('packaged host computed 27 plugins');
      `);
      const executed=execFileSync(process.execPath,[entry],{cwd:install,encoding:'utf8',timeout:20000,env:{...process.env,DSH_HOME:home,DSC_AUTORUN_MS:'0',DSC_PROFILE:'test',DSH_VERSION:'0.2.0-rc.2'}});
      assert.match(executed,/packaged host computed 27 plugins/);

    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
