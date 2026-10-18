# dsh-plugin-compat-check

Check the compatibility of **installed DSH plugins** with a target DSH version, with source locations, evidence and coverage limits. Accepted declarations or successful activation do not establish that every feature works.

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## Version and delivery

The repository is **0.1.3 candidate (unpublished)**, adding rc.2 declarations, versioned catalogues and unload cleanup fixes. npm latest remains **0.1.2** (download/install verified on 2026-10-17; algorithm unchanged from 0.1.1). Current source, skill and documentation changes are absent from that published tarball. See [Plan](docs/Plan.md) and [verification facts and scope](docs/current-state.json). Node `^22.19.0 || >=24` is supported.

| Entry | Purpose |
|---|---|
| npm plugin | In-process sampling, compatibility tab, per-plugin findings/badge, `compat_check` and skill provider; no pre-install checks |
| Repository CLI | Static checks of installed packages; optional file observations or explicit temporary-host probing |
| Repository installation runner | Install a spec into a temporary profile and check installation, startup and compatibility |
| Skill | Teaches an agent to use the registered tool or repository CLI |

The entries share one verdict kernel. Only identical inputs and observation evidence should produce identical results. The npm package has **no CLI `bin`**; `npx dsh-plugin-compat-check` is unavailable. Client arrival diagnostics are a separate development tool, not a panel feature or a full UI test.

## What it looks like

These recorded detail-page screenshots are not complete compatibility certification. API findings can carry real source locations; declaration or loader facts may have no source location and must retain their basis.

![Plugin detail page: partially working, with file:line, impact and basis](plugin/assets/compat-detail-partial.png)

![Declaration-conflict example: interpret tool inference separately from the host warning](plugin/assets/compat-detail-declared.png)

## Usage

### Repository CLI

The repository provides the shared kernel and root development workspace; npm ships only the plugin package. Obtain the repository and install dependencies at its root:

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts

node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --probe /path/to/probe-report.json --dsh-version <version> --no-baseline --json
node bin/compat-check.mjs --help
```

Select the actual profile; do not assume desktop. `--nm` accepts a profile or node_modules directory. Without runtime evidence, method conclusions from the catalogue are suspected. A probe file alone does not make every finding certain: identity, age, completeness and source attribution still matter.

| Option | Effect |
|---|---|
| `--nm <dir>` | Required target directory |
| `--probe <json>` | Existing runtime observation; takes priority over `--probe-boot` |
| `--probe-boot` | Explicitly copy the profile, install the probe and start a temporary host, executing target plugins |
| `--probe-timeout <seconds>` / `--probe-keep-dir <dir>` | Startup limit, default40s; preserve evidence in an explicit private directory |
| `--dsh-version <v>` | Target version for declarations and catalogue selection; explicit value takes priority over boot observation |
| `--rules <json>` / `--catalog <json>` | Override rules and API catalogue |
| `--no-baseline` | Disable baseline reads and writes |
| `--baseline-file <path>` / `--dry-run` | Explicit baseline; compare without writing |
| `--json` / `--quiet` | One JSON document; or summary only |
| `--issue-report` | Redacted Markdown report; no baseline reads/writes; exclusive with `--json`/`--quiet` |
| `--version` / `--help` | Version or full usage, no target required |

To prepare a report, run `node bin/compat-check.mjs --nm <target> --issue-report > issue-report.md`. It retains versions, observation mode, findings, available package-relative positions, certainty/impactBasis, coverage and a reproduction command with placeholders. Raw logs/probes, absolute paths and baselines are omitted; explanation fields containing paths, links, common credentials or control characters are hidden in full. Package names and relative filenames remain, and arbitrary business text may still be sensitive: preview before sharing. Exit codes remain 0/1/2/3; capture immediately with `report_status=$?` if needed. This flag is currently a repository-source feature; the npm plugin has no CLI.

### Plugin and skill

```bash
# Published npm version (0.1.2 verified on 2026-10-17)
dsh plugin --profile <profile> add dsh-plugin-compat-check

