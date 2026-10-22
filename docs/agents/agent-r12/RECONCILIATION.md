# Agent R12 — Reconciliation II: the owner's local stream vs the integrated tree

- **Agent / branch:** R12, `agent-r12/reconcile-local`, base = integrated tree
  `f280296` (Wave-2 coordinator wiring head). Analysis date: 2026-10-22.
- **Scope:** the owner's local stream only — local commit `89b3c2c` and the two
  UNCOMMITTED changes reported for that checkout. The GitHub-side streams
  (selective `8c1ab69`, D1 `7f13c3f`) are a different reconciliation item and
  are not covered here.
- **Method:** repository search on this machine; the integrated tree's actual
  code at `f280296`; Agent 2's actual fix commit `e72991b` (10-agent
  deployment, clone `~/workspace/ggminh-agents/a2`); the owner's own report of
  the uncommitted changes as recorded in `~/memory/2026-10-21.md` ("parallel
  checkout report from user") and `~/MEMORY.md`. Both engine-signing test
  suites were re-run on the integrated tree for this report (results below).

## Verdict summary

| # | Item | Verdict |
|---|------|---------|
| 1 | Commit `89b3c2c` contents vs phase-C | **BLOCKED — needs-owner (artefact missing on this machine)** |
| 2a | Signing gap A: Camoufox manifests must use a separate publisher key | **already-covered** (integrated tree is broader: enforced at sign time AND install/verify time) |
| 2b | Signing gap B: private keys must be blocked inside engine packages | **already-covered** (integrated tree blocks at sign time AND verify time) |
| 3 | Single-instance lock sharing one data store | **owner-version-better — adopt** (integrated tree has no equivalent at all) |

---

## Item 1 — `89b3c2c` vs phase-C: cannot be diffed from this machine

**The owner's local checkout does not exist on this machine, and the commit
object `89b3c2c` is not present in any repository here.** Evidence, all
checked 2026-10-22:

- Every `.git` under `~/workspace` (60+ clones: `ggminh-base`,
  `ggminh-integration`, `ggminh-sel-work`, all `ggminh-agents/a1..a10`, all
  `ggminh-commercial/a1..a20`, all Wave-R clones, `commercial-sprint/*`) was
  probed with `git cat-file -e 89b3c2c` — **not found in any object store**.
- The only three ggminh checkouts on this machine sit at `8349f38`
  (ggminh-base), `f280296` (ggminh-integration) and `f7ae949`
  (ggminh-sel-work, the preserved dirty D1-line clone — its reflog contains
  no `89b3c2c` either).
- Project memory records why: the checkout is the user's **other** checkout,
  reported by the user on 2026-10-21 19:29 and at that time verified to be on
  no GitHub remote ref (`~/memory/2026-10-21.md`, "parallel checkout report";
  `~/MEMORY.md` parallel-stream entry). It was never transferred to this
  machine.

Consequently **no file-level statement about `89b3c2c` is made anywhere in
this report** — any such statement would be fabrication. What the record
does establish about the stream, and nothing more:

- `89b3c2c` was that checkout's HEAD on 2026-10-21; the v5.8 source package
  the user sent out was built from it **without** the two uncommitted changes
  (items 2 and 3 below).
- That stream's own "Giai đoạn 0" artefacts (test-page/, ENGINE_DECISION.md,
  baseline snapshot) were **not** implemented there — only code review and a
  measurement-method agreement. There are no measurement results in that
  stream to reconcile.
- At report time three code states existed: GitHub integration `4af6513`, the
  assistant's D1 line, and the user's `89b3c2c`.

**What the owner must supply to unblock this item** (any one of): a
`git bundle` of the checkout; a scratch-branch push of `89b3c2c`; or
`git format-patch` output for the commit **plus** the two uncommitted changes
as patches (commands in INTEGRATION-NOTES.md). Until then the committed part
of the local stream is unreconcilable from here, and nothing should merge to
main on any claim of including it. The two uncommitted changes, however, were
described by the owner precisely enough to reconcile at behaviour level —
items 2 and 3 below.

---

## Item 2 — The Camoufox signing-tool fix vs Agent 2's independent fix

