# QUY TRÌNH PHÁT HÀNH — LHM Ads Browser (release pipeline)

Tài liệu này mô tả đường ống từ commit tới artifact cài đặt và nghiệm
thu, theo chuỗi cổng bắt buộc của Mục 12 Hiến pháp (TIEU-CHI-SAN-PHAM.md)
và yêu cầu hồ sơ bằng chứng của Mục 23. Mỗi bước ghi rõ nơi thực thi:
`[CI-WIN]` = CI Windows, `[WIN]` = máy Windows thật của chủ dự án,
`[OWNER]` = chỉ chủ dự án quyết/làm, `[DEV]` = máy phát triển bất kỳ.

Trạng thái kiểm chứng của tài liệu này: đối chiếu code/cấu hình tại
commit `07150d6` (nhánh tích hợp v5.8-phase-c) + hai lần build thử thật
trên Linux được ghi ở Mục 5. Mọi khẳng định về build trên Windows dựa
vào workflow `.github/workflows/windows-exe.yml` và mốc Mục 10 Hiến
pháp — không thay thế nghiệm thu cổng 3.

## 1. Nguồn sự thật về phiên bản (đã rà soát tại 07150d6)

| Hạng mục | Nguồn duy nhất | Giá trị tại 07150d6 | Trạng thái |
|---|---|---|---|
| Số phiên bản | `package.json` → `version` | `5.8.0` | Nhất quán |
| Tên artifact | `package.json` → `build.nsis.artifactName` = `LHM-Ads-Browser-${version}-Preview-Setup-${arch}.${ext}` | sinh ra `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` | Đã kiểm chứng thực tế: build chẩn đoán trên Linux sinh đúng tên này (Mục 5) |
| appId | `package.json` → `build.appId` | `vn.lhm.adsbrowser` | Chỉ xuất hiện một nơi |
| productName | `package.json` → `build.productName` | `LHM Ads Browser` | Khớp `main.js` (tiêu đề cửa sổ), `src/ui/appIdentity.js` (kiểm tra `name === 'LHM Ads Browser'`) |
| Phiên bản lúc chạy | `src/api/server.js` đọc trực tiếp `package.json.version` | — | Không có bản sao cứng |

Lệch nhỏ phát hiện được (tài liệu/chú thích, không phải cấu hình):
- `README.md` dòng 626 vẫn viết "aligned at v5.7.0" trong khi
  `package.json` là 5.8.0.
- Đầu file `src/ops/windowControl.ps1` vẫn ghi "LHM Ads Browser v3.9"
  (chú thích trong file runtime có phát hành).
- `run.bat` (script chạy dev bằng `npm start`) vẫn mang tiêu đề
  "PowerBrowser OS" và hiện **đang nằm trong gói cài** (xem Mục 4).
- Chuỗi `5.8.1` trong `test/local-health-drift.js` là dữ liệu fixture
  cố ý để test lệch phiên bản — không phải lệch cấu hình.

## 2. Quy trình phát hành (theo thứ tự cổng Mục 12)

### Bước 0 — Đóng băng trạng thái code `[OWNER]`
- Một trạng thái code duy nhất trên một nhánh GitHub có tên rõ ràng
  (Mục 13). Mọi thay đổi chỉ ở máy local không tính là "đã làm".
- Ghi lại: commit hash đầy đủ, nhánh, thời điểm đóng băng.

### Bước 1 — Cổng 1: test cục bộ trên chính nhánh `[DEV]`
- `npm ci` rồi `npm test`.
- Lưu ý đã biết: chuỗi `npm test` nối bằng `&&` nên trên Linux dừng ở
  fixture lệ thuộc Windows đầu tiên và che các bước sau (QA-005); khi
  cần bằng chứng đầy đủ phải chạy từng bước và ghi PASS/FAIL theo bước.
- Kết quả kỳ vọng hiện tại: mọi bước đạt trừ hai fixture lệ thuộc
  Windows (`test/browser-diagnostics.js`, `test/runtime-registry.js`)
  — hai test này chỉ có nghĩa trên Windows.

### Bước 2 — Kiểm tra nhất quán phiên bản `[DEV]`
- Chỉ sửa phiên bản tại `package.json` → `version`; tên artifact tự
  suy ra, cấm ghi cứng số phiên bản ở nơi khác.
- Quét lại các điểm nêu ở Mục 1 của tài liệu này (README, chú thích
  `.ps1`) nếu chúng được cập nhật theo phiên bản.

