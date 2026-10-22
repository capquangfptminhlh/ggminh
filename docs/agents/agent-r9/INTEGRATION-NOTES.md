# INTEGRATION NOTES — Agent R9: công cụ ký manifest cập nhật (phía phát hành)

Đóng mục NOT_RUN cuối cùng trong ghi chú của Agent 12 ("Chưa có công
cụ ký phía phát hành — `tools/sign-app-update.js`"): công cụ đã có,
và đầu ra của nó được chứng minh bằng chính module kiểm chứng đã
giao (`src/update/updateCheck.js`), không phải bằng một bản sao
logic kiểm chứng khác.

Sản phẩm của agent này (đều là file mới, không sửa file chung):

- `tools/sign-app-update.js` — công cụ ký ngoại tuyến cho release
  operator: dựng manifest cập nhật, tính SHA-256 + kích thước từ
  file artifact thật, ký bằng payload canonical do
  `signedUpdatePayload` của phía kiểm chứng xuất ra, miền
  `LHM_APP_UPDATE_V1`. Xuất `signAppUpdate` (hàm thuần, tiêm được
  `now`, khóa so sánh license, allowlist và gốc cấm — phục vụ test)
  + CLI.
- `test/app-update-signing.js` — 25 nhóm test, khóa Ed25519 THỬ
  sinh trong tiến trình, chỉ ghi xuống thư mục tạm của hệ điều hành
  và xóa sau khi chạy; không khóa nào nằm trong repo.

## Bằng chứng vòng tròn (sign → check)

Test chạy qua chính `checkForUpdate` đã giao, trên manifest do
công cụ ký tạo ra:

| Trường hợp | Kết quả |
|---|---|
| Bản manifest mới hơn bản đang chạy (5.9.0 vs 5.8.0) | `update-available` |
| Bằng phiên bản (5.9.0 vs 5.9.0) | `up-to-date` |
| Sửa version hoặc sha256 sau khi ký | `invalid` / `signature-mismatch` |
| Hạ cấp (manifest 5.9.0, bản đang chạy 6.0.0) | `invalid` / `downgrade-refused` |
| Manifest hết hạn (ký hạn 1 ngày, kiểm tra sau 2 ngày) | `invalid` / `manifest-expired` |
| Kênh preview ký và kiểm đúng kênh của nó | `update-available`; kiểm nhầm kênh stable → `channel-mismatch` |

Ngoài ra bản thân công cụ **tự kiểm tra trước khi ghi**: manifest
hoàn chỉnh được chạy qua `checkForUpdate` (currentVersion `0.0.0`,
kèm tách khóa license) và chỉ khi kết quả là `update-available`
thì file mới được ghi (ghi nguyên tử tmp + rename, mode 0600,
không ghi đè khi chưa có `--force`). Một manifest mà phía kiểm
chứng sẽ từ chối thì công cụ không bao giờ phát ra.

Từ chối ồn ào đã có test: khóa ký TRÙNG khóa license (quy tắc tách
khóa Mục 8 — bản gương phía ký của từ chối
`publisher-key-matches-license` phía kiểm chứng); file neo public
key trùng khóa license; khóa riêng không khớp file neo; khóa mã
hóa mà thiếu/sai/ngắn (< 12 ký tự) passphrase; file khóa nằm trong
cây repo; URL artifact http / ngoài allowlist / có query; version
không phân tích được hoặc `0.0.0`; artifact thiếu / không phải
`.exe`; cửa sổ hiệu lực ngoài 1..90 ngày (in cảnh báo khi > 45
ngày theo khuyến nghị của UPDATE-DESIGN).

## Điểm nối đề xuất cho điều phối

1. **Chuỗi test** (file chung `package.json` — điều phối thực
   hiện, agent này không tự sửa): chèn ngay sau bước
   `node test/update-check.js` hiện có:

   ```
   && node test/app-update-signing.js && node --check tools/sign-app-update.js
   ```

   (vị trí: giữa `node test/update-check.js` và
   `node test/license-online.js` trong `scripts.test` hiện tại).
2. **Khóa ký production**: vẫn chờ quyết định D3 của Agent 12 /
   QD-02 của chủ dự án (một khóa publisher dùng chung cho engine +
   cập nhật, hay một khóa publisher thứ hai). Công cụ tương thích
   cả hai lựa chọn; điều duy nhất bị cấm trong mọi lựa chọn là ký
   bằng khóa license — công cụ tự từ chối. Khi chốt khóa, public
   key của nó phải được phân phối trong bản đóng gói làm neo cho
   cập nhật (điểm nối 1 trong ghi chú của Agent 12), và nên truyền
   file neo đó cho công cụ qua `LHM_UPDATE_PUBLISHER_KEY_FILE` để
   công cụ đối chiếu mỗi lần ký.
3. **Dọn trùng lặp (tùy chọn, không chặn)**: `checkArtifactUrl`
   trong `src/update/updateCheck.js` chưa được export, nên công cụ
   ký mang một bản gương nhỏ của quy tắc URL; vòng tự-kiểm-tra qua
   `checkForUpdate` là chốt chặn bắt mọi lệch lạc. Khi nào điều
   phối chạm vào `updateCheck.js`, export thêm hàm đó và cho công
   cụ dùng chung.

## Sổ tay vận hành cho chủ dự án (owner runbook)

**Khi nào ký.** Chỉ ký SAU khi file cài đặt của phiên bản mới đã
build xong và đóng băng byte-cuối: manifest ghim đúng SHA-256 và
kích thước của file đó — build lại dù chỉ một byte là manifest cũ
không còn khớp và khách sẽ bị từ chối ở bước kiểm chứng. Một lần
ký cho mỗi (phiên bản, kênh); bản stable và bản preview ký riêng.

**Cần chuẩn bị.** Máy ngoại tuyến giữ khóa publisher (theo quyết
định D3/QD-02), file khóa đặt NGOÀI repo, tốt nhất là bản PKCS#8
đã mã hóa bằng passphrase ≥ 12 ký tự. Biến môi trường trong terminal
riêng của operator — passphrase không bao giờ đi qua tham số dòng
lệnh:

```
LHM_UPDATE_SIGNING_KEY_FILE   đường dẫn tuyệt đối tới file khóa riêng
LHM_UPDATE_PASSPHRASE         passphrase của khóa (nếu khóa có mã hóa)
LHM_UPDATE_PUBLISHER_KEY_FILE (khuyến nghị) file public key neo để đối chiếu
LHM_UPDATE_ALLOWED_HOSTS      (tùy chọn) mặc định github.com — theo quyết định D2
```

**Lệnh ký.**

```
node tools/sign-app-update.js \
  --artifact /duong/dan/LHM-Ads-Browser-5.9.0-Setup-x64.exe \
  --version 5.9.0 --channel stable --valid-days 30 \
  --url https://github.com/<owner>/<repo>/releases/download/v5.9.0/LHM-Ads-Browser-5.9.0-Setup-x64.exe \
  --out /duong/dan/update.json
```

**Đăng ở đâu, thứ tự nào.** (1) Tải file cài đặt lên đúng URL đã
ký TRƯỚC. (2) Tải `update.json` lên vị trí manifest mà ứng dụng
đọc (GitHub Releases theo D2) SAU CÙNG. Thứ tự này là một phần của
an toàn: ứng dụng chỉ hành động theo manifest đã ký, nên chừng nào
manifest chưa đăng thì không khách nào được chào bản mới; nếu tải
artifact lỗi giữa chừng, chỉ cần không đăng manifest là không có
gì xảy ra. Không bao giờ sửa nội dung manifest sau khi ký — sửa là
chữ ký vỡ; cần đổi thì ký lại.

**Tín hiệu kiểm chứng sau khi đăng.** (a) Chính dòng
`Self-check via shipped checker ... : update-available` lúc ký là
tín hiệu đầu tiên. (b) Từ một máy đang chạy bản cũ, bấm kiểm tra
cập nhật (khi điểm nối IPC của Agent 12 được tích hợp): phải thấy
đúng phiên bản mới, đúng kích thước và hash rút gọn khớp với lúc
ký. (c) Tải lại file từ URL đã đăng và tính SHA-256 — phải khớp
từng ký tự với giá trị trong manifest. (d) Trước khi đăng bản
stable, nên cho kênh preview đi trước một nhịp với cùng quy trình.

**Hạn hiệu lực.** Mặc định 30 ngày, khuyến nghị không quá 45 ngày
(UPDATE-DESIGN Mục 2): manifest hết hạn thì ứng dụng coi như
không có cập nhật — đó là van chống phát lại manifest cũ, không
phải lỗi. Muốn kéo dài thì ký lại manifest mới với cửa sổ mới
(cùng artifact, cùng hash), không sửa file cũ.

## NOT_RUN / giới hạn

- Chưa có khóa publisher production (chờ lễ khóa của chủ dự án +
  D3/QD-02); mọi test dùng khóa thử tự sinh.
- Chưa chạy trên Windows / EXE đóng gói (cổng 3) — công cụ và test
  là Node thuần, chạy trên Linux/Node 24 tại commit nền `f280296`.
- D1 (khi nào kiểm tra), D2 (kênh manifest), D4 (luồng áp dụng)
  của Agent 12 vẫn là quyết định của chủ dự án; công cụ này không
  tải lên, không phân phối, không chạm vào phía người dùng.
