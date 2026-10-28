# dsh-plugin-compat-check

Checks **installed DSH plugins** against a target version, with source locations, evidence and coverage limits. Declaration acceptance, activation or no findings does not prove business functionality. [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check) if useful.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

## Versions and entry points

**0.2.0** combines a unified UI, Chinese/English/Korean localization, reduced overhead, review archives and report history, retaining rc.3 adaptation, upgrade preview, parameter semantics and boundary hardening. Node `^22.19.0 || >=24`; declared host minimum `>=0.2.0-rc.2`. Certified exact catalogues remain **0.2.0-rc.2, 0.2.1-rc.2 and 0.2.1-rc.3**; the minimum does not certify future hosts.

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

Choose **Interface language → Follow host / 中文 / English / 한국어** in the main results. The default follows the host's `zh`/`en`/`ko` language tag; unsupported languages fall back to English. Your preference stays local. Fixed labels, known built-in explanations and diagnostic report templates/suggestions are translated; copied text matches the preview. Raw evidence, user notes, commands and JSON retain their original text. Switching language preserves filters and drafts.

| Panel (page order) | Purpose and actions |
|---|---|
| **Main results — Compatibility check** | Check target/profile, time, cache and verdicts; choose **Check again**, search/filter, then expand findings, coverage limits and next steps. **Preview diagnostic report** lets you inspect and copy the complete report; **Report and evidence notes** explains certainty and measured/inferred impact. Uncertified targets display a warning. |
| **Dependencies and potential impact** | Expand plugin/loader entries, dependencies, candidate providers and paths. Declarations, loader states and cycles/paths are investigation clues, not proof of availability or failure propagation. |
| **Manual review of findings** | Choose **Verification and manual review** beside a finding, document status/evidence and save. **Back to main results** opens the corresponding finding. Skip this panel if you only need current results. |
| **Pre-upgrade compatibility check (static)** | Expand, enter an exact target DSH version, then choose **Run upgrade check**. This does not install/upgrade DSH; no new risks does not certify business functionality. |
| **Advanced tools (initially collapsed)** | Load review capacity/archives, save/search/compare report snapshots, or import functional-health JSON. Actions are explicit; opening the section does not collect history, run checks, install plugins or upload records. |
| **Report notes and check information (collapsed footer)** | Inspect tool version, sampling and target provenance. Catalogue identity is in the main results. |

Use labelled **Expand/Collapse** buttons for auxiliary tables. Results, dependencies, findings and upgrade details show 50 items per page; wide tables scroll in narrow containers. Filters/pages never trim complete exports. Plugin details/badges show individual results; the Compatibility tab contains the full list. If authentication fails, reopen the host-provided login URL; never share it or cookies. New-risk filters require comparable history: no baseline or no verified calls (`vacuous`) does not mean no risk.

### Manual review and history

1. Expand a finding and investigate its source location/next steps, then choose **Verification and manual review**. Filter by plugin/status; links use report/finding identity, independent of sorting and pagination.
2. Select **Unconfirmed / Reviewed / False positive / Fixed**, record steps, actual results and evidence, then choose **Save manual review** and wait for confirmation. Reviewed means investigated, not passed. Use **Show more reviews** or expand prior evidence when needed.
3. Recheck after code/configuration changes. Manual statuses never hide risks, change verdicts/exit codes/baselines or grant exemptions; changed identities require re-review.

Drafts stay in the current page session, including during filtering and same-report polling. Changed report identities mark them expired and block saving onto new findings; copy and investigate again, or discard. Save/copy before reload, navigation or unload: drafts are not written to disk.

Advanced tools load on demand. Active reviews allow 1 MiB/1000 records; archival requires confirmation and a complete backup first. Archive-all also removes saved current statuses. Each target allows 100 archives; imports/restores are references requiring a new current review. Explicitly save snapshots before/after updates and select two to compare. Target/original path, DSH, tool, sampling mode, rules and catalogue must match for a directional comparison; weaker evidence is not a repair. Limits are 20 snapshots/target, 8 MiB/file and 64 MiB total. Export then explicitly delete when full; no automatic pruning. Preview exports for sensitive paths/evidence. Hashes are not signatures, and history does not certify current business behavior.

See the [guide](docs/guide.md) for storage paths, operations and budgets.

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
