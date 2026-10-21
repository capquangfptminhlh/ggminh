# Camoufox Gecko provider — experimental adapter (v5.8 preview)

## What was integrated

A separately selectable **Camoufox (preview)** provider for Gecko profiles,
implemented in `src/engine/camoufoxAdapter.js`. It is attached to
BrowserLauncher and Electron's Engine settings, rather than rewriting the
Chromium CDP automation stack.

The adapter loads the **official TypeScript Camoufox launcher** through a
dynamic import, then uses the supported persistent-context API:

```js
const { Camoufox } = await import('camoufox');
const context = await Camoufox({
  headless: false,
  user_data_dir: '/absolute/local/data/camoufox-profiles/PROFILE_ID'
});
const page = await context.newPage();
await page.goto('https://example.com/');
await context.close();
```

A Camoufox `BrowserContext` is not a Node.js `ChildProcess`, so the
adapter owns lifecycle state and invokes Playwright `context.close()` when
stopping. No synthetic PID, Chromium CDP port or Firefox
`connectOverCDP()` is generated. Existing browser automation requiring CDP
must remain on Chromium until an explicit Playwright API implementation is
reviewed. Profile data is stored in a **separate local directory** from
ordinary Firefox and Chromium profiles, and isn't moved or reused across
engines.

## Safety gates and installation

- The default Gecko provider remains **system Firefox**. Camoufox must be
  explicitly selected in **Engine → Firefox/Gecko**. Mode changes are rejected
  if any profiles are running or starting.
- As published, this repo's npm lockfile deliberately does **not** install
  Camoufox or Playwright. The preview has no Camoufox executable and no
  automatic binary download task configured by LHM.
- A trusted release operator must inspect the exact upstream Camoufox
  TypeScript package and dependencies, pin compatible versions of
  `camoufox` and `playwright-core`, audit/approve the binary, and stage
  its browser assets. Upstream documentation lists Node 22.15+,
  `playwright-core <1.63` and `npx camoufox fetch`. Do **not** run npm
  install/fetch on customer computers without informed consent and a
  verified supply chain.
- The experimental adapter refuses proxy configurations, including
  authenticated proxy references, rather than silently falling back to
  direct routing. It accepts only **native** fingerprint mode, never the
  old JS spoof extension; Camoufox network routing, GeoIP, WebRTC and
  cross-origin fingerprint behaviour are unverified.
- No automatic deletion of Firefox `parent.lock` or other session lock
  files. A lock might belong to a living process. Use Playwright close and
  verify the process state first during recovery.
- Source and third-party redistribution licenses are separate:
  Camoufox browser MPL-2.0, launcher MIT, vendored fonts/trajectories and
  dependencies may have their own license requirements.
- Camoufox is **not** assumed to provide Chromium CLI flags. Its
  automation uses Playwright/Firefox Juggler, **not CDP**.
- The provider is not production-ready until a signed, approved, fully
  packaged browser executable is verified on a clean Windows VM, including
  two simultaneous persistent profile sessions.

## Verification now

`node test/camoufox-adapter.js` injects a fake TypeScript/Playwright
persistent-context launcher to check:
- A and B have distinct on-disk paths, independent contexts and lifecycle.
- The same profile cannot start twice; STOP waits until context closure.
- Restart uses the same path; no Chrome or Firefox system binary is invoked.
- Invalid URLs, proxy modes and legacy fingerprint modes are rejected before
  browser launch.

**These are simulated adapter tests, NOT a true Camoufox binary smoke test.**
Run a real Windows binary smoke, account session isolation, crash recovery,
proxy/WebRTC tests and operational acceptance before calling the integration
complete.

References:
- https://github.com/daijro/camoufox
- https://www.npmjs.com/package/camoufox
- https://playwright.dev/docs/api/class-browsertype

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
