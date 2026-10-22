# GÓI QUYẾT ĐỊNH TỔNG HỢP CHO CHỦ DỰ ÁN — OWNER-DECISIONS-CONSOLIDATED

- **Trạng thái:** CHỜ CHỦ DỰ ÁN TRẢ LỜI. Văn bản này **chuẩn bị** quyết định,
  không tự nó quyết định điều gì. Mọi khuyến nghị trong đây là khuyến nghị.
- **Người soạn:** Agent R8 (đợt chuẩn bị phát hành — Wave R), 2026-10-22.
- **Nền kiểm chứng:** nhánh `integration/v5.8-phase-c` @ `f280296` (clone
  `agent-r8/decision-pack`). Mọi trích dẫn file/dòng dưới đây đã được đối
  chiếu trực tiếp trên cây này, không sao chép mù từ hồ sơ cũ.
- **Cách dùng:** đọc từng mục (mỗi mục độc lập), rồi trả lời **một lần duy
  nhất** bằng lưới đáp án ở **Mục 12** cuối văn bản — chỉ cần ghi mã mục +
  số lựa chọn, ví dụ: `QD-01=3, QD-02=1, ...`. Mục nào chưa trả lời được thì
  ghi `để sau` — các mục còn lại vẫn được thực thi.
- **Nguồn gốc:** hợp nhất 4 hồ sơ của Agent 19 (`docs/decisions/QD-01..04`),
  4 quyết định D1–D4 của Agent 12 (`docs/agents/agent-12/INTEGRATION-NOTES.md`),
  2 việc F3/F4 của Agent 17 (`agents/agent-17/INTEGRATION-NOTES.md`), hợp
  đồng endpoint echo của Agent 7 (`agents/agent-7/INTEGRATION-NOTES.md`),
  và quyết định Authenticode chủ dự án đã chốt ngày 2026-10-22.

---

## Mục 0 — Kết quả đối chiếu với code hiện tại (đọc trước)

Mỗi hồ sơ gốc được kiểm lại trên cây `f280296`. Ba trạng thái:

| Mã | Tiền đề còn đúng? | Ghi chú |
|---|---|---|
| QD-01 | ✅ Đúng nguyên trạng | `NetworkSafetyCheck.js:17` vẫn trả `PREFLIGHT_ONLY`; `EngineFactory.js:47-55` vẫn bỏ kết quả khi cho qua. |
| QD-02 | ✅ Đúng nguyên trạng | `tools/sign-bundled-engine.js:63` vẫn `expectedKey=LICENSE_PUBLIC_KEY` cho Chromium; `bundledEngineManager.js:10,139` vẫn mặc định khóa license; `main.js:828-830` vẫn không ghi đè khóa. |
| QD-03 | ⚠️ **Đúng một phần — Nhóm C (WebGL) đã cũ** | Các diff Nhóm A, B, C1, C2, C4 vẫn khớp nguyên văn file Hiến pháp (đã đối chiếu §4.5 dòng 157-159, §4.3 dòng 132). Riêng **5 hàng WebGL trong C3 đã bị bằng chứng mới hơn vượt qua**: Agent 4 (đợt thương mại) đã đo được WebGL có hiển thị (Xvfb) sau khi hồ sơ QD-03 được soạn từ dữ liệu headless của Agent 5, và đã đề xuất câu chữ thay thế mới hơn (`agents/agent-4/INTEGRATION-NOTES.md` mục 4). Chi tiết ở Mục 3. |
| QD-04 | 🔴 **Tiền đề chính đã bị sự kiện vượt qua — đã viết lại** | Hồ sơ gốc viết khi nhánh tích hợp "chưa từng được push". Sự thật hiện tại: chủ dự án đã uỷ quyền push; nhánh đã lên GitHub bằng phương thức snapshot (đầu xa `f549a63`), PR #18 (Draft) đã mở, và **CI Windows cho cây Wave 2 đã SUCCESS** (run 39641363889 — build + toàn chuỗi 201 test). Phần còn lại của QD-04 chỉ còn là **áp hai file workflow + duyệt bản sửa bước generate**. Mục 4 dưới đây là bản viết lại theo hiện trạng. |
| D1–D4 (Agent 12) | ✅ Đúng nguyên trạng | `src/update/updateCheck.js` có mặt, test 16/16 đã vào chuỗi 201 bước; **chưa nối dây** (không có IPC `check-for-update` trong `main.js`/`preload.js` — đã grep xác nhận); chưa có `tools/sign-app-update.js`; chưa có khóa production cho cập nhật. |
| F3, F4 (Agent 17) | ✅ Đúng nguyên trạng | Lỗi F1 (purge thiếu 2 gốc dữ liệu) đã sửa (`src/db/store.js:25,259,317`), nhưng purge vẫn **không** chạm `session-snapshots/` và **không** dọn tham chiếu trong `automation-workflows.json`. |
| ECHO (Agent 7) | ✅ Đúng, và phần nối dây đã xong | Điều phối đã nối ở `f280296` (`main.js:695-716`): quan sát runtime chỉ chạy khi `settings.runtimeEchoUrl` là chuỗi khác rỗng; bản ghi checkProxy đã gắn nhãn `source:'manager-process'` (`main.js:716`). Chỉ còn thiếu **chọn endpoint nào**. |
| AUTH (Authenticode) | ✅ **ĐÃ QUYẾT** | Chủ dự án chốt KHÔNG mua ngày 2026-10-22. Xem Mục 10. |

**Phụ thuộc chéo cần biết khi trả lời:**

- **QD-02 → D3:** nếu QD-02 chọn Lựa chọn 1 (một khóa publisher cho cả hai
  engine), phương án rẻ nhất cho D3 là khóa đó ký luôn manifest cập nhật
  (miền ký đã tách, chữ ký không dùng chéo được).
- **QD-02 → buổi lễ khóa production:** QD-02 Lựa chọn 1 là đầu vào của
  nghi thức khóa publisher production (runbook của Agent 13,
  `docs/agents/agent-13/` — OWNER-RUNBOOK).
