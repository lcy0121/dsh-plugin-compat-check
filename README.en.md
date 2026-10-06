# dsh-plugin-check

> Find out whether a DSH community plugin actually works on **your** DeepSeek Harness version — in a few minutes, before you install it.

[简体中文](README.md) | **English**

---

## The problem it solves

DeepSeek Harness (DSH) is an agent harness where *everything is a plugin* — models, tools, sandboxes, session storage, the UI, even the agent loop itself. The community ecosystem is large, but **a plugin's declarations are not the host's reality**. All four of the following misjudgements were hit while building this tool:

| You might assume | What actually happens |
|---|---|
| `peerDependencies` says it supports version X → it works | The declaration can simply be wrong. One plugin declares support for `0.2.0` and throws `ctx.settings.register is not a function` on startup |
| DSH's version gate let it install → it works | The gate only compares **version range strings**. It does not verify that APIs exist |
| Startup logged no error → it works | Plugins commonly degrade with `try/catch` and `typeof` guards. **When an API is missing the plugin still "activates" — but that feature is dead** |
| Startup logs are clean → the client half is fine too | Client code runs in the browser. One plugin had a perfectly clean host startup while its client half threw and never registered any UI |

Reading declarations and logs is not enough. You have to **actually boot once, then diff the host's real API surface against the services and methods the plugin really calls.** That is what this tool does.

## Requirements

- **DSH CLI**: `dsh` available on `PATH` (on desktop, install it via the menu bar → "Manage dsh Command…")
- **A POSIX shell**: macOS or Linux. On Windows, run it under WSL or Git Bash
- `bash`, `python3`, `curl`, `pgrep`/`pkill`

## Quick start

```bash
git clone https://github.com/<your-user>/dsh-plugin-check.git
cd dsh-plugin-check
chmod +x dsh-plugin-check.sh
```

```bash
./dsh-plugin-check.sh <spec> [--keep] [--timeout SECONDS]
```

`<spec>` is exactly what `dsh plugin add` accepts:

```bash
# npm package name
./dsh-plugin-check.sh dsh-keep-awake

# GitHub repo (many ecosystem plugins are never published to npm)
./dsh-plugin-check.sh github:owner/repo

# A plugin you are developing locally
./dsh-plugin-check.sh file:/path/to/my-plugin
```

| Option | Effect |
|---|---|
| `--keep` | Keep the throwaway profile and evidence for manual inspection (deleted on exit by default) |
| `--timeout N` | Seconds to wait for startup; default 30. Heavier plugins need more |

> Note: the tool's own output text is currently in Chinese.

## Reading the output

```
✓  agents: list 均存在                      ← this really works
⚠️  settings: 调用了不存在的方法 ['register']
      宿主实际提供: configure, describe, mutate, replace …
❌ 服务缺失: xxx                             ← functionality is definitively broken
◻︎ 客户端服务: locale, slots                 ← not testable here; verify in the UI
```

| Verdict | Meaning |
|---|---|
| **API surface complete, clean startup** | Usable at the host level; the client half still needs a visual check |
| **Partially usable** | Some APIs are missing → those features fail or silently degrade; the rest works |
| **Incompatible** | It cannot even pass DSH's version gate to install |

## What it does

### ① Identity check

Looks up the npm package name to find **which repository it actually belongs to**.

This is not paranoia — name collisions are real in this ecosystem. For example, the npm name `dsh-effort-slider` belongs to one repository while the plugin you want may live in a different same-named one; and the npm package `aegis` is unrelated to the plugin of that name (which only exists on GitHub). **Installing the wrong package is worse than failing to install** — it silently runs something else.

If the npm metadata declares no `repository`, the script warns explicitly.

### ② Isolated install

Creates a throwaway profile (`plugincheck`, from the `web` template) and installs the target into it.

A failure here usually means DSH's built-in version gate rejected it — such plugins cannot even be installed.

> **Your real profiles (`desktop`, etc.) are never touched.**

### ③ Static extraction of what the plugin actually calls

Scans the plugin's sources for the services and methods it **really calls**, not just what it declares.

It separates **host-side** from **client-side** services — the latter live in the browser and are inherently invisible to a host probe, so they must not be reported as "missing".

### ④ Real boot + API-surface diff

Boots the host, dumps its **real API surface** with the bundled probe, and diffs it against the call sites from ③.

> The probe walks the **prototype chain**. That is a lesson paid for: enumerating only own properties misses prototype methods, which once led to the wrong conclusion that a version had *removed* a capability — when in fact the method had merely been renamed.

## Two boundaries you must know

**1. The client half can never be tested from the command line.**
Client code executes in the browser. The only way to confirm it is to look at **whether the plugin's own UI element appears** (a button, a tab, a settings card). This tool lists client-side services but deliberately **does not** judge them.

**2. Method-level findings are regex heuristics.**
Static scanning can mistake a non-call site for a call. When unsure, pass `--keep` and inspect the raw data:

| Path | Contents |
|---|---|
| `/tmp/dsh-plugin-check/boot.log` | Host startup log (including `did not activate`) |
| `/tmp/dsh-plugin-check/static.json` | Extracted services and call sites |
| `/tmp/dsh-plugin-check/probe-report.json` | The host's real API surface |

## Artifacts and cleanup

On exit (`trap EXIT`) the script:

1. Recursively kills the test server's process tree
2. Sweeps for leftover sleep-inhibitor helpers such as `caffeinate`
   > This is a safety requirement: a keep-awake plugin that leaves its helper process behind will prevent your machine from ever sleeping
3. Deletes the throwaway profile (unless `--keep`)

## Layout

```
dsh-plugin-check/
├── dsh-plugin-check.sh   # Orchestration: identity → install → extract → boot → diff
├── probe/                # Diagnostic probe (installed into the throwaway profile via file:)
│   ├── package.json
│   ├── cordis.patch.yml
│   └── index.mjs         # Prototype-chain walk + scoped-context probing
├── README.md
├── README.en.md
└── LICENSE
```

## Implementation notes (read before modifying)

- **The probe declares no `inject`**: doing so would leave it stuck in `PENDING` whenever a service is missing, which *reduces* what it can observe. It relies on delayed execution plus `try/catch`.
- **The probe writes `probe-applied.txt` before probing**: otherwise "no report" cannot be distinguished between "the plugin never loaded" and "probing threw midway".
- **Client-side service detection uses `any`, not `all`**: plugins often share code under something like `src/shared/`. Requiring every referencing file to live in a client directory misclassifies client services found in shared files — this did happen with a real plugin during testing.
- **Mind hard links after editing `probe/index.mjs`**: once installed into a profile the plugin is hard-linked or copied. Writing in a way that replaces the inode (some editors do) leaves the `node_modules` copy stale, producing "I changed the code but behaviour did not change".

## Known limitations

- Output text is currently Chinese only
- Covers the host-side API surface only; the client half needs manual UI confirmation
- Method-level findings are heuristic and may produce false positives
- Requires network access (npm registry lookup, plugin install)
- Not verified on native Windows

## License

[MIT](LICENSE)
