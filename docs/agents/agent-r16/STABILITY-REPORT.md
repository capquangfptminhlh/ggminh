# Agent R16 — Test-Chain Stability & Flake Hunt Report

**Scope:** Wave R (release-prep), Agent R16. Base: `integration/v5.8-phase-c` @ **f28029655e59aa020d8a040521747a7c43c15e36** (untouched; branch `agent-r16/chain-stability` adds this report only — no code or test changes).
**Environment:** Linux x86_64, Node v24.20.0, npm 10.9.4, clean `npm ci` (483 packages), this machine (2 vCPU / ~8 GB). All runs sequential, no parallel load.
**Method:** the full 201-step chain via `node test/run-all.js`, three consecutive runs on the untouched base tree; then repeated stress of the historically suspicious suites; then a static audit of every tamper site in the test suite for the known base64url trailing-character artefact class, with an empirical probe where the code reading left any doubt.

## 1. Full chain ×3 — verdict: perfectly deterministic

| Run | Wall time (UTC) | Result | Failures |
|---|---|---|---|
| 1 | 17:43:53 → 17:47:38 | 199 PASS / 2 FAIL | steps 31, 120 |
| 2 | 17:47:38 → 17:50:29 | 199 PASS / 2 FAIL | steps 31, 120 |
| 3 | 17:50:29 → 17:52:56 | 199 PASS / 2 FAIL | steps 31, 120 |