- **QD-04 → Cổng 2:** QD-04 là mục duy nhất còn chặn phần "đo có cấu hình"
  của Cổng 2. Build/test của Cổng 2 đã PASS; khép QD-04 + chạy lại CI là
  khép Cổng 2.
- **QD-01 → bảng kiểm tiêu chí:** dù chọn lựa chọn nào, tiêu chí
  "network-route" cho hồ sơ direct vẫn giữ CHƯA ĐO cho tới khi có phép đo
  mạng thật (QA-007 vẫn mở, cần lab mạng của chủ dự án).

---

## Mục 1 — QD-01: Hồ sơ Camoufox chạy trực tiếp (direct) qua cổng với mã PREFLIGHT_ONLY

**Hồ sơ gốc:** `docs/decisions/QD-01-qa001-preflight-only-direct.md` (Agent 19).

**Bối cảnh đã kiểm chứng tại `f280296`:**

- `NetworkSafetyCheck.evaluate()` với `proxy.type === 'direct'` trả
  `{safeToLaunch: true, code: 'PREFLIGHT_ONLY', reason: '...network-leak
  safety not certified'}` — `src/engine/NetworkSafetyCheck.js:17`. Đường
  proxy có xác thực bị siết hơn hẳn: thiếu lab được duyệt →
  `NETWORK_BLOCKED`; đủ điều kiện → vẫn chỉ `LAB_PREFLIGHT_ONLY`
  (`NetworkSafetyCheck.js:26`).
- `EngineFactory.launchProfile` chỉ chặn khi `safeToLaunch === false`; mã
  và lý do của preflight **bị bỏ đi**, người dùng không thấy ở đâu trong
  giao diện — `src/engine/EngineFactory.js:47-55`.
- Hiến pháp Mục 19.4: chặn khi điều kiện mạng bắt buộc bị vi phạm; và
  *"thiếu bằng chứng phải báo là thiếu bằng chứng"*. Hồ sơ direct không vi
  phạm điều kiện mạng nào của chính nó (chính sách khai báo của nó *là*
  trực tiếp) — cái thiếu là bằng chứng DNS/WebRTC, và hiện **chưa tồn tại
  phép đo nào** có thể chứng nhận an toàn mạng cho bất kỳ hồ sơ nào
  (QA-007 còn mở).
- Bất nhất quán liên engine: cổng này chỉ nằm trên đường Camoufox; hồ sơ
  Chromium direct không đi qua nó.

**Các lựa chọn:**

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | Giữ nguyên (cho qua, không hiển thị gì) | Không sửa code. Sản phẩm tiếp tục im lặng về một trạng thái CHƯA ĐO quan trọng — ngược định vị "đo được, kiểm chứng được" và kỷ luật Mục 11/19.4. Nếu có sự cố liên đới trên hồ sơ direct, không có bằng chứng người dùng từng được báo. |
| 2 | Siết thành chặn (direct → `NETWORK_BLOCKED` tới khi có phép đo mạng) | Toàn bộ hồ sơ Camoufox direct bị vô hiệu **vô thời hạn** (phép đo cần lab mạng chưa có lịch); giai đoạn kiểm thử Camoufox chỉ còn đường proxy-lab; bất nhất quán với Chromium direct trở nên ngược hẳn (chặn bên này, không cổng bên kia). |
| 3 | **Giữ cho qua + hiển thị cảnh báo rõ cho người dùng** *(khuyến nghị đứng — Agent 19)* | Đưa kết quả preflight (mã + lý do) qua EngineFactory → kết quả mở hồ sơ → UI, kèm ghi nhật ký phiên. Câu chữ đúng sự thật, vd: *"Hồ sơ chạy kết nối trực tiếp. An toàn mạng (DNS/WebRTC) chưa được đo — đây không phải chứng nhận không rò rỉ."* Giữ mọi trường hợp sử dụng hiện tại; thực hành đúng câu "thiếu bằng chứng báo là thiếu bằng chứng". |

**Khuyến nghị đứng:** Lựa chọn **3** (Agent 19) — lựa chọn duy nhất khớp cả
hai câu của Mục 19.4.

**Việc phát sinh theo đáp án:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Điều phối | Ghi quyết định + lý do vào OPEN-ISSUES, đóng QA-001 ở trạng thái "giữ nguyên theo quyết định chủ dự án"; không sửa code | ~15 phút ghi chép |
| 2 | Agent engine (đợt sau) | Đổi nhánh direct trong `evaluate()` thành `blocked(...)`; cập nhật `test/network-safety-fail-closed.js`; câu chữ lỗi theo Mục 22; đóng QA-001 | ~0,5 ngày agent |
| 3 | Agent engine + Agent UI (đợt sau) | Truyền preflight report qua EngineFactory/launcher tới renderer; hiển thị thông báo + ghi nhật ký phiên; cập nhật test fail-closed + test UI; đóng QA-001 | ~0,5–1 ngày agent |

*Mọi lựa chọn: không lựa chọn nào tạo ra phép đo mạng — QA-007 vẫn mở.*

---

## Mục 2 — QD-02: Khóa ký engine Chromium đóng gói vẫn dùng khóa license làm dự phòng

**Hồ sơ gốc:** `docs/decisions/QD-02-khoa-ky-chromium-publisher-rieng.md`
(Agent 19; phương án A của Agent 2 là cùng một khuyến nghị).

**Bối cảnh đã kiểm chứng tại `f280296`:**

- Hiến pháp Mục 8 yêu cầu manifest engine ký Ed25519 **bằng khóa publisher
  riêng (không dùng khóa license)**. Đường Camoufox đã đạt chuẩn này ở đợt
  10 agent (công cụ ký từ chối khóa trùng license; service cài đặt tự phòng
  thủ bằng `licenseKey`).
