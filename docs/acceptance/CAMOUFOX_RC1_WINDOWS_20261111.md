# Camoufox RC1 — Windows evidence status (2026-11-11)

Status: **RC evidence only; not approved for customer release**.

## Bound artifacts

- Engine: Camoufox `156.0.1-beta.36`.
- `camoufox.exe` SHA-256: `a235730786ee4e27b7e5087751509b2d456b0f03ce73d04bbb1b9077458764c6`.
- Release ZIP SHA-256: `d619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869` (1,364,568,719 bytes).
- Fresh Preview installer SHA-256: `f0a876bd8b7b4e39bd2f7f428743a8e7e53b96841b14a5b53e098079f5c62f81` (128,194,866 bytes).
- The engine release on GitHub remains a draft. The current publisher key is a local staging key, not the offline production key required by QD-02.

## Windows results

| Gate | Result | Evidence/limit |
|---|---|---|
| Signed tree and packaged descriptor | PASS | 1,579 files; archive digest and Ed25519 manifest verified; installer includes only public metadata, not engine/private key/loose manifest. |
| Real archive install service | PASS | The 1.36 GB RC archive was installed by `CamoufoxInstallService` into an isolated D: acceptance root; extraction and all-file verification passed; the installed executable retained the pinned SHA-256. From that installed path: two configured profiles passed identity/storage/cleanup; WebGL matched 2/2 per profile; direct and lab-proxy WebRTC observations reproduced. Local archive seam only—GitHub download and real-proxy P2 remain NOT_RUN. |
| Pinned identities | PASS | Two synthetic identities matched their own locale, timezone, navigator, screen and WebGL expectations across launch and restart. |
| Storage isolation | PASS | Cookie, localStorage, IndexedDB, Cache Storage and Service Worker remained separated for baseline, concurrent cross-write, restart and directory snapshot/restore. |
| Crash recovery, 10-second flush | PASS | All five stores persisted; the other profile was unchanged. |
| Crash recovery, 1.5-second flush | KNOWN FINDING | localStorage reverted to its last committed value; the other four stores persisted and no cross-profile data appeared. This is the documented engine durability window, not an isolation pass. |
| WebGL real GPU | PASS | Both profiles matched vendor/renderer 2/2; extensions, parameters, shader precision and render hashes were measured headful. |
| Canvas, Audio Offline, fonts | MEASURED | Canvas exports were internally consistent; Audio Offline was measured after the Xray-safe probe fix; font probing detected 29/45 candidates in each profile. Font probing is not a full installed-font inventory. |
| WebRTC direct | MEASURED | Host candidates were mDNS; public srflx equalled the direct exit IP. |
| WebRTC lab proxy | MEASURED | No ICE candidates or STUN datagrams were exposed behind the controlled proxy route. |
| Real customer proxy, DNS route, runtime egress | NOT_RUN | Requires an authenticated test proxy, controlled echo endpoint, and the approved DNS-lab adapter procedure. |
| Resource benchmark | NOT_RUN | The 16 GB host had less than the mandatory 20% free-RAM reserve. No applications were terminated to force a result. |
| Historical packaged `win-unpacked` UI smoke | PASS | Isolated temporary user-data, process exit 0, 13 distinct PNG captures, smallest capture 103,871 bytes, and empty stderr. The preflight packaged UI gate requires a measurement tied to the candidate installer hash. |
| Installed-client clean Windows acceptance | NOT_RUN | This developer machine is not a clean Windows acceptance VM; the draft/staging-key release must not be promoted to simulate this gate. |

## Verification

- The original candidate at `94c5ef88fdc421a2b276a2c286144f88a4d002ed` historically passed 351/351 selected `npm test` steps and the Camoufox publisher, trust, descriptor, and resource pretests.
- The original `npm run build:win` passed. Packaged `resources/lhm-camoufox` contained the verified public metadata.
- At the final hardening revision, `npm test` passed 352/352 selected steps and all four Camoufox pretests. The separately scoped `a66a109` rebuild below is the latest installer build in this record.

## Expected release preflight state

For the RC evidence at the pre-run checkpoint recorded before commit
`116555f`, the expected preflight state was **BLOCKED**. At that checkpoint,
Task 8 and the live release preflight had not yet run; the observed run is
recorded below.

