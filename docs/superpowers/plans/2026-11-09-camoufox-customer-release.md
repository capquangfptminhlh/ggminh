# Camoufox Customer Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở Camoufox native/manual cho khách trên Windows bằng gói tải riêng đã ký, không fallback sang direct hoặc engine khác, trong khi Playwright/API automation vẫn chỉ chạy ở lab.

**Architecture:** Giữ nguyên chuỗi ký–tải–cài hiện có. Bổ sung policy capability gắn với đúng phiên bản engine đã có bằng chứng mạng, thay tên cờ `allowProxyLab` bằng quyết định production rõ nghĩa, và đưa artifact công khai vào bản đóng gói. Mọi đường thiếu key, sai phiên bản, sai hash, thiếu vault hoặc thiếu bằng chứng đều fail closed.

**Tech Stack:** Electron 44, Node.js CommonJS, Ed25519, PowerShell trên Windows, test runner `node test/run-all.js`.

---

## Baseline đã xác nhận

- `npm test`: 340/340 bước PASS tại `main` `82b6cd8`.
- `CamoufoxInstallService`, `BundledEngineManager`, trust-anchor separation, tải HTTPS ghim nguồn/hash/dung lượng, giải nén staging và rollback đã có test.
- Native manual adapter đã có; packaged app vẫn chặn proxy bằng `allowProxyLab:false`.
- `resources/camoufox-engine/` chưa có `publisher-ed25519.pub` hoặc `release.json` thật.
- Cây Camoufox `v156.0.1-beta.36` có 218 tên font mà policy tên file hiện tại từ chối.

## Task 1: Chấp nhận nguyên trạng tên font upstream nhưng giữ chặn traversal

**Files:**

- Modify: `src/engine/bundledEngineManager.js` (hàm kiểm tên đường dẫn và `listFiles`)
- Create: `test/camoufox-engine-path-policy.js`
- Modify: `test/run-all.js`

- [ ] **Step 1: Viết test fail cho các tên upstream hợp lệ và tên nguy hiểm**

```js
const assert = require('node:assert/strict');
const { normalizeEngineRelativePath } = require('../src/engine/bundledEngineManager');

for (const value of [
  'fonts/1003__Bangla MN.ttc',
  'fonts/106__Raleway-Italic[wght].ttf',
  'fonts/110__Inter-Italic[opsz,wght].ttf',
  'fonts/日本語 フォント.ttf',
]) assert.equal(normalizeEngineRelativePath(value), value.normalize('NFC'));

for (const value of [
  '../camoufox.exe', '/absolute', 'C:/escape', 'dir\\escape',
  'dir//file', 'dir/./file', 'dir/../file', 'dir/file. ',
  'CON', 'fonts/aux.ttf', 'fonts/name\u0000.ttf',
]) assert.throws(() => normalizeEngineRelativePath(value));
```

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/camoufox-engine-path-policy.js`

Expected: FAIL vì export/hành vi mới chưa tồn tại.

- [ ] **Step 3: Cài validator canonical**

Quy tắc bắt buộc:

- input là chuỗi UTF-8, chuẩn hóa NFC;
- dùng `/` làm separator duy nhất;
- cấm path tuyệt đối, drive letter, backslash, control/NUL;
- cấm component rỗng, `.` và `..`;
- cấm component kết thúc bằng dấu cách hoặc dấu chấm trên Windows;
- cấm device names Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1..9`, `LPT1..9`) kể cả có extension;
- giới hạn 240 ký tự cho toàn relative path và 180 ký tự mỗi component;
- `listFiles` phải phát hiện collision sau NFC + lowercase.

```js
function normalizeEngineRelativePath(input) {
  if (typeof input !== 'string' || !input) throw Error('Unsafe bundled engine relative file path');
  const value = input.normalize('NFC');
  if (value.length > 240 || /^[A-Za-z]:/.test(value) || value.startsWith('/') ||
      value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value))
    throw Error('Unsafe bundled engine relative file path');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' ||
      part.length > 180 || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw Error('Unsafe bundled engine relative file path');
  return parts.join('/');
}
```

- [ ] **Step 4: Thêm test collision và manifest round-trip**

Test hai tên chỉ khác NFC/case phải bị từ chối; test manifest ký/xác minh giữ nguyên tên có dấu cách, dấu phẩy, ngoặc vuông và Unicode.

