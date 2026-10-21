# HỒ SƠ QUYẾT ĐỊNH QD-02 — Khóa ký engine Chromium đóng gói vẫn dùng khóa license làm dự phòng

- **Trạng thái:** CHỜ CHỦ DỰ ÁN QUYẾT ĐỊNH. Văn bản này là hồ sơ chuẩn bị quyết định, không phải quyết định.
- **Người soạn:** Agent 19 (đợt thương mại hoá), 2026-10-21.
- **Nền kiểm chứng:** nhánh `integration/v5.8-phase-c` @ `07150d6`.

## 1. Bối cảnh — sự thật đã kiểm chứng và nguồn

1. Hiến pháp Mục 8 quy định về cài đặt engine: kiểm tra "manifest ký Ed25519
   **bằng khóa publisher riêng (không dùng khóa license)**".
   Nguồn: `TIEU-CHI-SAN-PHAM.md` Mục 8.
2. Đường Camoufox **đã được sửa xong ở đợt 10 agent** (Agent 2): công cụ ký
   bắt buộc file khóa publisher riêng qua `LHM_ENGINE_PUBLISHER_KEY_FILE`,
   từ chối khóa publisher trùng khóa license cho mọi engine; service cài đặt
   tự phòng thủ (nhận `licenseKey` và tự từ chối nếu trùng) — điều phối đã
   nối `licenseKey: LICENSE_PUBLIC_KEY` vào `main.js` ở Đợt C.
   Nguồn: `tools/sign-bundled-engine.js:52-61`; `docs/agents/agent-2/`
   (MAPPING.md, INTEGRATION-NOTES.md); commit tích hợp `07150d6`.
3. Đường **Chromium đóng gói vẫn giữ dự phòng khóa license** ở cả hai đầu:
   - Đầu ký: khi không truyền file khóa publisher và engine không phải
     Camoufox, công cụ ký gán `expectedKey = LICENSE_PUBLIC_KEY` — nghĩa là
     người phát hành ký gói Chromium **bằng khóa riêng của license**.
     Nguồn: `tools/sign-bundled-engine.js:62-64`.
   - Đầu kiểm chứng (runtime trong ứng dụng): `BundledEngineManager` mặc
     định dùng `publicKey = PUBLIC_KEY` lấy từ module licensing, và
     `main.js` khởi tạo manager mà không ghi đè khóa này.
     Nguồn: `src/engine/bundledEngineManager.js:10,139`;
     `main.js:788,829`.
4. Biện pháp giảm nhẹ hiện có: chữ ký manifest engine được **tách miền**
   (domain separation) bằng hằng số `LHM_BROWSER_ENGINE_BUNDLE_V1` — chữ ký
   gói engine không thể dùng lại làm token license và ngược lại.
   Nguồn: `src/engine/bundledEngineManager.js:4,13`.
5. Trạng thái phát hành hiện tại: **chưa tồn tại khóa publisher production
   và chưa có bản phát hành engine nào được ký thật** trong dự án (Agent 2
   ghi NOT_RUN cho kiểm chứng chữ ký trên release thật vì điều kiện này
   chưa tồn tại). Nghĩa là hiện chưa có gói Chromium ký bằng khóa license
   nào đang lưu hành để phải thu hồi/tương thích ngược.
   Nguồn: `docs/agents/agent-2/INTEGRATION-NOTES.md` mục 5.
6. Agent 2 đã để câu hỏi này mở với hai phương án (A: cấp publisher key
   riêng cho cả Chromium — ghi là "khuyến nghị theo Mục 8"; B: ghi nhận
   ngoại lệ) và cảnh báo rõ: trạng thái điểm này là "CHƯA ĐO/chưa quyết —
   không được diễn giải thành 'mọi engine đã tách khóa'".
   Nguồn: `docs/agents/agent-2/INTEGRATION-NOTES.md` mục 3.

**Điểm cốt lõi:** đây không phải lỗi bảo mật đang hoạt động (tách miền đã
chặn việc dùng chéo chữ ký), mà là vấn đề *bán kính thiệt hại của khóa
license*: khóa riêng license là khóa cấp mọi license cho khách hàng. Mỗi lần
dùng nó trong quy trình ký phát hành (máy của người phát hành, tần suất theo
đợt release) là thêm một lần khóa tối quan trọng phải xuất hiện ngoài nơi
lưu trữ phát hành license. Nếu khóa này lộ, cả hai hệ thống cùng sập: kẻ có
khóa vừa tự cấp license vừa ký được gói engine mà ứng dụng tin tưởng.

## 2. Các lựa chọn

### Lựa chọn 1 — Cấp khóa publisher riêng cho cả Chromium (bỏ hẳn dự phòng khóa license)

- Nội dung: sinh MỘT cặp khóa publisher (dùng chung cho cả Camoufox và
  Chromium đều thỏa mãn chữ của Mục 8 — điều Hiến pháp cấm là dùng khóa
  *license*, không đòi mỗi engine một khóa publisher riêng); công cụ ký bắt
  buộc file khóa publisher cho mọi engine (xóa nhánh dự phòng); runtime nạp
  khóa publisher cho `BundledEngineManager` theo đúng mẫu đã có ở đường
  Camoufox (`loadCamoufoxPublisherKey`).
- Hệ quả kỹ thuật: sửa vừa ở 3 điểm (công cụ ký, `bundledEngineManager.js`/
  `main.js`, tài liệu phát hành `docs/BUNDLED_ENGINE_RELEASE.md`) + mở rộng
  test khóa cứng. Mọi gói Chromium ký từ nay dùng khóa publisher.
