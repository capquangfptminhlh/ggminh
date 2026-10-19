> **Cập nhật 1.1:** dự án là trình quản lý nhiều hồ sơ trình duyệt dành cho những tài khoản được phép quản trị, không phải công cụ bảo đảm vượt phát hiện hay né đình chỉ Google Ads. Không thể cam kết tương thích 100% AdsPower.

# LHM Ads Browser — Local-first Windows Browser Manager

Phần mềm quản lý đa hồ sơ trình duyệt (Multi-profile Browser) chạy 100% cục bộ (Local-First), không giới hạn số lượng profile, miễn phí vĩnh viễn và không phụ thuộc vào bất kỳ máy chủ đám mây nào.

---

## Tính năng và giới hạn

| Tính năng | AdsPower truyền thống | **PowerBrowser** |
| :--- | :--- | :--- |
| **Giới hạn Profile** | 2-5 profile (Bản Free) / Trả phí đắt | **Không giới hạn (Vĩnh viễn)** |
| **Lưu trữ dữ liệu** | Đẩy lên Cloud AdsPower | **100% Cục bộ trên máy bạn** |
| **Bảo vệ vân tay** | Cloud-based | **Chế độ bản địa + chẩn đoán, mã thử nghiệm cũ chưa xác minh** |
| **Kháng phát hiện** | Dễ bị quét qua CDP | **Không bảo đảm qua mặt bất cứ cơ chế phát hiện nào** |
| **RPA API** | Cần Token / Rate limit | **Port 50325 chuẩn (Plug & Play)** |
| **Chi phí** | Hàng tháng / năm | **0đ - Hoàn toàn miễn phí** |

---

## 🛠️ Cấu trúc dự án

- `main.js`: Tiến trình Electron chính, quản lý IPC và chạy nền Local REST API.
- `preload.js`: Cầu nối contextBridge bảo mật giữa Renderer và hệ thống.
- `src/engine/fingerprint.js`: Bộ tạo cấu hình vân tay thử nghiệm (WebGL, Canvas noise, AudioContext, Cores, RAM, Màn hình, UserAgent).
- `src/engine/extensionGenerator.js`: Sinh extension tùy chỉnh thử nghiệm (không xác nhận chống phát hiện) (chạy ở `world: MAIN` trước khi website tải).
- `src/engine/browserLauncher.js`: Khởi chạy Chromium/Chrome độc lập với `--user-data-dir` riêng biệt, gán proxy và mở cổng CDP.
- `src/api/server.js`: API hỗ trợ một tập con endpoint tương thích cú pháp AdsPower (Port 50325).
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


## Cảnh báo hành vi — phiên bản 1.2
Bấm nút **⚠️ Cảnh báo hành vi** trên thanh công cụ. Ứng dụng theo dõi cục bộ
những thao tác được gửi qua giao diện và Local API: mở, đóng, lưu và xóa hồ sơ.
Màn hình hiển thị nhật ký gần đây và cảnh báo mở lặp nhiều lần, mở/đóng liên tiếp,
cập nhật liên tiếp hoặc lượng yêu cầu mở hàng loạt trong khoảng 10 phút.
Khi xuất hiện cảnh báo mới, có thông báo ngay trên thanh giao diện.

**Giới hạn:** Không theo dõi các nhấp chuột bên trong Chrome, không truy cập dữ liệu
Google Ads và không thể biết Google có phát hiện hay đánh giá hành vi ra sao.
Đây là bộ kiểm tra vận hành tránh thao tác ngoài ý muốn/lặp vô hạn, không phải
cơ chế “né” hoặc đảm bảo tránh khóa tài khoản.

