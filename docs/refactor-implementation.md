# Compatibility evidence refactor implementation plan

Spec: `GPT审计及重构方案文档.md` (2026-10-14), user authorized implementation.

Global constraints: local only; preserve original audit as historical evidence; no publication, remote changes, or formal-profile writes. Keep deterministic rules, one kernel, JS/TS static inspection without executing inspected source. Unknown evidence stays visible. Keep npm plugin-only delivery (CLI remains repository distribution), explicitly document it. Version next local release 0.1.1, not published.

Execution: inline, test-first, independent final review. Baseline failure is the already-audited documentation count; remediation is authorized. Worktree was created but write permission denied, so use current checkout on codex/compat-evidence-refactor. Tests isolate state/cache under temporary directories.

### Task 1: Syntax and package-source boundaries

Write behavioral regressions for B04/B05/B06/B07 and S03: code vs comments/strings, template expressions, lexical aliases/shadowing, side-effect imports, same-line separate calls, actual controlling guards, optional-service vs optional-method, shared execution labels, symlink cycle dedup and bounded/outside traversal. Watch old implementation fail.

Implement pinned Babel parser adapter for JS/TS, source graph and analysis modules; preserve public extract/extractWithProvenance shapes while adding spans/dependencies/diagnostics/fileSides. No target imports/eval. Unknown/unsupported inputs create diagnostics, not certain verdicts. Runtime distribution stages required modules and dependency.

Verification: `node --test test/extraction-regressions.test.mjs` then existing micro behavioral tests; report intentional snapshot changes.

### Task 2: Observation and verdict evidence

Write regressions for B01/B02/B03/B07/B09: unobserved vs absent, hard+soft precedence, shared host/client, strong-source builtin methods, old/malformed/capped probe data, and suspected declaration conflicts. Add loader FAILED/PENDING/disabled evidence tests.

Implement observation normalization, dependencies by side/kind, scoped call evidence, declaration contract adapter conservatively; precise certainty and measured-vs-inferred. Keep legacy v1 probe usable only for explicitly recorded services, label unbound provenance; modern profiles/versions must match. Add coverage/status fields without silently upgrading unknown to confirmed usable. Keep backward `ok` label if no failures but explicitly coverage limited.

Verification: `node --test test/verdict-regressions.test.mjs test/invariants.test.mjs`.

### Task 3: Runtime adapter, reports and baseline

Regressions for B08/B10/B13/B14: actual loader states entering report, explicit profile parameters, error summary, concurrent cold/refresh single-flight, failed background refresh retains valid result, severity/certainty/identity changes, neutral upgrade, atomic writes, and inference labels across all channels.

Extract shared profile/baseline store and report service; immutable compute options, in-process service sampling without subprocess/network, mapped loader states, shared display DTO. Preserve requested-profile failure instead of desktop fallback. Private opt-in loader diagnostics. Keep CLI/static and runtime baseline evidence identities distinct; baseline advances only for successful complete report.

Verification: focused real-module behavioral tests plus host/client/CLI tests.

### Task 4: Safe opt-in orchestration and debugger

Regressions for S01/S02/B11/B12 using fake external command executables and private sentinels. Replace shell workflow with thin Node runner wrapper while preserving help/install-skill/version; fresh private workdir and owned profile; strict setup/ready/error classification; stdout one JSON, stderr progress; propagate 0/1/2/3; never global pkill. CLI probe boot uses same owned lifecycle and async bounded waits. Probe private explicit output/descriptor shape/truncation/errors. CDP inherited pipe (no TCP endpoint), owned child lifecycle and command timeouts.

Verification: safety runner/probe/debugger tests; no live user profile starts required.

### Task 5: Packaging, release checks and information documents

Test independent tarball execution, required module/dependency/license contents and source-copy deployment limitations. Stage all kernel runtime modules; include LICENSE; local 0.1.1 version equality; lock parser dependency. Offline release check consumes test summary for doc-check instead of recursive/repeated tests; network metadata check stays separate. Establish minimal Node CI matrix.

Update Plan current decisions/status with evidence and preserve superseded history, reopen/clarify extraction findings, reconcile Chinese/English/Korean/npm README and skill. Replace fragile prose-count gates with generated, machine-checkable current summary; no npm CLI claim.

Verification: complete default suite, doc/release checks, npm pack independent runtime check, Node version matrix where runnable. Do not claim real DSH/browser/Windows integration if not run.

### Task 6: Integration and independent review

Run full suite and artifact validation after any fixes, inspect diff/secrets/state cleanup. Send one fresh-context whole-change reviewer the implementation plan, audit and diff. Fix important findings with regression-first verification. Document reviewed behavior changes, remaining explicit limits and exact verification. Keep work on local branch; no push/publish.


Execution record: all six tasks implemented locally. Independent review found six Important cases, all reproduced then fixed and independently rechecked (42 targeted tests + 6 variants); the final bounded follow-up passed 46 targeted tests with no new blockers. Additional regressions cover scoped-inventory read failures, descriptor sampling, actual entry Context identity, exact declaration export roles and inferred peer conflicts. Full default suites passed 341/341 on Node22.19.0 and24.21.0; Node26.11.1 prepublish checks passed the same 341 tests and document gate. Final verification is recorded in refactor-results.md/current-state.json. Work remains on codex/compat-evidence-refactor, without merge, push, publication or real-profile mutation. Real DSH/browser/Windows integrations remain explicitly outside this run's verified scope.