The incomplete categories are:

- Production publisher ceremony receipt.
- Real proxy P2, DNS route, and browser-runtime vs manager egress evidence.
- Required 8/16/32 GiB × workloads × concurrency resource rows.
- Clean install/upgrade/uninstall-retention owner receipt.

Capability releases remain empty, and the draft release remains unpublished.
Do not claim completion or create receipts to fill these gaps.

## Release decision

`resources/camoufox-engine/capabilities.json` intentionally keeps `releases: []`.
Do not publish the draft release or market Camoufox as “100%”, “sub-50ms”, or approved for Google/Facebook. Customer enablement remains fail-closed until the real-proxy/DNS/runtime, resource, clean-install and production-key gates are completed.

## Observed preflight run (2026-11-12)

The live preflight ran against the previously documented installer, SHA-256
`f0a876bd8b7b4e39bd2f7f428743a8e7e53b96841b14a5b53e098079f5c62f81`
(128,194,866 bytes), candidate commit
`94c5ef88fdc421a2b276a2c286144f88a4d002ed`. It exited 2 with overall
`BLOCKED`: artifact trust PASS; publisher ceremony MANUAL_REQUIRED; configured
identity PASS; storage isolation BLOCKED (wrong environment); crash durability
BLOCKED (wrong environment); graphics fingerprint PASS; real-proxy network
BLOCKED (P2 not measured); resource capacity BLOCKED (required report missing);
packaged UI BLOCKED (process exit not measured); clean install/upgrade
MANUAL_REQUIRED. These results apply only to that installer hash.

The final hardening rerun against the same installer hash also exited 2 with
an overall `BLOCKED` result. The packaged UI report has an explicit `BLOCKED`
run status and lacks a measured digest for that installer. The saved preflight
report passed the sensitive-data scan.

A separate Windows build at source commit `a66a1099959951248f344523eca860cbeebaac4b`
produced an installer of 128,201,560 bytes with SHA-256
`0157436f31d798587ca6f48ba83cab8a141384efe950fc9ee31d0855f9fc37dd`.
Because this differs from the preflight candidate, the prior packaged-UI
evidence is stale for this build; packaged UI remains BLOCKED pending a rerun
against this exact installer hash. Clean install/upgrade remains NOT_RUN and
MANUAL_REQUIRED. The strict resource verifier also passed against this build's
packaged `resources/lhm-camoufox` directory. The build remains unapproved for release.

## Automated hosted-runner install evidence

The repository now provides a manual, read-only hosted-Windows workflow for
exact-artifact clean install, install-over-existing continuity, UI capture,
uninstall and synthetic-data retention. Its output is supporting CI evidence
only. It does not satisfy the independent clean-Windows owner receipt, does not
exercise a production-signed Camoufox engine or real customer proxy, and cannot
change the `BLOCKED` release decision by itself.

The first operational dispatch completed successfully on 2026-11-13:

- acceptance run: `43394773678` —
  https://github.com/capquangfptminhlh/ggminh/actions/runs/43394773678
- baseline: commit `4e46426c8e7ecb45f267c1fb8536697269b19d25`, build run
  `43176842323`, installer SHA-256
  `e6ab24c344b765781624fdfc10b0605ed8dcb68235d351f2c4f28309e6f1185b`;
- candidate: merge commit `bfbbf6143ed9676d931cb2535e27a5916570f4a0`, build run
  `43394224702`, installer SHA-256
  `625b5cbb039d271ec5023acb19a7bef0891af166c06b23c8c77dd602ab29219d`;
- evidence report SHA-256:
  `7508cad10394b97d19773d751b55d23d0c50c65cfbf01ff7c936001c8be070db`;
- outcome: `AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY`.

All eight automated observations passed, including install-over-existing,
candidate relaunch, uninstall, scoped process cleanup and synthetic-data
retention; the packaged UI capture count was 12. This closes only the automated
hosted-runner evidence item. The independent owner clean-Windows receipt,
production Camoufox publisher ceremony, real-proxy/DNS/runtime measurements and
resource matrix remain incomplete. The release decision therefore remains
`BLOCKED`, and the observed installer remains unsigned.
