# INTEGRATION-NOTES — Agent R11 (divergent-stream reconciliation I, remote branches)

Deliverable: `docs/agents/agent-r11/RECONCILIATION-REMOTE.md` (this clone,
branch `agent-r11/reconcile-remote`, base f280296 — HEAD verified before
branching: f28029655e59aa020d8a040521747a7c43c15e36).

## Bottom line for the coordinator

- The two remote streams are **one body of work in two envelopes**: the
  fail-closed audit (doc + test), the API 409 hunk, and the license-center
  tamper fix are **byte-identical blobs** at 7f13c3f and 8c1ab69
  (698ac388 / 40c4077d / bae22a7c / 1d4b140b). Reconciliation is small:
  3 textual conflicts per merge step, all unions, plus ONE behaviour-level
  issue (below).
- The full sequence was **executed in scratch and verified**: step 1 =
  local commit 215f916, step 2 = 6ff7d92 (both in this clone, inspectable,
  deletable). Full chain on the merged tree: **204 steps, 202 PASS /
  2 FAIL** — the 2 FAILs are the known Windows fixtures (steps 31, 120),
  zero regressions. Details and per-step verification lists are in the
  main document, §7–§8.

## The one decision the owner must make (Step 0 in the merge order)

D1's behaviorMonitor.js hunk (pattern alerts merged into
`BehaviorMonitor#getReport().alerts`) **double-reports every D2 pattern**
in the §22 warning report once phase-C's warningService is in play
(direct source `behavior-patterns:…` + passthrough source
`behavior-monitor:…`), and warning history persists both. Proven by probe
on the merged tree (1 fact → 2 entries; unmerged tree → 1).
Recommendation: **Option A** — take the hunk + tag merged alerts
`origin:'behavior-patterns'` in behaviorMonitor.js and skip tagged alerts
in `warningService.fromMonitorAlerts` (src/monitor/warningService.js:345).
Fallback **Option B** — drop the 9-line hunk; patterns still warn via the
§22 path. Do not merge it unguarded. The scratch merges intentionally did
NOT implement the guard (it edits coordinator-owned warningService.js);
whoever executes the real merge applies it in step 1 and re-runs
warning-service / behavior-monitor / warning-history + the probe
(expect exactly 1 entry per pattern code).

## Other resolutions already determined (no decision needed)

- test/license-center.js: keep phase-C's version in both steps — the
  streams' "tamper hardening" is the same fix (flip a full-6-bit
  signature char; theirs at offset 0, ours at +10) and ours is the one
  proven in the 201-step chain + Windows CI. No `src/licensing/` change
  exists in either stream; Agent 18's Wave-2 license QA state is
  unaffected.
- stage0-measure/run.js: union of 4 hunks; selective's report gate
  tolerates phase-C's `extendedEnvironment` section (probe:
  accepted=true, 20 assertions). Seal is a checksum labelled
  `notASignature:true` — keep that wording discipline (§23).
- Smoke workflow: merged target = V1 (D1 configured steps) + V2
  (selective tip validate-report lines), auto-merged to blob 7b3b166 in
  scratch. It still contains the known generate-step prefix defect —
  that fix + the trigger-line choice + applying to `.github/workflows/`
  remain QD-04, deliberately excluded from the merges.
- Selective target: recommend merging at the **live tip** (67287ae at
  fetch time; re-fetch and pin the SHA when executing) rather than the
  task-pinned 8c1ab69 — the delta is one purely additive CI commit
  (stage2 lanes). Both variants' conflict sets are documented.
- package.json: in scratch the union was built by JSON re-serialisation
  (verified by step counts: 202 after step 1, 204 after step 2). For the
  real merge, edit the `test` / `stage0:test` strings in place instead,
  to keep the diff reviewable.
- docs/FAIL_CLOSED_AUDIT_v5_8.md has one stale line ("Scope: …
  integration/v5.8-core-selective branch / Draft PR #16 only") — fix in
  the step-1 merge commit.

## What R11 did NOT do

- No pushes, no merges into any shared branch, no workflow files applied.
  Scratch branches (`scratch/step1-d1`, `scratch/step2-sel`) exist only
  in this clone as evidence for the verification runs.
- No real-engine Stage-0 runs (base/configured/isolation) — NOT_RUN,
  needs the Camoufox binary / Windows CI; unchanged by reconciliation.
- The user's local uncommitted stream (local checkout 89b3c2c + the two
  uncommitted changes) is a different reconciliation unit — not covered
  here (sibling R-task territory). Note for that task: the local stream's
  Camoufox signing fix overlaps Agent 2's phase-C work, not anything in
  these two remote streams.
- PR #18's body still describes the old 07150d6 snapshot (cosmetic;
  owner/coordinator may refresh it when the reconciled tree is pushed).

## Suggested memory-worthy facts

- Remote selective tip has advanced past 8c1ab69 to 67287ae (stage2 CI
  lanes) — future references should not treat 8c1ab69 as the tip.
- After the §8 merge order runs, Draft PRs #16 and #17 are superseded by
  the integration branch (owner closes them at Gate 4).
