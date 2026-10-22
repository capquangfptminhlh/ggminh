# Agent R10 — Echo Endpoint Reference Implementation: Integration Notes

Branch `agent-r10/echo-endpoint` on base `f280296` (Wave-R release-prep).
Commits: `982b1fa` (service + contract tests), `16c7100` (real-engine
proof + bound results), this notes commit. No push/merge/tag. No app
code changed; no shared files touched (the one package.json proposal is
below, for the coordinator).

## Mission recap

Agent 7's runtime egress observation is wired in `main.js` but
config-gated on `settings.runtimeEchoUrl`, and the module deliberately
chose no endpoint — who operates the endpoint is an owner decision.
This agent built the **LHM-operated option** as a deployable reference
implementation and proved the full loop on Linux with the real engine.

## Deliverables

| File | What it is |
| --- | --- |
| `tools/echo-service/echo-service.js` | The service. Single file, Node.js stdlib only (`http`/`https`/`fs`/`net`), zero dependencies, zero third-party IP services. |
| `tools/echo-service/DEPLOY.md` | Owner deployment guide: VPS + Caddy (recommended), direct-HTTPS via certbot, nginx variant, systemd unit, firewall, logging/retention, the exact `runtimeEchoUrl` value to set. |
| `test/echo-service.js` | Contract tests (see Evidence). |
| `stage0-measure/run-echo-endpoint-proof.js` | Real-engine proof driver (exit 0/1/2 semantics like the other stage-0 runs). |
| `stage0-measure/agent-r10-echo-endpoint-results.json` | Bound proof report (status **RAN**, 14/14 checks PASS). |

## The client contract → service behaviour

Contract source: the header of `src/health/runtimeEgressObservation.js`
plus the client code itself (fetch with `redirect: 'error'`,
`credentials: 'omit'`, 8 s default deadline, body parsed by
`parseEchoIp`, result must canonicalise to IPv4).

| Client requirement | Service behaviour | Proven by |
| --- | --- | --- |
| GET 200 with `{"ip": "<caller IPv4>"}` | `/` and `/ip` answer exactly that JSON; `::ffff:`-mapped addresses normalised | contract test; proof checks 1–3 |
| `Access-Control-Allow-Origin: *` (fetch runs in a page context) | Sent on every response, incl. errors; OPTIONS preflight answered 204 with allow-methods | contract test |
| `Cache-Control: no-store` | Sent on every response | contract test; proof check 1 |
| Must not redirect (client refuses redirects) | The service never emits 3xx and never sets `Location` | contract test asserts absence |
| Non-2xx / unparseable / non-IPv4 → client records nothing | 404 for unknown paths, 405 for non-GET, 429 when rate-limited; an IPv6 caller gets `{"ip": null, "addressFamily": "IPv6"}` — an honest non-claim the client rejects by design | contract test; proof negative controls |
| Answer promptly (8 s client deadline) | Stateless in-memory handler; answer is one small JSON body | proof (in-page fetch succeeded well inside the deadline) |

Service-side extras the mission required: per-address fixed-window
rate limiting (default 60/60 s, `429` + `Retry-After`, in-memory
only), minimal logging (one line: time, observed address, method,
path without query, status, ms; `ECHO_LOG=off` disables it), and a
documented retention stance (DEPLOY.md: ≤ 7 days, journald/logrotate;
the logs are an operations aid, not an audit trail).

## Evidence

Environment: Linux x86_64, Node v24.20.0, repo playwright-core 1.62.0,
lab Camoufox `~/tmp-big/cfx-build/camoufox-bin` SHA-256
`2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669`,
proof bound to commit `16c7100`'s parent tree (report carries the
`git rev-parse HEAD` of the run). Per Constitution §23 these results
bind to exactly that commit + engine hash + OS; they say nothing
about Windows or a packaged EXE.

1. **Contract tests** — `node test/echo-service.js`: all assertions
   PASS (6 groups): address normalisation + fail-closed mode
   resolution; HTTP contract byte-for-byte (headers, paths, methods,
   XFF ignored by default); trust-proxy mode (XFF honoured, garbage
   falls back to the socket); rate limiting (429 + Retry-After); the
   REAL client observer recording the live service's answer as
   `browser-runtime` in a real store; HTTPS mode with a throwaway
   cert serving the same contract.
2. **Real-engine proof** — `stage0-measure/run-echo-endpoint-proof.js`,
   exit 0, **14/14 checks PASS** (full JSON in the results file):
   the real service in HTTPS mode + the real
   `CamoufoxPlaywrightController` (direct native profile) +
   `observeRuntimeExitIp` invoked with `runtimeEchoUrl =
   https://127.0.0.1:<port>/ip` in exactly the shape `main.js` uses.
   Three sources of truth cross-checked: the returned entry, the
   store reloaded from disk, and the service's own request log (the
   browser's connection appears as a new hit and the recorded IP
   equals the address the service logged for it). The warning
   service then consumes the store (`ipWarnings` status `ok`), and
   after a second profile records the same exit IP, the D3
   `shared_exit_ip` warning fires naming BOTH profiles — the
   runtime-labelled observation participates in a real warning
   report. Negative controls in the same live session: a 404 path
   (`reason=http-404`) and a dead endpoint (`reason=fetch-failed`)
   each record nothing.
