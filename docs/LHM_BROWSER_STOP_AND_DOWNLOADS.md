# LHM — Tắt hồ sơ an toàn và thư mục tải về riêng từng hồ sơ

## Vấn đề đã sửa

1. **Tắt hồ sơ làm mất cookie (khách bị đăng xuất).** `BrowserLauncher.stop()` gọi `proc.kill()`, trên Windows là TerminateProcess, rồi SIGKILL sau 1,2 giây. Chromium chưa kịp ghi cookie xuống đĩa: cookie ghi gần đây (thường là phiên đăng nhập vừa tạo) mất sau khi mở lại. localStorage/IndexedDB vẫn còn nên lỗi khó nhận ra.
2. **Edge: app mất dấu trình duyệt, để lại tiến trình chạy ngầm.** Trên Windows, `msedge.exe` tự khởi động lại thành tiến trình mới; tiến trình app spawn thoát ngay. App coi hồ sơ đã đóng trong khi Edge vẫn chạy (đo được 15 tiến trình còn sót mỗi hồ sơ), mở lại hồ sơ thì lỗi. Edge được dùng khi máy khách không có Chrome.
3. **Mọi hồ sơ tải file vào chung thư mục Downloads của Windows.** File tải ở hồ sơ A hiện trong hộp thoại tải lên/mở file của hồ sơ B.

## Cơ chế mới

- `src/engine/processStopper.js`: Windows gửi `taskkill /PID <pid>` (không `/T`, không `/F`) → WM_CLOSE → trình duyệt đóng theo đường tắt bình thường và ghi dữ liệu. Sau 10 giây nếu chưa thoát (hộp thoại "Rời trang?", không có cửa sổ) mới `taskkill /T /F` cả cây. Không dùng `/T` ở bước êm: nó gửi tín hiệu cho tiến trình GPU/network khiến Chrome kẹt với cửa sổ vẫn mở. POSIX: SIGTERM, SIGKILL sau thời gian chờ. Lệnh hệ điều hành chỉ chạy với `ChildProcess` do app spawn.
- Edge được khởi động với `--edge-skip-compat-layer-relaunch` để tiến trình app spawn chính là trình duyệt thật.
- `src/engine/downloadDirectory.js`: mỗi hồ sơ tải vào `<downloadsRoot>/<profileId>`. Ứng dụng dùng `Downloads\LHM Ads Browser\<profileId>` của người dùng; mặc định (CLI/test) là `<storage>/downloads/<profileId>`.
  - Chromium: đặt `download.default_directory` và `savefile.default_directory` trong `Default/Preferences` nếu chưa có, hoặc nếu đang trỏ vào thư mục của hồ sơ khác trong cùng gốc (hồ sơ sao chép/khôi phục). Thư mục người dùng tự chọn ở nơi khác được giữ. Preferences hỏng được sao lưu thành `Preferences.lhm-unreadable`, không xóa im lặng.
  - Firefox/Camoufox: khối `LHM_MANAGED_DOWNLOADS` riêng trong `user.js`, cùng tồn tại với khối proxy và các tùy chọn của người dùng.
  - Xóa vĩnh viễn hồ sơ **không** xóa file trong thư mục tải về: đó là file của khách.

## Bằng chứng

- Unit/mock: `node test/browser-stop-downloads.js` (không chạy lệnh hệ điều hành thật).
- Trình duyệt thật, Windows 11, Chrome 156 và Edge 156, có cửa sổ, chạy qua chính `BrowserLauncher`: ghi cookie → `stop()` → mở lại → cookie còn; 0 tiến trình sót sau khi tắt (0,5–1 giây); file tải về nằm trong thư mục của hồ sơ, không có trong Downloads chung.
- Đối chứng trên code cũ (cùng máy): cookie mất sau khi tắt; Edge để lại 15 tiến trình mỗi hồ sơ.

## Giới hạn

- Camoufox native đã tắt êm từ trước (`CloseMainWindow`); thay đổi ở đây chỉ thêm thư mục tải về. `CamoufoxPlaywrightController` (thử nghiệm, bị khóa) chưa được đổi: Playwright tự quản lý file tải về.
- Chưa nghiệm thu bằng bản EXE đóng gói (Gate 3) và chưa chạy với Firefox cài đặt sẵn.
- Proxy gateway nội bộ không xác thực là vấn đề riêng, chưa sửa ở đây.
