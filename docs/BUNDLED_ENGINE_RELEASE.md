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
- Engine manifests must be signed with a **separate Ed25519 publisher key**,
  never with the licensing key. The offline release tool refuses to sign
  without `LHM_ENGINE_PUBLISHER_KEY_FILE`. The runtime reads the approved
  public key `publisher-ed25519.pub` from the bundled engine root; missing,
  invalid or license-equal keys keep Bundled mode disabled (fail-closed).
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
   protected release private key OUTSIDE the repo. Provide
   `LHM_ENGINE_PUBLISHER_KEY_FILE` as the absolute path to the matching
   independently generated **public** Ed25519 key.
4. Stage the public key in each engine's distribution root as
   `publisher-ed25519.pub` only when preparing the signed distribution;
   ensure it is enumerated in the manifest. Run
   `node tools/sign-bundled-engine.js <absolute-resource-dir> <browser-version>`.
   It emits `manifest.json` after signature/key verification.
5. Run `npm test` followed by `npm run build:win`; inspect
   `dist/win-unpacked/resources/lhm-engines/` and confirm all files are
   present and the shipped manifest validates.
6. Install on clean Windows VMs, verify that System and Bundled select
   different installed executables as expected, then test update/rollback,
   crash recovery, permission handling and multiple profiles.
7. Follow the owner's Authenticode decision for the target release; an
   unsigned Preview must be labelled as unsigned and is not production
   code-signing acceptance. Never advise bypassing Windows protection.

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
- Production provisioning of an **independent** engine publisher key,
  updater release feed/rollback, native patch tests and full assessment.
- SQLite migration: current per-profile storage remains the local JSON store.
  This PR deliberately avoids a potentially destructive migration.
- Any guarantee about anti-bot or Google's detection decisions.

`node test/bundled-engine-status.js` validates signed fixture behavior,
selector wiring and external resource packaging declarations. It does not
pretend to ship or launch a real patched browser.

## Signed Camoufox runtime staging (PR #14 hardening)

LHM now requires the upstream TypeScript Camoufox launcher **and** a
release-signed Camoufox Firefox executable. The adapter passes
`persistent_context: true`, a private per-profile `user_data_dir`, and
an explicit `executable_path` verified against the signed manifest.
It refuses to call the upstream launcher at all when no signed binary is
present. This prevents an unapproved first-run binary auto-download.
The independent runtime lives at `resources/lhm-camoufox` in packaged
Electron builds, or `resources/camoufox-engine` in development. No
Camoufox binary or private signing key is committed to the repository.
The current application package still defaults to installed browsers.

Release maintainers can stage approved Windows Camoufox assets privately,
then issue a manifest with:

`node tools/sign-bundled-engine.js ABSOLUTE_CAMOUFOX_ASSETS_DIR VERSION camoufox`

using `LHM_ENGINE_SIGNING_KEY_FILE` held outside the source tree.
The manifest must list every resource file; `camoufox.exe` is required.
Review third-party notices, redistributed license obligations, antivirus
reports and the real executable's provenance. Do NOT disable Windows
Defender or add the installation directory to exclusions. A code-signing
certificate alone never guarantees malware safety or SmartScreen approval.


SQLite migration preview is intentionally excluded from the selective v5.8 core branch.