- Đường **Chromium đóng gói vẫn còn dự phòng khóa license ở cả hai đầu**:
  đầu ký — `tools/sign-bundled-engine.js:63` (`expectedKey =
  LICENSE_PUBLIC_KEY` khi không có file khóa publisher và engine không
  phải Camoufox); đầu kiểm chứng — `src/engine/bundledEngineManager.js:10,139`
  mặc định `publicKey = PUBLIC_KEY` của module licensing, và `main.js:828-830`
  khởi tạo manager không ghi đè.
- Giảm nhẹ hiện có: tách miền chữ ký `LHM_BROWSER_ENGINE_BUNDLE_V1` — chữ
  ký engine không dùng lại làm token license được và ngược lại. Nhưng tách
  miền **không** thu hẹp bán kính thiệt hại khi khóa riêng license bị lộ:
  khóa đó vừa cấp được license vừa ký được gói engine mà app tin tưởng.
- **Chưa có khóa publisher production và chưa có release engine ký thật
  nào** — chưa có gì phải thu hồi hay tương thích ngược. Đây là thời điểm
  rẻ nhất để đổi.
- *Ghi chú điều phối:* luồng làm việc song song của chủ dự án (commit cục
  bộ `89b3c2c`, chưa lên GitHub) được ghi nhận là đã sửa độc lập đúng điểm
  dự phòng này. Nếu chọn Lựa chọn 1, agent thực thi phải diff hai bản cài
  đặt trong bước hoà giải trước khi viết mới.

**Các lựa chọn:**

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Cấp MỘT khóa publisher riêng dùng cho cả hai engine; bỏ hẳn dự phòng khóa license** *(khuyến nghị đứng — Agent 19 + Agent 2)* | Khớp Mục 8 trọn vẹn; được tuyên bố "mọi engine đã tách khóa" kèm bằng chứng test. Thêm một nghi thức khóa một lần. Chi phí chuyển đổi lúc này gần như bằng không; sau release ký thật đầu tiên sẽ đắt hơn nhiều. |
| 2 | Ghi nhận ngoại lệ chính thức vào Mục 8 của Hiến pháp | Không sửa code. Hiến pháp và code khớp nhau, nhưng hợp thức hoá vĩnh viễn việc khóa license xuất hiện trong quy trình ký engine; bán kính thiệt hại giữ nguyên mức tối đa; **không bao giờ** được tuyên bố tách khóa chung — chỉ nói riêng đường Camoufox. |

**Việc phát sinh theo đáp án:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án | Sinh cặp khóa publisher production (Ed25519) một lần theo OWNER-RUNBOOK của Agent 13; khóa riêng lưu ngoài repo; công bố khóa công khai vào repo qua điều phối | ~30 phút, một lần |
| 1 | Agent engine (đợt sau) | Xoá nhánh dự phòng ở `tools/sign-bundled-engine.js`; nạp khóa publisher cho `BundledEngineManager` trong `main.js` theo mẫu `loadCamoufoxPublisherKey`; cập nhật `docs/BUNDLED_ENGINE_RELEASE.md`; mở rộng test khóa cứng cho đường Chromium | ~0,5–1 ngày agent |
| 2 | Chủ dự án | Tự sửa Mục 8 theo Mục 13.3 (điều khoản ngoại lệ + lý do + điều kiện tách miền bắt buộc) | ~30 phút |
| 2 | Điều phối | Rà mọi tài liệu để không tuyên bố tách khóa chung; ghi quyết định vào hồ sơ phát hành | ~1 giờ |

---

## Mục 3 — QD-03: Cập nhật Hiến pháp Mục 4 và Mục 17.2 theo kết quả đo

**Hồ sơ gốc:** `docs/decisions/QD-03-cap-nhat-hien-phap-muc-4-va-17.md`
(Agent 19) — chứa **diff nguyên văn từng dòng**, duyệt là áp được ngay.
Theo Mục 13.3, Hiến pháp chỉ thay đổi theo quyết định của chủ dự án; agent
chỉ đề xuất.

**⚠️ CỜ LỆCH BẰNG CHỨNG (đọc trước khi trả lời mục này):**
Diff của QD-03 được soạn ngày 2026-10-21 từ dữ liệu của Agent 5 (headless)
và Agent 6. Sau đó, **Agent 4 (đợt thương mại) đã đo WebGL thành công ở
chế độ có hiển thị dưới Xvfb**: cả 5 điểm §4.3 đều MEASURED cho 2 hồ sơ;
vendor/renderer khớp 2/2 trường so được mỗi hồ sơ; 9/12 tham số GL đo
được; extensions 15 mục; shader precision và render hash đều đo được
(`stage0-measure/agent4-webgl-results.json`,
`stage0-measure/run-webgl.js`). Agent 4 đã soạn **câu chữ thay thế mới
hơn cho đúng 5 hàng WebGL đó** (`agents/agent-4/INTEGRATION-NOTES.md`
mục 4). Nếu duyệt QD-03 và áp **nguyên văn cả Nhóm C3**, Hiến pháp sẽ ghi
trạng thái WebGL cũ hơn bằng chứng repo đang có — sai theo hướng thận
trọng nhưng vẫn là ghi sai sổ đăng ký. Vì vậy Lựa chọn 1 dưới đây được
hiểu là: **áp QD-03 với 5 hàng WebGL thay bằng câu chữ của Agent 4**.
Các nhóm còn lại (A: tách hàng Service Worker khỏi Cache Storage + ETag +
Favicon ở §4.5; B: đoạn cửa sổ commit localStorage ở §17.2; C1/C2/C4: ~20
hàng §4.2/4.4) đã đối chiếu — vẫn khớp nguyên văn file hiện tại
(`TIEU-CHI-SAN-PHAM.md` v1.3; §4.5 tại dòng 157-159).

*Ngoài phạm vi QD-03:* hàng DNS ở §4.1 cũng đã có bằng chứng mới (Agent 5
đợt thương mại: cơ chế quan sát DNS đã dựng và chạy trên đường trực tiếp;
đường qua proxy vẫn CHƯA ĐO) nhưng **không nằm trong diff của QD-03** —
sẽ là một đề xuất QD riêng sau, không gộp vào quyết định này.

