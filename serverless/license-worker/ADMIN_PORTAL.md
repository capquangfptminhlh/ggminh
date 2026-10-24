# LHM License Center — browser.lhmcrm.com

**Đúng mục tiêu:** đây là **web quản trị cấp key, gia hạn và thanh toán** cho ứng dụng Windows, KHÔNG phải web giới thiệu hay phiên bản browser chạy trực tuyến.

### Có trong mã web

- Đăng nhập bằng `LHM_LICENSE_ADMIN_TOKEN` qua HTTPS (chỉ nhớ trong RAM tab; không lưu localStorage). Nên thêm Cloudflare Access cho đường quản trị.
- Bảng tổng quan: đơn hàng, chờ thanh toán, key đã cấp, giá trị đơn đã cấp.
- Tạo đơn khách hàng mới hoặc gia hạn theo Installation ID trên máy Windows.
- Gói Starter tối đa 5 hồ sơ; **giá LHM Ads Browser chưa được chủ dự án chốt cố định**, quản trị viên phải nhập số tiền VND cho từng đơn (1, 3, 6, 12 tháng). Giá 499.000 VND từng được thảo luận cho sản phẩm LHM Ads AI **không tự áp sang LHM Ads Browser**. Gói Pro/Business chưa mở bán.
- Xác nhận chuyển khoản **thủ công**: phải kiểm tra tiền vào tài khoản ngân hàng thực rồi mới bấm xác nhận và nhập mã giao dịch sao kê (mã không trùng).
- Khi đơn đã thanh toán, nút **Cấp key** ký token Ed25519 tương thích với EXE, ghi đăng ký vào D1 theo transaction. Trước khi thanh toán, yêu cầu cấp key bị chặn.
- Key đã ký được **mã hóa AES-256-GCM** trong D1 bằng Secret riêng, có thể chỉ người quản trị xem lại. Không lưu token thuần văn bản.
- Gia hạn cho key đã cấp từ chính web này, còn hợp lệ và khớp email người mua ban đầu; bảo toàn mã license và installation ID; token cũ sẽ không qua xác minh D1 sau khi cấp key mới.
- Chưa có thanh toán qua cổng, webhook ngân hàng hay tự động gửi email/Zalo. Web không tự nhận tiền và không tự cấp key khi người mua tải ảnh chuyển khoản.

### Cần cấu hình trên Cloudflare trước khi chạy thật

1. Triển khai Worker ở `serverless/license-worker/` và Custom Domain `browser.lhmcrm.com` theo `DEPLOY_BROWSER_LHMCRM.md`.
2. Chạy **đủ cả 2 migration**: `0001_licenses.sql` và `0002_billing_portal.sql`:

   `npx wrangler d1 migrations apply lhm-license-db --remote`

3. Giữ các Secret ban đầu: `LHM_ISSUER_PRIVATE_PKCS8_B64`, `LHM_ISSUER_PUBLIC_SPKI_B64` và `LHM_LICENSE_ADMIN_TOKEN`.
4. Tạo **một** khóa ngẫu nhiên 32 byte cho `LHM_ORDER_TOKEN_ENC_KEY_B64` từ máy quản trị, ví dụ với Node.js:

   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

   Cất dự phòng an toàn cho Secret này; **đổi/mất khóa thì các token đã mã hóa không đọc lại được**. Đặt bằng `npx wrangler secret put LHM_ORDER_TOKEN_ENC_KEY_B64` hoặc qua Cloudflare Dashboard → Worker → Secrets. Không gửi khóa trong chat hay commit GitHub.
5. Bật MFA/Cloudflare Access cho trang quản trị; Cloudflare WAF/rate limit cho `/v1/admin/*` và `/v1/verify`, backup D1. Giới hạn Worker không phụ thuộc vào quota Node local trước đây.
6. Đăng nhập web → Tạo đơn → Xem thông tin thanh toán từ tài khoản ngân hàng riêng của chủ dự án → khi đã kiểm tra sao kê thực thì nhập mã giao dịch → Cấp key → copy riêng cho khách.
7. Test key thật ở máy Windows độc lập, đối chiếu public key trong EXE, thử restart/offline/renew/revoke và signed online update trước Gate 3/4.

**Chú ý:** Đây là phiên bản *manual payment acceptance*, không phải cổng thanh toán online tự động. Khi anh chọn payOS/SePay/VNPAY hay ngân hàng cụ thể và kết nối tài khoản merchant, mới có thể thêm webhook có xác minh chữ ký, idempotent settlement và phát hành tự động sau khi tiền đã được xác thực.

### API nội bộ

- `GET /`: giao diện quản trị.
- `GET /admin.js`: mã JavaScript tĩnh, không chứa secret.
- `GET /v1/admin/portal/summary`: thống kê/danh sách.
- `POST /v1/admin/portal/create`: tạo đơn chờ thanh toán.
- `POST /v1/admin/portal/confirm-payment`: kế toán xác nhận giao dịch đã thấy trong sao kê.
- `POST /v1/admin/portal/issue`: cấp key / gia hạn đã thanh toán (idempotent).
- `POST /v1/admin/portal/token`: lấy lại key đã mã hóa (chỉ admin).
- `POST /v1/admin/revocation`: thu hồi / khôi phục khi được phép.
- `POST /v1/verify`: app Windows xác minh biên nhận đã ký, **không** đăng nhập admin.

Cả 5 API quản trị Portal yêu cầu Bearer admin secret, no-store, không cấp CORS và kiểm Origin cho các POST từ browser. Chưa tích hợp vai trò đa quản trị, audit trail đa tác nhân hoặc kết nối ngân hàng.
