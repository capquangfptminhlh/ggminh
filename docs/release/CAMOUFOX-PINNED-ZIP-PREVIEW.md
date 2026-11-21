# Camoufox: ghi chú bản thử nhập ZIP

Bản thử nhận một tệp ZIP Camoufox 156.0.1-beta.36 đã được ghim cụ thể. Ứng dụng kiểm tra SHA-256 của ZIP và từng tệp theo manifest tích hợp trước khi cài. Việc so khớp hash kiểm tra tính toàn vẹn so với giá trị đã ghim, không xác thực danh tính publisher: gói này không có chữ ký publisher. Người dùng phải có ZIP tương ứng; chưa có cơ chế tải tự động.

Engine cài vào `engines-pinned/camoufox`, tách khỏi thư mục engine cũ. Nếu đích đã tồn tại, ứng dụng không ghi đè. Hồ sơ Camoufox dùng proxy vẫn bị chặn; không coi đây là hỗ trợ proxy.

## Dữ liệu localStorage khi bị dừng đột ngột

Bản vá engine giảm thời gian chờ flush mặc định từ 5.000 ms xuống 100 ms; ứng dụng đặt pref thành 0 cho đúng engine đã ghim. Việc ghi vẫn bất đồng bộ. Ép dừng tiến trình hoặc mất điện có thể làm mất dữ liệu vừa ghi, kể cả khi một số thử nghiệm kill đã đạt. Không có bảo đảm bản ghi đã được lưu bền chỉ vì lệnh ghi localStorage đã trả về. Nên đóng trình duyệt bình thường trước khi tắt máy và sao lưu dữ liệu quan trọng.

Đây là ghi chú cho bản thử; việc nhập ZIP và bộ cài cần được nghiệm thu thực tế trước khi phát hành rộng rãi. Không có khẳng định các hồ sơ sẽ không bị nền tảng nhận diện hay liên kết.