### Bước 3 — Cổng 2: CI Windows `[CI-WIN]`
Workflow `.github/workflows/windows-exe.yml` (Node 22, windows-latest):
1. `npm ci` → `npm test`.
2. Smoke script Win32 thật (`src/ops/windowControl.ps1` chạy bằng
   powershell.exe trên runner).
3. Smoke hồ sơ Chrome/Edge thật (`test/real-chromium-smoke.js`).
4. `npm run build:win` → artifact `dist/*.exe`, upload dưới tên
   `LHM-Ads-Browser-Windows-x64`.
5. Kiểm chứng sau đóng gói ngay trong CI: `windowControl.ps1` và
   `tools/extract-signed-engine.ps1` phải nằm ở
   `resources/app.asar.unpacked/...`; thư mục engine ngoài phải ở
   `resources/lhm-engines` + `resources/lhm-camoufox` (chỉ README ở
   bản preview) và không bị nhân đôi trong asar; staging Camoufox
   không được chứa `camoufox.exe`/`release.json`/`publisher-ed25519.pub`
   chưa được duyệt.
6. Chụp giao diện Electron thật (biến `LHM_CI_UI_CAPTURE=1`) và upload.
- Phép đo cấu hình Camoufox trên CI (stage0 configured) thuộc cổng 2
  nhưng đang chờ áp file vá workflow
  (`tools/patches/camoufox-smoke-configured-steps.patch`) — việc áp vá
  cần quyền ghi `.github/workflows`, ngoài phạm vi agent.

### Bước 4 — Chuẩn bị engine đóng gói `[OWNER]`
- Engine Camoufox phân phối qua luồng cài ký số riêng (manifest
  Ed25519 bằng khóa publisher tách riêng khóa license — xem báo cáo
  Agent 2 đợt trước), không nằm trong artifact EXE ở bản preview:
  staging `resources/camoufox-engine/` hiện chỉ có README.
- Khóa publisher dùng để **xác minh engine/manifest** là tài sản bảo mật
  của chủ dự án; không nằm trong repo, không agent tự tạo khóa production.
- **Không yêu cầu chứng thư Authenticode cho EXE/installer.** Theo Hiến
  pháp v1.4 (22/10/2026), đây là lựa chọn tự nguyện về sau, không phải
  điều kiện phát hành. Không nhầm với chữ ký manifest/engine Ed25519.

### Bước 5 — Tiếp nhận artifact `[DEV]`
Với mỗi artifact tải về từ CI, ghi vào hồ sơ phát hành (Mục 23):
- Tên file kỳ vọng `LHM-Ads-Browser-<version>-Preview-Setup-x64.exe`
  + SHA-256 của file.
- Commit, phiên bản Electron (bản build thử tại 07150d6 dùng Electron
  33.4.11), phiên bản electron-builder và trạng thái lockfile của nó
  (Mục 3), Node trên runner (22).
- Hệ điều hành build (windows-latest) và thời điểm build.

### Bước 6 — Cổng 3: nghiệm thu trên máy Windows thật `[WIN][OWNER]`
- Cài đặt EXE từ Bước 5 trên máy Windows thật của chủ dự án; chạy bộ
  nghiệm thu trong `docs/CAMOUFOX_REAL_WINDOWS_ACCEPTANCE.md` và các
  phép đo stage0 (gồm bản cấu hình có danh tính ghim).
- Đóng gói bằng chứng: báo cáo đo, ảnh chụp, nhật ký — gắn commit +
  hash engine + cấu hình (đã loại bí mật) theo Mục 23.
- Artifact build trên Linux **không** dùng cho cổng này và không được
  trình bày như bằng chứng nghiệm thu (xem Mục 5).

### Bước 7 — Cổng 4: gắn tag và gộp `main` `[OWNER]`
- Chỉ sau cổng 3, chủ dự án quyết định gắn tag và gộp vào `main`
  (Mục 12.4). Agent chỉ đề xuất.

### Bước 8 — Phân phối `[OWNER]`
- EXE/installer **được phép phát hành không ký Authenticode** theo quyết
  định chính thức của chủ dự án (Hiến pháp Mục 12); không cần mua chứng
  thư ký EXE để hoàn thành cổng phát hành.
- Công bố rõ "Nhà phát hành chưa được Windows xác minh bằng chứng thư
  ký mã"; SmartScreen/Defender có thể hiển thị cảnh báo hoặc chính sách
  tổ chức có thể chặn cài đặt. Không hứa ứng dụng không bị cảnh báo;
  không hướng dẫn vô hiệu hóa SmartScreen/Defender.
