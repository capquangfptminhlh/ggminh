# LHM Ads Browser — Local-first Windows Browser Manager

Phần mềm quản lý đa hồ sơ trình duyệt (multi-profile) vận hành cục bộ
trên máy Windows của người dùng (local-first): dữ liệu hồ sơ, cấu hình
và nhật ký quan sát lưu trên máy người dùng; LHM không vận hành máy chủ
đồng bộ dữ liệu hồ sơ. Bản dùng thử kéo dài 30 ngày với tối đa 10 hồ
sơ; các gói license trả phí thay đổi giới hạn số hồ sơ và tính năng
được mở (xem `docs/seller-runbook/` và mục License trong ứng dụng).

Phần mềm này không bảo đảm vượt qua bất kỳ cơ chế phát hiện nào, không
bảo đảm tránh liên kết tài khoản hay tránh đình chỉ tài khoản. Trạng
thái kỹ thuật của hồ sơ chỉ được báo theo từng tiêu chí đã đo
(ĐẠT / KHÔNG ĐẠT / CHƯA ĐO) kèm bằng chứng — không có kết luận "an
toàn" tổng hợp.

---

## Tính năng và giới hạn

- Quản lý hồ sơ Chromium (Chrome/Edge đã cài trên máy) và hồ sơ
  Gecko/Camoufox (engine cài riêng, chỉ chạy khi chữ ký nhà phát hành
  và SHA-256 khớp manifest đã ký).
- Proxy Center: cấu hình proxy theo hồ sơ và kiểm tra IP thoát trong
  phiên.
- Local API ở cổng 50325: tương thích **một tập con** cú pháp
  AdsPower, không phải tương thích đầy đủ.