The owner's uncommitted change, per their report: *"Camoufox signing tool
fixed to use a separate publisher key and to block private keys inside the
engine package (12 tests re-run pass)."* Agent 2 of the 10-agent deployment
independently fixed **the same two §8 gaps** in commit `e72991b`
("fix(engine): enforce publisher/license key separation and keep private
keys out of engine packages"). `tools/sign-bundled-engine.js` is the only
engine signing tool in the tree and serves both engines (`engine='camoufox'`
selects `camoufox.exe` as the entry), so both fixes target the same file and
the same two gaps. A2's commit is the most recent change to all three
affected files (`git log f280296 -- <files>` shows only `e72991b` after the
selective staging commit `5032e70`) — it survived phase-C and both commercial
waves intact, and phase-C additionally wired its install-service guard live
(see Gap A).

### Gap A — separate publisher key for Camoufox

Integrated tree today (`tools/sign-bundled-engine.js` at `f280296`):

- Camoufox manifests **require** an explicit publisher public key file
  (`LHM_ENGINE_PUBLISHER_KEY_FILE`); with none supplied the tool throws
  *"Camoufox engine manifests require a separate publisher key file; the
  license signing key is not accepted"* (line 60–61) — **no license-key
  fallback exists for Camoufox**.
- When a publisher file is supplied (any engine), a publisher key identical
  to the license key is refused by SPKI-DER comparison (line 58), and the
  signature must verify against the publisher key, not the license key
  (self-check before writing the manifest).
- Defence in depth on the verify side: `CamoufoxInstallService`'s
  constructor independently refuses a publisher key identical to the license
  key (`src/engine/camoufoxInstallService.js:128,137`), and the coordinator
  wired `licenseKey: LICENSE_PUBLIC_KEY` into both construction sites
  (`main.js:841,846`), so the guard is live in the app, not just available.
- Extras beyond the owner's two-line description: a signing key file located
  inside the tree being packaged is refused; non-Ed25519 signing/publisher
  keys are refused.

### Gap B — private keys inside the engine package

Integrated tree today:

- **Sign time:** `assertNoPrivateKeyMaterial()` scans every file in the tree
  before signing and refuses to sign if any file ≤ 1 MiB contains any of 7
  PEM private-key markers (`PRIVATE KEY`, `RSA/EC/DSA/OPENSSH/ENCRYPTED
  PRIVATE KEY`, `PGP PRIVATE KEY BLOCK` — `src/engine/bundledEngineManager.js:21–38`,
  used by `tools/sign-bundled-engine.js:28`).
- **Verify time:** `BundledEngineManager.verify()` re-checks every
  manifest-listed file and throws *"Bundled engine contains private key
  material"* (`bundledEngineManager.js:171–177`) — so a package signed
  elsewhere (or before the rule) is still rejected at install/verification.

### Verification run for this report

Both suites were executed on the integrated tree at `f280296` in this
agent's clone (self-contained; throwaway keys):

- `node test/camoufox-engine-source-hardening.js` → **PASS** (asserts, among
  others: Camoufox without a publisher file refused; publisher file equal to
  the license key refused; sign tool refuses a tree containing a private key;
  `verify()` rejects a package carrying private-key material; install
  service refuses publisher == license).
- `node test/camoufox-engine-distribution.js` → **PASS** (A13's full
  pipeline: CLI sign → bundled verify → package → pinned download → install
  → installed verify, including the separation and private-key refusal
  paths).

### Verdict — item 2: **already-covered** (both gaps)

On the evidence available, the integrated tree implements everything the
owner's description claims, and more (verify-side enforcement for both gaps;
the install-service guard wired live). The owner's signing fix can be
**discarded** when their checkout is next synced — adopting it would replace
broader coverage with narrower. One honest caveat: this comparison is
against the owner's *reported description* of their change, not their code
(the checkout is absent — item 1). If their implementation contains
behaviour beyond that description, only the supplied diff can reveal it; the
byte-check in INTEGRATION-NOTES.md is cheap insurance and is the one
follow-up worth doing if the artefact ever arrives.

**Not part of this item (do not conflate):** `tools/sign-bundled-engine.js:63`
still falls back to the license key for **Chromium** manifests when no
publisher file is supplied. That is the deliberate legacy branch A2 left in
place, already tracked as owner decision **QD-02** (briefs recommend Option
1: one separate publisher key for both engines). The owner's fix was
Camoufox-scoped per their report, so this residual neither changes the
verdict above nor is it resolved by adopting anything from the local stream.

