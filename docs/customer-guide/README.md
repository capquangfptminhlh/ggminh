# Sổ tay người dùng — LHM Ads Browser

Bộ tài liệu này hướng dẫn sử dụng LHM Ads Browser theo đúng những gì
phần mềm thực sự làm được ở phiên bản hiện tại. Mọi mô tả trong đây đều
đối chiếu được với giao diện và mã nguồn của bản phát hành đi kèm.

**Phiên bản tài liệu:** viết cho LHM Ads Browser **5.8.0 (Preview)** trên
Windows. Bản Preview nghĩa là: các khối lõi đã qua kiểm thử tự động và
đo cục bộ, nhưng chưa qua nghiệm thu trên máy Windows thật theo chuỗi
cổng của dự án — xem thêm trang
[Những gì sản phẩm KHÔNG hứa](07-nhung-gi-san-pham-khong-hua.md) để
biết rõ giới hạn hiện tại trước khi đưa vào vận hành quan trọng.

## Mục lục

1. [Cài đặt và kích hoạt](01-cai-dat-va-kich-hoat.md) — cài trên
   Windows, dùng thử, nhập license, chọn nguồn engine và cài Camoufox
   đã xác minh.
2. [Tạo hồ sơ đầu tiên và gán proxy](02-tao-ho-so-va-proxy.md) — ba
   tab của form tạo hồ sơ, chọn engine, chế độ thông số trình duyệt,
   kho Proxy Center và kiểm tra kết nối proxy.
3. [Hiểu các cảnh báo](03-hieu-cac-canh-bao.md) — cảnh báo IP, cảnh
   báo hành vi, Health Drift và kiểm tra cấu hình: mỗi loại quan sát
   thấy gì, giới hạn của nó là gì, và bạn nên làm gì tiếp theo.
4. [Bảng kiểm tiêu chí của một hồ sơ](04-bang-kiem-tieu-chi.md) — cách
   đọc ĐẠT / KHÔNG ĐẠT / CHƯA ĐO và vì sao không có kết luận gộp.
5. [Sao lưu, khôi phục và xóa dữ liệu](05-sao-luu-khoi-phuc-va-xoa-du-lieu.md) —
   sao lưu cấu hình đã mã hóa, snapshot phiên, thùng rác hồ sơ, gỡ cài
   đặt và xóa toàn bộ dữ liệu.
6. [FAQ xử lý sự cố](06-faq-su-co.md) — các lỗi có thật trong phần
   mềm: hiện tượng, nguyên nhân ở mức kiểm chứng được, cách xử lý.
7. [Những gì sản phẩm KHÔNG hứa](07-nhung-gi-san-pham-khong-hua.md) —
   các giới hạn nói thẳng: điều phần mềm không đo, không kiểm soát và
   không bảo đảm.

8. [Local API an toàn](08-local-api-an-toan.md) — bật API theo phiên,
   dùng khóa xác thực trên loopback, kết nối Chromium CDP và xử lý lỗi
   401/403/409 mà không lộ thông tin đăng nhập.

## Quy ước trong tài liệu này

- Trạng thái của một tiêu chí chỉ có ba giá trị: **ĐẠT** (phép thử đã
  chạy và đáp ứng điều kiện), **KHÔNG ĐẠT** (phép thử đã chạy và phát
  hiện vi phạm), **CHƯA ĐO** (chưa có bằng chứng đủ để kết luận).
  CHƯA ĐO không phải là đạt, cũng không phải là lỗi — nó là "chưa
  biết", và tài liệu này ghi đúng như vậy ở mọi nơi áp dụng.
- Cảnh báo trong ứng dụng chỉ mô tả điều ứng dụng **quan sát được**
  (ví dụ: "Hai hồ sơ có cùng IP thoát tại thời điểm đo"). Cảnh báo
  không kết luận nền tảng quảng cáo đã liên kết các hồ sơ hay sẽ xử
  lý tài khoản của bạn ra sao.
- Dữ liệu của bạn nằm trên máy của bạn (local-first): hồ sơ, phiên
  đăng nhập và nhật ký quan sát đều lưu trong thư mục dữ liệu của ứng
  dụng trên máy Windows của bạn, không đồng bộ lên cloud của LHM.
