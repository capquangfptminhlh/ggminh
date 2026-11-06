# LHM Update Publisher — public trust anchor

**Production:** place the release operator's Ed25519 **PUBLIC KEY**
as `update-publisher-ed25519.pub` in this folder before building the
official Windows installer. PEM/SPKI format expected.

Do not commit or package any private signing key or passphrase.
Do not use the license-signing key for update manifests.

Provisioned 2026-11-06: `update-publisher-ed25519.pub`, SPKI SHA-256
`38f6fa46737e0aac141c05c62597def7fb016bcac332c0cd7fdf0ea13456f228`
(pinned by `test/update-trust-anchor.js`). The encrypted private key and
its passphrase stay with the owner, outside this repository.

The main application installs this folder into
`resources/lhm-update-publisher/`. This README is not a trust anchor.
See `docs/LHM_SIGNED_ONLINE_UPDATES.md` for release instructions.
