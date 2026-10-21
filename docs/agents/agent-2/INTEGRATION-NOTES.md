# INTEGRATION NOTES — Agent 2 (Nguồn Engine) → Agent điều phối

Nhánh: `agent-2/engine-source` từ nền `8349f38`. Agent 2 không sửa
`package.json`, `main.js`, `preload.js`, `index.html`, `.github/**`.
Các đề xuất dưới đây cần điều phối áp dụng.

## 1. package.json — nối test mới vào chuỗi `npm test`

Thêm vào chuỗi test (đề xuất đặt ngay sau `node test/camoufox-download.js`):

```
node test/camoufox-engine-source-hardening.js
```

Test này tự chứa (khóa test tự sinh trong thư mục tạm, không cần
node_modules ngoài stdlib, không cần Windows) và khóa các hành vi:
tách khóa publisher/license ở công cụ ký + install service, loại khóa
riêng tư khỏi gói engine (cả khi ký và khi verify), và các đường từ
chối của `validateRelease` / `downloadPinned` / `loadCamoufoxPublisherKey`
vốn chưa có test.

## 2. main.js — truyền `licenseKey` cho CamoufoxInstallService

`CamoufoxInstallService` nay nhận tùy chọn `licenseKey` và tự từ chối
nếu khóa publisher trùng khóa license (phòng thủ nhiều lớp theo Mục 8).
Đề xuất tại chỗ khởi tạo trong `main.js` (hiện khoảng dòng 751):

```js
camoufoxInstall=new CamoufoxInstallService(storageDir,{
  publicKey:publisherKey,
  licenseKey:LICENSE_PUBLIC_KEY,
  ...
});
```

Hành vi hiện tại không đổi (việc so trùng đã có ở
`loadCamoufoxPublisherKey`), thay đổi này chỉ khiến service tự bảo vệ
kể cả khi một caller tương lai nạp khóa từ nguồn khác.

## 3. Câu hỏi chính sách còn mở — khóa ký cho bundled Chromium

Sau sửa đổi của Agent 2: `tools/sign-bundled-engine.js` bắt buộc khóa
publisher riêng cho Camoufox. Riêng đường **bundled Chromium** khi
không truyền file khóa publisher vẫn giữ fallback cũ (kỳ vọng khóa
license) vì `BundledEngineManager` ở `main.js` hiện được khởi tạo với
khóa mặc định là khóa license và chữ ký có domain separation
(`LHM_BROWSER_ENGINE_BUNDLE_V1`).

Đây là khác biệt cần chủ dự án/điều phối quyết, Agent 2 không tự đổi:
- Phương án A (khuyến nghị theo Mục 8): cấp một publisher key riêng
  cho cả bundled Chromium — cần sửa mặc định trong
  `bundledEngineManager.js`/`main.js` và quy trình phát hành.
- Phương án B: ghi nhận ngoại lệ có chủ đích cho bundled Chromium
  (domain separation thay cho tách khóa) vào tài liệu phát hành
  `docs/BUNDLED_ENGINE_RELEASE.md`.

Trạng thái hiện tại của điểm này: **CHƯA ĐO / chưa quyết** — không
được diễn giải việc Camoufox đã tách khóa thành "mọi engine đã tách
khóa".

## 4. Ranh giới script staging CI (không cần sửa)

`tools/stage-camoufox-upstream-smoke.ps1` kiểm chứng bằng digest ghim
của asset upstream, không có manifest ký publisher. Giữ nguyên ranh
giới đã ghi trong MAPPING.md hàng 9: chỉ dùng cho smoke trên runner;
không bao giờ dùng làm nguồn cho đường cài đặt sản phẩm.

## 5. Điều kiện nghiệm thu còn thiếu (NOT_RUN, cần chủ dự án)

- Publisher key production + bản phát hành Camoufox do LHM ký thật:
  chưa tồn tại trong repo → kiểm chứng chữ ký trên release thật =
  NOT_RUN.
- Cài đặt end-to-end trên Windows (PowerShell extract + EXE thật):
  NOT_RUN tại máy Linux này; phần Windows của `test/camoufox-install.js`
  tự bỏ qua ngoài win32.
