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

## Thử proxy cục bộ trên mạng hiện tại — 18/11/2026

Đã chạy `node tools/check-own-network-proxy.js` trên Windows với mã nguồn
commit `7deb2b6`, Chrome `157.0.8103.79` và Firefox `160.0.1`. Công cụ tạo
proxy HTTP tạm chỉ nghe `127.0.0.1` và chỉ cho phép kết nối tới origin thử
loopback hoặc `example.com:443`; proxy được đóng sau thử nghiệm. Client thử
đã kết nối HTTPS tới `example.com` qua proxy, xác minh chứng chỉ và nhận HTTP
200. Website đích có thể quan sát IP công cộng của mạng đang dùng; proxy này
không cấp IP riêng và không phải dịch vụ proxy cho khách.

Trên trang HTTP loopback qua proxy, cả hai trình duyệt nhận nội dung và gửi
thêm yêu cầu qua proxy. Sau khi proxy bị ngắt, bộ đếm trong cửa sổ xác nhận
Chrome tiếp tục thử 9 lần và Firefox thử 8 lần sau thời điểm proxy đã tắt;
origin thử ghi nhận 0 yêu cầu trực tiếp sau ngắt. Hai trình duyệt đóng mã 0;
Firefox có hộp thoại ngôn ngữ, được trả lời trên hồ sơ giả lập. Báo cáo loại
bỏ IP, mật khẩu và dữ liệu khách hàng, lưu cục bộ ngoài repo cùng hash mã và
engine.

Thư mục thử mặc định nằm trong thư mục tạm của hệ điều hành. Có thể chọn ổ
khác bằng biến `LHM_PROXY_TEST_ROOT` trỏ tới một thư mục tuyệt đối đã tồn tại;
công cụ tạo thư mục thử mới bên trong và chỉ dọn dữ liệu thử của chính nó.
Chỉ chạy khi chủ mạng đồng ý kết nối tới `example.com`.

Đây là phép thử **HTTP không xác thực đến origin loopback trong một lượt ngắn**;
kết nối HTTPS ra ngoài được kiểm tra bằng client thử, không phải bằng trình
duyệt. Chưa đo trong phép này: SOCKS5 thật, proxy có xác thực, DNS, WebRTC,
IPv6, kết nối sau tái lập proxy, bản cài hay Camoufox. Không suy rộng kết quả
thành bảo đảm fail-closed cho mọi giao thức hoặc mọi thời điểm.
