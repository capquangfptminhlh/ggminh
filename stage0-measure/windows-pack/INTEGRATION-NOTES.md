# INTEGRATION-NOTES — Agent R4, Windows measurement pack

Branch `agent-r4/windows-measure-scripts` on base `f280296`.
**New files only** — no existing file is modified, so there is
nothing to reconcile: `git status` on this branch shows exactly
one new directory, `stage0-measure/windows-pack/`:

| File | Role |
|---|---|
| `pack-common.js` | Section 23 bound-record builder (commit / engine version+SHA-256 / OS / redacted config), fail-closed `NOT_RUN` gate (exit 2), engine pin check, env-only proxy config, ambient `*_PROXY` scrubbing for launched browsers, and the app-controller harness (Agent 6/7 recipe + a `prepareProxy` capture wrapper that exposes the product-built gateway port). |
| `01-stun-srflx.js` | STUN/srflx on a real UDP network — Agent 6's investigation, Windows-pack form: C0 transport controls, D1 LAN STUN, D2 public STUN (owner-configured, none hardcoded), P1 lab-proxy control, P2 owner's real proxy judged by the product's own §19.3 classifier + `unexpectedPublicCandidates`. Closes §4.1 WebRTC ICE row (criterion in README). |
| `02-webgl-gpu.js` | WebGL on the real GPU — Agent 4's runner, Windows combos (headful first; headless demoted to a labelled control), identities supplied or drawn by the official generator; exactly-2-field expectation comparison, GL parameters as counted observations. Closes the five §4.3 WebGL rows. |
| `03-dns-proxy-route.js` | DNS through the proxy route + DoH — Agent 5's lab, extended with a second (proxy-side) DNS instance and a pack SOCKS5 proxy that resolves through it and logs CONNECT target form for attribution. Variants A / A-trr-off (DoH pair + unobserved-channel detector), B-lab-socks (route criteria, conjunct-by-conjunct), B2-real-proxy (negative-space local-leak check). Closes §4.1 DNS row's handling. |
| `04-runtime-vs-manager-ip.js` | Runtime-vs-manager exit IP through the owner's real proxy — Agent 7's module + the product's `checkProxy` through the captured local gateway (ProxyCenter pattern), one store, both labels, dead-echo negative control, D3 normalisation check. Closes the §19.3 differentiation / runtime half of the §4.1 exit-IP row. |
| `test-windows-pack.js` | Hermetic smoke/contract test: spawns every script's `--check`, validates the bound records, the redactor, env parsing, and engine-fact honesty. Loopback-only, ~8 s. |
| `README.md` | Owner-facing: prerequisites, env vars, per-script run commands (PowerShell), and **per script the exact result that closes which §4 register row** — including what does *not* close a row. |

Design points a reviewer should know:

- **The controller's proxied mode is authenticated-connect only**
  (`camoufoxProxyPlan` has exactly two modes: direct and
  authenticated-connect). Pack variants that run a profile behind
  the owner's proxy therefore *require* `WINPACK_PROXY_USER/PASS`
  and record `NOT_RUN` with that reason otherwise — a product
  fact surfaced, not worked around.
- **04's manager side uses the product's own gateway pattern**
  (`src/proxies/proxyCenter.js` probes `checkProxy` at
  127.0.0.1:gatewayPort). The gateway port is obtained through the
  controller constructor's documented `prepareProxy` injection
  seam, wrapped around the real `prepareCamoufoxProxy` — product
  code untouched.
- **03's attribution does not depend on adapter state for the lab
  route**: the pack SOCKS proxy resolves through its own lab DNS
  instance on an ephemeral port (hand-rolled query, UDP with TCP
  fallback), so browser-local vs proxy-side resolution is
  distinguishable on one machine by log + CONNECT form + egress
  address together.
- **No third-party endpoint is hardcoded anywhere.** The public
  STUN (01) and the echo (04) are owner-configured; 04's echo is
  the same LHM-controlled endpoint whose Wave-2 owner decision is
  still open — the script is the consumer of that decision, and
  without it 04's runtime half reports `NOT_RUN` rather than
  borrowing the manager value (19.3).
