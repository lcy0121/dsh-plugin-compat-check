# dsh-plugin-compat-check

> Find out whether the DSH plugins you **already have installed** actually work on **your current DSH version** — and for anything that doesn't, get the **location** (`file:line`) and the **reason**.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

---

## What it answers

DeepSeek Harness (DSH) is a harness where *everything is a plugin*: models, tools, sandboxes, the UI, and even the agent loop itself. The ecosystem is large — and **what a plugin claims is not what the host provides**.

It exists to answer exactly one question:

> **On this version of DSH, do the plugins I already have installed still work?**

For the parts that work, it stays quiet. For the parts that don't, it must say **which line** and **why**.

### Four kinds of misjudgement, all encountered for real in this project

| You might assume | Reality |
|---|---|
| `peerDependencies` / `dsh.compatibility` says it's supported → it works | **The declaration can be wrong.** One plugin declaring support for `0.2.0` threw `ctx.settings.register is not a function` on boot |
| The DSH version gate let it through → it works | The gate only does **string range comparison**; it never verifies the API actually exists |
| No error at startup → it works | Plugins habitually degrade with `try/catch` and `typeof` guards. **When an API is missing it still "activates successfully", but that functionality is dead** |
| Clean startup log → the client half is fine too | Client code runs in the browser. One plugin had a completely clean host-side log while its client half threw and the UI never registered at all |

So: **reading declarations is not enough, and reading logs is not enough.** You have to read the installed plugin's source, obtain the host's real API surface, and compare them line by line.

## Three artifacts, one kernel

One Node kernel (`lib/`), three entry points. **They cannot disagree** — the panel, the CLI, and the conversation tool all consume the same `computeReport()` result.

| | Plugin (in-process) | CLI | skill |
|---|---|---|---|
| Audit the host layer of installed plugins | ✅ main job | ✅ | teaches an agent when to call the CLI |
| Audit the client half | ✅ **unique** | ❌ invisible from a terminal | ❌ |
| Pre-check a plugin **not yet installed** | ❌ | ✅ **unique** | ❌ |
| "Can't even install it" (version gate refused) | ❌ | ✅ **unique** | ❌ |
| Still works when the host won't boot | ❌ it is inside the host | ✅ **unique** | ❌ |
| Terminal / CI output | ❌ | ✅ | ❌ |
| Answer directly in conversation | with its tool ✅ | ❌ | ✅ |

> **The plugin is strictly weaker than the CLI, not a superset.** That's why this project never claims "install this plugin and it will check things for you before installation" — that's the CLI's job.

## Quick start

### 1. CLI (most complete; start here)

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check

# audit the plugins installed in a profile
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop

# with a probe report, method-level findings become "certain"
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --probe /tmp/dsh-plugin-compat-check/probe-report.json --dsh-version 0.2.0-rc.2

# the repo ships one you can compare against directly (used by the regression baseline)
node bin/compat-check.mjs --nm ~/.dsh/profiles/parityfix --probe tools/parity/fixtures/host-surface-parityfix.json --dsh-version 0.2.0-rc.2

