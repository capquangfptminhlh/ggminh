# Kế hoạch đưa LHM Ads Browser lên bán thương mại — 09/11/2026

**Trạng thái hiện tại: CHƯA bán được.** Bản đang cài (`main` @ `a1f8d02`,
EXE SHA-256 `f2e5d4e1…ce4e`) tự báo trong *Thông tin LHM → Bàn giao khách
hàng*: **CẦN RÀ SOÁT — 4 cổng nghiệm thu bên ngoài chưa xác minh.**
Issue #47 (Release v5.8.0 RC) còn mở.

Phần mềm (giao diện, 340 test tự động, bấm thật trên bản cài 32/32) đã xong.
Những gì còn thiếu là **hạ tầng và nghiệm thu thật** — phần lớn chỉ chủ dự
án làm được vì cần tài khoản, tên miền và khóa bí mật.

> Quy tắc an toàn xuyên suốt: khóa riêng (issuer, update publisher), mật
> khẩu, admin token **không bao giờ** dán vào chat, GitHub, PR hay file
> trong repo. Trợ lý chỉ làm việc với khóa công khai, SHA-256 và log đã che.

---

## Cập nhật 09/11 tối — có đường bán sớm hơn (phương án A)

Khi chuẩn bị, trợ lý tìm thấy hai việc đã làm từ 06/11 mà kế hoạch ban đầu
chưa tính:

- **Khóa issuer license đã có** (commit `0f1e1cd`, vân tay SPKI
  `725db621…dff0`, ghim trong app và Worker). Khóa riêng đã mã hóa nằm ở
  `D:\LHM-Keys\` trên máy chủ dự án; mật khẩu bọc DPAPI. Bản cài hiện tại
  **chấp nhận license `strict` khi chưa có máy chủ** và chặn `owner-sweep`.
- **Khóa ký cập nhật đã có** (commit `8a76b43`, khóa riêng cũng ở
  `D:\LHM-Keys\`). Trợ lý đã chạy thử toàn bộ quy trình ký bằng khóa thử
  dùng một lần: `setup-update-publisher` → `sign-app-update` →
  `update-release-preflight` cho EXE `a1f8d02` ra `VERIFIED_ARTIFACT_ONLY`;
  manifest bị sửa 1 ký tự bị từ chối. Lưu ý: manifest mặc định hết hạn sau
  30 ngày (`--valid-days`), phải ký lại định kỳ.

**Phương án A — bán bản đầu bằng license offline `strict`, chưa cần máy chủ:**

| Bước | Việc | Ai |
|---|---|---|
| A1 | Nghiệm thu license offline trên máy Windows sạch: cấp → kích hoạt → restart → gia hạn → hết hạn (`docs/release/KICH-BAN-NGHIEM-THU-BAN-DAU.md`, phần 1) | Chủ dự án + khách thử |
| A2 | Nâng cấp giữ dữ liệu (cùng tài liệu, phần 2) | Chủ dự án |
| A3 | Bỏ chữ "Preview" (đụng `package.json`, 2 workflow, bộ công cụ Gate 3) — **chỉ sau khi A1, A2 PASS**, vì `V58_RC_SCOPE_LOCK_20261023.md` cấm bỏ "Preview" để lách tiêu chí. Tài liệu khách hàng: bộ có sẵn `docs/customer-guide/` (đã bổ sung chương 09) | Trợ lý (PR ngày phát hành) |
| A4 | Ký manifest cập nhật cho EXE đã đóng băng, tạo release `lhm-updates` | Chủ dự án ký, trợ lý preflight + tải lên |
| A5 | Tag `v5.8.0`, đóng Issue #47 với ghi chú "license offline strict" | Chủ dự án duyệt |

Giới hạn phải chấp nhận khi chọn A: **không thu hồi license từ xa**, không
có biên nhận máy chủ; hạn dùng dựa trên đồng hồ máy khách (app cảnh báo khi
giờ bị chỉnh lùi). Máy chủ license (bước 1–2 bên dưới) làm sau, khi cần
thu hồi/`owner-sweep`.

---

## Bảng tổng hợp (phương án đầy đủ, có máy chủ license)

| # | Việc | Ai làm | Phụ thuộc | Bằng chứng "xong" |
|---|---|---|---|---|
| 0 | Chốt 6 quyết định chính sách | Chủ dự án | — | Bảng quyết định trong `RELEASE-CHECKLIST.md` có lựa chọn + ngày |
| 1 | Dựng máy chủ license (Cloudflare Worker + D1) | Chủ dự án | 0 | `GET https://browser.lhmcrm.com/health` trả `ok` qua HTTPS |
| 2 | Bật máy chủ license trong bản cài + build mới | Trợ lý (PR) | 1 | `resources/license-authority/authority.json` `enabled:true`; CI xanh; EXE mới có SHA-256 |
| 3 | Khóa ký cập nhật + kênh cập nhật | Chủ dự án (khóa) + Trợ lý (manifest, preflight) | 0 | Bản cũ bấm "Kiểm tra phiên bản online" thấy bản mới, tải đúng SHA |
| 4 | Thử cho thuê thật 8 bước trên máy Windows sạch | Chủ dự án + khách thử | 1, 2 | 8/8 PASS kèm ảnh/video đã che, ghi vào Issue #47 |
| 5 | Nâng cấp giữ dữ liệu trên máy khách | Chủ dự án (Trợ lý soạn kịch bản) | 2, 3 | Cài bản mới đè bản cũ: hồ sơ, proxy, quy trình còn nguyên |
| 6 | Phát hành chính thức (Gate 4) | Chủ dự án duyệt, Trợ lý chuẩn bị | 1–5 | Tag `v5.8.0`, bỏ chữ "Preview", tài liệu khách hàng, Issue #47 đóng |

