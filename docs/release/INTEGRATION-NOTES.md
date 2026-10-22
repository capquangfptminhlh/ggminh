# INTEGRATION-NOTES — Agent R19 (release freeze paperwork)

- **Nhánh:** `agent-r19/freeze-paperwork`, từ `f280296`
  (clone `~/workspace/ggminh-release/r19`, nguồn
  `~/workspace/ggminh-integration`).
- **Bản chất:** chỉ tài liệu, 0 dòng code. Điều phối viên chỉ cần
  merge nhánh; không có wiring, không sửa `package.json`, không
  chạm `.github/`.

## Đã giao (thư mục `docs/release/`)

| File | Nội dung |
|---|---|
| `CHANGELOG.md` | v5.8.0 so với v5.7.0 công khai `77075f3`: tính năng mới, 9 mục sửa lỗi (6 lỗi sản phẩm có tên + tách khóa ký + glob gói cài + flake của test), thay đổi hành vi, mục "Giới hạn đã biết" trung thực. |
| `RELEASE-CHECKLIST.md` | Checklist đóng băng neo Hiến pháp Mục 12 + 23: Gate 1 ĐẠT (bằng chứng A20), Gate 2a ĐẠT (run 39641363889, digest artifact), Gate 2b CHƯA ĐẠT (workflow chưa áp + lỗi prefix bước generate), Gate 3/Gate 4 chưa làm — mỗi cổng có ô trống điền bằng chứng khi thực thi; bảng quyết định QD/A12/A17/echo; checklist tài sản phát hành. |
| `TAG-AND-MERGE-RUNBOOK.md` | Runbook chủ dự án tự chạy: bản đồ 3 lịch sử + 3 dòng phân kỳ, hoà giải → kiểm toán cuối → ký (engine; manifest cập nhật ghi rõ trạng thái chưa có công cụ ký) → merge lịch sử đầy đủ → tag; bảng hồi lui cho Gate 3 fail / CI sau merge đỏ / tag sai / manifest ký sai / lỗi sau giao khách. |
| `WHATS-IN-THE-BOX.md` | Một trang tồn kho giao hàng cho hỗ trợ: file cài, bên trong gói, chính sách engine, tài liệu/license giao kèm, dữ liệu trên máy khách. |

## Cách các tài liệu được dựng (nguồn sự thật đã dùng)

- Diff thật `77075f3..f280296` trong clone: 207 file (183 A /
  24 M), 90 commit; danh sách tính năng truy theo file/commit.
- Cả 6 lỗi sản phẩm được gọi tên đều đã **đọc lại code/commit để
  xác minh** trước khi viết: `e82e601` (locale `languages[0]`,
  `camoufoxProvisioning.js:110`), `c897f14` (khung checklist bất
  đồng bộ), `e3a6558` (`PROFILE_DATA_ROOTS`, `store.js:25`),
  `ec15fa5` (ghi nguyên tử + `.corrupt-*`,
  `exitIpObservations.js:65-89`), `c2a5977` (license hỏng
  fail-closed), `fb341a7` (đóng gateway hai lần).
- Số liệu Gate 2 lấy từ kiểm chứng của điều phối viên (run
  39641363889 Success tại `f549a63`, digest ZIP + SHA-256 EXE).
- Cấu hình đóng gói đọc trực tiếp từ `package.json` của cây tích
  hợp (artifactName, glob files, asarUnpack, builder 25.1.8,
  `camoufox@0.5.8` optionalDependency, chuỗi test = 201 bước).

## Điểm runbook cố tình quyết thay mặt quy trình (điều phối viên rà)

1. **Merge lịch sử đầy đủ của dòng local, KHÔNG merge nhánh
   snapshot GitHub vào `main`** — kèm lý do (snapshot là commit
   chụp cây phẳng; merge vào sẽ chôn 90 commit thật). Đây là
   khuyến nghị quy trình có ghi rõ, chủ dự án vẫn là người quyết
   ở Gate 4.
2. **Manifest cập nhật: runbook ghi "không thực hiện được"** thay
   vì bịa lệnh ký — vì `tools/sign-app-update.js` chưa tồn tại và
   `updateCheck.js` chưa nối vào app (đã grep xác minh `main.js`/
   `preload.js` không tham chiếu). Nếu điều phối viên muốn bản
   v5.8.0 có cập nhật ký, cần hạng mục xây công cụ ký riêng trước
   Bước 4 của runbook.
3. Head của nhánh selective **không ghi cứng**: tài liệu ghi cả
   hai số đã quan sát (`8c1ab69` do luồng chủ dự án báo /
   `67287ae` trong ref theo dõi của clone điều phối viên) và bắt
   Bước 1 của runbook fetch + ghi head thật. Head D1 `7f13c3f`
   thống nhất ở cả hai nguồn nên ghi trực tiếp.

## Kỷ luật câu chữ

CHANGELOG và WHATS-IN-THE-BOX (hai file có thể tới tay khách) đã
tự rà theo Mục 11: không phần trăm hiệu quả, không khẳng định về
đối thủ, không "an toàn để chạy Ads", không tuyệt đối hoá; các
giới hạn (không ký Authenticode theo quyết định 2026-10-22, chưa
Gate 3, engine không kèm gói, icon mặc định, các điểm CHƯA ĐO)
ghi thẳng trong thân tài liệu.
