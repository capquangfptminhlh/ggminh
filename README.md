> **Cập nhật 1.1:** dự án là trình quản lý nhiều hồ sơ trình duyệt dành cho những tài khoản được phép quản trị, không phải công cụ bảo đảm vượt phát hiện hay né đình chỉ Google Ads. Không thể cam kết tương thích 100% AdsPower.

# LHM Ads Browser — Local-first Windows Browser Manager

Phần mềm quản lý đa hồ sơ trình duyệt (Multi-profile Browser) chạy 100% cục bộ (Local-First), không giới hạn số lượng profile, miễn phí vĩnh viễn và không phụ thuộc vào bất kỳ máy chủ đám mây nào.

---

## Tính năng và giới hạn

| Tính năng | AdsPower truyền thống | **PowerBrowser** |
| :--- | :--- | :--- |
| **Giới hạn Profile** | 2-5 profile (Bản Free) / Trả phí đắt | **Không giới hạn (Vĩnh viễn)** |
| **Lưu trữ dữ liệu** | Đẩy lên Cloud AdsPower | **100% Cục bộ trên máy bạn** |
| **Bảo vệ vân tay** | Cloud-based | **Manifest V3 + MAIN World Injection** |
| **Kháng phát hiện** | Dễ bị quét qua CDP | **Loại bỏ hoàn toàn cờ Automation** |
| **RPA API** | Cần Token / Rate limit | **Port 50325 chuẩn (Plug & Play)** |
| **Chi phí** | Hàng tháng / năm | **0đ - Hoàn toàn miễn phí** |

---

## 🛠️ Cấu trúc dự án

- `main.js`: Tiến trình Electron chính, quản lý IPC và chạy nền Local REST API.
- `preload.js`: Cầu nối contextBridge bảo mật giữa Renderer và hệ thống.
- `src/engine/fingerprint.js`: Bộ sinh vân tay thực tế (WebGL, Canvas noise, AudioContext, Cores, RAM, Màn hình, UserAgent).
- `src/engine/extensionGenerator.js`: Sinh extension tàng hình động (chạy ở `world: MAIN` trước khi website tải).
- `src/engine/browserLauncher.js`: Khởi chạy Chromium/Chrome độc lập với `--user-data-dir` riêng biệt, gán proxy và mở cổng CDP.
- `src/api/server.js`: API tương thích 100% với các script tự động hóa viết cho AdsPower (Port 50325).
- `src/ui/`: Giao diện người dùng Dark Mode trực quan, quản lý danh sách profile, test proxy và lấy code RPA.

---

## 🏁 Hướng dẫn khởi động

1. **Cách 1 (Nhanh nhất):**
   - Click đúp vào file `run.bat` trong thư mục này.

2. **Cách 2 (Bằng dòng lệnh):**
   ```bash
   cd D:\power-browser
   npm start
   ```

---

## 🤖 Kết nối Tự động hóa RPA (Python Playwright)

Bạn có thể dùng lại toàn bộ script viết cho AdsPower mà không cần đổi logic:

```python
import requests
from playwright.sync_api import sync_playwright

PROFILE_ID = "pb_main01"
API_URL = f"http://127.0.0.1:50325/api/v1/browser/start?user_id={PROFILE_ID}"

# 1. Mở profile và lấy WebSocket CDP
res = requests.get(API_URL).json()
ws_endpoint = res["data"]["ws"]["puppeteer"]

# 2. Điều khiển trình duyệt
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(ws_endpoint)
    page = browser.contexts[0].pages[0] if browser.contexts[0].pages else browser.new_page()
    page.goto("https://browserleaks.com/canvas")
    print("Page Title:", page.title())
```


## Bản cài đặt Windows
- Vào **GitHub → Actions → Build Windows EXE**. Mỗi lần cập nhật nhánh main sẽ chạy kiểm thử và dựng installer.
- Tải artifact **LHM-Ads-Browser-Windows-x64** khi workflow thành công và giải nén để lấy file Setup.exe.
- Có thể dựng tại máy Windows bằng `npm ci` rồi `npm run build:win`.
- Chạy bản nguồn bằng `npm ci` và `npm start`. Cần Chrome hoặc Edge cài đặt sẵn.

## Quyền riêng tư và API
- Hồ sơ được lưu trong thư mục dữ liệu ứng dụng của Windows, không lưu trong thư mục cài đặt.
- Khi mới cài, Local API **tắt mặc định**; chỉ chạy trên `127.0.0.1` nếu bật bằng nút API của ứng dụng.
- Mỗi phiên chạy có API Key ngẫu nhiên. Chọn **Sao chép API Key**, sau đó gửi header `X-API-Key: <key>` hoặc `Authorization: Bearer <key>`.
- API không cung cấp CORS và từ chối request có header Origin. Cổng DevTools chỉ mở khi bật chế độ API.
- Khi bật API, mọi ứng dụng trên chính máy tính có API Key đều có thể thao tác; hãy bảo vệ key và khóa máy tính.
- Proxy có username/password **chưa hỗ trợ** trong bản này. Kiểm tra proxy hiện chỉ kiểm tra TCP, **chưa** xác minh IP thoát.
- Các mẫu gọi API ở phần đầu README là lịch sử; cần thêm header xác thực như mô tả trên.
- Các module thay đổi fingerprint chưa được kiểm định về hiệu quả hay tính tương thích với Google; không sử dụng để vượt chính sách nền tảng.

## Kế hoạch tiếp theo
Đưa vào danh sách công việc: quản lý proxy có xác thực bảo mật, backup/export dữ liệu, kiểm thử E2E trên Windows, quản lý tài khoản Google Ads hợp lệ thông qua OAuth/MCC, và dashboard web với phân quyền.
