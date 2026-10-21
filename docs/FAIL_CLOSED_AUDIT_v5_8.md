# v5.8 selective: fail-closed executable audit

Scope: current integration/v5.8-core-selective branch / Draft PR #16 only.
The existing Hybrid platform and Camoufox installer, downloader and proxy
gateways are retained. No duplicate engine module is introduced.

Run: \`npm run test:fail-closed\` (included in \`npm test\` and Windows CI).

## Audit matrix (real production module entrypoints, injected launch mocks)

- **Local API** (\`src/api/server.js\`): no credentials => 401; remote web Origin
  => 403; Camoufox not automatable and manual Firefox => 409; navigate when
  controller disabled / context missing => 409; enabled controller that failed
  to establish a BrowserContext => **409 with no fake WebSocket/port**;
  successful authorized in-process context has no fabricated debug socket;
  edit and trash blocked => 409 for starting **and** active profiles, with
  persisted profile unchanged.
- **Engine selection** (\`EngineFactory\`, provider adapters): invalid
  per-profile selection rejected; explicit Firefox choice not silently
  rewritten as Camoufox; unapproved proxy => \`NETWORK_BLOCKED\` **before
  calling any engine**; controller exception and missing Camoufox adapter
  => no silent retry via native, Firefox or Chromium; mismatched provider
  response => exception.
- **Camoufox native and Playwright controller**: no verified release => no
  spawn; invalid verifier path => no spawn; disabled controller => no
  verification or launch; unapproved proxy => \`NETWORK_BLOCKED\` before
  verification and launch.
- **NetworkSafetyCheck**: direct profile passes **configuration-only**
  preflight; absent approved proxy vault/GeoIP blocks; missing STUN/expected
  egress stays \`NOT_RUN\`, not a fabricated DNS/WebRTC pass.

The test deliberately avoids personal profiles, live credentials, live proxy
connections, third-party websites, and real Camoufox process launches.
It complements, **does not replace**, the Windows upstream Stage-0
20/20 storage-isolation measurement (on a hosted runner only).

**Limits:** mocked boundary tests prove denial control flow but do not
certify actual Windows firewall, proxy routing, DNS/WebRTC, signed engine
distribution, clean EXE installed-app behavior, or site identification. Do
not mark these items complete when this audit passes. Draft PR and main
remain gated pending separate acceptance.
