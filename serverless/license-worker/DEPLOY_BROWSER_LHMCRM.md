# Kết nối browser.lhmcrm.com — LHM Ads Browser

**Trạng thái trước khi thực thi:** Repo đã cấu hình hostname đích; **chưa có chứng cứ quyền Cloudflare, DNS, D1, secrets hoặc deploy production**. Không tuyên bố website đã live chỉ dựa vào commit/CI.

## Kiến trúc đã chốt

- `https://browser.lhmcrm.com/` — **web quản trị** tạo đơn, cấp key, gia hạn và kiểm tra thanh toán thủ công; chưa tự thu tiền từ ngân hàng.
- `https://browser.lhmcrm.com/health` — health của dịch vụ license; trả `{"status":"ok"}` **chỉ khi** D1 và cặp khóa issuer đã được thiết lập đúng.
- `https://browser.lhmcrm.com/v1/verify` — endpoint POST từ bộ cài Windows, ký biên nhận Ed25519.
- `/v1/admin/register`, `/v1/admin/revocation` — chỉ cho quản trị viên có Bearer secret, cần bảo vệ thêm tại Cloudflare WAF/Access phù hợp.
- Website `https://lhmcrm.com/` và `www` **không bị cấu hình này thay đổi**. Không sửa bản ghi A/AAAA/CNAME của root hay `www`.
- Đây **không** phải hosting toàn bộ ứng dụng Electron như một web app/PWA. Phần Windows vẫn là sản phẩm chính.

## Một lần thiết lập trên Cloudflare, bằng tài khoản của anh

1. Mở **Cloudflare Dashboard → Websites → lhmcrm.com**. Kiểm tra zone có trạng thái Active và DNS thực tế. Nếu `browser` đã có A/AAAA/CNAME hoặc Worker/Pages đang dùng, **dừng lại để kiểm tra** chứ không xóa hoặc ghi đè. Có Custom Domain trùng CNAME thì Cloudflare có thể không thêm được; không đụng sang `lhmcrm.com` chính.
2. Vào **Workers & Pages → D1**, tạo database **`lhm-license-db`** trong cùng account; lấy `database_id` từ Cloudflare, không phỏng đoán.
3. Trong repo, vào `serverless/license-worker/`, sao chép `wrangler.toml.example` thành file `wrangler.toml` **ở máy triển khai**. Sửa đúng `database_id`; `[[routes]] pattern = "browser.lhmcrm.com"; custom_domain = true` đã được khai báo sẵn. Tệp `wrangler.toml` được `.gitignore` chặn commit.
4. Cài Node.js rồi đăng nhập Wrangler bằng trình duyệt: `npx wrangler login`. Dưới thư mục `serverless/license-worker/` chạy:
   - `npx wrangler d1 migrations apply lhm-license-db --remote`
   - **Sau khi** owner phê duyệt nơi lưu private key, cấu hình Cloudflare Secrets qua giao diện Workers hoặc `wrangler secret put`:
     - `LHM_ISSUER_PRIVATE_PKCS8_B64` (khóa issuer Ed25519 đúng PKCS#8 DER base64)
     - `LHM_ISSUER_PUBLIC_SPKI_B64` (public SPKI DER base64 tương ứng và khớp EXE)
     - `LHM_LICENSE_ADMIN_TOKEN` (bí mật quản trị 32+ ký tự ngẫu nhiên)
   - `npx wrangler deploy`
5. Cloudflare **tự tạo DNS record và HTTPS certificate** cho Custom Domain khi deploy/attach thành công; không cần tạo thêm CNAME thủ công. Kiểm tra trong **Worker → Settings → Domains & Routes** phải có `browser.lhmcrm.com` trạng thái active và không có lỗi conflict. Nếu đã deploy từ Wrangler nhưng chưa attach, chọn **Add → Custom Domain → browser.lhmcrm.com** theo đúng Worker.
6. Kiểm tra HTTPS:
   - Mở `https://browser.lhmcrm.com/`: hiển thị trang LHM Ads Browser (Preview).
   - Mở `https://browser.lhmcrm.com/health`: trả HTTP 200 + `status:ok` khi **D1 đã migrate và issuer keys đúng**. 503 là lỗi và chưa cho phép phục vụ khách.
   - `POST /v1/verify` với token hợp lệ **chưa được đăng ký** phải từ chối; sau `register` phải trả **biên nhận có chữ ký**, app Windows xác minh được. Không kiểm thử bằng token thật qua công cụ công khai.
   - Thử sai key, revoke, renew, offline, D1 down, thời hạn owner-sweep trên **Windows độc lập**.
7. Chỉ sau Gate 3 thành công mới cài vào cấu hình bản phát hành Windows:
   `LHM_LICENSE_VERIFY_URL=https://browser.lhmcrm.com/v1/verify`.
   Lưu ý: `main.js` hiện đọc **biến môi trường** `LHM_LICENSE_VERIFY_URL` lúc chạy; việc deploy Worker không tự thay giá trị trong EXE. Cần build/giao cấu hình khách đúng rồi kiểm thử.
8. Bảo mật sản xuất: bật WAF/rate limiting (nhất là `/v1/admin/*` và `/v1/verify`), MFA tài khoản Cloudflare, backup D1, phân quyền deploy, giám sát 5xx và hạn license. Không bật cookie/session telemetry Google Ads ở máy chủ license.
9. Quản lý giấy phép: dùng công cụ `tools/license-admin.js` của bên bán và `tools/license-cloudflare-sync.js` để đăng ký/thu hồi token lên Worker; đối soát ledger local và D1. Không gửi token/private key vào chat/GitHub issue, không dùng license thử ở production.

## Nếu anh không muốn dùng terminal

Trong Cloudflare Dashboard: **Workers & Pages → Create Worker** (cần đưa mã ở `serverless/license-worker/src/` lên qua phương thức hỗ trợ module), sau đó **Bindings → D1** gắn `LICENSE_DB`, **Settings → Variables and Secrets** thêm ba Secrets, **Domains & Routes → Add → Custom Domain** gắn `browser.lhmcrm.com`. Chú ý **migrations SQL và Cron** vẫn phải cấu hình, một trang HTML tĩnh ở Cloudflare Pages không thay thế được Worker này.

> Gate thương mại: vẫn **NOT_RUN** cho đến khi có bằng chứng DNS/HTTPS thật, D1 thật, signing trust + biên nhận Windows hợp lệ, Windows Gate 3 và xác nhận Gate 4. Không sử dụng trang chủ Preview để bán/giao mã license trước nghiệm thu.
