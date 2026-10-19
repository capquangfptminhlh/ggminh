# ADR-0001: LHM Browser Runtime ownership, privacy and long-term browser engine

**Status:** Accepted for planning (runtime implementation not started)
**Decision date:** 2026-10-19
**Applies to:** \`ggminh\` Windows desktop browser profile manager and Automation Studio

## Context

LHM Browser currently runs an Electron desktop interface and launches installed
Chrome, Microsoft Edge or Firefox/Gecko binaries. It isolates local profile
directories, exposes opt-in loopback-only Local API capabilities, and supports
bounded, allowlisted workflow automation. A legacy experimental Chromium
extension may modify navigator/Canvas/WebGL/WebAudio/WebRTC configuration on
non-native profiles. These hooks are **not** a browser fork and have not been
verified to prevent website or platform fingerprinting.

A custom product name, unique UI, independent profiles or user-agent strings do
not make an independently maintained browser core.

## Decision

Use **two separate implementation tracks**, without presenting them as complete:

1. **Track A — Secure managed browser runtime (next engineering target).**
   Package and version an audited upstream browser runtime with the installer,
   starting with one desktop OS and architecture. Keep native API behavior by
   default, an isolated storage directory per profile, explicit approved
   automation sessions and privacy controls with verifiable behavior.
   Prefer upstream security fixes over speculative fingerprint patches.
2. **Track B — Optional upstream source fork (future decision).**
   Evaluate a Chromium or Gecko source fork only after maintaining a functional
   signed runtime and a staffed vulnerability-update/release process.
   Forking entails source intake, reproducible CI, upstream rebasing,
   graphics/network regression tests, crash reporting policy, accessibility,
   signatures, license notice compliance and update distribution.
   Do not claim a new renderer or JavaScript engine merely from using Electron.

No automatic identity fabrication, device impersonation or features promising to
evade account restrictions or anti-fraud assessments are part of this ADR.

## Main components

| Component | Short-term approach | Required verification |
| --- | --- | --- |
| LHM Desktop Shell | Existing Electron desktop UI | Real Windows smoke tests, keyboard support, accessibility |
| Runtime Registry | Signed, versioned browser runtime paths; no arbitrary downloaded binaries | Signature/hash verification, offline uninstall/recovery, rollback |
| Profile Store | Separate user-data directories, explicit local profiles | Isolation test, symlink/path-traversal defense, storage permissions |
| Secrets | OS-backed encrypted vault for proxy credentials when implemented | Secret not in logs/export/API; lock/unlock and key rotation tests |
| Proxy Transport | HTTP/SOCKS5 with no misleading claims; credentials as separate future module | TCP and real HTTPS egress checks, DNS/WebRTC disclosure audit |
| Automation | Domain allowlists, explicit human approval, bounded runs, emergency stop | Tests for navigation redirects, approvals, timeouts and cancellation |
| Privacy Diagnostics | Report declared vs observed browser/device/network properties | No secret capture; label unsupported checks “not measured” |
| Updates | Upstream patches, staged rollout, rollback | CVE triage, patch SLA, signed releases and failure recovery |

## Security principles

- Do **not** disable phishing/malware protection merely to remove vendor traffic.
  Browser network features and optional telemetry require transparent opt-in
  controls, privacy review and a documented support model.
- Do **not** sync live session cookies or authentication tokens to a shared cloud
  by default. Account and employee separation requires audited RBAC, device
  authorization, encrypted transport and at-rest encryption.
- Keep browser automation off Google Ads authentication/payment/CAPTCHA flows
  unless an explicit authorized, policy-compliant workflow is supported.
  Prefer the official Google Ads API and MCC/OAuth for business operations.
- Do not pass through native OS machine identifiers such as MAC address or disk
  serial numbers to websites; browser APIs normally do not expose them.
- Never invent a "Google risk score", a "100% undetected" value or a per-device
  universal hash. Network protocol signatures, Canvas, WebGL, Client Hints,
  storage and interaction signals are variable and not definitive identities.
- Distinguish app-level telemetry, website JavaScript observations, network
  metadata and operating-system services. Do not assert the data flows from
  vendor updater processes to Google Ads without public evidence.

## Alternatives considered

**Keep only external Chrome/Edge/Firefox:** lowest maintenance effort and uses
upstream patching; current behavior, but users must install/configure browsers.

**Package a managed upstream binary:** recommended next increment. Provides
stable versioning, startup diagnostics and better customer experience without
maintaining major modifications to Chromium C++.

**Full Chromium C++ fork now:** rejected as the immediate milestone because
security rebasing, cross-platform builds, QA and distribution are much larger
than profile GUI work. Source-patching Blink/V8 can create browser
incompatibility and does not guarantee identity unlinkability.

**Write a rendering engine from scratch:** rejected; not a realistic next step
for a small desktop product.

## Delivery milestones and acceptance gates

1. **M0:** finish functional UI tests and Windows installer smoke checks for 2.6,
   including actual preview screenshots with labeled demo data.
2. **M1:** run a pinned upstream browser binary without requiring a system-wide
   installation; enforce hash/signature verification, profile isolation and
   offline rollback. Pass tests on a clean Windows machine.
3. **M2:** support authenticated proxy endpoints with OS-backed secret storage,
   explicit diagnostics and no leakage into config backups or the Local API.
4. **M3:** structured/visual RPA with permission scopes and reliable human
   approval, cancellation and audit logs.
5. **M4:** user research and measurements to decide whether maintaining a
   source fork is justified. No fork commitment until patch operations exist.

## Known limitations

- The repository does **not** currently include a self-built Chromium, Gecko,
  Blink or V8 core.
- Browser UI smoke testing on GitHub Actions does not replace full manual
  evaluation of a signed Windows installer.
- Claims about proprietary internal Google anti-fraud scoring, BotGuard tokens
  or device-identity links remain unverified.
