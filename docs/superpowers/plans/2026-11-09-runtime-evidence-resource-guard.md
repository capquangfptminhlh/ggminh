# Runtime Evidence and Resource Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị bằng chứng runtime đã lưu đúng hồ sơ và ngăn mở thêm browser khi máy không còn ít nhất 20% RAM headroom, đồng thời tạo benchmark Windows 8/16/32 GB có P50/P95.

**Architecture:** Không chạy Playwright trong bản khách. Phép đo sâu tiếp tục chạy ở lab bằng `tools/measure-profile.js`, lưu record gắn commit + engine hash. UI chỉ đọc record hợp lệ. Resource Guard là local-only: collector Windows đọc cây process của từng profile, policy thuần dữ liệu đánh giá headroom, UI hiển thị số liệu và launcher gọi guard trước spawn.

**Tech Stack:** Node.js CommonJS, Electron IPC, PowerShell/CIM trên Windows, HTML/CSS renderer, JSON evidence.

---

## Task 1: Chiếu measurement record vào bảng tín hiệu hồ sơ

**Files:**

- Create: `src/ui/measurementValidity.js`
- Modify: `src/ui/criteriaChecklistProvider.js:189-255`
- Modify: `src/ui/profileSignalCoverage.js:1-84`
- Modify: `src/ui/index.html:2050-2056`
- Modify: `test/profile-signal-coverage.js`
- Modify: `test/criteria-checklist-provider.js`

- [ ] **Step 1: Viết test trạng thái measured**

```js
const record = {
  validity: { valid: true },
  results: { configured: { status:'measured', extended: { points: {
    'webgl.vendorRenderer': {status:'MEASURED'},
    'canvas2d.hash': {status:'MEASURED'},
    'audio.offlineHash': {status:'MEASURED'},
    'fonts.detected': {status:'MEASURED'},
    'media.voices': {status:'MEASURED'},
    'clientHints.low': {status:'MEASURED'}
  }}}}
};
const rows = flatten(model({engine:'camoufox', measurement:record}));
assert.equal(rows.find(x=>x.key==='gpu').status, 'measured');
assert.equal(rows.find(x=>x.key==='canvas').status, 'measured');
```

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/profile-signal-coverage.js`

Expected: FAIL vì model chưa nhận measurement.

- [ ] **Step 3: Tách validity gate dùng chung**

Chuyển logic `checkRecord()` và `recordLimit()` từ
`criteriaChecklistProvider.js` vào module UMD `measurementValidity.js` (vừa
`module.exports`, vừa `window.LHMMeasurementValidity`). Provider và bảng tín
hiệu phải gọi cùng module này để tuổi record, profile ID, tier, app commit và
engine hash luôn có cùng kết luận. Nạp `measurementValidity.js` trước
`criteriaChecklistProvider.js` và `profileSignalCoverage.js` trong `index.html`.

- [ ] **Step 4: Thêm trạng thái `measured` và `measured_partial`**

Chỉ chuyển trạng thái khi record đã qua validity gate của provider. Không tự coi `pinned`, `native` hoặc `declared` là measured. Nhóm network chỉ measured nếu record có bằng chứng tương ứng; probe rendering không được nâng trạng thái DNS/WebRTC/IP.

- [ ] **Step 5: Test record hết hạn/sai binding**

Record invalid hoặc thiếu point phải giữ `unmeasured` và hiển thị lý do cụ thể.

- [ ] **Step 6: Chạy test**

Run: `node test/profile-signal-coverage.js && node test/measurement-checklist-flip.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/measurementValidity.js src/ui/criteriaChecklistProvider.js src/ui/profileSignalCoverage.js src/ui/index.html test/profile-signal-coverage.js test/criteria-checklist-provider.js
git commit -m "feat(ui): show bound runtime signal evidence"
```

## Task 2: Nạp measurement bất đồng bộ khi sửa hồ sơ

**Files:**

- Modify: `src/ui/renderer.js:80-100` và luồng `openProfileModal`
- Modify: `src/ui/profileSignalCoverage.css`
- Modify: `test/profile-editor-ui.js`
- Modify: `test/workspace-interactions.js`

- [ ] **Step 1: Viết test chống stale response**

Mở hồ sơ A rồi lập tức mở B; response measurement chậm của A không được ghi đè bảng B.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/workspace-interactions.js`

- [ ] **Step 3: Cài sequence token**

