# Profile Table Paging — local-first fleet UX (v5.8 Preview)

## Mục tiêu và phạm vi

Danh sách hồ sơ dùng **phân trang thật ở tầng renderer**, không phải cắt bớt dữ liệu trong kho hay API. Mục tiêu là giảm số hàng DOM mà Electron phải tạo mỗi lần người dùng tìm kiếm hoặc đồng bộ trạng thái trình duyệt. Không có tuyên bố FPS, độ trễ, hay hiệu quả cạnh tranh với sản phẩm khác nếu chưa đo trên cùng máy.

- Mặc định **50 hồ sơ/trang**; có lựa chọn **25 / 50 / 100**. Mọi phép lọc theo từ khóa, nhóm, tag, engine, mạng và trạng thái chạy áp dụng trên toàn bộ metadata đã tải trước khi phân trang.
- Chuyển trang không mở/dừng trình duyệt, không gọi network mới, không sửa cấu hình. Xóa hồ sơ hoặc thu hẹp tập lọc sẽ kẹp trang trong giới hạn mới; thay đổi tìm kiếm/bộ lọc đặt về trang 1.
- Hộp **chọn tất cả** ở đầu bảng chỉ chọn các dòng **đang hiển thị trên trang hiện tại**. Chọn qua nhiều trang vẫn lưu theo ID cho đến khi người dùng tự bỏ chọn/đổi trạng thái lựa chọn. Các nút thao tác hàng loạt ở thanh chọn dùng tập ID này, giữ nguyên giới hạn/confirm đã có.
- Khi không có hồ sơ, thông báo tạo hồ sơ hoặc không khớp bộ lọc vẫn hiển thị đúng; thanh phân trang ẩn. Trang số/thống kê hiển thị số lượng hồ sơ thay vì tên/IP/ghi chú nhạy cảm.
- Bảng cột/tùy chỉnh mật độ, tìm kiếm từ command palette và nút thao tác trên từng hàng tiếp tục hoạt động.

## Kỹ thuật

- `src/ui/profilePagination.js`: pure CommonJS/browser module, `paginate(filtered, page, size)`. Không I/O, không ghi localStorage/credential và không đụng dữ liệu browser.
- `src/ui/renderer.js`: giữ `allProfiles` ở trong bộ nhớ như trước; dựng chỉ `pageInfo.items` (tối đa 100). Mọi hoạt động trạng thái/profile và giới hạn batch cũ vẫn đi theo đường bảo vệ hiện có.
- `src/ui/index.html`, `src/ui/workspace.css`: thanh điều hướng có label, trạng thái `aria-live`, prev/next disabled theo giới hạn, responsive và hỗ trợ giảm chuyển động.
- `test/profile-pagination.js`: kiểm thử 1.000/10.000 metadata, từng page size, ranh giới trang, lọc trước khi phân trang, selected IDs qua trang và hợp đồng nối UI.

## Quy trình QA máy Windows thật

1. Tạo/nhập hồ sơ metadata thử nghiệm (không gồm cookie, mật khẩu, token) với tối thiểu 125 hồ sơ. Xác nhận trang 1 có đúng 50 dòng, trang 2 có 50, trang 3 có 25; đổi size 25/100 và quan sát số trang.
2. Chọn 2 dòng trang 1, 1 dòng trang 2; chọn tất cả trang 2. Trở lại trang 1 xác nhận lựa chọn không mất và **không tự thêm** các ID ở trang 3. Không chạy thao tác hàng loạt trong bước QA này.
3. Nhập từ khóa chỉ khớp hồ sơ cuối danh sách, xác nhận tìm thấy dù hồ sơ nằm ở trang 3. Thay đổi các bộ lọc, xác nhận reset trang 1; xóa bộ lọc và quay lại toàn danh sách.
4. Dùng Command Palette định vị ID ở trang khác; xác nhận tự lọc và hiển thị hàng đúng. Đổi tùy chỉnh cột/compact; confirm vẫn áp dụng sau next/prev.
5. Dừng/xóa một hồ sơ thử trên trang cuối; xác nhận clamp trang và header select-all. Mở/đóng browser thử nghiệm chỉ sau khi đã phê duyệt kiểm tra và chính sách proxy.
6. Dùng Tab/Enter/Shift+Tab với Prev/Next và select; kích cỡ cửa sổ nhỏ; chế độ Windows Reduce Motion.

**Bằng chứng:** lưu phiên bản, commit SHA, EXE SHA-256, môi trường Windows và kết quả PASS/FAIL của từng bước. CI Node/Electron chỉ chứng minh các trường hợp tự động nó thực sự chạy; không thay Gate 3 độc lập, Gate 4 của chủ dự án, hoặc benchmark hiệu năng GUI thực tế.
