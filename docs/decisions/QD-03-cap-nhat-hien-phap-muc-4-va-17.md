# HỒ SƠ QUYẾT ĐỊNH QD-03 — Cập nhật Hiến pháp Mục 4 và Mục 17.2 theo kết quả đo của Agent 5/6

- **Trạng thái:** CHỜ CHỦ DỰ ÁN QUYẾT ĐỊNH. Văn bản này là hồ sơ chuẩn bị quyết định, không phải quyết định; **Hiến pháp chưa bị sửa ở bất cứ dòng nào** bởi hồ sơ này.
- **Người soạn:** Agent 19 (đợt thương mại hoá), 2026-10-21.
- **Nền kiểm chứng:** nhánh `integration/v5.8-phase-c` @ `07150d6`; file đối tượng sửa: `TIEU-CHI-SAN-PHAM.md` (bản v1.3, 589 dòng tại nền `8349f38`).

## 1. Bối cảnh — sự thật đã kiểm chứng và nguồn

Theo Mục 13.3 của Hiến pháp, file tiêu chí **chỉ thay đổi theo quyết định
của chủ dự án**; agent chỉ được đề xuất kèm lý do. Ở đợt 10 agent, Agent 5
(đo runtime) và Agent 6 (cách ly dữ liệu) đã đo được thêm một loạt điểm
quét trên engine thật nhưng **không tự sửa Hiến pháp** — cả hai để lại đề
xuất trạng thái dạng chữ, chờ duyệt:

1. **Agent 6** chạy giao thức cách ly mở rộng trên engine Camoufox thật
   (Linux, bản 156.0.1-beta.36) qua đúng controller của ứng dụng
   (`stage0-measure/run-isolation.js`, có trên nhánh tích hợp). Các kết quả
   liên quan tới hồ sơ này: ghi đồng thời + ghi chéo đạt 20/20 **gồm cả
   Service Worker** (loại lưu trữ trước đây chưa từng có đầu đo — 20 checks
   cũ thực chất là 4 trường × 5 điều kiện, hàng "Cache Storage + Service
   Worker — ĐẠT 20/20" ở Mục 4.5 đang gộp hai thứ khác nhau vào một trạng
   thái); HTTP cache và favicon cache đạt phân vùng theo hồ sơ; phép giết
   tiến trình cho thấy **cửa sổ bền ghi của localStorage** (ghi xong giết
   ngay → quay về commit gần nhất; chờ 10 giây → bền; tái hiện 3 lần;
   không có rò rỉ chéo trong mọi lần đo).
   Nguồn: `stage0-measure/INTEGRATION-NOTES.md` mục 3 (đề xuất nguyên văn
   của Agent 6); báo cáo Agent 6 đợt 10 agent.
2. **Agent 5** mở rộng đầu đo runtime từ 9 lên 23 điểm và chạy trên hai
   danh tính ghim bằng engine Camoufox thật (Linux, headless): 13 điểm
   MEASURED, 9 UNSUPPORTED, 1 BLOCKED; phép so WebGL có 0 trường so được
   vì môi trường headless Linux không tạo được WebGL context (NOT_RUN tại
   môi trường này, không phải lệch); canvas cho bằng chứng sống của quy
   tắc chuẩn hoá pixel Mục 18.
   Nguồn: `INTEGRATION-NOTES.md` (gốc repo) mục "Proposed constitution
   Section 4 status updates (NOT applied)" — văn bản trạng thái đề xuất
   nguyên văn của Agent 5; kết quả chạy: `stage0-measure/agent5-linux-run-results.json`.
3. Mọi trạng thái đề xuất dưới đây đều **giới hạn ở môi trường đã đo**
   (Linux, headless, Camoufox 156.0.1-beta.36) và giữ nguyên CHƯA ĐO cho
   Windows — đúng yêu cầu ghi hồ sơ nghiệm thu của Mục 23. Không đề xuất
   nào nâng một điểm lên "ĐẠT toàn cục".

## 2. Văn bản sửa chính xác (diff từng dòng — duyệt là áp nguyên văn được)

Quy ước: dòng bắt đầu `-` là dòng hiện tại trong `TIEU-CHI-SAN-PHAM.md`
v1.3 (trích nguyên văn, đã đối chiếu tại `07150d6`); dòng bắt đầu `+` là
dòng thay thế/thêm mới. Câu chữ trạng thái của Nhóm C lấy nguyên văn từ đề
xuất của Agent 5; của Nhóm A/B lấy theo đề xuất của Agent 6.

