# Agent R14 (Wave R) — Kiểm toán tuyên bố hướng khách hàng (Mục 11 + Mục 16)

- Nhánh: `agent-r14/claims-audit`, base `f280296` (đã xác minh HEAD khi clone).
- Phạm vi đã quét toàn bộ: `src/ui/**` (JS + index.html), `docs/customer-guide/**`,
  `docs/seller-runbook/**`, `README.md`, `package.json` (description + build/NSIS),
  nhãn của bảng kiểm tiêu chí (`criteriaChecklist.js` + `criteriaChecklistProvider.js`),
  cộng thêm `src/monitor/warningService.js`, `src/health/autoIpWarnings.js`,
  `bin/lhm-cli.js`, `tools/extract-signed-engine.ps1`, `main.js`, `preload.js`.
- Xác định mặt "giao cho khách": `package.json > build.files` LOẠI `!README.md`,
  `!docs/**`, `!TIEU-CHI-SAN-PHAM.md` khỏi gói cài — README và tài liệu là bề mặt
  công khai/hướng khách ngoài gói cài; chữ trong `src/ui` là bề mặt trong ứng dụng.
- Phương pháp: grep theo họ pattern của Mục 11 (phần trăm, tuyệt đối, bảo chứng,
  tên đối thủ, "an toàn để chạy Ads", kết luận tổng hợp kiểu Mục 16, trạng thái
  CHƯA ĐO trình bày như trạng thái tốt), sau đó ĐỌC NGỮ CẢNH từng hit. Mọi hit
  đều được phân loại dưới đây; không hit nào bị bỏ qua lặng lẽ.

## A. Phát hiện vi phạm / lệch trung thực

Số dòng tính tại base `f280296`. "ĐÃ SỬA" = đã sửa trong nhánh này;
"ĐỀ XUẤT" = chỉ đề xuất chuỗi thay thế, không tự sửa (lý do ghi rõ).

| # | File:dòng | Chuỗi trích nguyên văn | Quy tắc | Mức | Xử lý |
|---|-----------|------------------------|---------|-----|-------|
| F1 | README.md:5 | "chạy 100% cục bộ (Local-First), **không giới hạn số lượng profile, miễn phí vĩnh viễn**" | §11.4 (tuyệt đối "100%", "vĩnh viễn") + mâu thuẫn thực tế code: bản thử 30 ngày/tối đa 10 hồ sơ, gói trả phí có trần `maxProfiles` (src/licensing/enforcement.js) | CAO | ĐÃ SỬA: header viết lại — local-first + dữ liệu lưu trên máy người dùng, nêu rõ thử 30 ngày/10 hồ sơ và gói license; bỏ mọi tuyệt đối |
| F2 | README.md:11–18 | Bảng so sánh "AdsPower truyền thống" vs "**PowerBrowser**": "2-5 profile (Bản Free) / Trả phí đắt", "Đẩy lên Cloud AdsPower", "Kháng phát hiện: Dễ bị quét qua CDP", "Không giới hạn (Vĩnh viễn)", "0đ - Hoàn toàn miễn phí" | §11.2 (khẳng định về đối thủ chưa tự kiểm chứng: giá/giới hạn/cloud/CDP của AdsPower) + §11.4 + tên sản phẩm cũ "PowerBrowser" (sản phẩm là LHM Ads Browser) + lặp lại mâu thuẫn license của F1 | CAO | ĐÃ SỬA: xóa toàn bộ bảng so sánh đối thủ; thay bằng danh sách "Tính năng và giới hạn" chỉ nói về chính LHM, mọi mục truy được về code/tài liệu |
| F3 | README.md:49 | "Bạn có thể dùng lại **toàn bộ** script viết cho AdsPower mà không cần đổi logic" | Lệch thực tế (họ §11): API chỉ là **tập con** tương thích cú pháp (chính README ở dòng khác và server.js đều nói tập con); "toàn bộ... không cần đổi logic" hứa tương thích drop-in đầy đủ | TRUNG BÌNH | ĐÃ SỬA: "Với các endpoint thuộc tập con đã hỗ trợ, script viết cho AdsPower có thể dùng lại mà không cần đổi logic gọi API. Endpoint ngoài tập con sẽ báo lỗi rõ ràng thay vì chạy ngầm" |
| F4 | README.md (mục chạy từ mã nguồn) | `cd D:\power-browser` | Tên cũ "power-browser" còn sót trong ví dụ (lệch nhận diện, không phải tuyên bố) | THẤP | ĐÃ SỬA thành `D:\lhm-ads-browser` |
| F5 | docs/customer-guide/01-cai-dat-va-kich-hoat.md:17–19 | "Windows SmartScreen có thể hiện cảnh báo với bản cài chưa có chứng chỉ ký số Authenticode. Hãy đối chiếu nguồn tệp với bên bán trước khi bấm chạy; đừng tải bản cài từ nguồn không rõ." | Thiếu bước thao tác bắt buộc theo quyết định đã chốt của chủ dự án (phát hành KHÔNG ký Authenticode): khách gặp màn hình xanh chỉ có nút "Don't run" mà tài liệu không nói cách đi tiếp (More info → Run anyway) — khe hở trung thực/vận hành trên đúng đường cài đặt chính thức | TRUNG BÌNH | ĐỀ XUẤT cho R7 (chủ file customer-guide) — chuỗi đề xuất ở mục B.1 |
| F6 | src/ui/proxyCenter.js:83, 93–94 | Badge trạng thái kiểm tra thất bại: `'Không xác minh'`; thông báo lỗi: `'Chưa xác minh được IP: ...'` | Chính xác trạng thái (họ §16): kiểm tra ĐÃ CHẠY và không đạt bị ghi cùng nhãn với trạng thái chưa kiểm tra ('Chưa kiểm tra' ở cùng hàm) — gộp "đã đo, không đạt" với "chưa đo" | THẤP | ĐỀ XUẤT (không tự sửa: chuỗi UI có test ghim ở các đợt trước; để coordinator/R-chủ-UI áp cùng lúc với test) — chuỗi đề xuất ở mục B.2 |
| F7 | package.json:2 | `"name": "power-browser"` | Tên gói nội bộ còn mang tên cũ; không hiển thị cho khách (productName là "LHM Ads Browser") nhưng là lệch nhận diện trong metadata | THẤP | ĐỀ XUẤT cho coordinator: đổi tên gói cần đổi kèm package-lock.json và kiểm tra đường dữ liệu Electron — không tự đổi trong nhánh audit |