- Automation Studio chạy có phê duyệt theo bước; sao lưu cấu hình mã
  hóa AES-256-GCM bằng mật khẩu do người dùng đặt.

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
   cd D:\lhm-ads-browser
   npm start
   ```

---

## 🤖 Kết nối Tự động hóa RPA (Python Playwright)

Với các endpoint thuộc tập con đã hỗ trợ, script viết cho AdsPower có
thể dùng lại mà không cần đổi logic gọi API. Endpoint ngoài tập con sẽ
báo lỗi rõ ràng thay vì chạy ngầm:

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
Chế độ Gecko hiện chạy thủ công, không hỗ trợ Chromium CDP/RPA. Proxy HTTP/SOCKS5 không mật khẩu đã được hỗ trợ từ v2.3.
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
  từ chối hồ sơ đang mở hoặc hồ sơ không tồn tại. Cập nhật cơ sở
  dữ liệu trong **một giao dịch ghi tệp** có hoàn nguyên trong bộ nhớ nếu ghi thất bại.
- Việc sửa/xóa một proxy trong kho **không tự thay đổi** cấu hình của các hồ sơ đã gán.
- Dữ liệu nhập không cho phép lưu username, password, secret hoặc token. Không tuyên bố
  hỗ trợ proxy có mật khẩu hoặc đảm bảo vô danh trước nền tảng.
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


### Privacy-default and browser-path consistency (2.3)
New profiles created through UI, Local API or the profile-template cloning action now use native browser device properties when no custom configuration is supplied. Browser startup and Health Check share the same installed Chrome/Edge/Firefox candidates, including eligible per-user installation paths. Legacy custom profiles retain existing configuration until explicitly edited.


## v2.4 — Automation Studio: conditions and bounded loops
- Workflow designer includes if_exists / else / end_if and counted repeat / end_repeat blocks, checking CSS element presence only on allowlisted websites.
- Max 2 nested blocks, 2–5 repeats, 40 stored steps and conservative limit of 160 executions. Malformed blocks are rejected.
- Manual approval at top-level must precede clicks/fills and control blocks when a workflow contains click/fill. Emergency Stop is supported.
- Google Ads login/payment and nonallowlisted hosts stay blocked. No unrestricted script execution, arbitrary jumps or indefinite loop.
- Studio is not yet a graph/canvas RPA designer, task scheduler or AI Agent.


## v2.5 — Visual Automation Flow
- Adds a scrollable node-and-connector canvas to the real Automation Studio for each workflow. It renders the branches validated by the same bounded control-flow compiler as the executor.
- Nodes, loop-back links, true/false paths and manual approval nodes support selecting the corresponding editable step. The running step is highlighted with the existing status API.
- Renderer receives a read-only graph from Electron IPC; it uses textContent for user content. Secret form values are masked in the preview. The canvas does not execute arbitrary scripts.
- v2.5 is a structured workflow visualization, not arbitrary connectable graph execution, scheduling or AI generation.


### UI reference-inspired layout (2.5)
- Compact monochrome icon rail, restrained cyan call-to-action and a functional left-side selected-profile details panel, with full operational table at right. Visual inspiration is a user-provided light SaaS screenshot; business-specific invoices and data in the screenshot are **not** copied.
- Clicking an actual profile row updates local details and available actions, reusing existing open/edit/health handlers. Data comes from local profiles, not decorative mock statistics.
- Narrower screens hide the information pane while retaining the profile table and navigation.


## v2.6 — Consistent operational UI
- Proxy Center uses an actual accessible endpoint/status table (not decorative cards), search within the locally loaded data and explicit add/edit/delete/check/assign actions.
- Automation Studio uses a restrained white/light-gray/cyan surface system, a searchable workflow library, validated graph visualization, editable steps, execution log and emergency stop.
- Existing workflow execution rules, host allowlist and manual approvals are unchanged. These are operational interface improvements, not fingerprint-evasion guarantees.


### Technical architecture decision
See [ADR-0001: LHM Browser Runtime](docs/ADR-0001-browser-runtime.md) for the planned managed engine, security/update acceptance criteria and why the current Electron application is not a Chromium C++ fork.

## v2.7 — Windows-encrypted authenticated HTTP proxy (beta)

- Windows Electron safeStorage encrypts a separate credentials file under local app storage. No plaintext fallback.
- Proxy Center accepts HTTP proxy username/password; the ordinary profile database, Local API and configuration backups do not contain passwords.
- Each authenticated HTTP proxy is opened via a per-profile gateway listening only on 127.0.0.1 with an ephemeral port. Gateway sends upstream Basic authorization for HTTPS CONNECT. Browser command-line arguments never contain credentials.
- Missing or invalid credentials cause browser launch to fail. No fallback to a direct connection.
- The gateway intentionally rejects regular HTTP proxy requests. HTTPS CONNECT is supported, but browser compatibility and upstream providers require real Windows tests.
- SOCKS5 with authentication is NOT implemented; SOCKS5 without authentication remains supported.
- Credentials are bound to the current Windows user/device, are not included in backups, and must be entered again after migration.
- Local processes can use the gateway while a profile is open. Localhost binding prevents network-external access but is not a process-level boundary.
- No guarantees of anonymity or avoiding account restrictions.

Profile edits that leave the proxy endpoint unchanged preserve the encrypted credential reference. The profile form directs users to Proxy Center instead of accepting raw proxy passwords.

Note: standard HTTP proxy Basic authentication is not encrypted on the network hop between LHM and a remote HTTP proxy. Use a trusted proxy provider and network; Windows encryption protects secrets at rest only.


## 2.8 — Authenticated SOCKS5 beta and proxy health
- Username/password for SOCKS5 use the existing Windows encrypted credential vault; the browser receives only a temporary localhost HTTP CONNECT endpoint.
- The gateway uses RFC1928 method 0x02 and RFC1929 username/password, with destination hostnames forwarded to the remote SOCKS5 server. The browser's command line contains no secret.
- Proxy Center verification uses the gateway for both HTTP and SOCKS5 credentialed connections. There is no direct fallback if authentication fails.
- Health reports warn when a configured authenticated endpoint differs from the saved proxy, its credential is missing, or Windows encryption is unavailable.
- Gateway supports HTTPS CONNECT only; HTTP URLs and UDP are deliberately unsupported in this beta.
- Security limit: the local loopback port can be used by other processes under the same OS account while the browser is open. Authenticated SOCKS5 traffic beyond the local machine is not end-to-end encrypted by SOCKS5 itself.


### Proxy Center batch tools (2.8)
- Import up to 100 endpoint-only CSV records per action: header `name,type,host,port,tag`. No usernames/passwords are accepted in CSV. Inputs are validated and committed atomically in one database write; duplicates are skipped.
- Verify at most 20 visible proxy entries per action with a concurrency limit of 3. Results represent HTTPS egress checks, not platform anti-fraud visibility.


### Backup compatibility and security (2.9)
OS-encrypted proxy credentials and their local references are not included in exported backups. If a profile uses an authenticated proxy, its exported configuration defaults to **Direct** so a restored profile cannot silently use the remote proxy without credentials; the user must explicitly reassign a saved, authenticated proxy after import. Older backup files containing local credential references are sanitized on import.


## v2.9 — Operational readiness, protected backup and launch lifecycle
- Health Center now has a real, local preflight checklist covering executable availability, profile configuration, encrypted credential vault, orphaned credential references, native-profile defaults, proxy IP verification and unimplemented capabilities.
- A readiness check is not an anti-fraud score or proof of network anonymity; it never collects cookies or reveals vault contents.
- Browser process exit handlers are registered before awaiting spawn, preventing false-positive successful launches and cleaning up the temporary proxy gateway on early failures.
- Configuration exports/imports remove non-portable encrypted credential references and reset those profiles to Direct, requiring explicit reauthentication after migration.


### Privacy-safe support report (2.9)
Health Center can export a small JSON technical report with software version, platform, counts and status codes. It intentionally omits profile/customer names, IP/proxy endpoints, usernames, passwords, cookie/session identifiers, local paths and account details. This is a manual, on-device action; no telemetry upload is performed.


### Restored-profile network safety
Profiles whose OS-encrypted proxy credentials cannot be migrated are marked `requiresProxySetup` after backup import. Launching them fails closed until a new proxy is explicitly assigned from Proxy Center. The requirement is visible in Health Center. Normal profile edits do not silently clear the requirement.


## v3.0 — Operational bulk actions
- Selected-profile toolbar launches up to 10 browser sessions per manual action, throttled to two concurrent startup tasks, reporting errors for each profile without blocking the remaining profiles.
- Atomic group assignment changes metadata for 1–50 closed profiles in a single database write; no cookies, fingerprints or credentials are changed.
- The feature does not automate Google Ads interactions or background-schedule launches. It reports per-profile results and requires manual confirmation.


### v3.0 Protected backup preview and staged restore
- Read-only preflight preview reports counts, required proxy reassignment and browser-session exclusion without changing local data.
- A restore is validated and staged entirely in memory; profiles and workflows are written once each. If a write fails, an in-process rollback restores original data when storage is writable. A power loss between the two files remains a limitation; this is not a fully crash-atomic multi-file transaction.
- Exported and restored workflow **fill values are blanked**, avoiding accidental transfer of form content. URLs and free-form notes remain in the encrypted backup and may themselves contain sensitive information: do not share backups untrusted.


## v3.1 — Local Automation Studio scheduler
- Schedule bounded, allowlisted **read-only** workflows (navigate, wait, assertions, conditions). Workflows containing clicks, fills or approval nodes cannot be scheduled.
- One-time or recurring schedules, explicit enable/disable, persistent local state, and once-per-minute checking **only while Electron is running**. Recurring missed executions are not replayed in a burst.
- A single workflow runs at a time; when busy, due schedules remain pending. Every run still passes the existing domain allowlist and cancellation safeguards.
- No hidden Windows service, unattended Google Ads actions or OS-level timer. User must keep LHM Browser open. Scheduler stores no browser cookies or account credentials.


## v3.2 — Persistence and live-profile API safety
- Automation workflows now stage create/edit/delete in memory and roll back on any persistence error. Atomic file replacement uses a unique temporary name and cleans up after failure; existing workflows remain unchanged when the write fails.
- Authenticated Local API now rejects profile edits while their Chromium/Gecko process is running or starting (HTTP 409), consistent with the desktop lifecycle lock. Stop the browser before editing a live profile.
- Partial profile updates preserve the previously selected Gecko/Chromium engine rather than silently resetting it to Chromium.
- Added regression tests for workflow persistence failures, API lifecycle locks, engine-preserving updates, and profile deletion while active.
- This release does not include an embedded browser core, Google Ads account automation, or any guarantee of anti-detection.

## v3.3 — Quick Create, profile tags, multiple startup tabs
- 1–50 empty profile templates in one validated, atomic database write; native fingerprint and direct networking are the defaults.
- Tags: maximum eight per profile, unique case-insensitively, maximum 32 characters each.
- Multiple HTTP(S) startup URLs: 1–5 per profile; validated for schemes, embedded credentials, length and duplicates. Chromium receives startup URL arguments; Firefox receives new-window/new-tab options. Test real opening on Windows before production use.
- Legacy startUrl remains compatible with older files and API clients. Templates copy tag and URL metadata, never cookies or authenticated sessions.
- This does not provide a self-built browser engine or anti-detection guarantees.


## v3.4 — Safe CSV/TXT mass import (metadata only)
- Import up to 200 brand-new, independent profiles per batch from CSV/TSV (comma, semicolon or tab) pasted into the app or read from a local CSV/TXT file.
- Supported columns: name (required), group, engine, startUrls, tags, notes, proxyType, proxyHost, proxyPort. Lists of URLs or tags use a pipe (`|`) delimiter inside each CSV cell. Quoted values and UTF-8 BOM are supported.
- Read-only preview validates every row with the same profile validation rules used by the actual import. Unknown columns (including cookies/passwords/OTP) are rejected, not silently accepted.
- One database write commits the entire batch; if a validation or disk write fails, no profile is imported. No browser sessions, cookies, passwords, 2FA values or fingerprint spoofing data are imported.
- Proxy host and port can be imported for HTTP/SOCKS5 without credentials. Assign authenticated proxies separately in Proxy Center. Network reachability and real Windows browser sessions must be tested on the target machine.


## v3.5 — Transactional tag updates and combined profile filters
- Manually update tags for 1–50 selected profiles: add, remove or replace (including clearing tags after confirmation). Tag validation and storage are all-or-nothing, with rollback if disk writes fail.
- Combine filters by group, tag, Chromium/Gecko, direct/proxy, running/stopped and the normal search field.
- Tag changes are bookkeeping-only and do not alter live browser sessions, cookies, fingerprints or proxy credentials.
- The UI adds a dedicated modal for tag operations and keeps the 50-profile batch cap.


## v3.6 — Recoverable local profile trash (30-day retention)
- **Desktop Delete** and authenticated Local API `DELETE /api/profiles/:id` now move profiles to a local recycle bin instead of deleting browser session files. Profiles are hidden from the active list while trashed. Old direct `Store.deleteProfile` remains an internal permanent-delete primitive for legacy callers and tests.
- **Thùng rác** allows a single profile to be restored with the same ID, browser engine, metadata and original on-disk browser data, provided it has not expired or been permanently deleted.
- A profile expires 30 days after moving to trash. The desktop checks expiration on startup; a dedicated UI action cleans up expired items on demand.
- Permanent removal requires typing `XOA` and removes local Chromium and Gecko session directories. Failed filesystem removal remains in an on-disk cleanup queue for retry. Data cannot be recovered after permanent deletion.
- Trash metadata is not exported in configuration-only backups. A configuration backup is **not** a browser session backup.
- When deleting from the desktop or Local API, running browser profiles are blocked as before; the application never moves a live browser profile into trash via those paths.


## v3.7 — Profile list column and density preferences
- Toolbar adds **Tùy biến bảng** to hide/show ID, proxy, engine and status columns individually. Profile name, selection and actions remain visible.
- Switch between comfortable and compact row density. Settings persist in this local desktop renderer's localStorage and do not modify profile information.
- The user's column preferences are reapplied every time live status polling re-renders the profile rows. Reset restores the default full view.


## v3.8 — Mass update existing profile metadata from CSV
- **Sửa CSV** in the top toolbar previews and updates 1–200 existing profiles in one all-or-nothing database write, identified by their immutable profile ID.
- Supported columns: `id` (required), `name`, `group`, `tags`, `notes`, `startUrls`. Empty tags/notes clear the field; blank name/group/URLs preserve prior values.
- Duplicate/unknown IDs, invalid URLs and unexpected columns (including cookies/credentials) fail validation for the entire batch. Updating a running browser's profile is disallowed even if only metadata changes.
- This does not reconfigure proxies or change engine, sessions, passwords, security properties or fingerprint values. The preview makes no persistent changes; commit validates again to catch status changes.


### v3.8 data-preservation fix
- Existing profile notes can now be deliberately cleared with an explicit empty string (including via CSV); omission still preserves notes. Regression coverage verifies the distinction.


## v3.9 — Window Manager: foreground, tiling, cascade & shared startup URL
- The new **Cửa sổ** screen can bring an already launched browser to the foreground or tile up to 10 *active* profile windows into a Windows primary-display grid or cascade. These actions are on demand and change window geometry only — **not** website content or clicks.
- Native Windows 32 API is called through a bundled signed-by-project-source PowerShell script (`src/ops/windowControl.ps1`), launched with hardcoded `powershell.exe`, `-File` (never `-Command`), numeric OS PIDs sourced only from this app's live `BrowserLauncher` process map. No arbitrary PowerShell, command strings, untrusted file paths or JS are executed.
- Foreground activation can be rejected by Windows focus-stealing restrictions. Some Chrome/Edge/Firefox windows may not be owned by the original launcher PID because existing browser instances reused a different process; such windows are reported as not found rather than touching unrelated applications. The app does not manage windows it did not launch.
- For up to 10 selected stopped profiles, a **shared URL** action starts their isolated sessions with a validated HTTP(S) URL; it skips all running profiles and never injects navigation into a running session. At most two starts occur concurrently. No synchronization of mouse, keyboard, forms or tab contents exists yet.
- Windows-only behavior must be smoke-tested interactively on a real customer workstation. CI validates argument safety, target PID filtering, data flow and build — not actual foreground activation with human interaction.


### Windows packaging note
- The PowerShell/Win32 helper is explicitly `asarUnpack`ed from the Electron archive so Windows can launch the source-controlled script in packaged builds. No download or arbitrary script execution is involved.


## v4.0 — Local Chromium extension management
- Install up to 50 **unpacked Manifest V3** Chromium extensions from a trusted local folder using the native file chooser; source files are copied into app-local storage. Symlinks, special files and oversized folders (>300 files or >25 MB) are rejected.
- Assign/remove extensions for selected **stopped Chromium profiles** (up to 50 per update); assignment writes are atomic and never copy cookies or user sessions. Restart assigned profiles for extension changes.
- Extensions are passed to Chrome/Edge with `--load-extension` at startup. **Activation is not guaranteed**, because recent Google Chrome builds may ignore loading unpacked extensions via command-line flags. No cloud distribution, ZIP import, Web Store download or Firefox extensions are implemented.
- Only install trusted extension code. The app does not audit extension permissions or contents beyond basic manifest and filesystem safety checks. Do not store third-party scripts or account secrets in extension metadata.


## v4.1 — Companion command-line utility (source + Node 22+)
- Enable the desktop Local API, copy the session API key in the desktop app and supply it via an environment variable named `LHM_API_KEY`. Optionally set `LHM_API_PORT` (default 50325).
- From the source repository run `npm run cli -- status`, `npm run cli -- list`, `npm run cli -- active`, `npm run cli -- start pb_...`, `npm run cli -- stop pb_...`.
- The CLI contacts `127.0.0.1` only, validates IDs and does not save API keys. It does not expose MCP, collect cookies or install a standalone CLI EXE. Use on a trusted local PC.


## v4.2 — Cache Data: conservative local cleanup
- Select 1–20 stopped profiles and open **Cache** to preview a bounded estimate of Chromium/Gecko *cache-only* directories.
- Explicit `XOA CACHE` confirmation is required for cleanup. The tool only removes allowlisted cache directories beneath the selected browser's isolated profile folder and checks all paths against symlinks before deletion.
- **Never** removes the profile root, Cookies, Login Data, Local Storage, IndexedDB, extension state, passwords or tokens. It does not wipe an account or guarantee disk space recovery.
- This destructive operation is not atomic (one directory may fail to delete after another succeeded); individual folder failures are reported. Profile(s) must be stopped before preview and cleanup.


### Workspace usability
- The increasingly crowded toolbar now groups Local API, Cache, Extensions, Window Manager, Trash and CSV actions into a keyboard-accessible **Công cụ** menu. Quick Create and Create Profile remain visible. No feature has been removed.


## v4.3 — OpenRouter AI Advisor (advisory-only, opt-in)
- **Công cụ → AI Advisor** provides an OpenRouter chat-completions assistant for profile organization, privacy, workflow safety and operational recommendations. Requires the user's own OpenRouter API key and chosen `provider/model`; model calls may incur provider charges. Uses the current `POST https://openrouter.ai/api/v1/chat/completions` endpoint. Network calls are explicitly user initiated.
- Key is persisted only in an OS-encrypted local file using Electron `safeStorage`; no plaintext fallback, no API key returned to the renderer, no secrets in normal profile JSON or configuration backups. OS encryption availability is checked before use.
- **Statistics sharing defaults OFF**. If opted in, only aggregate counts of profiles, engine types, groups and direct/proxy usage are sent with the user's prompt. Never automatically includes profile names, browser URLs, proxy addresses, cookies, logins, workflows, passwords or tokens. Anything the user personally types into the prompt is necessarily sent to OpenRouter.
- This assistant **does not execute browser automation or edit ad accounts**. Responses are displayed as plain text, not HTML; no auto-created workflows, no API commands, and no command execution. Max 2,000 prompt characters, 700 generated tokens, 30-second timeout, minimum seven seconds between requests and 20 requests per application session.
- AI output may be inaccurate or costly; review before acting. This is a bounded Advisor foundation, **not yet a full autonomous AI Agent**.


