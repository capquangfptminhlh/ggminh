# HỒ SƠ QUYẾT ĐỊNH QD-01 — QA-001: Hồ sơ Camoufox chạy trực tiếp (direct) qua cổng với mã PREFLIGHT_ONLY

- **Trạng thái:** CHỜ CHỦ DỰ ÁN QUYẾT ĐỊNH. Văn bản này là hồ sơ chuẩn bị quyết định, không phải quyết định.
- **Người soạn:** Agent 19 (đợt thương mại hoá), 2026-10-21.
- **Nền kiểm chứng:** nhánh `integration/v5.8-phase-c` @ `07150d6` (gồm nền Hiến pháp `8349f38`).

## 1. Bối cảnh — sự thật đã kiểm chứng và nguồn

1. `NetworkSafetyCheck.evaluate()` cho hồ sơ có `proxy.type === 'direct'` trả về
   `{safeToLaunch: true, code: 'PREFLIGHT_ONLY', reason: 'Direct profile passes
   configuration checks; network-leak safety not certified'}` — tức cho mở hồ sơ
   dù an toàn mạng **chưa được chứng nhận**.
   Nguồn: `src/engine/NetworkSafetyCheck.js:16-18` tại `07150d6`; hành vi này
   được khóa bằng test `test/network-safety-fail-closed.js:38-41` (Agent 7, đợt
   10 agent).
2. `EngineFactory.launchProfile` chỉ chặn khi `safeToLaunch === false`; mã
   `PREFLIGHT_ONLY` và lý do kèm theo hiện **bị bỏ đi ở tầng này** — người dùng
   cuối không nhìn thấy dòng "network-leak safety not certified" ở bất cứ đâu
   trong giao diện.
   Nguồn: `src/engine/EngineFactory.js:47` (điểm tiêu thụ duy nhất của
   `evaluate`); QA-BASELINE.md trục 1, hàng 2 (Agent 10).
3. Đường proxy có xác thực bị siết chặt hơn hẳn: thiếu lab được duyệt →
   `NETWORK_BLOCKED`; đủ điều kiện lab → vẫn chỉ là `LAB_PREFLIGHT_ONLY`
   ("DNS/WebRTC outcome still untested").
   Nguồn: `src/engine/NetworkSafetyCheck.js:20-27`.
4. Hiến pháp Mục 19.4 (fail-closed) yêu cầu chặn khi: proxy bắt buộc không kết
   nối được; phát hiện kết nối trực tiếp **trái chính sách**; phép kiểm bắt
   buộc không hoàn thành nên không đủ căn cứ cho phép sử dụng. Cùng mục quy
   định: *"Thiếu bằng chứng phải báo là thiếu bằng chứng, không báo sai rằng
   đã phát hiện rò rỉ."*
   Nguồn: `TIEU-CHI-SAN-PHAM.md` Mục 19.4.
5. Hiện trạng đo mạng: proxy/DNS/WebRTC trên đường chạy thật vẫn CHƯA ĐO
   (OPEN-ISSUES QA-007); `inspectContext()` tối đa kết luận INCONCLUSIVE, DNS
   luôn NOT_TESTED. Chưa tồn tại phép đo nào có thể "chứng nhận" an toàn mạng
   cho bất kỳ hồ sơ nào ở thời điểm này — cả direct lẫn proxy.
6. Vấn đề được Agent 10 ghi nhận là QA-001 với điều kiện đóng: *"Chủ dự án
   chốt: giữ PREFLIGHT_ONLY cho direct, hay chặn tới khi có phép đo mạng."*
   Nguồn: `OPEN-ISSUES.md` hàng QA-001; `QA-BASELINE.md` trục 1 (quan sát cuối
   mục).

**Điểm cốt lõi cần diễn giải:** hồ sơ direct là hồ sơ mà chính sách mạng đã
khai báo của nó *là* kết nối trực tiếp — nó không vi phạm điều kiện mạng bắt
buộc nào của chính nó (không có proxy bắt buộc bị lỗi, không có kết nối trực
tiếp "trái chính sách"). Cái thiếu ở đây là *bằng chứng* về rò rỉ DNS/WebRTC,
và Mục 19.4 có một câu riêng cho đúng tình huống thiếu bằng chứng: phải báo
là thiếu bằng chứng. Cả ba lựa chọn dưới đây đều là cách đọc có thể bảo vệ
được; hồ sơ này không tự kết luận thay.

## 2. Các lựa chọn

### Lựa chọn 1 — Giữ nguyên như hiện tại (cho qua, không hiển thị gì thêm)

- Hệ quả kỹ thuật: không sửa code. `PREFLIGHT_ONLY` tiếp tục là một mã nội bộ
  bị tầng EngineFactory bỏ qua.
- Hệ quả thương mại/vận hành: người dùng mở hồ sơ direct và không nhận được
  bất kỳ tín hiệu nào cho biết an toàn mạng chưa được chứng nhận. Rủi ro nằm ở
  kỷ luật phát ngôn (Mục 11.3): sản phẩm im lặng về một trạng thái CHƯA ĐO
  quan trọng, trong khi triết lý bán hàng của LHM là "đo được và kiểm chứng
  được". Nếu sau này có sự cố liên đới trên hồ sơ direct, hồ sơ dự án không
  có bằng chứng nào cho thấy người dùng đã được báo.

### Lựa chọn 2 — Siết thành chặn (direct → NETWORK_BLOCKED cho tới khi có phép đo mạng)

