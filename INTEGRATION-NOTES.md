# Agent 5 — Runtime Measurement: Integration Notes

Branch: `agent-5/runtime-measure` on base
`8349f38b829a133ab53bc4b0a874c3f7b4ff8b22`. No edits to package.json,
main.js, preload.js, index.html or .github. The constitution file was
NOT modified; Section 4 status updates are PROPOSED below for the
coordinator/owner to apply.

## What was built

- `stage0-measure/MAPPING.md` — row-by-row mapping of constitution
  4.2/4.3/4.4 against the base-commit probe (Đợt A).
- `stage0-measure/core.js` — new exports:
  - `extendedProbe`: self-contained page-side probe (serialised by
    Playwright; contract-tested to reference no Node scope). 18
    isolated sub-probes; one failing API cannot erase the others.
  - `summarizeProbe(raw)`: 23 points, each with its own status
    MEASURED / UNSUPPORTED (API absent) / BLOCKED (call failed),
    mapped to constitution rows. No merged overall verdict.
  - `webglExpectationResult(expectations, point)`: compares the pinned
    identity's `webglVendor`/`webglRenderer` expectations against the
    probe. `identityExpectationResult` is unchanged (its contract —
    WebGL not compared there — still holds).
- `stage0-measure/test.js` — contract tests for the above (synthetic
  fixtures). `node stage0-measure/test.js` PASS; the file is already
  wired into `npm test` via the existing chain (no package.json
  change needed).
- `stage0-measure/run.js` — report gains `extendedEnvironment`
  (per-profile point summaries). `run-config.js` — report gains
  `extended` incl. `webglMatchA/B`. Existing PASS semantics untouched.
  Both runners remain Windows-gated.

## Real-engine run (evidence, Section 23 format)

- Classification: real engine binary, DIRECT playwright-core launch.
  The app controller was NOT used and this is NOT Windows acceptance
  (runners are Windows-gated by design).
- Engine: Camoufox Linux build at `~/tmp-big/cfx-build/camoufox`,
  sha256 prefix `2a2cb03f6ca4cfa9` (same build family as the verified
  v156.0.1-beta.36 line; full digest in the raw result file).
- Environment: Linux host, headless, loopback probe page, no proxy,
  no audio hardware, no GPU/WebGL context available.
- Identities: two identities generated with the repo's own
  `tools/generate-camoufox-identity.mjs` (official camoufox@0.5.8
  launcher): A = en-US / America/New_York / 3440x1440;
  B = vi-VN / Asia/Ho_Chi_Minh / 1382x864; replayed via the repo's
  `identityEnvForProfile`.
- Base identity comparison (existing 9-field contract): **7 of 7
  compared fields matched per profile** (userAgent, platform,
  language, timezone, hardwareConcurrency, screenWidth, screenHeight;
  the remaining expectation fields were null in both identities).
- Extended points, per profile: **23 points — 13 MEASURED,
  9 UNSUPPORTED, 1 BLOCKED**, identical status pattern for A and B.

Per-point status (both profiles unless noted):

