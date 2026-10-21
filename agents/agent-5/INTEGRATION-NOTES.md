# INTEGRATION NOTES — Agent 5: DNS Lab (commercialisation wave)

Agent 5 added NEW files only; no shared file was touched. Everything
below is a proposal for the coordinator (owner of package.json,
workflows, README).

## New files (all under stage0-measure/ + this note)

- `stage0-measure/dns-lab-server.js` — authoritative DNS lab server
  (UDP+TCP, stdlib only), wildcard zone `a5dns.test`, full query log.
- `stage0-measure/run-dns-lab.js` — real-engine runner (mount-
  namespace resolv.conf redirect, two variants, §23 JSON report).
- `stage0-measure/test-dns-lab.js` — contract tests.
- `stage0-measure/DNS-LAB.md` — mechanism, limits, observed results,
  NOT_RUN register.
- `stage0-measure/agent5-dns-lab-results.json` — the 2026-10-21 run
  record (Linux, engine sha256 2a2cb03f…, commit 07150d6).

## Verification the coordinator can repeat

```bash
node stage0-measure/test-dns-lab.js
# TCP battery PASS; UDP battery self-reports NOT_RUN in THIS sandbox
# (UDP loopback undelivered — probe evidence in DNS-LAB.md), PASS on
# hosts where UDP loopback works.

LHM_PLAYWRIGHT_CORE=<playwright-core dir> \
LHM_CAMOUFOX_EXECUTABLE=<lab camoufox binary> \
node stage0-measure/run-dns-lab.js   # root; exit 2 = NOT_RUN + reason
```

Existing stage0 suites were re-run after adding these files:
`node stage0-measure/test.js` and `node stage0-measure/test-isolation.js`
still PASS (no shared stage0 file was modified — core.js untouched).

## Proposals for the coordinator

1. **package.json test chain**: append
   `node stage0-measure/test-dns-lab.js` to `stage0:test` (after
   `test-isolation.js`) and `node --check` entries for
   `dns-lab-server.js` and `run-dns-lab.js`. The test is
   environment-honest: its UDP section reports NOT_RUN in sandboxes
   without UDP loopback instead of failing.
2. **CI (Windows)**: a DNS lab step needs the Windows redirect
   mechanism first (the runner's mount-namespace wrapper is
   Linux-only and self-reports NOT_RUN elsewhere). Suggested order:
   port the redirect (adapter DNS → 127.0.0.1, restore after), then
   run `run-dns-lab.js` with the CI Camoufox. Do NOT add the step
   before the port exists — it would only ever print NOT_RUN.
3. **Constitution §4.1 DNS row** (owner-only edit per §13): proposed
   wording — "ĐÃ CÓ đầu đo (lab DNS, đường direct/native, Linux);
   CHƯA ĐO trên đường proxy và trên Windows/EXE". Agent 5 does not
   edit the Constitution.
4. **Next measurement in this line** (not built here): repeat the
   run with the profile behind a controlled proxy to test the 4.1
   handling decision ("phân giải qua tuyến proxy") — needs the proxy
   lab; see DNS-LAB.md NOT_RUN register.

## Discipline notes

- Observation only: the lab logs and answers; it contains no IP
  scoring/quality logic and draws no conclusion about any platform
  linking profiles (§19.2).
- All names are synthetic (`*.a5dns.test`, unique random labels per
  run); the only non-lab name used anywhere is `example.com` inside
  a one-shot upstream reachability probe and unit tests, and
  `example.org` against a fake local upstream in tests.