- Hệ quả kỹ thuật: sửa nhỏ trong `evaluate()` + cập nhật test. Đây là cách
  đọc nghiêm ngặt nhất của Mục 19.4 ("phép kiểm bắt buộc không hoàn thành →
  chặn").
- Hệ quả thương mại/vận hành: **toàn bộ hồ sơ Camoufox chạy trực tiếp bị vô
  hiệu hoá vô thời hạn** — phép đo mạng cần lab mạng được duyệt (điều kiện hạ
  tầng của chủ dự án, chưa có lịch). Camoufox đang là engine trong giai đoạn
  kiểm thử theo định hướng Mục 8; chặn direct nghĩa là giai đoạn kiểm thử
  chỉ còn đường proxy qua lab. Ngoài ra chính sách trở nên không nhất quán
  giữa các engine: hồ sơ Chromium chạy trực tiếp không đi qua cổng kiểm này
  (cổng chỉ nằm trên đường Camoufox qua EngineFactory), nên cùng một hành vi
  "chạy trực tiếp" bị chặn ở engine này và không bị chặn ở engine kia.

### Lựa chọn 3 — Giữ cho qua, nhưng hiển thị cảnh báo rõ cho người dùng

- Nội dung: đưa kết quả preflight (mã + lý do) xuyên qua EngineFactory →
  kết quả mở hồ sơ → giao diện, hiển thị dạng thông báo/biển trạng thái với
  câu chữ đúng sự thật, ví dụ: *"Hồ sơ chạy kết nối trực tiếp. An toàn mạng
  (DNS/WebRTC) chưa được đo — đây không phải chứng nhận không rò rỉ."* Đồng
  thời ghi lại vào nhật ký phiên để có vết kiểm chứng. Tiêu chí "network-route"
  trên bảng kiểm tiêu chí (Agent 9/điều phối đã nối) vẫn giữ CHƯA ĐO cho hồ
  sơ direct.
- Hệ quả kỹ thuật: sửa vừa — truyền thêm một trường qua 2–3 tầng
  (EngineFactory → BrowserLauncher/kết quả start → IPC/renderer), thêm hiển
  thị ở UI, cập nhật test fail-closed và test UI. Không đổi hành vi cho/chặn.
- Hệ quả thương mại/vận hành: giữ nguyên mọi trường hợp sử dụng hiện tại;
  sản phẩm thực hành đúng câu "thiếu bằng chứng phải báo là thiếu bằng
  chứng" của Mục 19.4 và đúng định vị minh bạch của LHM. Chi phí là một
  thông báo người dùng sẽ thấy mỗi lần mở hồ sơ direct (cần câu chữ không
  gây hoang mang quá mức nhưng không được làm nhẹ sự thật — Mục 22).

## 3. Khuyến nghị của Agent 19 (khuyến nghị — KHÔNG phải quyết định)

**Khuyến nghị Lựa chọn 3.** Lý do:

1. Nó là lựa chọn duy nhất khớp đồng thời cả hai câu của Mục 19.4: không có
   điều kiện mạng bắt buộc nào của hồ sơ direct bị vi phạm (nên chưa tới mức
   phải chặn theo đúng chữ của mục), và phần thiếu là bằng chứng — mà cách xử
   lý Hiến pháp quy định cho thiếu bằng chứng là *báo là thiếu bằng chứng*.
2. Lựa chọn 1 giữ lại đúng khiếm khuyết hiện tại: kết quả preflight trung
   thực đã tồn tại trong code nhưng bị vứt bỏ trước khi tới người dùng.
3. Lựa chọn 2 đổi một vấn đề "thiếu bằng chứng" thành "cấm sử dụng" trên
   đúng engine đang cần kiểm thử, tạo bất nhất quán giữa các engine, và thời
   hạn chặn phụ thuộc vào hạ tầng lab chưa có lịch — chặn vô thời hạn trên
   thực tế.

## 4. Câu quyết định cần chủ dự án trả lời

**Với hồ sơ Camoufox kết nối trực tiếp (direct) đang qua cổng bằng mã PREFLIGHT_ONLY, chủ dự án chọn Lựa chọn 1 (giữ nguyên, không hiển thị), Lựa chọn 2 (siết thành chặn NETWORK_BLOCKED), hay Lựa chọn 3 (giữ cho qua và hiển thị cảnh báo rõ cho người dùng)?**

## 5. Việc xảy ra sau khi quyết

| Nếu chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Chủ dự án / điều phối | Ghi quyết định + lý do vào OPEN-ISSUES (đóng QA-001 ở trạng thái "giữ nguyên theo quyết định chủ dự án") và ghi chú vào hồ sơ phát hành; không sửa code | ~15 phút ghi chép |
| 2 | Agent engine (đợt sau) | Đổi nhánh direct trong `evaluate()` thành `blocked(...)` kèm lý do; cập nhật `test/network-safety-fail-closed.js`; câu chữ lỗi hiển thị cho người dùng theo Mục 22; đóng QA-001 | ~0,5 ngày agent |
| 3 | Agent engine + Agent UI (đợt sau) | Truyền preflight report qua EngineFactory/launcher tới renderer; hiển thị thông báo + ghi nhật ký phiên; cập nhật test fail-closed + test UI; đóng QA-001 | ~0,5–1 ngày agent |

Trong cả ba trường hợp: không lựa chọn nào tự nó tạo ra phép đo mạng —
QA-007 (đo proxy/DNS/WebRTC trên đường thật) vẫn mở và vẫn cần lab mạng
được duyệt của chủ dự án.
