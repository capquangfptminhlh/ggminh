# Agent R17 — Deletion completeness (F3/F4): INTEGRATION NOTES

**STATUS: PROPOSAL — pending the owner's answers to F3/F4 in the
consolidated decision pack. Nothing here is merged, pushed or tagged.**
Branch `agent-r17/deletion-completeness`, base `f280296` (Wave-2
coordinator wiring). All data used by the tests is synthetic.

## What was delivered

Implementation-ready diffs for the two leftovers Agent 17 documented
(not fixed) in the commercial deployment:

- **F3 — session snapshots survive permanent purge, undisclosed.**
  User-created encrypted snapshots live under
  `session-snapshots/<profileId>/`, OUTSIDE `PROFILE_DATA_ROOTS`, so
  every purge path left them on disk forever, and neither the purge
  confirmation nor the trash dialog mentioned them.
- **F4 — `automation-workflows.json` keeps dangling profile ids.**
  Workflows bind a `profileId`; permanent deletion had no cleanup
  path, so the file referenced purged profiles indefinitely.

## Reproduce-first evidence (unmodified base f280296)

A drill on the REAL Store + WorkflowStore + SessionSnapshots
(create profile → real snapshot → real workflow → trash → purge):

```
profiles/<id> exists:          false   (session roots purged, A17 fix holds)
session-snapshots/<id>:        true    (F3 leftover: snap_….lhmsnap still on disk)
workflows still bound to id:   1       (F4 leftover)
db.json mentions id:           false
```

And `test/profile-purge-completeness.js` failed on base at its first
assertion (`F4: purge-hook APIs missing`). After this branch's diff,
the same drill shows 0 snapshot files and the full test passes; the
A17 drill's F3 log line flips from "REMAINS under session-snapshots"
to "was removed" (that drill was written to observe, not assert, F3 —
no A17 assertion needed changing).

## Design decisions (the parts the owner is actually approving)

