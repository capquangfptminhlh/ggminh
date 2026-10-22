# Reconciliation map — phase-C integration × the two remote streams

Agent R11 (Wave R, release-prep). READ-ONLY analysis of the other streams;
nothing was pushed anywhere. Every claim below is tied to a commit, a blob
hash, a diff, or a command actually run in this clone
(`~/workspace/ggminh-release/r11`). The two trial merges cited as evidence
exist as local scratch commits `215f916` (step 1) and `6ff7d92` (step 2)
in this clone and can be inspected or deleted by the coordinator.

## 0. Refs and topology (verified 2026-10-22)

| Stream | Ref | Tip | Shape |
|---|---|---|---|
| Phase-C integration (ours) | local `f280296` / remote snapshot `f549a63` | f28029655… | 76 commits above 8349f38 |
| (a) D1 branch | `feature/d1-camoufox-per-profile-identity` | **7f13c3f** | exactly **1 commit** above the shared base |
| (b) Selective integration | `integration/v5.8-core-selective` | **8c1ab69** (task-pinned) | 5 commits above its base 4af6513 |
| (b′) Selective, live tip at fetch time | same branch | **67287ae** | 8c1ab69 + 1 CI commit (see §5.4) |

Merge bases (computed, not assumed):

- `merge-base(f280296, 7f13c3f)` = **8349f38** (constitution v1.3 commit).
- `merge-base(f280296, 8c1ab69)` = **4af6513**, and `4af6513` is an ancestor
  of 8349f38. Selective branched off **before** the constitution commits
  (90b20de…8349f38) and never merged them: its tree has **no
  TIEU-CHI-SAN-PHAM.md at all** (verified `git cat-file -e` at 8c1ab69 and
  67287ae → ABSENT; present at 7f13c3f and f280296). Merging selective into
  phase-C therefore cannot conflict on the constitution; the phase-C copy
  simply stays. Per §13 the constitution lineage (phase-C/D1) is the anchor.
- `.github/workflows/windows-exe.yml` is the **identical blob 30d5ecc** at
  8349f38, 7f13c3f, 8c1ab69, 67287ae and f280296 — zero divergence in all
  three streams. (The Gate-2 workflow question is about the *remote*
  `.github` state vs the `release/workflows/` copies, i.e. QD-04 — not a
  stream divergence.)

## 1. The headline discovery: the two "streams" share identical content

For the four deliverables that exist in both remote streams, the blobs are
**byte-identical** between 7f13c3f and 8c1ab69:

| File | Blob at 7f13c3f | Blob at 8c1ab69 | At f280296 |
|---|---|---|---|
| docs/FAIL_CLOSED_AUDIT_v5_8.md | 698ac388 | 698ac388 | ABSENT |
| test/fail-closed-audit.js | 40c4077d | 40c4077d | ABSENT |
| test/license-center.js | 1d4b140b | 1d4b140b | 3fcdf545 (different — see §3) |
| src/api/server.js | bae22a7c | bae22a7c | cfd89b29 (different — see §2) |
| package.json | 95f6119b | d5856ef2 | 39428f9d (all three differ — see §6) |