**Vì sao không nên để nguyên:** hàng "Cache Storage + Service Worker"
hiện mang nhãn **"ĐẠT (20/20)"** trong khi phép đo gốc không hề đo
Service Worker — khẳng định quá mức bằng chứng, ngược kỷ luật Mục 11/16.
Đây là phần khẩn nhất của QD-03 (Nhóm A1).

**Các lựa chọn:**

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Duyệt toàn bộ (Nhóm A + B + C), với 5 hàng WebGL dùng câu chữ của Agent 4** *(khuyến nghị đứng — Agent 19, đã sửa theo cờ lệch)* | Hiến pháp v1.3 → v1.4; cột Trạng thái khớp bằng chứng hiện có, mọi trạng thái mới kèm giới hạn môi trường (Linux/headless/Xvfb; Windows vẫn CHƯA ĐO). Sổ CHƯA ĐO thu hẹp đúng thực tế. |
| 2 | Duyệt một phần — ghi rõ nhóm (A / B / C) trong lưới đáp án | Nhóm chưa duyệt giữ trạng thái cũ: vẫn đúng theo hướng thận trọng (trừ A1 — xem cảnh báo trên) nhưng Hiến pháp tiếp tục thiếu thông tin đã đo; các đợt sau phải tra báo cáo agent thay vì Mục 4. |
| 3 | Không duyệt, giữ nguyên v1.3 | Không rủi ro ghi sai, nhưng nhãn "ĐẠT (20/20)" sai cho Service Worker tồn tại tiếp, và cửa sổ commit localStorage không có nơi ghi chính thức — dễ bị diễn giải sai thành lỗi cách ly ở các đợt sau. |

**Việc phát sinh theo đáp án:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án (hoặc điều phối theo lệnh — Mục 13.3) | Áp diff QD-03 (Nhóm A/B/C1/C2/C4 nguyên văn; 5 hàng WebGL theo `agents/agent-4/INTEGRATION-NOTES.md` mục 4); đổi nhãn v1.3 → v1.4 + dòng lịch sử kèm ngày và mã QD-03; commit trên nhánh riêng chờ gộp | ~30–45 phút |
| 2 | Như trên, giới hạn nhóm được duyệt | Áp đúng nhóm đã nêu; nhóm còn lại vào danh sách chờ quyết tiếp theo | ~15–30 phút |
| 3 | Điều phối | Ghi "không duyệt tại thời điểm này" + lý do (nếu có) vào hồ sơ dự án | ~10 phút |

*Áp QD-03 không thay đổi trạng thái cổng nào của Mục 12 — đây là cập nhật
sổ đăng ký đo, không phải bằng chứng nghiệm thu mới.*

---

## Mục 4 — QD-04 (VIẾT LẠI THEO HIỆN TRẠNG): Áp hai file workflow + sửa bước generate của phép đo cấu hình

**Hồ sơ gốc:** `docs/decisions/QD-04-chien-luoc-push-ci.md` (Agent 19) —
**phần lớn đã lỗi thời, không trả lời theo bản gốc.** Bản gốc hỏi đường
push nhánh lên GitHub; việc đó đã xong bằng sự kiện: chủ dự án uỷ quyền
push 2026-10-21, nhánh `integration/v5.8-phase-c` đã lên GitHub bằng
snapshot (đầu xa `f549a63`), PR #18 (Draft) đã mở, CI Windows run
39641363889 **SUCCESS** cho cây Wave 2 (build + chuỗi 201 test). Lựa chọn
3 của bản gốc (chỉ push, hoãn workflow) trên thực tế là điều đã xảy ra.

**Phần còn lại — bối cảnh đã kiểm chứng tại `f280296`:**

- Hai file workflow hoàn chỉnh nằm sẵn trong cây, tại `release/workflows/`:
  `windows-exe.yml` (12 bước, gồm bước staging-verify và 4 ảnh chụp UI)
  và `camoufox-upstream-smoke.yml` (đã gồm trigger cho nhánh
  `integration/v5.8-phase-c`), kèm `release/workflows/APPLY-GUIDE.md`
  hướng dẫn áp từng bước (Agent 2). Chúng **chưa** được áp vào
  `.github/workflows/` — bản xa hiện vẫn là bản của `main` (thiếu
  staging-verify; file smoke vắng mặt).
- Token GitHub App của trợ lý **không có quyền ghi `.github/workflows`**
  (403 đã xác lập) — trợ lý không tự áp được hai file này.
- **Lỗi đã chẩn đoán (Agent 2):** bước "Generate two pinned identities"
  của phép đo cấu hình sẽ **fail theo cấu trúc** nếu áp nguyên trạng —
  bước đó đòi thư mục `$RUNNER_TEMP/lhm-camoufox-runtime/node_modules/camoufox`
  tồn tại nhưng không bước nào tạo nó (bằng chứng: D1 smoke run
  39614246764 fail đúng tại bước 16). APPLY-GUIDE chứa **bản sửa tối
  thiểu tuỳ chọn** (cài các gói đã ghim vào đúng tiền tố đó ngay trong
  bước generate), cố ý không gộp sẵn vào file — chờ duyệt ở quyết định này.
- Nếu không áp: phần "đo có cấu hình" của Cổng 2 giữ nguyên CHƯA ĐẠT;
  Cổng 2 chỉ đạt phần build/test.

