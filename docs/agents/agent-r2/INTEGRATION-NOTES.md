# INTEGRATION-NOTES — Agent R2: Configured-measurement end-to-end rehearsal

- **Agent:** R2 (Wave R, release-prep) · **Branch:** `agent-r2/configured-measure-rehearsal`
- **Base / HEAD at rehearsal:** `f280296` (`integration/v5.8-phase-c` coordinator wiring commit)
- **Date:** 2026-10-22 · **Host:** Linux x86_64, Node v24.20.0, npm 10.9.4, Xvfb present
- **Engine:** real Camoufox Linux build, `~/tmp-big/cfx-build/camoufox-bin`,
  SHA-256 `2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669` (verified before every run)
- **Rules honoured:** no push/merge/tag; synthetic profiles only; no changes to
  `run-config.js`, the controller, or any shared file — all deliverables are new files.

## 1. Mission

Prove the CONFIGURED measurement pipeline works end-to-end locally, so the
only remaining unknown is the Windows CI runner itself. The pipeline is the
one the smoke workflow (`release/workflows/camoufox-upstream-smoke.yml`)
defines: generate two pinned identities with the official generator →
measure two configured profiles through the app controller with
`stage0-measure/run-config.js`.

## 2. Agent 2's diagnosis — REPRODUCED locally (Phase 1)

Agent 2 found, from code and from D1 smoke run 39614246764, that the
generate step fails by construction: it expects
`$RUNNER_TEMP/lhm-camoufox-runtime/node_modules/camoufox` to exist and
throws `Pinned camoufox launcher runtime missing` otherwise, while **no
step or script creates that prefix** (the install step puts
`camoufox@0.5.8` at the repo root).

Reproduced faithfully in a fresh temp dir standing in for `$RUNNER_TEMP`:
with the prefix absent, the step's guard throws exactly
`Pinned camoufox launcher runtime missing` — while
`node_modules/camoufox` (0.5.8) is verifiably PRESENT at the repo root.
The package is installed; it is installed in the wrong place, and the
prefix the step actually reads is created by nobody. Evidence:
`evidence/phase1-repro.log`, `evidence/verdicts.txt`.

## 3. The fix — APPLIED and verified (Phase 2)

The APPLY-GUIDE §4 approach, run verbatim (shell syntax aside):

```
npm install --prefix $RUNTIME --no-save --no-package-lock --ignore-scripts \
  --no-audit --no-fund camoufox@0.5.8 playwright-core@1.62.0
```

After it, `$RUNTIME/node_modules/camoufox/package.json` reports version
**0.5.8** and the generate step's guard passes. This is the same change
the owner is asked to approve for the workflow file (QD-04); the
rehearsal changes no workflow file.

## 4. Generation through the staged prefix — PASS (Phase 3)

Staged exactly as the CI step does (`tools/generate-camoufox-identity.mjs`,
`src/engine/camoufoxIdentity.js`, `src/health/signalChain.js`,
`src/health/proxyValidation.js` copied into the prefix), then ran the
generator twice with the CI arguments — `--os windows`,
`en-US`/`America/New_York` and `vi-VN`/`Asia/Ho_Chi_Minh` — against the
real engine path. Both identities:

- were produced by `camoufox@0.5.8` (`generator` field in each file),
- pass the repo's own `validateStoredIdentity` (the same validation
  `run-config.js` applies in `loadIdentity`),
- differ in timezone AND language, as `run-config.js` requires.

Expectations-only summaries (CAMOU_CONFIG chunks deliberately withheld,
per the Agent-5 precedent): `evidence/identity-a.summary.json`,
`evidence/identity-b.summary.json`.

## 5. `run-config.js` itself on Linux — NOT_RUN BY DESIGN (Phase 4)

Run unmodified with the full CI environment, `stage0-measure/run-config.js`
refuses before any measurement: its `run()` opens with
`if(process.platform!=='win32') throw Error('Real Camoufox Stage-0 measurement requires Windows')`
and additionally requires the executable basename to be `camoufox.exe`.
Exit code 2, message captured in `evidence/phase4-run-config-as-is.log`.
This is a design gate, not a defect — but it means the CI script can
only ever be exercised by the Windows runner, which is precisely the
residual unknown this rehearsal set out to isolate.

## 6. Two rehearsal-harness incidents (attempts 1–2) — mechanisms, both fixed in the harness only

