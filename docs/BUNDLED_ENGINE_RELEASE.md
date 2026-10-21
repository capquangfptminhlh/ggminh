# Bundled Chromium engine integration: release checklist

**Status: verified launcher support only, no bundled engine distributed.**
The user-facing Engine selector has two modes. `System` (default) runs
locally installed Chrome or Edge, retaining existing pinned-binary SHA-256
checks. `Bundled` requires a fully signed, integrity-verified, locally
packaged Chromium distribution and never falls back to System on error.
Firefox/Gecko continues to use the installed Firefox engine.

## Trust model

- The release operator supplies a properly licensed, supported Chromium
  distribution in `resources/bundled-engines/` with `chrome.exe`.
- A release manifest enumerates and hashes **every shipped file** (SHA-256).
  The manifest's canonical fields are signed with Ed25519. The signature
  format is domain-separated from license token messages.
- The current verifier uses the *existing* public verification key in the
  LHM licensing manager. The offline release signer must have the matching
  private key. A dedicated engine-release signing key should replace this
  shared trust root before wider commercial distribution.
- The installer deliberately ships **no private signing keys** and performs
  **no third-party binary downloads**.
- Unlisted files, invalid signatures, symlinked files, changed SHA-256 or
  malformed manifest data all result in a refusal to start bundled mode.
  The executable is additionally checked with the Windows PE/SHA-256
  verification already used for pinned runtimes.
- A signed manifest proves release authorization and byte-level consistency;
  it is **not** proof that a third-party binary is harmless, licensed, or
  invisible to a website. Review upstream code, licensing, CVEs, binaries
  and publisher signature separately.

## Operator-only release packaging

1. In a private clean Windows build runner, obtain the licensed engine from
   a trusted source and inspect its upstream provenance, redistribution
   terms, dependencies and security updates.
2. Place the complete *unmodified* distribution under
   `resources/bundled-engines/`, including all DLLs, locales and data files.
   Never commit these binaries or customer profiles to the public repo.
3. Configure `LHM_ENGINE_SIGNING_KEY_FILE` to the **absolute path** of the
   protected release private key in your CI secret facility, not the repo.
4. Run `node tools/sign-bundled-engine.js <absolute-resource-dir> <browser-version>`.
   It emits `manifest.json` after signature/key verification.
5. Run `npm test` followed by `npm run build:win`; inspect
   `dist/win-unpacked/resources/lhm-engines/` and confirm all files are
   present and the shipped manifest validates.
6. Install on clean Windows VMs, verify that System and Bundled select
   different installed executables as expected, then test update/rollback,
   crash recovery, permission handling and multiple profiles.
7. Perform Authenticode signing of the installer and appropriate internal
   binaries with normal publisher release procedures.

The verifier is for a **Chromium-compatible Windows exe named chrome.exe or
msedge.exe**. Firefox is not part of this bundle. Do not assume a specific
third-party fork's undocumented CLI flags; the launcher uses its existing
minimal Chromium arguments. No fingerprint noise flag, webdriver concealment,
IP spoofing, or behavior spoofing is automatically supplied.

## Electron implementation

`electron-builder` places extra resources in `resources/lhm-engines`,
not inside the app.asar archive. On Windows the app resolves this through
`process.resourcesPath`. In development the root is
`resources/bundled-engines`. The bundled executable is checked on **every
profile launch**. The switch is available only after closing all browsers.
Local profile data, cookies and other secrets remain in the existing
per-profile data paths, outside the shipped engine resources.

Documentation:
https://www.electron.build/docs/contents/

## Not yet delivered

- A commercially licensed and tested engine binary, with actual Windows
  process smoke confirming it launches from the resource directory.
- External code signing and distribution/license authority approval.
- Separate engine signing trust root, updater with rollback, CI release
  provisioning, native C++ patch tests or a full security assessment.
- SQLite migration: current per-profile storage remains the local JSON store.
  This PR deliberately avoids a potentially destructive migration.
- Any guarantee about anti-bot or Google's detection decisions.

`node test/bundled-engine-status.js` validates signed fixture behavior,
selector wiring and external resource packaging declarations. It does not
pretend to ship or launch a real patched browser.
