# PR #15: Camoufox automation protocol and proxy authentication

## Corrected assumptions

Playwright BrowserType.connectOverCDP is **Chromium-only**. Firefox
-start-debugger-server exposes Mozilla debugging tools, NOT a Playwright
BrowserServer endpoint. Neither a Firefox debugger TCP port nor a child PID
can be passed into Playwright as Juggler/CDP. Official documentation:
https://playwright.dev/docs/api/class-browsertype

The native adapter keeps Automation Studio unavailable. It offers an
explicit connectPlaywright method that rejects with a protocol error.
Authenticated Local API requests for Camoufox browser/start return HTTP
409, code -1, protocol unavailable, debug_port null and ws.playwright null.
They do not spawn a browser or return a fictional WebSocket. Existing
Chromium CDP and historical system Firefox handling are unchanged.

## Reusing the existing Proxy Center infrastructure

Camoufox does not accept Chromium's --proxy-server option. Instead the
new camoufoxProxyPlan module reads an authProxyId from a valid matching
Proxy Center record, obtains credentials from the existing encrypted
vault, starts an existing authenticated HTTP/SOCKS5-to-loopback gateway,
and writes scoped Firefox managed proxy preferences to the profile's
user.js before spawn. Gateway binds to 127.0.0.1. Raw credentials and
upstream addresses never appear in launch CLI arguments or preferences.
The gateway closes after process exit and also closes if configuring
the Firefox profile fails. Direct profiles reset the managed proxy
setting so an old local port cannot be reused accidentally.

Gateway support is limited to HTTPS CONNECT; plain HTTP is rejected.
No DNS leak, WebRTC, GeoIP, full authenticated network access or
browser fingerprint outcome has been certified by this code.

## Safety gate

Native Camoufox proxy support stays disabled by default. A qualified
operator can set LHM_CAMOUFOX_PROXY_LAB=1 for an explicitly approved
lab run. Missing or stale Proxy Center references, missing credentials,
unapproved proxy mode and failed profile writes all refuse to launch,
with **no fallback to direct traffic**.

New regression:
- test/camoufox-proxy-plan.js validates Firefox preferences, vault
  secrecy, loopback gateway and rollback on async profile write failure.
- test/camoufox-proxy-lifecycle.js validates pre-spawn refusal without
  explicit lab approval and cleanup on browser process exit.
- test/camoufox-api-automation-guard.js checks 409 without a false
  WebSocket or a browser launch.
- Existing authenticated gateway, browser and profile tests are retained.

## Release blockers: NOT RUN

An LHM publisher-signed release still has not been installed and smoke
tested on a clean Windows system. No approved live proxy address or
credentials, expected exit-IP endpoint, DNS resolver log or WebRTC/STUN
lab have been provided. Consequently the actual Camoufox network path
through an authenticated proxy and fail-closed behavior on upstream
failure remain **NOT TESTED**. No compatible Playwright Firefox browser
server endpoint is available in this native spawn architecture.

Do not merge PR #15, issue a commercial engine or claim that accounts
will be undetectable until all release acceptance requirements pass.
Owner Sweep and licensing feature work remains out of PR #15.