### Attempt 2 — the orchestrator scrubbed npm's egress (harness bug, not a pipeline defect)

Attempt 2 stalled in Phase 2: every npm registry fetch failed with
`ERR_SSL_WRONG_VERSION_NUMBER` (npm debug log excerpt preserved as
`evidence/attempt2-npm-registry-failure.log`). Cause: the orchestrator
originally scrubbed the inherited `*_PROXY` variables **globally**,
which removed this sandbox's only registry egress route. Attempt 1 had
succeeded minutes earlier only because it rode the warm npm cache from
the setup installs. Fix, now in the script: proxy variables are
scrubbed **only** for the measurement child processes (Phases 4–5, via
`env -u`) — Agent 5's lesson applied where it belongs — and kept for
npm. On a GitHub runner this sandbox quirk does not exist; the incident
is recorded because it proves how environment details, not code, decide
whether the generate step can run at all.

### Attempt 1 — controller gate: mechanism, and the precedented adaptation

The first rehearsal-driver attempt failed before any launch with
`identity FAIL — "Verified absolute Camoufox executable required"`
(storage FAIL because it never ran; cleanup PASS). Mechanism, from
`src/engine/CamoufoxPlaywrightController.js` `launch()`:

```js
const executable=this.verifier.resolve('camoufox');
if(typeof executable!=='string'||!path.isAbsolute(executable)||
   path.basename(executable).toLowerCase()!=='camoufox.exe')
 throw Error('Verified absolute Camoufox executable required');
```

The controller — independently of `run-config.js` — hard-requires the
basename `camoufox.exe` **on every platform**. The repo's own Linux
harnesses already solved this the same way (`stage0-measure/run-isolation.js`,
`stage0-measure/run-runtime-egress-observation.js`): symlink the verified
lab binary into a shim dir under the name `camoufox.exe` and let the
verifier resolve to the shim. The rehearsal driver adopts exactly that:
the SHA-256 check runs on the real binary first, the symlink points at
that verified file, and the report binds both paths
(`browserExecutable`, `controllerExecutable`, `browserExecutableSha256`).
Neither the controller nor `run-config.js` was modified. Attempt 1's log
and report are preserved as `evidence/attempt1-phase5-measure.log` and
`evidence/attempt1-report.json`.

## 7. Measurement results (Phase 5, attempt 3 — the clean full run)