3. **CLI entrypoint smoke** — `node tools/echo-service/echo-service.js`
   with no TLS configured refuses to start (exit 2, explicit
   message); with `ECHO_ALLOW_HTTP=1` on loopback it serves the
   contract and prints the plain-HTTP warning.
4. **No regressions** — adjacent suites re-run on this branch:
   `test/runtime-egress-observation.js`, `test/auto-ip-warnings.js`,
   `test/warning-service.js` (see the delivery report for outputs).
   This branch adds files only; it modifies no existing source.

Lab accommodations in the proof, stated plainly: headless launch
(no display on this host) and `ignoreHTTPSErrors` in the injected
launcher seam (throwaway self-signed lab cert). Production with a
publicly trusted cert needs neither for TLS verification; the
in-page fetch, the contract, and the recording path are unaffected.

## Security review of the service

**What the service learns about customers.** A request carries no
identifier of any kind: the client sends a bare GET with
`credentials: 'omit'` — no cookie, no profile id, no license token,
no header the app adds. The service therefore learns only "source
address X fetched at time T", plus what any TLS terminator sees
(client hello metadata) and, in the log line, the request path. It
cannot tell which customer, which profile, or even which app install
a request came from; two profiles on one machine are
indistinguishable from one. The residual exposure is real and stated
plainly: **the operator of the endpoint accumulates a timing log of
customer exit addresses.** That is inherent to any echo design (the
address IS the answer), and it is why the retention stance (≤ 7
days, one-line minimal log, `ECHO_LOG=off` available) is part of the
deliverable rather than an afterthought.

**Why self-operating beats a public echo service for this product.**
Pointing `runtimeEchoUrl` at a public IP-echo (ipify and friends)
would hand exactly that timing log — every customer's exit IP, at
every profile start, across the whole fleet — to an unrelated third
party, for a product whose customers run many sensitive accounts and
whose selling point is not leaking linkage signals. Concretely:
(i) *confidentiality* — the third party gains a correlation dataset
about the customer base that LHM itself deliberately minimises;
(ii) *integrity* — a third party (or anyone who compromises or
impersonates it) can return wrong or deliberately shared addresses
and poison the D3 warnings customers act on; the fail-closed client
cannot detect a plausible-but-false IPv4; (iii) *availability and
contract drift* — their rate limits, outages, cookie-setting, or
format changes become LHM's missing evidence, silently; (iv)
*terms* — bulk automated use of free echo endpoints commonly
violates their terms. Self-operating costs one small VPS and one
file; it keeps the data with the party the customer already trusts,
pins the contract with tests in this repo, and keeps outages in the
fail-closed direction (nothing recorded).

**Service hardening choices.** Plain HTTP is refused by default: the
response is an observation the app trusts, and a plain-HTTP path
would let an on-path attacker rewrite it — the only HTTP modes are
loopback lab use and the loopback hop behind a same-host TLS proxy,
both behind an explicit env opt-in with a startup warning.
`X-Forwarded-For` is ignored unless `ECHO_TRUST_PROXY=1`, so a
direct caller cannot spoof the address the app will record; the
deployment guide ties that flag to the loopback-bind proxy topology
and warns against enabling it on an exposed service. TLS minimum is
1.2 in direct mode. No cookies are ever set, no redirects ever
emitted, response bodies are constant-shape JSON, and the rate
limiter's key map is size-bounded so address churn cannot grow
memory without limit. The service needs no secrets of its own
beyond the TLS key in direct mode, and it stores nothing at rest:
a compromise of the VPS yields the ≤ 7-day log and future answers
until redeployed — it cannot reach back into customer machines,
which only ever make an outbound GET.

**Honest limit.** If LHM operates the endpoint, LHM is the party
holding that timing log; customers who prefer that even LHM not see
it can leave `runtimeEchoUrl` unset (runtime observation simply
stays off — the config gate is the consent mechanism). A
customer-facing privacy line to that effect belongs in the customer
guide (Agent 14's docs); proposed wording is left to the coordinator
rather than edited here.

## Coordinator wiring proposal (not applied on this branch)

`package.json` test chain — append after the existing
`node test/runtime-egress-observation.js && node --check src/health/runtimeEgressObservation.js`
segment:

```
node test/echo-service.js && node --check tools/echo-service/echo-service.js
```

No other shared-file changes. No app wiring is needed: `main.js`
already reads `settings.runtimeEchoUrl` and passes it through; the
owner-side activation is exactly one settings value plus the
deployment in DEPLOY.md.

## NOT_RUN register (unchanged by this work)

- **Runtime ≠ manager distinction through a real proxy — NOT_RUN,
  Gate 3.** On loopback both sources are 127.0.0.1 by construction;
  the proof establishes the labelling and the pipeline, not an
  address distinction. Needs a controlled proxy with a distinct
  egress.
- **Windows / packaged EXE — NOT_RUN, Gate 3.** Proof is Linux with
  the lab binary.
- **Public deployment itself — NOT_RUN.** No VPS/domain was
  provisioned; DEPLOY.md is prepared and the service is proven on
  loopback HTTPS. Standing the endpoint up is an owner
  infrastructure action.
- **IPv6 callers** — out of scope by design (client pipeline is
  IPv4-only); behaviour is defined and tested (honest null answer,
  nothing recorded).
