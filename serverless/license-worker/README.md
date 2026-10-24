# LHM Browser — Website quản trị key, gia hạn và đơn hàng

**Trang chủ `https://browser.lhmcrm.com/` giờ là bảng quản trị nội bộ** (không phải trang quảng bá). Gồm khách hàng, đơn hàng, giá bằng VND, xác nhận thanh toán thủ công, cấp key và gia hạn. Mã nguồn `src/admin.mjs`, `src/adminClient.mjs`, `src/commerce.mjs`; schema bổ sung `migrations/0002_sales_orders.sql`. Cần chạy `wrangler d1 migrations apply lhm-license-db --remote` để thêm bảng. **Không có ngân hàng/payment gateway tích hợp**: chủ dự án phải kiểm tra tiền vào tài khoản ngân hàng **trước** khi bấm xác nhận, web không tự biết giao dịch nào đã thanh toán. Không lưu số thẻ hoặc thông tin tài khoản ngân hàng.

Quy trình: thêm khách (tên/email) → lấy Installation ID từ phần mềm Windows → tạo đơn, chọn gói/số tháng/giá đã thỏa thuận → đối chiếu giao dịch bên ngân hàng → xác nhận kèm mã giao dịch → bấm cấp key → sao chép `lhmlic1` gửi khách. Gia hạn chọn đơn `Gia hạn`, nhập license ID cũ và đúng Installation ID, chỉ ký key mới sau khi xác nhận tiền. Giao diện dùng mật khẩu quản trị qua Bearer (Secret `LHM_LICENSE_ADMIN_TOKEN`); không lưu mật khẩu trong localStorage/cookie. Đăng nhập lại mỗi khi tải trang. **Bắt buộc dùng HTTPS, MFA tài khoản Cloudflare, Cloudflare Access/WAF hạn chế khu vực `/admin` và `/v1/admin/*`, rate limiting trước khi mở thật.** API không có quyền đọc email/đơn hàng nếu thiếu token quản trị.

Key được ký Ed25519 trong Worker với secret có sự phê duyệt của owner; D1 chỉ giữ claims (không giữ raw token). Chức năng lấy lại key ký lại từ claims sau khi bấm "Xem lại key". Khách Windows vẫn dùng `POST /v1/verify` có chữ ký. Phiên bản này chưa có cổng tự thanh toán của khách, webhook ngân hàng hoặc tự gửi email key; không quảng cáo thanh toán tự động.

**Mức nghiệm thu:** mới là mã nguồn + synthetic tests; **chưa có** Worker/D1 production, Secret production, merchant settlement evidence, Windows độc lập hay Gate 3/4. Bản EXE vẫn Preview.

---

# LHM License Authority — Cloudflare Workers + D1 (không cần VPS riêng)

**Đích tên miền đã cấu hình trong Wrangler:** `browser.lhmcrm.com` cho trang LHM Ads Browser tại `/` và API license tại `/v1/verify`. [Hướng dẫn triển khai tên miền và DNS Cloudflare](DEPLOY_BROWSER_LHMCRM.md). Cấu hình trong repo **không đồng nghĩa domain đã live**.

**Mức hoàn thành: mã triển khai + bài thử tổng hợp, CHƯA DEPLOY production.**
Không bật tính năng bán thuê thật hoặc đánh dấu Gate 3/4 PASS khi chưa chạy trọn checklist
`docs/release/V58_REAL_RENTAL_ACCEPTANCE.md` từ một Windows độc lập.

## Chức năng và bất biến bảo mật

- `POST /v1/verify`: nhận `{version:1,token,nonce}`, kiểm chữ ký Ed25519
  **trước khi** đọc trạng thái trên D1, buộc token đã được đăng ký bởi người bán
  và trả `{receipt}` đúng chuẩn `lhmproof1` được ứng dụng Windows hiện tại
  kiểm tra tại `src/licensing/receipts.js`.
