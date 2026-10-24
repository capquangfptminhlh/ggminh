# License authority bundled transport config (PUBLIC, no secrets)

This folder ships into the Windows installer as `resources/lhm-license-authority/`.
`authority.json` is deliberately **disabled** in Preview until the
Cloudflare production license service and clean Windows licensing Gate 3 pass.

Once the owner confirms:
- `https://browser.lhmcrm.com/health` is HTTPS 200 with D1 and correct Ed25519 issuer trust;
- the issuer public key matches the **compiled** `src/licensing/manager.js` trust anchor;
- license register, verify, renew, revoke and outage/restart pass on a clean Windows PC;
- owner approved a new exact-commit installer and published its SHA-256;

only then approve a release-specific config change:

```json
{
  "schema": "lhm.license-authority-config.v1",
  "enabled": true,
  "endpoint": "https://browser.lhmcrm.com/v1/verify"
}
```

The server URL is PUBLIC metadata. Never put secrets (private key, bearer
admin token, customer license token, D1 credentials, API token) in this folder.
Only this reviewed HTTPS hostname/path is permitted; an arbitrary renderer
input, customer-created JSON or environment override does NOT select a
server in packaged Windows builds. The app still cryptographically checks
Ed25519 receipts before granting an entitlement.

The ordinary GitHub CI Windows build continues to ship the disabled
Preview config until owner changes this exact file in a reviewed commit.
**Do not change this file on a customer's installed system to bypass
production approval.** An already-built installer cannot be retroactively
configured by deploying Cloudflare.
