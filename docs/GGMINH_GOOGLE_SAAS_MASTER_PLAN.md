# LHM Ads Browser — Google SaaS + VietQR architecture (staging specification)

**Repo:** `capquangfptminhlh/ggminh` · **Web:** `browser.lhmcrm.com` · **Product scope:** `ads-browser`
**Status:** Design and implementation gates only; NOT a deployed or certified commercial release.

## Nonnegotiable product decisions

- Commercial Windows application: sign in **only with verified Google OIDC** (Google `sub` is the durable identity). No customer password, activation key or permanent hardware lock.
- Paid **Personal: 499,000 VND/30 days for 2 concurrent device sessions**. The 180-day (2,545,000 VND) and 365-day (4,491,000 VND) plans require active sales flags. Team = 5 seats; price and launch not approved.
- **Seat limit is not profile count.** Legacy plans impose profile limits/features. Browser Personal's `max_profiles` and feature map MUST be approved before sale, never guessed or set to unlimited by implementation.
- Invoice/payment: VietQR with server-calculated amount and unique payment code; admin manually verifies the real bank credit and **atomically approves+activates**. No key sent to commercial customer.
- `attach` returns **409 SEAT_LIMIT** when full. Only user-confirmed `takeover` displaces one of the sessions. Heartbeat 300s, TTL 600s. No browser fingerprint or permanent machine ID on the server.
- Hard lock after expiry/revocation/blocked; preserve encrypted local profile/session data. Signed Ed25519 desktop lease valid at most 72h and never beyond subscription expiry. Offline revocation cannot take effect until the prior lease expires; disclose this.
- Customer owns all profiles/cookies/proxy credentials and browser sessions **on device only**. Cloudflare receives only customer identity, orders, product scoped entitlements, hashed random client IDs, seats, audit and updates metadata. Never Ads account IDs/tokens, proxy data, session dumps, URLs or browser fingerprints.
- Keep **Electron/Node** and existing Chromium/Firefox/Camoufox. Do NOT copy Ads AI's Python/FastAPI runtime or browser PWA Ads features. The web site is a customer commerce portal plus admin/desktop approval, not a cloud browser.
- One customer can purchase `ads-browser` and `ads-ai` separately. **Never** treat a subscription for one product as valid for the other.
- Only staging until owner approves production. Existing legacy installation licenses must keep working during cutover; do not migrate or overwrite profiles without customer-approved backup/transfer.

## Grounded repo mapping

| Existing component | Path | Strategy |
|---|---|---|
| Main-process trust boundary | `main.js`, `preload.js` | Introduce allowlisted IPC login/lease APIs, enforce rights in main |
| Profile storage | `src/db/store.js` | Keep local metadata/profile paths; namespace per Google customer after explicit migration |
| Engines | `src/engine/browserLauncher.js`, `EngineFactory.js`, `camoufoxAdapter.js`, `CamoufoxPlaywrightController.js` | Preserve, regression-test; no billing changes inside engine |
| Local API | `src/api/server.js` | Main-process entitlement still mandatory even when API key is valid |
| Automation/background | `src/automation/*` | Independently check entitlement per job; stop new work on license lock |
| Legacy Ed25519 license | `src/licensing/manager.js`, `receipts.js`, `onlineVerifier.js`, `enforcement.js` | Preserve the `lhmlic1/lhmproof1` contract; new Google/seat signed format separate |
| Admin/commerce server | `serverless/license-worker/src/index.mjs`, `adminPortal.mjs`, `adminPage.mjs`, `adminClient.mjs` | Add independent `/v2/*` OAuth/commerce routes; **never break `/v1/verify`** |
| Cloud deployment | `serverless/license-worker/wrangler.toml.example` | Separate staging worker + D1; no secrets or real binding IDs in repo |
| UI | `src/ui/licenseCenter.js`, Electron renderer | Replace key form with Google pairing + plans in commercial build only |
| CI | `.github/workflows/windows-exe.yml`, `test/run-all.js` | Keep all existing tests, add contract, D1, Windows and staged E2E suites |

## Target architecture

```text
Google login through SYSTEM browser
             |
 browser.lhmcrm.com (Cloudflare)
 +---------------------------------------------------------------+
 | Web: Google Login / Plans / VietQR / Pair approval / My devices|
 | Worker v2: OAuth (code+PKCE), orders, seats, signed leases      |
 | Admin: Cloudflare Access, approval, entitlement, expiry, audit |
 | D1: commerce/control-plane data; R2: signed installer/updates  |
 | Legacy v1: unchanged until users migrate                       |
 +---------------------------------+-----------------------------+
                                   |
                    metadata + desktop grant + signed seat lease
                                   |
          Electron Main Process (verified entitlement)
                        /                    \
                Local browser profiles     Local API / automation
          Chromium / Firefox / Camoufox    Proxy vault and backups
             ALL CLIENT-DEVICE ONLY
```

## Customer & security flow

