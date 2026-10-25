# v5.8.0 — Kế hoạch thực thi cho agent (2026-10-25)

**Trạng thái: NOT READY TO SELL.** Tài liệu này chia
[`V58_RC_SCOPE_LOCK_20261023.md`](V58_RC_SCOPE_LOCK_20261023.md) thành các
task cụ thể để agent nhận làm tiếp. Nó **không** thay scope lock và không
cho phép bỏ qua bất kỳ cổng nào. Nếu hai tài liệu mâu thuẫn, scope lock thắng.

- Nền kiểm chứng: `main` @ `0558db9` (sau PR #70), ngày 2026-10-25.
- Worklist chính thức của chủ dự án vẫn là Issue #47. Khi một task ở đây
  xong, cập nhật cả bảng trạng thái cuối file này lẫn checkbox tương ứng ở #47.

---

## 0. Đọc trước khi nhận task

1. `docs/release/V58_RC_SCOPE_LOCK_20261023.md` — 5 workstream, luật đóng băng.
2. File này — task, phụ thuộc, điều kiện xong.
3. Tài liệu riêng của task (ghi trong cột "Tài liệu").

### Luật cho agent

- **Một task = một nhánh = một PR.** Tên nhánh: `rc58/<TASK-ID>-<mo-ta-ngan>`.
  Tiêu đề PR bắt đầu bằng `[<TASK-ID>]`.
- **Không merge, không tag, không publish release, không đổi secret.**
  Agent mở PR; chủ dự án (OWNER) duyệt và merge.
- Task có nhãn **OWNER** cần người thật (khóa, tài khoản Cloudflare/DNS, máy
  Windows sạch, quyết định). Agent chỉ được **chuẩn bị** cho task đó
  (script, checklist, PR cấu hình có placeholder), không được tự làm thay.
- Mọi kết quả ghi `PASS` / `FAIL` / `NOT_RUN` / `BLOCKED` kèm bằng chứng
  (commit SHA, run ID, SHA-256 file). Không có bằng chứng = `NOT_RUN`.
- Không đưa lên repo/PR/issue/log: private key, passphrase, license token,
  Installation ID thật, Cloudflare API token, dữ liệu khách, cookie, proxy thật.
- Luật đóng băng 5.8 (scope lock): chỉ sửa lỗi tương thích, bảo mật,
  crash/mất dữ liệu, license/thanh toán, cập nhật có chữ ký, đóng gói,
  tài liệu và test bằng chứng phát hành. **Cấm** thêm tính năng AI,
  dashboard, marketing, tùy chọn fingerprint mới, cloud/team/sync.
- Mỗi PR phải chạy `npm test` (gọi `test/run-all.js`, báo đủ mọi bước)
  và ghi số PASS/FAIL vào mô tả PR. CI `Build Windows EXE` phải xanh.
- Gặp lỗi đã sửa hai lần không xong: dừng, ghi lại giả thuyết và bằng chứng
  vào PR, chuyển task sang `BLOCKED` thay vì vá chồng.

---

## 1. Hiện trạng đã kiểm chứng (2026-10-25)

| # | Sự thật | Bằng chứng | Hệ quả |
|---|---|---|---|
| F1 | CI `main` xanh: Build Windows EXE + Cloudflare Worker preflight | run 40116218699, 40116218637 trên `0558db9` | Gate 1/2 build ổn trên `main` hiện tại. |
| F2 | **EXE trên `main` chưa trỏ tới license server nào** | `resources/license-authority/authority.json`: `"enabled": false, "endpoint": null` | Khách cài bản này không kích hoạt online được. Chặn WS2. |
| F3 | **`browser.lhmcrm.com` chưa tồn tại** | `nslookup` trả NXDOMAIN | Worker/portal (#56–#58) chưa deploy production. |
| F4 | Workflow `deploy-browser-license-center.yml` và `bootstrap-browser-license-worker.yml` **chưa từng chạy** | `gh run list -w <file>` rỗng | Chưa có D1/Worker thật. |
| F5 | **Chưa có public key cập nhật production** | `resources/update-publisher/` chỉ có `README.md` | Update Center luôn `not-configured`. Chặn WS3. |
| F6 | Chưa có GitHub Release nào | `gh release list` rỗng | Chưa có kênh phân phối. |
| F7 | PR #46 lệch `main`: 31 commit chỉ có trên #46, 22 commit chỉ có trên `main` | `git rev-list` 2026-10-25 | Không merge nguyên khối được; phải chọn lọc lên nền `main` mới. |
| F8 | **Đóng băng bị vi phạm sau 2026-10-23**: #51 (neumorphic + 3D license flip), #52 (AI rail), `ed5d169` (UI signal inventory), #57/#58 (domain + portal web), Draft #71 (Google Gmail subscription) | `git log 4d63f006..main`, `gh pr list` | Scope lock ghi nền `4d63f006`, nay đã cũ. Từ giờ chặn thêm. |
| F9 | 21 PR nháp còn mở; nhiều nhánh `-20261021` đi trước `main` 37–311 commit và sau 48 commit | `git rev-list --count` | Phần lớn đã được thay thế; cần dọn để agent không lấy nhầm. |
| F10 | Nhiều tài liệu cũ neo vào SHA không còn đúng | `TAG-AND-MERGE-RUNBOOK.md` kỳ vọng `main = 77075f3`; `RELEASE-CHECKLIST.md` neo `f280296`; `OPEN-ISSUES.md` còn QA-002/004/005 đã xử lý | Agent đọc phải sẽ làm sai. |
| F11 | `V58_REAL_RENTAL_ACCEPTANCE.md` mô tả luồng Node `tools/license-admin.js` + reverse proxy, trong khi `main` đã chuyển sang Cloudflare Worker + D1 + portal | So sánh tài liệu với #56/#58/#67/#70 | Checklist thuê thực tế phải viết lại theo kiến trúc hiện tại. |
| F12 | `npm test` trên `main`: 270/270 PASS (Windows, Node 24) | xem mục 6 | Baseline cho mọi PR. |

---

## 2. Thứ tự và phụ thuộc

```
P0 (dọn dẹp, agent)  ──►  WS1 hợp nhất RC (agent + OWNER duyệt)
                                  │
   OWNER: DNS + Cloudflare ──► WS2 license thật ──┐
   OWNER: khóa update     ──► WS3 cập nhật ký ────┼──► WS4 Gate 3 (OWNER, máy sạch) ──► WS5 Gate 4 + release (OWNER)
                                                  │
                         WS1 xong SHA ứng viên ───┘
```

WS2 và WS3 chạy song song sau WS1. WS4 cần cả WS1, WS2, WS3 trên **cùng một SHA ứng viên**.
Nếu SHA ứng viên đổi, chạy lại CI và gắn lại bằng chứng WS2–WS4 cho EXE mới.

---

## 3. Danh sách task

### P0 — Dọn dẹp để agent không làm sai (agent tự làm)

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| P0-1 | Cập nhật `V58_RC_SCOPE_LOCK_20261023.md`: thêm mục "Rebase 2026-10-25" ghi nền mới `0558db9`, liệt kê các commit vi phạm đóng băng ở F8 và quyết định của OWNER cho từng cái (giữ / revert / để sau 5.8). Không tự revert. | Agent soạn, OWNER chốt | PR có bảng F8 + ô quyết định để trống cho OWNER. |
| P0-2 | Đánh dấu tài liệu cũ: thêm banner `> LỊCH SỬ — không dùng để thực thi, xem V58_AGENT_EXECUTION_PLAN_20261025.md` vào đầu `docs/release/TAG-AND-MERGE-RUNBOOK.md`, `docs/release/RELEASE-CHECKLIST.md`, `docs/release/LIVE-COMMERCIAL-STATUS-*.md` (nếu đã vào main), `INTEGRATION-PLAN.md`. Không xóa nội dung. | Agent | PR chỉ thêm banner; `npm test` không đổi. |
| P0-3 | `OPEN-ISSUES.md`: đóng QA-002 (đã có mẫu khóa trong `.gitignore`), QA-004 (README không còn "miễn phí vĩnh viễn"), QA-005 (đã có `test/run-all.js`). Ghi commit/bằng chứng đóng. Kiểm lại QA-006 với baseline mục 6. | Agent | Mỗi issue đóng có dòng bằng chứng. |
| P0-4 | Phân loại PR nháp: tạo `docs/release/DRAFT-PR-TRIAGE-20261025.md`, mỗi PR #1–#24, #46, #71 một dòng: `thay thế bởi <PR/commit>` / `cần cho WS<n>` / `ngoài phạm vi 5.8`. Dựa trên diff thật, không đoán theo tiêu đề. | Agent soạn, OWNER đóng PR | Bảng đủ 22 PR; OWNER đóng các PR đã thay thế. |
| P0-5 | Thêm kiểm tra đóng băng vào CI: job nhẹ fail nếu PR nhắm `main` mà tiêu đề không có `[P0-*]`, `[WS*-*]` hoặc nhãn `release-blocker`. Đặt ở workflow mới `release-freeze-guard.yml`. | Agent | Workflow chạy trên PR, có test hợp đồng giống `test/staged-workflow-contract.js`. OWNER duyệt vì sửa `.github/workflows`. |

### WS1 — Hợp nhất ứng viên phát hành (RC)

Cách làm: **không merge PR #46**. Tạo nhánh `rc58/WS1-candidate` từ `main`
mới nhất, đem vào từng nhóm thay đổi của #46 bằng cherry-pick hoặc vá tay,
mỗi nhóm một commit, kèm test của chính nhóm đó.

Phân loại 70 file của #46 (`git diff origin/main...origin/codex/v58-wave-r-finish`):

| Nhóm | File chính | Đề xuất | Lý do |
|---|---|---|---|
| A. Tách khóa publisher engine (bảo mật) | `main.js` (khối `chromiumPublisherKey`), `src/engine/bundledEngineManager.js`, `tools/sign-bundled-engine.js`, `test/engine-publisher-separation.js`, `test/camoufox-bundle-integrity.js`, `test/camoufox-engine-distribution.js`, `test/camoufox-engine-source-hardening.js` | **Nhận** | Bỏ fallback dùng khóa license để ký Chromium (QD-02). Sửa bảo mật được phép. Cần OWNER xác nhận QD-02. |
| B. Echo/egress không giả mạo được (bảo mật) | `src/health/runtimeEchoConfig.js`, `src/health/exitIpObservations.js`, `src/health/runtimeEgressObservation.js`, `tools/echo-service/*`, `test/runtime-echo-settings.js`, `test/echo-service.js`, `test/runtime-egress-observation.js`, phần `validateRuntimeEchoUrl` trong `main.js` | **Nhận** | Từ chối URL HTTP công khai và quan sát giả mạo. |
| C. Cổng bằng chứng phát hành | `tools/commercial-release-gate.js`, `tools/write-build-info.js`, `tools/ci-release-evidence.js`, `release/commercial-evidence-template.json`, `test/commercial-release-gate.js`, `test/write-build-info.js`, `test/release-policy-parity.js`, `test/staged-workflow-contract.js`, script `release:status`/`release:gate` trong `package.json` | **Nhận**, đối chiếu với kit Gate 3 đã có trên `main` (#65, #66) để không trùng | Đúng loại "release-evidence tests". |
| D. Workflow CI | `.github/workflows/camoufox-upstream-smoke.yml`, `windows-exe.yml`, `prepare-draft-release.yml`, `release/workflows/*` | **Đối chiếu từng dòng** với `main` (#63 đã có Camoufox CI thật) | Có thể trùng hoặc ngược hướng với `main`. OWNER duyệt vì sửa workflow. |
| E. License/ledger | `src/licensing/customerLedger.js`, `tools/issue-license.js`, `tools/license-admin.js`, `test/license-admin.js`, `test/license-center.js` | **Chỉ lấy phần sửa lỗi exact-day** nếu `main` (#49, #56, #60) chưa có | `main` đã đổi kiến trúc license; dễ xung đột. |
| F. Giám sát/cảnh báo | `src/monitor/*`, `preload.js` (`clearMonitoringData`), phần `monitoringGeneration` trong `main.js`, test tương ứng | **Nhận phần sửa lỗi** (xóa dữ liệu giám sát có xác nhận, chống ghi đè sau khi xóa). **Để sau 5.8** phần cảnh báo mới. | Phân biệt fix với tính năng theo từng hunk. |
| G. Stage-0 đo lường | `stage0-measure/*`, `test/stage0-measure-resilience.js` | **Nhận** nếu chỉ là kiểm SHA + giới hạn thời gian probe | Công cụ bằng chứng, không đổi hành vi khách. |
| H. Fingerprint/UI mới | `src/engine/camoufoxPreferences.js`, `src/ui/profileConsistency.js`, `src/ui/renderer.js`, `src/ui/index.html`, `src/ui/styles.css`, `src/ui/criteriaChecklistProvider.js`, `test/fingerprint-setup.js`, `test/behavior-warning-ui.js`, `docs/operations/PROFILE-CONSISTENCY-AUDIT.md` | **Từ chối cho 5.8** | Tùy chọn fingerprint mới và mở rộng UI bị cấm bởi scope lock. Trừ khi một hunk sửa crash/mất dữ liệu có test chứng minh. |
| I. Tài liệu | `docs/audits/*`, `docs/release/LIVE-COMMERCIAL-STATUS-20261022.md`, `docs/customer-guide/*`, `docs/seller-runbook/README.md`, `docs/BUNDLED_ENGINE_RELEASE.md` | Nhận làm **lịch sử**, gắn banner P0-2 nếu đã cũ | — |

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| WS1-1 | Tạo `rc58/WS1-candidate` từ `main`; đem vào nhóm A, B, C, G (mỗi nhóm một commit). | Agent | `npm test` không thêm FAIL so với baseline; CI Windows xanh. |
| WS1-2 | Đối chiếu nhóm D, E, F theo từng hunk; ghi hunk nào lấy/bỏ và lý do vào `docs/release/WS1-CONSOLIDATION-LEDGER.md`. | Agent | Ledger liệt kê đủ 70 file với quyết định lấy/bỏ/để sau. |
| WS1-3 | Chạy `node tools/parity-audit.js --gate` và `test/lhm-feature-preservation.js` để chứng minh không mất tính năng của `main`. | Agent | Hai lệnh PASS, ghi output vào PR. |
| WS1-4 | Mở PR `[WS1] v5.8.0 RC candidate` nhắm `main`. Ghi SHA ứng viên, run ID CI, SHA-256 EXE từ `release-evidence.json` của cùng run. | Agent | PR mở, CI xanh. |
| WS1-5 | Duyệt và merge PR WS1. Đóng Draft #46 kèm link tới ledger. | **OWNER** | `main` có SHA ứng viên; ghi SHA vào bảng mục 5. |

### WS2 — Thuê license thật qua HTTPS

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| WS2-1 | Tạo bản ghi DNS `browser.lhmcrm.com` trỏ Cloudflare; cấp Cloudflare API token phạm vi tối thiểu làm GitHub secret; tạo khóa issuer Ed25519 **offline**. | **OWNER** | `nslookup browser.lhmcrm.com` có kết quả; secret có tên trong repo settings (không lộ giá trị). |
| WS2-2 | Viết lại `docs/release/V58_REAL_RENTAL_ACCEPTANCE.md` theo kiến trúc hiện tại: Cloudflare Worker + D1 + portal (`serverless/license-worker/`, `tools/license-cloudflare-sync.js`, `tools/cloudflare-config-builder.js`, `tools/browser-production-smoke.js`). Giữ đủ 8 bài thử (cấp 30 ngày, kích hoạt, restart, gia hạn sớm, thu hồi, hết hạn strict/owner-sweep, server restart + backup, ghi bằng chứng). | Agent | PR chỉ tài liệu; mỗi bước có lệnh thật đang tồn tại trên `main`. |
| WS2-3 | Chạy `bootstrap-browser-license-worker.yml` rồi `deploy-browser-license-center.yml`. | **OWNER** (có secret) | Hai run SUCCESS; `curl https://browser.lhmcrm.com/<health>` trả 200. |
| WS2-4 | PR cấu hình: đặt `resources/license-authority/authority.json` thành `enabled: true` + endpoint HTTPS thật, đúng định dạng mà `src/licensing/authorityConfig.js` và `test/license-packaged-authority.js` yêu cầu. Public key issuer phải khớp key trong EXE (#70). | Agent soạn sau WS2-3, OWNER duyệt | `test/license-packaged-authority.js` và `test/license-issuer-trust-bridge.js` PASS với cấu hình thật; CI Windows xanh. |
| WS2-5 | Chạy `node tools/browser-production-smoke.js` vào endpoint thật (không dùng token khách thật). | Agent hoặc OWNER | Output PASS, đã che dữ liệu nhạy cảm, ghi vào PR. |
| WS2-6 | Thực hiện 8 bài thử của WS2-2 trên máy Windows sạch với khách thử tự nguyện. | **OWNER** | Đủ 8 bước PASS, có video/ảnh đã che token, SHA-256 file bằng chứng lưu ngoài repo. |

### WS3 — Cập nhật có chữ ký

Chú ý: bản đã cài phải **có sẵn** public key thì mới tin được manifest mới.
Vì vậy cần **hai** bản build cùng có key: bản N (cài trước) và bản N+1
(bản cập nhật). Bản Preview hiện tại không có key nên không dùng làm bản N được.

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| WS3-1 | Tạo cặp khóa Ed25519 **riêng cho cập nhật** (không dùng chung khóa license) theo `docs/LHM_SIGNED_ONLINE_UPDATES.md` bước 1 và `tools/setup-update-publisher.js`. Private key giữ offline. | **OWNER** | Có file `.pub`; private key không nằm trong repo/máy CI. |
| WS3-2 | PR thêm `resources/update-publisher/update-publisher-ed25519.pub` (chỉ public key). Kiểm `test/update-check.js`, `test/app-update-signing.js`, `test/online-update-center.js` vẫn PASS và Update Center báo `configured`. | Agent soạn (OWNER đưa file .pub), OWNER duyệt | CI xanh; security review ghi trong PR. |
| WS3-3 | Phân chia phiên bản: bản N = `5.8.0` (SHA ứng viên WS1 + key), bản N+1 = `5.8.1-rc.1` (bump phiên bản, không đổi tính năng). Ghi cách đặt tên asset `LHM-Ads-Browser-<version>-Preview-Setup-x64.exe`. | Agent | Tài liệu + PR bump phiên bản cho N+1 trên nhánh riêng, chưa merge. |
| WS3-4 | Ký manifest offline cho N+1 bằng `tools/sign-app-update.js`, chạy `tools/update-release-preflight.js`, publish `stable.json` vào release tag `lhm-updates`. | **OWNER** | Manifest có size + SHA-256 khớp asset; preflight PASS. |
| WS3-5 | Trên máy sạch đã cài N: kiểm tra online, tải N+1, đối chiếu hash, cài, xác nhận còn profile/license/proxy vault/RPA. Thử manifest bị sửa, hết hạn, sai origin, sai installer phải bị từ chối. | **OWNER** | Mỗi phép thử PASS/FAIL có bằng chứng. |

### WS4 — Gate 3: nghiệm thu EXE đã cài (OWNER)

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| WS4-1 | Cập nhật `docs/acceptance/gate-3-wave2.md` → bản mới cho SHA ứng viên: xóa hash cũ, thêm mục cho bằng chứng WS2-6 và WS3-5. | Agent | PR tài liệu; không còn hash của bản cũ. |
| WS4-2 | Tải hai artifact **cùng một run** trên `main`, chạy `Start-Gate3.ps1` của Operator Kit (xem `docs/acceptance/CURRENT_WINDOWS_GATE3.md`). | **OWNER** | Preflight SHA-256 PASS. |
| WS4-3 | Nghiệm thu thủ công: cài (Defender/SmartScreen để nguyên), Chromium, Camoufox đã ký (nếu phân phối), proxy + quan sát DNS/WebRTC/IP có bằng chứng, cách ly profile, backup/restore, quyền Local API, gỡ/cài lại giữ dữ liệu. | **OWNER** | Mỗi checkpoint: file + SHA-256 + người làm + Windows build. Mục không đo ghi `NOT_RUN`. |

### WS5 — Gate 4 và phát hành (OWNER)

| ID | Việc | Ai | Xong khi |
|---|---|---|---|
| WS5-1 | Chạy `node tools/commercial-release-gate.js --strict` (sau khi WS1 đã đem nhóm C vào) với bằng chứng thật. | Agent hoặc OWNER | Gate trả PASS; không có ô điền sẵn. |
| WS5-2 | Ký duyệt SHA commit + SHA-256 EXE chính xác; xác nhận quyền phân phối engine. | **OWNER** | Biên bản ký lưu ngoài repo, hash ghi vào bảng mục 5. |
| WS5-3 | Chạy `prepare-draft-release.yml` → kiểm nội dung draft → tag + publish thủ công. Không đổi tên Preview thành Commercial để lách tiêu chí. | **OWNER** | Release công khai; Issue #47 đóng. |

---

## 4. Việc ngoài 5.8 (không agent nào được làm trước khi phát hành)

Draft #71 (Google Gmail subscription), Team/Cloud Sync/Synchronizer (#2–#7, issue #2–#4),
fingerprint tab chi tiết (#22), thiết lập fingerprint (#23), AI, redesign UI,
QA-008 (nối D2/D3 vào app — là tính năng mới), lab mạng QA-007 (cần OWNER cung cấp lab;
kết quả được đưa vào Gate 3 nếu đã có, nếu chưa thì giữ `NOT_RUN`).

---

## 5. Bảng trạng thái (agent cập nhật khi xong task)

| Mục | Giá trị |
|---|---|
| SHA ứng viên RC | ____ |
| Run ID Build Windows EXE | ____ |
| SHA-256 EXE | ____ |
| Endpoint license HTTPS | ____ (che nếu cần) |
| SHA-256 của file public key cập nhật | ____ |

| Task | Trạng thái | PR / bằng chứng | Cập nhật |
|---|---|---|---|
| P0-1 | NOT_RUN | | |
| P0-2 | NOT_RUN | | |
| P0-3 | NOT_RUN | | |
| P0-4 | NOT_RUN | | |
| P0-5 | NOT_RUN | | |
| WS1-1 … WS1-5 | NOT_RUN | | |
| WS2-1 … WS2-6 | NOT_RUN | | |
| WS3-1 … WS3-5 | NOT_RUN | | |
| WS4-1 … WS4-3 | NOT_RUN | | |
| WS5-1 … WS5-3 | NOT_RUN | | |

---

## 6. Baseline `npm test` trên `main` @ `0558db9`

Chạy 2026-10-25 trên Windows 11, Node v24.16.0 (máy dev, không phải máy khách sạch), clone sạch,
`npm ci --ignore-scripts` (bỏ tải binary Electron), rồi `node test/run-all.js`:

```
steps run: 270 of 270 | PASS: 270 | FAIL: 0 | wall time: 72.4s
```

Ghi chú:

- `test/seam-qa-r20.js`: 13 PASS, 0 FAIL, **1 NOT_RUN** (seam5 cần checkout
  phase-C tại `/tmp/r20-phasec`). Đây là NOT_RUN có chủ đích, không phải lỗi.
- `stage0-measure/windows-pack`: chỉ smoke phần không cần mạng; mọi phép đo
  mạng vẫn `NOT_RUN` cho tới khi OWNER chạy trên Windows thật (QA-007).
- Lần chạy này **không** xác nhận QA-006 trên Linux. Agent nào làm P0-3 cần
  chạy lại trên Linux trước khi đóng QA-006.
- Mọi PR sau đây phải giữ `FAIL: 0`. Số bước tăng khi thêm test là bình thường.
