# Đối chiếu bốn lớp vận hành — không phải thuật toán Google/Meta

## Phạm vi

Hộp thoại Profile có mục **Rà soát tính nhất quán & tuân thủ** với 4 nhóm khai báo và 4 điểm mù cần bằng chứng. Đây là self-audit hỗ trợ các tài khoản quảng cáo **được ủy quyền hợp lệ**, không tạo hồ sơ qua mặt xác minh, không giả thao tác người thật, không tạo/nuôi cookie để vượt xét duyệt.

**KHÔNG** áp dụng công thức tỷ trọng 40/30/20/10, không gọi đó là Google Risk Engine hoặc Meta Integrity score. Thuật toán riêng và tham số chấm điểm nội bộ của nền tảng không được cung cấp cho LHM.

## Trạng thái
- **ĐÃ KHAI BÁO**: mới có lựa chọn trong form hoặc bộ danh tính đã lưu, **không phải PASS đo**.
- **CẦN RÀ SOÁT**: cấu hình thử nghiệm có thể làm sai lệch các tín hiệu thiết bị.
- **CHƯA ĐO**: chưa có báo cáo đo thật của cùng hồ sơ/engine/tuyến mạng.
- **KIỂM TRA THỦ CÔNG**: thông tin thuộc doanh nghiệp/tài sản/quyền truy cập, trình duyệt không thể xác minh.

## Mười điểm vận hành quan trọng

1. Kết nối Direct/Proxy chỉ là khai báo; không suy ra fail-closed, DNS, WebRTC, IPv6 từ một ô nhập.
2. Điều kiện fail-closed phải được kiểm thử khi proxy hỏng với phiên được cho phép.
3. Hồ sơ dùng vùng lưu dữ liệu riêng; nghiệm thu phải chứng minh cách ly cookie, LocalStorage, IndexedDB và CacheStorage.
4. Native dùng thuộc tính trình duyệt thực; legacy JS noise có cảnh báo vì không chứng minh nhất quán.
5. Danh tính Camoufox sinh bằng cơ chế chính thức được ghim sau kiểm chứng, không thay ngầm khi sửa ghi chú.
6. Bảo vệ bí mật khách hàng, quyền quản trị quảng cáo, xác minh doanh nghiệp và phương thức thanh toán hợp lệ.
7. MCC của Google Ads dùng **hợp lệ** để quản lý nhiều tài khoản của các doanh nghiệp thật; dùng chung MCC không tự thân chứng minh hành vi vi phạm.
8. Trang đích cần kiểm duyệt nội dung và tính minh bạch, không suy luận cùng IP hosting hoặc trùng CSS nghĩa là gian lận.
9. Tự động hóa phải được phép, kiểm soát tốc độ để tránh gây lỗi dịch vụ, có audit trail và quyền dừng; không cố bắt chước người thật để né hệ thống.
10. Rủi ro nền tảng chỉ nền tảng mới biết và quyết định; bảng LHM không là phép bảo đảm tài khoản sẽ không bị liên kết hoặc khóa.

## Bằng chứng phải có trước khi kết luận

Mọi phép đo phải mang commit SHA, hash binary, engine/version, hồ sơ, thời điểm, môi trường, hướng dẫn tái hiện, trạng thái PASS/FAIL/NOT_RUN và giới hạn. Dữ liệu doanh nghiệp/thanh toán phải có sự xác nhận của chủ tài khoản, không thu số thẻ hay OTP vào LHM.

## Chính sách tham khảo

- Google Ads Circumventing Systems: https://support.google.com/adspolicy/answer/15938075
- Google Ads Manager Accounts (MCC): https://support.google.com/google-ads/answer/9050919

Theo Hiến pháp `TIEU-CHI-SAN-PHAM.md`, bản Preview chưa ký production, Gate 2 cấu hình Camoufox, Gate 3 và Gate 4 phải được nghiệm thu độc lập; không suy ra PASS từ form cấu hình.
