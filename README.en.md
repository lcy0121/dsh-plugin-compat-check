# dsh-plugin-compat-check

Checks **installed DSH plugins** against a target version, with source locations, evidence and coverage limits. Declaration acceptance, activation or no findings does not prove business functionality. [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check) if useful.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

## Versions and entry points

**0.2.0** (unpublished development version) combines a unified UI, Chinese/English/Korean localization, reduced overhead, review archives and report history, retaining rc.3 adaptation, upgrade preview, parameter semantics and boundary hardening. Node `^22.19.0 || >=24`; declared host minimum `>=0.2.0-rc.2`. Certified exact catalogues remain **0.2.0-rc.2, 0.2.1-rc.2 and 0.2.1-rc.3**; the minimum does not certify future hosts.

The npm plugin provides a compatibility page, details/badges, `compat_check` and a skill. Repository-only CLI, install checks, static batches, author CI and health executor share the kernel. The npm package has no CLI bin; `npx dsh-plugin-compat-check` is unsupported. [Plan](docs/Plan.md) tracks contracts and tasks; [docs/current-state.json](docs/current-state.json) records scoped verification.

## Screenshots

Historical examples of presentation, not acceptance of current source or business functionality:

![Partial compatibility: source location, impact and evidence](plugin/assets/compat-detail-partial.png)
![Declaration conflict: tool inference and host notice](plugin/assets/compat-detail-declared.png)

## Install and use

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

After installing, open the DSH instance using that profile, then navigate to:

**Bottom-left More (⋯) or user avatar (account menu) → Settings → Built-in plugins → Compatibility (兼容性)**.

“More” means the bottom-left account entry. Select the Compatibility tab inside Built-in plugins, and verify that this is the profile where you installed the plugin; do not assume desktop. Agents can also call `compat_check`.

### Using each panel

This describes the repository's **unpublished 0.2.0 development UI**. Layout and buttons in the published 0.1.7 may differ.

The UI supports Chinese, English and Korean. By default it follows the host document language, recognizing BCP 47 language tags with `zh`, `en` or `ko` as the primary language; an unsupported host language falls back to English. Use **Interface language** in the main results to choose **Follow host** (auto), **中文**, **English** or **한국어**. The preference is saved locally. Diagnostic report headings, explanations and verification suggestions follow the UI language; copied text matches the preview. Raw findings, diagnostics, user notes and exported JSON retain their original text; switching language changes presentation only, not report data, evidence or identities.

The page order is **main results → dependencies → manual review → static upgrade preview → Advanced tools**. Diagnostic report preview/copy is inside the main results. Report/evidence notes are collapsed there, while report and sampling information is collapsed at the page footer. Advanced tools starts collapsed; all data and actions remain available when expanded.

| Panel or location | Purpose and actions |
|---|---|
| **Main results — Compatibility check / 兼容性检查** | Check verdict counts, the profile/target DSH, report time and cache status. Use **Check again** to update the report; search and combine verdict/certainty/verification filters, then expand a row's findings/unverified items and coverage limits to read source locations, evidence and next steps. Main results show 50 rows per page with **Previous**/**Next** controls. Choose **Preview diagnostic report**, inspect sensitive information, then **Copy report** and share it yourself. Filters and pagination preserve the complete export; nothing is posted automatically. Expand **Report and evidence notes** for certainty, measured/inferred impact and coverage boundaries. Catalogue/source details expose catalogue identity; uncertified targets display a warning directly. |
| **Dependencies and potential impact / 依赖关系与潜在影响** | Expand plugin/loader entries, service dependencies, candidate providers or impact paths as needed. Large tables show 50 rows per page. These are investigation clues; declarations, loader states and paths do not prove service availability or actual failure propagation. |
| **Manual review of findings / 发现的人工处置** | Select a status for a finding you investigated, fill in **Verification evidence**, and choose **Save manual review**. Track investigation progress, false-positive reasons or repair verification; see the steps below. |
| **Pre-upgrade compatibility check (static) / 升级前兼容性预检（静态）** | Expand, enter an exact target DSH version, and choose **Run upgrade check**. Read added/worsened risks, existing issues and coverage limits. This is static prediction: it does not install or upgrade DSH, and no new risks does not certify business functionality. |
| **Advanced tools / 高级工具** | Starts collapsed. Expand to access review archive management, local report history/trends and imported functional health records. Checks, saves, imports, exports and archive changes require explicit actions; opening this section does not run checks. |
| **Advanced tools → Manage manual review records / 人工处置记录管理** | Load capacity on demand, preview/export, then explicitly archive historical or all saved reviews. Imported/restored archives remain references; current findings require a new manual review. |
| **Advanced tools → Local report history and trends / 本地历史报告与趋势** | Explicitly save before/after snapshots; search notes, times, versions, targets or plugins, inspect full reports, and compare matching criteria. |
| **Advanced tools → Functional health check (independent measurement record) / 功能健康检查（独立实测记录）** | Generate JSON with the repository health executor, then choose **Import functional health check record** to inspect historical results and artifact identity. Skip this if you have no record. The panel only reads the file; it does not execute checks, install plugins or upload records. |
| **Footer — Report notes and check information / 报告说明与检查信息** | Starts collapsed. Expand it, then **View sampling and check information**, to inspect observations, tool information and target provenance. |

