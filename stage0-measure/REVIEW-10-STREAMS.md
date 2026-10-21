# Giai đoạn 2 — 10 independent CI lanes

These are ten concurrent deterministic GitHub Actions jobs, **not ten spawned AI subagents**.
The 10 jobs run unit/contract/fail-closed probes without live browser or customer credentials.
The original Windows Camoufox smoke is a separate real-browser lane.

| Lane | Goal |
|---|---|
| 01 | Executable path and SHA-256 preflight |
| 02 | Cross-profile storage isolation assertions |
| 03 | Persistence after restart and negative fault injection |
| 04 | Browser-exposed read-only snapshots |
| 05 | Server HTTP header allowlist and secret exclusion |
| 06 | UA + language mismatch recognition |
| 07 | Network evidence fail-closed contract |
| 08 | Tamper-evident checksum (not signature) |
| 09 | JSON report gate, 20 checks required |
| 10 | Source packaging boundaries and workflow evidence |

## Real Windows PC and operator-owned network lab

Check out the exact HEAD on an actual Windows PC. Run stage0-measure/run.ps1 with an independently approved Camoufox binary digest. Then, **separately**, use an operator-approved proxy to collect trusted exit IPv4/IPv6, DNS resolver logs, STUN/ICE and firewall traces, broken-proxy fail-closed outcomes and server header evidence.
Keep raw packet captures, personal IP addresses, cookies and proxy secrets in the operator-controlled lab. Never upload them with CI reports. Operator assertions and hash digests do not by themselves certify correctness.

The project stays Draft; commercial signing, clean installed-app UAT and release promotion are NOT_RUN.
