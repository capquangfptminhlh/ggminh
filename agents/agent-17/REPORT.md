# BÁO CÁO AGENT 17 — Kiểm chứng xoá dữ liệu + diễn tập sao lưu

**Nhánh:** `agent-17/deletion-backup` từ nền `f4d7329` (nhánh tích hợp
`integration/v5.8-phase-c`). Môi trường bằng chứng (Mục 23): Linux,
Node v24.20.0, tầng Store/ConfigBackup thật của sản phẩm (không phải
EXE Windows — xem NOT_RUN). Chỉ dùng hồ sơ/marker tổng hợp.

**Công cụ:** `test/profile-deletion-backup-drill.js` (mới) — chạy:
`node test/profile-deletion-backup-drill.js`. Trước khi sửa, test này
FAIL tại đúng phát hiện F1; sau khi sửa PASS toàn bộ phần đã thực thi.

## Phần 1 — Giao thức xoá (Mục 17.3)

Hồ sơ tổng hợp được gán dữ liệu phiên giả (marker) trong **mọi** thư
mục theo-hồ-sơ mà ứng dụng ghi dưới gốc lưu trữ: `profiles/`,
`gecko-profiles/`, `camoufox-profiles/`, `extensions/`. Ba đường xoá
được diễn tập: thùng rác → purge thủ công; thùng rác (lùi 31 ngày) →
purge hết hạn; xoá trực tiếp. Sau mỗi đường, quét toàn cây lưu trữ tìm
id, tên, marker ghi chú và marker phiên; một hồ sơ đối chứng phải
nguyên vẹn.

### F1 — LỖI THẬT (đã sửa): purge không xoá thư mục phiên Camoufox và extension

- `CamoufoxPlaywrightController` (main.js:856 truyền `storageDir` làm
  gốc) và `camoufoxAdapter.js` đặt phiên Camoufox tại
  `camoufox-profiles/<id>`; `browserLauncher.js:161` vật liệu hoá
  extension riêng tại `extensions/<id>` mỗi lần mở hồ sơ.