- `POST /v1/admin/register`: yêu cầu Bearer token 32+ ký tự; nhận token license
  đã ký từ máy người bán, xác thực và **chỉ lưu**
  mã license, mã cài đặt, hạn, chế độ, cờ thu hồi vào D1.
  Không lưu token, private key, tài khoản Google, cookie, dữ liệu trình duyệt.
- `POST /v1/admin/revocation`: yêu cầu Bearer; body
  `{licenseId,revoked:true|false}`. Không cho phép mở lại license
  `owner_sweep` đã hết hạn — phải cấp/gia hạn token mới.
- `GET /health`: kiểm tra khóa ghép cặp và truy vấn D1, không cung cấp dữ liệu khách.
- Cloudflare Cron chạy mỗi 15 phút đánh dấu owner-sweep hết hạn. Nếu Cron
  bị chậm, mỗi lượt xác minh cũng kiểm và thu hồi đúng hạn. Nếu Worker/D1 lỗi,
  không phát hành biên nhận `valid` giả. Máy Windows giữ cơ chế
  **biên nhận hợp lệ cũ / offline-grace** sẵn có; Worker không tự xóa hồ sơ.
- **Chữ ký bên bán:** Worker sử dụng Ed25519 PKCS#8 trong Cloudflare Secret
  và public key SPKI riêng. Hai khóa phải khớp nhau **và** khớp public key
  **đã đóng gói trong EXE khách**. Cần đánh giá an ninh/quản lý truy cập
  trước khi đưa private key lên Cloudflare. Nếu bên bán không đồng ý giữ
  khóa riêng trong Cloudflare Secret, cần chọn kiến trúc HSM/remote signer
  khác; không được bỏ qua xác minh chữ ký.
- Worker **không** dựa vào IP hay `X-Forwarded-For` để xác định khách.
  Bật Cloudflare WAF/rate limiting, D1 backup, alert và giới hạn truy cập
  admin **ở lớp Cloudflare**, vì giới hạn bộ nhớ theo instance của
  Node server `src/licensing/authority.js` không tự mang sang Workers.

## Chuẩn bị Cloudflare, trên máy của chủ dự án

1. Có Cloudflare Account, Workers và D1. Trong thư mục này, sao chép
   `wrangler.toml.example` thành `wrangler.toml` **ở workspace triển khai
   riêng, không commit**. Chạy `npx wrangler d1 create lhm-license-db`,
   điền `database_id` thật từ Cloudflare.
2. Chạy `npx wrangler d1 migrations apply lhm-license-db --remote`.
   Bật backup D1, giới hạn ai có quyền deploy, bảo vệ tài khoản Cloudflare
   bằng MFA. Chưa có DB thực thì endpoint phải trả lỗi.
3. Chuẩn bị *đúng* cặp khóa issuer dùng bởi bản EXE đã nghiệm thu.
   Xuất PKCS#8 DER **base64** từ PEM riêng bằng công cụ offline trên máy
   owner, xuất SPKI DER **base64** từ public key (không chia sẻ vào chat).
   Thêm bằng secret manager, không đưa vào `[vars]`, `wrangler.toml`,
   commit hay GitHub Actions logs:

   ```text
   npx wrangler secret put LHM_ISSUER_PRIVATE_PKCS8_B64
   npx wrangler secret put LHM_ISSUER_PUBLIC_SPKI_B64
   npx wrangler secret put LHM_LICENSE_ADMIN_TOKEN
   ```

   Admin token phải được sinh ngẫu nhiên (32+ ký tự) và quản lý riêng.
   Không dán khóa riêng vào đoạn chat, trang GitHub hay file hướng dẫn.
   Secret private key đưa lên Cloudflare cần owner duyệt rủi ro, không tự
   di chuyển từ máy chủ/bộ cài cũ.
4. Chạy `npx wrangler deploy`, kiểm `GET https://<domain>/health`
   trả trạng thái `ok`, không dùng HTTP. Cloudflare Workers
   **không** phải Cloudflare Pages tĩnh — cần cấu hình Workers + D1.
   Nếu dùng tên miền riêng, cấu hình route/Custom Domain HTTPS trên
   Cloudflare để có URL hợp lệ dạng `https://<host>/v1/verify`.
   Chưa có quyền Cloudflare, URL/domain, DB và secret thật thì bước này
   **NOT_RUN**, kể cả khi CI xanh.