Thời gian ước lượng nếu làm liên tục: **3–5 ngày làm việc**, chủ yếu chờ
cấu hình Cloudflare/DNS và buổi thử với khách.

---

## Bước 0 — Chốt quyết định (1 buổi, chủ dự án)

Điền vào bảng *Quyết định chính sách* trong
`docs/release/RELEASE-CHECKLIST.md`. Tối thiểu cho bản bán đầu:

1. **Chế độ hết hạn license:** `owner-sweep` (máy chủ tắt thì không tự khóa,
   cần biên nhận thu hồi có chữ ký) hay `strict` (khóa đúng kỳ hạn).
2. **Gói bán:** tên gói (`pro`…), số ngày (30), số hồ sơ tối đa.
3. **A12-D2 — Kênh cập nhật:** GitHub Releases tag `lhm-updates`
   (app đã trỏ sẵn `…/releases/download/lhm-updates/stable.json`) hay CDN riêng.
4. **QD-02 / A12-D3 — Khóa ký cập nhật:** dùng riêng (khuyến nghị) hay chung
   khóa publisher engine.
5. **A12-D1 / A12-D4 — Cách cập nhật:** kiểm tra thủ công, chỉ tải khi người
   dùng bấm, cấm cài lặng (khuyến nghị theo checklist).
6. **Ký số Windows (Authenticode):** checklist ghi chủ dự án đã quyết
   *không mua* (22/10/2026). Nếu giữ quyết định này, tài liệu khách hàng
   **phải** cảnh báo SmartScreen/Defender. Nếu đổi ý: mua chứng chỉ, đặt
   GitHub Secrets `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`; workflow
   `windows-exe.yml` đã sẵn bước ký.

Ghi chú: Gate 2b trong `RELEASE-CHECKLIST.md` (phép đo Camoufox trên CI,
QD-04) vẫn ghi CHƯA ĐẠT — chủ dự án quyết định có bắt buộc cho bản bán
đầu (chỉ Chromium/Edge) hay không.

## Bước 1 — Máy chủ license (Cổng 1, chủ dự án)

Làm theo `serverless/license-worker/BOOTSTRAP_PRODUCTION.md` và
`serverless/license-worker/README.md`, **trên máy của chủ dự án**:

1. Tài khoản Cloudflare bật MFA; tên miền `lhmcrm.com` quản lý DNS trên
   Cloudflare. Địa chỉ đã duyệt sẵn trong app:
   `https://browser.lhmcrm.com/v1/verify` (`src/licensing/authorityConfig.js`).
   Hiện tại `https://browser.lhmcrm.com/health` **không phản hồi**.
2. Sao chép `wrangler.toml.example` → `wrangler.toml` ở thư mục triển khai
   riêng (không commit). `npx wrangler d1 create lhm-license-db`, điền
   `database_id`, rồi `npx wrangler d1 migrations apply lhm-license-db --remote`.
   Bật backup D1.
3. Sinh cặp khóa issuer **ngoại tuyến**. Nạp bằng `npx wrangler secret put`:
   `LHM_ISSUER_PRIVATE_PKCS8_B64`, `LHM_ISSUER_PUBLIC_SPKI_B64`,
   `LHM_LICENSE_ADMIN_TOKEN` (ngẫu nhiên ≥ 32 ký tự).
4. `npx wrangler deploy`, gắn Custom Domain `browser.lhmcrm.com`.
5. Kiểm tra: `GET https://browser.lhmcrm.com/health` → `ok`; HTTP thường bị từ chối.

**Gửi cho trợ lý (an toàn):** khóa **công khai** issuer (SPKI base64) và
kết quả `/health`. Không gửi khóa riêng hay admin token.

## Bước 2 — Bật license trong bản cài (Trợ lý, 1 PR)

1. Đổi `resources/license-authority/authority.json` (đóng gói thành
   `resources/lhm-license-authority/authority.json`, hiện `enabled:false`) sang
   `{"schema":"lhm.license-authority-config.v1","enabled":true,"endpoint":"https://browser.lhmcrm.com/v1/verify"}`.
