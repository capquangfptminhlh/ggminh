# INTEGRATION NOTES — Agent 1 (Đường ống phát hành), đợt thương mại hoá

Nền: commit `07150d6f4e85ed26d26fc1895a811f58b8588a35`, nhánh
`agent-1/release-pipeline`. Agent không sửa file chung; dưới đây là các
diff cụ thể để điều phối áp dụng. Bằng chứng đầy đủ ở
`RELEASE-PIPELINE.md` (gốc repo, file của agent này).

## Diff 1 — Ghim electron-builder vào devDependencies + lockfile

Vấn đề (đã kiểm chứng): builder không có trong `devDependencies`,
`package-lock.json` chứa 0 mục về nó; script `build:win` chỉ ghim lớp
ngoài bằng `npx --yes electron-builder@25.1.8`, cây phụ thuộc của
builder phân giải mới mỗi lần build → hồ sơ Mục 23 không tái hiện được.

`package.json` — devDependencies:

```diff
   "devDependencies": {
-    "electron": "^33.2.1"
+    "electron": "^33.2.1",
+    "electron-builder": "25.1.8"
   },
```

`package.json` — scripts:

```diff
-    "build:win": "npx --yes electron-builder@25.1.8 --win nsis --x64 --publish never",
+    "build:win": "electron-builder --win nsis --x64 --publish never",
```

Lockfile strategy (điều phối chạy đúng một lần trên nhánh tích hợp):
`npm install -D electron-builder@25.1.8` (lệnh này tự cập nhật cả
package.json lẫn package-lock.json một cách nhất quán; diff trên là
kết quả kỳ vọng để đối chiếu), sau đó commit cả hai file. Đã kiểm
chứng ở thư mục scratch: lockfile sinh ra có 350 mục, ghim trọn cây
(gồm `app-builder-bin`, `app-builder-lib`,
`electron-builder-squirrel-windows`...), phiên bản builder ghi đúng
25.1.8. Sau khi áp: CI `windows-exe.yml` **không cần sửa** (đã có
`npm ci` trước `npm run build:win`); máy dev cũng `npm ci` là đủ.
Lưu ý còn lại: builder vẫn tải winCodeSign/NSIS từ
electron-builder-binaries lúc build, nhưng phiên bản các bộ đó do
chính bản builder đã ghim chỉ định (đã quan sát winCodeSign-2.6.0,
nsis-3.0.4.1 với builder 25.1.8) — ghi các số này vào hồ sơ phát hành
theo Mục 5 của RELEASE-PIPELINE.

## Diff 2 — Gọn glob `files` trong package.json → build

Phương án A (khuyến nghị áp ngay; đã kiểm chứng ở mức đóng gói `--dir`
trên commit nền, Linux: 0 mục cấm lọt, đủ file runtime,
`tools/extract-signed-engine.ps1` vẫn là file tools duy nhất và vẫn
vào `app.asar.unpacked` cùng `src/ops/windowControl.ps1`). Thêm các
dòng sau vào mảng `build.files` (sau các dòng loại trừ hiện có; thứ tự
quan trọng — dòng khôi phục `tools/extract-signed-engine.ps1` phải nằm
sau `!tools/**`):

```diff
       "!stage0-measure/**",
-      "!stage0-measure-results/**"
+      "!stage0-measure-results/**",
+      "!docs/**",
+      "!agents/**",
+      "!tools/**",
+      "tools/extract-signed-engine.ps1",
+      "!run.bat",
+      "!README.md",
+      "!TIEU-CHI-SAN-PHAM.md",
+      "!MASTER-MAPPING.md",
+      "!QA-BASELINE.md",
+      "!OPEN-ISSUES.md",
+      "!EVIDENCE-CHECKLIST.md",
+      "!INTEGRATION-NOTES.md",
+      "!INTEGRATION-PLAN.md",
+      "!.github/**"
     ],
```