# Standalone skill for CLI users
./dsh-plugin-compat-check.sh --install-skill
```

The plugin registers a compatibility panel, detail badges, `compat_check` and a skill provider. On 2026-10-15, the actual tarball was installed into DSH0.2.0-rc.2 on macOS arm64; tool and skill calls, the panel, badges and baseline changes were verified with a real Chrome session. Standalone skill destination: `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`; existing files require `--force` to overwrite.

rc.2 navigation: More → Settings → Built-in plugins → Compatibility. On 2026-10-18 the 0.1.3 candidate tarball, a private rc.2 host and real Chrome showed the tab/report and confirmed route removal/recovery on disable/re-enable, with one tab afterward. The historical 2026-10-17 missing-tab report was not reproduced; this does not establish its original cause or certify plugin business functions.

The repository root is a **private development workspace**, not the installable DSH bundle. A root GitHub spec is not equivalent to installing `plugin/`. To test the source, run `npm ci --ignore-scripts` at the root, then `npm pack --pack-destination <existing-absolute-output-dir>` inside `plugin/`, and install the resulting `.tgz` through DSH. Packing stages the kernel and LICENSE. Copying a bare `plugin/` directory does not stage the kernel; see [plugin delivery](plugin/README.md).

### Installation checks

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout seconds] [--json]
node bin/check-install.mjs <spec> --json
```

Requires Node, DSH and pnpm; dependency resolution and installation may use the network. Specs follow DSH's npm/GitHub/git/file conventions. Each run owns a unique profile, private working directory and its spawned processes. **A temporary profile is not an OS sandbox.**

| Option | Effect |
|---|---|
| `--keep` | Keep this run's profile and evidence; use returned paths |
| `--timeout N` | Startup timeout in seconds, default30 |
| `--json` | One JSON document on stdout, separate progress output |
| `--install-skill` / `--force` | Shell-only skill installation and explicit overwrite |
| `--help` / `--version` | Shell help and version |

CLI and Node installation-runner result codes:

| Code | Meaning |
|---|---|
| `0` | No issue reported; still inspect coverage, vacuous results and observation limits |
| `1` | At least one partially usable or unknown plugin |
| `2` | An incompatible plugin or an explicit installation peer-gate rejection |
| `3` | Input, installation, network, preparation or startup failed; no reliable verdict |

The shell retains legacy usage/kernel-error codes before entering Node. For automation use the Node entry and inspect `status`; wrapper errors are not plugin findings.

## Evidence and limits

Services have distinct present, absent, unobserved and unreadable states. Omitted keys are unobserved. Modern observations must match profile and DSH version and expire after24h by default. Legacy reports use explicit keys only and carry an unbound warning.

`certainty` is certain or suspected; filtered/abstained are separate dispositions. Declarations establish dependency relationships, not method absence. Preserve inferred impact; reliably mapped loader FAILED/PENDING supplies measured activation evidence. The 0.1.3 candidate uses own `engines.dsh` first for DSH≥0.2.1-rc.1, falling back to official peers only if absent; older targets retain advisory engines. Conflicts/invalid fields produce inferred `declared-incompatible`, not measured load failure. Read-only profile `compatibility.json` grants require exact plugin name/version and runtime version. Invalid rows are ignored with coverage limits; unreadable/over-64KiB files leave grants unobserved. No grants are written. Exemption permits declarations, not API or business success.

Always retain `coverage.status=limited`, vacuous results, parse/read/budget diagnostics and unmapped-loader limits. No finding is not a feature certificate. Host, client and shared sites are kept separate. Provider declarations are hints, not evidence of activation; complete method observations of present services still apply.

