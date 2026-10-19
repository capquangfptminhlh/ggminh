# LHM Browser — roadmap độc lập Chromium

## Hiện có (v1.3)
- LHM Ads Browser là ứng dụng Windows Electron quản lý hồ sơ, chưa phải một browser engine mới.
- Giao diện có chọn **Chromium** hoặc **Gecko**. Gecko được chạy từ Firefox cài sẵn / binary tùy chọn,
  với thư mục dữ liệu hồ sơ riêng biệt và không dùng extension Chromium.
- Gecko chỉ hỗ trợ sử dụng thủ công; Chrome CDP/RPA không chạy trên Gecko. Nếu có proxy ngoài,
  phần mềm thông báo chưa hỗ trợ cấu hình proxy Gecko thay vì giả vờ đã cấu hình.
- Bản phát hành Windows installer hiện đóng gói manager, **không** đóng gói Firefox hay Gecko.

## Tạo browser độc lập thương hiệu LHM thật sự
1. Fork Mozilla Firefox/Gecko từ nguồn chính thức, tuân thủ MPL 2.0 và giấy phép của thành phần.
2. Thiết kế thương hiệu LHM, dấu hiệu nhận diện, bản quyền và kênh cập nhật độc lập;
   không dùng Firefox/Mozilla trademarks làm tên hoặc logo của bản tùy biến.
3. Build trên Windows theo https://firefox-source-docs.mozilla.org/setup/windows_build.html.
   Máy build cần tối thiểu ~40GB trống; cần đội ngũ duy trì bản vá bảo mật.
4. Thiết lập CI xây dựng, ký mã, installer, cập nhật an toàn, kiểm thử website.
5. Trỏ đường dẫn Gecko executable trong phần mềm LHM tới bản Gecko được build đã kiểm thử,
   rồi tích hợp module quản lý cập nhật/chứng nhận bản build.
6. Chỉ tự động hóa công việc được phép, có phê duyệt với thay đổi chiến dịch/budget
   và lấy dữ liệu chính thức bằng OAuth/MCC/Google Ads API nơi phù hợp.

## Giới hạn
- Không có trình duyệt bảo đảm vô danh hoặc không bị Google nhận diện, liên kết tài khoản.
- Đây không phải công cụ né đình chỉ Google Ads.
- Không thu thập mật khẩu hay sao chép phiên giữa các hồ sơ; giữ browser storage ở máy người dùng.
