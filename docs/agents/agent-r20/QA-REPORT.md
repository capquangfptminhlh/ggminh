# Agent R20 — Adversarial Seam QA of the Wave-2 Integration (f280296)

**Scope.** Agent 20 verified the six headline fixes. This pass attacks
only the SEAMS between the Wave-2 parts — the coordinator wiring
commit f280296 (warning history seed/authoritative pairing, the
clear-warning-history IPC, the config-gated runtime egress
observation, the identityProvisioningReason persistence, the combined
exit-IP store) plus phase-C → Wave-2 data compatibility.

**Method.** Defect-proof tests, committed on this branch:
`test/seam-qa-r20.js` (seams 1, 2, 4, 5 — real Store / provisioning /
warning modules; main.js's actual IPC handler bodies extracted
verbatim and driven through the real preload surface with a fake
electron module) and `test/seam3-runtime-gate-r20.js` (seam 3 — the
start-browser observation block extracted verbatim from main.js and
executed against a REAL Camoufox session). No product code was
changed. Neighbouring suites on this branch (warning-history,
runtime-egress-observation, integration-wiring, first-run-ux,
fleet-scale, criteria-checklist-provider) all still PASS.

**Bound (§23).** Commit f28029655e59aa020d8a040521747a7c43c15e36 ·
Linux x86_64 · Node v24.20.0 · clean `npm ci` (483 packages) ·
Camoufox v156.0.1-beta.36, SHA-256
`2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669`
(seam 3 only) · loopback only for network paths.

## Results — 20 PASS, 2 FAIL (both FAILs are reproduced defects)

### Seam 1 — identityProvisioningReason: persists, but is never read

- PASS (×3 paths + control): replicating the save-profile handler
  segment (main.js:640-662) over the real provisioning module + real
  Store, the reason survives a restart (fresh Store over the same
  directory) for **all three** reasoned outcomes —
  `unavailable / engine-not-installed-or-unverified`,
  `invalid / generated-identity-failed-validation`,
  `invalid / generated-identity-contradicts-profile` — is present in
  raw db.json, is carried in the saveProfile return value the
  renderer receives, and no identity is attached on the invalid
  paths. A provisioned control carries the identity and no reason.
- **FAIL — DEFECT R20-1: the persisted field has no reader.** The
  string `identityProvisioningReason` occurs exactly **once** in all
  product code: the write at main.js:656. Behavioural proof with the
  renderer's own functions (extracted from src/ui/renderer.js):
  `provisioningSaveNotice` returns byte-identical text for reason
  `engine-not-installed-or-unverified` vs `generator-package-missing`,
  and `identityMetaText` is likewise identical across the two invalid
  reasons. The reason translation table (`provisioningReasonText`)
  is fed only by the LIVE result of the separate
  `provision-camoufox-identity` action — which itself never persists
  the reason either (main.js:769-777 saves only on 'provisioned').
  Net effect: A16 proposal #9's stated purpose — "the UI can tell the
  user the specific cause" — is **not achieved for the create flow**:
  after a profile is created without an identity, the specific cause
  is stored but unreachable; the user forever sees the generic
  text. The status itself (`identityProvisioning`) IS persisted and
  read correctly — this is an explanation gap, not data loss.

### Seam 2 — clear-warning-history across the real IPC boundary

Driven end-to-end through the captured preload API
(`api.getWarningReport` / `api.clearWarningHistory`) into main.js's
own handler bodies, with a deterministic shared-exit-IP warning:

- PASS: preload exposes both functions.
- PASS: report #1 seeds the history (1 entry, timesObserved=1, file
  written with the entry).
- PASS: report #2 increments the durable count to 2 (the
  seed + 'authoritative' pairing works through the real handler).
- PASS: simulated restart (fresh history store + fresh service seeded
  from `seedRecords()`) — count continues to 3 and `firstDetectedAt`
  is preserved exactly.
- PASS: clear via the preload path returns `{ok:true}`, the
  warning-history.json file is removed, the store is empty, and the
  service registry is reset (`list().warningCount === 0`).
- PASS: the next report honestly re-detects the still-shared IP and
  re-seeds from zero — timesObserved=1, a FRESH firstDetectedAt; the
  cleared total (3) is not resurrected.