## v4.4 — AI-assisted safe Automation Studio workflow drafts
- From AI Advisor, select an existing **Chromium** profile locally, explicitly enter allowlisted hostnames and describe a workflow objective. Consent is required before the objective + allowed hostnames are sent to OpenRouter; profile ID, profile name, cookies, proxy and browser data are never transmitted automatically.
- The model proposes strictly structured JSON with 1–12 steps; existing Automation Studio validation rejects denied login/Google Ads/payment domains, out-of-allowlist navigation, forbidden secret-input selectors and workflows lacking a mandatory approval step before clicks or filling fields.
- The proposal is only displayed as plain text for review. **Lưu bản nháp vào Studio** is a distinct human action; saving does not execute a workflow. Execution still requires an intentional action in Automation Studio.
- AI output can be wrong or incompatible. Reject and retry invalid proposals; never treat model text as an instruction to the operating system.


## Feature parity / acceptance gate
- See `docs/FEATURE_PARITY.md` and the machine-readable `docs/feature-parity.json`. Full parity with AdsPower is **NOT achieved**. Some advanced domains require independent browser core development and real Windows, cloud and security verification.
- `npm run parity:report`: print progress and gaps without failing CI.
- `npm run parity:gate`: enforce full-scope acceptance; it deliberately exits nonzero when requirements remain partial/missing.
- A successful Windows EXE build is **not** the same as AdsPower feature completeness.


