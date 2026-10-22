# INTEGRATION-NOTES — Agent R1: bộ workflow final khép Gate 2

- **Nhiệm vụ:** Wave R (chuẩn bị phát hành), Agent R1 — Gate 2 final
  workflow package.
- **Clone / nhánh:** `~/workspace/ggminh-release/r1`, nhánh
  `agent-r1/gate2-final`, base `f280296` (HEAD của clone nguồn đã được
  verify trước khi rẽ nhánh; repo nguồn `ggminh-integration` không bị
  đụng vào, `git status` sạch khi kết thúc).
- **Đầu vào:** bộ file của Agent 2 tại `release/workflows/` (commit
  `3b7fece`) + `APPLY-GUIDE.md` của chính bộ đó. Đã kiểm: không có thay
  đổi nào vào `release/workflows/`, `.github/workflows/`,
  `tools/patches/` trong khoảng `3b7fece..f280296` — bộ file giao còn
  nguyên trạng tại base.

## 1. Sản phẩm giao (thư mục `release/gate2-final/`)

| File | Vai trò | Git blob |
|---|---|---|
| `windows-exe.yml` | Bản final áp vào `.github/workflows/` — nguyên văn bản Agent 2 đã giao | `30d5ecc6d0cb780852df6b0f41d0452c2f3bda7e` |
| `camoufox-upstream-smoke.yml` | Bản final **có sửa** (khuyến nghị áp) — bản giao của Agent 2 + khối cài runtime-prefix 5 dòng | `36a002c0c1183461d5f203e65d9bcae7d0558757` |
| `camoufox-upstream-smoke.without-fix.yml` | Bản không sửa, chỉ để diff đối chiếu — **không áp** | `72eb2823b06730f69e063e86c20390d9f9222532` |
| `DIFF-EXPLANATION.md` | Giải thích từng dòng của bản sửa so với file D1 | — |
| `APPLY-PROCEDURE.md` | Quy trình áp chính xác cho chủ dự án + tín hiệu CI khép Gate 2 | — |
| `INTEGRATION-NOTES.md` | File này | — |

## 2. Nhật ký kiểm chứng (tất cả thực hiện trong clone này)

1. **windows-exe không đổi — PASS.** `cmp` ba chiều: bản final ==
   `release/workflows/windows-exe.yml` (bản Agent 2 giao) == file
   `.github/workflows/windows-exe.yml` trong cây local @ `f280296`.
2. **Tương đương blob `e1ac324` với file D1 — PASS, kiểm lại bằng 3
   đường độc lập:**
   - `git rev-parse 7f13c3f:.github/workflows/camoufox-upstream-smoke.yml`
     = `e1ac324ae20cecabb498c7862a9a921cd6437da7`.
   - File Agent 2 giao, xoá đúng 1 dòng trigger
     `      - integration/v5.8-phase-c` (dòng 10), hash thành đúng
     `e1ac324…`.
   - Áp thật `tools/patches/camoufox-smoke-configured-steps.patch` lên
     file local (blob tiền thân `37735e3…`) trong một repo scratch độc
     lập → kết quả hash `e1ac324…` và `cmp` byte-identical với
     `git show 7f13c3f:…`.
   Hệ quả: bản sửa là sai lệch có chủ đích DUY NHẤT ngoài 1 dòng
   trigger. Kiểm chứng bổ sung theo chiều ngược: bản final có sửa, xoá
   dòng 10 và khối 127–131, hash quay về đúng `e1ac324…`.
3. **Nguồn gốc bản sửa — PASS.** 5 dòng sửa được trích nguyên văn bằng
   script từ khối diff ở Mục 4 của `APPLY-GUIDE.md` (không gõ lại), chèn
   ngay trước guard cũ, neo theo đúng hai dòng ngữ cảnh của guide
   (`$runtime=Join-Path …` và guard `Pinned camoufox launcher runtime
   missing`). Diff bản có sửa vs không sửa = đúng 5 dòng cộng, 0 dòng
   sửa/xoá.
4. **YAML + số bước — PASS.** Parse bằng PyYAML 6.0.1 cho cả ba biến
   thể và cho cả hai file sau khi áp diễn tập: job `windows-installer`
   = **12 bước**; job `real-windows-camoufox` = **18 bước** ở cả bản có
   sửa và không sửa (bản sửa cộng dòng trong một bước, không cộng
   bước). Bước generate là bước YAML 15/18 = bước 16 trên giao diện
   GitHub — đúng vị trí đã fail ở run D1 `39614246764`.
5. **Diễn tập áp lên `main` — PASS.** Trong repo scratch độc lập: trích
   `.github/workflows/` của `main` @ `77075f3` (chỉ có
   `windows-exe.yml`, blob `d3048197…`), chép hai file final vào, sinh
   patch (236 dòng), reset về trạng thái main, `git apply --check`
   sạch, `git apply` thành công, cả hai file sau áp byte-identical với
   bản giao.
6. **Kiểm kê file được tham chiếu — PASS.** 30 token đường dẫn duy nhất
   trích từ hai file final: mọi tham chiếu mã nguồn thật đều tồn tại
   tại `f280296` (kèm `src/engine/bundledEngineManager.js` cho
   `require()` không đuôi). Các token còn lại đều là đường dẫn sản phẩm
   đóng gói dưới `dist/win-unpacked/` do chính workflow kiểm tra lúc
   chạy CI; bản nguồn tương ứng đều có (`resources/bundled-engines/
   README.md`, `resources/camoufox-engine/README.md`,
   `tools/extract-signed-engine.ps1`, `src/ops/windowControl.ps1`),
   `package.json` có đủ ánh xạ `extraResources` và `asarUnpack` (chứa
   đúng hai file `.ps1` trên), và có script `test` + `build:win`.
7. **Vệ sinh phạm vi — PASS.** `.github/` trong cây này không bị đụng
   (diff rỗng); `release/workflows/` giữ nguyên làm hồ sơ gốc; thư mục
   scratch diễn tập đã xoá; không push/merge/tag.

## 3. Bẫy đã gặp và đã xử lý (ghi lại cho người sau)

Lần diễn tập áp patch đầu tiên chạy `git apply` từ một THƯ MỤC CON của
repo: git **âm thầm bỏ qua** file patch nằm ngoài tiền tố thư mục hiện
tại và vẫn thoát với mã 0 ("Skipped patch … / 0 files changed"). Kết
quả đó suýt bị ghi nhận nhầm là "áp sạch". Đã làm lại từ gốc một repo
scratch độc lập và đối chiếu bằng hash + `cmp`. Bài học: khi diễn tập
patch, luôn áp từ gốc repo và kiểm đầu ra "files changed", đừng chỉ
nhìn exit code.

## 4. NOT_RUN (nằm ngoài khả năng của đợt này)

- Hai workflow chạy thật trên runner Windows của GitHub — chỉ xảy ra
  sau khi chủ dự án áp và push (xem tín hiệu ở `APPLY-PROCEDURE.md`).
- Kết luận của chính phép đo có cấu hình (`stage0-config-report.json`)
  — chỉ có khi mục trên chạy; nếu phép đo fail thì đó là kết quả đo,
  không phải lỗi workflow.