# machine-readable / one line
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --json
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --quiet
```

`--nm` accepts either a `node_modules` directory or a profile directory (the `node_modules` suffix is added automatically).

| Option | Effect |
|---|---|
| `--nm <dir>` | **Required.** The `node_modules` or profile directory to audit |
| `--probe <json>` | Host runtime surface. **Only with this does a method-level finding become "certain"**; without it the tool falls back to the official catalogue and marks it "suspected" |
| `--probe-boot` | **Boot a host yourself to obtain the runtime surface** (no pre-existing probe report needed). **Off by default** — it copies a profile, runs pnpm and boots a host (~10-20s). On a real desktop profile: usable 9 -> **14**, incompatible 0, and findings go from "suspected" to "certain" |
| `--probe-timeout <s>` / `--probe-keep-dir <dir>` | `--probe-boot` wait limit (default 40) / keep a copy of the probe report in that directory (for debugging) |
| `--dsh-version <v>` | Current DSH version (prerequisite for the "declaration vs. reality" category) |
| `--rules` / `--catalog` | Override the tables under `rules/` |
| `--no-baseline` | Don't read or write the local baseline (CI / one-shot checks) |
| `--baseline-file <path>` / `--dry-run` | Point at a specific baseline / compute the diff without writing |
| `--json` / `--quiet` | Machine-readable / summary line only |
| `--version` | Tool version (also `toolVersion` in `--json`). **Include it when reporting a verdict** — the same plugin can differ across versions |

**Exit codes** (`1` and `2` describe **the plugins**; `3` never does):

| Code | Meaning |
|---|---|
| `0` | Everything usable |
| `1` | Some plugin is "partially usable" |
| `2` | Some plugin is "incompatible" |
| `3` | **This audit produced no trustworthy verdict** (bad usage / missing directory / the tool itself failed) |

> Why `3` must exist separately: reading a mistyped command as "this plugin is incompatible" sends the user to investigate **entirely the wrong thing**.

### 2. Install as a DSH plugin (gives you a panel)

```bash
dsh plugin --profile <your-profile> add github:lcy0121/dsh-plugin-compat-check
```

Then look under **Settings → Built-in plugins → Compatibility** for the overview table. Open any plugin's detail page and its verdict badge sits in the title row, with the individual findings below. A few seconds after startup it also runs once by itself and logs whether anything **changed since last time**.

### 3. Install the skill (so an agent knows how to use it)

```bash
./dsh-plugin-compat-check.sh --install-skill
```

Installs to `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`. With it, "does this plugin still work after the update?" gets answered by the agent running the check instead of sending you to the docs.

> ⚠️ **Shipping `SKILL.md` inside a plugin package does not count** — DSH does not scan files inside plugin packages. That's why this is a separate step even after installing the plugin: the plugin form registers the skill itself via `ctx.skills.registerProvider()`, and this command exists for people who **only use the CLI** and therefore never get that registration.

### 4. End-to-end script (install + boot + probe + verdict)

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout seconds] [--json]
```

`<spec>` is exactly what `dsh plugin add` accepts: `dsh-keep-awake`, `github:owner/repo`, `file:/path/to/plugin`.

It does three things the CLI cannot, and therefore answers questions the CLI cannot: npm identity lookup (against name collisions), isolated install (catches version-gate refusals), and a real boot that produces the probe report (which is what turns method-level findings into "certain").

| Option | Effect |
|---|---|
| `--keep` | Keep the temporary profile and evidence for manual inspection |
| `--timeout N` | Boot wait in seconds, default 30 |
| `--json` | Machine-readable output |
| `--install-skill` | Install the skill only, no audit (needs no kernel) |
| `--force` | With `--install-skill`, overwrite an existing skill |
| `--help` | Usage (needs no kernel) |

> **`--install-skill` and auditing are independent**: the former needs no kernel; the latter **fails outright** when the kernel is missing rather than degrading to "just print the extraction" — degrading would produce output that looks normal and **contains no verdict**, which is far worse than an error.

## Reading the output

```
插件数: 22    有运行时面: 是

结论: 可用 3    部分可用 19    不兼容 0

部分可用  dsh-keep-awake@0.2.0
     降级 / 宿主方法缺失  jobs.onJobsChanged  @ lib/index.js:591
       影响: 任务状态不再实时推送，插件退化为轮询（约 5 秒延迟）
     功能缺失 / 宿主方法缺失  settings.register  @ lib/index.js:466
     客户端半边（命令行测不到，需界面验证）: locale, slots
     无证据可判（只出现名字，没有调用点）: timer
```

*(Tool output is Chinese-only; `README.en.md` documents the tool in English but the output strings themselves are not localised. This is listed under Known limitations.)*

Every plugin lands in **exactly one** disposition, and the set of dispositions must equal the set of services (an invariant enforces this):

| Disposition | Meaning |
|---|---|
| `finding` | A verdict exists — see the findings above |
| `client-side` | Runs in the browser. **Invisible from a terminal**; needs UI verification |
| `self-provided` | The plugin provides this service itself; it is not a host service |
| `runtime-facility` | A Cordis context builtin (`loader`, `effect`, …), not a DSH service |
| `filtered` | Judged noise/false positive (JS builtin method names, variables with no credible source) |
| `guarded` | **The author checks for it themselves** and has a fallback — reporting it would be a false positive |
| `abstained` | Not enough data to judge (e.g. the catalogue declares no methods for that service) |
| `no-calls` | The name appears but there is no call site — **no evidence, which is not "no problem"** |

The last two are deliberately separated. `no-calls` and `abstained` look like "fine" everywhere else, and they are not.

## Three tiers of certainty (this is the honesty mechanism)

