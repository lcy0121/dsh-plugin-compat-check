# dsh-plugin-compat-check

Checks **installed DSH plugins** against a target version, with source locations, evidence and coverage limits. Declaration acceptance, activation or no findings does not prove business functionality. [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check) if useful.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

## Versions and entry points

**0.1.7** includes rc.3 adaptation, upgrade preview, parameter semantics and boundary hardening. Node `^22.19.0 || >=24`; declared host minimum `>=0.2.0-rc.2`. Certified exact catalogues remain **0.2.0-rc.2, 0.2.1-rc.2 and 0.2.1-rc.3**; the minimum does not certify future hosts.

The npm plugin provides a compatibility page, details/badges, `compat_check` and a skill. Repository-only CLI, install checks, static batches, author CI and health executor share the kernel. The npm package has no CLI bin; `npx dsh-plugin-compat-check` is unsupported. [Plan](docs/Plan.md) tracks contracts and tasks; [docs/current-state.json](docs/current-state.json) records scoped verification.

## Screenshots

Historical examples of presentation, not acceptance of current source or business functionality:

![Partial compatibility: source location, impact and evidence](plugin/assets/compat-detail-partial.png)
![Declaration conflict: tool inference and host notice](plugin/assets/compat-detail-declared.png)

## Install and use

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.3: **bottom-left account menu → Settings → Built-in plugins → Compatibility**. Select the actual profile; do not assume desktop. Agents can call `compat_check`. The panel offers filters, collapsed findings, full preview/copy and baseline risk changes. Dependency graphs show potential relationships, review records do not alter verdicts, and health imports historical JSON only. See the [guide](docs/guide.md).

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