- Ambient `*_PROXY` variables are scrubbed for launched browsers
  and the fact is disclosed in every report (Agent 5's sandbox
  evidence: with them present, resolution silently moved to an
  unrelated proxy).

## Linux smoke results (this sandbox, 2026-10-22)

Environment: Linux x86_64, Node v24.20.0, clone of f280296 (no
`node_modules` in the fresh clone — no pack `--check` path needs
playwright-core; the real runs load it via `loadPlaywright` and
report `NOT_RUN` if absent).

`node stage0-measure/windows-pack/test-windows-pack.js` →
**18/18 PASS** (final run). Per script `--check` internals:

| Script | Internal checks | Result |
|---|---|---|
| 01-stun-srflx | 7 (6 ICE classifier vectors incl. mDNS + documentation-range honesty, `unexpectedPublicCandidates` semantics) | PASS |
| 02-webgl-gpu | 4 (comparator: match 2/2 pass; mismatch compared=2 pass=false; blocked compared=0; generator tool present) | PASS |
| 03-dns-proxy-route | 6 (lab A answer over TCP + log shape; out-of-zone REFUSED logged; pack resolver end-to-end — in *this* sandbox it answered over the **TCP fallback**, UDP loopback being undelivered here; SOCKS hostname target resolved via lab DNS; HTTP hit from egress 127.0.0.30) | PASS |
| 04-runtime-vs-manager-ip | 7 (`canonicalIpv4` ×3, `parseEchoIp`, `checkProxy` invalid-input without network, runtime module fail-closed ×2 with a stub context — records nothing) | PASS |
| pack-common (via the test) | 6 (bound fields, deep redaction, env parsing + credential-free report view, engine facts never invented) | PASS |

Fail-closed gate probes (real mode, prerequisites absent): all
four scripts exit **2** with a `NOT_RUN` JSON naming the missing
prerequisite; a deliberately wrong `LHM_CAMOUFOX_EXE_SHA256` also
exits 2 ("refusing to measure an unpinned binary").

One defect was found *by* the smoke test during development and
fixed before delivery: the DNS `--check` initially bound the lab
server's TCP listener to a different ephemeral port than UDP, so
the pack resolver's TCP fallback queried a port nothing served —
the same class of harness defect Agent 5 recorded in DNS-LAB.md
(the harness must not be mistaken for the measurement). Fix: TCP
is bound to the UDP-chosen port everywhere (check mode and the
real run's proxy-side instance), mirroring port 53 in production
use; one SOCKS assertion that had passed spuriously on a FAILED
resolution was also tightened. First smoke run was 15/18; after
the fix, 18/18.

## NOT_RUN register (owner machine — the pack's reason to exist)

Everything below remains **NOT_RUN** until the owner runs the
pack on the Windows machine; nothing in this branch upgrades any
of it:

- All browser variants of 01 (D1/D2/P1/P2), incl. whether the
  engine consults a public STUN server and what srflx a real
  proxy route exposes.
- 02's measurement entirely (no GPU / no headful context here).
- 03's A / A-trr-off / B / B2 browser variants (adapter redirect,
  browser, and real proxy are owner-machine facts); the sandbox
  additionally cannot deliver the UDP transport the lab prefers.
- 04's through-real-proxy differentiation (needs the owner's
  proxy + the LHM echo endpoint decision).
- Packaged-EXE acceptance (Gate 3) — explicitly out of this
  pack's tier, per the README's tier note.

## Proposals for the coordinator (not applied here)

1. Add one link from `stage0-measure/README.md` to
   `windows-pack/README.md` so the pack is discoverable from the
   existing measurement docs. (Not edited: shared file.)
2. Optionally append `node stage0-measure/windows-pack/test-windows-pack.js`
   to the npm test chain — it is hermetic and fast; `package.json`
   is coordinator-owned, so no edit was made.
3. No product-code integration is required or proposed: the pack
   consumes existing modules (`core`, `lab-net`, `dns-lab-server`,
   `NetworkSafetyCheck`, `proxyChecker`, `runtimeEgressObservation`,
   `exitIpObservations`, the controller) exactly as shipped at
   f280296.
