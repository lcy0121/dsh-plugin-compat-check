# dsh-plugin-compat-check

Check **installed DSH plugins** against a target DSH version, with source locations, evidence and coverage limits. Accepted declarations or successful activation do not establish working business features.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

## Version and entry points

npm `latest` is **0.1.4**, supporting Node `^22.19.0 || >=24`. This patch includes activation-prerequisite explanations, effective-port Origin checks, npm subdirectory metadata and repository engineering diagnostics. See [Plan](docs/Plan.md) for delivery, verification and next steps.

| Entry | Purpose |
|---|---|
| npm plugin | Compatibility tab, per-plugin findings/badge, `compat_check` and skill provider |
| Repository CLI | Check installed plugins, read observations or explicitly start a temporary host |
| Repository installation runner | Install, start and check a spec in a temporary profile |
| Skill | Guide an agent to the same tool or CLI; [delivery notes](skill/README.md) |

The forms share one verdict kernel; only identical inputs and observations should produce identical results. The npm package has **no CLI bin**; `npx dsh-plugin-compat-check` is unavailable.

## UI examples

Recorded detail pages illustrate the report, not complete compatibility certification:

![Partially usable: source locations, impact and basis](plugin/assets/compat-detail-partial.png)
![Declaration conflict: distinguish tool inference from the host warning](plugin/assets/compat-detail-declared.png)

## Quick start

### Plugin

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2 navigation: **More → Settings → Built-in plugins → Compatibility**. Agents can call `compat_check`. Select the actual profile; do not assume desktop.

### Repository CLI

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| Option | Effect |
|---|---|
| `--nm <dir>` | Required; profile or node_modules directory |
| `--probe <json>` / `--probe-boot` | Read an observation or explicitly start a temporary host; file takes priority |
| `--dsh-version <v>` | Target for declarations and catalogue selection; explicit value takes priority |
| `--json` / `--quiet` | Full JSON / summary only |
| `--no-baseline` / `--dry-run` | No baseline reads/writes / compare without writing |
| `--baseline-file <path>` | Explicit baseline file |
| `--issue-report` | Redacted Markdown; no baseline reads/writes; exclusive with json/quiet |
| `--rules <json>` / `--catalog <json>` | Override rules / API catalogue |
| `--probe-timeout <seconds>` / `--probe-keep-dir <dir>` | Startup limit, default40s / preserve probe evidence in an explicit private directory |
| `--help` / `--version` | Full usage / tool version, no target required |

`--issue-report` retains package names and package-relative paths: preview before sharing. It omits raw logs, probes and baselines and never posts automatically. Private working directories and engineering diagnostics are not ready-to-share reports either.

### Pre-upgrade compatibility preview (unreleased source)

```bash
node bin/compat-check.mjs --nm <profile-or-node_modules> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
```

In this mode `--dsh-version` is the explicit **current exact version**; `--upgrade-to` is the target. Both must be **0.2.0-rc.2 or 0.2.1-rc.2**, the versions with known catalogues. Unknown versions or ranges return `status=unsupported-version`, exit3 and an uncertified notice, without catalogue fallback. Omit `--json` for plain text. The npm package still has no CLI bin.

The unreleased plugin source also offers a target-version field and an explicit preview button on the Compatibility page. Agents can call `compat_check({"upgradeTo":"0.2.1-rc.2"})`, optionally selecting the actual `profile`; the current version comes from the running host. Build a complete source tgz to use these additions.

The preview analyzes one private byte copy of the installed plugins against both catalogues and declaration policies. It includes artifact hashes, catalogue files/sources/hashes, both reports, changes and coverage limits. It executes no target code, starts or upgrades no host, and uses no runtime observations, probes, profile exemptions, report cache or baseline. Bounded capture checks consistency; it is not an OS atomic snapshot.

