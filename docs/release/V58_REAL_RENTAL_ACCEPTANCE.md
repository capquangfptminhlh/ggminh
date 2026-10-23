# Gate thuê thực tế — v5.8 RC (không phải kết quả nghiệm thu)

**Trạng thái: NOT_RUN trên máy khách + dịch vụ HTTPS production.**
Đây là checklist nghiệm thu, không chứa khóa/token/khách hàng thật. Đợt hợp nhất chọn lọc chỉ xử lý cấp và gia hạn theo đúng số ngày; **không** triển khai server cho khách nếu chưa có địa chỉ HTTPS và khóa production do chủ dự án quản lý.

## Chuẩn bị bên bán (chỉ môi trường vận hành được ủy quyền)

- Đóng băng SHA ứng dụng/installer; lưu SHA-256 EXE đã tải từ đúng Windows CI.
- Server có TLS hợp lệ, truy cập Internet được từ một máy khách Windows độc lập; endpoint xác minh chỉ xuất hiện qua **HTTPS** bên ngoài, tiến trình authority vẫn bind `127.0.0.1` phía máy bán và được reverse proxy TLS bảo vệ.
- Public key Ed25519 license **khớp key trong EXE**, issuer private key mã hóa ở ngoài repo, ledger và registry lưu riêng, có backup và phân quyền OS. Không đăng private key/passphrase, license token, payment details hay installation ID thật trong GitHub.
- Chọn đúng chế độ **owner-sweep** (hết hạn không tự khóa nếu server offline, phải nhận biên nhận thu hồi có chữ ký) hoặc **strict** (khóa vận hành đúng kỳ hạn). Không được nói owner-sweep tự khóa chính xác từng phút.
- Tạo **khách thử tự nguyện** và một máy Windows sạch riêng; chỉ ghi bằng chứng đã che thông tin nhận diện.

## Bài thử bắt buộc (ghi PASS / FAIL / NOT_RUN + video/screenshot + thời điểm)

1. Cài đúng EXE/hash. Lấy mã cài đặt từ màn hình License. Thêm khách bằng `node tools/license-admin.js add <LEDGER_ABSOLUTE> "<KHACH_THU>" <INSTALLATION_ID>` ở máy bán. Ghi ID nội bộ vào hồ sơ riêng, không đưa lên PR.
2. Cấp **30 × 24 giờ** bằng `node tools/license-admin.js issue <LEDGER_ABSOLUTE> <CUSTOMER_ID> pro --days 30 100 <ISSUER_PEM_ABSOLUTE> owner-sweep` (hoặc `strict` theo chính sách đã ký). So sánh `expiresAt - issuedAt = 2,592,000,000 ms`, cả trường hợp qua tháng 2 năm nhuận. Đảm bảo file ledger KHÔNG lưu token.
3. Trên máy Windows khác, kết nối `LHM_LICENSE_VERIFY_URL` HTTPS. Kích hoạt token trên màn hình License, xác nhận nhận biên nhận hợp lệ từ server, khởi động lại app và xác nhận quyền vẫn đúng. Thử sai installation ID, giả chữ ký và URL HTTP phải bị từ chối; không bỏ khóa/kết nối để vượt lỗi.
4. Gia hạn sớm sau 10 ngày bằng `node tools/license-admin.js renew <LEDGER_ABSOLUTE> <OLD_LICENSE_ID> --days 30 <ISSUER_PEM_ABSOLUTE>`. Hạn mới cộng từ hạn còn lại, giữ package/quyền và mã cài đặt. Kích hoạt token mới và kiểm tra persistence sau restart.
5. Thu hồi bằng `node tools/license-admin.js revoke <LEDGER_ABSOLUTE> <REGISTRY_ABSOLUTE> <LICENSE_ID>`; máy khách lấy lại biên nhận `revoked`, chặn thao tác vận hành mới nhưng **không xóa dữ liệu**. Kiểm tra `allow` sau đó cho trạng thái hợp lệ, có đủ sự kiện audit và registry đồng bộ.
6. Dùng đồng hồ giả lập ở môi trường kiểm thử được kiểm soát để chứng minh strict expiry và owner-sweep offline/online semantics; không chỉnh giờ máy khách đang kinh doanh. Xác nhận hết hạn vẫn đọc và xuất sao lưu được, nhưng không được cấp quyền ngoài gói.
7. Tắt máy chủ thử, khởi động lại, xác minh ledger/registry bền vững và backup phục hồi. Thực hiện sweep đúng lịch; kiểm tra sự cố không dẫn tới xóa license hay đổi chủ tài khoản.
8. Ghi kết quả trong kho nội bộ: app SHA, EXE SHA-256, Windows build, URL HTTPS **đã che**, tên tester/ngày giờ, đoạn video/ảnh đã ẩn token, hash tệp chứng cứ. **Chỉ khi đủ tám bước mới đánh dấu thuê thực tế PASS** ở Issue #47.

## Kiểm thử tự động hỗ trợ, nhưng không thay thế thử thực tế

`node test/license-admin.js` kiểm ledger, ký/renew, exact-day, biên nhận và revoke qua server loopback. `node test/license-center.js` kiểm issuer trực tiếp với khóa Ed25519 tổng hợp, các khoảng ngày và input xấu. `node test/license-online.js`, `node test/license-owner-sweep.js`, `node test/license-policy-integration.js` kiểm chính sách còn lại.

**Kết luận của bản PR:** hợp nhất mã và kiểm thử tự động **không** chứng nhận dịch vụ HTTPS production hay hoàn tất bước thuê thật của Gate 3.
