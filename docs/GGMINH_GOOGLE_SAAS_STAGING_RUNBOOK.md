# GGMINH Google commerce staging — implementation and operator runbook

**Date:** 2026-10-25 · **PR:** #71 · **Product:** ads-browser only · **Status:** STAGING CODE / NOT DEPLOYED
**Never merge or deploy to customer production based solely on CI.**

## What exists on this PR

1. Existing production-facing legacy /v1 license authority is unchanged. New routes are isolated behind the literal Worker variable BROWSER_SAAS_STAGING=enabled. Otherwise /v2/* returns 404.
2. Additive D1 migration 0003_google_saas_staging.sql. The personal_30 record is 499,000 VND, 30 days, 2 sessions, **enabled=0 and max_profiles=NULL**. No purchases until an authorized operator deliberately fills the capacity and enables it.
3. Secure Google OIDC authorization-code callback with state, nonce, PKCE S256, RS256 Google JWKS signature, issuer/audience/expiry/email verification, subject-first customer matching, 7-day HMAC-signed HttpOnly Secure SameSite=Lax session cookie, Same-Origin + CSRF controls on customer writes.
4. Same-origin responsive web checkout at /v2/portal; a Content-Security-Policy allows only self-hosted JS. Profile data/proxies/cookies do not leave the Windows client.
5. Server-computed VietQR payment details using a verified configured BIN/account and bank name. Customer orders snapshot the plan and expire after 48 hours. No bank integration or auto approval is claimed.
6. Admin Bearer-authorized /v2/admin/orders and /v2/admin/activate. Operator must verify the transfer in the actual bank statement before submitting bank reference. D1 transaction applies a single-use approval nonce, reviews and audit; duplicate same-reference approval is idempotent and cannot extend twice.
7. SQLite test harness applies the original two migrations plus the new migration, tests default-off, OIDC signature/PKCE flow, CSRF, disabled plan, checkout, manual approval and idempotent renewal. The old signed license regression tests remain mandatory.

## Required staging setup (operator only)

- Provision a **separate staging D1** for BROWSER_SAAS_DB; do not use, overwrite or rename the production LICENSE_DB. Apply the 0003 migration in staging only. The migration does not delete or rewrite the legacy licenses or portal_orders tables.
- Deploy on a separate staging hostname, not browser.lhmcrm.com yet. BROWSER_GOOGLE_REDIRECT_URI must equal https://STAGING-HOST/v2/auth/google/callback **exactly**. Register the exact redirect URI in Google Cloud OAuth consent screen.
- Set BROWSER_SAAS_STAGING=enabled only for isolated staging. Configure BROWSER_GOOGLE_CLIENT_ID, BROWSER_GOOGLE_CLIENT_SECRET and BROWSER_SESSION_SECRET (random 32+ chars) in Worker secrets; restrict secret access. Do not commit them or paste them in tickets.
- Set BROWSER_BANK_BIN (six numeric digits), BROWSER_BANK_ACCOUNT_NO (6–20 digits) and BROWSER_BANK_ACCOUNT_NAME on staging after verifying with the account owner. The bank image uses img.vietqr.io; compare the rendered amount, beneficiary and payment code with the actual bank statement.
- Use LHM_LICENSE_ADMIN_TOKEN for the staging admin Bearer check, provisioned as a separate staging-only credential. The /v2/admin/* path also needs **Cloudflare Access** and audit before any real-money rollout. Never send the admin Bearer token to browsers used by paying customers.
- Before opening sales, approve product's max_profiles and features. Set max_profiles explicitly, THEN enable a plan. Do not use unlimited as an undocumented default.
- Endpoint smoke: GET /v2/plans -> empty when disabled; GET /v2/portal -> web UI; Google sign-in -> GET /v2/auth/session; POST /v2/orders with origin + x-csrf-token -> pending; admin bank-verified POST /v2/admin/activate -> paid; identical replay -> idempotent; different reference -> 409; verify expiry and legacy /v1 tests.

## Fail-closed behavior

- Unset/disabled BROWSER_SAAS_STAGING => /v2/* 404.
- Missing D1/OIDC session/bank configuration => 503; does not create fake orders/QR.
- Unapproved profile count/disabled plan => cannot buy.
- Missing verified Google session => 401. Missing matching Origin/CSRF => 403.
- Creating an order NEVER unlocks software. Only bank-verified admin fulfillment creates the entitlement.
- Existing Preview/legacy trial remains unchanged, meaning **the Windows client is NOT yet in commercial Google-only mode**.

## Implemented staged desktop authorization since PR #71 initial baseline

- `googleDevice.mjs`: Windows initiates pairing with a SHA-256 verifier hash and random client identity, receives a six-digit comparison code, then customer confirms after Google OIDC through `/v2/desktop/pair/`. Incorrect codes have limited attempts. Claim rotates a unique grant (only its SHA-256 stored in D1); replay is rejected.
- `/v2/seats/attach|list|heartbeat|takeover` enforces max two active server seats, ten-minute idle TTL and five-minute heartbeat. A third online device receives `409 SEAT_LIMIT`; takeover requires a selected seat and literal `REPLACE` confirmation. All seat queries scoped to the customer's grant or session.
- `/v2/leases/issue` signs the canonical Ed25519 `ads-browser` lease with a **new** staging signer, configured in Worker secrets as `BROWSER_LEASE_PRIVATE_PKCS8_B64` and `BROWSER_LEASE_PUBLIC_SPKI_B64`; the latter key MUST be pinned into any distributed commercial Windows build. No signing private key enters Electron or public Git.
- `src/licensing/googleDesktopClient.js` provides a **main-process only**, isolated optional Windows integration module. It uses Electron `safeStorage` (Windows DPAPI) and refuses operation if secure encryption is unavailable. Staging unit tests exercise a safeStorage fixture, clock rollback, encrypted grant persistence, fixed-host API calls, owner-selected takeover, profile capacity and 72-hour offline expiry. This module **is not yet wired into main.js/preload.js**; Preview keeps its existing enforcement.
- `googlePairPortal.mjs` serves a CSP-protected, responsive pairing approval UI; Google callback can only return to the allowlisted pairing path. No browser profile/cookie/proxy data is uploaded.

### Additional staging secrets

Provision `BROWSER_LEASE_PRIVATE_PKCS8_B64` and `BROWSER_LEASE_PUBLIC_SPKI_B64` as a separately generated Ed25519 keypair in staging Worker secrets. Retain/rotate in controlled secrets management. Do not reuse the v1 license signer. The production Windows binary must pin the public SPKI exactly; a dynamic key supplied by the API/renderer is not a trustworthy anchor.

## Remaining release blockers

- Deploy and test the now-implemented pairing, grant, seat and lease APIs against real isolated Cloudflare D1/Google OAuth. Electron main-process wiring, real safeStorage DPAPI and released-build pinned signer verification remain incomplete.
- Wire a commercial-only main-process policy to gate EVERY profile/launcher/Local API/automation IPC operation; isolate local workspaces by Google customer. Avoid changing preview until tested.
- Customer UI device-management and admin web controls for refunds, grant, revoke, audit, payment reconciliation; Cloudflare Access policy; owner-approved plans.
- Real Google OAuth and VietQR/payment reconciliation against a real staging bank, D1 staging migrations with backup/rollback, Win10/11 and signed update acceptance, security review, commercial terms/privacy.
- **Policy conflict:** 600s server heartbeat/seat TTL and up-to-72-hour offline leases do not mathematically ensure only two active offline devices. Either state this limitation transparently or change the entitlement/seat policy with explicit customer expectations. An offline signed lease cannot be revoked instantly.
- The code is intentionally not a complete production SaaS. Passing unit tests is not evidence of live deployments, actual transfers, or Windows acceptance.

## Rollback

Disable BROWSER_SAAS_STAGING on staging (all new v2 endpoints return 404), revoke test credentials and retain staging D1 for audit. No profile/cookie migration or legacy /v1 rollback should be necessary because this branch changes neither existing customer data nor the legacy license contract.