Dữ liệu lưu **chỉ trên máy** trong \`behavior-events.json\`, chỉ chứa loại thao tác,
ID hồ sơ, nguồn thủ công/API và thời điểm; tự giới hạn 24 giờ và tối đa 1.200 sự kiện.
Không thu thập URL, thông tin quảng cáo, cookies hoặc nội dung web.


## v1.3 — Hai browser engine
Trang tạo/sửa hồ sơ cho phép chọn **Chromium** hoặc **Gecko**. Chế độ Gecko sử dụng
Firefox cài trên máy, mỗi hồ sơ có profile độc lập trong \`storage/gecko-profiles/\`.
Gecko chưa được đóng gói hoặc fork thành trình duyệt LHM riêng; đây là nền tảng tích hợp
để chuyển dần sang Gecko engine và hỗ trợ đường dẫn bản Gecko được tự build trong tương lai.
Chế độ Gecko hiện chạy thủ công, không hỗ trợ Chromium CDP/RPA hoặc proxy trong LHM.
Chi tiết xem \`docs/GECKO_BROWSER_PLAN.md\`.

## v1.4 — LHM Automation Studio

Studio chạy trong cửa sổ Electron riêng (sandbox) với phiên lưu độc lập theo profile. Hỗ trợ mở URL, chờ, click CSS, điền form, kiểm tra văn bản, yêu cầu phê duyệt; có nhật ký và dừng khẩn cấp. Chỉ được chạy trên danh sách tên miền được cấu hình, mặc định chặn trang Google Ads, đăng nhập và thanh toán Google trong Studio. Đối với Google Ads, ưu tiên MCC/OAuth và API chính thức. Studio không thể tự động qua mặt bảo vệ bot, và không chia sẻ cookie với Chrome/Gecko đang mở thủ công.


## v1.5 — Profile Health, real proxy IP check, encrypted config backup
- **Health Check:** kiểm tra trình duyệt, URL, proxy, engine và cảnh báo User-Agent; không đánh giá Google Ads có phát hiện người dùng hay không.
- **Proxy diagnostic:** khi bấm "Kiểm tra kết nối Proxy", phần mềm kiểm tra IP công khai thông qua kết nối HTTPS (api.ipify.org) đi xuyên HTTP CONNECT hoặc SOCKS5. Chứng chỉ TLS được xác minh, lỗi mạng sẽ hiển thị lỗi thay vì báo thành công giả. Nếu kết nối trực tiếp hoạt động, có so sánh IP proxy với IP máy.
- **Sao lưu .lhmbak:** AES-256-GCM, mật khẩu từ 12 ký tự; khôi phục bằng cách nhập thêm cấu hình hồ sơ và workflow. Không bao gồm cookie, mật khẩu, phiên Google, bản quyền, hoặc dữ liệu duyệt web.
- **Chưa có:** proxy có user/password, tự động hóa Gecko, trình duyệt Gecko do LHM tự biên dịch, SaaS và Google Ads API/MCC.
- Công cụ kiểm tra IP liên hệ api.ipify.org theo yêu cầu của người dùng; sẽ chia sẻ địa chỉ IP với dịch vụ kiểm tra.


## v1.6 — LHM Control Tower
- **Tổng quan quản trị:** hiển thị số hồ sơ, đang mở, lỗi cấu hình, cảnh báo,
  phân bố theo nhóm, hoạt động gần đây từ nhật ký cục bộ.
- **Chọn nhiều hồ sơ:** chạy Health Check từ dashboard, đóng hàng loạt với xác nhận
  riêng và báo kết quả từng hồ sơ. Không có thao tác mở đồng loạt không giới hạn.
- **Nhân bản mẫu:** sao chép tên/nhóm/URL/cấu hình proxy không mật khẩu, nhưng luôn
  tạo ID mới và phiên trình duyệt trống; không sao chép cookies, mật khẩu hay
  fingerprint giả lập từ hồ sơ nguồn.
- **Báo cáo CSV:** xuất các trường metadata được chọn, Excel UTF-8, chống công thức
  CSV Injection; không xuất cookie, tài khoản đăng nhập hay nội dung website.
- Để tránh thay đổi ngoài ý muốn, việc đóng nhiều hồ sơ cần xác nhận của người dùng.
- Dashboard dựa trên dữ liệu local, **không** thể biết Google đánh giá tài khoản ra sao.


## v1.7 — Automation Recorder (thử nghiệm)
- Trong Automation Studio chọn hồ sơ Chromium, tên miền được phép, và URL
  khởi đầu, sau đó bấm **Ghi thao tác**.
- Cửa sổ Recorder **riêng và tạm thời** sẽ mở: không dùng chung cookie/phiên
  Chrome, Firefox hoặc các hồ sơ Automation Studio khác; không lưu phiên trình duyệt.
- Hỗ trợ ghi chuyển trang cùng tên miền đã duyệt, click nút/link, chọn vị trí
  trường nhập. **Không lưu các giá trị đã gõ**; bước điền biểu mẫu để trống và
  người dùng phải tự điền dữ liệu không nhạy cảm trước khi chạy lại.
- Nút **Dừng ghi** sau đó **Đưa bước vào Studio** để sửa selector và lưu workflow.
  Quy trình có bước yêu cầu phê duyệt trước bất kỳ thao tác click/fill nào.
- Không ghi thao tác trang Google Ads, đăng nhập Google hoặc thanh toán Google.
  Những công việc quản trị Google Ads cần OAuth/MCC/API chính thức.
- Chưa hỗ trợ iframe, shadow DOM, các webapp SPA phức tạp hoặc ghi chính xác
  mọi tương tác. Những website hạn chế trình duyệt nhúng có thể không hoạt động.
- Không dùng kỹ thuật che giấu dấu hiệu tự động hóa để vượt kiểm soát nền tảng.


## v1.8 — Local profile isolation
- Mỗi ID sử dụng thư mục dữ liệu Chromium hoặc Gecko độc lập. Kiểm tra và
  từ chối liên kết thư mục qua symlink/junction nơi có thể phát hiện.
- Không cho chạy hai tiến trình cùng một hồ sơ khi lệnh mở xảy ra đồng thời.
  Khi đóng, chờ hệ điều hành xác nhận tiến trình thoát trước khi cho phép
  xóa hồ sơ, nhằm tránh mất hoặc trộn dữ liệu phiên.
- Chrome khởi chạy với sync trình duyệt bị vô hiệu hóa và không ép dùng
  kho mật khẩu 'basic' thay cho cơ chế lưu trữ mặc định của OS.
- Nút kiểm tra cách ly hiển thị tình trạng **tách thư mục lưu trữ** từng hồ sơ.
  Không kiểm tra được liên kết danh tính qua đăng nhập Google, thanh toán, IP,
  phần cứng hay dữ liệu của bên thứ ba.
- Không cam kết ẩn danh, không phát hiện hoặc tránh các chính sách Google Ads.


## v1.9 — Proxy Center (local-first)
- Kho proxy riêng cho các endpoint **HTTP / SOCKS5 không yêu cầu xác thực**.
- Thêm, sửa, xóa, đặt tên và nhóm bằng nhãn; dữ liệu cấu hình được lưu cục bộ.
- Kiểm tra **IP thoát thực tế bằng HTTPS**, hiển thị độ trễ và so sánh IP trực tiếp
  nếu mạng cho phép. Kết quả kiểm tra chỉ ở bộ nhớ tạm, không ghi IP công khai lên ổ đĩa.
- Gán proxy đã lưu cho tối đa **50 hồ sơ** mỗi lần, xác thực trước toàn bộ danh sách,
  từ chối hồ sơ đang mở, Gecko chưa hỗ trợ hoặc hồ sơ không tồn tại. Cập nhật cơ sở
  dữ liệu trong **một giao dịch ghi tệp** có hoàn nguyên trong bộ nhớ nếu ghi thất bại.
- Việc sửa/xóa một proxy trong kho **không tự thay đổi** cấu hình của các hồ sơ đã gán.
- Dữ liệu nhập không cho phép lưu username, password, secret hoặc token. Không tuyên bố
  hỗ trợ proxy có mật khẩu, cấu hình proxy Gecko hoặc đảm bảo vô danh trước nền tảng.
- Để quản lý Google Ads nhiều khách hàng hợp lệ, dùng Google Ads MCC và OAuth được ủy quyền.


### RPA Studio improvements (1.9)
- Adds a **Wait For Element** step with a bounded timeout (100–15,000 ms)
  to reduce brittle fixed delays on authorized websites.
- Wait is interruptible by Emergency Stop, limited to the workflow allowlist,
  and refuses navigation outside permitted hosts.


## v2.0 — Native Privacy & Fingerprint Inspector
- Mặc định tạo hồ sơ Chromium ở chế độ **thông số gốc trình duyệt**:
  không tải extension thay đổi WebGL/Canvas/navigator; không ép User-Agent giả.
- Các hồ sơ cũ vẫn dùng cấu hình cũ; phần mềm hiển thị **cảnh báo rõ ràng** về
  dữ liệu sai lệch, phiên bản UA cũ, GPU/OS không thống nhất, hiệu ứng Canvas,
  WebRTC chưa được chứng thực. Có thể chọn Native và lưu để bỏ cấu hình này.
- Khắc phục lỗi Canvas/WebAudio: khi người dùng tắt nhiễu (seed bằng 0), bản vá
  tương ứng không chạy. Các bản vá thử nghiệm cũ không được coi là kỹ thuật ẩn danh.
- Inspector chỉ phân tích **cấu hình khai báo**. Không đo header gửi tới Google,
  tín hiệu mạng/thiết bị thực tế hoặc hệ thống đánh giá tài khoản.
- Sử dụng nhiều tài khoản Google Ads hợp lệ qua MCC và OAuth được ủy quyền;
  không có bảo đảm tránh liên kết tài khoản hay đình chỉ.


## v2.1 — LHM Mission Control dashboard
- A premium, keyboard-accessible navigation shell with real-time local counts.
- Dashboard totals come from actual saved profiles, running browsers, native/experimental
  configurations, local Health Check, Proxy Center, recorded activities, and workflows.
- Actions take the user to the existing working Profile Manager, Automation Studio,
  Proxy Center, Health Center, Control Tower and Backup dialogs.
- All dashboard data is calculated locally via a dedicated read-only IPC call,
  without new cloud services or fabricated anti-detection/security scores.
- A dashboard concept image is a visual proposal, not a live application screenshot.


## v2.2 — Workspace UI overhaul
- The actual desktop app opens directly to **Profiles**, not an illustration-first dashboard.
- New restrained light UI: white/grayscale surfaces, one blue accent, 16–18px
  bundled line icons (no third-party CDN, emoji or inconsistent brands in the
  primary workspace).
- More compact professional profile rows: name, group, proxy endpoint, actual
  configured browser type, native/custom fingerprint status and live running state.
- Existing IPC, profile CRUD, real Proxy Center, Health, Control Tower and
  Automation Studio remain functional through existing buttons and navigation.
- Dashboard remains a separate tab with real local counts. No fake safety
  percentages or anti-detection guarantees.
- Legacy secondary dialogs have light theme overrides; detailed accessibility
  and real-device UI tests remain necessary before commercial release.


### UI screenshot provenance
Windows CI attempts to capture a preview PNG directly from the real Electron desktop renderer using a temporary, isolated dataset labeled Demo. This happens only when LHM_CI_UI_CAPTURE=1 is explicitly set. It does not represent real customer data or real Google Ads accounts. Capture is best-effort because unattended Windows runners may not expose a graphical surface. Installer builds do not depend on a screenshot.


## v2.3 — Firefox/Gecko proxy parity
- Isolated Firefox profiles now support non-authenticated HTTP and SOCKS5 proxy settings in a managed `user.js` block. SOCKS5 remote DNS is enabled.
- LHM preserves other existing Firefox user preferences, rewrites only its own bounded block and resets proxy preferences when returning to Direct.
- Proxy Center can assign saved proxies to Firefox profiles with the same closed-profile check as Chromium.
- Gecko still uses **installed Firefox**, not an LHM-built engine, and credentials, CDP, cloud sync and high-assurance anonymity are not supported.


### Engine Diagnostics (v2.3)
Health Center can check actual locally installed Chrome, Edge and Firefox executables via `--version` on explicit user request. It reports missing or unknown engines and advisory outdated versions without claiming a custom LHM browser core or making security guarantees.
