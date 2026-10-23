# Tích hợp lại trên main — 23/10/2026

## Phạm vi đã được chủ dự án chấp thuận

Đối chiếu và tích hợp phần còn thiếu trên nền main mới; giữ tính năng đã có,
không đẩy nguyên nhánh cũ để thay thế main. Không tự merge main, tag hay phát hành.
Áp dụng Hiến pháp v1.4: Authenticode của installer là tùy chọn; xác minh engine,
chữ ký manifest/cập nhật và các cổng nghiệm thu vẫn giữ nguyên.

## Nguồn tích hợp cố định cho lượt này

- main: `e66769043fc1af33c0f84db02dedfc3a0c7f2a27` (bao gồm PR #25–#44).
- PR #23: `cd7d6b95ecc74a255de8098751b163b67c842388`, gồm nền PR #21.
- PR #24: `19564b581fac84a9c036e28b67ff523be9254fd7`.
- Nhánh cục bộ: `08edd42` cùng thay đổi chưa commit về cảnh báo, xóa dữ liệu
  giám sát, cấu hình endpoint đo IP và thông tin nguồn bản build.
- PR #22 không gộp nguyên nhánh: giao diện trùng PR #23 trên nền cũ.

## Thứ tự thực hiện

1. Bảo toàn và kiểm thử phần đang gộp dở PR #23. Sửa seam test dùng đúng
   giao diện BehaviorMonitor, không hạ điều kiện kiểm thử.
2. Gộp main đã ghim, giữ đủ tính năng và chuỗi test mới; đối chiếu các file
   dùng chung (main, preload, renderer, index, package, workflow).
3. Gộp PR #24. Phân biệt nguồn build, bằng chứng artifact CI và công cụ xét
   điều kiện phát hành; nối dữ liệu giữa chúng thay vì dựng cổng thứ hai.
4. Kiểm thử hồi quy, rà soát độc lập, kiểm tra đóng gói theo điều kiện máy.
5. Đẩy nhánh tích hợp và mở Draft PR; ghi chính xác commit, lệnh, kết quả,
   những phép thử CHƯA ĐO. Không dùng CI của commit cũ thay cho lượt này.

## Ranh giới bằng chứng

Kiểm thử bằng dữ liệu tổng hợp không thay nghiệm thu EXE đã cài. Chưa có
lab proxy/DNS/STUN được cấp phép và chưa có khóa publisher production do
chủ dự án cung cấp. Không sinh hoặc công bố bí mật, không chuyển các hạng mục
đó thành ĐẠT. Công cụ phát hành chỉ hỗ trợ rà soát, không tự cấp quyền phát hành.
