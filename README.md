# ⚡ PowerBrowser - NextGen Antidetect & Multi-Profile OS

Phần mềm quản lý đa hồ sơ trình duyệt (Multi-profile Browser) chạy 100% cục bộ (Local-First), không giới hạn số lượng profile, miễn phí vĩnh viễn và không phụ thuộc vào bất kỳ máy chủ đám mây nào.

---

## 🚀 Tính năng vượt trội so với AdsPower

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