So 7f13c3f ("integrate fail-closed audit, Stage-0 configured workflow,
behavior pattern alerts and license tamper hardening") and the selective
commits 4f31a7f (fail-closed audit) + c505fa5 (license tamper fix) carry
**the same work in two envelopes**. There is exactly one genuine
behaviour-level conflict in the entire reconciliation (§4), one duplicated
fix to resolve by keeping ours (§3), and everything else is textual
conflicts over additive content, proven by the trial merges in §7.

## 2. (a) D1 branch 7f13c3f — file-by-file (base 8349f38, 8 files)

| File | D1 side | Phase-C side | Class | Resolution |
|---|---|---|---|---|
| .github/workflows/camoufox-upstream-smoke.yml | M (+48) | untouched (V0) | pure addition | take D1 (V1) — see §6 |
| docs/FAIL_CLOSED_AUDIT_v5_8.md | A (41 lines) | absent | pure addition | take |
| test/fail-closed-audit.js | A (232 lines) | absent | pure addition | take; PASS post-merge (§7) |
| src/monitor/behaviorMonitor.js | M (+9) | untouched | addition **with semantic caveat** | take **only with the §4 guard**, or drop |
| src/api/server.js | M (4 lines) | M (A10, bdae327) | textual auto-merge, semantics disjoint | take both (§2.1) |
| .gitignore | M (+`dist/`) | M (A10 key fence) | textual conflict, trivial | union |
| package.json | M (+1 chain step, +`test:fail-closed`, stage0:test +audit) | M (+28 steps, +`test:all`, builder pin) | textual conflict | union → chain 202 (§6) |
| test/license-center.js | M (tamper fix) | M (tamper fix, f280296) | **duplicate fix** | keep phase-C (§3) |

Trial merge `git merge-tree f280296 7f13c3f` and a real scratch merge agree:
conflicts in exactly {.gitignore, package.json, test/license-center.js};
server.js auto-merges.

### 2.1 src/api/server.js — a §8 improvement, not a conflict

D1 replaces, in the Camoufox start path, `throw Error('Playwright
BrowserContext was not established')` with a structured fail-closed
response: HTTP 409 `{code:-1, msg:'Camoufox automation unavailable:
Playwright BrowserContext was not established', data:{engine:'camoufox',
protocol:'unavailable', debug_port:null, ws:{playwright:null}}}`.
Phase-C's A10 change (apiProfile() minimisation) sits in a different
region; the hunks are disjoint and auto-merge (verified). Semantically the
D1 hunk *strengthens* the §8/API contract: the context-not-established
case now returns the documented 409 shape (the same "Camoufox automation
unavailable" case the customer docs already list) instead of an exception
surfacing as a generic error, and it fabricates no debug port or socket —
the audit doc's "409 with no fake WebSocket/port". The new audit test case
`API_START_MISSING_CONTEXT_409` (test/fail-closed-audit.js:82-84) depends
on this hunk and PASSES against the merged tree (§7). **Take it.**

The audit itself (docs + test) is honestly scoped: mocked entrypoints, "It
complements, does not replace, the Windows upstream Stage-0 20/20
measurement", explicit limits list — §3/§14-compliant wording. One stale
line to fix after reconciliation: the doc's scope sentence says
"integration/v5.8-core-selective branch / Draft PR #16 only".

## 3. License tamper "hardening" — a duplicate test fix; Wave-2 QA state untouched

Both remote streams change **only the test** (no `src/licensing/` file is
touched by 7f13c3f or by c505fa5): the old tamper
`signed.slice(0,-2)+'AA'` could be a no-op because the last base64url
characters of an Ed25519 signature carry few significant bits.

- D1/selective fix (blob 1d4b140): split on '.', flip the **first**
  character of the signature segment (A↔B), assert notStrictEqual.
- Phase-C fix (f280296, from Agent 11's diagnosis): flip the character at
  `lastIndexOf('.')+10`, same A↔B swap.

Same defect, same technique, different offset. Phase-C's version is the
one already proven in the integrated tree (0/40 coordinator runs, Agent
20's 35-run loop, and the green Windows CI run 39641363889 on the 201-step
chain). **Resolution: keep phase-C's file unchanged in both merge steps;
the streams' change is a duplicate and is dropped.** Nothing in either
stream alters the Wave-2 license QA results (Agent 18's state matrix,
corrupt-file fail-closed fixes in `src/licensing/`) — those files are
identical/absent across the streams.

## 4. THE one semantic conflict: behaviour-pattern alerts × warning pipeline

D1's behaviorMonitor.js hunk (+9 lines) merges
`behaviorPatternWarnings(recent).alerts` into `BehaviorMonitor#getReport()
.alerts`, deduped by (code, profileId) against the monitor's own threshold
alerts, inside try/catch.

Phase-C's warning service (src/monitor/warningService.js, Wave-2/A8 wiring)
already consumes D2 patterns **twice over**:

1. directly — `fromBehaviorPatterns` calls `behaviorPatternWarnings`
   itself (warningService.js:223) from `input.behaviorEvents`;
2. by passthrough — `fromMonitorAlerts` (warningService.js:345) normalises
   `input.monitorAlerts`, which main.js:752 fills with
   `behaviorMonitor.getReport().alerts`.

Warning identity is `source:code:profiles` (warningService.js:193). The
same pattern fact therefore enters the §22 report **twice** after the D1
hunk: once as `behavior-patterns:<code>:…`, once as
`behavior-monitor:<code>:…` — and Agent 8's durable warning history then
persists both entries.

**Proven empirically on the scratch-merged tree** (probe: 3 profiles
opened inside 60 s → one `synchronized_open_burst` fact):

- Unmerged f280296: monitor report has no pattern alert; §22 report =
  **1** entry (`behavior-patterns:synchronized_open_burst:app`).
- After merging the D1 hunk: monitor report contains the pattern alert;
  §22 report = **2** entries (both ids above). DUPLICATION CONFIRMED.
- No crash risk: pattern alerts carry exactly the
  {code, level, profileId, count, message, latestAt} shape
  `fromMonitorAlerts` validates, so the failure mode is duplication, not
  an error source.

Constitution reading: §16/§22 require one warning per fact with its
evidence; knowingly double-reporting one observation as two warnings (and
splitting timesObserved across two history entries) contradicts that
discipline. **The hunk must not be merged unguarded.** Options:

- **A (recommended)** — take the hunk AND add a 2-line guard: tag merged
  alerts in behaviorMonitor.js (`{...p, origin:'behavior-patterns'}`) and
  skip tagged alerts in `fromMonitorAlerts` (they are already covered by
  the direct source). Preserves D1's real gain — pattern alerts become
  visible in the Control Tower behaviour panel (main.js:424/430) and the
  `get-behavior-report` IPC (main.js:745), surfaces the §22 path never
  reaches — with zero double-counting. Coordinator-owned files
  (warningService.js), needs its own test run (warning-service,
  behavior-monitor, warning-history + the duplication probe expecting
  exactly 1 entry).
- **B — drop the hunk.** Product stays correct: pattern alerts still warn
  through the §22 report. Only the behaviour panel loses pattern
  visibility. Zero risk to the verified Wave-2 pipeline.

## 5. (b) Selective integration 8c1ab69 — file-by-file (base 4af6513, 12 files)

| File | Selective side | Phase-C side (vs 4af6513) | Class | Resolution |
|---|---|---|---|---|
| docs/FAIL_CLOSED_AUDIT_v5_8.md | A | absent | pure addition (identical to D1's) | take (no-op after step 1) |
| test/fail-closed-audit.js | A | absent | pure addition (identical) | take (no-op after step 1) |
| stage0-measure/headers.js | A | absent | pure addition | take |
| stage0-measure/network-review.js | A | absent | pure addition | take |
| stage0-measure/report-gate.js | A | absent | pure addition | take |
| stage0-measure/report-integrity.js | A | absent | pure addition | take |
| stage0-measure/snapshot.js | A | absent | pure addition | take |
| stage0-measure/validate-report.js | A | absent | pure addition | take |
| stage0-measure/run.js | M (+30/−4) | M (+12/−3 via phase-C A5) | textual conflict, **zero semantic conflict** | union (§5.1) |
| src/api/server.js | M | M (A10) | auto-merge (identical change to D1's) | take both (no-op after step 1) |
| package.json | M (+1 chain step, +`test:fail-closed`) | M | textual conflict | union (§6) |
| test/license-center.js | M (c505fa5) | M (f280296) | duplicate fix (§3) | keep phase-C |

Trial merge `git merge-tree f280296 8c1ab69`: conflicts in exactly
{package.json, stage0-measure/run.js, test/license-center.js}.

### 5.1 stage0-measure/run.js — two additive measurement layers on one runner

- Selective adds: imports of its 5 new modules; a loopback
  `/stage0/headers` endpoint; report sections `serverRequestEvidence`,
  `snapshotComparison`, `restartObservations`, `networkReview` (all
  defaulting to NOT_RUN); restart exposed-value capture;
  `writeReport(sealReport(report))`; and a gate — if the storage checks
  PASS, the sealed report must satisfy `validateReport` (20 assertions:
  4 FIELDS × 5 REQUIRED conditions) or the runner exits 2.
- Phase-C adds (Agent 5): `extendedProbe/summarizeProbe` from `./core`,
  `captureExtended()`, and an `extendedEnvironment` report section.
- The 4 textual conflict hunks (imports, report literal, capture tuple,
  report assignment) are all **union-resolvable with no semantic
  interference** — verified by actually resolving them in scratch (§7).
- Gate compatibility proven: `report-gate.js` checks named fields only
  (no unknown-key rejection), FIELDS is identical on all sides
  (`['cookie','localStorage','indexedDB','cacheStorage']`; phase-C's
  `ISO_FIELDS` in core.js is a separate constant), and the seal is a
  SHA-256 over canonical sorted-key JSON of the whole body, so extra
  sections cannot break it. A synthetic sealed report carrying **both**
  sides' sections validates: `{accepted:true, storageAssertions:20,
  issues:[], releaseApproved:false}`.
- Honesty notes: `report-integrity.js` labels its checksum
  `notASignature:true`, and the gate returns `releaseApproved:false`
  unconditionally — §23 evidence discipline kept. The gate also *requires*
  network fields to stay `NOT_RUN` in this runner, which the merged
  runner still satisfies.

### 5.2 What selective's stage0 modules are

Read-only evidence tooling for the base (unconfigured) Stage-0 runner:
server-observed request headers vs browser-exposed values
(`MEASURED_LOOPBACK_ONLY`), cross-profile snapshot comparison and restart
drift (`MEASURED_READ_ONLY`), a network review scaffold (NOT_RUN), and
tamper-evident report sealing + validation. They complement, and do not
overlap, phase-C's `run-config.js` (configured/pinned-identity runner,
present only on the phase-C side) and `run-isolation.js`.

### 5.3 §8 fail-closed changes in selective

The fail-closed content of selective is exactly 4f31a7f = the audit test +
doc + the server.js 409 hunk — identical to D1's (§1, §2.1). No other
`src/` file changes: no EngineFactory, NetworkSafetyCheck, or controller
edits exist in either remote stream. Phase-C's own §8 state (A2's key
separation fixes, A7's fail-closed matrix tests) is untouched by both.

### 5.4 The live-tip delta: 67287ae (decide explicitly)

The branch has moved one commit past the task-pinned 8c1ab69:
67287ae "ci(stage2): run ten independent evidence contract lanes in
parallel, validate real Windows report" — **purely additive** CI/evidence
tooling: new `.github/workflows/stage2-parallel-audit.yml`,
`stage0-measure/lane-check.js`, `negative-tests.js`,
`network-evidence-template.json`, `REVIEW-10-STREAMS.md`; +2 lines in the
smoke workflow (V2, §6); +2 chain steps (`stage0-measure/negative-tests.js`,
`--check stage0-measure/validate-report.js`); +1 line in
`stage0-measure/test.js` (`require('./negative-tests')`); a short
"Further evidence" section in `stage0-measure/README.md`. Against the
step-1 result it adds exactly 2 more textual conflicts (README.md,
test.js), both trivial unions of appended sections. **Recommendation:
merge selective at its live tip** (re-fetch at merge time and pin the SHA
in the merge commit message). Merging 8c1ab69 first and the tip
immediately after is two operations for the same tree.

## 6. The smoke workflow — four versions, one target

| Version | Blob | Where | Content |
|---|---|---|---|
| V0 | 37735e3 | 4af6513, 8349f38, f280296, 8c1ab69 trees | upstream smoke + base Stage-0 run |
| V1 | e1ac324 | D1 tip 7f13c3f | V0 + D1 trigger/path entries + 3 configured-measurement steps (generate identities → run-config → publish report) |
| V2 | 832f3f1 | selective tip 67287ae | V0 + 2 lines: run `stage0-measure/validate-report.js` after the base run |
| V3 | 72eb282 | phase-C `release/workflows/` (Agent 2) | V1 + 1 trigger line (`integration/v5.8-phase-c`) |

V1 and V2 edit disjoint regions; in the verified step sequence they
**auto-merged** into a new blob **7b3b166** containing the configured
steps, the validate-report gate lines, and both streams' trigger branches.
Two caveats survive any merge and belong to QD-04, not to this
reconciliation:

1. V1's generate step carries the known defect Agent 2 diagnosed: it
   requires `$RUNNER_TEMP/lhm-camoufox-runtime/node_modules/camoufox`,
   which no step creates (D1 smoke run 39614246764 failed at exactly this
   step). The minimal fix is recorded in `release/workflows/APPLY-GUIDE.md`
   and still needs owner approval.
2. Whether the applied file also gets V3's `integration/v5.8-phase-c`
   trigger line is an apply-time choice for whoever applies it to
   `.github/workflows/` (owner's git stream; the snapshot path cannot
   write workflows).

package.json, for the record: neither stream removes a single chain step.
D1 adds `node test/fail-closed-audit.js`; selective's tip adds that plus
`node stage0-measure/negative-tests.js` and
`node --check stage0-measure/validate-report.js`. Merged chain = phase-C's
201 + 3 = **204 steps**; `test:fail-closed` alias and phase-C's `test:all`
coexist. (In scratch the union was produced by JSON re-serialisation for
speed and verified by step counts; the real merge should edit the three
script strings in place to keep the diff reviewable.)

## 7. Verification actually run (scratch merges in this clone)

Procedure: branch from f280296 → merge 7f13c3f (resolutions per §2/§3,
**without** the §4 guard — deliberately, to expose the behaviour) →
commit 215f916 → merge 67287ae (resolutions per §5) → commit 6ff7d92 →
test at each stage. Linux, Node v24.20.0, node_modules from the
integration clone.

Step 1 results: `test/fail-closed-audit.js` PASS (against the merged
server.js incl. A10 minimisation); `test/license-center.js` 5/5 PASS;
suites PASS: behavior-monitor, warning-service, warning-history,
api-profile-minimization, api-profile-updates,
camoufox-api-automation-guard, camoufox-local-api-contract,
stage0-measure/test.js. Duplication probe: **2 entries** for one pattern
fact (§4) vs 1 on unmerged f280296.

Step 2 results: stage0-measure/test.js (union) PASS; negative-tests PASS;
`node --check` PASS for all six new modules + lane-check + run.js;
validateReport tolerance probe PASS (§5.1); fail-closed-audit PASS;
license-center 3/3 PASS.

**Full chain on the fully merged tree** (`node test/run-all.js`):
**204 steps — 202 PASS / 2 FAIL in 202 s**, the FAILs being exactly steps
31 (browser-diagnostics) and 120 (runtime-registry), the two known
Windows-platform fixtures at the same positions as the unmerged 201-step
run (Agent 20 mechanism-verified; the same chain passed 201/201 in
Windows CI run 39641363889). **Zero merge regressions.**

NOT_RUN here (unchanged by reconciliation): real-engine Stage-0 runs
(base/configured/isolation) — they need the Camoufox binary and, for the
configured workflow, Windows CI after the QD-04 fix; Gate 3 acceptance.

## 8. Recommended merge ORDER (for owner approval as-is)

**Step 0 — decisions (owner, before any merge).**
(i) Behaviour guard: Option A (guard, recommended) or B (drop hunk) from
§4. (ii) Selective target: live tip (recommended) — re-fetch and pin the
SHA at merge time. (iii) Confirm QD-04 stays a separate later action
(workflow application + generate-step fix are NOT part of these merges).

**Step 1 — merge D1 (7f13c3f) into the integration branch.**
Resolutions: license-center.js = keep phase-C; .gitignore = union
(phase-C block + `dist/`); package.json = union (chain 202,
`test:fail-closed` added, stage0:test + audit step); behaviorMonitor.js =
take with guard A (or drop, per Step 0); everything else = take D1.
Verify (expect all PASS): fail-closed-audit; license-center ×5;
behavior-monitor; warning-service; warning-history;
api-profile-minimization; camoufox-api-automation-guard;
camoufox-local-api-contract; stage0-measure/test.js; duplication probe
(exactly 1 §22 entry per pattern code, with guard A). Also fix the audit
doc's stale scope line in the same commit.

**Step 2 — merge selective at its pinned live tip into the result.**
Resolutions: license-center.js = keep phase-C (again — same duplicate);
package.json = union (chain 204); run.js = union of the 4 hunks (keep
both sides' report sections); README.md / test.js = union of appended
sections (tip only). Everything else = take selective (all pure
additions; the audit files and server.js change are already present and
identical → no-ops).
Verify: stage0-measure/test.js; negative-tests; `--check` on the six new
modules + lane-check + run.js; validateReport tolerance probe;
fail-closed-audit; license-center ×3; duplication probe unchanged; then
the **full chain** via `node test/run-all.js` — expect **202 PASS / 2
FAIL**, the 2 being the known Windows fixtures only. Any other red stops
the sequence.

**Step 3 — after both merges (owner-gated, separate approvals).**
Push the reconciled integration tree (owner's git stream or the
sanctioned snapshot path); apply the final smoke workflow (merged blob
7b3b166-equivalent + APPLY-GUIDE generate-step fix + chosen trigger line)
to `.github/workflows/` per QD-04; observe Windows CI including the
configured measurement; then Gate 3 as planned. Draft PRs #16 (selective)
and #17 (D1) are superseded by the reconciled integration branch and can
be closed by the owner at Gate 4; PR #18 carries the tree upward.

**Alternative considered and rejected:** selective first, then D1. Same
files conflict overall, the identical audit/license content must be
resolved twice instead of becoming no-ops, and it anchors the merge on
the pre-constitution branch — against §13's single-source-of-truth rule.
D1 first is strictly less work: step 2's true conflicts shrink to
package.json, run.js, license-center (+ README/test.js at the live tip).
