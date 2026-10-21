# DNS Lab — Stage-0 (Constitution 4.1 DNS row, 19.3, 23)

The product previously had **no DNS measurement point at all**. This
lab is the minimal mechanism that the Constitution's DNS row names as
its observation method — *a controlled domain plus a resolution
log* — packaged for reuse:

| File | Role |
|---|---|
| `dns-lab-server.js` | Minimal authoritative DNS server (Node stdlib only, hand-built wire format). Wildcard zone `a5dns.test` (RFC 2606 `.test`): A → 127.0.0.1, other qtypes → NODATA. Out-of-zone names are forwarded to an optional upstream (and logged) or REFUSED. **Every** query is logged as JSON: time, source, transport, qname, qtype, action. Serves UDP **and** TCP (an authoritative server must do both). |
| `run-dns-lab.js` | Real-engine run: redirects the browser's resolver to the lab, loads a measurement page whose subresources live on unique per-run subdomains, and correlates the DNS log with HTTP hits and the page's own load report. Two variants: shipped defaults, and `network.trr.mode=5` (DoH off). |
| `test-dns-lab.js` | Contract tests for the server (answer/logic battery over TCP; UDP + forwarding batteries gated on a live UDP-loopback probe of the current environment). |
| `agent5-dns-lab-results.json` | The 2026-10-21 run record (see §23 fields inside: commit, engine sha256, OS, timestamps, full ordered resolution sequences). |

The lab **only observes** resolution. It makes no judgement about
any address and contains no IP scoring/quality logic (19.1/19.2).

## How to run

```bash
# unit/contract tests (no root needed; ephemeral ports)
node stage0-measure/test-dns-lab.js

# real-engine run (root, for port 53 + mount namespace)
LHM_PLAYWRIGHT_CORE=<path to playwright-core dir> \
LHM_CAMOUFOX_EXECUTABLE=<path to lab camoufox binary> \
node stage0-measure/run-dns-lab.js
# prints the §23 JSON report to stdout; exit 2 = NOT_RUN + reason

# standalone server, e.g. for a Windows/CI variant of the run
node stage0-measure/dns-lab-server.js   # LHM_DNS_LAB_PORT/UPSTREAM/LOG env
```

## Resolver redirection — mechanism and limits

The runner re-executes itself inside a mount namespace
(`unshare -m`) and bind-mounts a lab `resolv.conf`
(`nameserver 127.0.0.1`, `options use-vc timeout:2 attempts:2`)
over `/etc/resolv.conf` **for the lab process tree only**. The
host's file is never modified (in this sandbox it is itself a
read-only bind mount; verified unchanged after every run). This is
a *system-level* redirect: Firefox's native resolution on Linux goes
through `getaddrinfo`, which is what the redirect captures.

Limits, stated plainly:

- **Transport here is TCP, by necessity.** This sandbox does not
  deliver UDP loopback at all — evidence: a raw Node `dgram`
  echo and a Python socket echo on 127.0.0.1 both went unanswered,
  and Python's `sendto` returned `EPERM` ("Operation not
  permitted"). glibc is therefore told `use-vc` (DNS over TCP).
  The lab server implements UDP fully and its UDP battery runs
  wherever the transport works (Windows, standard Linux); the
  *content* observed (names, order, qtypes) does not depend on the
  transport.
- **Environment hygiene, disclosed:** the browser is launched with
  the sandbox's `*_PROXY` egress variables removed. With them
  present, a control run produced **zero** lab queries and
  `NS_ERROR_NET_RESET` — the browser's system-proxy path resolved
  names at the sandbox proxy, never consulting the local resolver.
  Those variables are an artifact of this sandbox, not of the
  product or of a customer machine.
- **DoH is a blind spot of any resolv.conf-based lab.** If a build
  resolves a name over DNS-over-HTTPS, that lookup never touches
  the system resolver and the lab cannot see it. Absence of a name
  from the log is absence of observation on that channel (19.4),
  not proof of anything. See NOT_RUN below.