- Nhà phát hành vẫn phải công bố nơi tải chính thức, commit của bản build
  cùng SHA-256 của đúng file EXE, kết quả CI và nghiệm thu trên máy thật.
  Xác minh publisher/manifest engine và chữ ký cập nhật không thay đổi.
- Ứng dụng hiện dùng **icon mặc định của Electron** vì chưa cấu hình
  `build.win.icon` và repo không có file icon ứng dụng (đã quan sát
  trong cả hai log build thử, Mục 5) — cần tài sản icon từ chủ dự án
  trước bản thương mại.

## 3. Tính tái hiện của bộ build (electron-builder)

Hiện trạng tại 07150d6 (đã kiểm chứng bằng code + lockfile):
- `electron-builder` **không có** trong `devDependencies` và **không
  xuất hiện trong `package-lock.json`** (0 mục). `npm ci` không cài nó.
- Script `build:win` ghim đúng một lớp:
  `npx --yes electron-builder@25.1.8 ...` — phiên bản builder chính
  được cố định, nhưng **toàn bộ cây phụ thuộc của builder** (app-builder
  và các gói con) và các bộ công cụ nó tải lúc build (winCodeSign,
  NSIS — phiên bản do bản builder đó chỉ định, đã quan sát
  winCodeSign-2.6.0 / nsis-3.0.4.1 trong log) được phân giải mới từ
  registry mỗi lần build. Hồ sơ nghiệm thu vì thế chưa tái hiện đầy đủ
  theo Mục 23.
- Tương thích đã kiểm chứng thực nghiệm: builder 25.1.8 chạy trên
  Node 24 (máy này) và Node 22 (CI theo workflow), đóng gói Electron
  33.4.11 không lỗi cấu hình; mọi khóa cấu hình đang dùng (`files`,
  `asar`/`asarUnpack`, `win.target` dạng object, `nsis.artifactName`
  với macro `${version}/${arch}/${ext}`, `extraResources` kèm `filter`)
  đều thuộc bề mặt cấu hình chuẩn của bản 25.
- Cách khép đã kiểm chứng ở thư mục scratch (chưa áp vào repo — file
  chung thuộc điều phối): thêm `"electron-builder": "25.1.8"` vào
  `devDependencies` cho ra lockfile 350 mục ghim trọn cây builder
  (gồm `app-builder-bin`, `app-builder-lib`); sau đó đổi script thành
  `electron-builder --win nsis --x64 --publish never` và `npm ci` trên
  CI tự cài đúng builder. Diff cụ thể: xem INTEGRATION-NOTES của agent
  này (`agents/agent-1/INTEGRATION-NOTES.md`).

## 4. Payload gói cài — hiện trạng và đề xuất gọn

Kiểm chứng trực tiếp trên `app.asar` do chính builder tạo tại 07150d6
(build thử lần 1, Mục 5): asar gồm 1.539 mục; nội dung repo ~1,3 MB,
node_modules production ~41,4 MB (theo header asar). Phần **không
phải runtime nhưng đang phát hành tới mọi khách hàng**:

- Toàn bộ `docs/` (22 file: hợp đồng kiến trúc nội bộ, ghi chú
  MAPPING/INTEGRATION-NOTES của các agent, tài liệu nghiệm thu nội bộ).
- Các file gốc: `TIEU-CHI-SAN-PHAM.md` (Hiến pháp nội bộ),
  `MASTER-MAPPING.md`, `QA-BASELINE.md`, `OPEN-ISSUES.md`,
  `EVIDENCE-CHECKLIST.md`, `INTEGRATION-NOTES.md`,
  `INTEGRATION-PLAN.md`, `README.md`, `agents/agent-7/*`, `run.bat`.
- Trong `tools/`: 7 script test Camoufox (`test-camoufox-*.mjs/.js`),
  `stage-camoufox-upstream-smoke.ps1`, `parity-audit.js`,
  `generate-camoufox-identity.mjs` và **`tools/patches/*.patch`** —
  tức cả bản vá workflow chưa áp cũng đang nằm trong gói cài.
- (`.github/` không vào gói — builder tự bỏ qua thư mục dot.)

