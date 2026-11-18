# Khóa và cách ly hồ sơ Chromium, Firefox trên Windows

**ĐANG NGHIỆM THU — CHƯA PHÁT HÀNH.** Launcher tạo trình duyệt ở trạng thái tạm dừng, gắn vào Windows Job Object rồi mới cho chạy. Một bộ giám sát độc lập giữ job khi ứng dụng dừng bất thường; khóa hồ sơ chỉ được phục hồi sau khi có bằng chứng đúng token rằng job đã trống. Nếu không kiểm chứng được, khóa được giữ lại. Giao dịch SQLite bảo vệ các thao tác ghi và được hệ điều hành giải phóng khi tiến trình giữ giao dịch bị dừng.

Các phép thử dùng hồ sơ tạm và trang loopback trên máy Windows này:

- Chromium và Firefox thật: chặn hai tiến trình mở cùng một hồ sơ; đóng và mở lại; dừng cưỡng bức ứng dụng khi trình duyệt còn chạy, giữ khóa và phục hồi sau khi trình duyệt đóng.
- Cách ly dữ liệu A/B, chạy đồng thời, khởi động lại và sao lưu/khôi phục cấu hình: đã có lần chạy đạt trên cả hai engine. Chromium gặp lỗi CacheStorage ở hai lượt với đường dẫn dài; đường dẫn ngắn đã đạt. Chưa xác định nguyên nhân duy nhất.
- Proxy HTTP có xác thực trên loopback: hai trình duyệt đi qua gateway thử nghiệm. Đây không phải phép đo rò rỉ mạng ngoài.
- Bản Electron đóng gói trước đó đã qua kiểm tra khởi chạy và phục hồi crash; mỗi bản mới cần được kiểm tra lại. Chưa nghiệm thu cài đặt trên máy khách, mất điện, mọi hệ thống tập tin hay các tiến trình nằm ngoài job.

Khóa chỉ điều phối các thao tác trong ứng dụng sử dụng cơ chế này; chương trình ngoài không bắt buộc tuân theo. Các guard cũ không rõ chủ sở hữu tiếp tục được giữ lại để tránh mở khóa nhầm. Không coi các phép thử trên là bảo đảm cách ly tuyệt đối hoặc chứng nhận trình duyệt không bị nhận diện.