The pinned Babel JS/TS AST analyser tracks lexical bindings, per-call positions, capability guards and package-local relative imports, including side effects, without executing inspected source. Bounded flow supports constant computed keys, direct parameters/returns, package-local ESM/CommonJS aliases and calls, and transparent Proxies with empty handlers. Interprocedural expansion requires proven Context/service bindings; unknown keys, traps, async returns, ambiguity and budget limits remain explicit limitations. See [Plan](docs/Plan.md#21-证据与分析边界). Source scanning has file/byte/directory/time budgets; host analysis uses a worker with time and memory limits.

Default static CLI checks do not start DSH or install targets. The host plugin uses an analysis worker but no external command/network for checks, and writes its own baseline by default. Schema2 identity includes canonical profile, path hash, mode, tool, rules and catalogue. Files live at `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`. Comparison runs under a lock with atomic replacement; incomplete scans do not advance the baseline. Static, file and in-process observations have separate modes.

Descriptor sampling does not execute getters; unknown accessor methods remain unknown. Diagnostics require an explicit private `DSC_OUT_DIR`. Queries of another profile use static evidence rather than borrowing the current host's services. Inspect kept evidence for local information before sharing.

## Repository layout

```text
dsh-plugin-compat-check/
├── README.md / README.en.md / README.ko.md
├── package.json / package-lock.json   # private development workspace
├── bin/                              # compat-check.mjs, check-install.mjs
├── lib/                              # shared analysis, evidence, state and runner modules
├── plugin/                           # npm plugin, client, packaging scripts and skill copy
├── probe/                            # opt-in runtime probe, staged by the owned runner
├── skill/                            # authoritative SKILL.md and delivery notes
├── rules/                            # severity rules, API catalogue and historical inventory
├── docs/                             # current contracts, verification and history
│   ├── Plan.md
│   ├── GPT审计及重构方案文档.md
│   ├── current-state.json
│   └── extraction-findings.md
├── test/                             # behavior, invariants, snapshots and artifact tests
└── tools/                            # documentation, metadata and diagnostic utilities
```

## Verification and maintenance

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

The default suite captures one private read-only copy of optional local profiles for extraction, source rereads and child processes. Standalone test files capture their own inputs. Changes during capture or exceeded budgets fail explicitly; absent profiles are skipped explicitly. Copies are cleaned up afterward. Production scans and installation checks are unchanged.

`doc-check` checks links, versions, document entry points and the skill copy offline; it does not run tests. Record a successful TAP log with `node tools/update-current-state.mjs --test-summary <log>` and validate it with `node tools/doc-check.mjs --test-summary <log>`. The prepublish check runs the default suite once and reuses the summary, including isolated tarball installation and registered-tool execution in a controlled host context; it does not start real DSH. That artifact test uses a private empty npm cache and requires npm registry access rather than a prewarmed machine cache. Metadata checks require network and gh/npm; an unpublished newer local version or README is a notice, while unavailable sources remain unverified.

Slow integrations require explicit `DSC_SLOW=1`. Existing macOS DSH/Chrome, Ubuntu arm64 VM and Linux x64 CI evidence covers actual tarballs, tool/skill registration, UI controls and engineering scenarios; see [Plan](docs/Plan.md#5-验证记录与复现) for exact commits and scopes. Earlier CI does not certify later local assertion or documentation changes. Windows remains deferred. See [engineering checks](docs/Plan.md#53-p2工程验收). Historical 88.3% recall, 66/66 arrival and loader labels are not business-function accuracy; Python parity is a legacy regex reference, not AST ground truth.

Auxiliary measurement uses independent raw loader labels; the predictor receives service observations only. See [auxiliary measurement records in Plan](docs/Plan.md#51-已验证范围). `node tools/labels.mjs --nm web --synthetic --json` creates a private environment and can correctly report a false negative (exit1). Use `--probe-boot` for an existing target, or paired `--probe` and `--labels` files. These sample metrics cover the first layer only, not ecosystem accuracy.

A separate repository business cohort runs with `node tools/business-labels.mjs --live --out-dir <empty-evidence-directory> --json`. On private DSH0.2.1-rc.2 and real Chrome it checks pinned dshmarket1.66.37 notes/favorites through completed requests, reloaded DOM and independent disk state. Source/static API-risk predictions are sealed before actions; business/loader answers never enter the predictor. Baseline TN2 and controlled POST503 FN2 yield exit1 honestly. Missing cases or mismatched identities/artifacts are rejected; driver errors are not business failures. This does not establish original-plugin defects, ecosystem accuracy or panel-wide business certification. See [Plan](docs/Plan.md#52-日常检查与真实集成).

[lib/contracts.mjs](lib/contracts.mjs) is the single report contract source across CLI JSON, HTTP, tools and panel. Additive fields are retained; missing required fields and unsupported versions fail as tool errors. The 0.1.3 candidate selects the rc.2 catalogue (host98/client8) for DSH≥0.2.1-rc.2, otherwise/unknown the unchanged 0.2.0-rc.2 catalogue (host91/client8); explicit `--catalog` wins. Future DSH versions remain unverified. A catalogue is not a runtime observation or sufficient severity evidence. The AST inventory remains a dated partial sample. See [Plan](docs/Plan.md#2-现行判定与集成契约).

[Development history and next steps](docs/Plan.md) · [Historical audit](docs/GPT审计及重构方案文档.md) · [Rules](rules/README.md) · [Skill delivery](skill/README.md). Listed in [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness).

## License

[MIT](LICENSE).
