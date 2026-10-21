# LHM Agency Safety Controls — experimental

These controls are **operator risk-management tools** for assets the
organization has permission to manage. They do not estimate Google's
internal account-linking score and cannot grant access to Google Ads or Gmail.

## Module C: GraphDefense

- `getSubnet24()` returns a normalized IPv4 /24 for manual examination.
  IPv6 is intentionally rejected rather than silently converting its format.
- `checkSubnetRisk()` reports a concentration of *different known internal
  profiles* on the same /24. One profile with several log entries counts once.
- `checkTemporalRisk()` reports sessions that overlap on the same /24; a
  single shared ISP subnet does not establish common owner or maliciousness.
- `checkPaymentRisk()` **does not** flag account identity based on the first
  6–8 digits of a card. That number identifies an issuer range and is not a
  unique card identifier. Do not store the BIN, PAN, expiration or CVV.
- For authorized internal double-billing review, compare only opaque
  provider-issued instrument references that are HMAC-SHA256 hashed using
  a protected key. Never submit raw card details or the master key to UI.

The UI's **Profile Health → Agency Operations** section accepts manually
supplied exit IPv4 entries (`profile_id|IPv4`). It does not infer the exit IP
from the SOCKS5 proxy's hostname, collect background browsing data or
persist the entered IPs. If an exit address is unverified, results have
limited value. The temporal utility is available for future authorized
resource scheduling; automatic session/network tracking is not active.

## Module B: MaturationEngine

This is an **agency onboarding approval ledger**, not a fictitious maturity
score for an online account. A trusted local operator must explicitly confirm
an approval for policy review, authorized billing, asset ownership, campaign
review and network review. Revoke keeps the earlier audit record and records
the revoker and time. All data stays in the application's local data folder
in `profile-approvals.json` (not uploaded by the Cloud Sync metadata MVP).

Completing five internal approvals means only that this agency's checklist
is complete. It does **not** authorize creation of Gmail accounts, guarantee
Google Ads policy eligibility, or automate an account warm-up.

## Module A: BehaviorEngine

Despite the name retained from the requested interface, it is a transparent
**bounded retry/backoff controller**. It only waits after recognized
`rate_limit`, `service_busy` and `resource_budget` conditions. Jitter is
used to prevent simultaneous request storms, not to imitate nervous-system
mouse movements, typing cadence or CAPTCHA user behavior. It never sends
mouse, key or scroll events.

## Database and commercial-readiness status

The application currently stores profile data in a local JSON store. The
`db/schema-agency-proposal.sql` file is an **unapplied schema proposal** for
an eventual SQLite migration. It replaces proposed card BIN storage with
HMAC-hashed payment-provider references. It does not silently convert the
existing customer database, and doesn't imply SQLCipher/full-disk encryption
has been implemented.

Before commercial release, provide an atomic migration + backup/rollback,
native Electron SQLite compatibility, concurrent writer tests, operator
authentication, durable audit policy, 30-day session-log retention enforcement
and independent privacy/security review. Release binaries also remain
unsigned until a verified signing pipeline is available.

## Tests

- `node test/agency-safety-controls.js`: IPv4 parsing, overlapping time
  windows, billing issuer-range limitations, provider reference hashing,
  operator-approved milestones, revocation and bounded backoff.
- `node test/agency-safety-ui.js`: Health Center wiring and IPC surface.
- All tests also run in the Windows CI workflow.

No client behavioral surveillance, IP collection or payment-card data is sent
to a central service.
