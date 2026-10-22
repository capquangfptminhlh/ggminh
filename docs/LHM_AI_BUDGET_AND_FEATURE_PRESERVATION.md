# LHM AI Budget Center — bổ sung, không thay thế

## Thêm gì?

Tại **AI Advisor → Giới hạn yêu cầu AI mỗi tháng**, người dùng có thể đặt mức
từ **0 đến 1.000 lần gọi/tháng** (0 = không áp dụng giới hạn).
Chỉ khi bấm **Áp dụng hạn mức** thì mức mới thay đổi.

- Hạn mức được kiểm tra trong **main process** trước khi gửi yêu cầu OpenRouter.
- Số lần gọi được **đặt chỗ trước khi gửi**: lỗi mạng hoặc dừng gọi vẫn có
  thể bị nhà cung cấp tính tiền, nên vẫn tính vào số lần đã sử dụng.
- Khi qua tháng mới theo **tháng lịch của máy**, số lần sử dụng được đặt về 0;
  mức giới hạn giữ nguyên.
- Ghi nhận số token do OpenRouter trả về để tham khảo. Nếu thiếu số liệu
  thì hiển thị lượt chưa báo cáo; không giả định chính xác giá tiền.
- Chỉ lưu tháng, giới hạn và các bộ đếm số nguyên trong
  `ai-usage-budget.json` trên thiết bị, **không lưu câu hỏi, trả lời, cookies,
  API key, tên khách hoặc hồ sơ**. API key vẫn do `AIAdvisor` mã hóa bằng OS.
- Nếu sổ dữ liệu bị hỏng, desktop vẫn mở bình thường nhưng AI Advisor dừng
  gọi mới và báo lỗi, tránh mất giới hạn. Cần khôi phục dữ liệu hợp lệ.
- Khi xóa OpenRouter API key, sổ hạn mức vẫn được giữ để việc đổi API key
  không làm số đếm quay lại 0.

## Các giới hạn cần công bố

Đây là **hạn mức số yêu cầu cục bộ**, không phải hạn mức USD, token tuyệt đối
hay giới hạn tài khoản OpenRouter trên các thiết bị khác. Yêu cầu có thể phát sinh
phí ở phía nhà cung cấp ngay cả khi không trả lời thành công. Một lời gọi AI có
thể tiêu thụ nhiều token, nên quản trị viên vẫn cần giám sát ngân sách tại
OpenRouter.

Tính năng không cấp quyền tự động chạy quảng cáo. AI Advisor vẫn chỉ tư vấn
và đề xuất bản nháp RPA, có phê duyệt theo quy trình LHM.

## Bảo vệ tính năng độc quyền LHM

`docs/lhm-preserved-features.json` liệt kê các module LHM cần duy trì:
Engine Factory/Camoufox, Native Inspector, Signal Chain, GraphDefense,
IP observations, Proxy Credential Vault, snapshots, Control Tower, RPA có
phê duyệt, AI Advisor/draft, licensing và Local API. Ngoài ra, manifest cũng
ghi nhận chức năng nhập JSON và mẫu RPA mới.

`node test/lhm-feature-preservation.js` kiểm tra sự tồn tại của module,
IPC, UI và các bài regression bắt buộc. Nếu một thành phần bị xóa hay test
bị gỡ khỏi chuỗi CI, bài kiểm tra không đạt. Đây là **smoke guard chống xóa
vô ý**, không thay thế kiểm thử runtime, nghiệm thu bảo mật hoặc Gate 3/4.

## Kiểm thử

- `node test/ai-usage-budget.js`: hạn mức, restart, rollover, chặn trước
  API, không lưu dữ liệu bí mật, phát hiện sổ lỗi và wiring giao diện.
- `node test/lhm-feature-preservation.js`: chống mất module LHM.
- `npm test`: chạy các bài mới cùng toàn bộ test cũ.

Đây là module **additive**; giữ bản quyền phát hành v5.8.0 ở trạng thái
Preview cho đến khi vượt các bước nghiệm thu thương mại độc lập.