```js
let coverageRequest = 0;
async function loadProfileCoverage(profile) {
  const request = ++coverageRequest;
  const payload = profile?.id ? await window.api.getProfileMeasurement(profile.id) : null;
  if (request !== coverageRequest) return;
  renderProfileSignalCoverage(payload);
}
```

Renderer truyền record + currentContext vào model; model/provider dùng cùng validity rules, không tự viết gate thứ hai khác nghĩa.

- [ ] **Step 4: Hiển thị thời gian và binding**

Tóm tắt gồm `measuredAt`, app commit rút gọn, engine version/hash rút gọn và tier. Không hiển thị identity blob hoặc proxy credential.

- [ ] **Step 5: Chạy test**

Run: `node test/profile-editor-ui.js && node test/workspace-interactions.js && node test/profile-signal-coverage.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/renderer.js src/ui/profileSignalCoverage.css test/profile-editor-ui.js test/workspace-interactions.js
git commit -m "feat(ui): load per-profile runtime evidence"
```

## Task 3: Collector tài nguyên theo cây process

**Files:**

- Create: `src/ops/windowsProcessResources.js`
- Create: `test/windows-process-resources.js`
- Modify: `test/run-all.js`

- [ ] **Step 1: Viết parser test từ fixture CIM**

Fixture gồm root PID, con, cháu, process không liên quan và cycle giả. Kết quả chỉ cộng WorkingSetSize/CPU của cây đúng root, không lặp PID.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/windows-process-resources.js`

- [ ] **Step 3: Cài collector với dependency injection**

Public API:

```js
async function collectProcessTreeResources(rootPids, {
  platform = process.platform,
  exec = execFile
} = {})
```

PowerShell gọi `Get-CimInstance Win32_Process` một lần cho toàn snapshot, trả JSON whitelist gồm `ProcessId`, `ParentProcessId`, `WorkingSetSize`, `KernelModeTime`, `UserModeTime`, `Name`. Không dựng command từ dữ liệu profile; root PID truyền qua JSON/argv đã validate integer.

- [ ] **Step 4: Trả NOT_SUPPORTED ngoài Windows**

Không fake số liệu trên Linux/macOS. Timeout/parse error trả status error và reason; không được coi là 0 MB.

- [ ] **Step 5: Chạy test**

Run: `node test/windows-process-resources.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ops/windowsProcessResources.js test/windows-process-resources.js test/run-all.js
git commit -m "feat(ops): measure browser process trees on Windows"
```

## Task 4: Policy Resource Guard giữ 20% headroom

**Files:**

- Create: `src/ops/resourceGuard.js`
- Create: `test/resource-guard.js`
- Modify: `test/run-all.js`

- [ ] **Step 1: Viết test policy thuần dữ liệu**

Test các case:

- free 35%, prediction đã có, sau mở còn 24% → allow;
- free 25%, sau mở còn 17% → block `RESOURCE_LIMIT`;
- hiện tại dưới 20% → block;
- collector lỗi hoặc chưa có prediction → warning `RESOURCE_UNMEASURED`, không giả số;
- profile đang chạy có PID trùng → dedupe.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/resource-guard.js`

- [ ] **Step 3: Cài policy**

```js
function assessLaunch({totalBytes, availableBytes, predictedBytes}) {
  const reserveBytes = Math.ceil(totalBytes * 0.20);
  if (availableBytes < reserveBytes) return blocked('RESOURCE_LIMIT');
  if (Number.isFinite(predictedBytes) && availableBytes - predictedBytes < reserveBytes)
    return blocked('RESOURCE_LIMIT');
  if (!Number.isFinite(predictedBytes)) return review('RESOURCE_UNMEASURED');
  return allowed();
}
```

Prediction lấy từ P95 benchmark đúng engine + workload class. Không hardcode con số marketing. Khi chưa có benchmark, guard cảnh báo nhưng chỉ block nếu RAM hiện tại đã dưới 20%.

- [ ] **Step 4: Chạy test**

Run: `node test/resource-guard.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ops/resourceGuard.js test/resource-guard.js test/run-all.js
git commit -m "feat(ops): add memory headroom resource guard"
```

## Task 5: Nối Resource Guard vào launcher và UI

**Files:**

- Modify: `src/engine/browserLauncher.js` trước `engineFactory.launchProfile`
- Modify: `main.js` (khởi tạo guard + IPC status)
- Modify: `preload.js`
- Modify: `src/ui/dashboard.js`
- Modify: `src/ui/index.html`
- Modify: `test/launcher-isolation.js`
- Create: `test/resource-guard-ui.js`

- [ ] **Step 1: Viết test zero-spawn khi block**

