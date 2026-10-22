# Windows measurement pack — the sandbox-impossible measurements, ready to run

Operator-only diagnostics for the owner's Windows machine. Each
script packages a measurement that **could not be run in the Linux
sandbox** where the earlier waves worked (that sandbox delivers no
UDP on any address, has no GPU, and has no real proxy), as a
ready-to-run script whose output is a Constitution **Section 23
bound record**: app commit, engine version + SHA-256, OS, the
relevant configuration (secrets redacted), timestamps, method and
scope, expected vs observed, and explicit `NOT_RUN` entries for
anything not measured.

Tier discipline (Section 23): these runs drive the **real engine
through the app's own controller / lab harnesses** on the owner's
machine. They are *not* packaged-EXE acceptance — Gate 3 (installed
EXE through its real UI) remains a separate, still-open gate, and
nothing in this pack substitutes for it.

Rules every script follows:

- **Synthetic profiles and markers only.** No customer profile,
  cookie or credential is ever touched.
- **Fail-closed.** A missing prerequisite prints
  `{"status":"NOT_RUN", reason}` and exits 2. A finding (a
  mismatch, an unexpected candidate) is recorded as data with exit
  0; the runner itself failing exits 1. No script converts missing
  evidence into a pass (Sections 16, 19.4).
- **Credentials only via environment variables**, never printed:
  report configuration passes through a redactor; the proxy
  password is replaced by `***` wherever the config is recorded.
- Reports are written to `stage0-measure-results/windows-pack/`
  (git-ignored) and printed to stdout.
- Ambient `*_PROXY` environment variables are removed for browser
  processes the pack launches (disclosed in every report): an
  inherited proxy would silently reroute resolution/egress and
  corrupt attribution — the measured proxy plan is the profile's
  own (Agent 5/6 precedent).
- Every script has a `--check` mode that validates its non-network
  logic on synthetic vectors and prints the bound record with all
  network sections marked `NOT_RUN`. That mode is what is
  smoke-tested on Linux (`test-windows-pack.js`).

## Prerequisites

1. This repo checked out at the commit being measured, `npm ci`
   done (Node 22+), on the Windows machine that will be measured.
2. The Camoufox binary to measure, with its SHA-256 pinned:
   ```powershell
   $env:LHM_CAMOUFOX_EXECUTABLE = 'C:\path\to\camoufox.exe'
   $env:LHM_CAMOUFOX_EXE_SHA256 = '<64-hex digest>'   # optional; enforced when set
   ```
   A hash computed from an unknown binary does not prove trust —
   verify the digest against the publisher-signed release manifest
   as for any engine install.
3. Per script: a public STUN server you trust (01), a real GPU
   (02), elevation + one adapter change (03), an authenticated real
   proxy + an LHM echo endpoint (04). Details per script below.

## Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `LHM_CAMOUFOX_EXECUTABLE` | all | Path to the Camoufox binary under measurement (required). |
| `LHM_CAMOUFOX_EXE_SHA256` | all | Optional pinned digest; a mismatch aborts the run (fail-closed). |
| `LHM_PLAYWRIGHT_CORE` | all | Optional path to a playwright-core module directory (default: the repo's pinned package). |
| `WINPACK_PUBLIC_STUN_URL` | 01 | e.g. `stun:stun.example.org:3478` — a STUN server **you** operate or trust. None is hardcoded: the public-srflx variants are `NOT_RUN` until you set it. |
| `WINPACK_PROXY_TYPE` / `WINPACK_PROXY_HOST` / `WINPACK_PROXY_PORT` | 01 P2, 03 B2, 04 | Your real proxy (`http` or `socks5`). |
| `WINPACK_PROXY_USER` / `WINPACK_PROXY_PASS` | 01 P2, 03 B2, 04 | Its credentials. Required for controller variants: the product controller's proxied mode is *authenticated-connect only*. Never printed. |
| `WINPACK_ECHO_URL` | 04 | Full URL of an LHM-controlled echo honouring the runtime-observation contract: `200` JSON `{"ip": "..."}`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`, no redirect. |

---

## 01 — `01-stun-srflx.js` · WebRTC ICE / srflx on a real UDP network

Successor to Agent 6's `run-stun-investigation.js`, whose central
question — *does the browser consult the configured STUN server?* —
was unanswerable in a sandbox with no UDP transport at all.

Variants: **C0** transport controls (Node UDP client + raw UDP
delivery trials; they decide what browser silence means), **D1**
direct with the STUN server on the machine's LAN address, **D2**
direct against your public STUN, **P1** through the app controller
behind the loopback lab proxy (egress 127.0.0.20), **P2** through
the app controller behind **your real proxy** + public STUN.
Candidates are classified by the product's own
`classifyIceCandidates` (Section 19.3: type × address kind — never
"any address ≠ proxy = leak"), and P2 additionally applies the
product's `unexpectedPublicCandidates` against the expected egress.

```powershell
$env:WINPACK_PUBLIC_STUN_URL = 'stun:<your-stun-host>:3478'
$env:WINPACK_PROXY_TYPE='http'; $env:WINPACK_PROXY_HOST='<host>'
$env:WINPACK_PROXY_PORT='<port>'; $env:WINPACK_PROXY_USER='<user>'
$env:WINPACK_PROXY_PASS='<pass>'
node .\stage0-measure\windows-pack\01-stun-srflx.js
```

**Closes: Constitution §4.1, row "WebRTC ICE candidates
(host/srflx)"** (observation: RTCPeerConnection phía trang;
handling C: *cấu hình không lộ IP thật; srflx phải khớp IP thoát*).
The row's measurement gap closes when a report from a real-network
Windows run shows **all** of:

- C0 verdict = UDP transport works (so silence elsewhere is
  attributable, not a dead transport);
- D2 ran: every candidate classified; the srflx set is reported
  next to the direct exit IP (`srflxVsDirectExit`);
- P2 ran: `unexpectedPublicCandidates` is an **empty list**
  against the through-proxy expected egress, and the STUN
  server-side/packet facts are recorded (binding requests seen or
  zero — zero is a valid observation here, bounded by C0 and by
  the engine's own `camoufox.cfg` facts quoted in the report).

A non-empty unexpected-public list, or D2/P2 stuck at `NOT_RUN`,
means the row stays CHƯA ĐO or records a finding — the report says
which, per variant. P1 alone (loopback lab proxy) does **not**
close the row; it is the control that separates engine behaviour
behind *a* proxy from behaviour behind *your* proxy.

## 02 — `02-webgl-gpu.js` · WebGL on the real GPU

Successor to Agent 4's `run-webgl.js` (Linux: headless produced no
context at all; Xvfb produced a software stack). Here the browser
runs **headful on the real GPU**: the first headful combination
that creates a context is the measurement combination; a
headless-only context is labelled *control* and closes nothing.

Per synthetic profile (identities supplied via
`--identity-a/--identity-b`, or drawn by the repo's official
generator for en-US and vi-VN): the five §4.3 WebGL points via the
extended probe, each MEASURED / UNSUPPORTED / BLOCKED on its own,
plus the expectation comparison — **exactly two comparable fields
per profile** (`webglVendor`, `webglRenderer`). GL parameters have
no identity expectations (Agent 4); they are reported as measured
observations with exact measured/unavailable counts.

```powershell
node .\stage0-measure\windows-pack\02-webgl-gpu.js
# or with pre-generated identities:
node .\stage0-measure\windows-pack\02-webgl-gpu.js --identity-a A.json --identity-b B.json
```

**Closes: Constitution §4.3 WebGL rows** — "WebGL vendor + renderer
(kể cả bản không che)", "WebGL: danh sách extensions", "WebGL: các
tham số", "WebGL: độ chính xác shader", "WebGL: hash ảnh kết xuất
3D". The measurement gap closes when a report shows, for **both**
profiles, on a headful (real-GPU) combination:

- `webgl.vendorRenderer` = MEASURED, and the expectation
  comparison reports **compared = 2** per profile — with
  `pass = true` for the vendor/renderer row to support a ĐẠT
  status (a compared-2 mismatch is a *finding*: the measurement
  exists, the row cannot be marked ĐẠT — the owner words the
  status, per §13);
- the other four points = MEASURED, with the parameters point
  carrying its exact measured/unavailable counts (never "khớp
  toàn bộ" while fields are missing, §23).

## 03 — `03-dns-proxy-route.js` · DNS through the proxy route + DoH

Successor to Agent 5's `run-dns-lab.js` (observation mechanism —
controlled zone `a5dns.test` + resolution log — built and run on
the direct path only). The register row's *handling* — resolution
follows the profile's proxy route — is what this script measures,
with two lab DNS instances for attribution: `dnsSys` on
127.0.0.1:53 (the system resolver, once you point the adapter at
it) sees every **local** resolution; `dnsProxy` (ephemeral port)
is used only by the pack's own SOCKS5 proxy, so its log is
proxy-side by construction; the SOCKS proxy logs every CONNECT
target in the form received (hostname = resolution delegated;
IPv4 literal = resolved before connecting) and egresses from
127.0.0.30.

Setup, once, in an **elevated** PowerShell:

```powershell
# Point the active adapter's DNS at the lab (record your current
# setting first — you will restore it after the run):
Get-DnsClientServerAddress -AddressFamily IPv4
Set-DnsClientServerAddress -InterfaceAlias '<your adapter>' -ServerAddresses 127.0.0.1
node .\stage0-measure\windows-pack\03-dns-proxy-route.js
# When finished, restore your previous DNS, e.g.:
Set-DnsClientServerAddress -InterfaceAlias '<your adapter>' -ResetServerAddresses
```

A pre-flight SYS-PROBE verifies the OS resolver actually reaches
the lab before any adapter-dependent variant runs (evidence, not
attestation). Variants: **A-direct** (baseline correlation),
**A-trr-off** (`network.trr.mode=5`; the DoH comparison pair — a
page that loads with zero system-resolver queries is flagged
"resolution channel unobserved (DoH suspected)", an absence of
observation per §19.4, never a leak verdict), **B-lab-socks**
(`socks_remote_dns=true` through the pack proxy), **B2-real-proxy**
(your real proxy through the app controller; negative-space: any
page-name query at `dnsSys` = local resolution on the proxy
route).

**Closes: Constitution §4.1, row "DNS — máy chủ phân giải thật"**
(observation: tên miền kiểm soát + nhật ký phân giải; handling:
*phân giải qua tuyến proxy*). The handling is measured when a
report shows:

- **B-lab-socks** `routeCriteria`: page loaded AND every CONNECT
  target in hostname form AND resolutions present in the
  proxy-side log AND **zero** page-name queries at the system
  resolver AND HTTP hits from the proxy egress 127.0.0.30 — every
  conjunct reported individually;
- and/or **B2-real-proxy**: zero page-name queries at the system
  resolver while the profile was routed through the real proxy
  (the in-zone page is *expected* to fail upstream — a remote
  resolver cannot answer the lab zone; `navError` records why).

The A pair closes the DoH sub-question to this extent: identical
query behaviour with TRR on vs off for the names in scope, or the
unobserved-channel flag raised with its stated next step (packet
capture or a lab DoH endpoint). One honest limit: an adapter-based
lab cannot see DoH traffic itself; it can only catch its shadow.

## 04 — `04-runtime-vs-manager-ip.js` · runtime vs manager exit IP through a real proxy

Section 19.3 forbids substituting a manager-process result for a
profile-runtime result. Agent 7 built the runtime observation
module and proved the mechanism on loopback, where both sides are
127.0.0.1 by construction. This script makes the differentiation
through **your real proxy**: one synthetic profile via the app
controller; the manager side probes the product's `checkProxy`
through the profile's local gateway (the ProxyCenter pattern) and
the runtime side fetches your echo from inside the profile's own
page context — both recorded in one store under their own labels
(`manager-process` / `browser-runtime`), reloaded from disk,
checked against D3's normalisation, with a dead-echo negative
control that must record nothing.

```powershell
$env:WINPACK_PROXY_TYPE='socks5'; $env:WINPACK_PROXY_HOST='<host>'
$env:WINPACK_PROXY_PORT='<port>'; $env:WINPACK_PROXY_USER='<user>'
$env:WINPACK_PROXY_PASS='<pass>'
$env:WINPACK_ECHO_URL='https://<your-echo>/egress-echo'
node .\stage0-measure\windows-pack\04-runtime-vs-manager-ip.js
```

**Closes: the runtime half of Constitution §4.1, row "IP thoát"**
and the §19.3 differentiation that production wiring cannot yet
show (only `manager-process` records exist in the app today). The
gap closes when a report shows, through the real proxy:

- `managerViaProxy` and `runtime` both recorded, labels intact
  after a disk reload, D3 normalisation accepting the mixed set;
- the negative control recorded nothing;
- `comparison.runtimeEqualsManagerViaProxy` computed (expected
  `true`, with `runtimeEqualsDirect` `false` when the proxy egress
  differs from the machine's direct exit). `runtime` equal to the
  **direct** IP while the manager shows the proxy egress would be
  the finding this measurement exists to catch: the runtime not
  following the proxy route.

Without `WINPACK_ECHO_URL` the runtime half is `NOT_RUN` — it is
never replaced by the manager value (§19.3).

---

## Handing results back

The four JSON files in `stage0-measure-results/windows-pack/` are
the Section 23 records. A register status changes only by owner
decision (§13); these records are the evidence for that decision.
Per §23, a record expires when the engine, the configuration, the
proxy, or the environment changes — re-run the pack after any of
those change rather than citing an old record.

Smoke-test the pack itself anywhere (no engine, no network):

```powershell
node .\stage0-measure\windows-pack\test-windows-pack.js
```
