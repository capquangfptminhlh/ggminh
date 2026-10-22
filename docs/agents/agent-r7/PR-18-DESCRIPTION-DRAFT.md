**Draft PR — DO NOT MERGE without an owner decision** (constitution
§12, Gate 4). This PR was opened to run the existing Windows CI
(`windows-exe.yml` triggers on `pull_request`, not on branch push).
Its head is the current v5.8.0 Preview integration tree; the release
verdict for this tree is **NOT_READY** (see Gate status below).

## What this branch is

`integration/v5.8-phase-c` is a snapshot-published copy of the local
integration clone (`~/workspace/ggminh-integration`, branch
`integration/v5.8-phase-c`, local head `f280296`). The local clone
holds the full merge history (one merge per agent branch); the
remote branch carries flattened snapshot commits on top of `main`
(`77075f3`, v5.7.0) because the publishing path used here cannot
replay history:

| Remote snapshot | Local tree it publishes | Contents |
| --- | --- | --- |
| `e1de963` | `07150d6` | Phase C: 10-agent deployment + coordinator wiring |
| `1c3e065` | `f4d7329` | Windows-CI test-compatibility fixes |
| `38b25d7` | `e3fd868` | Commercial Wave 1 (8 agents) integrated |
| `f549a63` | `f280296` | Commercial Wave 2 (11 agents) + coordinator wiring |

## Contents

**Phase C — 10-agent deployment + coordinator wiring.** Per-profile
Camoufox identity provisioning at profile creation
(`src/engine/camoufoxProvisioning.js`): identities are generated
only with the official `camoufox@0.5.8` generator; when the
generator/engine is unavailable the profile is created WITHOUT a
pinned identity and the state is recorded on the profile
(`fingerprint.identityProvisioning = 'unavailable'`); an invalid
generated identity is never attached. Unified warning service wired
end-to-end (IPC `get-warning-report` + preload). Exit-IP observation
store (`src/health/exitIpObservations.js`, file mode `0o600`).
Criteria-checklist provider feeding 2 of 6 criteria from live
warning data. `CamoufoxInstallService` receives the license key for
its publisher-key self-defence checks.

**Commercial Wave 1 — release pipeline and measurement.** Release
pipeline hardened: `electron-builder` pinned to `25.1.8` in
devDependencies + lockfile (previously resolved fresh on every
build); installer payload glob trimmed after a diagnostic build
showed the old glob shipped internal documents — including the
product constitution — to customer machines. Provisioning locale
bug found and fixed (the generator read a non-existent
`fingerprint.language` field; locale now falls back to
`languages[0]` and the generated identity is asserted against the
profile at generation time). WebGL measured against pinned
identities in a headful lab environment (vendor/renderer comparable
and matching per profile; low-level GL parameters have no identity
expectations yet). DNS lab tooling built and run on the direct path
(the "resolve via proxy route" handling decision remains unmeasured).
Proxy egress and WebRTC measured through the real product path in
the lab (HTTP and SOCKS5 egress pass; a blocked proxy configuration
fails closed with `NETWORK_BLOCKED`); the absence of STUN requests
was traced to the lab host's UDP transport, not to browser
behaviour. Engine-distribution pipeline (sign → verify → package →
install) proven end-to-end with throwaway keys, with an owner
runbook for the production key ceremony. Customer documentation set
(7-part user guide + seller runbook, every claim traced to code).
Decision briefs QD-01…QD-04 in `docs/decisions/`.

**Commercial Wave 2 — durability, honesty of surfaced data, QA.**
Ready-to-apply workflow files in `release/workflows/` with
APPLY-GUIDE (see divergence note below), including the diagnosis
that the configured-measurement generate step fails on CI by
construction (no step creates the runtime prefix it expects) and an
optional minimal fix, deliberately not baked in. Runtime exit-IP
observation from inside the browser page context
(`src/health/runtimeEgressObservation.js`), recorded with
`source: 'browser-runtime'` and wired config-gated: it fires only
when `settings.runtimeEchoUrl` is configured, and is a strict no-op
otherwise; the existing manager-process observation is now labelled
`source: 'manager-process'`. Durable warning history
(`src/monitor/warningHistory.js`): atomic persistence, a whitelist
projection so only the normalised warning shape can reach disk
(constitution §20.3), retention caps, corruption reported as an
error state rather than a partial pass; wired with authoritative
seeding in `main.js`, plus `clear-warning-history` IPC/preload.
Criteria checklist: fixed a defect in which the checklist's async
data provider was consumed synchronously, so measured data never
reached the screen and every criterion fell back to CHƯA ĐO;
per-profile measurement-record contract defined
(`lhm-profile-measurement` v1) — no real records exist yet, so the
three stage-0 criteria remain CHƯA ĐO. Local API minimisation:
profile `notes` and the identity blob no longer leave over HTTP
(provenance metadata is returned instead); secret-file patterns
added to `.gitignore`. Test runner `test/run-all.js` (runs every
chain step, reports all failures); the intermittent license-center
test failure root-caused (Ed25519 signature tail bits) and fixed.
Signed update-manifest checker prototype (`src/update/updateCheck.js`)
— verification only: it never downloads or applies an update, and it
is not wired into the UI. Fleet-scale verification of the profile
and observation stores; the exit-IP store's silent-corruption data
loss fixed (atomic persist + corrupt file preserved). First-run UX:
provisioning outcome is now shown after profile creation, a
"Cấp danh tính" action exists for existing profiles, identity-state
labels corrected, engine dialog guidance in Vietnamese. Deletion
completeness: permanent deletion now removes profile data from all
four storage roots (`PROFILE_DATA_ROOTS` in `src/db/store.js`),
including `camoufox-profiles/` and `extensions/` — previously only
two roots were cleaned, so deleted Camoufox profiles left data on
disk. Backup/restore drill passed through the real backup path.
License state matrix (11 states) verified against the real
LicenseManager; corrupt license state files now fail closed instead
of crashing the app at startup.

