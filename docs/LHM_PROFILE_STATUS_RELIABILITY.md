# LHM Profile Status Reliability — Windows QA v5.8 Preview

## Vấn đề đã sửa

Phiên bản trước dùng `setInterval(async ...)` mỗi 2 giây để đọc danh sách browser đang mở, không giới hạn số IPC chưa hoàn tất, không xử lý lỗi và không đánh dấu phản hồi đã cũ. Khi IPC chậm, lỗi tạm thời hoặc người dùng bấm Làm mới trong lúc đang lấy trạng thái, giao diện có thể ghi đè kết quả mới bằng kết quả cũ và phát sinh lỗi promise.

## Cơ chế mới

- Một tác vụ đọc trạng thái đang chờ tại một thời điểm (single-flight); các lần poll cùng thời điểm nhận cùng một kết quả.
- Bộ đếm generation tăng ngay trước mỗi lần tải mới đầy đủ. Kết quả poll phát ra trước lần tải mới sẽ bị đánh dấu stale và không ghi đè danh sách browser.
- `loadProfiles()` lấy cả thông tin hồ sơ và trạng thái browser thành một bản chụp; nếu một IPC lỗi thì giữ danh sách hiện có, không xóa lựa chọn và hiển thị trạng thái cần kiểm tra. Những lần làm mới cũ không ghi đè kết quả của lần mới.
- Kiểm chứng shape danh sách IPC, từ chối ID rỗng/ID lặp; chỉ dựng lại DOM nếu tập ID đang mở thực sự thay đổi. Đổi thứ tự server trả về mà không đổi ID không phát động render.
- Cảnh báo "Mất kết nối trạng thái · Làm mới để thử lại" không đồng nghĩa browser đã dừng hay proxy không còn an toàn. Khi đồng bộ thành công, tín hiệu trở về "Trạng thái đã đồng bộ". Không ghi URL, IP, token hoặc cookie lên thanh trạng thái.
- Không tự động mở lại trình duyệt, không thay đổi license, cấu hình proxy, snapshot, automation, cookie hoặc chính sách nền tảng.

## Phép thử tự động

`node test/profile-status-poller.js` kiểm tra: single-flight, poll trùng nhau, invalidation khi làm mới thủ công, lỗi IPC và hồi phục, phản hồi malformed/duplicate, thứ tự khác nhau, stop idempotent, nguồn script UI và trạng thái lỗi. `npm test` chạy cùng bộ Windows CI hiện hành.

## Nghiệm thu Windows độc lập (Gate 3)

1. Chạy ứng dụng có hai hồ sơ thử, mở một hồ sơ sau kiểm tra; xác nhận đếm "Đang mở" được cập nhật mà không cần F5.
2. Thử ngắt IPC trong môi trường debug có giám sát rồi phục hồi: hiện cảnh báo, giữ danh sách lựa chọn, không thông báo nhầm browser đã tắt. Dùng "Làm mới" để xác nhận hồi phục.
3. Thực hiện tải lại thủ công cùng lúc với việc thay đổi trạng thái hồ sơ; không được thấy phản hồi cũ ghi đè kết quả mới.
4. Kiểm tra trên bảng 1.000 metadata hồ sơ mẫu, 50/trang, với nhiều lần mở/đóng thử. Không gọi benchmark chạy 1.000 browser đồng thời.
5. Lưu ảnh, thời gian, hash EXE, commit, Windows version, engine version và kết quả từng bước. **CI Windows và kiểm thử unit không thay thế Gate 3 hoặc phê duyệt Gate 4.**

## Giới hạn

Cơ chế không đặt timeout hoặc gửi lại liên tục khi IPC treo; nếu một lần đọc không kết thúc, không có vòng lặp tạo thêm hàng loạt lời gọi. Người dùng vẫn có thể bấm làm mới để kiểm tra thủ công; sự cố IPC kéo dài cần phân tích quá trình chính, không được bị che giấu bằng màu xanh.
