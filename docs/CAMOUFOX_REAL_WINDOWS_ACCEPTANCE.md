# Real Windows Camoufox acceptance — isolated upstream smoke

This is a **security and compatibility test**, not a claim of avoiding
Google, Cloudflare, CAPTCHA or account detection.

## Pinning and provenance

The separate GitHub Actions workflow
`.github/workflows/camoufox-upstream-smoke.yml` uses:

| Component | Exact value |
|---|---|
| Upstream repository | `daijro/camoufox` |
| GitHub release | `v156.0.1-beta.36` (published 2026-10-06) |
| Windows asset | `camoufox-156.0.1-beta.36-win.x86_64.zip` |
| Archive byte count | `1311638126` |
| Archive SHA-256 | `096fd4832a7a32f2aa7f7bdd07fe6253dda296cbe783acd7bc2c86cf5ae62031` |
| TypeScript launcher | `camoufox@0.5.8` |
| Playwright | `playwright-core@1.62.0` |

This SHA-256 value is the release asset digest published by GitHub. It
protects against unexpected bytes in transit and accidental changes. It
does **not**, by itself, establish the safety of upstream code or replace a
developer's release signing key. A controlled commercial build must also
review vulnerabilities and licenses, and satisfy the locally trusted
signed-manifest mechanism.

## Execution

The workflow runs on a temporary GitHub Windows runner. Only when its own
PowerShell source files or workflow definition are changed does it run on
this feature branch; it is also manually triggerable. It downloads from
the fixed, official release URL, checks exact length and SHA-256 **before**
unpacking, expands into a temporary working directory, and attempts an
ordinary Defender custom scan if enabled on that runner. If Defender is
unavailable, the logs say so; no antivirus/SmartScreen clean verdict is
claimed. **No exclusions, Defender disabling, archive concealment or
instructions to click through security warnings are used.**

The test uses Camoufox's documented TypeScript persistent-context API
with an explicitly supplied executable and **two independent data dirs**.
It navigates only to `data:` test pages, checks its own synthetic cookie
doesn't cross from A to B, closes/reopens A and checks persistence. It
does not visit Google, touch user accounts, change TLS fingerprints or
test evasion scores. A passing test proves basic process launch, profile
separation and restart only.

These test binaries and synthetic profile files are not added to the
Electron installer, GitHub build artifacts or committed repository.
The normal application remains fail-closed when an organization-signed
Camoufox distribution is absent.

A clean consumer Windows VM installation — particularly with no
developer tooling, normal Defender/SmartScreen protections, all required
fonts/dlls, offline cold startup, Proxy Center and full Automation Studio —
is a **separate release gate** and not proven by the CI workflow.

## Windows Security

Do **not** hide the EXE in an archive to dodge Defender or change Windows
Defender exclusions in an installer. The packaging format is a normal
delivery choice, not a security bypass. If Windows reports a suspicious
file, capture its SHA-256, the exact detection name, the release source
and reproducible steps; submit a suspected false-positive as a software
developer at https://www.microsoft.com/en-us/wdsi/filesubmission and
await review. Quarantine or rollback the release when in doubt.

Microsoft's 2026 SmartScreen guidance states that a new OV/EV-signed
binary can still show a reputation warning. A code-signing certificate is
not a bypass or assurance against malicious behavior.

## API correction

`firefox.launchPersistentContext()` **starts a new Firefox browser
context**. It does not attach to a running Camoufox context. Existing
Camoufox adapter owns the Playwright context returned by `Camoufox()`
and must pass that context to any future authorized Automation Studio
adapter. Chromium CDP and Firefox Playwright APIs must not be conflated.

## Storage correction

The existing `db-preview.sqlite` workflow is a comparison-only export.
It is **not** a no-downtime cutover or encrypted database yet, and there
is no plan to delete `db.json` immediately after a single successful
comparison. A future cutover requires rollback strategy, backups,
concurrent-access control, row parity, long-lived migrations and tests.


## Restore onto main — 24 October 2026

The original upstream smoke workflow was historically kept under
`release/gate2-final/`, not in the active `.github/workflows/` on main.
The restored `.github/workflows/camoufox-upstream-smoke.yml` is
independent of the normal lightweight Windows installer CI.

- Runs for a workflow-related pull request or manually with GitHub Actions.
  The upstream ZIP is approximately **1.31 GB**, so this test is deliberately
  not part of every unrelated source push.
- Downloads the audited exact upstream asset, checks size and SHA-256 before
  extraction, runs Windows browser/process, Playwright controller and synthetic
  authenticated SOCKS5 failure tests. No upstream browser binary is distributed.
- Records two Stage-0 reports from **the same checkout and Camoufox executable**.
  `tools/verify-stage0-ci-reports.js` rejects mismatched checkout/EXE digests,
  incomplete storage/identity results and missing temporary-profile cleanup.
  It keeps untested public proxy, DNS, WebRTC and internet egress as `NOT_RUN`.
- Independent publisher-signed engine distribution, real customer proxy/DNS/
  WebRTC measurements, clean installed-Windows acceptance and signed updates
  remain **separate commercial release blockers**, regardless of a CI PASS.