Top-level exit codes describe **added/worsened risks**: 0=none, 1=nonfatal risk, 2=fatal risk, 3=preview unavailable. Existing risks may remain in `targetReport`; exit0 does not certify target compatibility or business success. Preserve certainty/impactBasis, coverage/vacuous, incomplete scans and unverified client behavior. This mode rejects probe/boot, rule/catalogue override, baseline-file, dry-run, quiet and issue-report options; `--no-baseline` is an optional no-op. See [Plan §2.7](docs/Plan.md#27-升级前静态预检契约) for the separate contract.

### Fixed static batch (repository tool)

```bash
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json > next.json
node tools/static-batch.mjs --hash <local-package-directory>
```

The manifest pins package names, exact versions and whole-tree SHA-256 hashes. Private copies are verified, then scanned independently with the shared kernel. Limits: 16 samples, 10 seconds each, 60 seconds total. No target installation/execution, probe or baseline reads. Exit 0/1/2 preserves static verdicts; 3 means input, hash, budget or tool failure. The synthetic example intentionally exits 2. Every result remains **pending author review**, including limited coverage, vacuous verdicts and incomplete scans; it is not business certification. Delta mode always rescans and treats changed artifact, analyzer source, rules, catalogue, target version or budgets as incomparable. Preview JSON before sharing.

Manifest format, hashing and permission/cost decisions: [Plan §2.5](docs/Plan.md#25-有限静态批量契约). The manual [static-batch.yml](.github/workflows/static-batch.yml) Action scans only fixed public repository samples with read-only repository permissions. No remote endpoint or result cache is deployed; this tool is not in the npm plugin.

### Installation checks and standalone skill

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh <spec> --json
./dsh-plugin-compat-check.sh --install-skill
```

Installation checks require Node, DSH and pnpm; specs follow DSH's npm/GitHub/git/file conventions. Options include `--keep` and `--timeout` (default30s). Installation may use the network, and checks start a host and execute target plugins; **a temporary profile is not an OS sandbox**. An existing standalone skill requires `--force` to overwrite; see [skill delivery](skill/README.md) for its location.

The repository root is a private development workspace, not an installable plugin. Test source by packing a complete tgz and installing it through DSH. A root GitHub spec or bare `plugin/` copy is not a complete artifact. See [source packaging](plugin/README.md#从源码构建安装).

## Results and limits

CLI/Node installation-runner exit codes: **0** no issue reported, **1** partially usable or unknown, **2** incompatible or installation peer-gate rejection, **3** input/execution error, no verdict. The shell retains usage/kernel-error codes before entering Node; automation should use the Node entry and inspect `status`.

- Retain `certainty`, `impactBasis`, `coverage` and `vacuous`. Unknown, unobserved or omitted keys do not mean absence; a catalogue is not a runtime observation. Client features need separate acceptance.
- Default static CLI checks do not start DSH or install targets. Host checks use a budgeted analysis worker without external commands/network. Baselines are written by default; use `--no-baseline` for one-off checks.
- Method analysis uses bounded Babel AST/package-local value flow; dynamic behavior remains limited. Declarations/API risks do not guarantee business behavior. Modern observations must match profile, version and age; another profile's evidence cannot be borrowed.
- Since 0.1.3, the tool supports newer DSH declarations, exact compatibility grants and the rc.2 catalogue. Future DSH versions are unverified. Scoped macOS/Linux evidence exists; Windows awaits real acceptance. See [contracts and limits](docs/Plan.md#2-现行判定与集成契约).

## Development and documentation

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

Default tests do not start real DSH or call models. Artifact tests install with a private empty cache and require npm registry access. `doc-check` never recursively runs tests. Metadata checks need gh/npm and network; unpublished README differences are notices, unavailable sources are not passes. The prepublish check itself publishes nothing.

[Plan: contracts, verification and next steps](docs/Plan.md) · [current-state.json: counts and evidence](docs/current-state.json) · [Rules](rules/README.md) · [Skill](skill/README.md). Commands and authorization boundaries for engineering diagnostics, independent business measurements and explicit model tests are in the [reproduction guide](docs/Plan.md#5-验证记录与复现); these development tools are not shipped in the npm plugin.

Listed in:

- [Awesome DSH Plugin (primary catalog)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)
- [dsh.works plugin catalog](https://github.com/dshworks/awesome-dsh-plugins)
- [Bruce’s Awesome DSH Plugins](https://github.com/bruc3van/awesome-dsh-plugin)
- [1024 ecosystem catalog](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) (displayed in [1024 Store](https://deepseek1024.com))

Listing is not compatibility certification. The npm installation method in 1024 Store still awaits an upstream fix; see [Plan](docs/Plan.md). [MIT License](LICENSE).

Unreleased source changes add plugin search, combined verdict/certainty/pending filters, collapsible findings, full report preview/copy and a baseline risk view. Findings include evidence-matched follow-up checks; filters do not trim exported reports. The fixed real-plugin regression runner is repository-only: `node tools/real-regression.mjs --live --out-dir <empty-directory>` or `--replay <evidence-root>`. A green run reproduces fixed outcomes while retaining false positives/negatives; see [Plan](docs/Plan.md).
