# LHM Campaign QA Dossier — Báo cáo bàn giao chạy quảng cáo

## Mục đích
Bổ sung bước **bàn giao kiểm tra chất lượng chiến dịch** vào Ads Launch Guard
(`Công cụ → Ads Launch Guard → 03 / Báo cáo kiểm tra chiến dịch`).
Dùng để phân biệt những lỗi URL/UTM đã kiểm tra bằng thuật toán với những mục
mà người phụ trách phải kiểm tra thực tế trước khi phát hành.

## 7 mục xác nhận thủ công
- Landing page chạy được trên máy/thiết bị thật
- Thử sự kiện chuyển đổi có chứng cứ thực tế
- GA4/GTM/Meta Pixel (nếu có)
- UTM hoặc auto-tagging và nguồn truy cập đo lường
- Quyền tài khoản quảng cáo
- Ngân sách, lịch và giá thầu
- Nội dung quảng cáo, landing page và chính sách nền tảng

Mỗi mục mặc định **Chưa kiểm tra**. Người dùng có thể chọn **Tôi đã tự xác nhận**,
**Cần xử lý** hoặc **Không áp dụng**. Trạng thái xác nhận là lời khai
của người dùng, không phải phép đo của phần mềm. Nếu URL có lỗi hoặc
người dùng đánh dấu Cần xử lý, kết quả phải là `NEEDS_CORRECTION`.
Nếu còn URL warning/mục Chưa kiểm tra, hoặc không có bất kỳ mục nào
được người dùng xác nhận, kết quả là `REQUIRES_REVIEW`.
`LOCAL_QA_RECORDED` chỉ là tên trạng thái lưu chứng cứ cục bộ, không
phải phê duyệt quảng cáo hay chứng minh chiến dịch đã thành công.

## Quyền riêng tư & tính toàn vẹn
- Không gọi Google, Meta, GA4 hay trang đích. Không được tuyên bố
  mạng, pixel, tracking thực tế đã được kiểm chứng.
- Báo cáo chỉ chứa **origin** của URL (ví dụ `https://example.com`),
  mã lỗi, nội dung phát hiện **tĩnh**, trạng thái thủ công và mốc thời gian.
  Không chứa path/query/fragment, email, password, cookies hay tokens.
- Chỉ lưu JSON sau khi người dùng bấm lưu và chọn địa điểm qua
  `dialog.showSaveDialog`. Không tự đăng tải, không gửi server.
- `integrity.bodySha256` giúp so sánh file báo cáo với nội dung
  trước khi đóng gói. Đây là **checksum**, không phải chữ ký số,
  bằng chứng độc lập hoặc bảo đảm chống chỉnh sửa bởi bên thứ ba.
- UI dùng DOM `textContent`, tránh chèn HTML từ đầu vào người dùng.

## Bảo toàn LHM
Đây là module cộng thêm, không xóa hay thay thế Ads Launch Guard,
Launch Readiness, Signal Chain, Proxy Vault, GraphDefense, AI Advisor,
RPA, license hay phần quản lý profile. Bài kiểm tra
`node test/ads-qa-report.js` chạy trong `npm test` cùng bài
`test/lhm-feature-preservation.js` trước Windows EXE build.

## Chưa thể gọi là phát hành thương mại đủ chứng cứ
QA tự khai không thay kiểm thử thực tế trên máy khách, đối chiếu
conversion bằng API được cấp quyền, nghiệm thu license, các kiểm tra
Windows độc lập và duyệt phát hành theo Hiến pháp LHM.
