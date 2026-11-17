# Kiểm tra proxy trước khi mở hồ sơ

Chromium và Firefox kiểm tra proxy HTTP hoặc SOCKS5 được cấu hình trước khi
tạo tiến trình trình duyệt. Với proxy có mật khẩu, phép thử dùng thông tin trong
kho cục bộ. Phép thử yêu cầu proxy kết nối tới `example.com:443`; proxy nhìn
thấy yêu cầu này. Proxy có chính sách chặn đích đó cũng sẽ khiến hồ sơ bị chặn.

Proxy từ chối, hết thời gian chờ, sai xác thực hoặc cấu hình thay đổi trong lúc
kiểm tra sẽ chặn mở với `PROXY_UNAVAILABLE`. Không tự đổi hồ sơ sang direct.
Phép thử chỉ xác nhận proxy chấp nhận kết nối tại thời điểm đó; không bảo đảm
kết nối tiếp tục hoạt động sau khi mở hoặc xác nhận các đường truyền khác.
Camoufox vẫn theo các chính sách chặn và nghiệm thu riêng hiện có.
