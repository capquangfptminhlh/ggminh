# LHM Update Publisher — public trust anchor

**Production:** place the release operator's Ed25519 **PUBLIC KEY**
as `update-publisher-ed25519.pub` in this folder before building the
official Windows installer. PEM/SPKI format expected.

Do not commit or package any private signing key or passphrase.
Do not use the license-signing key for update manifests.

This repository intentionally contains NO production update public key.
Until it is provisioned, the in-app Update Center reports
`not-configured` and cannot fetch, download or install updates.

The main application installs this folder into
`resources/lhm-update-publisher/`. This README is not a trust anchor.
See `docs/LHM_SIGNED_ONLINE_UPDATES.md` for release instructions.
