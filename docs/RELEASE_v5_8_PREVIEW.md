# LHM Ads Browser v5.8.0 — Integrated Preview

**Build classification: PREVIEW / NOT PRODUCTION READY.**

This Windows preview brings together:
- v5.7 full-width workspace, accessible keyboard command palette, motion controls.
- Isolated Chrome/Edge and Firefox profile launch, Local API, Proxy Center and
  approval-gated Automation Studio from prior releases.
- **Synchronizer Lite**: user-initiated selected Chromium master-tab HTTPS
  navigation to new tabs in selected running follower profiles, exact allowed
  hosts, 15-event limit, explicit stop. Windows CI now tests two real
  independent Chromium profiles and an actual master tab navigation.
- **Team MVP** (self-hosted server): owner/admin invitation, verified-email
  identity binding to administrator-provisioned bearer-token accounts, roles,
  member revocation, device enrollment/revocation, scoped audit events.
- **Cloud Sync MVP** (self-hosted): AES-256-GCM encrypted metadata only,
  manual push, preview, revision-checked local import, revision history up to
  25 backups, explicit encrypted history restore.
- Each Cloud user account needs an administrator-provisioned token;
  each authorized device also needs its own one-time device key. No browser
  sessions, cookies, passwords, private URLs, fingerprints, proxy secrets or
  2FA data are transferred to Cloud.

## Windows download

GitHub Actions on the `release/v5-8-integrated-preview-20261021` branch
contains:
1. `LHM-Ads-Browser-Windows-x64` — Windows installer artifact.
2. `LHM-Workspace-UI-Preview` — screenshots from an actual Electron
   instance, including Cloud Sync and Synchronizer dialogs.
3. `LHM-Cloud-Service-v5.8.0` — standalone server package ZIP, **not**
   bundled into customer EXE. Requires Node 22+, your private TLS certificate
   and server-side actor configuration; see `docs/CLOUD_SERVICE_MVP.md`.

The service package is **not** a hosted subscription service. It does not
provision or start a publicly reachable HTTPS server by itself. Customers
keep their browser data and ad sessions on their own machines.

## Not 100% AdsPower parity

- No source-level browser-native fingerprint identity virtualization;
  do not advertise that websites cannot identify or flag a profile.
- No full click/type/scroll multiwindow mirroring or all-browser window parity.
- No production IdP/MFA/passkeys, automated user provisioning or billing
  gateway tied to Cloud subscription entitlements.
- No multi-replica transactional Cloud database, tested hosted production
  service, offline automatic sync or cross-physical-device beta acceptance.
- No full Firefox extensions, mobile Cloud Phone integration or partner
  marketplace.
- No security audit/pentest from an independent party.

## Release acceptance

- Mandatory Windows workflow: npm test, real Win32 window helper smoke,
  real Chrome/Edge profile smoke, real two-Chromium navigation sync,
  actual Electron UI screenshots, Windows installer and Cloud package.
- Before public production release: deploy secure identity service,
  enable MFA, operate a transactional datastore, validate in 2 physical
  Windows machines and a separate network, run threat modeling and
  role/tenant isolation penetration tests, sign the installer and publish
  secure update/revocation procedures.
- Continue tracking detailed requirements in `docs/FEATURE_PARITY.md`.