| Tier | When | Shown as |
|---|---|---|
| **Certain** | A **runtime surface** is available, or the plugin **declares** the dependency itself | no annotation |
| **Suspected** | Only the official catalogue (a **contract** catalogue, not the runtime surface) | `[suspected]` |
| Excluded | Neither declared nor in the catalogue | recorded under `filtered`, auditable |

> **The official catalogue is not the runtime surface.** It declares no methods at all for abstract services (`jobs`), omits `loader` entirely, and declares fewer methods for `settings` than the runtime actually has. Asserting "this method does not exist" from it does not qualify as certain, so those findings are downgraded to "suspected".
>
> This is not a defect: **when you cannot judge, you downgrade the label instead of upgrading it to certain.**

## What it deliberately does not do

- **Does not install packages, spawn subprocesses, or use the network** (plugin form). Breaking that boundary to obtain one version string is not worth it.
- **Does not guess.** When the DSH version cannot be obtained, `dshVersion` is `null` and the "declaration vs. reality" category **simply cannot fire** — rather than inventing a version and conjuring a finding out of nothing.
- **Does not call "not comparable" the same as "no problem".** No baseline yet says "never compared"; a corrupt baseline says "unreadable, skipping the comparison".
- **Does not use an LLM for judgement.** Severity comes from layered defaults plus `rules/severity.json`.

## Two boundaries you must know

**1. The client half can never be verified from a terminal.** Client code executes in the browser; confirming it means looking at **whether the plugin's own UI elements appear**. This tool **lists** client-side services but **does not judge** them — deliberate honesty, not an omission. (The plugin's own panel cannot verify it either: the panel runs inside the host.)

**2. Method-level judgement rests on static extraction and has known false-positive sources.** Every real defect is recorded in [`docs/extraction-findings.md`](docs/extraction-findings.md) (18 fixed so far). When in doubt, add `--keep` and inspect the raw data:

| Path | Contents |
|---|---|
| `/tmp/dsh-plugin-compat-check/boot.log` | Host boot log (including `did not activate`) |
| `/tmp/dsh-plugin-compat-check/static.json` | Extracted services and call sites, with `file:line` |
| `/tmp/dsh-plugin-compat-check/probe-report.json` | The host's real API surface |

## Layout

(168 version-controlled files: 81 of code / documentation / data tables, and 87 fixture files
(`test/fixtures/micro/node_modules/` with 48 synthetic plugin files, `tools/parity/fixtures/hang-cycle/node_modules/` with 5,
and one synthetic host runtime surface). All 81 hand-maintained entries are listed below; fixture contents are summarised.)

