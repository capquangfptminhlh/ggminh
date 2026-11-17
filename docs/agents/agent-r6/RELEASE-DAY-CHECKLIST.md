# RELEASE-DAY CHECKLIST — Phát hành engine Camoufox thương mại

Checklist điều hành cho **ngày phát hành**, rút từ buổi lễ khóa của
Agent 13 (`docs/agents/agent-13/OWNER-RUNBOOK.md`) và buổi diễn tập
quy mô thật của Agent R6 (`RUN-REPORT.md` cùng thư mục). Các con số
trong ngoặc là **giá trị tham chiếu của buổi diễn tập** (cây
v156.0.1-beta.36, khóa thử) — chúng cho biết hình dạng đầu ra đúng;
mỗi lần phát hành phải ghi lại giá trị thật của lần đó theo Mục 23
của Hiến pháp, không chép lại số diễn tập.

## 0. Điều kiện tiên quyết (thiếu một mục = dừng)

- [ ] Quyết định của chủ dự án cho vấn đề **218 tên font** đã chốt
      bằng văn bản (phương án A/B/C/D trong RUN-REPORT của R6).
      Chưa chốt → công cụ ký sẽ từ chối cây nguyên trạng và ngày
      phát hành tắc ở bước 5.
- [ ] Quyết định khóa publisher (QD-02) đã chốt; buổi lễ khóa
      production (mục 1) thực hiện trên máy ngoại tuyến của chủ dự
      án — không dùng lại bất kỳ khóa thử nào của các đợt diễn tập
      (mọi khóa thử đều đã huỷ; fingerprint của chúng chỉ còn trong
      báo cáo để đối chiếu rằng chúng *không* được dùng lại).
- [ ] Bản ứng dụng phát hành mang đúng `publisher-ed25519.pub`
      production (mục 2) — engine ký bằng khóa nào thì ứng dụng
      phải neo khóa đó.

## 1. Buổi lễ khóa publisher production (theo OWNER-RUNBOOK mục 1–2)