- [ ] **Step 5: Chạy test tập trung**

Run: `node test/camoufox-engine-path-policy.js && node test/camoufox-engine-source-hardening.js && node test/camoufox-engine-distribution.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/bundledEngineManager.js test/camoufox-engine-path-policy.js test/run-all.js
git commit -m "fix(camoufox): accept safe upstream font paths"
```

## Task 2: Policy capability theo phiên bản engine đã nghiệm thu

**Files:**

- Create: `src/engine/camoufoxCapabilityPolicy.js`
- Create: `resources/camoufox-engine/capabilities.json`
- Create: `test/camoufox-capability-policy.js`
- Modify: `test/run-all.js`

- [ ] **Step 1: Viết test fail-closed**

```js
const assert = require('node:assert/strict');
const { evaluateCapabilities } = require('../src/engine/camoufoxCapabilityPolicy');

const policy = {
  schema: 1,
  releases: [{
    version: '156.0.1',
    manual: true,
    proxyTypes: ['http', 'socks5'],
    evidence: 'ip-leak-results-gecko-2026-11-07.json',
    verdict: 'PASS'
  }]
};
const approved = evaluateCapabilities({
  engineVersion: '156.0.1',
  policy
});
assert.equal(approved.manual, true);
assert.deepEqual(approved.proxyTypes, ['http', 'socks5']);
assert.equal(evaluateCapabilities({engineVersion:'156.0.2', policy}).manual, false);
```

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/camoufox-capability-policy.js`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài policy loader thuần dữ liệu**

Module phải:

- chỉ chấp nhận schema/key chính xác;
- không suy diễn phiên bản gần đúng;
- chỉ mở proxy type xuất hiện trong entry đúng version;
- yêu cầu `manual:true`, `verdict:'PASS'` và tên evidence nằm dưới `stage0-measure/`;
- trả capability đóng hoàn toàn khi file thiếu hoặc sai.

- [ ] **Step 4: Ghi policy cho bản đã có bằng chứng**

`resources/camoufox-engine/capabilities.json` chỉ thêm entry `156.0.1` sau khi test Task 1 và phép đo Windows ở Task 6 cùng dùng đúng cây/hash. Trước thời điểm đó giữ `releases: []` để packaged app vẫn fail closed.

- [ ] **Step 5: Chạy test**

Run: `node test/camoufox-capability-policy.js`

Expected: PASS cho đúng version; mọi version khác bị đóng.

- [ ] **Step 6: Commit**

```bash
git add src/engine/camoufoxCapabilityPolicy.js resources/camoufox-engine/capabilities.json test/camoufox-capability-policy.js test/run-all.js
git commit -m "feat(camoufox): add release capability policy"
```

## Task 3: Thay lab flag bằng production capability, giữ automation lab-only

**Files:**

- Modify: `src/engine/camoufoxAdapter.js:95-143`
- Modify: `src/engine/EngineFactory.js:28-48`
- Modify: `src/engine/NetworkSafetyCheck.js:10-27`
- Modify: `main.js:1490-1525`
- Modify: `test/camoufox-adapter.js`
- Modify: `test/network-safety-fail-closed.js`
- Modify: `test/integration/engine-factory-playwright.test.js`

- [ ] **Step 1: Viết test cho packaged manual + proxy approved**

Test ma trận tối thiểu:

| Signed version | Policy | Proxy | Kết quả |
|---|---|---|---|
| thiếu | bất kỳ | direct/proxy | block trước spawn |
| `156.0.1` | manual only | direct | launch |
| `156.0.1` | HTTP+SOCKS5 | HTTP/SOCKS5 + vault hợp lệ | launch |
| `156.0.1` | HTTP only | SOCKS5 | `NETWORK_BLOCKED` |
| `156.0.2` | không có entry | proxy | `NETWORK_BLOCKED` |
| bất kỳ | bất kỳ | proxy thiếu credential | `NETWORK_BLOCKED`, zero spawn |

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/camoufox-adapter.js && node test/network-safety-fail-closed.js`

Expected: FAIL vì adapter chỉ hiểu `allowProxyLab`.

- [ ] **Step 3: Refactor adapter**

Đổi constructor sang:

```js
constructor(baseDir, {
  capabilityResolver = () => ({manual:false, proxyTypes:[]}),
  labProxyOverride = false,
  ...deps
} = {})
```