## v4.5 — Open shared URL in running Chromium sessions (limited Synchronizer)
- In **Công cụ → Cửa sổ**, select up to ten profiles and choose **Mở tab trên hồ sơ đang chạy** to open a validated HTTP(S) URL in newly created tabs of *running Chromium* sessions. Firefox and profiles without an active DevTools port are skipped.
- Chromium debugging must have been explicitly enabled **before opening** the browser through the existing Local API setting. Requests use only a checked numeric port from this application's live process map, `127.0.0.1` and the documented `PUT /json/new?{url}` Chromium endpoint. No web page content is read or cookies copied.
- This feature is **not full click, keyboard or scroll synchronization**. Browser version restrictions may prevent a tab opening; the per-profile result reports those errors instead of weakening any security setting. Real Windows browser tests are still needed.


### Real Windows browser smoke coverage
- The `windows-exe.yml` workflow now runs `node test/real-chromium-smoke.js` against **installed Chrome or Edge on Windows-latest**. It uses only a disposable temporary user-data directory and confirms startup with the local DevTools port and active shared-URL tab creation. The test fails the build if no browser is installed or tab creation is rejected.
- This is a single-host browser launch/navigation test, **not** a fingerprint, proxy, full Synchronizer or multi-device production validation. A separate real workstation acceptance test remains necessary.