### Nhóm A — Mục 4.5 (đề xuất Agent 6)

**A1. Tách hàng "Cache Storage + Service Worker" thành hai hàng:**

```diff
-| Cache Storage + Service Worker | JavaScript | tách theo hồ sơ | ĐẠT (20/20) |
+| Cache Storage | JavaScript | tách theo hồ sơ | ĐẠT (20/20) |
+| Service Worker | JavaScript | tách theo hồ sơ | ĐÃ ĐO cục bộ (Linux, engine thật Camoufox 156.0.1-beta.36, qua stage0-measure/run-isolation.js): đạt ở điều kiện ghi đồng thời, sau giết tiến trình và khôi phục; Windows CHƯA ĐO |
```

**A2. Cập nhật trạng thái ETag / cache HTTP:**

```diff
-| ETag / cache HTTP dùng làm định danh | máy chủ gán + đọc lại | cache thuộc vùng chứa của hồ sơ | CHƯA ĐO |
+| ETag / cache HTTP dùng làm định danh | máy chủ gán + đọc lại | cache thuộc vùng chứa của hồ sơ | ĐÃ ĐO cục bộ (Linux, engine thật, stage0-measure/run-isolation.js điều kiện httpCache): phân vùng cache theo hồ sơ đạt; Windows CHƯA ĐO |
```

**A3. Cập nhật trạng thái Favicon cache:**

```diff
-| Favicon cache (F-Cache) | máy chủ quan sát yêu cầu favicon | thuộc vùng chứa của hồ sơ | CHƯA ĐO |
+| Favicon cache (F-Cache) | máy chủ quan sát yêu cầu favicon | thuộc vùng chứa của hồ sơ | ĐÃ ĐO cục bộ (Linux, engine thật, stage0-measure/run-isolation.js điều kiện faviconCache): mỗi hồ sơ tự tải favicon của mình, không dùng cache của hồ sơ kia; Windows CHƯA ĐO |
```

### Nhóm B — Mục 17.2 (đề xuất Agent 6): thêm một đoạn vào cuối Mục 17.2