Khi `start()`:

1. lấy signed version từ `bundleVerifier.status()`;
2. resolve capability đúng version;
3. direct yêu cầu `manual:true`;
4. proxied yêu cầu `manual:true` và proxy type nằm trong `proxyTypes`;
5. dev lab chỉ được override khi `!app.isPackaged` từ `main.js`;
6. không fallback direct.

- [ ] **Step 4: Refactor network preflight**

Đổi `labApproved` thành `approvedProxyTypes`. `NetworkSafetyCheck.evaluate()` kiểm đúng type của profile, vault record và credential. Mã lỗi vẫn là `NETWORK_BLOCKED` để không phá UI/API hiện có.

- [ ] **Step 5: Giữ Playwright controller nguyên trạng**

Trong `main.js`, vẫn giữ:

```js
enabled: !app.isPackaged && process.env.LHM_CAMOUFOX_PLAYWRIGHT_LAB === '1'
```

Không đưa Playwright/Juggler/CDP endpoint vào packaged app.

- [ ] **Step 6: Chạy test tập trung**

Run: `node test/camoufox-adapter.js && node test/network-safety-fail-closed.js && node test/integration/engine-factory-playwright.test.js && node test/camoufox-api-automation-guard.js`

Expected: PASS; automation packaged vẫn bị từ chối.

- [ ] **Step 7: Commit**

```bash
git add src/engine/camoufoxAdapter.js src/engine/EngineFactory.js src/engine/NetworkSafetyCheck.js main.js test/camoufox-adapter.js test/network-safety-fail-closed.js test/integration/engine-factory-playwright.test.js
git commit -m "feat(camoufox): enable approved native production capabilities"
```

## Task 4: Hiển thị trạng thái release/capability trung thực

**Files:**

- Modify: `src/engine/camoufoxRuntimeGate.js`
- Modify: `src/ui/engineSource.js`
- Modify: `src/ui/index.html:600-610`
- Modify: `main.js:751-785`
- Modify: `test/camoufox-runtime-gate.js`
- Modify: `test/bundled-engine-status.js`

- [ ] **Step 1: Viết test cho bốn trạng thái**

Các trạng thái phải tách riêng:

