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

## New staged production-readiness and pairing abuse guards (2026-10-25)

1. The anonymous `/v2/desktop/pair/start` endpoint now needs a trusted
   `CF-Connecting-IP` provided by the Cloudflare edge (no fallback to an
   untrusted forwarded client header). Its per-IP/10-minute rate counter is
   stored as an HMAC digest in `desktop_pair_limits_v2`; no raw IP is written.
   Client-hash rotation cannot evade the 20-start quota. Keys older than one
   day are removed lazily. Run staging behind Cloudflare and include the
   current additive `0003_google_saas_staging.sql` migration.
2. The authenticated `GET /v2/admin/readiness` reports only booleans for
   D1 tables, Google OAuth configuration, bank transfer fields, signing-key
   consistency, session secret and owner-approved pilot plan. It requires
   `BROWSER_SAAS_ADMIN_TOKEN`; no underlying secret, account or D1 UUID is
   returned. It is a **configuration check**, not evidence of a real Google
   sign-in, real bank transfer, Cloudflare Access policy or Windows acceptance.
3. Run `node tools/google-saas-admin.js ready` from the private merchant
   workstation after configuring secret environment variables, to see which
   gates remain blocked. A disabled plan will display not-ready until the
   owner has approved the exact limits and enabled it; do not silently
   enable or sell the plan.
4. Electron warning-history initialization must pass
   `{storageDir:customerStorageDir}` (a *named option*, not the similarly
   named variable shorthand); this now preserves warning history in the
   correct Gmail tenant workspace.

## Windows sleep recovery and permanent explicit device replacement

- Explicit device takeover now expires the chosen active seat **and revokes its old desktop grant in the same atomic D1 batch**. The replaced PC cannot later attach a free seat with that previously paired grant. The owner must approve a fresh 6-digit Gmail pairing to restore that computer. This closes a race in the earlier two-seat policy.
- `GoogleBrowserDesktopClient.renewOnline()` restores a paid seat after a **normal 10-minute idle/Windows sleep timeout**, provided the original desktop grant has **not** been revoked and the customer's subscription remains valid. If no free online seat is available, the user must select a machine for explicit replacement; the client never bypasses the two-seat rule.
- Once online again, successful heartbeat now refreshes the paid Ed25519 lease **even if the previous offline lease has expired**. The server remains the only issuer; no legacy-trial fallback and no extension of the old offline signature. A revoked or blocked grant still fails closed and clears the cached lease.
- Staging tests verify a displaced machine receives `DESKTOP_GRANT_INVALID` (HTTP 401) for renewal, issue and reattach; desktop fixture tests verify 72-hour lease expiry, online subscription recovery, and sleep reattach without re-pairing.
- This is tested via automated SQLite D1 + mock safeStorage: it has not been exercised with real Windows sleep/resume or live Cloudflare yet.

## Isolated packaged Gmail Windows STAGING installer (manual-only)

A real standalone Windows Gmail staging installer now has a separate
build path. It does **not** replace the normal Preview, share Preview
userData, or obtain license rights from the old `lhmlic1` trial:

- `npm run build:win` checks that no Gmail generated trust or staging
  builder config is present; standard Preview is therefore **unchanged**.
- `tools/prepare-google-staging-package.js` takes only a **PUBLIC**
  Ed25519 SPKI (DER/base64) and a separately approved SHA-256 fingerprint.
  It generates the runtime trust module inside `app.asar` and an
  Electron-builder config with distinct `appId`, product name and NSIS
  artifact name. The private key stays in Cloudflare Worker secrets.
- The packaged Gmail app uses its own
  `%APPDATA%/LHM Ads Browser Gmail Staging` data root **before**
  Electron acquires its single-instance lock. Google customer profile
  subdirectories remain nested under this separate root. It never copies
  Preview cookies, profiles, login or proxy files.
- `npm run build:google-staging:win` is **not** run by the legacy
  Windows job. Its manual GitHub Actions workflow
  `.github/workflows/google-staging-windows.yml` is available only
  on reviewed `main` and requires typed
  `BUILD_GMAIL_STAGING_ONLY` confirmation. It uses the `staging`
  GitHub Environment and checks private readiness plus the publicly
  configured plan **before building**. It does not tag or publish a release.
  The output EXE is retained for internal staging testers for 7 days.
