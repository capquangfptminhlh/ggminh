# Browser engine evaluation — Windows desktop, 2026-10-20

The goal is a reliable multi-profile Windows application with transparent,
authorized automation, **not** guaranteed invisibility to Google systems.

## Current engine
The app starts locally installed **Chrome / Edge (Chromium)** or **Firefox
(Gecko)** with isolated storage. It does not contain a maintained Chromium fork.
Browser version diagnostics and real Windows Chrome/Edge CI are included.
Engine compatibility must never be mistaken for anti-fraud bypass.

## Alternatives evaluated

| Engine | Source/vendor facts | Windows and commercial fit | Decision |
| --- | --- | --- | --- |
| Camoufox | Open-source Firefox fork with engine-level configuration and Playwright adapters. Its official repo warns it may not yet suit stable production use. | Must validate Windows executable, version support, security updates, compatibility, third-party licenses and reproducible builds. | Research-only option, **not** shipped or activated. |
| Hexium Browser | Python API for modified Chromium 151; README describes an alpha and **Linux x86_64 binary only**, with no Windows/macOS binary support. | Python API AGPLv3; separate binary license must be reviewed for commercial use. | **Do not integrate into Windows installer currently**. |

References:
- https://github.com/daijro/camoufox
- https://github.com/HeadlessXLabs/hexium-browser
- https://support.google.com/adspolicy/answer/15938075

## Acceptance gate for any new browser engine

1. Maintained Windows x64 binaries, authenticated vendor and secure patches.
2. License compatibility, dependency security and binary provenance audit.
3. Standard web compatibility: JavaScript, networking, permissions, WebRTC,
   accessibility, extensions, storage, proxy behavior, crashes and upgrades.
4. User-consented migration of profile data, no shared browser sessions,
   durable same-profile state and tested rollback.
5. Real Windows browser end-to-end tests on owned sites and local test pages.
6. Honest disclosure of unsupported features; do not claim a browser is
   undetectable or that new profiles are equivalent to new humans.

Automation should use predictable, user-approved workflows, allowlisted
domains, clear logs and cancellation. Do not add behavior imitation or fake
account history intended to evade advertising-policy enforcement.

**Decision**: Mainstream installed Chrome, Edge and Firefox remain default.