- chưa có trust anchor;
- có release descriptor nhưng chưa cài;
- đã cài/đã ký, manual direct sẵn sàng nhưng proxy chưa được duyệt;
- đã cài/đã ký, manual + HTTP/SOCKS5 được duyệt.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/camoufox-runtime-gate.js && node test/bundled-engine-status.js`

- [ ] **Step 3: Mở rộng status contract**

```js
{
  installed, binaryVerified, version,
  manualReady,
  approvedProxyTypes,
  automationAvailable: false,
  evidence,
  reason
}
```

UI dùng các câu: “Cửa sổ thủ công”, “Proxy HTTP/SOCKS5 đã nghiệm thu cho phiên bản này”, hoặc “Proxy chưa được duyệt cho phiên bản engine này”. Không dùng “ẩn danh”, “không thể liên kết” hay “100%”.

- [ ] **Step 4: Chạy test**

Run: `node test/camoufox-runtime-gate.js && node test/bundled-engine-status.js && node test/profile-editor-ui.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/camoufoxRuntimeGate.js src/ui/engineSource.js src/ui/index.html main.js test/camoufox-runtime-gate.js test/bundled-engine-status.js
git commit -m "feat(ui): report Camoufox release capabilities"
```

## Task 5: Đưa public trust anchor và descriptor thật vào build

**Files:**

- Add after owner ceremony: `resources/camoufox-engine/publisher-ed25519.pub`
- Add after artifact upload: `resources/camoufox-engine/release.json`
- Create: `test/camoufox-production-trust-anchor.js`
- Modify: `.github/workflows/windows-exe.yml:118-132`
- Modify: `docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md`

- [ ] **Step 1: Chủ dự án thực hiện nghi thức khóa ngoại tuyến**

Theo `docs/agents/agent-13/OWNER-RUNBOOK.md`. Chỉ public key và SPKI SHA-256 được đưa vào repo. Private key không vào repo/chat/CI.

- [ ] **Step 2: Viết test ghim SPKI fingerprint**

Test phải khai báo `EXPECTED_SPKI_SHA256` bằng literal 64 ký tự lấy trực tiếp từ
buổi lễ khóa production, tính lại fingerprint từ PEM và `assert.equal(actual,
EXPECTED_SPKI_SHA256)`. Không đọc expected hash từ file nằm cạnh public key và
không dùng fingerprint khóa thử trong báo cáo R6.

- [ ] **Step 3: Ký cây và tạo release thật**

Thực hiện checklist `docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md` sau khi Task 1 cho phép cây upstream nguyên trạng. ZIP không chứa `manifest.json`; `release.json` chứa manifest đã ký, URL GitHub Release, archive SHA-256 và byte size.

- [ ] **Step 4: Sửa CI Preview**

CI luôn cấm `camoufox.exe` và `manifest.json` trong installer. CI cho phép `publisher-ed25519.pub` và `release.json` chỉ khi cả hai qua test trust/descriptor; thiếu một trong hai phải fail. Không có private-key material trong artifact.

- [ ] **Step 5: Chạy preflight**

Run:

```powershell
node test/camoufox-production-trust-anchor.js
node test/camoufox-engine-source-hardening.js
node test/camoufox-engine-distribution.js
npm run dist:win
```

Expected: installer chứa public key + descriptor, không chứa engine binary, private key hay manifest rời.

- [ ] **Step 6: Commit**

```bash
git add resources/camoufox-engine .github/workflows/windows-exe.yml docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md test/camoufox-production-trust-anchor.js test/run-all.js
git commit -m "release(camoufox): trust production publisher and descriptor"
```

## Task 6: Nghiệm thu Windows sạch và mở policy version

**Files:**

- Create: `docs/acceptance/CAMOUFOX_PRODUCTION_156_0_1_20261109.md`
- Modify: `resources/camoufox-engine/capabilities.json`
- Modify: `docs/release/RELEASE-CHECKLIST.md`
- Modify: `OPEN-ISSUES.md`

- [ ] **Step 1: Cài trên Windows sạch**

Kiểm SHA-256 installer, mở app, bấm cài Camoufox, xác nhận tải ~1.3 GB, verify, extract, restart và `binaryVerified:true`.

- [ ] **Step 2: Đo hai hồ sơ**

Với direct và proxy thật ở xa, ghi đúng commit/app hash/engine hash:

- IP egress IPv4/IPv6;
- DNS tại máy;
- WebRTC host/srflx/prflx/relay;
- QUIC/HTTP3;
- cookie, HttpOnly cookie, localStorage, IndexedDB, Cache Storage, Service Worker, HTTP cache;
- mở/đóng/restart/crash recovery.

- [ ] **Step 3: Chạy test font**

Đầu đo `fonts.detected` phải chạy trên cây nguyên trạng đã ký. So với bản upstream cùng cây; không được mất font vì packaging.

- [ ] **Step 4: Chỉ sau khi PASS mới thêm capability entry**

Thêm đúng `version`, proxy type và đường dẫn evidence vào `capabilities.json`. Nếu một phép đo fail hoặc NOT_RUN, không thêm entry.

- [ ] **Step 5: Chạy toàn bộ suite**

Run: `npm test`

Expected: `all selected steps passed`, 0 fail.

- [ ] **Step 6: Commit acceptance**

```bash
git add docs/acceptance resources/camoufox-engine/capabilities.json docs/release/RELEASE-CHECKLIST.md OPEN-ISSUES.md
git commit -m "release(camoufox): approve measured Windows capabilities"
```

## Task 7: Kiểm tra bản đóng gói cuối

**Files:**

- Verify only; sửa đúng file gây lỗi nếu phát hiện regression.

- [ ] **Step 1: Cài mới và nâng cấp đè**

Không xóa profile cũ. Xác nhận profile Chromium/Firefox không thay đổi; Camoufox profile giữ identity và data directory.

- [ ] **Step 2: Kiểm tra fail-closed**

Sửa một byte ở `release.json`, ZIP, installed `omni.ja`, capability version và vault credential; mỗi trường hợp phải bị chặn trước browser spawn, không fallback.

- [ ] **Step 3: Chạy smoke UI bản cài**

Camoufox install/status/profile create/open/stop/reopen đều hoạt động; automation/API Camoufox vẫn bị từ chối.

- [ ] **Step 4: Ghi hash cuối**

Ghi commit, installer SHA-256, engine archive SHA-256, `camoufox.exe` SHA-256 và publisher SPKI fingerprint vào release evidence.
