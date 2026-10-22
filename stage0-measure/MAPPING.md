# Stage-0 Runtime Probe — Mapping to Constitution v1.3, Section 4

Base commit: `8349f38b829a133ab53bc4b0a874c3f7b4ff8b22` (branch
`agent-5/runtime-measure`). Scope of this mapping: constitution rows
4.2 (navigator/device), 4.3 (graphics/audio), 4.4 (fonts/voices/devices)
versus the Stage-0 probe as it existed at the base commit
(`stage0-measure/core.js`, `run.js` `captureEnvironment`,
`run-config.js` `captureEnvironment`).

At the base commit the probe captured exactly nine environment values
(userAgent, platform, language, languages, hardwareConcurrency,
screen.width/height/colorDepth, devicePixelRatio, timezone) plus the
booleans `hasUserAgentData` and `isSecureContext`. Identity comparison
(`core.identityExpectationResult`) covers 9 expectation fields; the
stored expectations also carry `webglVendor`/`webglRenderer`, which no
probe measured (the old contract test asserted they must NOT be
compared — that assertion stays valid for `identityExpectationResult`;
WebGL comparison is a separate function, `webglExpectationResult`).

Legend — Gap: NONE (already measured), NEW (added by this branch),
OUT (outside this agent's scope / another agent's rows).

| Constitution row | Existing probe at base | Gap | New point id (this branch) |
|---|---|---|---|
| 4.2 userAgent + appVersion | userAgent captured; appVersion not captured | appVersion still not captured (Firefox exposes it equal to userAgent minus prefix; noted, not a separate point) | — |
| 4.2 Client Hints low (brands/mobile/platform) | only `hasUserAgentData` boolean | NEW | `clientHints.low` |
| 4.2 Client Hints high entropy | not captured | NEW | `clientHints.high` |
| 4.2 platform / oscpu | platform captured; oscpu not captured (Firefox-only property) | NEW (inside navigatorMisc as `oscpu`) | `navigator.misc` |
| 4.2 hardwareConcurrency, deviceMemory | hardwareConcurrency captured; deviceMemory missing (unsupported in Firefox) | NEW | `navigator.misc` |
| 4.2 screen (incl. avail, pixelDepth) | width/height/colorDepth only | NEW (availWidth/Height, pixelDepth) | `window.metrics` |
| 4.2 window inner/outer + DPR | DPR only | NEW | `window.metrics` |
| 4.2 language + languages | captured | NONE | — |
| 4.2 timezone | captured | NONE | — |
| 4.2 locale formats | not captured | NEW | `locale.formats` |
| 4.2 webdriver + automation signs | not captured | NEW (webdriver flag only; broader automation-sign analysis is out of probe scope) | `navigator.misc` |
| 4.2 plugins, mimeTypes, pdfViewerEnabled | not captured | NEW | `navigator.misc` |
| 4.2 maxTouchPoints | not captured | NEW | `navigator.misc` |
| 4.2 cookieEnabled, doNotTrack, globalPrivacyControl | not captured | NEW | `navigator.misc` |
| 4.2 display media signals (color scheme, reduced motion, contrast, forced colors) | not captured | NEW | `display.mediaQueries` |
| 4.2 networkInformation | not captured | NEW | `navigator.misc` (connection subfield) |
| 4.2 storage estimate / persisted | not captured | NEW | `navigator.storageEstimate` |
| 4.2 keyboard layout map | not captured | NEW (expected unsupported in Firefox) | `navigator.keyboard` |
| 4.2 battery (Chromium only) | not captured | NEW (expected unsupported in Firefox) | `navigator.battery` |
| 4.3 canvas 2D hash | not captured | NEW — same fixed drawing task; pixel hash from `getImageData`, data-URL hash, and decoded-pixel hash so export paths are compared on normalised pixels (Section 18) | `canvas2d.hash` |
| 4.3 font metrics (canvas/DOM text measurement) | not captured | NEW (measureText widths per generic family) | `canvas2d.fontMetrics` |
| 4.3 WebGL vendor + renderer (incl. unmasked) | expectations existed; no probe | NEW | `webgl.vendorRenderer` |
| 4.3 WebGL extensions list | not captured | NEW | `webgl.extensions` |
| 4.3 WebGL parameters | not captured | NEW (curated key set; each parameter individually guarded, unavailable ones recorded per Section 18) | `webgl.parameters` |
| 4.3 WebGL shader precision | not captured | NEW | `webgl.shaderPrecision` |
| 4.3 WebGL render hash | not captured | NEW (fixed scene, readPixels hash) | `webgl.renderHash` |
| 4.3 OffscreenCanvas | not captured | NEW (availability + 2d context) | `offscreenCanvas` |
| 4.3 AudioContext basics (sampleRate, baseLatency, outputLatency, maxChannelCount) | not captured | NEW (per-field availability) | `audio.basic` |
| 4.3 AudioContext signal hash (offline render) | not captured | NEW — labelled as an OfflineAudioContext rendering-pipeline result, NOT a direct sound-card measurement (Section 18) | `audio.offlineHash` |
| 4.4 font list (probed) | not captured | NEW (width-comparison probing; result is a probed list, not the machine's full font inventory — Section 18) | `fonts.detected` |
| 4.4 speech voices | not captured | NEW | `media.voices` |
| 4.4 media devices (count/kind/labels) | not captured | NEW (labels are empty until permission is granted; recorded as such) | `media.devices` |
| 4.4 permissions states | not captured | NEW (per-permission status) | `navigator.permissions` |
| 4.1 network rows, 4.5 storage rows, 4.6 behaviour rows | covered by run.js/run-config.js storage checks / other agents | OUT | — |

Every new point reports its own status — `MEASURED`, `UNSUPPORTED`
(API absent in this engine), or `BLOCKED` (API present but the call
failed/was refused) — via `core.summarizeProbe`. No point's status is
merged into another point's verdict, and no overall "environment
clean" conclusion is produced (Constitution Sections 3.5, 16, 23).
