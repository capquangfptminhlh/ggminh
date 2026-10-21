# INTEGRATION NOTES — Agent 4: Đo WebGL (đợt thương mại hoá)

Nền: `07150d6` (nhánh tích hợp đợt trước). File chung (package.json,
main.js, preload.js, index.html, .github/**) KHÔNG bị sửa — mọi đề
xuất nối dây nằm trong tài liệu này cho điều phối. (File
INTEGRATION-NOTES.md ở gốc repo là của Agent 5 đợt trước — giữ nguyên.)

## 1. Sản phẩm của agent này

- `stage0-measure/run-webgl.js` — runner đo WebGL mới: thử ma trận tổ
  hợp tạo context trên engine thật, chạy đầu đo mở rộng của Agent 5
  (`extendedProbe`/`summarizeProbe` trong `stage0-measure/core.js`,
  dùng nguyên không sửa) cho 2 danh tính ghim, so kỳ vọng bằng
  `webglExpectationResult` (dùng nguyên không sửa). Mã thoát: 0 = đã
  đo xong (khớp hay lệch đều là phát hiện); 2 = NOT_RUN.
- `stage0-measure/agent4-webgl-results.json` — kết quả chạy thật đầy
  đủ (ma trận tổ hợp, từng điểm đo, so kỳ vọng, quan sát chéo).

## 2. Kết quả chính (chi tiết trong báo cáo bàn giao + JSON)

- Headful dưới Xvfb, **không cần cờ/pref phụ nào**, đã tạo được
  WebGL2 context. Headless thuần (cấu hình của đợt trước) tái hiện
  đúng NOT_RUN; headless + pref `webgl.force-enabled` cũng tạo được
  context.
- Cả 5 điểm WebGL (Mục 4.3) đều MEASURED cho cả 2 hồ sơ. So kỳ vọng:
  đúng **2 trường so được** mỗi hồ sơ (webglVendor, webglRenderer —
  toàn bộ trường mà `webglExpectationResult` định nghĩa) và **cả 2
  đều khớp** cho cả 2 hồ sơ: mỗi hồ sơ phơi bày đúng vendor/renderer
  của danh tính đã ghim của chính nó qua một context thật.
- Tham số WebGL: 9/12 đo được; 3 trường không truy cập được
  (maxViewportDims, aliasedPointSizeRange, aliasedLineWidthRange) —
  ghi là unavailable theo Mục 18, không suy diễn.

## 3. Đề xuất cho điều phối (package.json — file của điều phối)

Thêm script (KHÔNG đưa vào chuỗi `npm test` vì runner cần engine
thật + Xvfb + danh tính đã sinh — thuộc cổng lab/CI Windows):

```
"stage0:webgl": "node stage0-measure/run-webgl.js"
```

Điều kiện chạy: sinh 2 danh tính trước bằng
`tools/generate-camoufox-identity.mjs` (cơ chế chính thức), rồi chạy
runner dưới `xvfb-run -a` trên Linux hoặc trực tiếp trên Windows.

## 4. Văn bản ĐỀ XUẤT cập nhật Mục 4.3 (chủ dự án quyết — Mục 13; agent KHÔNG tự sửa Hiến pháp)

Cột trạng thái 5 hàng WebGL hiện ghi "Có trong danh tính D1; CHƯA có
đầu đo" / "CHƯA ĐO". Đề xuất thay bằng (giữ nguyên cột quan sát/xử lý):

- WebGL vendor + renderer: "Có trong danh tính D1; ĐÃ ĐO trên engine
  thật (Linux, GL phần mềm qua Xvfb): 2/2 trường kỳ vọng khớp cho 2
  danh tính ghim — bằng chứng agent4-webgl-results.json trên nhánh
  agent-4/webgl-measure. Môi trường Windows/GPU thật: CHƯA ĐO."
- WebGL extensions / tham số / độ chính xác shader / hash kết xuất:
  "ĐÃ CÓ đầu đo và đã đo (Linux, GL phần mềm): extensions 15 mục;
  tham số 9/12 (3 trường không truy cập được); shader precision đo
  được; render hash đo được. Chưa có kỳ vọng trong blob danh tính
  cho các điểm này — là quan sát, không phải phép so khớp."

## 5. Quan sát cần điều phối/chủ dự án biết (không phải kết luận đạt/không đạt)

- Vendor/renderer phơi bày đi theo danh tính đã ghim, nhưng các tham
  số cấp thấp (maxTextureSize 8192, maxVertexUniformVectors 4096...)
  là giá trị của ngăn GL thật của máy chủ (phần mềm) — blob danh
  tính không mang kỳ vọng cho tham số. Hàng Mục 4.3 ghi xử lý E "tham
  số phải thuộc cùng một GPU khả tín với vendor/renderer": tính khả
  tín đó chưa có phép kiểm nào; đây là khoảng trống phân tích, ghi
  nhận để quyết sau.
- Hash pixel kết xuất WebGL của 2 hồ sơ BẰNG nhau trong khi hash
  data-URL khác nhau — cùng mẫu đã thấy ở canvas đợt trước (Mục 18):
  đầu ra kết xuất do ngăn GL của máy chủ quyết định. Đây là quan sát
  phía trình duyệt; không kết luận gì về liên kết phía nền tảng.
- NOT_RUN còn lại: WebGL trên Windows/GPU thật (cổng nghiệm thu máy
  Windows); phép đo qua controller của ứng dụng (runner này mở bằng
  playwright-core trực tiếp như Agent 5 đợt trước, không qua
  CamoufoxPlaywrightController).