**Wave 3 — independent QA (Agent 20).** Clean-clone re-run of the
full chain, independent spot-checks of the six headline fixes,
coordinator-wiring audit (no drift), and a §11 wording + secrets
scan over the Wave-2 delta (clean). Verdict at QA time: ready for
Gate 3, conditional on this snapshot landing and its Windows CI
being green — both conditions are now met (see below).

## Test and CI evidence

- Local chain (package.json `scripts.test`): **201 steps**. On
  Linux: 199 pass / 2 fail — both failures are Windows-platform
  fixtures (`browser-diagnostics`, `runtime-registry`),
  mechanism-verified by the independent QA; the Wave-2 delta touched
  neither the fixtures nor their sources.
- Windows CI for the current head `f549a63`:
  [run 39641363889](https://github.com/capquangfptminhlh/ggminh/actions/runs/39641363889)
  — **SUCCESS**. The same 201-step chain passes in full on Windows.
- Wave-1 tree precedent: run 39637543640 — SUCCESS.

## Artifacts (from run 39641363889)

| Artifact | Size | Digest |
| --- | --- | --- |
| `LHM-Ads-Browser-Windows-x64` (ZIP) | 85.3 MB | `sha256:8e5ca8a62a4c38b121935886eef6148fdd5dc76caf9a4ba45a2a4703cf560634` |
| `LHM-Workspace-UI-Preview` | 770 KB | `sha256:c340861ec5af2468fa08f95c3c8bffd0ce775ae101e442391dcac96af923e15e` |

The installer EXE inside the ZIP is 89,473,785 bytes with SHA-256
`54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497`
(hash computed from the downloaded artifact). These digests are
integrity evidence for the artifact; the installer is **not**
Authenticode-signed (owner decision, 2026-10-22: ship unsigned for
now; the customer guide documents the SmartScreen click-through).

## Known divergence: `.github/workflows`

The remote branch's workflow files are held at `main` versions
because the publishing token has no `workflows` permission. The
remote `windows-exe.yml` therefore lacks the bundled-engine
staging-verify step, and `camoufox-upstream-smoke.yml` is absent.
The full, ready-to-apply versions are in `release/workflows/` with
`APPLY-GUIDE.md` (owner action, QD-04). Until they are applied, the
configured-profile measurement cannot run on CI — and per the Wave-1
diagnosis it would fail at the identity-generate step even then,
unless the optional prefix fix in the guide is also approved.

## Gate status (constitution §12)

| Gate | Status |
| --- | --- |
| Gate 1 — local tests | PASS (Linux tier; 2 Windows fixtures fail only on Linux) |
| Gate 2 — Windows CI build + regression | PASS at `f549a63` (run 39641363889) |
| Gate 2 — configured-profile measurement on CI | NOT MET (workflows unapplied; generate-step fix unapproved) |
| Gate 3 — acceptance of the installed EXE on a real Windows machine | NO EVIDENCE |
| Gate 4 — tag / merge | NOT DONE (`main` still `77075f3`; this PR stays Draft) |

Overall verdict: **NOT_READY for commercial release**, with zero
code blockers found by the independent QA. Owner ruling recorded
2026-10-22: before Gate 3, use is internal and supervised only; a
pilot with real customers starts after minimum acceptance on an
independent Windows machine, with unsupported features disclosed.

## Owner decisions

Pending: QD-01 (PREFLIGHT_ONLY policy for direct Camoufox profiles),
QD-02 (separate publisher key), QD-03 (constitution §4/§17.2 status
updates), QD-04 (apply the workflow files + generate-step fix) —
briefs with recommendations in `docs/decisions/`; A12 update
decisions D1–D4; A17 items F3 (user-created session snapshots are
not purged with a profile, and the purge UI does not disclose this)
and F4 (automation workflows keep referencing purged profile ids);
the LHM-operated echo endpoint that would activate runtime exit-IP
observation in production.

Recorded: no Authenticode purchase (installer ships unsigned by
owner choice); Gecko remains available for profiles, with the
default-engine question deferred until after engine acceptance
(constitution §8 owner decision).

## Divergent streams — reconciliation owed before any merge

This branch does NOT contain the D1 branch's later commit `7f13c3f`
(fail-closed audit, behaviour alerts, license tamper hardening), the
selective-integration branch state `8c1ab69`, or the owner's local
unpushed work (`89b3c2c` plus uncommitted changes). These streams
must be reconciled before anything merges to `main`.