- Nhưng `Store.cleanupTrashedFolders()` và `Store.deleteProfile()`
  chỉ xoá `profiles/` + `gecko-profiles/`. Hệ quả đo được: **purge
  một hồ sơ Camoufox để lại nguyên vẹn toàn bộ dữ liệu phiên của nó**
  (cookie/localStorage trong `camoufox-profiles/<id>`) và bản sao
  extension (`extensions/<id>`) trên đĩa vô thời hạn — mâu thuẫn trực
  tiếp với cam kết của đường thùng rác ("không chạm thư mục phiên
  *cho tới* xoá vĩnh viễn" — ngụ ý xoá vĩnh viễn phải xoá chúng).
- Tái hiện: drill FAIL trước sửa — `purge: leftover directory
  camoufox-profiles/<id>` (cả 3 đường xoá đều dính).
- **Sửa** (`src/db/store.js`, đúng phạm vi được giao): hằng số
  `PROFILE_DATA_ROOTS = ['profiles','gecko-profiles',
  'camoufox-profiles','extensions']` dùng chung cho
  `cleanupTrashedFolders()` và `deleteProfile()`. Sau sửa: cả 3
  đường xoá PASS, quét toàn cây = 0 dấu vết của hồ sơ đã xoá (id/tên/
  marker không còn trong bất kỳ file nào, gồm db.json), hàng đợi
  cleanup rỗng, hồ sơ đối chứng nguyên vẹn.

### Phần còn lại của giao thức — ĐẠT như thiết kế đã tuyên bố

- Thùng rác **không** chạm thư mục phiên (đúng thiết kế khôi phục
  30 ngày); bản ghi hồ sơ nằm trong `db.json` mục trash cho tới purge.
- Sau purge, bản ghi (gồm blob danh tính trong trash) biến mất khỏi
  db.json — quét nội dung xác nhận.

### F3 — Dấu vết còn lại theo thiết kế riêng, cần chủ dự án quyết (chưa sửa)

Snapshot phiên do người dùng chủ động tạo (`session-snapshots/<id>/
*.lhmsnap` — bản sao dữ liệu phiên, có mã hoá) **không** bị purge
động tới: drill ghi nhận snapshot của hồ sơ đã purge vẫn còn nguyên.
Đây là hiện vật người dùng tạo có chủ đích (điểm khôi phục), nhưng nó
chứa dữ liệu phiên — "xoá vĩnh viễn" hiện không bao gồm nó và UI
không nói rõ điều đó ở thao tác purge. Đề xuất ở INTEGRATION-NOTES.

### F4 — Tham chiếu workflow treo sau purge (chưa sửa, ngoài phạm vi file được giao)

Thử nghiệm bổ sung xác nhận: workflow trong
`automation-workflows.json` tham chiếu id hồ sơ đã purge vẫn còn
nguyên, không đường code nào dọn. Workflow không chứa dữ liệu phiên,
nhưng là dấu vết id + tham chiếu treo (chạy workflow đó sẽ trỏ vào
hồ sơ không tồn tại). Đề xuất ở INTEGRATION-NOTES.

### Giới hạn của kết luận xoá (đúng Mục 17.3)

Kết luận chỉ ở phạm vi cây dữ liệu ứng dụng quản lý: không tuyên bố
về bản sao phía hệ điều hành (thùng rác OS, bản sao lưu hệ thống,
dữ liệu đã đồng bộ ra ngoài) và không tuyên bố về phía máy chủ.

## Phần 2 — Diễn tập sao lưu qua đường thật của ứng dụng — PASS

Dùng đúng `ConfigBackup` + định dạng file thật của sản phẩm
(AES-256-GCM/scrypt, hậu tố "(nhập)", id mới khi nhập):

- Export từ store nguồn (2 hồ sơ + 1 workflow, marker phiên được
  trồng trong thư mục phiên của hồ sơ nguồn) → import vào store
  trống: **khôi phục đúng cấu hình từng hồ sơ** (proxy host/port,
  ghi chú, tags, nhóm, marker trong fingerprint), workflow được ánh
  xạ sang id mới, giá trị bước "fill" đã bị xoá trắng trong bản sao.
- **Không mang theo phiên**: store đích không xuất hiện thư mục
  phiên nào cho hồ sơ đã nhập; quét toàn cây đích không có marker
  phiên của nguồn — khớp tuyên bố `excludesSessions: true`.
- Sai mật khẩu → bị từ chối, store đích nguyên vẹn (0 hồ sơ).
- Sửa 1 byte trong ciphertext → bị từ chối (GCM auth), store đích
  nguyên vẹn.

## Phần 3 — Gỡ cài đặt — NOT_RUN (chỉ phân tích cấu hình)

Không có EXE Windows trong môi trường này nên **không chạy**
uninstaller thật. Phân tích cấu hình đóng gói trong repo
(`package.json` → `build.nsis`): tuỳ chọn
`deleteAppDataOnUninstall` **không được đặt** (mặc định của
electron-builder là `false`) → theo cấu hình, gỡ cài đặt chỉ xoá
file chương trình; **toàn bộ cây lưu trữ**
(`AppData\Roaming\LHM Ads Browser\storage` — hồ sơ, phiên, db.json)
**còn nguyên** cho tới khi người dùng tự xoá. Điều này nhất quán với
sổ tay khách hàng của Agent 14 (đã hướng dẫn xoá thư mục dữ liệu thủ
công), nhưng cần nghiệm thu trên máy Windows (cổng 3) để xác nhận
hành vi thật của bộ cài.

## Hồi quy

Sau khi sửa: `test/profile-trash.js`, `test/backup-transaction.js`,
`test/store-persistence.js`, `test/security.js`,
`test/browser-engines.js`, `test/integration-wiring.js`,
`stage0-measure/test.js`, `stage0-measure/test-isolation.js` — **tất
cả PASS**.

## NOT_RUN tổng hợp

- Xoá/gỡ trên EXE Windows đã cài (cổng 3): purge qua UI thật,
  uninstaller thật, đường dẫn AppData thật.
- Xoá dữ liệu phiên Camoufox qua controller thật trên Windows
  (drill ở tầng Store với thư mục tổng hợp đúng tên/gốc mà
  controller dùng — đã đối chiếu main.js:856).
