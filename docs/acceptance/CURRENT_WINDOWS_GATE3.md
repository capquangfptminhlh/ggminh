# Gate 3 hiện hành — nghiệm thu Windows bằng đúng file EXE đang kiểm tra

**Không dùng lại hash hoặc commit của những bản Wave 2 / Wave R cũ.**
Các biên bản trước đó vẫn là lịch sử nhưng không chứng minh bản mới đạt.
Gate 3 là kiểm thử trên **Windows được cài bộ EXE thật**, không phải chỉ
chạy unit test hoặc chụp màn hình trong GitHub Actions.

## Bước 1. Lấy artifact mới nhất đúng `main`

1. Mở workflow [Build Windows EXE](https://github.com/capquangfptminhlh/ggminh/actions/workflows/windows-exe.yml).
2. Chọn run `SUCCESS` trên nhánh `main` tại đúng commit phát hành.
3. Tải `LHM-Ads-Browser-Windows-x64`, giải nén. Chép lại **SHA-256 EXE**
   từ `LHM-Release-Evidence-Windows/release-evidence.json` của *cùng run*.
4. Không dùng SHA của ZIP thay cho SHA của EXE. Không lấy file từ PR khác.

## Bước 2. Kiểm tra trên máy Windows độc lập trước khi cài

Mở PowerShell (không cần tắt Defender hay SmartScreen) trong thư mục dự án
đã tải mã nguồn cùng commit. Thay giá trị `<...>` bằng dữ liệu thật.

```powershell
.\tools\collect-windows-gate3.ps1 `
  -Installer "C:\Downloads\LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe" `
  -ExpectedSha256 "<64_ky_tu_sha256_tu_release_evidence>" `
  -BuildCommit "<40_ky_tu_commit_tu_cung_ci>" `
  -WindowsRunId "<run_id_tren_main>" `
  -OutputDirectory "C:\LHM-Acceptance"
```

Công cụ này không cài phần mềm, không gọi mạng, không đọc dữ liệu hồ sơ.
Nếu EXE có tên sai hoặc mã SHA-256 khác: **dừng, không cài đặt**.
Báo cáo JSON giữ mã build, tên/kích thước/hash, phiên bản Windows ở
mức chung, tình trạng Authenticode (tham khảo) và các mục cần nghiệm thu.
Không chứa token, cookie, Installation ID, proxy hoặc đường dẫn tuyệt đối.

Lưu ý: commit/run ID người thử nhập **chưa được công cụ xác thực qua GitHub**;
phải tự đối chiếu với trang CI. `PASS_LOCAL_HASH_MATCH` chỉ là kiểm tra
toàn vẹn so với SHA đã nhập, **không** phải xác nhận đã đạt Gate 3.

## Bước 3. Nghiệm thu thủ công sau khi cài

Thực hiện theo `docs/acceptance/gate-3-wave2.md` với **artifact mới**
và bảng kết quả mới, không kế thừa PASS của bản cũ. Ghi PASS/FAIL/NOT_RUN
và ảnh/video đã che dữ liệu riêng cho từng bước:

- Cài đặt và quét Defender; ghi nhận cảnh báo Unknown Publisher vì chủ dự
  án quyết định **không mua Authenticode**. Không hướng dẫn tắt bảo vệ.
- Mở Chrome/Edge, đóng tab, tạo/đóng/mở lại hai profile thử độc lập.
- Kiểm thử Camoufox chỉ khi bản engine được phê duyệt và cài hợp lệ;
  Preview không đóng gói upstream Camoufox.
- Kiểm thử proxy HTTP và SOCKS5 thực được phép, DNS/WebRTC, fail-closed.
- Kích hoạt, gia hạn, thu hồi license qua máy chủ HTTPS production
  với dữ liệu thử đã được ủy quyền. Không tự đánh dấu đã nhận tiền.
- Sao lưu/khôi phục, xóa hồ sơ, gỡ cài đặt, kiểm tra không tồn dư.

**Gate 3 chỉ đạt khi các bước bắt buộc có bằng chứng PASS.**
`NOT_RUN` và `FAIL` không được chuyển thành PASS từ CI.
Đây là bản *đánh giá cục bộ*; không thay thế quyết định phát hành Gate 4,
quyền phân phối Camoufox hay cấu hình Cloudflare production.

## Tiến độ kỹ thuật gần nhất (24/10/2026)

- PR #63 đã merge vào `main`: Camoufox Windows upstream CI trên
  GitHub, hai báo cáo Stage-0 thực với cách ly cookie/localStorage/
  IndexedDB/CacheStorage, identity replay, cleanup và nguồn kiểm chứng.
- **Không** suy ra rằng bản cài Windows cho khách đã chứa Camoufox.
- Authenticode EXE **không bắt buộc**; mã SHA-256, nguồn tải chính thức,
  xác thực manifest update/engine và license vẫn là các kiểm tra khác nhau.
