# INTEGRATION NOTES — Agent 11: Test runner báo cáo đầy đủ (QA-005)

**Nền:** f4d7329 · **Nhánh:** agent-11/test-runner · **File đã giao:**
`test/run-all.js` (runner), `test/run-all-selftest.js` (tự kiểm chứng),
tài liệu này. Không sửa package.json (file chung) — diff đề xuất ở Mục 2.

## 1. Runner làm gì

- Đọc chuỗi bước từ **chính `scripts.test` trong package.json** (nguồn sự
  thật duy nhất; không chép cứng danh sách 188 bước vào runner). Đổi chuỗi
  trong package.json là runner tự chạy theo chuỗi mới.
- Chạy **mọi** bước theo đúng thứ tự gốc, bất kể bước trước fail (đây là
  điểm QA-005 yêu cầu: chuỗi `&&` cũ dừng ở bước đầu tiên fail và che
  toàn bộ kết quả sau nó). Cuối phiên in tổng kết: tổng số bước, PASS/FAIL
  từng bước kèm exit code và thời lượng từng bước + tổng thời gian.
- Ngữ nghĩa exit code giữ nguyên tuyệt đối: `0` chỉ khi mọi bước được
  chọn đều pass; `1` khi có bước fail; `2` khi runner bị gọi sai (regex
  hỏng, script không tồn tại, bộ lọc không khớp bước nào) — gọi sai không
  bao giờ trông giống xanh.
- Lọc debug: `node test/run-all.js --filter <regex>` (hoặc truyền regex
  dạng positional), `--script <tên>` để đọc script khác (vd stage0:test),
  `--list` chỉ liệt kê. `--chain "<a> && <b>"` tồn tại **chỉ** để tự kiểm
  chứng runner (xem selftest) — chạy thường không dùng, để package.json
  luôn là nguồn sự thật.
- Cách thực thi bước: `spawn(command, {shell:true, stdio:'inherit'})` —
  đúng cách npm tự chạy script (sh trên POSIX, cmd.exe trên Windows),
  xuất log y hệt `npm test` hiện tại. Tách lệnh bằng tay (argv parser tự
  chế) mới là nguồn lệch ngữ nghĩa/trích dẫn, nên không dùng. Hệ quả cần
  biết: chuỗi được tách tại `' && '`, nên một bước **không được chứa**
  ` && ` bên trong — hiện đúng cho cả 188 bước (đã kiểm chứng: mọi bước
  là `node <file>`, `node --check <file>` hoặc `node <file> <args>`,
  không pipe/quote/metachar).

## 2. Diff package.json đề xuất cho điều phối

### Giai đoạn 1 — cộng thêm, rủi ro CI bằng 0 (áp ngay được)

```diff
     "stage0:test": "node stage0-measure/test.js && …",
+    "test:all": "node test/run-all.js",
```

và nối bước tự kiểm chứng vào cuối chuỗi `test` hiện tại (bước này chạy
runner qua `--chain` giả lập, không đệ quy):

```diff
-    "test": "… && node --check stage0-measure/run-runtime-egress.js",
+    "test": "… && node --check stage0-measure/run-runtime-egress.js && node test/run-all-selftest.js",
```

**Cảnh báo đệ quy:** không bao giờ thêm `node test/run-all.js` làm một
bước bên trong chuỗi `test` — runner đọc chính chuỗi đó.

### Giai đoạn 2 — tuỳ chọn, sau một chu kỳ CI xanh với `test:all`

```diff
-    "test": "<chuỗi && 188 bước>",
+    "test": "node test/run-all.js",
+    "test:chain": "<chuỗi && 188 bước>",
```

kèm thay đổi một dòng bắt buộc trong `test/run-all.js` (nếu không sẽ đệ
quy vô hạn, vì mặc định runner đọc `scripts.test`):

```diff
-  const opts = { script: 'test', filter: null, chain: null, list: false };
+  const opts = { script: 'test:chain', filter: null, chain: null, list: false };
```

### Phân tích tương thích CI Windows

