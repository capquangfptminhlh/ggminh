# LHM Online Update Center — cập nhật online có xác minh

## Trạng thái triển khai

- Trình kiểm tra manifest Ed25519 đã có trong
  `src/update/updateCheck.js`; có công cụ phát hành offline
  `tools/sign-app-update.js`.
- Từ thay đổi này, vào **Thông tin LHM Ads Browser → Cập nhật phiên bản online**:
  bấm **Kiểm tra phiên bản online**, sau khi kiểm chứng thấy phiên bản mới
  mới được bấm **Tải bản cập nhật đã xác minh**.
- Bộ cài được tải theo HTTPS, tối đa 3 redirect trong allowlist cố định,
  luồng dữ liệu giới hạn theo số byte đã ký, kiểm tra **đúng kích thước
  và SHA-256** trước khi ghi file đích. Tệp .partial bị xóa khi lỗi.
- Người dùng chủ động chọn chỗ lưu, không tự cài, không tự khởi động
  installer, không tắt SmartScreen/Defender, không tự gửi URL/customer data.
- **Không yêu cầu Authenticode** cho EXE theo Hiến pháp LHM v1.4;
  nhưng xác minh manifest Ed25519 và SHA-256 cho file update luôn là
  điều kiện bắt buộc, KHÔNG được nới lỏng.

**Quan trọng:** Tại thời điểm thêm mã nguồn này, repo CHƯA có public
key cập nhật production, chưa có manifest được chủ dự án ký và
chưa cấu hình kênh phân phối live. Nút tải luôn **fail-closed** cho tới
khi nhà phát hành thực hiện các bước bên dưới. Việc CI PASS không tự
động tạo ra một kênh cập nhật online live.

## Quy trình phát hành và thiết lập ban đầu (release operator)

1. Trên máy của chủ dự án, tạo **cặp khóa Ed25519 dành riêng cho
   cập nhật**, không dùng chung với khóa ký license. Giữ private key
   và passphrase trong hệ thống bí mật offline, ngoài repo. Không
   dán private key vào chat, PR, release hay GitHub Actions log.
2. Đặt **public key PEM/SPKI** của cặp này tại
   `resources/update-publisher/update-publisher-ed25519.pub`.
   Đây là khóa công khai không chứa bí mật. Chỉ owner có quyền duyệt
   thay đổi trust anchor; làm security review trước khi merge.
3. Build Windows installer mới có kèm public key tại
   `resources/lhm-update-publisher/update-publisher-ed25519.pub`.
   Các bản Preview trước đó thiếu key không thể tự tin vào manifest mới;
   cần phân phối một bản cài có public key bằng kênh chính thức
   ít nhất một lần.
4. Nâng phiên bản ứng dụng và build `npm run build:win`. Kiểm tra
   Windows CI, installer, giao diện, các cổng ký engine, license,
   cách ly profile; nghiệm thu Gate 3/4 theo hiến pháp.
5. Tải lên GitHub Release của **đúng phiên bản** cùng tên file
   thực tế `LHM-Ads-Browser-<version>-Preview-Setup-x64.exe`.
   Công bố SHA-256 và không nhầm artifact chạy CI (lưu tạm) với
   asset phát hành chính thức.
6. Offline, tạo manifest qua script đang có, với biến môi trường
   `LHM_UPDATE_SIGNING_KEY_FILE` trỏ đến private key ngoài repo,
   `LHM_UPDATE_PASSPHRASE` (nếu private key mã hóa) và
   `LHM_UPDATE_PUBLISHER_KEY_FILE` trỏ đến public key đúng.
   Ví dụ (thay đường dẫn bằng file thật và phiên bản phát hành):
   
   ```powershell
   node tools/sign-app-update.js --artifact "C:\\dist\\LHM-Ads-Browser-5.9.0-Preview-Setup-x64.exe" --version 5.9.0 --url "https://github.com/capquangfptminhlh/ggminh/releases/download/v5.9.0/LHM-Ads-Browser-5.9.0-Preview-Setup-x64.exe" --out "C:\\release\\stable.json" --channel stable --valid-days 30
   ```

7. Xuất bản `stable.json` (hoặc `preview.json`) đã ký vào
   **GitHub Release tag `lhm-updates`** sao cho endpoint cố định:
   `https://github.com/capquangfptminhlh/ggminh/releases/download/lhm-updates/stable.json`.
   Các redirect chỉ được đi qua host HTTPS allowlist
   `github.com`, `release-assets.githubusercontent.com` và
   `objects.githubusercontent.com`. Các kênh public CDN khác
   đòi cập nhật allowlist qua PR và kiểm thử.