**Các lựa chọn:**

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Chủ dự án tự áp cả hai file theo APPLY-GUIDE + duyệt luôn bản sửa bước generate** *(khuyến nghị đứng — kế thừa Agent 19 LC1 + Agent 2)* | Cổng 2 có thể khép trọn sau một lần chạy CI: build/test + phép đo cấu hình chạy thật trên runner Windows. Không tạo bề mặt credential mới. |
| 2 | Chủ dự án tự áp hai file, **không** áp bản sửa generate | Workflow đầy đủ có hiệu lực (staging-verify chạy), nhưng bước generate của phép đo cấu hình sẽ fail theo đúng chẩn đoán — Cổng 2 phần đo vẫn CHƯA ĐẠT, và CI smoke sẽ đỏ vì lý do đã biết trước. |
| 3 | Cấp PAT fine-grained ngắn hạn (đúng repo, Contents + Workflows, ≤7 ngày) để trợ lý áp thay | Kết quả kỹ thuật như Lựa chọn 1 (kèm hay không kèm bản sửa — ghi rõ trong lưới đáp án); đổi lại tạo một bề mặt credential phải quản lý và thu hồi ngay sau khi xong. |
| 4 | Hoãn tiếp | Trạng thái "Cổng 2 đạt một phần" kéo dài vô thời hạn; đúng mẫu đã khiến bản vá này chờ từ đợt PR #17. |

**Việc phát sinh theo đáp án:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án | Copy 2 file từ `release/workflows/` vào `.github/workflows/`, áp diff sửa generate trong APPLY-GUIDE, commit + push bằng tài khoản chủ repo; báo điều phối khi CI chạy xong | ~15–30 phút thao tác |
| 1/3 | Điều phối | Đối chiếu run CI mới: staging-verify xuất hiện (12 bước), smoke run cho nhánh tích hợp (18 bước), bước generate qua được; ghi kết quả Cổng 2 theo Mục 23 | ~0,5 ngày gồm chờ CI |
| 2 | Chủ dự án + điều phối | Như Lựa chọn 1 trừ diff generate; điều phối ghi trạng thái phần đo = CHƯA ĐẠT (fail đã biết trước) | ~15–30 phút + theo dõi |
| 3 | Chủ dự án | Tạo PAT qua kênh an toàn; thu hồi ngay khi điều phối báo xong | ~10 phút tạo + 2 phút thu hồi |
| 4 | Điều phối | Ghi trạng thái Cổng 2 = "đạt một phần" vào hồ sơ phát hành | ~10 phút |

---

## Mục 5 — D1: Kiểm tra cập nhật — khi nào kiểm tra

**Nguồn:** Agent 12, `docs/agents/agent-12/INTEGRATION-NOTES.md` +
`docs/agents/agent-12/UPDATE-DESIGN.md`. Module kiểm tra
`src/update/updateCheck.js` đã có (chỉ đọc manifest, kiểm chữ ký Ed25519,
**không bao giờ** tự tải/tự cài), chưa nối dây.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Chỉ thủ công** — người dùng bấm kiểm tra trong Cài đặt/Giới thiệu *(khuyến nghị đứng — Agent 12, cho bản thương mại đầu tiên)* | Không phát sinh lưu lượng mạng ngoài ý muốn; khớp kỷ luật "không tải ngầm" của sản phẩm. Đổi lại: người dùng không tự kiểm tra thì không biết có bản mới. |
| 2 | Tự động khi khởi động (kèm quyết định tần suất tối thiểu giữa hai lần kiểm) | Người dùng luôn được báo bản mới; đổi lại app phát sinh một kết nối mạng mỗi lần mở — cần ghi rõ trong tài liệu riêng tư của khách (Mục 07 "sản phẩm không hứa"/dữ liệu ghi lại). |
| 3 | Định kỳ theo lịch (vd mỗi 24 giờ khi app đang chạy) | Như Lựa chọn 2, cộng thêm cơ chế hẹn giờ và trạng thái kiểm tra gần nhất; nhiều bề mặt hành vi nhất trong ba lựa chọn. |

**Việc phát sinh:** quyết định này chỉ chốt *chính sách*; phần nối dây
(IPC `check-for-update` kiểu lazy-pull, nạp khóa publisher cho cập nhật,
dòng trạng thái trung tính ở Cài đặt/Giới thiệu) làm một lần cùng D2–D4 —
xem bảng việc ở Mục 8. Ước lượng phần nối dây chung cho cả nhóm D:
~0,5–1 ngày agent (điều phối/agent ứng dụng, đợt sau khi có đủ D1–D4 + D3).

---

## Mục 6 — D2: Kênh phân phối manifest cập nhật

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **GitHub Releases** *(mặc định của nguyên mẫu Agent 12)* | Cùng chính sách allowlist host với phân phối engine; không hạ tầng mới. Phụ thuộc GitHub khả dụng ở mạng của khách. |
| 2 | CDN/máy chủ tĩnh của LHM | Chủ động hoàn toàn về kênh; phải vận hành thêm một điểm phân phối (độ tin cậy của kênh vẫn do chữ ký manifest đảm bảo — CDN bị xâm nhập cũng không giả được bản cập nhật, chỉ chặn được việc phân phối). Khi tích hợp phải bổ sung host vào `allowedHosts`. |

**Việc phát sinh:** Lựa chọn 1 — không việc hạ tầng; hằng số URL/channel
đóng gói lúc nối dây. Lựa chọn 2 — chủ dự án dựng điểm phân phối tĩnh
(~0,5 ngày vận hành, ngoài repo); điều phối bổ sung host vào allowlist
trong cùng đợt nối dây nhóm D.

---

## Mục 7 — D3: Khóa ký cập nhật — dùng chung khóa publisher engine hay khóa riêng thứ hai

**Liên hệ QD-02:** miền ký đã tách cứng — cập nhật dùng
`LHM_APP_UPDATE_V1`, engine dùng `LHM_BROWSER_ENGINE_BUNDLE_V1` — chữ ký
**không dùng chéo được kể cả khi chung một khóa**.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Dùng chung khóa publisher của engine** *(khuyến nghị đứng — Agent 12: "phương án tiết kiệm nhất", với điều kiện QD-02 = Lựa chọn 1)* | Một buổi lễ khóa, một khóa riêng cần bảo vệ cho cả hai hệ phát hành. Bán kính khi lộ khóa gồm cả engine lẫn cập nhật (nhưng không gồm license — khóa license vẫn tách hẳn). |
| 2 | Một khóa publisher thứ hai, chỉ cho cập nhật ứng dụng | Bán kính lộ khóa nhỏ nhất; đổi lại thêm một buổi lễ khóa + một khóa riêng nữa trong quy trình phát hành (runbook Agent 13 phải quản hai khóa publisher). |
| 3 | *(Chỉ khả thi nếu QD-02 = Lựa chọn 2)* Giữ nguyên trạng thái chưa có khóa publisher độc lập cho engine và hoãn D3 tới khi QD-02 được xem lại | D3 không chốt được độc lập với QD-02 ở hướng này; nhóm D không nối dây được phần ký. Không khuyến nghị — chỉ ghi để lưới đáp án không bị kẹt. |