§23 binding: executed `2026-10-21T18:01:15.573Z`; branch head
`f28029655e59aa020d8a040521747a7c43c15e36`; engine SHA-256
`2a2cb03f…` (full value in §1); driver
`CamoufoxPlaywrightController + playwright-core.firefox`, headful under
Xvfb (the controller's own `headless:false`); synthetic profiles,
loopback origin, direct (no-proxy). Full machine-readable record:
`evidence/stage0-config-rehearsal-report.json`. Orchestrator exit code 0.

**Identity vs pinned expectations — PASS, 28/28 field comparisons.**
Per profile, `core.identityExpectationResult` compares 7 fields
(userAgent, platform, language, timezone, hardwareConcurrency,
screenWidth, screenHeight), on the first session and again after a
stop/relaunch restart leg:

| Profile | Drawn identity (expectations) | First session | After restart |
|---|---|---|---|
| A | en-US · America/New_York · 2560×1440 · hwc 4 · Win32 · Firefox/156.0 UA | 7/7 matched | 7/7 matched |
| B | vi-VN · Asia/Ho_Chi_Minh · 1920×1080 · hwc 4 · Win32 · Firefox/156.0 UA | 7/7 matched | 7/7 matched |

`identityApplied` was asserted true for both profiles on every launch.
Distinctness, as `run-config.js` requires: exposed timezone differs
(A≠B) — true; exposed language differs — true.

**Storage isolation — PASS, 20/20 sub-checks.** The `run-config.js`
protocol (cookie, localStorage, IndexedDB, Cache Storage ×
{no A-marker in fresh B, A isolated after B writes, B isolated after B
writes, A persists after restart, B persists after restart}) — all 20
true, including both restart-persistence checks.

**Extended probe — 18 MEASURED / 4 UNSUPPORTED / 1 BLOCKED per profile
(23 points, identical shape for A and B).** WebGL expectation comparison
(`core.webglExpectationResult`): 2 comparable fields (vendor, renderer)
per profile — **2/2 matched for A, 2/2 matched for B**; both identities'
drawn ANGLE strings were exactly what the engine exposed. BLOCKED:
`audio.offlineHash`. UNSUPPORTED: `clientHints.high`, `clientHints.low`
(no UA Client Hints in Firefox — expected), `navigator.battery`,
`navigator.keyboard`. All five WebGL probe points MEASURED — the
headful/Xvfb combination creates a real GL context, replicating Agent
4's headful finding; pure headless remains the known no-context control.

**Network — NOT_RUN** (proxy route, DNS, WebRTC, external egress), by
design of this protocol (direct profiles, loopback origin), exactly as
the report records. **Cleanup — PASS.** Signed-release and
installed-client acceptance — NOT_RUN (not this rehearsal's scope).

## 8. §4 points touched and their status

| Constitution §4 area | Exercised in this rehearsal | Status |
|---|---|---|
| §4.1 Network (proxy route, DNS, WebRTC, egress) | Not exercised — direct profiles, loopback origin | **NOT_RUN** |
| §4.2 Navigator/device identity (UA, platform, language, timezone, hardwareConcurrency, screen) | Pinned-expectation comparison, 2 profiles × 2 legs | **PASS — 28/28 comparisons matched** |
| §4.3 Graphics/audio | WebGL vendor/renderer vs pinned expectations: **PASS 2/2 per profile**; 5 WebGL probe points, canvas2d.hash/fontMetrics, offscreenCanvas: MEASURED (observation; no expectation defined); audio.basic: MEASURED; audio.offlineHash: **BLOCKED** | Mixed, per point as listed |
| §4.4 Fonts/voices/devices | fonts.detected, media.voices, media.devices: MEASURED (observation only, no expectation defined) | MEASURED |
| §4.5 Storage/identity isolation | 4 stores × 5 checks incl. restart persistence: **PASS 20/20**. Service Worker point is not part of the `run-config.js` protocol (Agent 6 measured it under the isolation protocol) | **PASS** (SW: NOT_RUN here) |
| §4.6 Behaviour/timing | Not touched | **NOT_RUN** |

## 9. Environment limits (read before citing any number above)

- Linux host, software-rendered Xvfb display: WebGL values are the
  Mesa/llvmpipe host stack, not a Windows GPU stack. The §4.3 WebGL
  comparison is therefore a pipeline proof, not a Windows measurement.
- The identities are drawn with `--os windows` (as in CI): the engine
  applies the drawn OS identity on the Linux host. Host-OS-bound
  surfaces (fonts present on the host, GL driver strings) remain
  host values by construction.
- Direct (no-proxy) synthetic profiles on a loopback origin only:
  network points (proxy route, DNS route, WebRTC, egress) are NOT_RUN,
  exactly as the report records.
- Nothing here is signed-release or installed-client acceptance
  (Gate 3), and nothing measures the Windows runner: Gate 2's
  configured-measurement portion closes only when the owner-applied
  workflow runs green on GitHub with the §4 fix in place.

## 10. Deliverables in this branch

- `stage0-measure/rehearse-configured-measure.sh` — the repeatable
  orchestrator (Phases 0–6; fresh RUNNER_TEMP every run; scrubs
  inherited `*_PROXY` vars, names only).
- `stage0-measure/run-config-rehearsal.js` — the minimal Linux port of
  `run-config.js` (identical profile shape, controller construction,
  storage protocol, core comparisons and assertions; differences are
  enumerated in its header and in the report it writes).
- `docs/agents/agent-r2/evidence/` — environment record, per-phase logs,
  identity summaries (no CAMOU_CONFIG chunks), attempt-1 artifacts,
  the attempt-2 npm-failure excerpt, the final rehearsal report,
  verdicts.

## 11. What the coordinator should do with this

Nothing to wire: no shared file changed. When QD-04 is answered and the
workflows are applied with the §4 fix, the first green smoke run on
GitHub should reproduce Phase 3 + the Windows-native equivalent of
Phase 5 with no further code changes expected. If that run fails at the
generate step, the failure is in the applied workflow file, not in the
pipeline: every component downstream of the prefix now has a local
end-to-end PASS on record (§23-bound: commit `f280296`, engine SHA-256
above, Linux/Xvfb scope as recorded in §9).
