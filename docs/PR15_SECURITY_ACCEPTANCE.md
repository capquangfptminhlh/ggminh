# PR #15 — Camoufox secure installer: security review & acceptance checklist

Date: 2026-10-21. Branch: `feat/camoufox-secure-installer-diagnostics-20261021`.
Base: draft PR #14, **not main**. Scope: Camoufox install integrity,
isolation, regression and lab diagnostics only. No Owner Sweep/licensing v5.8
feature modifications, no commercial release and no anti-detection claims.

## CI and artifacts

**Before the hardening commits**, Windows build
[39550024586](https://github.com/capquangfptminhlh/ggminh/actions/runs/39550024586)
completed successfully at SHA `ac899c14a3ba0190945ec52808c9df24ccfc5f5c`.
Published artifact digests:

| Workflow artifact ZIP | SHA-256 from GitHub Actions | Bytes |
|---|---|---:|
| `LHM-Ads-Browser-Windows-x64` | `d133b8d97db3e82a17415b8e7c4c9b381cc096ccfe1454820c862d7a42ae8c9e` | 82,228,058 |
| `LHM-Workspace-UI-Preview` | `8cc9eccd086047ad6a4e0b29751fd80d5fae004cbbbb02b56e1075e9e7032762` | 1,142,267 |
| `LHM-Cloud-Service-v5.8.0` | `d6bd6b1eab485ff41b860b2476dcb0b529eeb7d89c51befb6f022170108f2afc` | 33,455 |

The six earlier installation-fix runs
`39549094996`, `39549245942`, `39549346248`,
`39549605475`, `39549718928` and `39549869387` **failed**.
These are historical failures corrected before run 39550024586. The
post-hardening run must independently pass; the historical SHA **cannot**
be reused as proof of the latest code. Artifact digests describe the
**GitHub workflow ZIP**, not each installer executable inside it.

## P0/P1 review

- [x] **P1 engine trust root isolation:** publisher `publisher-ed25519.pub`
  is a separate, opt-in build resource. Reject an Ed25519 key identical
  to the app licensing key. **Do not modify the licensing subsystem.**
  Browser install and launch fail closed when this key is missing or invalid.
- [x] **Node 22 wrapper blocker isolated for MANUAL UI:** PR #15 now
  invokes the separately signed `camoufox.exe` using
  `child_process.spawn`, without importing the Camoufox TypeScript wrapper.
  Firefox-documented `-no-remote -wait-for-browser -profile PATH -new-window URL` arguments
  are the only launch flags. Readiness requires a detectable Windows GUI
  window (not a PID alone and not an assumed WebSocket in stdout).
  The packaged Electron 33 / Node 20 runtime therefore supports the
  native-spawn code path; this does **not** restore Playwright/Juggler
  automation, proxy authentication, GeoIP or fingerprint configuration.
- [x] **P1 install lifecycle:** early storage failures clear the busy flag;
  temp payload and download archive are cleaned on failure. Original profile
  data and an existing invalid engine directory are not overwritten.
- [x] HTTPS only, approved GitHub release-shaped URL, allowlisted HTTPS CDN
  redirects (no downgrade), pinned archive byte count and SHA-256.
- [x] Verify signed Ed25519 manifest before unpacking or launching.
  Check individual file hashes, sizes and PE executable after extraction.
- [x] ZIP rejects extra/missing/duplicate files, path escapes, absolute
  paths, ADS colon, ZIP symlinks, oversized members and excess expansion.
  Extract into an isolated staging directory and atomically move only after
  verification. Never add Defender exemptions.
- [x] Unit/integration test for P1 signature boundaries, malformed URL,
  modified release, bad ZIP member, wrong-size data and rollback failure.
- [x] The diagnostic cannot call an unconfigured lab a PASS. Missing inputs
  return `NOT_RUN`/exit 2; unknown DNS remains `NOT_TESTED`.
  HTTPS egress and ICE candidates never alone prove DNS leak safety.

## Real Windows and release gates

- [x] **Upstream real Camoufox smoke**:
  [39545725123](https://github.com/capquangfptminhlh/ggminh/actions/runs/39545725123)
  launched **two separate persistent** Camoufox contexts with an explicitly
  verified upstream Windows ZIP, confirmed cookie isolation, clean close and
  reopen persistence. This used **Node 22 on a Windows GitHub runner**.
- [x] Native adapter unit regression blocks all configured proxy and
  unsupported GeoIP requests **before** process spawn. This prevents
  silent direct fallback but is **not** proof of real proxy connectivity.
- [x] **Real native Windows EXE smoke PASS:** GitHub Actions
  [39555514032](https://github.com/capquangfptminhlh/ggminh/actions/runs/39555514032)
  pinned an official upstream ZIP, then ran direct `child_process.spawn`
  with real Windows window detection. Verified two concurrent profiles,
  close/reopen of A and unsupported proxy rejected before spawn. No
  Playwright/TypeScript package was imported by the **native test script**;
  Node 22 happened to be available in that runner. Browser startup succeeded
  only after using `-wait-for-browser` to keep the Windows launcher attached
  to its child browser lifetime. This does **not** establish an installed
  LHM EXE test, cookie verification, or proxy/WebRTC/DNS safety.
- [x] **Native Node 20 real Windows regression PASS:**
  [run 39555947478](https://github.com/capquangfptminhlh/ggminh/actions/runs/39555947478)
  first ran upstream Playwright smoke under Node 22, then switched to
  **Node 20** on the same Windows GitHub Actions runner and successfully
  launched Camoufox via native `spawn`. Actual logged outcomes include
  Windows window readiness, two parallel profile directories, close/reopen,
  and unsupported proxy rejected before spawn. The native launcher imported
  no `camoufox` or `playwright-core` package. **This is not an installed
  Electron 33 EXE smoke on a clean consumer Windows VM.**
- [ ] **Blocker:** LHM-controlled Camoufox distribution signed under a
  *separate engine publisher key*, with approved license/redistribution,
  vetted per-file manifest and build-time `release.json`. None was provided.
- [x] **Native manual launcher dependency removed:** no `camoufox`
  npm wrapper or `playwright-core` required to start a signed EXE.
- [ ] **Blocker:** production Automation Studio/Playwright support remains
  absent from the native GUI launcher. A child PID and browser window are
  not an automation endpoint. A compatible upstream Juggler/BiDi control
  mechanism needs a separately supported and tested integration.
- [ ] **Blocker:** actual installed LHM EXE on a clean Windows VM without
  Node/Chromium developer tooling. Create, open, close, delete and recreate
  profile, verify persistence and crash recovery under regular Defender.
- [ ] **Blocker:** authorized proxy host/port and credentials,
  expected exit IP, owned HTTPS echo endpoint, STUN endpoint, DNS resolver
  log collection and real test owner approval. Not available in this PR.
- [ ] **Blocker:** truly broken SOCKS5/HTTP proxy must fail closed under a
  real browser and prove no direct bypass, using the authorized lab above.
- [ ] **Blocker:** independent DNS resolver and WebRTC/STUN results; the
  available diagnostic reports partial/inconclusive outcomes, not a
  fabricated network safety verdict.
- [ ] **Blocker:** publisher code signing/Authenticode, malware scan
  disposition and third-party dependency/license audit. A hash is not
  proof of code safety. Do not disable Defender or recommend exclusions.
- [ ] Release rollout, customer upgrade/rollback, and signed update channel
  acceptance **must remain separate from this PR**.


## Native manual launch scope

The app uses verified executable locations supplied by its existing
publisher-signed `BundledEngineManager`: either
`process.resourcesPath/lhm-camoufox/camoufox.exe` (release-staged
resources) or the independently verified AppData
`engines/camoufox/camoufox.exe` installed after explicit consent.
Never trust an arbitrary URL, ZIP or executable path supplied by renderer.

`config.json` is **not** written: this upstream EXE is not documented
to consume a path-to-JSON flag for authenticated proxy/GeoIP in direct CLI
mode. Only the ordinary Firefox profile path and start URL are forwarded.
The app does not invent a WebSocket endpoint or try CDP. Windows UI
readiness is checked through `MainWindowHandle` in the launcher/child
process tree (not from PID alone). Windows Firefox's bootstrap launcher
normally detaches and exits with code 0 while the browser keeps running;
`-wait-for-browser` keeps the launcher alive. Stdout/stderr are drained
only to avoid pipe stalls. Graceful window close is attempted
before process termination; unexpected close and timeout remain fail-closed.

Do **not** mark unsupported proxy/GeoIP requests as success. Users
requesting an authenticated proxy are blocked instead of accidentally
browsing directly, and the live proxy/WebRTC/DNS lab stays blocked.


## Playwright integration — guarded experimental implementation (2026-10-21)

**Direct upstream compatibility — verified**:
[Windows run 39562345794](https://github.com/capquangfptminhlh/ggminh/actions/runs/39562345794)
used Node 20.20.2 and pinned playwright-core 1.62.0 with an official
SHA-256-checked Camoufox Windows x64 executable. Direct
firefox.launchPersistentContext() worked: two profile directories,
about:blank, navigator.userAgent and unreachable loopback proxy
**navigation blocked**. No Camoufox TypeScript launcher required.

**Actual project controller — verified**:
[Windows run 39564124178](https://github.com/capquangfptminhlh/ggminh/actions/runs/39564124178)
used CamoufoxPlaywrightController.js (not just a standalone Playwright
call), with two real upstream persistent contexts, in-browser navigation
and closed sessions. Proxy lacking an approved lab was rejected as
NETWORK_BLOCKED **before launch**. This is a verified upstream test
binary, **not an LHM-signed distribution or installed consumer EXE**.

### Implementation and review

- [x] Playwright Core 1.62.0 pinned in package.json and package-lock.json
  (Node 20 supported), without Camoufox's Node 22 TypeScript wrapper.
- [x] CamoufoxPlaywrightController.js holds BrowserContext objects
  in process, with explicit profile storage/lifecycle. Persistent
  context.browser() may be null; neither object is placed into JSON.
- [x] EngineFactory invokes NetworkSafetyCheck before Camoufox launch;
  unsupported proxy/GeoIP is rejected. Experimental Playwright failure
  does **not** retry through native spawn. The prior manual launcher
  remains separately selected until release acceptance.
- [x] Proxy Center vault/HTTP CONNECT gateway can map an authenticated
  SOCKS5 or HTTP proxy into Playwright's localhost proxy.server option.
  Secrets are not serialized into CLI args or API response; this
  option was tested with a **mock gateway**, not a real paid proxy.
- [x] CamoufoxProfileManager.js supplies supported Firefox prefs,
  including network.proxy.socks_remote_dns. No unsupported
  camoufox.geoip preference is invented.
- [x] NetworkSafetyCheck.inspectContext() accepts a Playwright context,
  examines page ICE candidates with STUN lab inputs, and returns
  NOT_RUN or INCONCLUSIVE when evidence is insufficient.
  Separate DNS resolver logs remain required.
- [x] Authenticated Local API can operate a running in-process context
  and returns protocol playwright-internal, ws.playwright null.
  Neither Firefox CDP nor an invented NATIVE_PLAYWRIGHT URL is used.
- [x] Test suite covers context isolation, mocked authenticated
  gateway option, API auth, URL rejection and conservative network
  states; npm test includes all four integration test files.
- [x] README documents these limits and working APIs.
- [ ] **BLOCKER:** Installed LHM EXE and Automation Studio customer
  workflow testing, currently lab-only and disabled when app.isPackaged.
- [ ] **BLOCKER:** Real authorized upstream proxy, broken proxy network
  route-bypass, DNS resolver and WebRTC/STUN evidence.
- [ ] **BLOCKER:** LHM-signed redistribution/permissions, clean Windows
  VM, Authenticode, and release/update rollback process.

**Draft only**. Successful browser compatibility is not a guarantee
of detection evasion, leak immunity, or commercial readiness.

## Reproduction

Run `npm ci && npm test` on Windows to check local security tests,
`test/camoufox-install.js`, `test/camoufox-download.js`,
`test/camoufox-runtime-gate.js`, plus existing Chromium, Gecko,
Camoufox-adapter and storage regression tests.

`tools/test-camoufox-proxy.mjs` is **operator-only**, not run as
a substitute for an authorized lab. It requires
`LHM_CAMOUFOX_EXECUTABLE`, `LHM_PROXY_SERVER`,
`LHM_EXPECTED_EGRESS_IP`, and `LHM_IP_ECHO_URL`. Additional optional
`LHM_STUN_SERVER` is insufficient to assert complete WebRTC/DNS safety.
Never commit credential values, proxy IPs, customer cookies or raw logs.
It returns exit 2 for unconfigured/inconclusive lab, exit 1 for detected
egress mismatch or unexpected public ICE candidates.

**Acceptance decision: draft only**, no merge or commercial release
while any blocker is unchecked.
