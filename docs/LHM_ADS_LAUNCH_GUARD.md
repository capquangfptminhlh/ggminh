# LHM Ads Launch Guard — Landing URL & UTM QA

## Mục tiêu

Đưa LHM gần hơn với công việc của người chạy quảng cáo bằng **kiểm tra link đích
và cấu hình theo dõi trước khi phát hành**, thay vì chỉ quản lý profile.

**Vị trí:** menu `Công cụ → Ads Launch Guard`.

- Kiểm tra 1–20 URL quảng cáo, mỗi dòng một URL. Phân loại **CẦN SỬA**,
  **CẦN XEM**, **CHỈ PASS CẤU HÌNH**.
- Phát hiện URL sai định dạng, giao thức không hỗ trợ, URL chứa username/password,
  địa chỉ nội bộ/localhost, HTTP chưa mã hóa, tham số tracking trùng,
  UTM đang dùng nhưng thiếu ba khóa cốt lõi, giá trị UTM trống.
- Chặn và giải thích tên tham số hoặc giá trị trông giống email, khóa truy cập,
  mã phiên. Báo cáo trả về **chỉ origin**, không chứa path, query, fragment,
  password, email hoặc token; giao diện dùng `textContent` thay vì HTML.
- Không coi thiếu UTM là lỗi mặc định vì quảng cáo có thể dùng auto-tagging.
- Bộ tạo UTM **theo yêu cầu rõ ràng**: `utm_source`, `utm_medium`,
  `utm_campaign` và tùy chọn `utm_content`, `utm_term`. Chỉ thay
  các trường `utm_*`, giữ tham số ngoài UTM. Không tự thay đổi link trong
  tài khoản quảng cáo hoặc bất kỳ profile nào.

## Giới hạn chứng cứ

Đây là kiểm tra cấu hình **offline**: không mở website, không gửi request
đến máy chủ/Google/Meta, không xác minh khả năng truy cập, mã HTTP, redirect,
landing page hợp lệ, Pixel, GA4, GTM, event chuyển đổi hoặc phê duyệt
chính sách quảng cáo. Không khẳng định tracking đã hoạt động.

URL đầu vào và URL kết quả chỉ tồn tại trong hộp thoại của phiên desktop;
không ghi vào database, file log, cookie hoặc hồ sơ. Khi cần sử dụng URL
đã tạo, người dùng tự chọn và Ctrl+C. Không gọi API bên ngoài và không
chuyển token từ trình duyệt.

## Tích hợp bảo toàn LHM

Chỉ bổ sung ba file lõi/giao diện và IPC read-only / kết quả UTM, không thay
engine, Signal Chain, Launch Readiness, Proxy Vault, GraphDefense, AI Advisor,
Automation Studio hay license.

`node test/ads-launch-guard.js` bảo vệ kiểm thử địa chỉ nhạy cảm, báo cáo
không lộ URL, UTM, giới hạn nhập, UI IPC. Chạy cùng
`test/lhm-feature-preservation.js` trong `npm test` / Windows CI.

**Trạng thái:** module tích hợp preview; không tự tuyên bố đủ điều kiện
phát hành thương mại hoặc bảo đảm hiệu quả quảng cáo.
