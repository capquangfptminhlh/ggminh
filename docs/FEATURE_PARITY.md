# LHM Ads Browser — feature parity and acceptance gate

This matrix is based on the user's AdsPower feature survey, not a claim that the
third-party product has been copied or audited completely. The source survey
itself could not access all expired-plan paid screens.

**Current position: NOT FEATURE COMPLETE.** Building an EXE and passing CI means
the tested code compiled; it does not demonstrate feature parity with AdsPower.

Run `npm run parity:report` for a concise machine-readable report.
Run `npm run parity:gate` to check full-parity readiness (expected to fail until
all requirements are implemented and evidence is recorded).

Legend: `missing` = no full implementation, `partial` = some usable pieces
without complete acceptance, `verified` = capability implemented and verified
against its stated acceptance. A feature must not be marked verified because
only its UI has been added or a mocked CI test passed.

Do not add cookie/session export, device fingerprint deception or unattended
ad-platform actions as shortcuts to parity. Favor explicit authorization,
platform-compliant operations and robust security testing.

| Requirement | Current state | Gap | Acceptance |
| --- | --- | --- | --- |
| Isolated profile browser cores | **partial** | No maintained native Chromium/Firefox fork or reliable per-profile OS/kernel emulation | Verified engine-level isolation on actual Windows Chrome, Edge and Firefox |
| Profile management and mass operations | **partial** | No selective revocable profile sharing, Cookie import, account linkage or full workbook parity | Functional bulk CRUD and crash/rollback tests with real browser state |
| Native fingerprint controls | **partial** | No source-level browser implementation of timezone, WebRTC, GPU/Canvas/WebGPU, device identity, OS feature consistency or TLS controls | Cross-context browser-engine fingerprint consistency, device tests and native-source review |
| Proxy Center | **partial** | Missing SSH/HTTPS variants, rotation scheduler, location/ASN targeting, vendor integration | End-to-end real proxy network tests with failure/rotation conditions |
| Extension Center | **partial** | Chrome/Edge command line activation not verified; no ZIP, Web Store, cloud distribution or Firefox add-ons | Packaged Windows activation tests with real Chrome/Edge versions |
| Multiwindow Synchronizer | **partial** | No master/slave click/input/scroll/tab synchronization, multi-monitor layout or keyboard shortcuts | Real desktop synchronized interactions tested with explicit user authorization |
| RPA Plus and workflow marketplace | **partial** | No mature drag-drop editor, cross-profile execution, template marketplace or multi-user permissioning | Editor, scheduler and audit end-to-end tests and independent human approvals |
| AI Agent | **partial** | No bounded multi-step autonomous agent, tool approvals, reliable browser interaction, cost ledger or recovery checkpoints | Audited tool policies, explicit approvals, budget guard and real test workflows |
| Local API and CLI | **partial** | Not complete AdsPower API parity; no standalone Windows CLI; MCP intentionally not exposed | Documented versioned API contract, authorization and e2e compatibility tests |
| Team roles, permissions and activity logging | **partial (foundation only)** | Tenant/group RBAC and one-use invites are policy-only; no authenticated or deployed team service | Independent account RBAC and tenant isolation penetration tests |
| Secure multi-device cloud sync | **partial (foundation only)** | Local AES-GCM portable metadata codec only; no encrypted sync server, cross-device conflict resolution, revocation, history or migration | Encrypted transport/rest, cross-device conflict tests, recovery and secure sharing |
| Team and device safety settings | **partial** | No per-role IP allowlist, enterprise 2FA, full bandwidth/media or device settings | Windows-level settings verification and enterprise policy tests |
| Cache snapshots and recovery | **partial** | No encrypted browser-session snapshot restore, cloud caches, granular storage-class deletion | Session recovery and data-integrity checks after crash |
| Billing, plans and integrated providers | **missing** | No subscriptions, proxy marketplace, entitlements, purchases or credits | Payment compliance, entitlement, chargeback and accounting verification |
| Cloud Phone integration | **missing** | No third-party cloud-phone support or device lifecycle integration | Provider contract tests and permissioned device sessions |

## Release gates

1. Build and unit tests pass on supported platforms.
2. At least one real Windows workstation test per browser engine.
3. Security review for OS-encrypted credentials, local API and extension import.
4. Verified end-to-end tests of session isolation, proxy networking and browser windows.
5. Role-based access, cloud sync, cost policies and recovery tests **if** full AdsPower parity is required.
6. Every matrix entry is marked `verified` with linked evidence. A passing
   subset must never be described as “100% finished.”

This checklist is intentionally conservative. It is not a promise that all
items can be delivered in one coding session.