1. **Trash-period behaviour (F3):** snapshots SURVIVE while a profile
   is in trash — a trashed profile is restorable and its snapshot
   list is part of what is restored. Snapshots are deleted only when
   deletion becomes permanent: manual purge, 30-day expiry purge,
   and direct `deleteProfile`. This mirrors the existing rule for the
   session folders themselves ("do not touch session folders until
   permanent deletion").
2. **F4 removes, not tombstones.** A tombstone that keeps the purged
   profile's id anywhere in the file fails the zero-trace standard
   the deletion protocol is judged by; a tombstone without the id is
   a workflow with no profile, which the runner already rejects. The
   seller's steps are lost with the profile — disclosed BEFORE the
   confirmation (updated purge prompt, below) and reported AFTER it
   (log line, below). If the owner prefers preserving the steps for
   re-binding, the alternative is `profileId: null` + an `orphaned`
   flag in `dropWhere`'s callers — a small, contained change, but it
   needs a runner/UI story for profile-less workflows, so it is NOT
   the proposal.
3. **Architecture follows the repo's own patterns.** The Store owns
   paths under its baseDir, so snapshot removal lives in the Store
   (`PROFILE_PURGE_ONLY_ROOTS` + one `removeProfileArtifacts()` used
   by ALL permanent paths, so they cannot drift apart again). The
   Store does not own workflows, so — like the injected
   `store.licensePolicy` — main.js injects `store.onProfilePurged`;
   the Store fires it after a profile's folders are gone. A hook
   throw inside the cleanup queue defers the id for retry, exactly
   like a failed folder removal; the production hook itself never
   throws (it logs and defers to the backstop).
4. **Startup backstop (F4).** In `main.js` the startup expiry purge
   runs BEFORE `WorkflowStore` is constructed, so its purges cannot
   fire the hook. After construction, main.js runs
   `workflowStore.sweepOrphaned(liveIds + trashedIds)` once. This
   also repairs dangling references left by purges from older builds.
   Trashed ids are in the valid set on purpose: restorable profiles
   keep their workflows.
5. **Seller-visible log lines.** Both the hook and the backstop log
   via `console.warn('[ProfilePurge] Removed N automation
   workflow(s) …: <names>')`, visible in support logs. Surfacing the
   swept count in the purge IPC result/UI is a possible follow-up;
   it would change the `purge-trashed-profile` return shape and was
   deliberately not bundled into this proposal.
6. **Disclosure text (F3 honesty).** The purge confirmation in
   `src/ui/profileTrash.js` now names snapshots and bound workflows
   before the seller types XOA; the trash dialog's retention
   paragraph in `src/ui/index.html` now states the trash-period
   behaviour for snapshots and workflows. Wording stays inside what
   the code now does (§11 discipline) — and only becomes TRUE if this
   proposal is adopted, which is why it ships in the same diff.

## Files changed

| File | Change |
|---|---|
| `src/db/store.js` | `PROFILE_PURGE_ONLY_ROOTS = ['session-snapshots']`; `Store.onProfilePurged` hook property; `removeProfileArtifacts(id)` (all roots + purge-only roots + hook) now used by `cleanupTrashedFolders()` and `deleteProfile()` |
| `src/automation/studio.js` | `WorkflowStore.dropWhere()` (staged removal + rollback, same discipline as save/delete); `removeForProfile(profileId)` → `[{id, name}]`; `sweepOrphaned(validIds)` → `[{id, name, profileId}]` |
| `main.js` | After `workflowStore` construction: install `store.onProfilePurged` (sweep + `[ProfilePurge]` log line, never throws) and run the one-time orphan backstop sweep |
| `src/ui/profileTrash.js` | Purge confirmation discloses snapshot + workflow deletion |
| `src/ui/index.html` | Trash dialog retention paragraph discloses snapshot/workflow behaviour |
| `test/profile-purge-completeness.js` | NEW — 8 scenarios (see below) |
| `package.json` | Test chain 201 → 202 steps (new test after `profile-deletion-backup-drill`). Coordinator: drop this hunk if you prefer to wire it yourself. |

## Tests

`test/profile-purge-completeness.js` (synthetic data only):
1–3. Trash keeps snapshots + workflows; manual purge and expiry purge
remove them; full-tree scan (ids, names, notes/session markers —
session-snapshots and automation-workflows.json INCLUDED this time)
finds zero traces; control profile's snapshots/workflows/session
fully intact; hook fires once and reports the swept workflow names.
4. Direct `deleteProfile` is equally complete.
5. Purge with NO hook wired still completes and removes snapshots
(F3 is intrinsic to the Store; F4 then belongs to the backstop).
6. `sweepOrphaned` removes exactly the true orphans (live + trashed
kept), persists, is idempotent.
7. Sweep persist failure rolls back in memory and leaves the file
untouched (mirrors `test/workflow-persistence.js` discipline).
8. Static disclosure checks on the purge prompt and trash dialog.

Regression set, all PASS on this branch: profile-purge-completeness,
profile-deletion-backup-drill, workflow-persistence,
session-snapshots, session-snapshots-ui, snapshot-portability,
snapshot-recovery, warning-history, fleet-scale, integration-wiring,
first-run-ux. `node --check` clean on every edited JS file.

## Post-Wave-2 deletion-surface re-audit

Every store/root under the storage dir, re-checked on this base.
"Purge" = manual purge, expiry purge, direct delete.

| Surface | Per-profile content | Purge behaviour (base) | Verdict |
|---|---|---|---|
| `profiles/`, `gecko-profiles/`, `camoufox-profiles/`, `extensions/` (`PROFILE_DATA_ROOTS`) | session data, cookies, storage | removed (A17) | OK |
| `db.json` | profile record, trash entry, cleanupQueue | record removed; queue drains | OK |
| `session-snapshots/<id>/` | encrypted copies of session data | **survived, undisclosed** | **F3 — fixed by this proposal** |
| `automation-workflows.json` | workflows bound by `profileId` | **dangling references forever** | **F4 — fixed by this proposal** |
| `exit-ip-observations.json` | the profile's observed exit IPs + session ids (≤7 days / 20k cap) | survives purge until retention expiry | **NEW F6 — proposed fix below, NOT implemented** |
| `warning-history.json` | normalised warnings; profile ids inside `observed.profiles`, `observed.summary` AND the warning `id` itself (`source:code:idA+idB`) (≤90 days / 1000 entries) | survives purge until retention expiry | **NEW F5 — proposed fix below, NOT implemented** |
| `behavior-events.json` | `{action, profileId, at}` incl. the `profile_delete` event itself (≤24 h / 1200) | survives ≤24 h | Retained BY DESIGN: it is the audit trail of the deletion itself; self-expiring. No fix proposed |
| `automation-batches.json` | batch audit log (≤60): task `profileId`s, workflow names — no profile names in tasks | survives | Retained BY DESIGN (audit log, bounded). No fix proposed |
| `automation-schedules.json` | schedule → `workflowId` (not profile id) | entry survives an F4 sweep until next tick | Handled by existing tick logic: missing workflow ⇒ entry auto-disabled with "đã bị xóa" message. No fix proposed |
| `health-drift.json` | fleet aggregate counters only — no ids, IPs or URLs by construction | n/a | Clean |
| `proxy-credentials.enc.json` | keyed by PROXY id (`px_…`), a shared seller resource other profiles may reference | untouched | Correct: deleting a profile must not delete a shared proxy |
| `installed-extensions/`, `camoufox/` (engine) | keyed by extension id / shared engine tree | untouched | Not per-profile. Correct |
| measurement records (`lhm-profile-measurement` v1, Agent 9 contract) | keyed by REAL profile ids | — | **Store does not exist yet** (contract only). Requirement for whoever builds it: register its file in the purge surface from day one (the `onProfilePurged` hook is the natural seam) |
| Config backups, portable snapshot exports | user-managed files OUTSIDE the storage tree | unreachable by purge | Out of scope by construction; customer guide already frames exports as user-managed |

## New findings — proposed fixes (NOT implemented; owner decision)

**F6 — exit-IP observations outlive the profile (≤7 days).**
`ExitIpObservationStore` entries are `{profileId, ip, observedAt,
sessionId, source}`: real network data about a profile the seller
believes is permanently deleted. Proposed fix, mirroring F4's shape:
add `ExitIpObservationStore.forgetProfile(profileId)` (filter +
atomic persist, same corrupt-file discipline as today) and call it
from the same `store.onProfilePurged` hook in main.js, logging the
removed count. ~20 lines + tests. Trade-off to state: D3 warning
evidence for OTHER profiles is unaffected (entries are per-profile);
only the purged profile's own observations go.

**F5 — warning history outlives the profile (≤90 days).**
Harder than F6, because the profile id is baked into the warning
`id` (`source:code:profileA+profileB`) and into `observed.summary`
text: scrubbing one id out of a multi-profile warning would corrupt
the §22 evidence record and desync id ↔ content. The only
consistent proposal: `WarningHistory.forgetProfile(profileId)`
DROPS every entry whose `observed.profiles` contains the id.
Trade-off the owner must accept explicitly: fleet warnings that
named the purged profile alongside others disappear from history
too (they re-derive from live data on the next evaluation if the
underlying condition still exists among surviving profiles; the
durable first-detected chronology for that warning code is lost).
Because this trades against the §20.3 durability Agent 8 built, it
is reported here as a decision, not folded into this diff.

## What the owner is asked (unchanged from the decision pack)

- **F3:** adopt "snapshots die at permanent purge, live through
  trash" + the disclosure wording? (This branch implements exactly
  that.)
- **F4:** adopt removal of the purged profile's workflows (vs. the
  tombstone alternative in decision 2)? (This branch implements
  removal.)
- **F5/F6 (new):** extend the same purge hook to exit-IP
  observations (F6, low controversy) and to warning history
  (F5, with the chronology trade-off above)?

## Integration checklist for the coordinator

1. Merge branch; resolve the one-line `package.json` chain hunk if
   the chain changed upstream.
2. Re-run: `node test/profile-purge-completeness.js`,
   `node test/profile-deletion-backup-drill.js`,
   `node test/workflow-persistence.js`, then the full chain
   (expect 202 steps; the 2 known Windows-platform fixtures still
   fail on Linux only).
3. Expect A17 drill's F3 log line to read "was removed".
4. No preload/IPC changes; no schema changes; `automation-workflows
   .json` format unchanged (entries are removed, never reshaped).
