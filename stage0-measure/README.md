# Stage-0 measurement: local-first Camoufox core preview

This **operator-only diagnostic** drives two concurrent, disposable Camoufox persistent contexts through this branch's actual controller. It creates a local HTTP test origin on 127.0.0.1. It does not visit third-party sites or use personal browser profiles.

## Run on the actual Windows PC

1. Check out integration/v5.8-core-selective; record the Git HEAD. Install Node.js 22+ and run npm ci.
2. Obtain a Camoufox distribution you are **authorized** to use. Verify the camoufox.exe SHA-256 against an **independently trusted publisher release manifest**. A hash computed from an unknown binary does not prove trust.
3. Run in PowerShell 7 with that approved digest:

    pwsh -NoProfile -File .\stage0-measure\run.ps1 -CamoufoxExe 'C:\approved-engine\camoufox.exe' -ExpectedExeSha256 '<approved-64-character-hex-digest>'

Generated files: only a redacted stage0-measure-results/stage0-local-report.json in the checkout, ignored by Git. Temporary synthetic profiles under %TEMP% are deleted after clean close; if cleanup fails, the report explicitly warns. Never upload private profile data or proxy credentials.

## Meaning of PASS

- Two real Camoufox contexts are open at the same time.
- A writes synthetic cookie, LocalStorage, IndexedDB, CacheStorage data.
- Fresh B cannot read A; after B writes its own data, neither leaks into the other.
- A/B each preserve their state on stop/restart.
- Browser-exposed UA/platform/languages/screen/timezone are measured. Equal values do **not** prove linked identities; different values do **not** prove unlinkability.

## NOT_RUN until separate acceptance

- A real installed and publisher-signed LHM customer executable (the test uses a gated in-process controller in lab mode).
- Live authorized proxy routing, public IPv4/IPv6 egress, DNS resolver logs, WebRTC/STUN/QUIC packet capture and broken proxy fail-closed evidence.
- Production distributor rights, Authenticode, clean-Windows installed-app acceptance, secure updates and rollback.
- Any claim that a website cannot associate profiles.

CI Windows is a **different machine** from your Windows PC and cannot replace acceptance on your PC.
