# dsh-plugin-compat-check

If you find this project useful or interesting, please consider giving it a [star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)!

Check **installed DSH plugins** against a target DSH version, with source locations, evidence and coverage limits. Accepted declarations and successful activation do not establish working business features.

[简体中文](README.md) | **English** | [한국어](README.ko.md)

## Version and entry points

**0.1.6** · Node `^22.19.0 || >=24`. The npm plugin provides a compatibility tab, per-plugin findings/badge, `compat_check` and a skill provider. The repository provides a CLI, installation runner and development tools sharing the verdict kernel. The npm package has **no CLI bin**; `npx dsh-plugin-compat-check` is unavailable. Delivery, verification and follow-up work: [Plan](docs/Plan.md).

0.1.6 is a metadata patch: it declares DSH `>=0.2.0-rc.2` and refreshes package information, retaining 0.1.5 functionality. The minimum requirement does not certify future hosts; reviewed catalogs and integration acceptance cover only DSH **0.2.0-rc.2 and 0.2.1-rc.2**.

## Screenshots

Recorded detail views illustrate reporting, not complete compatibility certification:

![Partial availability: locations, impact and evidence](plugin/assets/compat-detail-partial.png)
![Declaration conflict: inferred risks and host hints](plugin/assets/compat-detail-declared.png)

## Quick start

### Plugin

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2: **More → Settings → Built-in plugins → Compatibility**. Select your actual profile; desktop is not assumed. Agents can call `compat_check`.

The panel includes search/combined filters, collapsible findings, complete report preview/copy, baseline new-risk views and next verification steps. Installation/loader events and five-second polling refresh cached reports, retaining filters and previous results; failures show a reason. Reports show the target, catalog version/digest and acceptance scope. Duplicate plugin identities fail explicitly without advancing the baseline. Bound probes more than five minutes ahead are rejected while static findings and the reason remain visible.

Dependency views distinguish host/client, required/optional and subscopes. Provider declarations are **candidates**; paths and cycles do not prove actual failures. Review records are separate, require review again after identity changes, and never hide findings or override verdicts, baselines or waivers. The health panel **imports historical JSON only** and executes no checks; historical success does not prove the current artifact works. See the [guide](docs/guide.md).

### Repository CLI

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| Option | Purpose |
|---|---|
| `--nm <dir>` | Required profile or node_modules directory |
| `--dsh-version <v>` | Explicit target version for ordinary checks |
| `--probe <json>` / `--probe-boot` | Read observations / explicitly start a temporary host; file takes precedence |
| `--json` / `--quiet` | Full JSON / summary line |
| `--no-baseline` / `--dry-run` | Disable baseline reads/writes / compare without writing |
| `--baseline-file <path>` | Select baseline file |
| `--issue-report` | Redacted Markdown by default; no baseline access; incompatible with json/quiet |
| `--rules <json>` / `--catalog <json>` | Override rules / API catalog |
| `--help` / `--version` | Full help / tool version; no target required |

Preview reports before sharing: redaction retains plugin names and package-relative paths. Raw logs, probes and baselines are excluded; nothing is posted automatically. Probe budgets and additional options are in `--help`.

### Pre-upgrade compatibility preview

Enter a target version in the panel or call `compat_check({"upgradeTo":"0.2.1-rc.2"})`; the running host supplies the current version. The repository CLI requires both exact versions:

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
```

Both ends support only **0.2.0-rc.2 and 0.2.1-rc.2**. Unknown versions/ranges return `status=unsupported-version`, exit 3, without catalog fallback. One static extraction of private plugin byte copies feeds independent catalog/declaration judgments, retaining artifact hashes, catalog sources/digests, both reports, differences and coverage limits. Worker budgets and cleanup apply; this is not an OS atomic snapshot.

Preview executes no plugins or host installation/upgrade, uses no runtime observations, probes, profile waivers, ordinary cache or baseline, and writes no product state. Exit **0/1/2** means no new/worsened risks, nonfatal new/worsened risks, or fatal new/worsened risks; **3** means unavailable. Existing target problems remain in `targetReport`. **Exit 0 does not establish target usability or successful business behavior after upgrade.** See the [contract](docs/Plan.md#27-升级前静态预检契约) for parameter restrictions.

### Repository workflows

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh --install-skill
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
```

Installation checks require Node, DSH and pnpm; accept npm/GitHub/git/file specs and support `--keep` and `--timeout` (30 seconds by default). They may access the network, start the host and execute the plugin. **A temporary profile is not an OS sandbox.** Replacing an existing standalone skill requires `--force`; see [skill delivery](skill/README.md).

Static batch manifests pin versions/tree hashes, with up to 16 items, 10 seconds each and 60 seconds total. No target installation/execution or probe/baseline access occurs. Results need author review, not business certification; the fixture expects exit 2. Author CI provides risk/coverage gates, JSON/SARIF/JUnit/HTML and version matrices. The health executor defaults to review and requires explicit `--run` plus authorization for that invocation to execute target commands; **it is not an OS sandbox**. These tools and real-plugin/browser/model regressions belong to the repository and are not shipped in npm. See the [guide](docs/guide.md), [author CI](docs/author-ci.md) and [maintenance notes](docs/maintaining.md).

The private repository root is not an activatable plugin. Build a complete tgz for source installation; a root GitHub spec or bare `plugin/` copy is not equivalent. See [source packaging](plugin/README.md#从源码构建安装).

## Results and limits

Ordinary CLI/Node installation checks: **0** no findings, **1** partial/unknown, **2** incompatible or peer gate rejection, **3** input/execution error. Upgrade preview uses the difference codes above. Automation should use the Node entry and inspect `status`.

- Preserve `certainty`, `impactBasis`, `coverage` and `vacuous`. Unknown, unsampled and omitted keys are not missing APIs; catalogs are not runtime surfaces. Client business features need separate acceptance.
- Static CLI checks do not start DSH or install targets. In-host checks use bounded analysis workers without external commands/network access. Ordinary checks write their own baseline by default; use `--no-baseline` for one-off checks. Incomplete scans never advance it.
- Bounded Babel AST/package-local value flow does not execute target source; dynamic coverage is limited. Modern observations must match profile, version and freshness; evidence cannot be borrowed across profiles.
- Ordinary checks support DSH declaration policy and exact compatibility waivers. Unknown/future versions and custom catalogs remain uncertified. macOS/Linux have limited validation; Windows awaits real acceptance. See the [full contract](docs/Plan.md#2-现行判定与集成契约).

## Development and documentation

```bash
npm test
npm run check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

Default tests start no real DSH/model; packaging regression needs npm registry access. `doc-check` does not run tests recursively. Metadata verification needs gh/npm and network access; failed retrieval is not a pass. Prepublication checks do not publish.

[Plan](docs/Plan.md) · [Counts and evidence](docs/current-state.json) · [Rules](rules/README.md) · [Guide](docs/guide.md) · [Maintenance/catalog governance](docs/maintaining.md). Ecosystem listings and upstream follow-ups are tracked in Plan; listing is not compatibility certification.

## License

[MIT](LICENSE) · Third-party dependencies and licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