- **FAIL — DEFECT R20-2 (minor): `historyStatus` misreports on a
  fresh install.** `warningHistory.status()` reports the LOAD-time
  status; after the first-ever `record()` (no file existed at
  startup) it still returns `'empty'` while `report.history` —
  attached to the very same report — contains the entry. The
  surfaced status contradicts the surfaced data until the next app
  restart (when load returns 'ok'). Data itself is correct; the
  status string is wrong in exactly the first-run window A16 cared
  about.

### Seam 3 — runtime egress gate (real engine): PASS, 8/8

The verbatim start-browser observation block, one live Camoufox
session via the real controller, settings mutated between runs:

- (a) `runtimeEchoUrl` unset → 0 observation calls, 0 echo-server
  hits, 0 records. **Strict no-op proven against a live session**,
  with case (e) as the positive control that the harness can see
  the observation when the gate is legitimately open.
- (b) empty string → identical strict no-op.
- (c) non-string (42, written through the real Store API — the shape
  a hand-edited db.json would produce) → identical strict no-op.
- (d) unreachable echo (closed loopback port) → gate fires once,
  result `{recorded:false, reason:'fetch-failed'}`, 0 records, no
  throw, no unhandled rejection, session context still alive
  afterwards.
- (e) live echo → exactly one record, source `browser-runtime`,
  correct profileId/sessionId, echo saw exactly one hit.

### Seam 4 — combined exit-IP store under concurrent writers: PASS

- 120 interleaved records (60 runtime via the real
  `observeRuntimeExitIp`, 60 manager-style direct `record()`, jittered
  async writers, ONE shared store instance as in the app): **zero
  lost**, per-source counts exact, IP multisets exact per source, no
  cross-labelled or cross-session entries, on-disk file and a
  reloaded instance both match memory exactly. (Structural basis:
  `record()` is fully synchronous; the test demonstrates it
  empirically.)
- Boundary, on record: the store is NOT multi-instance safe — two
  instances over one file are last-writer-wins (the second instance's
  persist discards the first's 5 records). This is **not an app
  path**: main.js constructs exactly one ExitIpObservationStore
  (main.js:909). Documented so the contract is explicit if a second
  consumer ever appears.

### Seam 5 — phase-C (07150d6) storage dir opened by Wave-2: PASS

A directory written entirely by the phase-C tree's own modules
(helper: `test/helpers-r20-write-phasec-dir.js`; 2 profiles + 1
trashed, settings, 3 legacy IP observations, 3 behavior events, 1
workflow) loads in the Wave-2 tree **deep-equal to phase-C's own
read-back manifest on every store**: profiles (public projection),
settings, trash, exit-IP entries (no `source` key injected into
legacy entries), behavior events, workflows. Wave-2 writes extend
rather than disturb: two labelled appends leave the legacy prefix
byte-identical in shape; a Wave-2 rename of the phase-C Camoufox
profile preserves its fingerprint (incl. `identityProvisioning`)
exactly; the Wave-2-only warning history reports 'empty' (not
error) on the phase-C directory and records/loads alongside the
older stores, which still load afterwards. **Zero data loss on the
upgrade path.**

## Verdict — is the coordinator wiring (f280296) safe to freeze on?

**Yes — with the two defects above logged as known issues; neither
blocks the freeze, and neither needs a wiring redesign.**

The load-bearing seams all hold under adversarial pressure: the
seed/authoritative pairing is coherent across the real IPC boundary
and across restarts; clear is honest (file gone, counts reset, no
resurrection); the egress gate is exactly as specified in all five
configurations against a real engine; the shared store loses nothing
under interleaved dual-source writes; and the phase-C → Wave-2
upgrade loses no customer data. The two defects sit in the
explanation layer: R20-1 makes one shipped field dead weight and
leaves a user-facing promise (A16 #9) unfulfilled — a small,
one-sided renderer fix; R20-2 mislabels a status string during the
first-run window only. Both are worth fixing while the wiring is
being frozen, precisely because this product's constitution treats
honest surfacing as a feature — but no data, safety, or fail-closed
property depends on them. This verdict is independent of Agent 20's;
where the two overlap (wiring pairing, source labels, fail-closed
licensing/API behaviour) the conclusions agree.