| Point | Status | Note |
|---|---|---|
| webgl.vendorRenderer / extensions / parameters / shaderPrecision / renderHash | UNSUPPORTED here | `getContext('webgl2'/'webgl')` returned null in this headless Linux environment, so WebGL expectation comparison ran with **0 compared fields** — NOT a mismatch; the comparison is NOT_RUN in this environment and still needs a WebGL-capable (Windows/GPU or software-GL) run |
| canvas2d.hash | MEASURED | decoded-pixel hash == getImageData hash for both profiles (`exportsConsistent: true`, Section 18 normalisation works); the two profiles' PIXEL hashes were equal (`171044c7`) while their data-URL hashes differed — byte-level PNG output differed although decoded pixels did not, which is exactly why comparisons must use normalised pixels |
| canvas2d.fontMetrics | MEASURED | widths equal across the two profiles in this run |
| audio.basic | MEASURED | sampleRate 44100, state `suspended`, baseLatency 0, outputLatency 0, maxChannelCount 0 — values of a headless no-audio-device environment, recorded as observed |
| audio.offlineHash | BLOCKED | direct evaluate path: Firefox Xray TypedArray access error (recorded verbatim in the raw result); fallback in-page script injection: `startRendering` did not resolve within 8 s in this headless environment. Needs re-test where an audio stack exists (Windows) |
| fonts.detected | MEASURED | 45 candidates tested; detected lists were equal across profiles in this run (Linux host font environment) |
| media.devices | MEASURED | labels empty for all devices (no permission granted — recorded as designed); counts differed by profile (A: 1 audioinput; B: 1 audioinput + 1 videoinput) |
| media.voices | MEASURED | counts differed by profile (A: 5, B: 8) |
| clientHints.low / high | UNSUPPORTED | `navigator.userAgentData` absent in Firefox, as expected; Chromium-path measurement still outstanding |
| navigator.misc | MEASURED | incl. `oscpu` exposed per identity, webdriver false, plugins list |
| navigator.storageEstimate | MEASURED | quota/usage returned |
| navigator.permissions | MEASURED | per-permission states; clipboard-read/write report `error:TypeError` in Firefox — recorded per permission, not merged |
| navigator.keyboard / battery | UNSUPPORTED | APIs absent in Firefox, as expected |
| window.metrics / locale.formats / display.mediaQueries / offscreenCanvas | MEASURED | locale formats differed across profiles (matches their locales); window metrics differed (matches their screens) |

No conclusion is drawn from any of this about whether any platform
can or cannot associate the two profiles (Constitution Sections 3,
14, 16).

## NOT_RUN + reasons

- `run-config.js` / `run.js` end-to-end on Windows (with the app
  controller and the new `extended` report section): runners are
  Windows-gated; this machine is Linux. Owner/coordinator: run via
  the existing CI smoke after this branch is integrated.
- WebGL expectation comparison: NOT_RUN in this environment (no
  WebGL context headless on this host) — see table above.
- EXE-level runtime measurement: NOT_RUN (packaging is Agent 9 /
  acceptance gates are the owner's Windows machine).
- Chromium-engine probe run: NOT_RUN (this agent's scope was the
  Camoufox/Firefox path; client-hints rows remain unmeasured there).

## Proposed constitution Section 4 status updates (NOT applied)

For the coordinator/owner to apply to TIEU-CHI-SAN-PHAM.md later —
wording follows the file's own conventions; evidence = the run above
plus the Windows CI run still outstanding:

- 4.3 Canvas 2D hash: CHƯA ĐO → "ĐÃ CÓ đầu đo; đã đo trên engine thật
  (Linux, headless): hai đường xuất khớp sau chuẩn hóa pixel".
- 4.3 Font metrics: CHƯA ĐO → "ĐÃ CÓ đầu đo; đã đo trên engine thật".
- 4.3 WebGL rows (vendor/renderer, extensions, parameters, shader
  precision, render hash): keep CHƯA ĐO, add "đầu đo đã có; môi
  trường headless Linux không tạo được WebGL context — cần đo trên
  Windows/GPU".
- 4.3 AudioContext basics: CHƯA ĐO → "ĐÃ CÓ đầu đo; đã đo trên engine
  thật (môi trường không có thiết bị âm thanh)".
- 4.3 Audio offline hash: keep CHƯA ĐO, add "đầu đo đã có; bị chặn
  qua đường evaluate (Xray) và treo khi render headless — cần đo lại
  trên Windows".
- 4.3 OffscreenCanvas: CHƯA ĐO → "ĐÃ CÓ đầu đo; đã đo trên engine thật".
- 4.4 Font list / voices / media devices / permissions: CHƯA ĐO →
  "ĐÃ CÓ đầu đo; đã đo trên engine thật (nhãn thiết bị rỗng khi chưa
  cấp quyền)".
- 4.2 Client Hints (both rows): keep CHƯA ĐO, add "đầu đo đã có;
  Firefox không hỗ trợ API — còn thiếu đo trên Chromium".
- 4.2 keyboard / battery: keep CHƯA ĐO for the product as a whole,
  note "Firefox: API không hỗ trợ (đã xác nhận bằng đầu đo)".
- 4.2 locale formats, window metrics, display media signals,
  navigator misc group (webdriver/plugins/touch/connection),
  storage estimate: CHƯA ĐO → "ĐÃ CÓ đầu đo; đã đo trên engine thật".
