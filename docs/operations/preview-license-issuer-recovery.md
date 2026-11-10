# Preview License Issuer Recovery

The Preview issuer's encrypted private key and passphrase DPAPI material live beneath `%LOCALAPPDATA%`. DPAPI uses `CurrentUser`, so this material is bound to the Windows user profile. There is intentionally no plaintext passphrase or portable passphrase backup.

The Preview issuer is a disposable, rotatable operational test identity, not a durable Production-grade identity. Reuse is permitted only within the current Preview lifecycle.

Current public SPKI SHA-256 fingerprint:

`4d7706893b134e4cb2cfe266eebed30ed9bf5ea4c17a4317d18744b00fdf9117`

## Loss or corruption

If the Windows profile, encrypted key, or DPAPI material is lost or corrupted, retire the affected Preview issuer. Generate a new Preview-only issuer, then atomically rotate the public anchors in the desktop verifier, Worker verifier, and trust-anchor test pin. Rebuild and reinstall Preview, and reissue every Preview license. Old licenses must not be treated as recoverable.

Never reuse a Preview issuer for Production licensing, Camoufox publisher signing, or application-update signing.

## Safe recovery preflight

1. Inventory affected Preview license IDs and installation IDs without collecting or displaying activation tokens.
2. Preserve the old public fingerprint for audit and rollback analysis.
3. Create the replacement issuer in a fresh directory and verify that the new encrypted private key derives the persisted public key.
4. Rotate all three public anchors together, then run trust tests, build checks, and install checks.
5. Issue replacement licenses only after the trust rotation is verified; reissue all affected Preview licenses.

Never output or store a passphrase, DPAPI blob, or private PEM in Git, command output, logs, reports, or diagnostics. Never output or store any activation token or token fragment in Git, logs, reports, diagnostics, or any command output.

## Interrupted generation

If generation stops before DPAPI protection and public-anchor finalization, quarantine the incomplete issuer directory and confirm that it issued no license. Create a fresh directory and a fresh key pair. Never overwrite the incomplete issuer or guess its passphrase.
