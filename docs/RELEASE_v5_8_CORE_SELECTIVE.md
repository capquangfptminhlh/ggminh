# LHM Ads Browser v5.8.0 — selective core preview

Status: **PREVIEW / NOT PRODUCTION READY**. Based on `main` v5.7 (77075f3); source reviewed at Camoufox branch a9c2115.

## Included
- Per-profile Engine Factory, Camoufox native/manual and lab-gated Playwright controller with fail-closed lifecycle.
- Independently publisher-verified Camoufox install/runtime, signed bundled browser staging, explicit user consent.
- Signal Chain preflight, proxy validation, local opt-in health drift and manual IPv4 /24 + temporal risk review.
- Windows regression, installer smoke, Electron engine UI capture, and scope assertions.

## Explicitly excluded
Team/Cloud Sync/Cloud Service, Navigation Synchronizer, agency approval ledger, retry/backoff BehaviorEngine, SQLite migration preview, and payment-risk analytics. Prior experimental source branches are retained.

## Release blockers
Installer lacks LHM-approved redistribution-signed Camoufox runtime, independent live authenticated proxy/DNS/WebRTC testing, clean installed Windows machine acceptance, secure signed update and customer-grade publishing checks. The upstream compatibility smoke does not certify commercial readiness, leak freedom, or site-identification outcomes.

The historical `docs/RELEASE_v5_8_PREVIEW.md` belongs to the earlier integrated Cloud/Synchronizer branch and is not carried into this selected core release.