2. Đặt khóa công khai issuer production vào trust anchor đóng gói; chạy
   `test/license-trust-anchor.js`, `test/license-packaged-authority.js`,
   `test/license-online.js`.
3. CI xanh → tải EXE mới, ghi SHA-256 → **đóng băng SHA này** cho bước 4–6.

## Bước 3 — Cập nhật có chữ ký (Cổng 3)

1. **Chủ dự án, ngoại tuyến:** `node tools/setup-update-publisher.js` sinh khóa
   Ed25519; khóa riêng mã hóa, cất ngoài repo; theo
   `docs/agents/agent-13/OWNER-RUNBOOK.md` (lưu trữ, thu hồi, đổi khóa).
   So khóa công khai với `resources/update-publisher/update-publisher-ed25519.pub`
   trong repo (đóng gói thành `resources/lhm-update-publisher/…`) — phải khớp,
   nếu không thì Trợ lý cập nhật trong PR bước 2.
2. **Trợ lý:** tạo GitHub Release tag `lhm-updates` (hiện chưa tồn tại).
3. **Chủ dự án:** `node tools/sign-app-update.js` ký manifest `stable.json` cho
   EXE đã đóng băng; **Trợ lý** chạy `node tools/update-release-preflight.js`
   và tải manifest + EXE lên release.
4. Thử: trên bản cũ hơn, *Thông tin LHM → Kiểm tra phiên bản online* thấy bản
   mới; *Tải bản cập nhật đã xác minh* tải đúng SHA-256; sửa 1 byte manifest
   thì bị từ chối.

## Bước 4 — Thử cho thuê thật (Cổng 2)

Theo `docs/release/V58_REAL_RENTAL_ACCEPTANCE.md`, trên **máy Windows sạch
khác** máy bán, với **khách thử tự nguyện**, dùng đúng EXE đã đóng băng.
Có sẵn bộ công cụ: artifact `LHM-Gate3-Operator-Kit-Windows` của bản build
và `docs/acceptance/CURRENT_WINDOWS_GATE3.md`.

1. Cài EXE, kiểm SHA; lấy mã cài đặt ở màn License; thêm khách
   (`tools/license-admin.js add` hoặc trang quản trị Worker).
2. Cấp 30 ngày; kiểm `expiresAt − issuedAt = 2.592.000.000 ms`.
3. Kích hoạt trên máy khách qua HTTPS; restart vẫn đúng; sai mã cài đặt /
   giả chữ ký / HTTP thường bị từ chối.
4. Gia hạn sớm sau 10 ngày (dùng đồng hồ giả lập ở môi trường thử).
5. Thu hồi: chặn thao tác mới nhưng **không xóa dữ liệu**; cho phép lại.
6. Hết hạn strict / owner-sweep online-offline đúng chính sách bước 0.
7. Tắt máy chủ, bật lại: D1 còn nguyên, cron sweep chạy, khôi phục backup.
8. Ghi bằng chứng (SHA app/EXE, bản Windows, ảnh/video đã che token) vào Issue #47.

**Chỉ khi 8/8 PASS** mới đánh dấu cổng thuê thật đạt.

## Bước 5 — Nâng cấp giữ dữ liệu (Cổng 4)

Trên máy khách thử: cài bản trước, tạo hồ sơ + proxy + quy trình + snapshot
phiên, chạy *Kiểm tra an toàn nâng cấp*, rồi cập nhật qua bước 3 (hoặc cài
đè). Kết quả: dữ liệu còn nguyên, license còn hiệu lực, app chạy được.
Trợ lý soạn kịch bản kiểm tra và biểu mẫu ghi kết quả.

## Bước 6 — Phát hành chính thức (Gate 4)

1. Bỏ chữ "Preview" trong tên bộ cài/kênh; số phiên bản `5.8.0` — chỉ khi các
   cổng đã PASS (quy tắc trong `V58_RC_SCOPE_LOCK_20261023.md`).
2. Tài liệu khách hàng: bộ `docs/customer-guide/` (01–09); bỏ nhãn
   "(Preview)" trong `README.md` của bộ này cùng lúc với bước 1.
3. *Thông tin LHM → Bàn giao khách hàng* trên bản cuối không còn mục
   "CẦN RÀ SOÁT" ngoài các mục chủ dự án đã chấp nhận bằng văn bản.
4. Đánh dấu đủ checklist Issue #47 → tag `v5.8.0` → release → đóng Issue.

---

## Trợ lý có thể bắt đầu ngay (không cần khóa bí mật)

- Soạn PR bước 2 ở dạng nháp (bật endpoint), chờ khóa công khai issuer.
- Viết tài liệu khách hàng (bước 6) và kịch bản nâng cấp (bước 5).
- Chuẩn bị release `lhm-updates` rỗng và kiểm tra preflight bằng khóa thử.
- Kiểm tra cấu hình `wrangler.toml` (bản đã xóa secret) trước khi deploy.