```
dsh-plugin-compat-check/
├── README.md                   # Chinese documentation
├── README.en.md                # English documentation (this file)
├── README.ko.md                # Korean documentation
├── Plan.md                     # **development plan and working rules**: locked decisions, milestones, landmines, measured DSH contracts
├── LICENSE                     # MIT
├── .gitignore
├── dsh-plugin-compat-check.sh  # end-to-end orchestration
│
├── lib/                        # kernel: four pure modules, shared by all three artifacts
│   ├── extract.mjs             #   static extraction: who calls what (with file:line and evidence form)
│   ├── version.mjs             #   the **single source** of the version number
│   ├── verdict.mjs             #   judgement: verdicts, certainty tiers, per-service disposition
│   ├── baseline.mjs            #   diffing: what changed since last time, in which direction
│   └── report.mjs              #   rendering: the human table (same wording as the conversation tool)
│
├── bin/
│   └── compat-check.mjs        # CLI entry: arg parsing / exit codes / table and JSON renderings
│
├── plugin/                     # the DSH plugin artifact
│   ├── package.json            #   dsh.bundle.patch + dsh.client (platform must be the literal "web")
│   ├── cordis.patch.yml        #   plugin mount manifest
│   ├── index.js                #   host half: introspection + panel channel + tool + skill
│   └── lib/
│       └── client.js           #   client half: **prebuilt** (the host does not build it)
│
├── skill/                      # the skill artifact
│   ├── SKILL.md                #   the skill body (frontmatter has only name / description)
│   └── README.md               #   how registration works: measurements, scan roots, ranks, frontmatter rules
│
├── probe/                      # diagnostic probe (installed into a throwaway profile)
│   ├── package.json
│   ├── cordis.patch.yml
│   └── index.mjs               #   prototype-chain enumeration + scoped-context probing; **structure only, never values**
│
├── rules/                      # data, not logic
│   ├── README.md               #   how to change the tables; how the coverage/freshness invariants work
│   ├── severity.json           #   severity layering (40 services) + impact wording
│   ├── dsh-api-catalog.json    #   official catalogue, both halves (91 host / 8 client services)
│   └── usage-inventory.json    #   evidence that a service is actually used by someone
│
├── docs/
│   └── extraction-findings.md  # measured extraction defects (numbered) + the probe's two boundaries
│
├── test/                       # 261 assertions / 15 test files (see below)
│   ├── helpers.mjs             #   shared fixtures: load tables, snapshot digests, hashing
│   ├── invariants.test.mjs     #   self-consistency (must hold for any input)
│   ├── snapshot.test.mjs       #   did the output change (key fields + content hash)
│   ├── cli.test.mjs            #   did the flags take effect? are failures swallowed?
│   ├── baseline.test.mjs       #   is every diff category right? is it quiet when nothing changed?
│   ├── cache.test.mjs          #   caching policy, auto-check timing, profile detection
│   ├── skill.test.mjs          #   doc drift: can the tool do everything the skill claims?
│   ├── secrets.test.mjs        #   **no credentials in the repository** + the probe must not record values
│   ├── client-structure.test.mjs  # can a client component register successfully but do nothing?
│   ├── host-structure.test.mjs    # same for the host half (really calls apply, checks what it registered)
│   ├── packaging.test.mjs      #   is the npm package self-contained? (really packs it)
│   ├── probe-boot.test.mjs     #   --probe-boot end to end (**skipped by default**, DSC_SLOW=1)
│   ├── docs.test.mjs           #   are the numbers in the docs still right?
│   ├── version.test.mjs        #   do all entries report the same version?
│   ├── labels.test.mjs         #   label-set reconciliation (**skipped by default**, DSC_SLOW=1)
│   ├── client-arrival.test.mjs #   did the planned client entries actually arrive? (**skipped**, DSC_SLOW=1)
│   ├── __expectations__/
│   │   └── micro.json          #   hand-written product promises: these verdicts **must** hold
│   ├── __snapshots__/
│   │   ├── micro.json          #   full output snapshot for the synthetic fixture
│   │   └── parityfix.json      #   full output snapshot for the real plugin set
│   ├── __baseline-versions.json #  baseline version lock (drift is reported as BASELINE_DRIFT)
│   └── fixtures/
│       ├── micro/host-surface.json          # synthetic host runtime surface
│       └── micro/node_modules/@fixture/*    # 15 synthetic plugins, one per judgement path
│
└── tools/                      # development tooling (not part of the runtime)
    ├── client-arrival.mjs             # client entry "arrival" reconciliation (H1', needs a browser)
    ├── catalog/extract-host-api.py     # extract the official API catalogue from the host (source for rules/)
    ├── parity/                         # differential testing against a Python reference
    │   ├── parity.sh
    │   ├── a4b-diff.mjs
    │   ├── expected-diffs.json         #   intentional differences, each with a stated reason
    │   ├── python-reference/extract.py #   frozen Python reference implementation
    │   └── fixtures/
    │       ├── host-surface-parityfix.json   # runtime surface of the real plugin set (regression baseline)
    │       └── hang-cycle/                   # the circular-dependency fixture that once hung extraction
    └── slot-probe/                     # slot availability probe (measured ctx.slots props contract)
        ├── package.json
        ├── cordis.patch.yml
        ├── index.js
        ├── lib/client.js
        └── cdp-diag.mjs                #   drives headless Chrome over CDP to inspect real rendering
```

## Tests

```bash
node --test test/
```

**261 assertions** (15 test files) by default, in seconds. `probe-boot.test.mjs` is skipped by default:

```bash
# really boot a host to verify --probe-boot end to end (about 10-20s)
DSC_SLOW=1 node --test test/probe-boot.test.mjs
```

> It is skipped by default because it copies a profile, runs pnpm, boots a host and waits
> for the report — tens of seconds. Folding that into every run just teaches people to skip
> the tests. It cannot be deleted either: whether the arguments are right can be checked in
> seconds, but **whether the flow actually works can only be known by running it**
> (copying the profile, getting the probe into `bundles`, producing the report, and
> **leaving no litter behind**). When skipped it prints a line saying how to run it, so it
> does not become a silently missing test.