## Vận hành bên bán: cấp, gia hạn và thu hồi

Quy trình local vẫn dùng sổ `ledger.json` và công cụ
`tools/license-admin.js`, do chủ dự án kiểm soát, khóa ký không được
đưa vào bộ cài khách. Sau `issue` hoặc `renew`, chủ dự án **phải
đăng ký token vừa cấp với Worker trước khi gửi cho khách**.

CLI riêng: `tools/license-cloudflare-sync.js`, nhận token qua **stdin**,
không nhận token trên dòng lệnh và không in lại token.

```text
node tools/license-cloudflare-sync.js health --url https://<authority-domain>/
node tools/license-cloudflare-sync.js register --url https://<authority-domain>/
node tools/license-cloudflare-sync.js revoke --url https://<authority-domain>/ --license-id lic_<24-hex>
node tools/license-cloudflare-sync.js allow --url https://<authority-domain>/ --license-id lic_<24-hex>
```

Trước mỗi lệnh quản trị (trừ health), thiết lập bí mật
`LHM_LICENSE_ADMIN_TOKEN` trong biến môi trường *riêng tư*.
Lệnh `register` đọc token từ stdin: dán token từ kết quả cấp vào
terminal, kết thúc stdin; không nhập token vào tham số, lịch sử shell,
CI log, hay ticket công khai. Có thể dùng tệp riêng tạm thời trên
máy owner nếu quy trình mật phù hợp; xóa an toàn sau khi hoàn thành.

**Thu hồi:** cập nhật bằng `license-admin.js revoke` để lưu ledger và
registry *và* gọi CLI Worker `revoke`. Vì đây là hai hệ thống độc lập,
khi một bên lỗi phải tạm dừng cung cấp và **đối soát cả hai**
trước khi xác nhận. Không tự động công bố thu hồi hoàn tất nếu chỉ một
trong hai bên ghi nhận. Với `owner_sweep`, Worker tự quét D1 định kỳ
sau khi token đã được đăng ký, không cần tiến trình Node chủ riêng.

Trên máy khách: cấu hình `LHM_LICENSE_VERIFY_URL` trỏ đến
`https://<authority-domain>/v1/verify` theo cách đóng gói/hướng dẫn
ứng dụng đã nghiệm thu. URL HTTPS mới **không tự xuất hiện** chỉ vì
đã deploy Worker — kiểm tra giá trị thật trong bản EXE.

## Nghiệm thu bắt buộc trước khi bán

- [ ] Tên miền HTTPS live, bí mật owner được bảo vệ, D1 remote có backup.
- [ ] Khóa Worker khớp chính xác public key trong **EXE khách đang tải**,
      thử sai key bị từ chối.
- [ ] `register` thành công, máy Windows mới kích hoạt, nhận biên nhận có
      chữ ký và restart vẫn hoạt động; license chưa đăng ký phải bị chặn.
- [ ] Gia hạn trước hạn và sau hạn, strict vs owner-sweep,
      revoke/allow, offline/dịch vụ lỗi, restart và D1 durability.
- [ ] Thu hồi và phục hồi sổ owner / D1 sau sự cố; chứng minh Cron đã chạy.
- [ ] Kiểm tra Cloudflare WAF/rate limiting, truy cập quản trị và chống
      replay / lỗi truy vấn; ghi log đã che thông tin.
- [ ] Nghiệm thu Gate 3 Windows + manifest cập nhật production + owner Gate 4
      trên **đúng SHA EXE** theo Issue #47.

**CI chỉ kiểm tra bằng khóa ngẫu nhiên tổng hợp và D1 mô phỏng.** Nó
không chứng minh Worker đã triển khai, không thay thế D1 thật hay
kiểm thử người dùng thương mại, và không tạo khóa sản xuất.
