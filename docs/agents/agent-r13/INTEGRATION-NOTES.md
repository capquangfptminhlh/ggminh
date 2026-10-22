# Agent R13 — Integration Notes (security audit, Wave R)

Branch: `agent-r13/security-audit` on base `f280296` (clone
`~/workspace/ggminh-release/r13`). Full findings:
`docs/agents/agent-r13/SECURITY-AUDIT.md`. PoC/regression suite:
`test/security-audit-r13.js` — 21/21 PASS on the integrated branch
(pre-fix baseline on f280296: 11 PASS / 10 FAIL; the 10 failures are
the three findings below, reproduced before any fix was applied).

Note: `~/workspace/ggminh-release/CONTRACT.md` and `state.json` did
not exist when this agent started (the release dir held only sibling
clones); the audit proceeded from the written task brief. No
state.json deltas are proposed by this agent — per the contract the
file is coordinator-maintained; the coordinator may wish to record:
Gate-2 support evidence += R13 audit (3 findings, all fixed or
fix-specified), and the open decision in item 3 below.

## 1. REQUIRED coordinator action — main.js (coordinator-owned)

Finding R13-F1 adds a provenance gate in `Store.saveProfile`: a plain
save can preserve a profile's stored identity byte-for-byte but can
never create or replace one, unless the caller passes
`options.allowIdentity === true`. Two call sites in `main.js` are the
legitimate provisioning path and MUST be updated when this branch is
integrated, or UI provisioning stops attaching identities (creation
falls back to the honest `unavailable` state — fail-visible, not
silent corruption):

```diff
--- main.js (save-profile handler, ~line 657)
-    const saved = store.saveProfile(profile,{allowEngineChange});
+    const saved = store.saveProfile(profile,{allowEngineChange,
+      allowIdentity: !!provisioning && provisioning.status==='provisioned'});
--- main.js (provision-camoufox-identity handler, ~line 774)
-    if (result.status === 'provisioned') store.saveProfile(profile, {});
+    if (result.status === 'provisioned') store.saveProfile(profile, { allowIdentity: true });
```

Why `status==='provisioned'` and not a blanket `true` in the
save-profile handler: `provisionCamoufoxIdentity` returns
`'already-present'` when the INCOMING payload already carries a blob
(`src/engine/camoufoxProvisioning.js:94`) — for a brand-new profile
that blob can only have come from the caller, so it must not be
trusted. With the diff above it is stripped by the gate and the
handler proceeds to draw a real one on the next provisioning attempt.

All other `saveProfile` callers were enumerated and need no change:
Local API (`src/api/server.js:150` — deliberately never allowed to
pin an identity now), duplicate template, CSV import/update, bulk
create, snapshot recovery (all construct native/no-identity
fingerprints), CI samples in main.js.

## 2. Fixture changes the coordinator must review (not silent)

Two existing tests simulated already-provisioned profiles by saving
an identity blob through a plain `saveProfile`; the R13 gate
(correctly) stripped those blobs and both tests failed. Each fixture
now passes `{ allowIdentity: true }` at the simulated-provisioned
save, with an in-line R13 comment; every assertion is unchanged:

- `test/fleet-scale.js` — 2 call sites (benchStore create loop,
  prefill loop).
- `test/api-profile-minimization.js` — 1 call site (the
  `withIdentity` profile).

If the coordinator prefers fixtures to provision through a stub
generator instead, that is a larger change; the flag mirrors exactly
what the production provisioning path will pass after item 1.

## 3. Decision flagged for coordinator/owner confirmation

`src/backup/configBackup.js` import now passes
`{ allowIdentity: true }` when re-creating profiles from the user's
own passphrase-encrypted backup (in-line comment at the call site).
Rationale: backup import is an explicit, passphrase-gated trust
action on a user-selected file, and identities inside were
provisioned before the backup was taken; Agent 17's verified drill
expects config to restore exactly. Without the flag, a restore would
silently drop every pinned identity. If the owner prefers restore to
re-provision instead, remove the flag — the gate then strips blobs
on import and profiles come back unprovisioned (visible state).

## 4. Other in-branch changes (no coordinator action needed)

- `src/db/store.js` — `saveData()` chmods the temp file to 0o600
  before rename (finding R13-F2); identity gate above (R13-F1).
- `src/health/exitIpObservations.js`, `src/monitor/behaviorMonitor.js`
  — same chmod-before-rename enforcement (R13-F2). Pattern mirrors
  the pre-existing correct one in `src/monitor/warningHistory.js`.
- `src/update/updateCheck.js` — manifest URL and redirect targets
  with embedded credentials or an explicit port are refused
  (R13-F3), matching the module's own artifact-URL discipline.
- `test/security-audit-r13.js` — NEW. Proposed chain addition
  (package.json is coordinator-owned): insert
  `&& node test/security-audit-r13.js` immediately before
  `&& node test/run-all-selftest.js` in `scripts.test`.

## 5. Verification on this branch

- `node test/security-audit-r13.js` → 21 PASS / 0 FAIL.
- Targeted existing suites for every touched module: PASS
  (store-persistence, profile-lifecycle, profile-trash, quick-create,
  api-profile-updates, api-profile-minimization, backup-transaction,
  profile-deletion-backup-drill, fleet-scale, behavior-monitor,
  warning-history, runtime-egress-observation, auto-ip-warnings,
  update-check, snapshot-recovery, camoufox-identity,
  camoufox-local-api-contract, integration-wiring, license-state-matrix,
  criteria-checklist-provider, profile-edit-guard).
- Full chain via `node test/run-all.js`: see SECURITY-AUDIT.md §5
  (expected: 199 PASS / 2 FAIL, the two known Windows-platform
  fixtures only — identical to the f280296 baseline profile).
