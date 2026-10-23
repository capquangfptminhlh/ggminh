# LHM commercial preview — GitHub build, UI & evidence handoff

Ngày kiểm thử mục tiêu: 2026-10-23. Phạm vi thay đổi: **UI / CI / hồ sơ chứng cứ**; không thay engine, proxy, fingerprint, license hay automation.

## Những gì GitHub Actions phải thực thi

Workflow `.github/workflows/windows-exe.yml` trên **Windows thật của GitHub**:

1. `npm ci`, `npm test` — bao gồm bảo toàn 23 nhóm tính năng LHM, license, proxy, privacy, Ads QA và các regression.
2. Synthetic metadata benchmark 100/500/1.000 profile; xuất artifact đo thời gian không bao gồm browser startup.
3. Smoke mở Chrome/Edge thực và đóng tab trong runner.
4. Build NSIS Windows x64 từ commit đang chạy; không bắt buộc Authenticode theo Hiến pháp v1.4.
5. Chụp và xác nhận **8 màn hình Electron thật ở nguồn và bản EXE đã đóng gói**:
   workspace, mở rộng, command palette, engine provider,
   Ads Launch Guard (có kiểm thử URL mẫu),
   Performance Lab (có phép đo metadata thực),
   About + cập nhật online, Giấy phép và gia hạn (mã cài đặt bị che trong ảnh).
6. Kiểm tra màu nền tối/sáng và trạng thái dialog của các công cụ quảng cáo, đo hiệu năng, cập nhật.
   Không có ảnh giả, HTML render thay thế, hay số liệu marketing được dựng sẵn.
7. Tạo artifact `LHM-Release-Evidence-Windows` chứa SHA-256 của EXE đúng commit, version,
   workflow run ID, danh sách 8 bằng chứng ảnh và trạng thái **chỉ CI, chưa phát hành**.
8. Upload EXE và ảnh dạng GitHub Actions artifacts, dùng để QA trước phát hành.

## Đường lên draft release, không công bố ngầm

Workflow `.github/workflows/prepare-draft-release.yml` do chủ sở hữu bấm thủ công,
nhập **run id Windows thành công trên đúng commit main** và version từ package.json.

Workflow tải đúng EXE và `release-evidence.json` của **cùng run id**; đối chiếu commit,
phiên bản, tên file, SHA-256 và số màn hình bằng chứng. Chỉ sau khi khớp mới tạo
**GitHub Release DRAFT**, kèm EXE, SHA256SUMS.txt và chứng cứ. Không tự publish.

## Các bước GitHub không thể thay thế

- **Gate 3**: cài EXE trên máy Windows của chủ dự án / người dùng độc lập, kiểm tra
  nâng cấp phiên cũ, khôi phục dữ liệu, license, Camoufox engine đã được xác minh,
  proxy/DNS/WebRTC và quyền truy cập theo đúng kịch bản thật. Thu và ký nhận kết quả.
- **Gate 4**: chủ sở hữu xác nhận và cho công bố. EXE có thể **không ký Authenticode**
  nhưng phải nói rõ nguy cơ Windows SmartScreen cảnh báo; không né bảo vệ hệ điều hành.
- Cấu hình nhà phát hành, khóa công khai Ed25519 độc lập cho engine/update,
  máy chủ license thật, thanh toán/gia hạn/hoàn tiền và bảo mật vận hành cần được nghiệm thu.
- Tốc độ metadata không phải bằng chứng thắng AdsPower về 100/1.000 cửa sổ browser thật,
  đồng bộ nhóm, độ ổn định và hỗ trợ khách hàng; không tuyên bố số 1 thế giới khi chưa có
  benchmark độc lập.

## Phạm vi UI

- Thống nhất 4 hộp thoại quản trị bằng light theme của LHM, dễ đọc, có focus rõ,
  responsive và hỗ trợ `prefers-reduced-motion`.
- Thêm nút tắt **Kiểm tra quảng cáo** ở ngay màn hình profile, vẫn giữ công cụ
  trong menu **Công cụ → Ads Launch Guard**.
- Không ghi mới cookie, URL của khách, mật khẩu hay token. Ảnh license trên CI
  che mã cài đặt trước khi upload.

Không đổi phạm vi chức năng cũ, không tắt Gate 3/4, không tự thay đổi kế hoạch thuê tháng.