File runtime thực sự cần trong asar (đối chiếu `main.js`,
`src/engine/camoufoxInstallService.js`, `src/ops/windowOperations.js`
và các bước kiểm chứng của CI): `main.js`, `preload.js`,
`package.json`, toàn bộ `src/**`, và duy nhất một file của `tools/` là
`tools/extract-signed-engine.ps1`; engine đóng gói đi qua
`extraResources` (đã loại khỏi asar đúng thiết kế và CI có kiểm chứng).

Về dung lượng, phần thừa chỉ ~0,5 MB — **lý do gọn gói không phải dung
lượng** mà là: không phát hành tài liệu nội bộ/QA/Hiến pháp và công cụ
dev/test cho khách hàng. Đề xuất glob (phương án A — giữ dạng `**/*`
cộng loại trừ; đã kiểm chứng ở mức đóng gói `--dir` trên chính commit
này: 0 mục cấm lọt vào, file runtime đủ, hai file `.ps1` vẫn vào đúng
`app.asar.unpacked`) nằm trong INTEGRATION-NOTES. Phương án B (allowlist
từ đầu) chặt hơn và loại bỏ hẳn một hazard đã quan sát: glob `**/*` chỉ
loại trừ đúng thư mục tên `dist` — trong lần build thử chẩn đoán, một
thư mục output đặt tên khác (`dist-diag/`, 290,8 MB) đã bị nuốt trọn
vào asar. Phương án B cần một lần chạy CI Windows để xác nhận không
thiếu file runtime trước khi áp dụng chính thức.

## 5. Bằng chứng build thử trên Linux (không phải bằng chứng cổng 3)

Môi trường: Linux x86_64 (kernel 7.0.0-39), Node v24.20.0, npm 10.9.4,
không có wine; commit 07150d6; ngày 2026-10-21.

| Lần | Lệnh | Kết quả |
|---|---|---|
| 1 | `npm run build:win` (đúng script phát hành: `npx --yes electron-builder@25.1.8 --win nsis --x64 --publish never`) | **FAIL** sau khi đóng gói xong phía ứng dụng (Electron 33.4.11 win32-x64, asar tạo xong): dừng ở bước ký/sửa metadata exe — `wine is required` / `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`. Không sinh installer. |
| 2 (chẩn đoán) | Cùng builder, cấu hình tạm ngoài repo cộng `win.signAndEditExecutable=false` | Đóng gói + bắt đầu NSIS: file `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` được tạo **đúng tên kỳ vọng** nhưng chỉ là stub 189.191 byte (SHA-256 `bb386db6f04b57049cdcfd6e9a396f09691c22d1e1d00d80fc0031bd304c4610`) rồi **FAIL** cùng lỗi wine khi hoàn thiện metadata của chính file installer. Stub này không cài đặt được, không dùng làm bằng chứng gì ngoài việc kiểm chứng tên artifact. |
| 3 (chẩn đoán) | Cấu hình tạm với glob gọn đề xuất (Mục 4), target `--dir` | **PASS** (exit 0): asar không còn mục nội bộ nào, đủ file runtime, hai `.ps1` vẫn unpack đúng vị trí CI kiểm chứng. |

Kết luận build: trên máy Linux không có wine, đường ống phát hành
không tạo được installer hoàn chỉnh — điểm dừng là rcedit/ký exe, đúng
bản chất công cụ; đường ống chính thức là CI Windows (Bước 3) và
nghiệm thu là máy Windows thật (Bước 6). Cài wine vào máy này nằm ngoài
phạm vi đợt triển khai.

## 6. NOT_RUN và điều kiện cần

- Build installer hoàn chỉnh trên Windows từ nhánh tích hợp hiện tại:
  NOT_RUN trong đợt này (cần push để CI chạy — ngoài quyền của agent;
  hoặc chạy `npm run build:win` trên máy Windows của chủ dự án).
- Áp dụng hai diff ở INTEGRATION-NOTES rồi chạy lại cổng 2: NOT_RUN —
  chờ điều phối áp diff và chủ dự án cho push.
- Icon ứng dụng: quyết định riêng về nhận diện sản phẩm, không đồng
  nghĩa miễn nghiệm thu giao diện.
- Authenticode ký EXE/installer: **KHÔNG BẮT BUỘC / được chủ dự án miễn
  yêu cầu (2026-10-22)**; không ghi NOT_RUN như một điều kiện chặn
  phát hành. Chữ ký engine/manifest và cập nhật vẫn theo chính sách
  xác minh nguồn, độc lập với chữ ký file cài.