---

## Item 3 — Single-instance lock: nothing equivalent exists; adopt the owner's

### What the integrated tree has today: nothing

A tree-wide search at `f280296` finds **no** `requestSingleInstanceLock`, no
single-instance handling, and no file lock in `src/db/store.js` or `main.js`.
Electron assigns both processes of the same app the **same** `userData`
directory, hence the same storage directory
(`main.js:790`: `app.getPath('userData')/storage`). Both instances therefore
share one data store with zero coordination.

### What actually breaks with two instances (each point grounded in the code)

1. **Silent whole-database lost updates (the owner's stated motivation —
   confirmed).** `Store` loads `db.json` once into memory at construction
   (`src/db/store.js:36–41`) and every `saveData()` rewrites the **entire**
   database from that process's own snapshot (`store.js:54–56`, temp file +
   rename). Two instances hold diverging snapshots; every save by either one
   silently discards the other's profile creations/edits/deletions, settings
   and trash changes made since it started. No error is shown anywhere.
   License capacity checks (`assertCapacity`) also run against each
   instance's stale snapshot, so the licensed profile cap can be overshot
   by concurrent creation in two instances.
2. **Deletion acting on stale state.** `cleanupTrashedFolders()` /
   `deleteProfile()` remove folders under all four `PROFILE_DATA_ROOTS`
   based on the acting instance's own snapshot: an instance can purge the
   folders of a profile the other instance has since restored — or is
   currently running.
3. **Same-profile double launch.** Running state is per-process memory; the
   second instance does not know the first is running profile X and will
   attempt its own launch against the same browser profile directory, which
   the engine's own profile lock then rejects (Chromium singleton lock /
   Firefox "already running") — a confusing engine-level failure instead of
   a clear app-level one. (Different profiles in the two instances avoid
   this but remain fully exposed to hazards 1–2 and 4–5.)
4. **Local API port conflict.** Both instances read the same
   `apiEnabled`/`apiPort` (default 50325). The second instance's `listen`
   fails with EADDRINUSE and surfaces as *"Cannot start Local API: …"*
   (`main.js:117–128`); the settings flag itself is raced by both writers.
5. **Append-style stores lose each other's records.** The exit-IP
   observation store and the warning-history store each keep an in-memory
   array and persist it whole (atomically, tmp+rename): whichever instance
   persists last overwrites the other's observations/warnings recorded
   since startup.
6. **License clock anchor can regress (low severity).** `highestSeen` is
   held per process (`src/licensing/manager.js:88–108`); a stale instance
   writing its own later-but-lower value can move the on-disk anchor
   backwards, weakening clock-rollback detection within its tolerances.
7. **Checked non-hazards:** the authenticated proxy gateways bind ephemeral
   ports (`listen(0)` in `authenticatedHttpGateway.js:72`,
   `authenticatedSocksGateway.js:113`) — no clash; and individual file
   writes are atomic — the risk class is **lost updates and stale-state
   actions, not torn files**.

### The owner's fix (as reported)

Blocks opening two LHM instances that share one data store; logic and
init-order tests pass; **not yet accepted with two real EXEs** — the owner's
own caveat, which stands regardless of whose implementation is adopted.

### Verdict — item 3: **owner-version-better — adopt**

The integrated tree has no equivalent at all, and the owner's behaviour
specification matches the standard Electron mechanism
(`app.requestSingleInstanceLock()`, keyed to the userData directory, taken
before the store is touched; second instance quits; primary instance
focuses its window on `second-instance`). The exact adoption diff — a
faithful reconstruction, since the owner's literal diff is not on this
machine — is in INTEGRATION-NOTES.md, including the one ordering subtlety
that matters in this codebase: the lock must be taken **after** the
`LHM_CI_UI_CAPTURE` `app.setPath('userData', …)` override (which gives each
CI capture its own per-PID data store, so parallel CI instances must *not*
block each other) and **before** the legacy-data migration and
`new Store(...)`. If the owner supplies their original patch, diff it
against the reconstruction and prefer theirs where they differ — their
init-order tests encode decisions this report cannot see.