**Việc phát sinh:** nằm trong buổi lễ khóa của QD-02 (Lựa chọn 1: cùng một
lần sinh khóa; Lựa chọn 2: +~15 phút sinh thêm một cặp khóa + cập nhật
runbook Agent 13). Neo khóa công khai cho cập nhật
(`update-publisher-ed25519.pub` trong resources) do điều phối nạp ở đợt
nối dây nhóm D.

---

## Mục 8 — D4: Khi có bản cập nhật — thông báo hay tải giúp

Tự tải + tự cài âm thầm **bị loại theo kỷ luật sản phẩm** — không phải
lựa chọn. Công cụ ký phía phát hành (`tools/sign-app-update.js`) chưa tồn
tại ở mọi lựa chọn; nó là việc xây dựng của đợt nối dây, không phải quyết
định.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Chỉ thông báo + liên kết** — hiển thị "có bản a.b.c (dung lượng, SHA-256)" và liên kết tới nơi tải chính thức; người dùng tự tải, tự chạy bộ cài *(khuyến nghị đứng cho bản thương mại đầu tiên — hướng bảo thủ của Agent 12)* | Bề mặt code nhỏ nhất: không đường tải nào trong app. Người dùng thêm thao tác tay; tỷ lệ cập nhật thực tế thấp hơn. |
| 2 | Tải khi người dùng bấm nút — app tải bộ cài qua cơ chế ghim hash/kích thước (`downloadPinned` như đường engine), hiển thị hash để đối chiếu, người dùng tự chạy file đã tải | Trải nghiệm liền hơn; thêm một đường tải có kiểm chứng toàn vẹn trong app (đã có tiền lệ ở đường engine) và bề mặt test tương ứng. App vẫn không tự chạy bộ cài. |

**Bảng việc chung cho cả nhóm D (sau khi D1–D4 chốt đủ):**

| Ai làm | Việc | Ước lượng |
|---|---|---|
| Agent ứng dụng (đợt sau) | Viết `tools/sign-app-update.js` dùng chung `signedUpdatePayload`/`canonicalUpdateManifest` đã xuất sẵn từ `src/update/updateCheck.js` | ~0,5 ngày agent |
| Agent ứng dụng / điều phối | Nối dây: bộ nạp khóa publisher cho cập nhật (mẫu `loadCamoufoxPublisherKey`), IPC `check-for-update` + preload, hằng số URL/channel theo D2 (không để người dùng sửa qua settings — URL sửa được sẽ phá gốc tin cậy của kênh), dòng trạng thái trung tính ở Cài đặt/Giới thiệu theo D1/D4 | ~0,5–1 ngày agent |
| Chủ dự án | Buổi lễ khóa (chung với QD-02); nếu D2 = Lựa chọn 2: dựng điểm phân phối | Xem QD-02 / Mục 6 |
| Điều phối | Nghiệm thu trên EXE đóng gói thuộc Cổng 3 — module hiện mới kiểm chứng ở Linux/Node thuần | Theo lịch Cổng 3 |

---

## Mục 9 — F3 + F4: Hai tồn tại của thao tác xoá vĩnh viễn (purge)

**Nguồn:** Agent 17, `agents/agent-17/INTEGRATION-NOTES.md` mục 3–4. Lỗi
chính F1 đã sửa: purge nay xoá đủ 4 gốc dữ liệu hồ sơ
(`src/db/store.js:25` — `PROFILE_DATA_ROOTS`, dùng tại `:259` và `:317`;
kiểm chứng quét toàn cây = 0 dấu vết). Hai tồn tại dưới đây **không phải
lỗi rò rỉ chéo** — là dữ liệu của chính hồ sơ đó còn sót lại sau khi người
dùng tin rằng đã xoá vĩnh viễn.

### F3 — Snapshot phiên do người dùng tự tạo không bị purge

`session-snapshots/<id>/` (do `src/ops/sessionSnapshots.js` quản) chứa dữ
liệu phiên của hồ sơ; purge hiện **không xoá** và giao diện purge **không
nói** việc này.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | Purge xoá luôn snapshot của hồ sơ | "Xoá vĩnh viễn" đúng nghĩa đen trọn vẹn. Đổi lại: snapshot là thứ người dùng **chủ động tạo** để khôi phục — xoá kèm purge là hành vi phá huỷ dữ liệu người dùng đã cố ý giữ, phải ghi rất rõ trong hộp xác nhận purge. |
| 2 | **Giữ nguyên snapshot, nhưng UI purge bắt buộc nói rõ "snapshot phiên đã tạo sẽ còn lại"** *(khuyến nghị đứng — Agent 17: mức tối thiểu "không im lặng")* | Không phá dữ liệu người dùng tự tạo; hết yếu tố bất ngờ. Nghĩa vụ xoá triệt để khi khách yêu cầu thì làm tay theo sổ tay. |
| 3 | Cảnh báo tại lúc purge nếu hồ sơ còn snapshot (liệt kê số lượng, để người dùng chọn xoá kèm hay giữ) | Linh hoạt nhất theo từng trường hợp; thêm một bước tương tác vào luồng purge và bề mặt test tương ứng. |

