# LHM Performance Evidence Lab — đánh giá bằng số liệu thật

**Triết lý:** không tuyên bố số 1 thế giới khi chưa có benchmark đối chứng
với AdsPower trên cùng thiết bị, cùng số lượng hồ sơ và cùng tác vụ.

## Có thể dùng ngay trong ứng dụng
Vào **Công cụ → Performance Lab → Chạy kiểm thử cục bộ**.

LHM đo trực tiếp trên metadata hồ sơ **có sẵn** của thiết bị hiện tại:
- Đọc danh sách và làm sạch trường proxy nhạy cảm (`getProfiles`)
- Tra cứu tối đa 100 hồ sơ (`getProfile`)
- Dựng bảng thống kê dashboard (`buildDashboardSummary`)

Mỗi phép đo có warmup 3 lượt và mặc định **15 mẫu thật**. Hiển thị
P50/median, P95, Min, Max theo millisecond cùng số lượng hồ sơ và RAM
RSS tiến trình **chính** lúc đo. Đây không phải RAM của trình duyệt con.

**Không đo trong bước này:** thời gian mở Chrome/Camoufox thật, số cửa sổ
đồng thời, FPS, RAM từng cửa sổ, mạng, cookie/session, DNS/WebRTC,
hiệu năng Google Ads/Meta hay khả năng né hệ thống chống gian lận.

Báo cáo JSON chỉ có số tổng hợp, phiên bản Node, nền tảng và
thời gian; **không** xuất tên hồ sơ, tên khách, địa chỉ IP, URL, ID
hồ sơ, notes, cookie, tài khoản, token, password, fingerprint.
Người dùng phải bấm **Xuất báo cáo JSON** và chọn nơi lưu rõ ràng.

## Benchmark 100–500–1.000 profile trên Windows CI

Trước mỗi build Windows, workflow `.github/workflows/windows-exe.yml`
chạy một benchmark **SYNTHETIC**:
`node tools/profile-scale-benchmark.js --sizes 100,500,1000 --iterations 12 --output benchmarks/synthetic-profile-scale.json`

- Tạo dữ liệu giả độc lập trong thư mục tạm, không chứa account/secret.
- Đo cold load metadata từ ổ đĩa, tốc độ liệt kê, tra cứu,
  dựng số liệu dashboard; đọc dung lượng JSON và RSS tiến trình.
- Không vượt license bằng cách tạo profile thực hay đăng nhập.
  Không mở trình duyệt, không dùng proxy, không truy cập mạng.
- Xóa dữ liệu giả khi xong, lưu artifact
  `LHM-Metadata-Performance-Windows` lên GitHub Actions 30 ngày.
- Không đặt ngưỡng tốc độ tùy ý để biến CI xanh thành tuyên bố
  thắng đối thủ. Kiểm thử fail nếu kết quả lỗi/không hợp lệ.

Có workflow chạy thủ công `.github/workflows/profile-performance-evidence.yml`
cho phép điều chỉnh số profile (1–5 mốc, mỗi mốc 1–5.000) và
số mẫu (5–30) trên Windows.

## Quy trình benchmark công bằng với đối thủ (chưa thực hiện)

1. Chọn một máy Windows chuẩn, cùng hệ điều hành và engine cập nhật.
2. Đối chiếu tạo 100/500/1.000 profile, mở 1/5/10 cửa sổ thực,
   đo P50/P95 thời gian đến tab sẵn sàng, CPU/RAM đỉnh,
   crash/recovery và hành vi đóng cửa sổ.
3. Chạy mỗi tổ hợp tối thiểu nhiều vòng có warmup và cold-start;
   đối chiếu cùng tình trạng mạng, cùng extension, giống cấu hình
   tính năng giữa sản phẩm.
4. Báo rõ số phép đo, sai số, bản build, nguồn dữ liệu,
   điểm nào không thể đo, và publish kết quả không chọn lọc.

**Chưa có** kết quả đối chứng AdsPower. Không thể suy ra LHM nhanh
hơn hoặc số 1 từ benchmark metadata này. Điều kiện Gate 3/4
và nghiệm thu thương mại theo Hiến pháp LHM vẫn áp dụng.

## Bảo toàn LHM
Performance Lab là phần thêm mới độc lập, không can thiệp
profile engine, Signal Chain, GraphDefense, Proxy Vault, AI Advisor,
Ads Launch Guard, Campaign QA, Automation Studio, license hoặc session.
`test/performance-lab.js` cùng contract preserved features chạy ở Windows CI.