- `windows-exe.yml` (dòng 23) chạy `npm test` và chỉ dựa vào exit code →
  cả hai giai đoạn đều tương thích, **không cần sửa workflow**.
- Trên Windows hai fixture QA-006 pass (chúng chỉ fail trên Linux), nên
  CI hôm nay xanh thế nào thì với runner vẫn xanh đúng thế ấy — runner
  không đổi kết quả bước nào, chỉ không còn che bước sau bước fail.
- Log CI dài hơn (tiêu đề từng bước + bảng tổng kết cuối) nhưng là text
  thuần, stdio kế thừa nên thứ tự log không đổi. Chi phí phụ: một lần
  spawn shell mỗi bước — tại máy Linux này toàn chuỗi 188 bước chạy hết
  106,4s wall; phần phụ trội của runner là không đáng kể so với thời
  lượng các bước.

## 3. Kết quả chạy thật trên nền f4d7329 (Linux, Node v24.20.0)

`node test/run-all.js` → exit 1, tổng kết nguyên văn:

```text
steps run: 188 of 188 | PASS: 185 | FAIL: 3 | wall time: 106.4s
FAIL  step 31   exit 1  node test/browser-diagnostics.js   (QA-006, fixture Windows — đã biết)
FAIL  step 108  exit 1  node test/license-center.js        (mới — xem Mục 4)
FAIL  step 116  exit 1  node test/runtime-registry.js      (QA-006, fixture Windows — đã biết)
```

Đối chiếu kỳ vọng 186/188 của các đợt trước: khớp ở 187/188 bước. Lệch
duy nhất là bước 108 — **không phải hồi quy của nền mới và không phải
lỗi runner**, xem mục dưới. Selftest: 4/4 khẳng định PASS (bước fail ở
giữa không chặn bước sau; filter chọn đúng tập con; filter không khớp →
exit 2; toàn pass → exit 0).

## 4. PHÁT HIỆN NGOÀI PHẠM VI — license-center.js fail ngắt quãng (~6%)

Giao lại cho chủ sở hữu test license; Agent 11 **không tự sửa** (ngoài
phạm vi), chỉ bàn giao chẩn đoán đã kiểm chứng:

- Triệu chứng: `node test/license-center.js:27` —
  `assert.throws(() => manager.activate(signed.slice(0,-2)+'AA'), /signature|encoding/)`
  thỉnh thoảng báo *Missing expected exception*.
- Cơ chế (đã đo): phép "làm giả" thay 2 ký tự cuối token bằng `AA`.
  Chữ ký Ed25519 kết thúc bằng scalar S < 2^252 nên byte cuối của chữ ký
  rất nhỏ; hai ký tự base64url cuối chứa ít bit có nghĩa. Thay bằng `AA`
  đôi khi **không đổi byte giải mã nào** → token "đã sửa" vẫn là token
  hợp lệ → `activate()` thành công → không có exception. Thăm dò 3000
  lần: 187 lần (6,2%) token sửa vẫn verify, và 187/187 trường hợp đó
  byte giải mã trùng khớp hoàn toàn (không có bất thường mật mã nào —
  scheme chữ ký không có vấn đề; phép làm giả của test mới không tin
  cậy). Chạy độc lập lặp lại: fail 2/24 lần, khớp tỉ lệ trên.
- Vì sao các đợt trước không thấy: các lần chạy toàn chuỗi đã ghi nhận
  (186/188) đều là những lần "trúng" 94% còn lại.
- Sửa đề xuất (một dòng, thuộc chủ sở hữu test): làm giả ở ký tự có đủ
  6 bit có nghĩa ở giữa đoạn chữ ký thay vì 2 ký tự cuối — ví dụ đổi ký
  tự tại vị trí cố định trong đoạn thứ ba của token thành một ký tự
  base64url khác chắc chắn khác, hoặc lật byte đầu của chữ ký rồi mã
  hoá lại. Sau sửa, test phải fail 0/nhiều-trăm lần chạy lặp mới coi là
  hết ngắt quãng.