**Việc phát sinh:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Agent dữ liệu (đợt sau) | Thêm `session-snapshots/<id>` vào đường purge trong `src/db/store.js`/`src/ops/sessionSnapshots.js`; chữ cảnh báo trong hộp xác nhận; mở rộng `test/profile-deletion-backup-drill.js` | ~0,5 ngày agent |
| 2 | Agent UI + điều phối | Một câu công khai trong hộp thoại purge + cập nhật `docs/customer-guide/05-sao-luu-khoi-phuc-va-xoa-du-lieu.md` | ~1–2 giờ |
| 3 | Agent dữ liệu + Agent UI | Kiểm tra snapshot tồn tại trong luồng purge + lựa chọn trong hộp thoại + test | ~0,5 ngày agent |

### F4 — Workflow tự động còn tham chiếu hồ sơ đã purge

`automation-workflows.json` giữ các workflow trỏ tới id hồ sơ đã xoá vĩnh
viễn; không đường code nào dọn chúng. Workflow mồ côi sẽ lỗi khi chạy tới
bước dùng hồ sơ đó — lỗi muộn, xa nguyên nhân.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Chặn purge khi còn workflow tham chiếu** (kèm thông báo nêu rõ workflow nào) | Không bao giờ tạo tham chiếu mồ côi; người dùng tự quyết xoá/dời workflow trước. Purge có thể bị chặn — cần câu chữ hướng dẫn rõ cách gỡ chặn. |
| 2 | Xoá các workflow tham chiếu **cùng** purge, sau xác nhận rõ ràng trong hộp thoại | Purge luôn đi được; đổi lại xoá kèm tài sản tự động hoá người dùng đã xây (có thể dùng chung nhiều hồ sơ) — xác nhận phải liệt kê tên workflow bị xoá. |
| 3 | Giữ nguyên (không chặn, không xoá, không báo) | Không khuyến nghị (Agent 17 nêu hai hướng trên là hai hướng xử lý; giữ nguyên để lại lỗi muộn khó truy nguyên nhân cho khách và cho hỗ trợ). Chỉ chọn nếu chủ dự án chủ đích hoãn. |

**Việc phát sinh:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Agent dữ liệu (đợt sau) | Kiểm tra tham chiếu trước purge trong `src/db/store.js` + thông báo; test drill mở rộng | ~0,5 ngày agent |
| 2 | Agent dữ liệu + Agent UI | Xoá workflow tham chiếu trong cùng giao dịch purge + liệt kê trong hộp xác nhận + test drill mở rộng | ~0,5–1 ngày agent |
| 3 | Điều phối | Ghi tồn tại đã biết vào hồ sơ phát hành | ~10 phút |

*Ghi nhận phụ của Agent 17 (không cần quyết, chỉ để biết): gỡ cài đặt hiện
để lại toàn bộ cây `storage` theo mặc định electron-builder
(`nsis.deleteAppDataOnUninstall` chưa đặt) — khớp sổ tay khách hàng hiện
tại (hướng dẫn xoá tay). Nếu sau này muốn uninstall hỏi/xoá dữ liệu, đó
là thay đổi cấu hình đóng gói + nghiệm thu Cổng 3, không nằm trong F4.*

---

## Mục 10 — ECHO: Endpoint echo cho quan sát IP thoát từ runtime của trình duyệt

**Nguồn:** Agent 7, `agents/agent-7/INTEGRATION-NOTES.md` mục 3. Module
`src/health/runtimeEgressObservation.js` đo IP thoát **từ trong trang**
của phiên Camoufox do controller điều khiển và ghi với nhãn
`source: 'browser-runtime'` — bằng chứng phía runtime mà Mục 19.3 yêu cầu
tách khỏi quan sát của tiến trình quản lý (`manager-process`). Điều phối
đã nối dây ở `f280296` (`main.js:695-716`): **chỉ chạy khi
`settings.runtimeEchoUrl` khác rỗng**; chưa cấu hình = không làm gì cả.
Hợp đồng endpoint: `GET → 200`, thân JSON `{"ip": "<ipv4>"}` (hoặc
`{"remoteAddress": ...}`/text thuần), header
`Access-Control-Allow-Origin: *` và `Cache-Control: no-store`, không
redirect. Agent 7 **cố ý không tự chọn** endpoint — đây là quyết định của
chủ dự án vì nó là quyết định riêng tư.

| # | Lựa chọn | Hệ quả |
|---|---|---|
| 1 | **Endpoint tự vận hành của LHM** *(hướng mà phân tích riêng tư của Agent 7 nghiêng về — không phải khuyến nghị chính thức)* | IP thoát của hồ sơ khách chỉ đi tới hạ tầng của LHM. Đổi lại: phải dựng và duy trì một dịch vụ rất nhỏ (một endpoint tĩnh) và chịu trách nhiệm khả dụng của nó — đo thất bại thì D3 báo `not_measured`, không bao giờ lấp bằng kết quả manager. |
| 2 | Endpoint echo bên thứ ba (vd api.ipify.org — cùng dịch vụ đường checkProxy hiện tại đang dùng) | Không hạ tầng, bật được ngay. Đổi lại: IP thoát của từng hồ sơ bị lộ cho bên thứ ba đó từ phía runtime, giống hệt mức lộ hiện tại của đường manager — phải công khai trong tài liệu dữ liệu của khách. |
| 3 | Để trống (không cấu hình) | Tính năng quan sát runtime nằm im vô thời hạn; D3 chỉ có nguồn manager-process kèm cảnh báo giới hạn Mục 19.3 vĩnh viễn. Không việc gì phát sinh. |

**Việc phát sinh:**

| Chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án | Dựng endpoint theo hợp đồng trên (HTTPS, đúng 3 tính chất header/thân/không-redirect) | ~0,5 ngày vận hành, ngoài repo |
| 1/2 | Điều phối | Đặt URL vào cấu hình phát hành + ghi vào sổ tay người bán; nếu Lựa chọn 2: bổ sung câu công khai vào `docs/customer-guide/07-nhung-gi-san-pham-khong-hua.md` | ~1 giờ |
| 3 | Điều phối | Ghi quyết định "chưa cấu hình endpoint" vào hồ sơ phát hành | ~10 phút |

