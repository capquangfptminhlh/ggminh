# LHM Ads Browser 5.8.0 — RC scope lock and commercial acceptance

**Locked on 2026-10-23 by product direction. Current decision: NOT READY TO SELL.**
This is a release-control document, not proof of real customer activation, engine trust, or independent Windows acceptance. Do not fill untested fields with PASS.

## Scope — exactly five workstreams, in this order

1. **Consolidate code** from accepted branches into a single release candidate. Compare [PR #46](https://github.com/capquangfptminhlh/ggminh/pull/46) against `main` at `4d63f006239aaab0d69caaacdc67df2e067c8dc2`. PR #46 is a *Draft*, not an approved main merge; it changes 70 files including user-facing fingerprint/UI behavior. Merge only release-critical verified changes after reviewing the exact diff. Do not take earlier PR #1–24 wholesale. Record rejected additions, conflicts, and the final candidate SHA.
2. **Test one real rental flow** across a deployed, owner-controlled HTTPS licensing service and a clean Windows client: customer entry → binding installation ID → issuer signs a correctly scoped license → first online activation → reopen → expiry/renewal → revoked state → owner-sweep/strict behavior as applicable → re-allow or support recovery. Capture separate evidence that the server persists ledger/revocation and the client preserves customer data on expiry. Existing Node/loopback tests do **not** prove deployed HTTPS.
3. **Verify update trust** from an older installed EXE to the exact candidate: customer-installed app must contain an *approved production* Ed25519 public trust anchor; use an owner-offline-signed manifest, HTTPS allowlist, validity window, correctly named release asset, byte size and SHA-256. Confirm rejected tampered/expired/wrong-origin manifest and wrong installer; downloaded file must be user-confirmed, never silently run. Do not install a key inferred from an untrusted web response. Authenticode is optional, signed manifest/engine checks are mandatory.
4. **Accept the installed Windows EXE (Gate 3)**, not just the CI-built archive. On an independent Windows machine: verify the exact commit/run/EXE SHA-256; install (observe Defender/SmartScreen as-is, do not disable protection); test Chromium, signed/approved Camoufox where applicable, proxy and evidence-backed DNS/WebRTC/IP observations, profiles, session isolation, backup/restore, Local API permissions, and uninstall/reinstall preservation. Include fresh customer rental and signed-update observations from steps 2–3, and retain the 12 source plus 12 packaged UI capture hashes only as CI evidence. Every required checkpoint needs a file + SHA-256 + operator + Windows build; unmeasured routes remain NOT_RUN.
5. **Release (Gate 4)** only after independent Gate 3 PASS and owner signoff tied to the *exact* SHA-256/commit. Generate the draft release from successful same-main-commit CI using the existing owner-only workflow; inspect the contents and source attestations. Tag/publish *only* on explicit owner approval and approved distribution rights. Never auto-tag, auto-publish or label Preview as commercial.

## Hard freeze rules

- **Allowed:** compatibility defects, security fixes, crash/data-loss bugs, licensing and payment/rental correctness, verified signed-update fixes, packaging/installer defects, documentation and release-evidence tests.
- **Not allowed in 5.8 RC:** new AI capabilities, dashboard redesign, new marketing features, new fingerprint-spoofing options, cloud/team/synchronizer expansion, speculative anti-detection claims, or a broad integration merge just because CI is green.
- Every candidate change needs a release-blocker ID, specific reproduction, test proving the fix, Windows evidence when relevant, and review. If the candidate SHA changes, rebuild, rerun Gate 1/2 and rebind Gate 3 evidence to the *new* EXE SHA.
- No production private key, token, customer profile, password, cookie or real customer payment method in a PR, issue, CI artifact or chat. Real rental test data must use a consenting test customer and carefully scoped credentials.
- A GitHub Actions `success` only proves the jobs performed on its exact SHA; it does **not** prove a deployed subscription service, publicly trusted update channel, 24/7 operation, distribution rights, or Windows Gate 3.
- Current `main` installer is named `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`. **Do not rename it to Commercial or remove Preview** to bypass release criteria.
- Keep older project documents as historical references. This file records the current RC decision and should be reviewed before any PR touching release-critical code.

## Evidence ledger — never prefill as passed

| Workstream | Exact proof to attach | Status as of scope lock |
| --- | --- | --- |
| Consolidation | Final candidate SHA, reviewed diff of PR #46, required checks and feature-preservation comparison | **PENDING** — PR #46 Draft; Windows CI and Camoufox smoke on `7892c783...` passed but no consolidation approval |
| Rental | Independent clean-client activation, renewal, expiry, revocation, online receipt, server ledger and retention; tester/date/video/log (redacted) | **NOT RUN** against deployed customer-facing HTTPS service |
| Signed update | Approved public key embedded in EXE; actual signed manifest; tamper/rollback/expiry tests; file hash | **NOT CONFIGURED / NOT RUN** — production key and owner-signed manifest have not been verified |
| Windows Gate 3 | Exact EXE hash, version/commit, installed-app checklist, logs/screenshots, engine/network facts | **NOT RUN** on independent client |
| Owner Gate 4 | Signed acceptance of exact EXE/commit, distribution rights, publish authorization | **NOT APPROVED** |

### Existing evidence which is useful but insufficient

- `main` commit `4d63f006...`: [Build Windows EXE 39929031251](https://github.com/capquangfptminhlh/ggminh/actions/runs/39929031251), success.
- Integration Draft PR #46, SHA `7892c783ca1360645b5a398128586271ad6065ec`: [Windows EXE 39933798216](https://github.com/capquangfptminhlh/ggminh/actions/runs/39933798216), success; [Camoufox upstream smoke 39933198812](https://github.com/capquangfptminhlh/ggminh/actions/runs/39933198812), success. These are **branch CI**, not an installed-customer Gate 3 or approval to merge/publish.
- Automated regression entry points: `npm test`, `test/license-admin.js`, `test/license-online.js`, `test/license-owner-sweep.js`, `test/license-policy-integration.js`, `test/app-update-signing.js`, `test/online-update-center.js`, `test/commercial-ui-release.js`.
- Owner-only safe draft: `.github/workflows/prepare-draft-release.yml`; offline update artifact preflight: `tools/update-release-preflight.js`; true customer QA template: `docs/acceptance/gate-3-wave2.md` (historical artifact hash in that file must be **replaced** with current target, never reused).

## Stop/go rule

**GO** requires all five workstreams fully evidenced against the same release candidate, with Gate 3 accepted and owner Gate 4 signed. **NO-GO** for any missing required artifact, key, entitlement-server verification, distribution right, revoked/expiry failure, failed tamper test, Windows install failure, or unapproved code change. If blocked, fix the specific blocker; do not expand the feature set.