## B. Chuỗi thay thế đề xuất (cho các mục ĐỀ XUẤT)

### B.1 — F5, cho R7 chèn vào docs/customer-guide/01, thay đoạn lưu ý SmartScreen hiện tại

> Lưu ý thực tế: bản cài hiện tại chưa có chứng chỉ ký số Authenticode,
> nên ở lần chạy đầu Windows SmartScreen sẽ hiện màn hình "Windows
> protected your PC". Đây là cảnh báo vì nhà phát hành chưa có chứng
> chỉ, không phải thông báo phát hiện mã độc. Sau khi đã đối chiếu tệp
> với bên bán (đúng tên tệp; đối chiếu mã SHA-256 nếu bên bán cung
> cấp), bấm **More info** rồi **Run anyway** để cài tiếp. Không tải
> bản cài từ nguồn không rõ và không tắt SmartScreen để cài.

### B.2 — F6, cho src/ui/proxyCenter.js

- Badge khi kiểm tra đã chạy và không đạt: `'Không xác minh'` → `'Kiểm tra không đạt'`
  (giữ `'Chưa kiểm tra'` cho trạng thái chưa chạy, `'Đã xác minh'` cho đạt).
- Thông báo tương ứng: `'Chưa xác minh được IP: '` → `'Kiểm tra IP không đạt: '`.

## C. Các điểm đã đọc kỹ và KẾT LUẬN ĐẠT (không sửa)

Đây là phần lớn bề mặt. Ghi lại để freeze không phải tranh luận lại:

1. **Bảng kiểm tiêu chí** (`criteriaChecklist.js`): nhãn đúng ba trạng thái
   ĐẠT / KHÔNG ĐẠT / CHƯA ĐO; mặc định toàn CHƯA ĐO; banner hiển thị thật
   "Không có kết luận tổng hợp: mỗi tiêu chí dưới đây được đọc riêng theo
   bằng chứng của nó" — đúng §16. Dữ liệu mẫu ghi rõ là mẫu ở mọi dòng.
2. **Provider bảng kiểm** (`criteriaChecklistProvider.js`): từ chối suy ĐẠT từ
   dữ liệu gộp toàn đội và từ lỗi thu thập, trích dẫn lý do §16 ngay trong
   văn bản cho khách — mẫu mực.
3. **Dashboard** (`dashboard.js`): vòng tỉ lệ là tỉ lệ ĐẾM hồ sơ không lỗi/
   cảnh báo trên tổng số (số liệu cục bộ đo được), kèm dòng chữ hiển thị
   "Không đo khả năng Google nhận diện tài khoản".
4. **Health Drift** (`maintenance.js:222–223`): hai con số % là tỉ lệ lỗi ĐO
   ĐƯỢC từ mẫu kiểm tra đã lưu (recent vs baseline), kèm câu giới hạn
   "Chỉ là dữ liệu vận hành của LHM, không phản ánh thuật toán Google" —
   đúng mẫu §11.1 (có phép đo + phương pháp + giới hạn).