**261 assertions, spread across 15 test files.**

"Layers" here means two **different** things — they used to be conflated, which is why the same
docs said both "three layers" (`Plan.md` §0) and "seven layers" (this section):

* **3 epistemic layers** (`invariants` / `__expectations__` / `__snapshots__`) — each is, in
  principle, blind to the class of error the others catch; all three are required;
* **15 test files** — 8 further files each watch one concrete concern (arguments, cache, drift,
  doc drift, secrets, structure, packaging…). They are **not** part of those three layers, but they fail just the same.

What each file answers:

| File | Answers | Blind to |
|---|---|---|
| `invariants.test.mjs` | Is the result **self-consistent** (for any input)? | Results that are wrong but internally consistent |
| `snapshot.test.mjs` | Did the output **change** (key fields + content hash)? | Changes faithfully recorded into the snapshot |
| `__expectations__/` | Is the verdict the one we **promised**? (hand-written) | Cases nobody thought of |
| `cli.test.mjs` | Did the flags actually take effect? Are failures swallowed? | UI behaviour |
| `client-structure` / `host-structure` | Can a component/host **register successfully but do nothing**? | Real rendering |
| `cache.test.mjs` | Is the cache policy right, does a concurrent burst refresh **only once**, is the auto-check timing right? | Real startup ordering |
| `version.test.mjs` | Do all three entries + the report JSON report the **same** version? (guardian of the single-version promise) | The real publish flow |
| `labels.test.mjs` (**skipped by default**, `DSC_SLOW=1`) | Does the tool's "this entry will stay pending" match what the **host itself** reports? | Covers layer (1) only — silent degradation is unmeasurable |
| `client-arrival.test.mjs` (**skipped by default**, `DSC_SLOW=1`) | Did the planned client entries **actually arrive in the browser**? (with a negative control) | Slow (~45s): boots a host + headless Chrome |
| `docs.test.mjs` | Are the numbers in the **documentation** still right (continuous numbering, valid cross-refs, three-language consistency)? | Assertion counts (needs the suite; see `tools/doc-check.mjs`) |
| `secrets.test.mjs` | Are there credentials in the repo, would the **probe copy values out**? | Credentials in other shapes |
| `baseline.test.mjs` | Is every diff category right? **Is it quiet when nothing changed?** | Real plugins |
| `skill.test.mjs` | Can the tool actually do everything the skill claims? (doc drift) | —— |
| `probe-boot.test.mjs` (**skipped by default**, `DSC_SLOW=1`) | Does `--probe-boot` really boot a host and obtain a surface? | Slow (10-20s), hence not run by default |
| `packaging.test.mjs` | Is the npm package **self-contained** — really packs it and checks it still reaches a verdict | Slightly slow (~1-2s, runs `npm pack`) |

**All three layers are required** — established by measurement: injecting a "the fallback path never triggers" mutation leaves **all 69 invariants green while the snapshot turns red immediately**; conversely, emptying a plugin's call sites turns **the snapshot red while the invariants stay green**. Each is structurally blind to the other's failure mode.

> Only the **snapshot** layer may be regenerated. Invariants and expectations must **never be "regenerated to green"** — that is precisely what they are for.
>
> Regenerate with `UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs` (an environment variable, not `--update`: `node --test` treats arguments after the test file as *test filenames*, so the flag never takes effect while the exit code stays normal — **yet another silent no-op**).

## Maintenance

| To do this | Do that |
|---|---|
| Track a new DSH version | `python3 tools/catalog/extract-host-api.py` to re-extract the official catalogue |
| Change severity / impact wording | `rules/severity.json`, then run the tests (coverage and freshness invariants will notice) |
| Compare against the Python reference | `./tools/parity/parity.sh <node_modules dir>` |
| Change this repository | **Read [`Plan.md`](Plan.md) first**: 10 locked decisions, milestones, working rules, landmine list, and the measured DSH contracts |

## Known limitations

- Tool output is Chinese-only (this document is English; no i18n for the output strings yet)
- Method-level judgement is heuristic and can produce false positives; every known one is in `docs/extraction-findings.md`
- **The client half cannot be verified automatically** — it can only be listed, and needs a human to look at the UI
- The end-to-end script needs network access (npm registry, installing plugins) and `python3`
- Not verified on native Windows (the kernel is pure Node and should port; the script needs a POSIX shell)

## License

[MIT](LICENSE)