## v4.6 — RPA Plus sequential multi-profile runs
- In **Automation Studio**, select a saved workflow and 1–20 Chromium profiles. Preview the exact targets and choose stop/continue behavior. Explicit confirmation is mandatory before starting; the queue runs only while the desktop app is open, one profile at a time.
- A single-run `AutomationRunner` holds an exclusive batch reservation. Manual runs, local read-only schedules, recorder sessions, editing/deletion of the active workflow and profile deletion cannot interfere with the queue.
- Every click or form fill still requires the existing **approval** step in each profile (approval is never transferred to the next profile); **Dừng hàng đợi** cancels the active workflow and skips remaining items.
- Execution uses the existing **Electron Automation Sandbox partition** for each profile ID, **not** a shared logged-in Chrome/Edge session. Cookie/login data is **not** transferred. This is safer and transparent but not full AdsPower RPA multi-profile parity.
- A rolling bounded history of 60 batches is stored locally as `automation-batches.json`, with per-profile statuses and timestamps but no form values, cookies, credentials, URLs or screenshots. Batches interrupted by a crash are marked interrupted on restart and never automatically resumed.


## v4.7 — Encrypted local session snapshots and restore
- **Công cụ → Snapshots** creates/restores snapshots of the original browser **profile storage directory** on the same machine. You must close the profile and finish any Recorder/RPA batch first. The snapshot contains sensitive website session state, bookmarks and browser storage; **do not share**.
- The archive is AES-256-GCM encrypted using a user-supplied passphrase (minimum 12 characters), PBKDF2-SHA256 with 220,000 iterations and fresh random salt/nonce. Files are never written as an unencrypted portable backup. The passphrase is not stored. Up to 10 snapshots/profile, 32 MB and 1,200 files/snapshot; large browser profiles require external backup solutions.
- Excludes cache directories but includes actual profile state such as Cookies, Local Storage, IndexedDB and Login Data when present. No Web Store extension library or proxy key vault is copied by this feature.
- Inspect requires the correct password; restoring requires a second **KHOI PHUC** confirmation. A staged directory swap and rollback protect against many filesystem errors. A sudden OS crash during the swap can still need manual recovery; do not replace regular external backups.
- Snapshot contents are bound to the original profile ID and browser engine; cross-profile/cross-device import is not supported. Chrome password data may be OS-bound. Cloud snapshots and team sync remain unimplemented.


