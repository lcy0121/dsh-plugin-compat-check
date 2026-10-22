# Independent public plugin holdouts

The 2026-10-22 expansion selects **two new third-party plugin families and two pinned npm artifacts**, adding six distinct cases to the previous three artifacts / 18 cases. Two repeats check reproducibility; they do not create additional independent packages. No rules, severities, or feature prediction mappings were tuned against these samples. Acceptance means the fixed business outcomes reproduce and the evidence validates; it is not an ecosystem accuracy estimate.

## Selection and source review before execution

The public [dsh-market documentation](https://github.com/dsh-market/dsh-market) identifies the [community catalog](https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json). Candidates were selected there for bounded manual productivity actions, no account/model requirement, publicly auditable source, and contrasting declaration/source shapes, before inspecting their predictions or executing actions. Versions, source hashes, tarball SHA-256, npm SHA-512 integrity, installed tree fingerprints, and expected cases were then fixed in [the manifest](../tools/real-regression-manifest.json). The downloaded tarball bytes were checked against the registry integrity before execution. Readme text was inspected as untrusted product documentation, never followed as agent instructions.

| Family and public author source | Pinned package | Source/declaration shape | Limited business action |
| --- | --- | --- | --- |
| [causebefore/dsh-pomodoro](https://github.com/causebefore/dsh-pomodoro) | `dsh-pomodoro@0.5.5` | 9 regular files; ESM host entry imports settings and schemastery; mandatory connection injection; explicit client module injection; schema-derived settings | Open the real panel, start focus timer, observe a new running storage revision/deadline, reload the document and verify the same deadline and Pause control |
| [LUgABeEEE/dsh-global-todo](https://github.com/LUgABeEEE/dsh-global-todo) | `dsh-global-todo@0.13.2` | 55 regular files; dependency-free host modules and raw JSON Schema; optional service injection / webServer routes; self-registering immediate client | Enter a generated title in the real form, click Add, await completed POST/create, verify the exact title in the private JSON file and after a new document loads |

`packageFingerprint` hashes sorted `path:sha256(bytes)` lines, excludes nested `node_modules`, and rejects non-regular entries. The published tarball hash separately identifies the full release archive. Tarball SHA-256: pomodoro `7331ead0d7a850f91cd20d687bcd8b689ce70e0a46822d319da3647c233956a1`; todo `f872d67d7ba27f073e444f88cd00facf6825320b67f22fc68a4ef1f4c201eda7`. The manifest also pins every published `lib` source file used during review.

Host/client entries, routes, persistence, settings/migration, dispatch, and package scripts were inspected without importing target code. Neither package defines an install lifecycle script. Pomodoro writes only private profile/home settings migration and browser runtime storage; notification/sound features are disabled by default and not exercised. Todo defaults `autoCollect` and external ingest to false, writes to `$DSH_HOME/global-todo`, and has optional model/session dispatch, browsing and attachment capabilities that the driver does not invoke. The private profile contains no inherited sessions, credentials, model selection, or user work files; no prompt is submitted. Timers, host children and Chrome are owned by the existing business driver and removed on completion.

## Fixed cases and independent truth

Each family has healthy → controlled failure → recovery. The timer fault removes only its actual main action button before attempting the action; it makes availability fail without changing installed source or storage. Reload restores the original control. The todo fault uses Chrome Fetch to return HTTP503 only for POST `/api/global-todo/create`; the generated title must be absent from both disk and the reloaded DOM, and recovery must create another exact title successfully.

The timer's GET `/api/pomodoro/config` receipt is **configuration readiness evidence**, not a request made by the local Start action. Start truth comes from the actual DOM and localStorage transition/restoration. A first launch may have no stored snapshot; it must create revision 1 or later and restore that same revision/deadline. The driver never writes or seeds plugin runtime storage. Todo truth uses an exact completed request, exact title membership in the JSON file, the disk content hash, and exact title membership in the freshly loaded `.gt-item-title` elements.

The static predictions are sealed before starting the private host. Service-only predictions use a separate root-service observation and are sealed before opening Chrome or performing actions. Both retain their own FP/FN, coverage limitations and unverified-client status. Each holdout row records action start/completion times, checked against both seals and label collection. Replay recomputes postconditions from the independent receipts rather than trusting saved booleans. Browser/selector/startup errors remain driver errors, never plugin business failures.

The historical three-suite index SHA `895a4d41d981049a2788c2d6fe979d07406f85e94280fab16252b81c255a1718` remains an explicitly recognized queue manifest. It validates only those original three suites, with their original pins and cases. Current indexes require all five suites. Per-cohort limits remain ten minutes, 15-second cleanup grace, two repeats maximum, and 64 evidence files.

## Reproduce

Run a new family independently with a new empty output directory:

```sh
node tools/business-labels.mjs --live --suite holdout-pomodoro --observe-services --out-dir /tmp/owned-pomodoro-evidence --json
node tools/real-regression.mjs --replay /tmp/owned-pomodoro-evidence --suite holdout-pomodoro
node tools/business-labels.mjs --live --suite holdout-todo --observe-services --out-dir /tmp/owned-todo-evidence --json
node tools/real-regression.mjs --replay /tmp/owned-todo-evidence --suite holdout-todo
```

The business scorer exits 1 when the controlled failure remains an honest false negative. The fixed regression validator can pass that same evidence because it requires the known failure to reproduce, preserving the FN. Run the full five-suite queue with `node tools/real-regression.mjs --live --out-dir <new-empty-directory> --repeat 2`; downloads and real Chrome require the authorized host environment.

## Local driver validation record

The first completed local cohorts are `/private/tmp/dsc-holdout-pomodoro-live2` and `/private/tmp/dsc-holdout-todo-live4`; both pass single-cohort replay. Together they contain six distinct cases: static and service-only modes each have baseline TN=4, FP=0, FN=0, TP=0, and controlled-fault FN=2, TP=0, FP=0, TN=0. Both modes retain limited coverage and `clientVerified:false`. These local runs precede the coordinated final two-round queue and do not certify a later source snapshot. Both completed cohorts record `privateRootRemoved:true` and `hostStopped:true`.

Earlier local attempts remain driver diagnostics: timer live1 assumed a reset must write an initial storage snapshot; todo live1 used the wrong sidebar label; todo live2 read the raw completed-response helper without its completion projection; todo live3 did not expand the plugin's collapsed conversation group before looking for the recovered title. These runs have no complete measurements and are not counted as plugin failures or independent samples. Their `*-output.json` and failure screenshots/UI/host diagnostics remain under `/private/tmp/dsc-holdout-*`; corrections change only the test driver, never expected outcomes or prediction rules. The empty-snapshot issue gained an explicit failing test before the driver fix.