- Hệ quả thương mại/vận hành: quy trình phát hành có thêm một nghi thức
  khóa (sinh khóa publisher production một lần, lưu khóa riêng ngoài repo,
  ngoài máy đóng gói thường ngày). Vì hiện **chưa có release ký thật nào**,
  chi phí chuyển đổi lúc này gần như bằng không; sau khi đã phát hành bản
  ký thật đầu tiên, lựa chọn này sẽ đắt hơn nhiều (phải ký lại + phát hành
  lại gói engine, ứng dụng cũ không kiểm chứng được gói mới nếu đổi khóa
  kiểm chứng).

### Lựa chọn 2 — Ghi nhận ngoại lệ chính thức vào Hiến pháp

- Nội dung: giữ nguyên code; chủ dự án sửa Mục 8 (theo Mục 13.3, chỉ chủ dự
  án sửa Hiến pháp) thêm điều khoản ngoại lệ cho bundled Chromium, nêu rõ:
  cho phép ký bằng khóa license với điều kiện bắt buộc giữ tách miền chữ ký
  `LHM_BROWSER_ENGINE_BUNDLE_V1`, và ghi rõ đây là ngoại lệ có chủ đích kèm
  lý do.
- Hệ quả kỹ thuật: không sửa code, không thêm nghi thức khóa; quy trình
  phát hành giữ nguyên như hiện tại.
- Hệ quả thương mại/vận hành: Hiến pháp và code khớp nhau (hết trạng thái
  "chưa quyết"). Nhưng ngoại lệ hợp thức hoá vĩnh viễn việc khóa license
  xuất hiện trong quy trình ký engine; bán kính thiệt hại khi lộ khóa giữ
  nguyên ở mức tối đa. Về phát ngôn (Mục 11): từ nay không bao giờ được
  tuyên bố chung "khóa ký engine tách khỏi khóa license" — chỉ được nói
  riêng cho đường Camoufox. Kinh nghiệm của chính dự án này cho thấy ngoại
  lệ ghi trong tài liệu rất dễ bị các đợt làm việc sau quên mất (Agent 2 đã
  phải cảnh báo tường minh trong báo cáo của mình).

## 3. Khuyến nghị của Agent 19 (khuyến nghị — KHÔNG phải quyết định)

**Khuyến nghị Lựa chọn 1**, với một khóa publisher duy nhất dùng cho cả hai
engine. Lý do:

1. Đây là thời điểm rẻ nhất trong toàn bộ vòng đời sản phẩm để làm việc
   này: chưa có khóa production, chưa có release ký thật, chưa có khách
   hàng nào phải tương thích ngược (sự thật §1.5 ở trên). Mọi lý do "để
   sau" đều làm lựa chọn này đắt lên.
2. Mục 8 đã chốt nguyên tắc "khóa publisher riêng (không dùng khóa
   license)" cho đường cài đặt engine; đường Chromium hiện là nửa còn lại
   chưa khớp với chính nguyên tắc đó. Ngoại lệ (Lựa chọn 2) là sửa Hiến
   pháp để hợp thức hoá code — đúng thủ tục theo Mục 13.3 nhưng đi ngược
   hướng với quyết định kiến trúc đã chốt.
3. Tách miền chữ ký (điểm §1.4) là biện pháp giảm nhẹ tốt nhưng xử lý vấn
   đề khác (dùng chéo chữ ký), không xử lý vấn đề lộ khóa: một khóa lộ là
   cả hai hệ thống cùng mất.
4. Khuyến nghị này trùng với khuyến nghị độc lập của Agent 2 (phương án A
   trong ghi chú tích hợp của Agent 2) — hai đợt rà soát riêng biệt cùng
   tới một kết luận.

## 4. Câu quyết định cần chủ dự án trả lời

**Với việc ký gói engine Chromium đóng gói, chủ dự án chọn Lựa chọn 1 (cấp một khóa publisher riêng dùng cho cả hai engine, bỏ dự phòng khóa license) hay Lựa chọn 2 (giữ nguyên code và ghi nhận ngoại lệ chính thức vào Mục 8 của Hiến pháp)?**

## 5. Việc xảy ra sau khi quyết

| Nếu chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án | Sinh cặp khóa publisher production (Ed25519) một lần, lưu khóa riêng ngoài repo theo đúng kỷ luật khóa phát hành license hiện có; công bố khóa công khai vào repo qua điều phối | ~30 phút, một lần duy nhất |
| 1 | Agent engine (đợt sau) | Xóa nhánh dự phòng khóa license trong `tools/sign-bundled-engine.js`; nạp khóa publisher cho `BundledEngineManager` trong `main.js`; cập nhật `docs/BUNDLED_ENGINE_RELEASE.md`; mở rộng test khóa cứng cho đường Chromium; ghi trạng thái "đã tách khóa cho mọi engine" có bằng chứng test | ~0,5–1 ngày agent |
| 2 | Chủ dự án | Tự sửa Mục 8 theo Mục 13.3: thêm điều khoản ngoại lệ + lý do + điều kiện tách miền bắt buộc; điều phối ghi quyết định vào hồ sơ phát hành và đóng câu hỏi chính sách của Agent 2 | ~30 phút soạn thảo + ghi chép |
| 2 | Điều phối | Cập nhật câu chữ mọi tài liệu liên quan để không tuyên bố tách khóa chung (chỉ nói riêng đường Camoufox) | ~1 giờ |