## v4.8 — Portable encrypted session snapshot files (same profile only)
- From **Công cụ → Snapshots**, choose an existing stopped profile, create a snapshot, then use **Xuất file** to save its encrypted `.lhmsnap` archive to a user-selected external directory. Enter the correct password before export. The export never decrypts files onto disk or writes the password.
- **Nhập file .lhmsnap** chooses an external archive with the OS file chooser, verifies the AES-256-GCM integrity tag using the password, checks all filenames, bytes, counts and archive metadata, and stores the original encrypted envelope in the local snapshot list. Import does **not restore** anything; restoring requires the existing separate explicit `KHOI PHUC` confirmation.
- Archives are strongly bound to the original profile ID and browser engine; they cannot be imported into arbitrary other profiles. Output is exclusive-creation and refuses to overwrite existing files; archive import refuses duplicate IDs.
- This adds offline/export backups, **not cross-device browser-credential portability**, because Chrome Login Data may be protected by OS/device encryption. Cloud sync, team access and large profiles remain out of scope.


## v4.9 — Recovery from an external snapshot after reinstall
- **Snapshots → Khôi phục hồ sơ sau cài lại máy** can reconstruct the original profile ID and Chromium/Gecko session directory from a self-owned `.lhmsnap` file on an empty/other LHM installation. The user supplies a new display name, original backup password and explicit `TAO HO SO` confirmation.
- The archive is validated and fully authenticated **before** the new profile is created. Existing, trashed or orphaned profile IDs are rejected rather than overwritten. New profiles always start with direct proxy and native fingerprint; Chrome/Firefox browser session file contents are restored without plaintext intermediate archive files.
- If import or restore fails, the new profile/database entry, imported encrypted archive and any new session directory are rolled back where possible. A crashed OS or failed storage rollback may need manual recovery. Keep the external backup file until the new profile has been checked.
- Passwords, cookies and tokens may be encrypted to the original Windows account/device or tied to provider sessions and may require signing in again. This capability does not promise cross-device login compatibility or cloud synchronization.


## v5.0 — Signed offline licenses and monthly renewal foundation
- **Công cụ → Giấy phép & gia hạn** displays a locally generated installation ID. The issuer can produce monthly Ed25519-signed license codes tied to this ID, with plan, expiry and profile allowance. The app checks signatures and expiry locally without Internet, never accepting unsigned or tampered tokens.
- For vendor issuance, securely retain the separately generated encrypted PKCS#8 Ed25519 **PRIVATE** key OFFLINE. The app only embeds its matching PUBLIC key. To issue: set `LHM_ISSUER_PASSPHRASE` in a private terminal and run `npm run license:issue -- --key /secure/offline/private.pem --installation <UUID> --customer "Client" --plan pro --months 1 --max-profiles 100`. Never put the private key or passphrase in git, CI logs or the customer installer.
- License expiration and rollback indications rely on local clock metadata; this is not tamperproof against privileged device users. Reinstalling without carrying over `installation-id.json` creates a new ID and requires license reissue.
- **Current release does NOT block features by subscription tier.** Billing checkout, centralized revocation, self-service payment, authoritative clock and tenant licensing are not built. The activation UI is a verifiable foundation, **not a production-ready SaaS billing system**.