Căn cứ runtime cho từng dòng: không mã nguồn nào trong
`main.js`/`preload.js`/`src/`/`bin/` đọc `docs/`, `agents/`,
`README.md` hay các file `.md` gốc lúc chạy (đã grep toàn bộ; các
tham chiếu duy nhất là trong chú thích). File tools runtime duy nhất
là `tools/extract-signed-engine.ps1` (`main.js:808`,
`src/engine/camoufoxInstallService.js:113,152`); CI Windows có bước
kiểm chứng file này trong bản đóng gói nên cổng 2 sẽ bắt được nếu
glob làm mất nó. `bin/lhm-cli.js` giữ lại (2 KB, thuộc bề mặt CLI đã
công bố trong scripts). Dung lượng tiết kiệm chỉ ~0,5 MB —
**không** dùng con số này làm luận điểm; lý do là không phát hành tài
liệu nội bộ/QA/Hiến pháp/bản vá chưa áp cho khách hàng.

Phương án B (chặt hơn, CHƯA kiểm chứng — chỉ áp sau một lần CI Windows
xanh): thay toàn bộ mảng `files` bằng allowlist:

```json
"files": [
  "main.js",
  "preload.js",
  "package.json",
  "bin/**",
  "src/**",
  "tools/extract-signed-engine.ps1"
]
```

Lý do cân nhắc B: glob `**/*` chỉ loại trừ đúng thư mục tên `dist`;
trong lần build chẩn đoán của agent này, thư mục output đặt tên khác
(`dist-diag/`) đã bị nuốt trọn 290,8 MB vào asar mà không cảnh báo.
Allowlist loại bỏ hẳn lớp hazard "thư mục lạ ở gốc repo bị phát hành".

## Ghi chú 3 — Chuỗi phiên bản cũ trong tài liệu/chú thích (file không chung, điều phối/chủ dự án tuỳ ý sửa)

- `README.md:626`: "aligned at v5.7.0" → cập nhật theo 5.8.0 hoặc bỏ
  số phiên bản khỏi câu đó.
- `src/ops/windowControl.ps1:1`: chú thích "LHM Ads Browser v3.9" →
  bỏ số phiên bản khỏi header (file này nằm trong gói phát hành).
- `run.bat`: tiêu đề "PowerBrowser OS" — script dev; Diff 2 đã loại
  khỏi gói; có thể xoá/đổi tên hiển thị tuỳ chủ dự án.

## Ghi chú 4 — Icon ứng dụng (cần tài sản của chủ dự án)

Cả hai log build thử đều ghi `default Electron icon is used — reason:
application icon is not set`; repo không có file icon ứng dụng và
`build` không có khóa `icon`. Khi chủ dự án cung cấp icon (`.ico` đa
kích thước, đề xuất đặt `build/icon.ico`), điều phối thêm:

```diff
     "win": {
+      "icon": "build/icon.ico",
       "target": [
```

## Việc agent đã tự kiểm chứng (tóm tắt; chi tiết ở RELEASE-PIPELINE.md Mục 5)

- Build phát hành đúng script trên Linux: FAIL vì thiếu wine ở bước
  ký/sửa exe (sau khi asar tạo xong) — không sinh installer.
- Build chẩn đoán (cấu hình tạm ngoài repo, `signAndEditExecutable=false`):
  sinh đúng tên `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` nhưng chỉ
  là stub 189.191 byte, vẫn FAIL wine ở bước hoàn thiện installer.
  Stub không cài được; không dùng làm bằng chứng nghiệm thu.
- Glob đề xuất (phương án A) ở target `--dir`: PASS.
- Nhất quán phiên bản/appId/tên artifact: đạt, trừ ba lệch tài
  liệu/chú thích ở Ghi chú 3.

## NOT_RUN

- Build NSIS hoàn chỉnh + cài đặt thử: cần CI Windows (chờ push) hoặc
  máy Windows của chủ dự án.
- Áp Diff 1 + Diff 2 rồi chạy lại cổng 2: chờ điều phối/chủ dự án.
- Mọi kết luận nghiệm thu cổng 3–4: ngoài phạm vi agent.
