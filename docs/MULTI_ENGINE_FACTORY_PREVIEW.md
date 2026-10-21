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
