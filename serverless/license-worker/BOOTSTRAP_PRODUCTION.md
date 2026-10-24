# Khởi tạo và triển khai LHM License Center trên Cloudflare

**Phạm vi:** triển khai Worker + D1 cho trang quản trị `browser.lhmcrm.com` của LHM Ads Browser. Không phát hành Windows hoặc tự động ghi nhận tiền. Không thay đổi zone gốc `lhmcrm.com`.

## 0. Điều kiện cần — chủ dự án thực hiện

- Cloudflare zone `lhmcrm.com` phải thuộc tài khoản có quyền triển khai và đang Active. Kiểm tra DNS và Workers hiện dùng `browser.lhmcrm.com`; nếu có xung đột, **dừng, không xóa bản ghi đang hoạt động**.
- Tạo D1 thật tên `lhm-license-db`, lấy đúng UUID từ Cloudflare. Không dùng UUID thử để triển khai.
- Trong GitHub repo, tạo **Environment `production`** với required reviewer nếu có thể. Cấu hình ba Environment Secrets: `CLOUDFLARE_API_TOKEN` (quyền hạn tối thiểu cho Workers và D1), `CLOUDFLARE_ACCOUNT_ID`, `LHM_D1_DATABASE_ID`.
- Khóa ký giấy phép production phải là khóa Ed25519 được chủ dự án quản lý, và public key phải **khớp** khóa mà ứng dụng Windows tin cậy. Không tạo cặp khóa tùy tiện hoặc thay thế cặp khóa hiện hữu.
- Không gửi bí mật qua GitHub issue, PR, Zalo, chat hoặc bản build ứng dụng.

## 1. Khởi tạo Worker lần đầu — PRIVATE

Nếu Worker tên `lhm-license-authority` **chưa tồn tại**, chạy `.github/workflows/bootstrap-browser-license-worker.yml` qua Actions → Run workflow **trên main**:

- `worker_confirmation`: `lhm-license-authority`
- `private_confirmation`: `NO_PUBLIC_ROUTE`

Workflow kiểm tra API Cloudflare và **từ chối ghi đè Worker hiện có**; tạo cấu hình không có Custom Domain, không có Cron, `workers_dev=false` và `preview_urls=false`. Nó chỉ tạo Worker riêng tư, chưa đưa web lên mạng công khai.

Nếu Worker đã tồn tại, **không chạy lại bootstrap**. Kiểm tra cấu hình và lịch sử triển khai của Worker đang tồn tại trước khi tiếp tục.

> Nếu bootstrap thất bại, kiểm tra GitHub Actions log (không copy secrets); **không** tự tắt kiểm tra Worker đã tồn tại hoặc mở tạm workers.dev để né lỗi.

## 2. Nạp bốn Cloudflare Worker Secrets

Vào Workers & Pages → `lhm-license-authority` → Settings → Variables and Secrets. Thêm đủ bốn **Secret**:

1. `LHM_ISSUER_PRIVATE_PKCS8_B64` — issuer Ed25519 private key ở định dạng DER PKCS#8 base64.
2. `LHM_ISSUER_PUBLIC_SPKI_B64` — public Ed25519 SPKI DER base64 **khớp** key của ứng dụng Windows.
3. `LHM_LICENSE_ADMIN_TOKEN` — chuỗi quản trị ngẫu nhiên dài ít nhất 32 ký tự.
4. `LHM_ORDER_TOKEN_ENC_KEY_B64` — 32 byte ngẫu nhiên base64 cho AES-GCM; sao lưu bảo mật. Mất khóa này sẽ không đọc lại được token đã mã hóa trong D1.

Không dùng `[vars]` để lưu bí mật. Workflow production kiểm tra **tên** bốn secrets, không đọc giá trị. Endpoint `/health` sau deploy kiểm tra D1 và cặp khóa issuer.

## 3. Mở production có phê duyệt

- Kiểm tra và sao lưu D1, review các file `migrations/0001_licenses.sql` và `migrations/0002_billing_portal.sql`.
- Xác minh DNS `browser.lhmcrm.com` chưa do app khác sử dụng. Cloudflare Custom Domain có thể không gắn được khi có CNAME trùng.
- Chạy Actions → **Deploy LHM License Center to Cloudflare (manual)** trên nhánh `main` với:
  - `hostname_confirmation` = `browser.lhmcrm.com`
  - `migration_confirmation` = `BACKUP_AND_MIGRATIONS_REVIEWED`
- Workflow chạy unit tests, đóng gói thử Worker, kiểm tra bốn secrets, áp D1 remote migrations (Cloudflare ghi backup trước khi áp theo Wrangler), deploy Custom Domain và chạy read-only HTTPS smoke.
- **Không tự xóa DNS khi gặp lỗi.** Điều tra xung đột quyền/tên miền trước.

## 4. Kiểm thử khách hàng và bán thuê bao

- `GET https://browser.lhmcrm.com/health` phải trả HTTP 200 `status=ok`; HTTP 503 nghĩa là chưa sẵn sàng.
- Admin summary phải trả 401/403 khi không có Bearer token. Trang đăng nhập chỉ nên hiển thị qua HTTPS; bật MFA, Cloudflare Access/WAF phù hợp mà **không chặn client `POST /v1/verify`**.
- Test quy trình bằng D1 staging hoặc dữ liệu được ủy quyền: tạo đơn → còn pending thì không cấp key → xác nhận chuyển khoản **chỉ sau khi đối chiếu sao kê ngân hàng thật** → ký key → kiểm tra đăng ký/thu hồi/gia hạn.
- Thử kích hoạt trên Windows sạch với URL verify production, public key đúng, restart, offline grace, revoke, renew và chế độ fail-closed. Lưu log đã xóa dữ liệu khách, băm installer và bằng chứng ký cập nhật.
- **Không phát hành bản thương mại** khi Camoufox redistribution, authenticated proxy/DNS/WebRTC, nghiệm thu máy Windows thật hoặc signed update chưa đạt.

Lệnh chỉ đọc để kiểm tra sau deploy:
```sh
node tools/browser-production-smoke.js https://browser.lhmcrm.com
```