5. **Hộp thoại nguồn engine** (`index.html:545–568` + `engineSource.js`): nhãn
   "Bundled · Bộ engine đi kèm đã xác minh" đi kèm đoạn giải thích chỉ mở khi
   chữ ký manifest + SHA-256 khớp và dòng trạng thái trực tiếp ngay dưới;
   ghi chú Camoufox liệt kê rõ phần CHƯA xác minh (DNS/WebRTC, GeoIP, Studio).
6. **Proxy Center**: nhãn "Đã xác minh IP trong phiên" là nhãn theo phiên,
   có IP thoát quan sát thật đứng sau; trạng thái chưa kiểm tra ghi
   "Chưa kiểm tra" (chỉ còn điểm F6 ở trên).
7. **docs/customer-guide** (ngoài F5): các hit pattern đều là câu giới hạn/
   phủ định đúng kỷ luật — trang 07 là trang "không hứa" mẫu mực; FAQ 06:137
   dùng đúng nguyên văn câu được phép duy nhất của §15 về tạo Gmail;
   01 §1.2 ghi thử "30 ngày / tối đa 10 hồ sơ / hồ sơ + Automation + API"
   — R14 đã đối chiếu `TRIAL_FEATURES = ['profiles','automation','api']`
   trong enforcement.js: KHỚP.
8. **docs/seller-runbook**: các hit là câu kỷ luật nội bộ cho người bán
   (kể cả dòng trích dẫn chính các cụm bị cấm để cấm dùng).
9. **warningService / autoIpWarnings / behaviorPatterns**: 0 hit pattern
   tuyệt đối/bảo chứng; cảnh báo theo định dạng bằng chứng §22.
10. **appIdentity.js**: phiên bản lấy từ runtime Electron (không nhãn tay),
    nhãn license là trạng thái thực ("Dùng thử · N ngày còn lại").
11. **package.json**: description trung tính, không tuyên bố hiệu quả;
    artifactName mang "-Preview-" — hiện ĐÚNG sự thật (xem mục D).

## D. FREEZE-VERIFY — nhãn "Preview" (chưa phải vi phạm, bắt buộc đối chiếu khi đóng băng)

Tại base, mọi chỗ "Preview" đều ĐÚNG sự thật (Gate 3/4 chưa qua):
`package.json:96` artifactName; `docs/customer-guide/README.md:7–8`;
`docs/customer-guide/01:5`; `docs/customer-guide/06:37`;
`docs/customer-guide/07:111,118`; `docs/seller-runbook/README.md:126,145`.
Khi chủ dự án quyết định phát hành chính thức, các chỗ này phải đổi **đồng bộ
cùng quyết định đó** — script ở mục E in lại danh sách này mỗi lần chạy.
(Lưu ý: "Preview the exact targets" trong README là động từ xem trước, không
phải nhãn phát hành.)

## E. Script quét lặp lại — tools/claims-scan.mjs

- Chạy: `node tools/claims-scan.mjs` (tùy chọn `--root <dir>`).
- Quét: `src/ui/**` (js/html), `docs/customer-guide/**`, `docs/seller-runbook/**`,
  `README.md`, `package.json`.
- Kết quả trên nhánh này sau khi sửa: **0 BLOCK chưa phân loại**, 9 REVIEW
  (toàn bộ là phát biểu tương thích tập con / "parity NOT achieved" đã kiểm
  ở mục C, cộng 1 dòng sổ tay người bán trích dẫn quy tắc cấm), danh sách
  FREEZE như mục D. Mã thoát 0.
- Cơ chế: pattern BLOCK chạm dòng nào không có mục allowlist (file + chuỗi
  con + lý do con người đã kiểm, khai báo ngay trong script) là fail (exit 1).
  Thêm câu chữ marketing mới chạm pattern = phải có người phân loại mới qua —
  đúng chủ đích §11. REVIEW không fail nhưng in ra để đối chiếu phép đo
  tại freeze.
- Đề xuất wiring cho coordinator: chạy script này như một bước trong
  checklist đóng băng phát hành (cùng lúc với FREEZE-VERIFY ở mục D).
  R14 không tự thêm vào chuỗi `npm test` (file dùng chung, thuộc coordinator).
  `tools/**` bị loại khỏi gói cài nên script không đi theo sản phẩm.

## F. Tệp thay đổi trong nhánh này

- `README.md` — sửa F1, F2, F3, F4 (chỉ header + câu RPA + đường dẫn ví dụ;
  phần ghi chú phát hành phía dưới giữ nguyên vì đã đạt, xem mục C).
- `tools/claims-scan.mjs` — mới (mục E).
- `docs/agents/agent-r14/INTEGRATION-NOTES.md` — file này.

Không sửa: docs/customer-guide (của R7 — F5 là đề xuất), package.json
(F7 là đề xuất cho coordinator), src/ui/proxyCenter.js (F6 là đề xuất).
Không push/merge/tag.