## v5.1 — Enforced local subscription entitlements
- New installations have a **30-day local trial capped at 10 profiles**; the original installation ID, trial start and highest-seen local clock persist independently of the profile database. Restart does not reset the trial.
- When a trial/license expires, users **can still view, edit, stop, delete, export backup and restore existing data**; they cannot create or launch new browser sessions, run automation, or enable/use Local API until activated. Already-running browsers are not forcibly closed.
- New-profile limits are checked for single creation, duplicate, Quick Create, CSV and configuration backup imports; restoring from trash and an explicit offline-disaster restore remains possible without deleting valuable user data. Existing profile count can exceed the signed cap following recovery, but no additional new profile can be created.
- Starter entitles browser profiles only, Pro/Business include Automation Studio and authenticated Local API. The signed license supplies the per-customer maximum profile count.
- License logic is in the main Electron process and verified on each action. Offline trials and local clock data are **not tamper-proof** for privileged users. No network billing, real server revocation or trusted device enforcement has been implemented.

## v5.2 — Signed online license verification and revocation (self-hosted foundation)

The desktop program now accepts a vendor-provided HTTPS verification URL through \`LHM_LICENSE_VERIFY_URL\`, ending precisely in \`/v1/verify\`. This value must be configured by the vendor in the installed application environment; browser websites, profile metadata and untrusted renderers cannot choose a verification endpoint. Without a configured URL, legacy offline behavior remains.

When online verification is configured, paid subscriptions require a signed online receipt before starting new activity. A valid receipt grants an offline grace period of at most 72 hours; a signed revocation or expiry response blocks licensed actions immediately. Expired/revoked/never-verified receipts do not delete browser profiles, session backups or customer data. Receipts are tied to the exact license ID, installation ID and fresh request nonce, signed by the issuer's Ed25519 key and validated inside the Electron main process.

A self-hosted licensing authority is provided for deployment behind an HTTPS reverse proxy. It defaults to binding only to \`127.0.0.1:8787\`; direct Internet HTTP hosting is unsupported. This is a foundation, **not a deployed cloud service**. The authority uses the **same encrypted PKCS#8 issuer private key kept off customer machines** and a local JSON revocation registry. It deliberately exposes no HTTP endpoint for administrators to revoke licenses.

Authority configuration (private, outside git and customer installers):
- \`LHM_ISSUER_KEY_PATH\`: absolute path to encrypted Ed25519 PKCS#8 PEM private key.
- \`LHM_ISSUER_PASSPHRASE\`: secret used to decrypt the PEM (prefer a secret manager or protected environment).
- \`LHM_LICENSE_REGISTRY_PATH\`: private JSON registry path for revoked license IDs.
- \`LHM_LICENSE_AUTHORITY_PORT\`: optional loopback-only port, default 8787.

Start through \`npm run license:server\`. Admin actions are on the authority host only: \`node tools/license-registry.js revoke /secure/registry.json lic_...\`; use \`allow\` to revoke the revocation. Use the existing \`npm run license:issue\` to issue new signed renewal tokens. Back up the registry securely and protect access to the issuer key. No customer data or browsing history is stored in the registry.

**Important limitations:** No central service is actually hosted yet; no billing/checkout, subscription payment, refund handling, identity verification, device transfer approvals, audited key rotation or live operator dashboard is included. The server must be configured with TLS, reverse proxy protection, monitoring, rate limits and operational procedures before production use. Offline licensing is not tamper-resistant on an administrator-controlled endpoint, and the optional online verifier does not change that fundamental limit.


## v5.3 — Pinned upstream Windows browser executable integrity
- **Công cụ → Kiểm tra hệ thống → Browser Engine Diagnostics** supports **Ghim Chrome/Edge** and **Ghim Firefox**. Select a local browser executable through the Windows file picker. LHM verifies expected executable basename, Windows PE header and SHA-256 checksum before saving the selection locally.
- Every new session checks the binary SHA-256 and size again. If the browser updates or changes, launch fails closed. Re-register after independently verifying the update or manually unpin to revert to upstream installed-browser discovery.
- This pins an externally installed mainstream browser executable; **it is not an AdsPower browser fork**, a new rendering engine, or native fingerprint spoofing. The current checksum implementation does **not verify Authenticode publisher signatures**; a malicious but well-formed executable selected by the user could be pinned. Full vendor signing and supply-chain audit remain future work.
- The renderer sees only engine display name and SHA-256, not the full executable path. LHM does not download browser binaries or transmit their paths online.

## v5.4 — Admin-only customer and subscription ledger

This release adds a local **operator-side** customer and license ledger under \`src/licensing/customerLedger.js\`. It is an administrative records system; do **not** distribute it to customers or pretend it is cloud billing. Electron installers exclude the issuer/admin CLI scripts. The existing end-user Windows app continues to validate signed license tokens and, when configured, receipts from the self-hosted authority.

The ledger stores customer display name, installation UUID, issued license ID, plan, expiry, profile capacity, renewal reference and up to 50,000 audit events. It does **not** store private signing keys, activation tokens, passwords, user cookies, proxy data or browser session files. It is intentionally stored in a private JSON file outside the GitHub checkout; use filesystem ACLs, backups and an encrypted disk. Operations take an exclusive lock and write atomically. A privileged operator could still tamper with local data. Never put ledger or issuer key under the web root.

Create a customer (all file paths must be absolute):

\`\`\`bash
node tools/license-admin.js add /secure/lhm-customers.json "Customer A" 11111111-1111-4111-8111-111111111111
\`\`\`

The printed \`cust_...\` ID is used for issuing a 1-month Pro license (issuer's encrypted Ed25519 private key must match the public key in the desktop app):

\`\`\`bash
node tools/license-admin.js issue /secure/lhm-customers.json cust_... pro 1 100 /secure/issuer-private.pem
\`\`\`

Set \`LHM_ISSUER_PASSPHRASE\` only in a trusted private terminal; do not paste it in chat, logs, commands or commit it to GitHub. The command prints a signed activation token **once**. Deliver it through a secure channel and do not lose it; the ledger only retains redacted metadata.

To extend a license by two calendar months from its existing expiry (or today's date, whichever is later), while preserving its plan, profile cap and original installation:

\`\`\`bash
node tools/license-admin.js renew /secure/lhm-customers.json lic_... 2 /secure/issuer-private.pem
\`\`\`

Old licenses remain valid until their original expiry unless separately revoked. A renewal creates a new signed license ID; the customer must activate the newly issued token. Confirm delivery before revoking the old license.

Reporting and operations:

\`\`\`bash
node tools/license-admin.js due /secure/lhm-customers.json 14
node tools/license-admin.js report /secure/lhm-customers.json
node tools/license-admin.js revoke /secure/lhm-customers.json /secure/revocations.json lic_...
node tools/license-admin.js allow  /secure/lhm-customers.json /secure/revocations.json lic_...
\`\`\`

The \`due\` command skips superseded license IDs. The revocation registry is authoritative for the online authority, whereas the ledger stores an audit copy. These are two separate files: keep reliable backups and reconcile manually if a crash occurs between updating them.

**Not implemented:** hosted customer admin website, production payment gateway, automated bank/payment reconciliation, multi-user operator RBAC, customer self-service portal, strong audit immutability, and SaaS-grade key management.


### v5.4 private HTML dashboard

The administrator can generate a portable, **offline, read-only** overview
of license customers, expiry dates, renewal alerts and revocation flags:

\`\`\`bash
node tools/license-dashboard.js /secure/lhm-customers.json /secure/customer-report.html 14
\`\`\`

Open \`customer-report.html\` locally. It has no JavaScript, external styles,
remote resources, network calls, or licensing administration buttons.
The report renders customer names as escaped text and never includes activation
tokens or issuer private keys. The output is a sensitive operator document;
protect and delete it appropriately and never upload it publicly. The
generator refuses to overwrite an existing HTML output file.

This is **not** a public customer portal, cloud dashboard or a substitute
for server-side authenticated role-based access and audit-backed billing.


## v5.5 — App identity and real runtime version in the workspace
- The workspace header and left navigation no longer hard-code a stale version. They display `app.getVersion()` from the Electron **main process** via a narrow, read-only preload bridge, and update the page title.
- **Công cụ → Thông tin phần mềm** shows the actual running version, Windows architecture, portable/development packaging indicator and current local license/trial status. No license token, user-data path, secret or fingerprint is transmitted by this endpoint.
- The Windows UI screenshot smoke test checks the DOM reports the actual `app.getVersion()` **before** saving `workspace-preview.png`, preventing old version labels from being published in CI previews.
- A passing screenshot and Windows EXE build do **not** imply full feature parity or fraud-detection invisibility.


## v5.6 — Premium cards workspace with motion design
- Rebuilt the default Profiles workspace with a slender icon rail, warm/light SaaS surfaces, actual local KPI cards for total/active profiles, proxy verification and saved workflows, searchable data grid and compact dark AI control panel. The existing profile handlers, proxy tools, Automation Studio and AI Advisor are reused; no stock/mock account data is shown outside screenshot fixtures.
- Added real keyboard search (Ctrl+K), quick shortcuts, staggered profile-row entrance, panel transitions, hover micro-interactions, page fade, counter updates and responsive layout. `prefers-reduced-motion` disables nonessential motion, and the UI retains original button/IPC IDs for backwards compatibility.
- Indicators show local known configuration health only, not third-party anti-bot scores or claims. The AI panel is a manual entry point; it does not autonomously operate ads.


## v5.7 — Functional premium workspace controls
- **Lệnh nhanh** opens an operator-only keyboard command palette (Ctrl+Shift+P, Cmd+Shift+P); local existing profile metadata and safe navigational actions can be searched with keyboard arrows and Enter, without opening or modifying an account automatically. All names are inserted with textContent, no HTML interpolation or remote queries.
- **Thu gọn bảng AI** toggles a full-width profile data grid. Ctrl+B toggles only outside text fields, and the UI preference persists locally on this computer. The right-side panel and data remain fully available after reopening.
- Accessible command list and keyboard focus, subtle spring-like entrance animation and reduced-motion support. Original buttons/IPC handlers remain operational.
- Package version and Electron runtime UI are now aligned at v5.7.0. Screenshots in Windows CI remain from the actual Electron app, not visual mockups.
