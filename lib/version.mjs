/**
 * 工具版本 —— **单一真源**。
 *
 * ## 为什么必须有这个文件
 *
 * docs/Plan.md §1 约定的是「单仓库、**单版本**、一份 Node 内核、三个入口」。
 * 而实测下来这条承诺**从来没兑现过**：
 *
 * | 产物 | 版本 |
 * |---|---|
 * | `plugin/package.json` | `0.0.1` |
 * | CLI（`bin/compat-check.mjs`） | **没有** |
 * | `dsh-plugin-compat-check.sh` | **没有** |
 * | 报告 JSON | **没有** |
 *
 * 后果不是"不好看"，而是**结论无法追溯**：用户拿着一条「`dsh-keep-awake` 部分可用」
 * 来问"凭什么"，我第一句必须问"你用的是哪一版工具" —— 而那个问题当时**无解**。
 * 对同一个插件，规则表覆盖变了、提取器修了假阳性之后结论都会变。
 *
 * ## 为什么用 `.mjs` 而不是读 `package.json`
 *
 * 读者分四种形态存在：仓库检出、npm 装好的包（内核在 `kernel/`）、
 * `--probe-boot` 起的临时 profile、以及 `.sh` 编排脚本。
 * 它们的相对路径各不相同，**读 package.json 会在某一种形态下失败**。
 * 一个常量没有这个问题，而且在打包时会被 `prepack` 一并带进包里。
 *
 * `plugin/package.json` 的 `version` 仍是 npm 需要的**字面量** ——
 * 那一处由 `test/version.test.mjs` 钉住，对不上就报红并告诉你改哪里。
 */

/** 语义化版本。改动它会同时影响三个入口的 `--version` 与报告 JSON 的 `toolVersion`。 */
export const TOOL_VERSION = '0.1.1';

/** 人类可读的一行，给 `--version` 用 */
export function versionLine() {
  return `dsh-plugin-compat-check ${TOOL_VERSION}`;
}
