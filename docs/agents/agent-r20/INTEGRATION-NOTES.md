# Agent R20 — Integration Notes (for the coordinator)

Branch `agent-r20/seam-qa` from f280296. **No product code changed.**
Contents are QA artifacts only:

- `test/seam-qa-r20.js` — defect-proof suite for seams 1, 2, 4, 5.
  Exits 1 while defects R20-1/R20-2 stand; after fixes it should go
  green unchanged (that is its purpose). Do NOT add to the npm chain
  as-is; if the fixes land, it can join as a normal regression suite
  (seam 5 additionally needs a phase-C checkout — it prints NOT_RUN
  and stays green when `R20_PHASEC_ROOT`, default `/tmp/r20-phasec`,
  is absent).
- `test/helpers-r20-write-phasec-dir.js` — seam-5 fixture writer;
  runs the phase-C tree's own store modules against a target dir.
  Prep used here: `git worktree add /tmp/r20-phasec 07150d6` in any
  clone of the repo.
- `test/seam3-runtime-gate-r20.js` — seam 3 against the real engine;
  env-gated exactly like the other real-engine tests
  (`LHM_CAMOUFOX_EXECUTABLE`; NOT_RUN + exit 2 without it). Keep out
  of the npm chain (same rule as `test/camoufox-provisioning-real.js`).
- `docs/agents/agent-r20/QA-REPORT.md` — full evidence + verdict.

## Suggested fixes (NOT applied here — R20 verifies, it does not fix)

**R20-1 — read the persisted provisioning reason (renderer only).**
In `src/ui/renderer.js`, let `provisioningSaveNotice(saved)` append
`provisioningReasonText(saved.fingerprint.identityProvisioningReason)`
to the 'unavailable' notice (the translation table already exists),
and optionally surface the reason in `identityMetaText` for the
'invalid' state. Also consider persisting the reason in the
`provision-camoufox-identity` handler (main.js:769) on non-provisioned
outcomes, mirroring the save-profile line, so the "Cấp danh tính"
retry path leaves the same durable trace. Proof that it works: seam
1's consumption check in `test/seam-qa-r20.js` turns green only when
the notices actually differ by reason (the mechanical once-only
grep assertion must be updated to count the new read sites).

**R20-2 — history status after first record.**
In `src/monitor/warningHistory.js`, `status()` should not report
`'empty'` once the ledger holds entries: either set
`loadStatus = 'ok'` after a successful `record()` persist, or derive
the reported status from content when `lastError` is null
(`ledger.size ? 'ok' : loadStatus`). Keep the §16 vocabulary (no
verdict words). Proof: seam 2's report-#1 check turns green.

## Freeze recommendation

Freeze f280296 with R20-1/R20-2 entered as known issues (fix before
or immediately after the freeze; both are small and one-sided). No
other seam action needed: single-instance exit-IP store (keep it
that way — a second consumer must go through the same instance),
config-gated egress, and phase-C data compatibility all verified.