Across **603 step-executions there were zero unstable steps**: 199 steps passed 3/3, 2 steps failed 3/3, and no step changed state between runs (comparison of the runner's own per-step summaries; full 201-row table in `per-step-table.md` beside this report).

The two failures are bit-for-bit the same failure in every run, not wandering ones:

- **Step 31 — `node test/browser-diagnostics.js`**: `AssertionError` at `test/browser-diagnostics.js:20`, identical in all 3 runs.
- **Step 120 — `node test/runtime-registry.js`**: `AssertionError` — input did not match `/Firefox/`, identical in all 3 runs.

Both were mechanism-verified by Agent 20 (Wave 3) as Windows-platform fixtures: POSIX `path.isAbsolute` / drive-path gates evaluated against `C:\…` fixtures and POSIX `/tmp` paths. They fail on Linux by construction and pass on Windows (the full chain is reported 201/201 in Windows CI run 39641363889 at the same tree's snapshot f549a63). **Classification: environment (platform fixture), deterministic — not a flake, not a product bug.**

## 2. Stress of the historically suspicious suites — all clean

| Suite | Repetitions | Result |
|---|---|---|
| `test/license-center.js` | ×40 | **40/40 PASS** |
| `test/license-state-matrix.js` | ×10 | **10/10 PASS** |
| `test/warning-history.js` | ×10 | **10/10 PASS** |
| `test/camoufox-engine-distribution.js` | ×10 | **10/10 PASS** |
| `test/fleet-scale.js` | ×10 | **10/10 PASS** |
| `test/license-online.js` (added — see §3) | ×10 | **10/10 PASS** |

license-center is the suite with the real flake history (A11: the old trailing-`'AA'` tamper was a decoded-bytes no-op in ~6.2% of random tokens). At the old rate, 40 runs would be expected to produce ~2–3 failures; observed **0** — consistent with the coordinator's 40-run and Agent 20's 35-run verifications of the mid-signature fix. The three chain runs add 3 more passes each for every suite above (each is also a chain step).

## 3. Base64url trailing-tamper audit — one lookalike found, provably NOT the artefact

Static audit of `test/`, `tools/`, `stage0-measure/`, `src/` for tamper-by-trailing-characters (`slice(0,-n)+…`, token string surgery, `.replace` on signed strings). Every tamper site in the suite falls into a deterministic class (payload re-encode with signature kept — license-state-matrix §F; post-signing object-field mutation — update-check; ciphertext/file byte tampering under GCM/SHA-256 — backup drill, camoufox suites; JSON field validation — warning-history). Exactly **one** site shares the *shape* of the old license-center bug:

- **`test/license-online.js:52`** — `verifyReceipt(receipt.slice(0,-3)+'abc', …)` replaces the last 3 characters of the receipt (i.e. of its Ed25519 signature segment).

It is **not** the artefact, by construction and by measurement:

1. `src/licensing/receipts.js` `read64()` enforces **canonical base64url** (decode → re-encode → require equality, else `Noncanonical signed receipt`). A 64-byte signature's canonical 86th character must be one of indices {0, 16, 32, 48} (`A`, `Q`, `g`, `w`); the replacement's final character `c` (index 28, low 4 bits ≠ 0) can therefore **never** survive the canonical check — regardless of the token's random content. Even in the theoretical byte-identical case (original tail already `ab` + matching top bits), the check throws before signature comparison.
2. The assertion's regex `/signature|Malformed|Noncanonical/` covers every throw class this tamper can produce.
3. **Empirical probe:** 3,000 freshly signed random receipts, each tampered exactly as the test does → **3,000/3,000 threw `Noncanonical signed receipt`, 0 escapes, 0 other errors** (probe run against the tree's own `signReceipt`/`verifyReceipt`).

Contrast with the historical license-center case: the flake there required the decoded signature bytes to survive unchanged *and* verification to proceed; here the verifier's canonical-encoding gate closes that hole deterministically. **No fix is warranted** — changing the test would churn a provably deterministic assertion for pattern-uniformity only. (If a future editor touches that line anyway, the mid-signature flip used in license-center.js:34 is the house pattern to copy.)

Also confirmed: the current `test/license-center.js:34` tamper flips the character at `signed.lastIndexOf('.')+10` — index 9 inside the signature segment, a full-6-significant-bit position, `A↔B` — so it changes the decoded signature for every possible token. Deterministic by construction, and doubly guarded by `manager.js` `b64read()`'s own canonical check (assert regex `/signature|encoding/` covers both throw classes).

## 4. Non-determinism found

**None.** No step, in 3 full chains plus 90 stress repetitions, changed outcome between runs. Nothing required reproduction or classification beyond §1's two known platform fixtures. No assertion was weakened, and no code or test fix was made or is proposed.

## 5. Freeze recommendation

- **Freeze the chain as-is for Gate evidence.** On this Linux tier it is fully deterministic: cite it as **199/201 with two named platform fixtures (steps 31, 120)** — never as a bare number and never merged with the Windows figure.
- **Steps 31 and 120 are trustworthy only from Windows runs.** Their Linux failure is deterministic and mechanism-explained; their PASS evidence must come from Windows CI (run 39641363889) or Gate 3, and any future Linux-side "fix" that makes them pass by relaxing fixtures should be rejected.
- **No step needs quarantine.** In particular, license-center — the one suite with a true flake history — is closed: 40/40 here, on top of 40 (coordinator) + 35 (Agent 20) prior post-fix runs, plus 3/3 in these chains.
- **Scope limits of this stability claim:** proven for Linux x86_64 / Node v24.20.0 / sequential execution on this machine. Suites that bind local servers or exercise timers (license-online, fleet-scale) showed no sensitivity at these repetition counts, but if Gate evidence is later produced under parallel CI load or on the Windows runner itself, re-run this same stress set there before citing stability.
- Working tree verified clean after all runs (`git status` empty, HEAD still f280296); the runs leave no residue in the repo.

## 6. Logs

Full logs retained in the workspace (outside the repo): `~/workspace/ggminh-release/r16-logs/` — `chain-run1.log`, `chain-run2.log`, `chain-run3.log` (complete run-all output incl. summaries), `stress-<suite>.log` + `.summary` per suite, `stress-totals.txt`, `per-step-table.md` (also copied beside this report), `compare-runs.js` (the cross-run parser), `run-stress.sh`.