Auxiliary tables start collapsed; use the labelled **Expand**/**Collapse** buttons. Sections load as they approach the viewport, and wide tables scroll horizontally inside narrow containers. Plugin details/badges show individual results; the Compatibility tab contains the full list and filters.

The **New risks in this check** filter requires comparable history. A first or incomplete check may have no saved history; this does not mean there is no risk. An **Available** verdict with no verified calls does not certify business functionality either.

Finding lists, upgrade risk groups, both version inventories and input artifacts use 50-item pages. Added/worsened risks start expanded; other read-only details load on demand. Pagination preserves the complete export. The UI uses the host login session; if authentication fails, reopen the host-provided login URL. Never include that URL or cookies in a report.

### Saving a manual review

1. Expand a finding in the main results and investigate its source location and suggested next steps.
2. Choose **Verification and manual review** (核实与人工处置) on an expanded finding to focus its editor. Filter by plugin (筛选处置插件) or manual status (筛选人工状态); each entry shows category, API, source location and a saved-evidence summary. **Back to main results** (返回主结果) clears main filters and opens the correct plugin/finding page. Links use report/finding identities, independent of sorting or pagination. Choose **Unconfirmed / Reviewed / False positive / Fixed**, then document the evidence: test steps and actual behavior for a false positive, or the change and retest result for a fix. Reviewed means a person investigated it, not that it passed.
3. Choose **Save manual review** (保存人工处置) and wait for the saved confirmation. Use Show more reviews (显示更多处置) for additional entries. Filters keep unsaved drafts visible and never hide risks in the main report. Expand prior-review summaries or the full review history when you need earlier evidence.

Unsaved input stays as a draft for the current page session. When a background refresh changes the report identity, the old draft is marked expired and cannot be saved onto a new finding. Choose Copy draft (复制草稿), investigate the current finding again and paste/save explicitly, or Discard draft (放弃草稿). Updates to records within the same report keep your input. Save or copy before reloading, leaving the page or unloading the plugin; drafts are not written to disk.

Records are stored locally. Changes to source, versions or evidence may require re-review, while old evidence remains in history. **Marking a finding false positive or fixed does not hide it, alter verdicts/exit codes/baselines or grant an exemption.** Choose **Check again** after changing code or configuration. You can skip manual review when you only need the current results.

Both history panels are inside **Advanced tools**, start closed and never collect automatically. Active reviews remain limited to 1 MiB/1000 records; archival first creates a complete backup and requires confirmation. Archive-all also clears saved current statuses; unsaved drafts remain. Up to 100 archives are retained per target, with explicit export/delete when full. Restore/import never grants a current reviewed status: copy old evidence, investigate the current finding, then save explicitly.

Save report snapshots before/after an update and select two to compare. The target/path, DSH, tool, sampling mode, rules and catalogue must match; otherwise both full reports remain available with a neutral explanation. Weaker evidence is not a repair. Limits are 20 snapshots/target, 8 MiB/file and 64 MiB total, with no silent pruning. Export requires a preview and explicit download; inspect paths and evidence before sharing. Hashes detect content changes, not authenticity. History never certifies current compatibility or business health.

See the [guide](docs/guide.md) for detailed operations, evidence boundaries and budgets.

## Repository CLI

Run repository tools from source:

```bash
git clone --branch main https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| Option | Purpose |
|---|---|
| `--nm <dir>` | Target profile or node_modules; required |
| `--dsh-version <v>` | Target DSH version; current version in preview mode |
| `--probe <json>` / `--probe-boot` | Read observations / explicitly launch a temporary host |
| `--json` / `--quiet` | Full JSON / summary line |
| `--no-baseline` / `--dry-run` | No baseline reads or writes / compare without writing |
| `--baseline-file <path>` | Custom baseline path |
| `--issue-report` | Shareable Markdown; review before sharing |
| `--rules <json>` / `--catalog <json>` | Override rules / reference catalogue |
| `--help` / `--version` | Full help / tool version |

Static checks do not execute targets or use the network. Ordinary checks write a baseline; no-baseline prevents reads/writes, and incomplete scans do not advance it. Probe-boot/install checks execute targets and require authorization. Private profiles are not OS sandboxes.

## Upgrade preview and author tools

Enter a target version in the panel or call `compat_check({"upgradeTo":"0.2.1-rc.3"})`. The agent uses the running host version and returns `upgradePreview`. CLI requires both exact versions:

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
```

Compare any pair of the three exact versions; unknown versions exit 3. The same private bytes are compared statically, without host execution/upgrade, probes, exemptions or ordinary baselines. **0/1/2 mean no/nonfatal/fatal added or worsened risks; 3 means unavailable.** Zero may retain old risks. See the [contract](docs/Plan.md#27-升级前静态预检契约).

[Author CI](docs/author-ci.md) provides matrices, gates and JSON/SARIF/JUnit/HTML; the [guide](docs/guide.md#升级预检与有限批量) covers static batches. Health execution defaults to review; run requires authorization. See [skill](skill/README.md) and [complete tgz builds](plugin/README.md#从源码构建安装).

## Results and verification

Ordinary exits: **0 no conflicts found, 1 partial or unknown, 2 incompatible, 3 tool/input error**. Preserve certainty/impactBasis/coverage/vacuous; unobserved is not absent. Damaged baselines are preserved. Client business behavior needs separate acceptance. Review exports before sharing; nothing is posted automatically.

```bash
npm test
npm run check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

Default tests do not start real DSH/models; packaging regressions require the registry. `check` validates formatting, docs/generated copies, syntax and catalogues. Prepublish checks do not publish. Metadata checks need gh/npm and networking; unavailable sources are not passes. macOS/Linux evidence applies only to recorded scopes; Windows real-host acceptance is pending.

[Rules](rules/README.md) · [Maintenance and catalogue governance](docs/maintaining.md) · [Current evidence](docs/current-state.json).

## License

[MIT](LICENSE) · [Third-party dependencies and licences](THIRD_PARTY_NOTICES.md).
