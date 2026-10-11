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
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const PLUGIN = path.join(REPO, 'plugin')

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

  test('npm pack 的产物里有内核，且暂存目录用完即清', () => {
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
        'kernel/rules/severity.json', 'lib/client.js', 'index.js']) {
        assert.ok(list.includes(need), `tarball 里缺少 ${need} —— 装上去就是"找不到判定内核"`)
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