- The run is **direct, loopback, Linux lab binary** — not the
  packaged app, not Windows, not the proxy path.

## What the 2026-10-21 run observed (verbatim summary)

Full record: `agent5-dns-lab-results.json` (commit `07150d6`,
engine sha256 `2a2cb03f6ca4…`, Linux, two variants — shipped
defaults and TRR-off — with fresh profiles and unique labels
`de73ed33`-style per run; final clean run labels in the file).

Per variant, **39 in-zone queries, 0 out-of-zone queries**:

- For **each** origin (page, css, js, img, api, frame) the browser
  first asked an **HTTPS (type 65)** record for the by-type owner
  name `_<http-port>._https.<host>`, then A/AAAA pairs for the host
  itself (A answered 127.0.0.1; AAAA NODATA).
- The `dns-prefetch` hint name was resolved (HTTPS + A + AAAA) and —
  correctly — produced **no HTTP request**.
- Every resolved content name was followed by its HTTP request to
  the lab server (correlation complete); the page reported img,
  iframe, script and fetch all loaded.
- **No name outside the lab zone was queried through the system
  resolver** during these short fresh-profile runs (no service or
  telemetry lookups observed). Scope-bound: a short loopback
  session; not a statement about longer or real-network sessions.
- The two variants' sequences were effectively identical: for the
  names in scope, shipped defaults already used the native resolver
  path here; forcing TRR off changed nothing observable. This says
  nothing about DoH behaviour for other names or configurations.

Two harness defects were found and fixed during the first runs
(truncated 1×1 GIF body making the page report an image error, and
a missing CORS header making the page's fetch report failure —
both while the DNS and HTTP evidence showed delivery). They are
recorded here because they are exactly the class of error this
lab exists to catch: **a page-level report is not resolution
evidence; the resolver log is.**

## Mapping to Constitution 4.1

| 4.1 row | State after this lab |
|---|---|
| DNS — real resolver (controlled domain + resolution log; handling: resolve via the proxy route) | **Observation mechanism: BUILT and RUN** on the direct/native path (this run). The row's *handling* decision (resolution follows the profile's proxy route) is **still UNMEASURED** — no proxy was in this run. Proposed status wording for the owner: "ĐÃ CÓ đầu đo (lab, direct/native); CHƯA ĐO trên đường proxy". Per §13 only the owner edits the Constitution. |
| WebRTC ICE / TLS / HTTP2 / header order / IPv6 / QUIC rows | Untouched by this lab; remain CHƯA ĐO as recorded. The DNS lab does show the browser emitting type-65 (HTTPS/SVCB) lookups before connecting — relevant context for the TLS/QUIC rows, not a measurement of them. |

## NOT_RUN register (with the condition that would run each)

| Item | Why not run | Condition needed |
|---|---|---|
| DNS through the profile **proxy route** (the 4.1 handling) | No controlled proxy in this lab; loopback direct only | Proxy lab: a SOCKS/HTTP proxy under our control whose own resolver behaviour is observable, or proxy-side logging; then repeat this run with the profile configured for that proxy |
| **UDP transport** battery in this sandbox | Sandbox does not deliver UDP loopback (probe evidence above) | Any standard host (Windows target machine or normal Linux) — the battery self-detects via its probe |
| **DoH behaviour** of the build | DoH bypasses resolv.conf; not observable from this log | A trusted DoH endpoint under lab control (custom TRR URI + CA in profile), or packet capture on a controlled network |
| **Windows / packaged EXE** run | Acceptance environment per Constitution 12 gate 3 | Owner's Windows machine or Windows CI: on Windows the redirect mechanism differs (adapter DNS settings / local forwarding); the server and page in this lab are OS-agnostic, the runner's namespace wrapper is Linux-specific and reports NOT_RUN there |
| Long-session / real-network DNS (background lookups over time) | This run is a short fresh-profile loopback session | Controlled real network + longer soak runs; re-run this same lab against routable lab addresses |