Vị trí: ngay sau câu cuối hiện tại của Mục 17.2 ("Không thu thập cookie
đăng nhập thật của khách hàng để chứng minh cách ly."). Văn bản thêm mới
lấy nguyên văn từ đề xuất của Agent 6 (`stage0-measure/INTEGRATION-NOTES.md`
mục 3):

```diff
+Phép thử sau sự cố phải ghi rõ cửa sổ flush (thời gian từ lần ghi cuối tới khi giết tiến trình). Đo được tại engine Camoufox 156.0.1-beta.36: localStorage chỉ bền sau khi engine commit (ghi + reload + giết sau 1,5 giây → quay về trạng thái commit gần nhất; cùng phép thử với 10 giây chờ → bền). Cookie, IndexedDB, Cache Storage, đăng ký Service Worker bền ở cả hai cửa sổ. Đây là tính chất độ bền ghi của engine, không phải rò rỉ chéo: trong mọi lần đo, không dữ liệu nào của hồ sơ này xuất hiện ở hồ sơ kia.
```

### Nhóm C — Mục 4.2 / 4.3 / 4.4 (đề xuất Agent 5)

**C1. Mục 4.2 — các hàng chuyển trạng thái (đã có đầu đo, đã đo trên engine thật):**

```diff
-| Cửa sổ: inner/outer, devicePixelRatio | window | E/G; không được mâu thuẫn với screen | CHƯA ĐO |
+| Cửa sổ: inner/outer, devicePixelRatio | window | E/G; không được mâu thuẫn với screen | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| Định dạng locale (ngày/giờ/số) | Intl.DateTimeFormat/NumberFormat | E, khớp language | CHƯA ĐO |
+| Định dạng locale (ngày/giờ/số) | Intl.DateTimeFormat/NumberFormat | E, khớp language | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| webdriver + dấu hiệu tự động hóa | navigator.webdriver, thuộc tính lạ trên window/document | C/G: không để lộ dấu hiệu của tầng điều khiển khi hồ sơ chạy thường | CHƯA ĐO |
+| webdriver + dấu hiệu tự động hóa | navigator.webdriver, thuộc tính lạ trên window/document | C/G: không để lộ dấu hiệu của tầng điều khiển khi hồ sơ chạy thường | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| plugins, mimeTypes, pdfViewerEnabled | navigator | G (theo engine) | CHƯA ĐO |
+| plugins, mimeTypes, pdfViewerEnabled | navigator | G (theo engine) | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| maxTouchPoints | navigator | E/G khớp loại thiết bị đã khai | CHƯA ĐO |
+| maxTouchPoints | navigator | E/G khớp loại thiết bị đã khai | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| Tín hiệu hiển thị: color scheme, reduced motion, contrast, forced colors | matchMedia | G | CHƯA ĐO |
+| Tín hiệu hiển thị: color scheme, reduced motion, contrast, forced colors | matchMedia | G | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| networkInformation (effectiveType, downlink, rtt, saveData) | navigator.connection | G | CHƯA ĐO |
+| networkInformation (effectiveType, downlink, rtt, saveData) | navigator.connection | G | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| Ước lượng lưu trữ, trạng thái bền lưu trữ | navigator.storage | G; dung lượng không được trùng bất thường giữa hồ sơ | CHƯA ĐO |
+| Ước lượng lưu trữ, trạng thái bền lưu trữ | navigator.storage | G; dung lượng không được trùng bất thường giữa hồ sơ | ĐÃ CÓ đầu đo; đã đo trên engine thật |
```

**C2. Mục 4.2 — các hàng giữ CHƯA ĐO, thêm ghi chú lý do (đầu đo đã xác nhận giới hạn):**

```diff
-| Client Hints: brands, mobile, platform | navigator.userAgentData | E/G theo engine; phải khớp UA | CHƯA ĐO |
+| Client Hints: brands, mobile, platform | navigator.userAgentData | E/G theo engine; phải khớp UA | CHƯA ĐO — đã có đầu đo; Firefox không hỗ trợ API này, còn thiếu đo trên Chromium |
-| Client Hints độ phân giải cao: platformVersion, architecture, bitness, model, fullVersionList, formFactor | getHighEntropyValues | phải khớp UA + platform đã khai | CHƯA ĐO |
+| Client Hints độ phân giải cao: platformVersion, architecture, bitness, model, fullVersionList, formFactor | getHighEntropyValues | phải khớp UA + platform đã khai | CHƯA ĐO — đã có đầu đo; Firefox không hỗ trợ API này, còn thiếu đo trên Chromium |
-| Bố cục bàn phím | navigator.keyboard.getLayoutMap | G | CHƯA ĐO |
+| Bố cục bàn phím | navigator.keyboard.getLayoutMap | G | CHƯA ĐO — Firefox: API không hỗ trợ (đã xác nhận bằng đầu đo) |
-| Pin (chỉ Chromium) | navigator.getBattery | G | CHƯA ĐO |
+| Pin (chỉ Chromium) | navigator.getBattery | G | CHƯA ĐO — Firefox: API không hỗ trợ (đã xác nhận bằng đầu đo); còn thiếu đo trên Chromium |
```

**C3. Mục 4.3 — đồ họa và âm thanh:**

```diff
-| Canvas 2D (hash ảnh kết xuất) | toDataURL/getImageData sau khi vẽ chữ+hình | E; mọi đường xuất phải cho cùng dữ liệu pixel của cùng một bộ danh tính | CHƯA ĐO |
+| Canvas 2D (hash ảnh kết xuất) | toDataURL/getImageData sau khi vẽ chữ+hình | E; mọi đường xuất phải cho cùng dữ liệu pixel của cùng một bộ danh tính | ĐÃ CÓ đầu đo; đã đo trên engine thật (Linux, headless): hai đường xuất khớp sau chuẩn hóa pixel |
-| Số đo chữ (font metrics qua canvas/ DOM) | đo kích thước text | E/G theo bộ danh tính | CHƯA ĐO |
+| Số đo chữ (font metrics qua canvas/ DOM) | đo kích thước text | E/G theo bộ danh tính | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| WebGL vendor + renderer (kể cả bản không che) | getParameter + WEBGL_debug_renderer_info | E | Có trong danh tính D1; CHƯA có đầu đo |
+| WebGL vendor + renderer (kể cả bản không che) | getParameter + WEBGL_debug_renderer_info | E | Có trong danh tính D1; đã có đầu đo; môi trường headless Linux không tạo được WebGL context — cần đo trên Windows/GPU |
-| WebGL: danh sách extensions | getSupportedExtensions | E | CHƯA ĐO |
+| WebGL: danh sách extensions | getSupportedExtensions | E | CHƯA ĐO — đã có đầu đo; chưa đo được trên môi trường headless Linux (không có WebGL context) — cần đo trên Windows/GPU |
-| WebGL: các tham số (kích thước texture, số đơn vị texture, số thuộc tính đỉnh, dải điểm/đường...) | getParameter (hàng chục tham số) | E — phải thuộc cùng một GPU khả tín với vendor/renderer | CHƯA ĐO |
+| WebGL: các tham số (kích thước texture, số đơn vị texture, số thuộc tính đỉnh, dải điểm/đường...) | getParameter (hàng chục tham số) | E — phải thuộc cùng một GPU khả tín với vendor/renderer | CHƯA ĐO — đã có đầu đo; chưa đo được trên môi trường headless Linux (không có WebGL context) — cần đo trên Windows/GPU |
-| WebGL: độ chính xác shader | getShaderPrecisionFormat | E | CHƯA ĐO |
+| WebGL: độ chính xác shader | getShaderPrecisionFormat | E | CHƯA ĐO — đã có đầu đo; chưa đo được trên môi trường headless Linux (không có WebGL context) — cần đo trên Windows/GPU |
-| WebGL: hash ảnh kết xuất 3D | readPixels/toDataURL trên ngữ cảnh WebGL | E | CHƯA ĐO |
+| WebGL: hash ảnh kết xuất 3D | readPixels/toDataURL trên ngữ cảnh WebGL | E | CHƯA ĐO — đã có đầu đo; chưa đo được trên môi trường headless Linux (không có WebGL context) — cần đo trên Windows/GPU |
-| OffscreenCanvas | kết xuất ngoài luồng chính | E như canvas thường | CHƯA ĐO |
+| OffscreenCanvas | kết xuất ngoài luồng chính | E như canvas thường | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| AudioContext: sampleRate, baseLatency, outputLatency, maxChannelCount | ngữ cảnh âm thanh | E | CHƯA ĐO |
+| AudioContext: sampleRate, baseLatency, outputLatency, maxChannelCount | ngữ cảnh âm thanh | E | ĐÃ CÓ đầu đo; đã đo trên engine thật (môi trường không có thiết bị âm thanh) |
-| AudioContext: hash tín hiệu (oscillator + analyser/compressor) | kết xuất âm thanh ngoại tuyến | E | CHƯA ĐO |
+| AudioContext: hash tín hiệu (oscillator + analyser/compressor) | kết xuất âm thanh ngoại tuyến | E | CHƯA ĐO — đã có đầu đo; bị chặn qua đường evaluate (Xray) và treo khi render headless — cần đo lại trên Windows |
```

**C4. Mục 4.4 — fonts, giọng đọc, thiết bị, quyền:**

```diff
-| Danh sách font dò được | đo độ rộng chữ với font ứng viên / Font Loading API | E (bộ font của thiết bị trong danh tính) | CHƯA ĐO |
+| Danh sách font dò được | đo độ rộng chữ với font ứng viên / Font Loading API | E (bộ font của thiết bị trong danh tính) | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| Giọng đọc hệ thống | speechSynthesis.getVoices | E | CHƯA ĐO |
+| Giọng đọc hệ thống | speechSynthesis.getVoices | E | ĐÃ CÓ đầu đo; đã đo trên engine thật |
-| Camera/micro/loa: số lượng, nhãn, id nhóm | enumerateDevices | G/E; số lượng không mâu thuẫn loại thiết bị | CHƯA ĐO |
+| Camera/micro/loa: số lượng, nhãn, id nhóm | enumerateDevices | G/E; số lượng không mâu thuẫn loại thiết bị | ĐÃ CÓ đầu đo; đã đo trên engine thật (nhãn thiết bị rỗng khi chưa cấp quyền) |
-| Trạng thái quyền (thông báo, vị trí, clipboard...) | Permissions API | G | CHƯA ĐO |
+| Trạng thái quyền (thông báo, vị trí, clipboard...) | Permissions API | G | ĐÃ CÓ đầu đo; đã đo trên engine thật |
```

## 3. Các lựa chọn

### Lựa chọn 1 — Duyệt toàn bộ văn bản sửa ở Mục 2 (Nhóm A + B + C)

- Hệ quả: Hiến pháp chuyển v1.3 → v1.4 với cột Trạng thái khớp đúng bằng
  chứng đo hiện có; sổ đăng ký CHƯA ĐO (Mục 4) thu hẹp đúng thực tế:
  bớt 3 hàng "chưa đo oan" ở 4.5, ghi nhận 1 tính chất độ bền mới ở 17.2,
  và ~20 hàng ở 4.2–4.4 phản ánh đúng mức "đã có đầu đo / đã đo cục bộ /
  còn thiếu môi trường đo". Mọi trạng thái mới đều kèm giới hạn môi trường
  trong chính câu chữ, nên không tạo ấn tượng ĐẠT toàn cục.

### Lựa chọn 2 — Duyệt một phần (chỉ rõ nhóm: A, B, hoặc C)

- Hệ quả: các nhóm chưa duyệt giữ nguyên trạng thái cũ — Hiến pháp vẫn
  đúng (trạng thái cũ thận trọng hơn thực tế, không sai lệch theo hướng
  nguy hiểm) nhưng tiếp tục *thiếu* thông tin đã đo được; các đợt làm
  việc sau vẫn phải tra báo cáo của Agent 5/6 thay vì đọc ngay trong Mục
  4 như thiết kế "sổ đăng ký sống" của Hiến pháp. Phù hợp nếu chủ dự án
  muốn tự rà lại một nhóm trước khi ghi.

### Lựa chọn 3 — Không duyệt, giữ nguyên v1.3

- Hệ quả: không rủi ro ghi sai, nhưng Hiến pháp ngày càng lệch khỏi bằng
  chứng: hàng Service Worker tiếp tục mang trạng thái "ĐẠT (20/20)" mà
  phép đo gốc không hề đo nó — đây là loại lệch **theo hướng nguy hiểm**
  (khẳng định quá mức bằng chứng), ngược kỷ luật Mục 11/16. Phát hiện cửa
  sổ commit của localStorage cũng không có nơi ghi chính thức, dễ bị các
  đợt sau diễn giải sai thành lỗi cách ly.

## 4. Khuyến nghị của Agent 19 (khuyến nghị — KHÔNG phải quyết định)

**Khuyến nghị Lựa chọn 1.** Lý do:

1. Cả ba nhóm đều chỉ *ghi lại* kết quả đã đo, với giới hạn môi trường nằm
   ngay trong câu chữ — không có đề xuất nào nâng trạng thái vượt quá bằng
   chứng (điểm nào chưa đo được trên Windows vẫn ghi Windows CHƯA ĐO; điểm
   bị chặn vẫn giữ CHƯA ĐO kèm lý do).
2. Riêng Nhóm A1 là sửa một khẳng định **hiện đang quá mức bằng chứng**
   (Service Worker chưa từng được đo trong 20 checks gốc nhưng đang mang
   nhãn ĐẠT) — để càng lâu, rủi ro bị trích dẫn sai càng lớn.
3. Văn bản đã soạn sẵn dạng diff nguyên văn: chi phí duyệt và áp thấp,
   chi phí của việc không áp là Hiến pháp tiếp tục lệch khỏi thực tế đo —
   đúng điều Mục 4 được thiết kế để tránh (cột Trạng thái là sổ đăng ký
   CHƯA ĐO sống, mọi đợt làm việc phải cập nhật).

## 5. Câu quyết định cần chủ dự án trả lời

**Với bộ văn bản sửa Hiến pháp ở Mục 2 của hồ sơ này, chủ dự án chọn Lựa chọn 1 (duyệt toàn bộ Nhóm A + B + C), Lựa chọn 2 (duyệt một phần — nêu rõ nhóm), hay Lựa chọn 3 (không duyệt, giữ nguyên v1.3)?**

## 6. Việc xảy ra sau khi quyết

| Nếu chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án (hoặc điều phối theo lệnh của chủ dự án — Mục 13.3) | Áp nguyên văn các diff ở Mục 2 vào `TIEU-CHI-SAN-PHAM.md`; đổi nhãn phiên bản v1.3 → v1.4 và ghi dòng lịch sử sửa đổi kèm ngày + số hồ sơ QD-03; commit trên nhánh riêng, giữ dạng chờ gộp như mọi thay đổi khác | ~30–45 phút áp + kiểm tra đối chiếu |
| 2 | Như trên, giới hạn ở nhóm được duyệt | Áp đúng các nhóm được nêu; các nhóm còn lại giữ nguyên và được ghi vào danh sách chờ quyết tiếp theo | ~15–30 phút |
| 3 | Điều phối | Ghi quyết định "không duyệt tại thời điểm này" vào hồ sơ dự án kèm lý do (nếu có); không sửa Hiến pháp | ~10 phút ghi chép |

Lưu ý: việc áp các diff này **không** thay đổi trạng thái cổng nào của Mục
12 — đây là cập nhật sổ đăng ký đo, không phải bằng chứng nghiệm thu mới.