Khi policy trả `RESOURCE_LIMIT`, `spawnProcess`, proxy gateway và engine resolver đều phải có call count 0.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/launcher-isolation.js`

- [ ] **Step 3: Gọi guard trước side effect**

Thứ tự bắt buộc:

1. validate profile/license/readiness;
2. Resource Guard assess;
3. chỉ khi allow/review mới resolve engine, mở gateway và spawn.

Review phải hiện warning có xác nhận trong UI manual; Local API trả 409 cho `RESOURCE_UNMEASURED` cho tới khi caller gửi opt-in rõ ràng. Block trả error code `RESOURCE_LIMIT`.

- [ ] **Step 4: Thêm dashboard local-only**

Hiển thị RAM hệ thống total/available, RAM theo profile process tree, engine, PID count và thời điểm sample. Không gửi server, không ghi lịch sử mặc định.

- [ ] **Step 5: Chạy test UI/launcher**

Run: `node test/launcher-isolation.js && node test/resource-guard-ui.js && node test/dashboard-ui.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/browserLauncher.js main.js preload.js src/ui/dashboard.js src/ui/index.html test/launcher-isolation.js test/resource-guard-ui.js
git commit -m "feat: enforce browser resource headroom"
```

## Task 6: Benchmark browser thật trên Windows 8/16/32 GB

**Files:**

- Create: `tools/browser-resource-benchmark.js`
- Create: `test/browser-resource-benchmark.js`
- Create: `docs/acceptance/BROWSER_RESOURCE_BENCHMARK.md`
- Modify: `docs/LHM_PERFORMANCE_EVIDENCE_LAB.md`
- Modify: `test/run-all.js`

- [ ] **Step 1: Viết test shaping/report**

Report phải có schema, commit, app/engine hashes, Windows build, total RAM, engine, workload, concurrency, samples, P50/P95 startup, P50/P95 working set, peak CPU, crash count và cleanup result. Cấm profile names, URLs ngoài workload id, cookies, proxy, identity blob và token.

- [ ] **Step 2: Chạy test và xác nhận fail**

Run: `node test/browser-resource-benchmark.js`

- [ ] **Step 3: Cài runner**

Workloads cố định:

- `light`: trang loopback tĩnh;
- `medium`: loopback DOM/canvas/JS có giới hạn;
- `heavy`: loopback nhiều iframe/canvas nhưng không truy cập tài khoản thật.

Mỗi tổ hợp chạy warmup + tối thiểu 10 sample; mở 1/3/5/10 profile cho tới khi vi phạm 20% headroom hoặc có crash. Dừng và đóng sạch toàn bộ process sau mỗi sample.

- [ ] **Step 4: Chạy trên ba lớp máy**

Chạy Windows 8 GB, 16 GB, 32 GB cho Chromium, Firefox và Camoufox đã ký. Ghi artifact JSON riêng, không nội suy máy chưa chạy.

- [ ] **Step 5: Tạo prediction table từ P95**

Chỉ nhập P95 của evidence hợp lệ vào Resource Guard. Bảng khuyến nghị đồng thời là số lớn nhất vẫn giữ ≥20% RAM ở P95; nếu không có evidence cho engine/workload thì trạng thái là `UNMEASURED`.

- [ ] **Step 6: Chạy suite và commit**

Run: `npm test`

Expected: 0 fail.

```bash
git add tools/browser-resource-benchmark.js test/browser-resource-benchmark.js docs/acceptance/BROWSER_RESOURCE_BENCHMARK.md docs/LHM_PERFORMANCE_EVIDENCE_LAB.md test/run-all.js
git commit -m "test(performance): add real browser resource benchmark"
```

## Task 7: Nghiệm thu tích hợp

- [ ] **Step 1:** Mở đồng thời Chromium + Firefox + Camoufox; đối chiếu dashboard với Task Manager trong sai số đã ghi.
- [ ] **Step 2:** Ép available RAM xuống dưới 20%; mở profile mới phải block trước spawn, profile đang chạy không bị kill tự động.
- [ ] **Step 3:** Đóng một profile; sample sau phải bỏ đúng process tree và cho phép mở lại khi đủ headroom.
- [ ] **Step 4:** Mở hồ sơ có record hợp lệ/sai hash/hết hạn; UI lần lượt hiển thị measured/unmeasured đúng lý do.
- [ ] **Step 5:** Chạy `npm test`, `git diff --check`, và packaged UI smoke; lưu log cùng commit + artifact hash.