1. New commercial EXE creates random pairing verifier, sends SHA-256 proof to `POST /v2/desktop/pair/start`; shows one-time 6-digit comparison code.
2. Electron `shell.openExternal` can open **only** `https://browser.lhmcrm.com/desktop/pair/?id=<UUID>`; never embed Google login inside Electron; never accept arbitrary renderer URLs.
3. Browser logs in via server-side Google Authorization Code + PKCE, state, nonce, Google JWKS JWT signature, issuer/audience/expiration/email_verified checks. HttpOnly Secure session cookie. Resolve account by Google sub FIRST, normalized Gmail alias only for unlinked initial customer.
4. If unpaid, GET `/v2/plans` and POST `/v2/orders`; the backend snapshots plan price/duration/seats, creates unique payment code and 48-hour pending order; VietQR correctly encodes bank/amount/payment_code. Missing verified bank configuration => 503, no fake QR.
5. Admin protected by Cloudflare Access compares actual bank statement and submits transfer reference. One atomic/idempotent D1 fulfillment approves and creates/renews exactly one active Browser entitlement; audit.
6. Customer approves pairing in browser after visually comparing code; PC `claim` with original verifier. Desktop grant stored encrypted using Windows `safeStorage`/DPAPI only. Pairing can be claimed once.
7. PC `attach` acquires seat; full => 409 + list of generic labels, human confirms exact seat to replace; no silent eviction. `heartbeat` renews only existing seat.
8. Cloudflare signs an Ed25519 lease with `audience=lhm-ads-browser-windows`, `product_code=ads-browser`, customer/seat/client hash, features/maxProfiles, issue time, subscription expiration, `valid_until=min(now+72h,expiry)`. Electron verifies signature/issuer/audience/product/client/time **in main process**. Persist max-seen time to detect >5-minute clock rollback.
9. Main IPC, Local API, profile launcher, background scheduler, Automation and exported data operations are all default-deny when entitlement inactive. Only login/payment/renewal/logout/signed updates/support and deliberate local-delete remain available. Never delete customer data because subscription expires.
10. Profile data must be **tenant-isolated on the same PC** by authenticated `customer_id`; existing legacy folders can only be transferred with consent, backup and audit. A different Gmail cannot inherit an earlier user's cookies/profile workspace.

## v2 API

`/v2/auth/google/start`, `/callback`, `/v2/auth/session`, `/v2/auth/logout`;
`GET /v2/plans`; `POST /v2/orders`; `GET /v2/orders/current`; `POST /v2/orders/cancel`;
`POST /v2/desktop/pair/start|approve|claim`;
`GET /v2/devices`; `POST /v2/seats/attach|heartbeat|takeover`; `POST /v2/leases/issue`;
`/v2/admin/orders|activate|grant|customers|expiring|plans|devices`.
Legacy `/v1/verify` and related routes stay live while old users remain.

**Response contract:** 401 SIGNIN_REQUIRED; 402 SUBSCRIPTION_REQUIRED, PAYMENT_PENDING, SUBSCRIPTION_EXPIRED; 403 ACCOUNT_BLOCKED, LICENSE_REVOKED, PRODUCT_MISMATCH; 409 SEAT_LIMIT, SEAT_REPLACED; 503 missing OAuth/bank/D1 config.

## Database migration (staging first; all additive)

New tables: `customers_v2` (google sub, email key), `plans_v2` (product, duration, profile capacity, seats, features, price, enabled), `orders_v2` (payment code, frozen plan data, 48h TTL, payment reference), `entitlements_v2` (one active per customer/product), `license_seats_v2`, `desktop_pairings_v2`, `desktop_grants_v2` (hashed secrets), `payment_reviews_v2`, `audit_events_v2`. Verify existing D1 migrations and protect `licenses`, `portal_orders`. Migration run against **separate staging D1** with seeded old records. Production D1 backup + rollback plan required before application.

## Implementation sequence

1. **G0 baseline:** contract doc, CI baseline and legacy compatibility; stage separate Worker/D1 and feature flag (default current Preview). Build/engine regression must stay green.
2. **G1 Worker v2:** D1, Google login, manual VietQR orders, one-click admin fulfill, pairing, seat/takeover, signed leases; race/CSRF/OIDC tests.
3. **G2 customer web + admin:** responsive Gmail/plan/QR/pending/devices/renewal + Cloudflare Access-protected operations; Chromium staging E2E.
4. **G3 Windows Electron:** new `src/licensing/google*` and `verifiedLease.js`, safeStorage, account-specific local store, main/IPC/API/background enforcement, login/expiry UI, signed update path; never regress Chromium/Camoufox.
5. **G4 pilot rollout:** signed builds, R2, legacy customer migration dry-run and consent, Win10/11 + 3-device tests, offline 1h/72h/80h, clocks, purchase/renew/revoke.
6. **G5 commercial release:** owner-approved secrets, pricing/profile caps, Cloudflare Access, bank details, repo private, release + rollback; no automatic production deploy.

## Acceptance gates — all currently NOT_RUN for this new architecture

B01 legacy `/v1` + installer still work; B02 unpaid cannot start profile/API; B03 true QR+bank-reference approval; B04 Google subject normalization/conflicts; B05 2 seats and explicit 3rd takeover; B06 different Gmail same machine isolated; B07 72h max offline and no post-expiry grace; B08 revoked/expired blocks every IPC/API/job; B09 Chromium/Firefox/Camoufox profile regression; B10 no Ads/proxy/session data on Cloudflare; B11 signing+updates, Win10/11 independent acceptance; B12 idempotent D1 approval and no double seat; B13 ADS-AI product license cannot unlock BROWSER.

**Owner decisions required before commercial enablement:** Personal plan's **maxProfiles/features**, fate of existing 10-day trial (legacy preserved by default), production Google OAuth client, verified bank config, terms/privacy/refund, staging test devices and explicit production go-ahead. Never transmit secrets in chat/Git.

**Reporting:** every phase supplies commit, PR, CI test PASS/FAIL/NOT_RUN, staged deployment evidence, blockers. CI green is not a real Cloudflare/Windows commercial acceptance.
