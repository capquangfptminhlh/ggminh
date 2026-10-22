# Wave R — Agent R13: Independent Security Audit

- **Tree audited:** integration branch `integration/v5.8-phase-c` at
  `f280296` (local head of `~/workspace/ggminh-integration`).
- **Branch:** `agent-r13/security-audit` in
  `~/workspace/ggminh-release/r13`. No push/merge/tag performed.
- **Environment:** Linux x86_64, Node v24.20.0, clean `npm ci`
  (483 packages). Windows-only behaviour is reported NOT_RUN, never
  extrapolated.
- **Method:** fresh-eyes pass (not a re-read of Agent 20's QA): every
  preload-exposed IPC channel enumerated and its handler traced to
  the validating layer; the Local API exercised over real HTTP; file
  modes exercised dynamically; archive/backup/snapshot paths read and
  probed; full-tree secret scan. All PoCs use synthetic data and
  throwaway keys only; no real credentials anywhere.
- **PoC suite:** `test/security-audit-r13.js`. On the unfixed base it
  reported **11 PASS / 10 FAIL** — the 10 failures are findings
  F1–F3 below, reproduced before any fix. After the in-branch fixes:
  **21 PASS / 0 FAIL**.

## 1. Findings

### R13-F1 — MEDIUM — A pinned Camoufox identity could be attached or replaced by any plain profile save (provenance bypass)

`Store.saveProfile` persisted the caller-supplied `fingerprint`
object wholesale, including `fingerprint.identity` — the pinned
CAMOU_CONFIG blob that the launch path replays as the profile's
engine-level identity. Nothing at the persistence choke point checked
where the blob came from:

- `POST /api/profiles` (Local API, `src/api/server.js:150`) passed
  the request body straight to `saveProfile` — an API-key holder
  (any RPA script; the key is the only barrier) could pin an
  arbitrary hand-crafted identity, with no provisioning involved.
- The renderer `save-profile` path had the same property, and
  `provisionCamoufoxIdentity` treats a pre-existing blob as
  `'already-present'` (`src/engine/camoufoxProvisioning.js:94`)
  without provenance, so an injected blob was thereafter
  indistinguishable from a generator-drawn one.
- Worst case, and the reason this is Medium rather than Low: the
  **same** blob could be stamped onto **many** profiles, manufacturing
  exactly the shared-identity cross-profile coincidence the D1 design
  (constitution §8: identities are drawn only by the official
  generator, never hand-set) exists to prevent — silently, because
  each profile would still report `identityProvisioning` as its
  payload claimed.

Base location: `src/db/store.js`, `saveProfile` fingerprint block
(base lines 150–154). Evidence: audit checks B1, B4, B5, C6 FAIL on
f280296, PASS after the fix.

**Fix (in-branch, `src/db/store.js`):** a provenance gate at the
single persistence choke point. Without `options.allowIdentity ===
true`, a save may preserve the identity already stored for *that*
profile byte-for-byte (the normal edit round-trip, check B3), but can
never create one (B1, B5, C6) and never replace one (B4 — a differing
blob is overridden by the stored pin). The two main.js provisioning
call sites must pass the flag after a genuine generator draw; main.js
is coordinator-owned, so the exact required diff is in
INTEGRATION-NOTES §1 (until it is applied, UI provisioning degrades
to the honest `unavailable` state rather than attaching). Backup
import passes the flag explicitly as a documented trust decision
(INTEGRATION-NOTES §3).

### R13-F2 — LOW — The 0o600 guarantee on three data stores silently failed whenever the temp file already existed

`Store.saveData` (`src/db/store.js:56`), `ExitIpObservationStore
.persist` (`src/health/exitIpObservations.js:88`) and
`BehaviorMonitor.record` (`src/monitor/behaviorMonitor.js:44`) all
write `file + '.tmp'` with `{ mode: 0o600 }` and then rename. Node
applies `mode` **only when the write creates the file**; a
pre-existing temp (crash leftover, a copy restored by hand, any
earlier looser write) keeps its permissions, and the rename
publishes them onto the live file. Demonstrated dynamically: with
the temp planted at 0644, `db.json` (all profiles incl. free-text
notes, settings, trash), `exit-ip-observations.json` and
`behavior-events.json` all landed at **0644** (checks A1–A3 FAIL on
base, PASS after fix). Severity is Low: exploitation needs a local
actor able to pre-plant the temp inside the user's storage dir, and
POSIX modes are advisory on the Windows target — but the 0o600
property is a stated design claim of these stores, and one in-tree
module already did it right (`src/monitor/warningHistory.js:174-178`
chmods after writing). **Fix (in-branch):** chmod the temp file to
0o600 before the rename, same pattern, in all three stores.

### R13-F3 — LOW — Update-checker fetch accepted URLs with embedded credentials or explicit ports

`checkForUpdateRemote` (`src/update/updateCheck.js:202,213`)
validated only the scheme and hostname of the manifest URL and of
redirect targets. A URL like `https://user:pass@github.com/…` or one
carrying an explicit port passed; Node's https would then send a
Basic `Authorization` header to that host. The module's own
artifact-URL check already refuses credentials/ports — the fetch
path was inconsistent with it. The manifest URL is operator
configured, so this is defence-in-depth rather than a live hole.
Evidence: checks D1/D2 FAIL on base (the credentialed hop was
followed), PASS after fix. **Fix (in-branch):** refuse username/
password/port on the initial URL and every redirect target, with
the module's existing `manifest-url-refused` / `redirect-refused`
reasons.

### Observations (no fix; recorded for the coordinator)

- `SessionSnapshots.list()` lets a JSON.parse error from a single
  corrupt `.lhmsnap` file propagate and break listing for the whole
  profile (robustness, not security — the file must already be inside
  the profile's snapshot folder).
- PR #18's body still describes the phase-C snapshot (cosmetic;
  noted by an earlier wave too).

## 2. Areas verified PASS — with the check actually run

- **Local API authentication & boundary** (real HTTP against
  `createApiServer` with a real Store): missing key → 401 (C1); any
  `Origin` header → 403 (C2); foreign `Host` header → 403 (C3);
  server binds loopback only with a per-run random key
  (`main.js: setApiEnabled` + `apiKey` generation, read directly).
- **API minimisation (QA-003), success AND error paths:** POST
  create response and GET list contain neither the notes marker nor
  the CAMOU_CONFIG marker (C4, C5); the 409 edit-while-running error
  path leaks no profile fields (C7); plus the full pre-existing
  `test/api-profile-minimization.js` (redaction shape incl.
  provenance metadata) passes.
- **IPC surface:** all ~110 preload channels enumerated; handlers
  delegate to validating layers — profile ids (`assertId` regex in
  `src/db/store.js`, `assertProfileId` in `src/privacy/isolation.js`),
  snapshot ids (`^snap_[0-9a-f]{24}$` + confirmation strings),
  vault ids (`^px_[0-9a-f]{16}$`), batch ids (`uniqueIds`, ≤50,
  same regex), scheduler/workflow input validation, `save-settings`
  allowlist in main.js, destructive actions gated by typed
  confirmations. Renderer DOM audit: profile-controlled strings
  reach `innerHTML` only through `escapeHtml` in
  `src/ui/renderer.js`; no `eval`/`document.write`/
  `insertAdjacentHTML`/`shell.openExternal` anywhere in the UI;
  window is `contextIsolation: true, nodeIntegration: false,
  sandbox: true` with navigation and window-open denied.
- **Engine installer / archive extraction:** descriptor validation
  probed dynamically (E2/E3: signed descriptor passes; http URL,
  foreign host, tampered payload, wrong key all refused);
  extraction is allowlist-driven by the signed manifest with
  per-entry name rules, symlink rejection, containment re-check and
  size caps (`tools/extract-signed-engine.ps1`, read line-by-line);
  download is pinned by byte count + SHA-256 with an HTTPS host
  allowlist (`downloadPinned`, read). Existing
  `test/camoufox-engine-distribution.js` passes in the chain.
- **Backup restore:** `ConfigBackup.import` validates ids, names,
  duplicate ids and workflow references before touching live data,
  re-creates profiles under fresh ids (backup ids never become
  filesystem paths), blanks `fill` values, strips vault references
  to `requiresProxySetup`, and stages both stores in memory before
  a single durable write with byte-level rollback (read; exercised
  by `test/backup-transaction.js` and
  `test/profile-deletion-backup-drill.js`, both PASS).
- **Session snapshots:** `safePath` probed (E1: traversal, absolute
  paths, reserved Windows names, trailing-dot/space all rejected);
  restore stages into a fresh directory and swaps with rollback;
  symlinks refused at enumeration and restore (read + E1).
- **Vault & key handling:** proxy vault round-trip probed (F1: no
  plaintext on disk, file 0600, pid-unique `wx` temp = fail-closed
  on pre-planted temp); credentials are never accepted in profile
  JSON (`saveProfile` rejects credential keys and persists only an
  `authProxyId` reference); log scan found no token/password/key
  material in any `console.*` call in `src/` or `main.js`; AI
  advisor uses a fixed endpoint, sealed key storage and an explicit
  statistics opt-in (read).
- **Update checker (beyond F3):** signature, channel, freshness,
  downgrade and artifact-URL rules are covered by the pre-existing
  `test/update-check.js` (PASS in chain) and were re-read.
- **Secret scan (full tree, 360 tracked files, excluding
  node_modules/.git):** no `PRIVATE KEY` material (all hits are the
  detector's own marker literals in `bundledEngineManager.js`, a doc
  mention, and test assertions), no AKIA/GitHub/OpenAI/Slack token
  shapes, no tracked `*.pem/*.key/*.p12/*.pfx/*.keystore/*.jks` or
  `id_rsa*`/`id_ed25519*` files, no hardcoded credential assignments
  in `src/`, `tools/`, `main.js`, `preload.js`.

## 3. NOT_RUN (stated plainly)

- The PowerShell extractor was read, not executed (no Windows /
  PowerShell in this sandbox); its Node-side caller and manifest
  validation were executed.
- Real Electron IPC invocation end-to-end (handlers audited at the
  store/service layer + code-read; no Electron runtime here).
- Windows ACL semantics for the POSIX 0o600 modes (F2's fix is
  correct on POSIX and a no-op claim on Windows).
- Real-network downloads (engine release, update manifest) — all
  transports stubbed or code-read by design of this audit.
- `downloadPinned` was code-read, not executed against a server.

## 4. Regression evidence

- `node test/security-audit-r13.js` → **21 PASS / 0 FAIL** (base:
  11 PASS / 10 FAIL — the delta is exactly F1–F3).
- Targeted suites for every touched module: all PASS (list in
  INTEGRATION-NOTES §5). Two fixtures needed the `allowIdentity`
  flag because they simulate provisioned profiles
  (`test/fleet-scale.js`, `test/api-profile-minimization.js`) —
  flagged for coordinator review in INTEGRATION-NOTES §2; no
  assertion in either file was weakened.
- Full chain (`node test/run-all.js`, 201 steps): **199 PASS /
  2 FAIL** — the only failures are the two known Windows-platform
  fixtures (`browser-diagnostics`, `runtime-registry`), identical
  to the f280296 baseline profile established by Agent 20. Zero
  regressions from this branch's changes.

## 5. Bottom line

Three real findings, none Critical/High: a Medium provenance bypass
on the product's central identity invariant (fixed at the choke
point; one small coordinator-owned diff in main.js is required to
keep UI provisioning working), and two Low hardening gaps (file
modes, update-fetch URL discipline), both fixed in-branch with
failing-then-passing PoCs. The areas earlier waves hardened —
API minimisation, snapshot/backup path discipline, signed engine
distribution, vault handling — withstood an independent re-test.