8. Từ máy khách thực có public key đã đóng gói, chọn kiểm tra
   online, xác nhận phiên bản/kích thước/SHA-256, tải, đối chiếu
   file trên đĩa, cài theo quyết định của người dùng; kiểm tra không
   mất DB/profile, license, proxy vault, RPA, AI Advisor.
9. Khi thu hồi khóa cập nhật, phải **phân phối trust anchor mới
   ngoài băng** qua phiên bản đã xác minh. Không nhận khóa mới
   chỉ vì máy chủ trả về manifest bất kỳ.

## Công cụ release operator mới (không tự phát hành)

**Tạo khóa Ed25519 lần đầu trên máy chủ dự án, offline.**
Không chuyển private key, passphrase, tài khoản GitHub hoặc mã
kích hoạt vào chatbot, pull request, bộ cài hoặc Actions.

Tại máy chủ dự án, thiết lập một passphrase dài (ít nhất 16 ký tự)
trong môi trường terminal riêng tư, sau đó chạy:

```powershell
# Private path phải ở ngoài thư mục GitHub repo, ví dụ ổ D:
$env:LHM_UPDATE_PASSPHRASE = Read-Host -AsSecureString | ForEach-Object {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
node tools/setup-update-publisher.js --private "D:\LHM-Keys\update-private.pem"
Remove-Item Env:LHM_UPDATE_PASSPHRASE
```

- Thư mục chứa private key phải tồn tại trước đó và **nằm ngoài repo**.
- Script chỉ tạo mới, từ chối overwrite và mã hóa private key bằng
  AES-256-CBC. Public key PEM/SPKI được viết vào
  `resources/update-publisher/update-publisher-ed25519.pub`.
- Chủ dự án rà lại vân tay SHA-256 của public key và **chỉ commit
  public key** (không phải private key). Rà soát trust anchor phải qua
  review bảo mật và CI; sau đó khách cài một bản có public key.
- Để ký manifest offline, cần thiết lập
  `LHM_UPDATE_SIGNING_KEY_FILE` đúng private path ngoài repo và
  `LHM_UPDATE_PASSPHRASE` trong terminal riêng tư.

**Tạo GitHub Release ở trạng thái nháp từ đúng CI PASS:**
vào GitHub → Actions → **Prepare LHM Draft Release (owner approval)**
→ Run workflow trên `main`, nhập phiên bản và ID của run
**Build Windows EXE** đã PASS trên **chính commit main hiện tại**.
Workflow kiểm tra SHA commit, tên workflow, trạng thái thành công,
phiên bản trong package.json, đúng tên EXE; xuất SHA256SUMS và
tạo release `DRAFT` (không tự công khai, không tự ký manifest).
Nếu tag đã tồn tại, workflow từ chối ghi đè.

**Kiểm tra release cuối trước khi công bố:** sau khi tạo
`stable.json` bằng script ký đã có, chạy công cụ độc lập:

```powershell
node tools/update-release-preflight.js --installer "C:\release\LHM-Ads-Browser-5.9.0-Preview-Setup-x64.exe" --manifest "C:\release\stable.json" --public-key "resources\update-publisher\update-publisher-ed25519.pub" --version 5.9.0 --from-version 5.8.0
```

Đối với CLI này các đường dẫn `--installer`, `--manifest` và
`--public-key` cần là **đường dẫn tuyệt đối**; ví dụ trên phải đổi
public key thành đường dẫn tuyệt đối trước khi chạy.
Công cụ kiểm lại Ed25519, khác biệt khóa license, thời hạn,
phiên bản, tag GitHub Release, tên, số byte và SHA-256 thực tế.
Kết quả `VERIFIED_ARTIFACT_ONLY` **không đồng nghĩa** Gate 3/4
đã đạt hoặc Google/Meta chấp nhận phần mềm.

**Tình trạng activation:** vẫn còn bắt buộc cấu hình public key
trong EXE phát hành, ký và đăng manifest đúng URL,
xuất bản EXE từ GitHub Release và nghiệm thu cập nhật trên Windows
khách độc lập. Không có các bước này thì Update Center vẫn
`not-configured`; không tự tải/cài file không tin cậy.

## Kiểm tra bảo toàn dữ liệu trước nâng cấp (bổ sung)