- Required GitHub staging configuration, values **never printed**:
  `BROWSER_LEASE_PUBLIC_SPKI_B64` (public key only, GitHub secret),
  `BROWSER_LEASE_PUBLIC_SPKI_SHA256` (GitHub Environment variable,
  64-hex fingerprint), `BROWSER_SAAS_ADMIN_TOKEN` (private admin token);
  optionally Cloudflare Access service credentials if admin is protected.
  Live Worker / D1, configured OAuth credentials, real bank details and
  owner-approved plan must already be verified.
- The PR workflow `google-lease-contract.yml` now also builds an actual
  Windows installer using **a disposable public test key** on the
  GitHub Windows runner, checks the app.asar fingerprint, then destroys
  the binary. **That EXE is never offered for download or sale.**
  Live OAuth / bank / DPAPI / customer-paid transactions remain separate
  acceptance requirements.

The build-pinned public signing key is NOT Windows code signing. The owner
previously opted out of Authenticode signatures. These are two distinct
security concepts: the first validates Cloudflare-issued paid leases
cryptographically; the second would establish the Windows publisher identity.

**Current status: not deployed.** Previous read-only GitHub Actions tests
found missing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in
repository and `production` scopes; the `staging` Environment needs
explicit configuration or grants. Nothing is published automatically.

## Worker ↔ Windows signer fingerprint parity

Authenticated `GET /v2/admin/readiness` returns the SHA-256 fingerprint of
the **public** Ed25519 SPKI only after proving the Worker signing private/public
pair matches. The private key is never returned. In merchant CLI
`node tools/google-saas-admin.js ready`, setting
`BROWSER_LEASE_PUBLIC_SPKI_SHA256` to the **independently approved**
lowercase 64-hex fingerprint enforces exact equality with the live Worker
fingerprint. A mismatch blocks the manual Windows Gmail build before the
public key is embedded, preventing an installed app from accepting leases
issued by a different staging signer.

This readiness check is necessary but not sufficient for a customer launch:
real Google OAuth, paid bank fulfillment, and Windows DPAPI/session tests
must pass separately. Do not enable a paid plan by assumption.

## Public staging deployment — manually gated and NO sales (2026-10-26)

The new `.github/workflows/google-saas-public-staging.yml` is designed
for the NEXT operation after private bootstrap, and is **not** proof
that browser-staging.lhmcrm.com is reachable now.

- It runs `test/google-admin-access.js` and checks staged Worker/D1
  **before** exposing a custom hostname.
- `tools/browser-saas-staging-public-preflight.mjs` confirms the
  separate `lhm-browser-saas-staging` D1 exists, differs from the
  legacy LICENSE_DB, and still has the disabled `personal_30`
  pilot (`enabled=0`, `max_profiles=NULL`). It also requires
  the Worker to have 11 explicitly named required secrets;
  no secret values are fetched, printed or committed.
- The manual publish command uses the exact confirmation
  `PUBLISH_PUBLIC_STAGING_NO_SALES` on reviewed `main`,
  the `staging` environment, and deploys only
  `browser-staging.lhmcrm.com`. It verifies live HTTPS,
  public empty plans, denied unauthenticated admin access, portal
  rendering and Google OAuth's start redirect.
- **Admin hardening:** `/v2/admin/*` now requires *both*
  a Bearer SaaS secret and an actual Cloudflare Access RS256 JWT
  with a pinned Access team issuer and Application AUD. The
  Worker verifies the JWT against the team's Access JWKS.
  A missing Access policy, forged/mismatched JWT, invalid
  issuer, stale assertion or incomplete Access config fails
  closed. Add staging-only `BROWSER_SAAS_ACCESS_TEAM_DOMAIN`
  and `BROWSER_SAAS_ACCESS_AUD` as Wrangler secrets.
  Operators additionally configure `CF_ACCESS_CLIENT_ID`
  and `CF_ACCESS_CLIENT_SECRET` as workstation/Actions-only
  credentials to pass the Access gateway.
- **No customer payment in this stage.** Do not change
  `plans_v2.enabled` or `max_profiles` merely to satisfy a
  build gate. Validate real Google OAuth, real Windows DPAPI
  pairing and actual bank settlement before activating sales.

**Current blocker:** GitHub Actions earlier reported empty
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
in repository and `production` contexts. Configure or grant the
same exact secrets to the **staging** Environment, with the
Cloudflare API token scoped to the correct account and Worker,
D1 and custom-domain permissions. The worker and domain cannot
be deployed from this PR alone: manual workflow dispatch requires
a reviewed file on the default branch. Do not merge the whole
unfinished commercial PR just to obtain deployment permissions.
