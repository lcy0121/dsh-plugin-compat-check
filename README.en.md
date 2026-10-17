# dsh-plugin-compat-check

Check the compatibility of **installed DSH plugins** with a target DSH version, with source locations, evidence and coverage limits. Accepted declarations or successful activation do not establish that every feature works.

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## Version and delivery

The current release is **0.1.2**; npm latest, download and installation were verified on 2026-10-17. The verdict algorithm is unchanged from 0.1.1. Repository screenshots, rc.2 limitations and this skill revision are post-release source documentation, absent from the published tarball. See [publication and verification records in Plan](docs/Plan.md) and [generated verification facts](docs/current-state.json). Node `^22.19.0 || >=24` is supported.

| Entry | Purpose |
|---|---|
| npm plugin | In-process sampling, per-plugin findings/badge, `compat_check` and skill provider; a declared compatibility tab has an rc.2 visibility report; no pre-install checks |
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
| `--dsh-version <v>` | Target version; explicit value takes priority over the boot observation |
| `--rules <json>` / `--catalog <json>` | Override rules and API catalogue |
| `--no-baseline` | Disable baseline reads and writes |
| `--baseline-file <path>` / `--dry-run` | Explicit baseline; compare without writing |
| `--json` / `--quiet` | One JSON document; or summary only |
| `--version` / `--help` | Version or full usage, no target required |

### Plugin and skill

```bash
# Published npm version (0.1.2 verified on 2026-10-17)
dsh plugin --profile <profile> add dsh-plugin-compat-check

# Standalone skill for CLI users
./dsh-plugin-compat-check.sh --install-skill
```

The plugin registers a compatibility panel, detail badges, `compat_check` and a skill provider. On 2026-10-15, the actual tarball was installed into DSH0.2.0-rc.2 on macOS arm64; tool and skill calls, the panel, badges and baseline changes were verified with a real Chrome session. Standalone skill destination: `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`; existing files require `--force` to overwrite.

rc.2 note: one manual check recorded in this repository on 2026-10-17 found detail findings/badges and tool/skill working, while the compatibility tab was absent. The slot remains in the new host source; registration markers do not establish rendering. This documentation audit reviewed the record and source, without repeating that UI check.

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

`certainty` is certain or suspected; filtered/abstained are dispositions, not certainty levels. Declarations establish dependency relationships, not method absence. Preserve `impactBasis=inferred` when quoting feature impact; reliably mapped loader FAILED/PENDING supplies measured activation evidence. Official peer conflicts use `declared-incompatible` with inferred impact and degraded severity, not fatal without observed host exemptions. The current implementation retains the 0.2.0-rc.2 declaration rules and treats `engines.dsh` as advisory. The 0.2.1-rc.1 and rc.2 hosts prioritize that field; declaration findings can be incorrect or missed, so check actual host results.

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

[lib/contracts.mjs](lib/contracts.mjs) is the single report contract source; CLI JSON, HTTP, tools and the panel preserve full evidence. Additive fields are retained; missing required fields and unsupported versions fail as tool errors. Rules and the API catalogue are based on 0.2.0-rc.2. Limited integration checks passed on 0.2.1-rc.1. rc.2 has separately scoped manual records and official-function/source checks; UI reproduction, declaration adaptation and catalogue review remain pending. The AST inventory explicitly records partial coverage. See [rule and contract records in Plan](docs/Plan.md#2-现行判定与集成契约).

[Development history and next steps](docs/Plan.md) · [Historical audit](docs/GPT审计及重构方案文档.md) · [Rules](rules/README.md) · [Skill delivery](skill/README.md). Listed in [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness).

## License

[MIT](LICENSE).
