# Per-profile Multi-Engine Factory (v5.8 preview)

## Decision: approved with corrections

**Architecture approved:** BrowserLauncher validates the real profile and
license, then routes through `EngineFactory` to the existing Chromium
spawn/CDP code, existing installed Firefox code, or the experimental
Camoufox Playwright persistent-context provider.

**Changes to the supplied example:** No unverified `camoufox.*` Firefox
prefs, guessed fingerprint/noise flags, direct Playwright
`firefox.connectOverCDP` method, raw CLI proxy credentials or
`taskkill` without process ownership verification.

The engine package remains **not bundled**; Camoufox cannot be selected
successfully until the approved TypeScript launcher and verified binary are
installed in the release pipeline. There is no anti-detection guarantee.

## Data and compatibility

The existing local JSON `profiles` schema persists:
- `engine`: `chromium` or `gecko` (legacy browser family)
- `engine_type`: **new**, `chromium`, `firefox`, or `camoufox` (actual provider)

This deliberately avoids pretending SQLite is already deployed. Existing
JSON profiles without `engine_type` remain readable and retain their
prior global Gecko provider until that profile is explicitly edited/saved.
New records pin the provider per profile; changing the **global** Gecko
setting does not switch an already pinned profile.

Existing Chromium data remains under its original `profiles/<id>` path,
Firefox under `gecko-profiles/<id>`, and Camoufox contexts under
`camoufox-profiles/<id>`. The engine switch dialog requires the profile to
be stopped and states explicitly that account sessions/cookies will not be
copied between engines. If Camoufox is requested but not installed, the
launcher fails closed instead of opening installed Chromium or Firefox.

## Implementation files

- `src/engine/EngineFactory.js`: validates and dispatches provider.
- `src/engine/adapters/ChromiumAdapter.js`: delegates to existing tested
  Chromium launch and CDP lifecycle.
- `src/engine/adapters/FirefoxAdapter.js`: delegates to existing Firefox
  process/preferences lifecycle.
- `src/engine/adapters/CamoufoxAdapter.js`: delegates to
  `src/engine/camoufoxAdapter.js` using the supported TypeScript
  persistent-browser-context API.
- `src/engine/browserLauncher.js`: shared preflight/licensing/active-session
  lifecycle and the unchanged installed-browser process execution logic.
- `src/db/store.js`: validates and saves engine family and engine_type,
  requiring an explicit confirmation option on changes.
- `main.js`: validates profile ID and displays an OS confirmation modal
  before approved manual provider switches.
- `src/ui/renderer.js` and `src/ui/index.html`: engine selection on the
  **individual profile creation/editing screen**.

## Acceptance and risks

`node test/per-profile-engine-factory.js` checks independent per-profile
selection, old Gecko fallback, persistence across Store reloads,
conflicting engine fields, explicit switch permission, adapter routing and
failure if Camoufox is not present. Existing Windows tests still cover
real two-Chromium navigation, existing Firefox configuration and
mock Camoufox contexts.

Still missing for commercial release:
- Release-signed, licensed Camoufox runtime and Playwright version pinning;
- Real Camoufox Windows process/profile persistence and crash/exit tests;
- Independent proxy/WebRTC verification; Playwright automation adapter for
  Firefox/Camoufox, not Chromium CDP reuse;
- Atomic, backup-backed SQLite migration and independent security review;
- Full AdsPower parity and signed release installer.

**No attempt** is made to spoof Google bot signatures, bypass challenges, or
auto-warm up accounts using fabricated activity.

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
The manifest must list every resource file; `firefox.exe` is required.
Review third-party notices, redistributed license obligations, antivirus
reports and the real executable's provenance. Do NOT disable Windows
Defender or add the installation directory to exclusions. A code-signing
certificate alone never guarantees malware safety or SmartScreen approval.

## SQLite migration preview (no automatic cut-over)

An explicit offline operator tool now exports the existing `db.json`
into `db-preview.sqlite` using Node 22+ built-in SQLite:

`node tools/preview-sqlite-migration.js ABSOLUTE_DATA_DIR --confirm-preview`

The tool validates and hashes the source, checks duplicate profile IDs,
exports all profiles and their engine types, retains a complete original
JSON snapshot in SQLite, runs `PRAGMA integrity_check`, and atomically
publishes only if the preview destination does not already exist.
**The application continues to use the original JSON database.**
No original file is renamed, removed, overwritten, or automatically
converted. The SQLite preview is an additional local, unencrypted
copy of the profile metadata: secure disk permissions and backups matter,
and it must not be distributed or uploaded to Cloud Sync.
A live SQLite backend cut-over requires transactional migration,
encryption-at-rest policy, schema versioning, backward compatibility,
backup/rollback and concurrent writer tests before production.