Trong **Thông tin LHM Ads Browser → Cập nhật phiên bản online**, chọn
**Kiểm tra an toàn nâng cấp** trước khi tải/cài bản mới.

LHM chỉ đọc dữ liệu tại thư mục storage hiện tại để đếm số profile,
workflow, xác nhận các tệp license/định danh cài đặt, kho proxy mã hóa,
thư mục session và số trình duyệt đang mở. Báo cáo không trả tên
profile, ID, URL, cookie, token, khóa, mật khẩu, đường dẫn đầy đủ hoặc
chữ ký số của từng khách hàng. Không yêu cầu mạng, không lưu báo cáo
và không di chuyển/xóa tệp.

Nếu dữ liệu hồ sơ hoặc workflow trên đĩa sai định dạng, không khớp
bộ nhớ, kho proxy mã hóa bị lỗi, hoặc license được kích hoạt nhưng
mất file định danh, kết quả **blocked**. Nút tải online từ app bị
chặn cho đến khi xử lý nguyên nhân và kiểm tra lại. Cơ chế này
không tự sửa chữa hoặc xóa tệp bị lỗi.

Nếu còn trình duyệt đang chạy, cần đóng và lưu công việc
**trước khi chạy installer**, nhưng không nhất thiết phải đóng
chỉ để tải file EXE. Khi phát hiện phiên/snapshot, LHM nêu rõ
**sao lưu cấu hình mã hóa .lhmbak không gồm cookies,
LocalStorage, IndexedDB, cache hay toàn bộ session**. Nếu cần
di chuyển/khôi phục session, dùng tính năng Session Snapshots
theo quy trình riêng. Định danh license và proxy vault cần giữ
nguyên trong cùng tài khoản Windows và storage folder.

Bài `test/upgrade-continuity.js` sử dụng dữ liệu **giả**,
tạo Store/Workflow/Vault/License thật, lưu một số tệp phiên mẫu,
kiểm chứng mọi byte và danh tính sau khi dựng lại app services.
Test cũng thử dữ liệu hỏng và bảo đảm báo cáo không lộ bí mật.
**Đây chỉ là bài mô phỏng khởi động lại ứng dụng, KHÔNG phải
nghiệm thu cài đè hoặc nâng cấp EXE NSIS trên máy thật.**

Cần có Gate 3 Windows độc lập: chạy installer bản cũ, dùng dữ
liệu thử nghiệm, chạy installer bản mới, khởi động lại và đối
chiếu đầy đủ cookies/session, profile, license, proxy vault,
workflows và khả năng rollback. Chỉ sau đó mới ký Gate 4.

## Giới hạn, vận hành và quyền riêng tư

- Không thực hiện network request khi chỉ mở phần mềm/trang
  thông tin. Chỉ kiểm tra sau khi người dùng bấm.
- Kiểm tra online tiết lộ IP của máy tới máy chủ GitHub; không
  gửi profile, cookie, token, fingerprint, chiến dịch hoặc license.
- Không tự chạy EXE đã tải hoặc tự restart trình duyệt khi đang
  làm việc; tránh mất dữ liệu người dùng.
- Tên file lưu phải khớp chính xác với artifact signed manifest;
  không ghi đè installer sẵn có.
- Manifest hỏng chữ ký, hết hạn, thay đổi SHA-256, URL không HTTPS,
  thiếu publisher key, lỗi mạng, hạ cấp hoặc hash download lệch:
  **không tải hoặc không cung cấp file EXE không xác minh**.
- Nếu EXE không có Authenticode, SmartScreen có thể cảnh báo;
  thông báo trung thực, không hướng dẫn tắt bảo vệ.
- GitHub Releases riêng tư không thể tải công khai nếu khách hàng
  không có quyền, do LHM không gửi GitHub token hoặc cookie.
- Chưa có delta patch/in-place update, rollback tự động, CDN do
  owner sở hữu hay background scheduling. Đó là các phát triển tiếp theo,
  không được mô tả là đã hoàn tất.

## Bảo toàn tính năng LHM

Update Center chỉ thêm module trong `src/update`, bốn IPC giới hạn,
giao diện trong About, khóa public key đóng gói và test.
Không đổi engine, Signal Chain, GraphDefense, Proxy Vault, dữ liệu
phiên, AI, Ads Launch Guard, license hoặc RPA.
`node test/online-update-center.js` bao gồm giả lập máy chủ:
ký đúng, key thiếu, đổi bản manifest, CDN HTTPS redirect,
download đúng byte, hash lệch, tệp không hoàn chỉnh và UI wiring.