- Sinh cặp Ed25519 mới trên máy ngoại tuyến, ngoài mọi thư mục repo.
  *Đầu ra kỳ vọng:* hai file PEM (private PKCS#8 / public SPKI) mở
  được; kiểm tra `asymmetricKeyType === 'ed25519'`.
- Đối chiếu public key ≠ khóa license của ứng dụng. *Tín hiệu dừng:*
  trùng nhau → huỷ cặp vừa sinh, làm lại (công cụ ký cũng sẽ từ
  chối, nhưng phải phát hiện tại đây).
- Private key vào két mã hoá ngoài máy làm việc + 2 bản sao lưu ở 2
  nơi vật lý khác nhau; ghi vị trí/ngày ngoài máy. *Không bao giờ*
  đưa private key vào repo, gói cài, thư mục engine, hay CI.

## 2. Neo public key vào bản phát hành ứng dụng (OWNER-RUNBOOK mục 3)

- Đặt `publisher-ed25519.pub` vào `resources/lhm-camoufox/` của bản
  đóng gói. *Kiểm chứng sau đóng gói:* file tồn tại đúng vị trí,
  fingerprint SPKI khớp với public key ở mục 1 (so bằng hàm băm,
  không so bằng mắt).

## 3. Lấy cây Windows chính thức + kiểm chứng nguồn gốc

- Tải asset của tag đã ghim từ `daijro/camoufox` Releases.
  *Tham chiếu diễn tập:* tag `v156.0.1-beta.36`, asset
  `camoufox-156.0.1-beta.36-win.x86_64.zip`, 1.311.638.126 byte,
  SHA-256 `096fd483…ae62031` — khớp ghim trong
  `tools/stage-camoufox-upstream-smoke.ps1`. Phiên bản khác → cập
  nhật ghim trước, rồi mới đối chiếu; lệch size/SHA = **dừng**.
- Giải nén vào thư mục chuẩn bị ngoài repo. *Đầu ra kỳ vọng (diễn
  tập):* 1.579 file, tổng 2.563.096.877 byte, `camoufox.exe` ở gốc
  cây, 0 entry symlink. Cây có thư mục bọc → lấy thư mục chứa
  `camoufox.exe` làm gốc ký.

## 4. CỔNG quét tên file (bắt buộc, mới từ phát hiện của R6)

- Chạy: `node docs/agents/agent-r6/scan-filenames.js <CAY> <THU_MUC_RA>`
  trên cây **nguyên trạng** và lưu `filename-verdicts.tsv` +
  `scan-summary.json` vào hồ sơ phát hành.
  *Đầu ra kỳ vọng sau khi đã áp phương án ở mục 0:* `fail = 0` và
  `productionListFiles.ok = true`. Trên cây v156.0.1-beta.36 nguyên
  trạng, kết quả đúng là `fail = 218` (toàn bộ ở `fonts/`) — thấy
  con số khác 218 với phiên bản này = upstream đã đổi cây, phải rà
  soát lại trước khi ký.
- Kiểm tra các giới hạn trong `scan-summary.json`: số file ≤
  10.000; file lớn nhất ≤ 512 MB (diễn tập: 192.123.488 byte);
  tổng ≤ 3 GiB (diễn tập: 2.563.096.877 byte); 0 symlink; 0 trùng
  tên không phân biệt hoa thường. Vượt bất kỳ giới hạn nào = dừng.

## 5. Chuẩn bị cây theo phương án đã chốt (mục 0)

- Phương án A (đổi tên): áp đúng bảng ánh xạ đã duyệt, quét lại đạt
  `fail = 0`, tổng byte nội dung không đổi; lưu bảng ánh xạ vào hồ
  sơ phát hành. *Tín hiệu dừng:* đổi tên làm đổi tổng byte, hoặc
  phát sinh va chạm tên.
- Phương án B/C/D: thực hiện theo thiết kế đã duyệt riêng của
  phương án đó (không improvisation trong ngày phát hành).

## 6. Ký manifest (OWNER-RUNBOOK mục 4)

- Đặt biến môi trường (đường dẫn tuyệt đối, ngoài cây và ngoài repo):
  `LHM_ENGINE_SIGNING_KEY_FILE` = private key publisher (chỉ cắm
  vào máy ký trong buổi này); `LHM_ENGINE_PUBLISHER_KEY_FILE` =
  public key publisher.
- Chạy: `node tools/sign-bundled-engine.js <CAY> <PHIEN_BAN> camoufox`
  (phiên bản dạng số, diễn tập dùng `156.0.1`).
  *Đầu ra kỳ vọng:* `Signed verified manifest: <CAY>/manifest.json
  Files: <N>` — diễn tập: `Files: 1579`. *Tín hiệu dừng:* mọi thông
  điệp `Cannot sign engine manifest: …` — đặc biệt
  `Unsafe bundled engine relative file path` nghĩa là cổng mục 4
  chưa sạch; `private key material` nghĩa là cây nhiễm file khóa;
  không xử lý bằng cách nới quy tắc tại chỗ.

## 7. Kiểm chứng độc lập ngay sau ký

- `BundledEngineManager` (engine `camoufox`, public key = publisher,
  platform Windows) `verify()` trên cây đã ký → *kỳ vọng:* đạt,
  trả `version` + `fileCount` khớp manifest (diễn tập: 156.0.1 /
  1579) và SHA của `camoufox.exe` (diễn tập:
  `a235730786ee4e27…`).
- Thử lại dưới khóa license của ứng dụng → *kỳ vọng:* bị từ chối
  với `signature is not trusted`. Đạt cả hai mới đi tiếp.

## 8. Đóng gói + descriptor

- ZIP toàn cây **không kèm `manifest.json`** (manifest đi trong
  descriptor). *Đầu ra kỳ vọng (diễn tập):* 1.355.084.308 byte cho
  ZIP deflate, đúng 1.579 entry; archive phải ≤ 2 GiB (trần của
  `validateRelease`/`downloadPinned`) — tính lại SHA-256 của
  archive bằng hàm băm luồng (không dùng hàm băm file-engine, nó có
  trần 512 MB cho từng file payload).
- Lập descriptor JSON: `schema: 1`, `url` dạng
  `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`,
  `archiveSha256`, `archiveBytes`, `manifest` = manifest đã ký ở
  mục 6. Chạy `validateRelease` dưới khóa publisher → *kỳ vọng:*
  đạt; thử một descriptor ký sai khóa → bị từ chối
  `not signed by the trusted publisher`.

## 9. Đăng release + kiểm chứng trên máy Windows sạch (Gate 3)

- Đăng ZIP + descriptor lên GitHub Release tại URL đã ghi trong
  descriptor.
- Trên máy Windows sạch: cài bản ứng dụng phát hành (mang public
  key ở mục 2), cài engine từ descriptor:
  - Bộ giải nén PowerShell sản phẩm chạy thật (diễn tập dùng seam —
    đây là lần đầu nó chạy trên cây thật, theo dõi log
    `Extracted <N> approved engine files`).
  - `inspectBinary` sản phẩm kiểm tra PE thật của `camoufox.exe`
    (trên Linux nó bị cổng đường dẫn chặn — NOT_RUN cho tới bước
    này).
  - Engine cài xong ở trạng thái hợp lệ; mở thử một hồ sơ Camoufox.
  - **Riêng phương án A:** kiểm tra engine có liệt kê/nhận đúng các
    font đã đổi tên hay không (điểm đo font của probe) — đây là
    điều kiện nghiệm thu bắt buộc vì buổi diễn tập không đo được.
  - Thử descriptor bị sửa 1 ký tự SHA → ứng dụng phải từ chối.
- Ghi hồ sơ nghiệm thu Mục 23: commit ứng dụng, digest engine
  (SHA của `camoufox.exe` + SHA của archive), hệ điều hành, cấu
  hình, thời gian, phạm vi đã đo. Thiếu hồ sơ = chưa phát hành.

## 10. Đóng buổi ký

- Rút private key khỏi máy ký, trả về két (OWNER-RUNBOOK mục 2/6).
- Hồ sơ phát hành gồm: descriptor đã đăng, `scan-summary.json` +
  bảng verdict/ánh xạ của mục 4–5, fingerprint SPKI của khóa
  publisher (chỉ public), hồ sơ nghiệm thu mục 9. Không mục nào
  trong hồ sơ được chứa nội dung private key.
- Thu hồi/đổi khóa khi có sự cố: theo OWNER-RUNBOOK mục 6 (khóa
  mới + bản ứng dụng mới mang neo khóa mới + ký lại engine).