*Giới hạn giữ nguyên ở mọi lựa chọn: chỉ phiên do controller điều khiển
mới đo được nguồn runtime; phiên mở tay/Chromium vẫn NOT_RUN cho nguồn
này; phân biệt runtime ≠ manager qua proxy thật vẫn chưa đo (cần lab).*

---

## Mục 11 — AUTH: Chứng chỉ Authenticode cho EXE — ✅ ĐÃ QUYẾT (không cần trả lời)

- **Quyết định:** chủ dự án chốt **KHÔNG mua** chứng chỉ Authenticode,
  ngày 2026-10-22. Mục này chỉ ghi lại, không nằm trong lưới đáp án —
  trừ khi chủ dự án chủ đích mở lại bằng dòng tuỳ chọn `AUTH=mở lại` ở
  Mục 12.
- **Hệ quả đã chấp nhận:** EXE phát hành **không ký Authenticode**;
  khách cài sẽ gặp cảnh báo SmartScreen "nhà phát hành không xác định" và
  bấm *More info → Run anyway*; cảnh báo có thể lặp lại theo từng phiên
  bản mới cho tới khi file đó tích lũy đủ lượt tải. Bán pilot thủ công cho
  khách quen vận hành được ở trạng thái này.
- **Không nhầm lẫn:** quyết định này **không** liên quan khóa publisher
  Ed25519 ở QD-02/D3 — đó là khóa tự sinh nội bộ cho engine/cập nhật,
  vẫn cần ở mọi phương án.
- **Việc phát sinh (làm bất kể):** bổ sung đoạn hướng dẫn bấm qua
  SmartScreen vào `docs/customer-guide/01-cai-dat-va-kich-hoat.md` bằng
  câu chữ thuần, kèm một câu giải thích vì sao có cảnh báo (~30 phút,
  điều phối/Agent tài liệu). Nếu sau này mở lại quyết định: ký là bước ở
  khâu build, thêm vào bất kỳ bản phát hành nào cũng được, không sửa code.
- **Lưu ý hồ sơ:** văn bản thứ tự hoàn thiện do chủ dự án đưa ra cùng
  ngày có liệt kê "chứng chỉ ký mã" trong nhóm tài sản thương mại. Gói
  này giữ nguyên quyết định KHÔNG mua làm chuẩn; nếu việc liệt kê đó là
  chủ đích đổi ý, hãy trả lời `AUTH=mở lại` ở lưới dưới.

---

## Mục 12 — LƯỚI ĐÁP ÁN (trả lời một lần, một tin nhắn)

Chép mẫu dưới đây, điền số lựa chọn sau dấu `=`. Mục chưa quyết được ghi
`để sau`. Với QD-03 Lựa chọn 2, ghi nhóm trong ngoặc. Với QD-04 Lựa chọn
3, ghi kèm `+fix` hoặc `không fix`.

```
QD-01 =        (1 giữ nguyên | 2 chặn | 3 cho qua + cảnh báo rõ)      [khuyến nghị: 3]
QD-02 =        (1 khóa publisher riêng cho cả 2 engine | 2 ngoại lệ vào Hiến pháp)  [khuyến nghị: 1]
QD-03 =        (1 duyệt toàn bộ, WebGL theo câu chữ Agent 4 | 2 duyệt một phần — nhóm: ___ | 3 giữ v1.3)  [khuyến nghị: 1]
QD-04 =        (1 tự áp + sửa generate | 2 tự áp, không sửa generate | 3 cấp PAT cho trợ lý áp (+fix / không fix) | 4 hoãn)  [khuyến nghị: 1]
D1    =        (1 chỉ thủ công | 2 tự động khi khởi động | 3 định kỳ)  [khuyến nghị: 1]
D2    =        (1 GitHub Releases | 2 CDN của LHM)                     [khuyến nghị: 1]
D3    =        (1 chung khóa publisher engine | 2 khóa riêng thứ hai)  [khuyến nghị: 1, nếu QD-02=1]
D4    =        (1 chỉ thông báo + liên kết | 2 tải khi người dùng bấm) [khuyến nghị: 1]
F3    =        (1 purge xoá luôn snapshot | 2 giữ + UI nói rõ | 3 cảnh báo khi purge nếu còn snapshot)  [khuyến nghị tối thiểu: 2]
F4    =        (1 chặn purge khi còn workflow tham chiếu | 2 xoá workflow cùng purge sau xác nhận | 3 giữ nguyên)  [khuyến nghị: 1 hoặc 2]
ECHO  =        (1 endpoint tự vận hành của LHM | 2 echo bên thứ ba | 3 để trống)  [không khuyến nghị chính thức; phân tích riêng tư nghiêng về 1]
AUTH  =        (ĐÃ QUYẾT: không mua — chỉ điền "mở lại" nếu chủ đích đổi quyết định)
```

**Thứ tự thực thi sau khi nhận đáp án** (điều phối chịu trách nhiệm mở
việc, không tự quyết thay mục nào):

1. QD-04 (nếu 1/2/3) → chạy lại CI → xác nhận khép phần đo của Cổng 2.
2. QD-02 = 1 → buổi lễ khóa publisher production (chủ dự án) mở đường cho
   cả ký engine Chromium lẫn D3.
3. QD-03 → áp diff vào Hiến pháp (v1.4) trên nhánh riêng.
4. QD-01, F3, F4, nhóm D → giao agent theo bảng việc từng mục.
5. ECHO = 1/2 → cấu hình endpoint vào bản phát hành; AUTH giữ nguyên
   trạng thái đã quyết, chỉ còn việc tài liệu SmartScreen.

*Mọi mục ghi `để sau` giữ nguyên trạng thái hiện tại của code và được
liệt kê lại trong gói quyết định kế tiếp — không mục nào tự hết hạn hay
tự được suy diễn thành đồng ý.*
