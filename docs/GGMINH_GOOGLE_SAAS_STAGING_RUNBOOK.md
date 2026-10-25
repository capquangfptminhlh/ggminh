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
- `src/licensing/googleTenantStorage.js` computes a strict, symlink-resistant `google-v2-tenants/<verified Google customer UUID>/` local data root. Unit tests confirm same-PC Gmail isolation and that legacy `db.json` is never auto-copied. **main.js does not yet use this path**, so it is not a finished production tenant migration.
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

## Real Cloudflare GitHub credentials audit (2026-10-25)

- Added `.github/workflows/cloudflare-credential-audit.yml` on main; its first two read-only executions (repository-only and environment `production`) **FAILED at secret-presence guard**. Both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` resolved as empty to GitHub Actions; therefore no Cloudflare API request was attempted and no Worker/D1 changes occurred. This does **not** prove the user lacks a token elsewhere: it is not exposed under these exact secret names/scopes.
- New `deploy-google-saas-staging.yml` is a manual **PRIVATE** bootstrap only: it requires staging environment access, `PRIVATE_STAGING_ONLY` confirmation, two Cloudflare credentials, provisions a D1 called `lhm-browser-saas-staging`, runs the new schema only, and deploys an unreachable Worker named `lhm-browser-commerce-staging` with workers.dev/preview/routes disabled. It never modifies production `lhm-license-authority`, `LICENSE_DB` or `browser.lhmcrm.com`.
- Workflow currently lives only in PR #71. GitHub `workflow_dispatch` on this file requires placement on default branch after review. Do not merge entire unfinished commercial PR solely to gain access to secrets; isolate/review the workflow as needed.
- A separate **public staging activation workflow** with verified OAuth and Cloudflare Access guard has not been built; private bootstrap is not a public website.
- In GitHub Settings → Secrets and variables → Actions, provision/authorize the token and account ID in **Environment `staging`** using the exact existing names. The diagnostic jobs deliberately do not expose secret values; never paste tokens into chat or commit them.

## Electron Gmail login wired (2026-10-25 update)

- `main.js` now has **opt-in development** `LHM_GOOGLE_BROWSER_STAGING=1` with a separately provisioned Ed25519 **public key file** `LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE`. It is never read from renderer or fetched from an untrusted API, and **packaged Windows releases remain legacy by design** until a build-pinned trust key and full staging acceptance are approved.
- The renderer's existing License Center displays the Gmail panel in developer staging, allowing **Start Pair → system browser Google sign-in/6-digit approval → Claim → restart into account-specific tenant root → choose/pay → attach paid seat/refresh lease → launch profile**. Main IPC never exposes the grant or signed lease. The payment UI on the staging hostname is not yet live; this is fully wired local code, **NOT** confirmation that customers can sign up on the real site today.
- In a Gmail account, main-process `licensePolicy` blocks profile launch, profile creation, automation, Local API and background jobs unless a valid signed `ads-browser` lease permits the operation. Legacy `lhmlic1` or the 10-day trial cannot unlock Google-only workspaces.
- In development Gmail mode, `Store`, proxy credentials, automation workflows, Camoufox profile state, health and warning history use `storage/google-v2-tenants/<verified customer UUID>/`, **not** the original `storage/db.json`. Logging out clears the DPAPI grant and restarts so an earlier customer's data is not left open. Existing Preview customers have no change.
- Automated Google Electron wiring test checks trusted mode, all IPC and UI contracts, account partitioning, paid policy, and packaged-build legacy default. The already-added signed lease / pairing tests remain mandatory.
- Actual customer release gates **NOT MET:** GitHub secret audit has demonstrated missing Cloudflare token/account access in both repository and `production` environment scopes. Real Google OAuth credentials, standalone staging Worker/D1, bank approval, fixed packaged public-key anchor, and live Windows cross-Gmail acceptance are still required. No claim of production sign-in, real payment or signed installer.

### Developer smoke command (no real bank/OAuth proof)

Provision the matching **public** SPKI of your separate staging Worker signer on a trusted local development machine (never the private key). Run Electron source with these **developer-only** variables set:

```powershell
$env:LHM_GOOGLE_BROWSER_STAGING = '1'
$env:LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE = 'C:\\secure\\lhm-browser-staging-public.pem'
npm start
```

The application must fail closed when the public key is absent or invalid. A normal packaged EXE does **not** switch to Google mode based on environment variables.

## Gmail account and device revocation (staging implementation)

- The verified Google email is returned **only** when a desktop proves the one-time pairing verifier after browser approval. Windows stores the email alongside its grant/lease in Electron safeStorage and shows it in License Center; it is erased on logout. No customer email is used for the profile data-directory key (stable Google sub-backed UUID instead).
- Signed-in customers can revoke an individual active device in the web portal with explicit confirmation, valid session cookie, matching Origin and CSRF token. This marks the device's desktop grant revoked and expires its server seat in one D1 batch; audit events are recorded. Previously signed offline leases remain usable until their original expiry (up to 72h), so **immediate offline revocation is not guaranteed**.
- Electron Gmail logout now requires the server to acknowledge grant revocation before clearing its locally encrypted identity; if the network fails, the grant stays encrypted and the UI reports failure, rather than implying a successful global logout.
- The Node+SQLite full-path integration test now drives the actual Cloudflare Worker routing and SQL through the real `GoogleBrowserDesktopClient` (with a safeStorage test fixture), including Google browser approval, pairing, paid signed lease and server-acknowledged logout. It is an automated simulation, **not** evidence of live Google OAuth, actual cloud D1, Windows DPAPI or real bank funds.

## Merchant bank reconciliation operator (staging only)

A command-line review path is implemented in `tools/google-saas-admin.js` and
`tools/google-saas-billing-core.js`. The `tools/**` package exclusion keeps it
out of customer EXEs. It is pinned to **https://browser-staging.lhmcrm.com**
and rejects the production hostname.

Operators must independently match the *actual bank statement* to the
server-frozen order amount, code and transfer reference before using the
literal `BANK_STATEMENT_MATCHED` confirmation. Bank verification is not
automatic. The API records idempotent fulfillment in D1.

```powershell
# Values are configured securely in the private operator environment,
# not embedded in GitHub, Electron, screenshots or chat.
$env:BROWSER_SAAS_ADMIN_ORIGIN = 'https://browser-staging.lhmcrm.com'
node tools/google-saas-admin.js list
node tools/google-saas-admin.js approve 11111111-1111-4111-8111-111111111111 BANK-STATEMENT-REFERENCE BANK_STATEMENT_MATCHED
```

The example UUID and reference are placeholders and do not activate anything
unless they match an actual pending order. The operator host needs a dedicated
`BROWSER_SAAS_ADMIN_TOKEN` (32+ chars), plus Cloudflare Access service-token
environment values `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` when
the `/v2/admin/*` Access rule is enabled. Never print, paste or commit credentials.
Manual Access setup and real financial reconciliation are **still deployment blockers**.

Synthetic regression `test/google-saas-billing-admin.js` checks disabled
unconfirmed purchases, no production hostname fallback, Access credential
completeness, expiry rejection and redaction of secret tokens.
