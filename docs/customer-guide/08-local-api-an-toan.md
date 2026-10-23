# Local API an toàn — LHM Ads Browser 5.8.0 (Preview)

Hướng dẫn này áp dụng cho **API cục bộ trên chính máy Windows đang chạy LHM**. Đây không phải dịch vụ đám mây, không phải API Google Ads, cũng không phải cách kết nối từ máy chủ bên ngoài tới tài khoản của khách.

## 1. Chuẩn bị trước khi kết nối

1. Cài bản Preview từ nguồn đáng tin cậy, mở LHM và kích hoạt license có quyền **API** (bản dùng thử còn hiệu lực cũng có thể có quyền).
2. Dùng hồ sơ **Chromium (Chrome/Edge)** đã tạo trong LHM. Gecko Firefox không trả WebSocket CDP; Camoufox chỉ có điều khiển Playwright nội bộ trong trường hợp được bật, không có Chromium CDP.
3. Bật công tắc **Local API** trong ứng dụng. Local API mặc định **tắt** và chỉ được truy cập trên `http://127.0.0.1:50325` của máy hiện tại.
4. Chọn **Sao chép API Key**, đặt biến môi trường `LHM_API_KEY` chỉ trong terminal riêng. Ví dụ PowerShell: `$env:LHM_API_KEY = Read-Host "Nhap API Key"` (không chụp ảnh, không đưa giá trị vào Git/chat).
5. Cài hai thư viện trong môi trường Python của bạn: `python -m pip install requests playwright`. Trình duyệt chạy bằng Chrome/Edge hiện có trong LHM; mẫu dưới đây không tự cài hoặc giả lập Camoufox.

## 2. Ví dụ Python có xác thực và xử lý lỗi

```python
import os
import requests
from playwright.sync_api import sync_playwright

api_key = os.environ.get("LHM_API_KEY")
if not api_key:
    raise RuntimeError("Chưa có LHM_API_KEY trong môi trường")
response = requests.get(
    "http://127.0.0.1:50325/api/v1/browser/start",
    params={"user_id": "ID_PROFILE_CHROMIUM"},
    headers={"X-API-Key": api_key},
    timeout=20,
)
response.raise_for_status()
payload = response.json()
if payload.get("code") != 0:
    raise RuntimeError(payload.get("msg", "Không thể khởi động profile"))
ws = ((payload.get("data") or {}).get("ws") or {}).get("puppeteer")
if not ws:
    raise RuntimeError("API không trả CDP cho engine này")

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(ws)
    print("Số context:", len(browser.contexts))
    browser.close()
```

**Lưu ý:** đóng kết nối Playwright hoặc dừng profile chỉ khi bạn chủ động muốn kết thúc phiên làm việc. Không đăng nhập, nhấp trang thanh toán hoặc thực hiện chiến dịch quảng cáo tự động trái chính sách thông qua ví dụ này.

## 3. Các lỗi phổ biến

| Hiện tượng | Nguyên nhân có thể | Cách kiểm tra |
|---|---|---|
| Không kết nối được cổng 50325 | Local API đang tắt hoặc phần mềm chưa mở | Mở LHM và bật API; không tự mở dịch vụ ra Internet |
| HTTP 401 | Chưa gửi API Key hoặc key của phiên cũ | Sao chép key mới; header `X-API-Key` hoặc `Authorization: Bearer` |
| HTTP 403 | License không có quyền API, `Origin` bị chặn hoặc host không phải loopback | Kiểm tra gói license, gọi từ terminal cục bộ thay vì JavaScript trong trang web |
| HTTP 409 | Hồ sơ Gecko thủ công hoặc Camoufox không có đường điều khiển đã xác minh | Dùng hồ sơ Chromium cho mẫu CDP; không ép Firefox qua CDP |
| Không có `ws.puppeteer` | Engine không có attachable Chromium CDP | Kiểm tra trường `data.engine` / `data.protocol`, không tự suy đoán endpoint |
| Proxy có kết nối nhưng cảnh báo DNS/WebRTC | Chỉ một phần quan sát mạng được đo | Đọc từng tiêu chí ĐẠT/KHÔNG ĐẠT/CHƯA ĐO; không coi kết nối proxy là chứng nhận ẩn danh |

## 4. Bảo mật dữ liệu khách

- Không gửi API Key, phiên đăng nhập, mật khẩu proxy, cookie hoặc file profile cho người hỗ trợ; nếu đã lộ key, tắt/bật lại API để cấp lại khóa phiên.
- Kho mật khẩu proxy của Proxy Center được bảo vệ riêng; Local API không phải kênh xuất mật khẩu. Hỗ trợ HTTP/SOCKS5 có xác thực phụ thuộc engine/đường chạy và các điều kiện an toàn của nó.
- Máy bị chiếm quyền hoặc có chương trình lạ chạy cùng user vẫn có thể nguy hiểm dù API chỉ bind loopback. Hãy cập nhật Windows, dùng khóa màn hình và chỉ chạy công cụ bạn tin cậy.
- Các tiêu chí về mạng, danh tính và hành vi phải dựa trên kết quả đo và chứng cứ tương ứng. LHM không bảo đảm Google/Meta không phát hiện hay không đình chỉ tài khoản.

Đối chiếu mã nguồn tại `src/api/server.js` và [hướng dẫn tổng quan](../../README.md).
