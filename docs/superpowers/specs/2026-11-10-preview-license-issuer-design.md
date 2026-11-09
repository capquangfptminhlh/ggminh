# Preview License Issuer Design

## Objective

Create a reusable Preview-only Ed25519 license issuer, issue a 30-day Business license for the current Windows installation, activate it, and verify that licensed profile launch is no longer blocked.

Production license issuance, Camoufox bundle signing, online activation, and customer distribution are outside this design.

## Selected approach

Rotate the Preview build's pinned license trust anchor to a newly generated Preview issuer. Keep the issuer private key encrypted outside the repository and restrict it to the current Windows user. Commit only the public trust anchor and its consistency tests.

Alternatives rejected:

- A one-off issuer per installation would require rebuilding the application for every test machine.
- Disabling license enforcement in Preview would make Preview behavior diverge from customer behavior and weaken release validation.

## Key storage

- Generate a dedicated Ed25519 key pair for Preview licensing.
- Export the private key as encrypted PKCS#8 PEM using a randomly generated passphrase.
- Store the encrypted private key under the current user's local application-data directory, outside every Git worktree.
- Protect the passphrase with Windows DPAPI for the current user and never place it in command arguments, logs, source files, build artifacts, or activation tokens.
- Apply a user-only filesystem ACL to the issuer directory.

The Preview issuer must remain independent from Camoufox engine-publisher, application-update, and future Production license keys.

## Trust-anchor update

Update all Preview license consumers atomically:

1. `src/licensing/manager.js` receives the new public key.
2. `serverless/license-worker/src/index.mjs` receives the same SPKI value.
3. `test/license-trust-anchor.js` receives the reviewed SPKI SHA-256 pin.

The existing trust-anchor test must prove that the desktop app and Worker use the same Ed25519 public key and that this key differs from the update-publisher key.

## License issuance

Use the existing offline issuer format and signing implementation. Issue one strict version-2 token with:

- installation ID: `0ddbfcae-9c8b-4b00-b503-07a70b01c8aa`
- customer: `LHM Preview Local`
- plan: `business`
- duration: 30 days from issuance
- maximum profiles: 100
- features: `api`, `automation`, and `profiles`
- enforcement mode: `strict`

Do not store the complete activation token in Git or operational logs. Persist it only through the application's activation record after successful verification.

## Verification flow

1. Change the trust-anchor test expectation first and confirm it fails against the old key.
2. Update the public key and Worker anchor, then confirm the targeted licensing tests pass.
3. Build the Windows Preview installer and confirm a successful build.
4. Close only LHM Ads Browser processes, install the new Preview build, and verify that the installed `app.asar` matches the build output.
5. Generate and locally verify the signed token before activation.
6. Activate the token through the application's license manager/UI path.
7. Restart the installed application and confirm the license status is active with the expected plan, expiry, profile cap, and feature set.
8. Open the existing Chromium profile and confirm license enforcement no longer blocks the launch. Camoufox runtime validation remains a separate step because this design does not create or sign the Camoufox engine bundle.

## Failure handling

- If key generation, DPAPI protection, ACL application, signature verification, tests, build, installation verification, or activation fails, stop without weakening enforcement.
- Never fall back to an unencrypted issuer key, a hard-coded passphrase, trial reset, or unsigned activation record.
- Preserve existing profile data and installation identity throughout installation and activation.
