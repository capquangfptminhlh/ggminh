# APPLY-GUIDE — Bộ file workflow sẵn sàng áp cho `.github/workflows/`

- **Người soạn:** Agent 2 (đợt thương mại hoá), trên nền `integration/v5.8-phase-c`
  local @ `f4d7329`.
- **Vì sao cần bộ file này:** token GitHub App của trợ lý không có quyền ghi
  `.github/workflows` (API trả 403). Nhánh `integration/v5.8-phase-c` trên
  GitHub hiện giữ workflow của `main`. Chủ dự án (tài khoản chủ repo, có git
  thật) chép hai file trong thư mục này vào `.github/workflows/` là áp xong.
- **Kỷ luật:** hai file dưới đây là bản HOÀN CHỈNH (không phải patch rời) —
  chép đè là đủ, không cần `git apply`.

## 1. Bộ file gồm gì và nguồn gốc từng dòng

### 1.1 `windows-exe.yml` — giống hệt cây local, khác bản trên GitHub ở 2 điểm

File giao = nguyên văn `.github/workflows/windows-exe.yml` trong cây local
@ `f4d7329`. So với bản đang chạy cho PR #18 trên GitHub (bản của `main`
@ `77075f3`), chỉ khác:

1. **Thêm bước "Verify external bundled engine staging"** (sau bước kiểm
   chứng Win32 helper): kiểm tra tài nguyên engine đóng gói ngoài trong
   bản dựng (chi tiết điều kiện ở Mục 3 dưới đây).
2. **Bước chụp giao diện Electron kỳ vọng thêm 1 ảnh**
   `workspace-engine-provider-preview.png` (4 ảnh thay vì 3).

Ngoài hai điểm này, file trùng khớp từng dòng. Nhánh D1
(`feature/d1-camoufox-per-profile-identity` @ `7f13c3f`) cũng đang giữ đúng
bản này — áp lên nhánh nào cũng không mất việc của luồng kia.

### 1.2 `camoufox-upstream-smoke.yml` — bản local + bản vá + 1 dòng trigger

File giao được dựng bằng cách áp thật
`tools/patches/camoufox-smoke-configured-steps.patch` lên bản local
(`git apply` sạch, không xung đột), rồi cộng đúng **một dòng**
`integration/v5.8-phase-c` vào danh sách nhánh kích hoạt `push`. Nội dung
bản vá cộng vào:

- Nhánh trigger `feature/d1-camoufox-per-profile-identity` + 3 đường dẫn
  trigger (`src/engine/camoufoxIdentity.js`, `src/health/signalChain.js`,
  `tools/generate-camoufox-identity.mjs`).
- Ba bước mới ở cuối job: sinh hai danh tính ghim bằng generator chính
  thức (en-US/America/New_York và vi-VN/Asia/Ho_Chi_Minh) → chạy
  `stage0-measure/run-config.js` đo hai hồ sơ có cấu hình qua controller →
  đăng artifact báo cáo đã cấu hình.

**Đối chiếu với nhánh D1 (quan trọng — tránh áp đè mất việc):** bản smoke
trên D1 @ `7f13c3f` là **byte-identical** với kết quả áp bản vá (cùng blob
`e1ac324`): luồng của chủ dự án đã áp đúng nội dung bản vá này lên D1. File
giao tại đây so với bản D1 **chỉ khác đúng một dòng** trigger
`integration/v5.8-phase-c` nêu trên. Áp file này lên bất kỳ nhánh nào trong
hai nhánh cũng là phép cộng, không xoá nội dung nào của luồng kia.

## 2. Cách áp bằng git thật (chủ dự án thực hiện)

```bat
git fetch origin
git checkout integration/v5.8-phase-c
git pull origin integration/v5.8-phase-c
copy /Y release\workflows\windows-exe.yml .github\workflows\windows-exe.yml
copy /Y release\workflows\camoufox-upstream-smoke.yml .github\workflows\camoufox-upstream-smoke.yml
git add .github/workflows/windows-exe.yml .github/workflows/camoufox-upstream-smoke.yml
git commit -m "ci: apply full workflow set (staging verify + configured stage-0 steps + integration branch trigger)"
git push origin integration/v5.8-phase-c
```

(`release/workflows/` nằm trong nhánh `agent-2/workflows-ready` của đợt
triển khai; lấy hai file từ đó chép sang checkout của nhánh tích hợp.)

## 3. Cảnh báo: PR #18 sẽ chạy thêm bước staging-verify — điều kiện để nó đạt

Ngay sau lần push áp dụng, PR #18 (head = chính nhánh này) chạy lại
workflow "Build Windows EXE" **theo file mới**, tức có thêm bước
"Verify external bundled engine staging". Bước đó chỉ đạt khi toàn bộ điều
kiện staging sau đúng trong bản dựng — tất cả hiện đang đúng trong cây
nguồn, và phải GIỮ đúng khi phát hành:

1. `resources/bundled-engines/` (ánh xạ `extraResources` →
   `resources/lhm-engines`) tồn tại và chứa `README.md`.
2. `resources/camoufox-engine/` (→ `resources/lhm-camoufox`) tồn tại, chứa
   `README.md`, và thư mục staging đóng gói **không** chứa
   `camoufox.exe`, `release.json` hay `publisher-ed25519.pub` — workflow
   cố ý fail nếu có: bản Preview chưa được chứa tài sản Camoufox thương
   mại chưa duyệt. Khi nào chủ dự án muốn đóng gói engine thật, bước này
   phải được sửa cùng quyết định phát hành engine, không nới riêng lẻ.
3. `tools/extract-signed-engine.ps1` và `src/ops/windowControl.ps1` phải
   nằm trong `app.asar.unpacked` (đã khai trong `asarUnpack` của
   `package.json`).
4. Không được để thư mục `resources/bundled-engines/` lọt vào trong
   `app.asar.unpacked/resources/` (workflow kiểm tra cả chiều trùng lặp).
5. `src/engine/bundledEngineManager.js` phải nạp được bằng Node thuần
   (bước kiểm tra cuối của staging-verify).
6. Bước chụp giao diện phải sinh đủ 4 ảnh `dist/workspace-*.png` (gồm ảnh
   engine-provider mới).

## 4. Lỗi đã biết ở bước đo có cấu hình — đọc trước khi kỳ vọng cổng 2

Bằng chứng thật: trên nhánh D1, run smoke `39614246764` (2026-10-21, ngay
sau khi bản vá được áp ở đó) **fail tại bước 16/18 "Generate two pinned
identities with the official launcher"**; 15 bước trước đó đều success,
bước đo cấu hình (17) và bước kiểm chứng cuối (19) bị skipped.

Cơ chế (đã kiểm chứng bằng đối chiếu code trên cả hai cây): bước generate
kỳ vọng thư mục `$RUNNER_TEMP/lhm-camoufox-runtime` đã chứa sẵn
`node_modules/camoufox`, và tự throw
`Pinned camoufox launcher runtime missing` nếu không có. **Không bước hay
script nào trong repo tạo thư mục prefix đó** — bước cài đặt hiện tại cài
`camoufox@0.5.8` vào thư mục gốc của repo, không phải vào prefix kia.
(Nhật ký chi tiết của bước cần quyền đọc Actions logs; điểm fail và cơ chế
guard là phần đã xác lập được.)

Hệ quả khi áp nguyên trạng bộ file này lên nhánh tích hợp: smoke workflow
sẽ chạy và fail tại đúng bước đó; phép đo có cấu hình vẫn **NOT_RUN** ở mức
CI cho tới khi sửa. Cách sửa tối thiểu dưới đây là TUỲ CHỌN — **không** nằm
trong file đã giao (để giữ file trùng khớp với bản D1), chủ dự án duyệt
mới áp: thêm vào đầu bước "Generate two pinned identities with the
official launcher", TRƯỚC đoạn guard `if(!(Test-Path ...))`:

```diff
       - name: Generate two pinned identities with the official launcher
         shell: pwsh
         run: |
           $ErrorActionPreference='Stop'
           $runtime=Join-Path $env:RUNNER_TEMP 'lhm-camoufox-runtime'
+          if(!(Test-Path (Join-Path $runtime 'node_modules/camoufox'))){
+           npm install --prefix $runtime --no-save --no-package-lock `
+            --ignore-scripts --no-audit --no-fund camoufox@0.5.8 playwright-core@1.62.0
+           if($LASTEXITCODE -ne 0){throw 'Install pinned launcher runtime failed'}
+          }
           if(!(Test-Path (Join-Path $runtime 'node_modules/camoufox'))){
            throw 'Pinned camoufox launcher runtime missing'
           }
```

## 5. Cách xác nhận CI đã nhận workflow mới

1. **Build Windows EXE:** mở run mới nhất của PR #18 — danh sách bước phải
   có "Verify external bundled engine staging" (tổng 12 bước trong job
   `windows-installer`). Không có bước đó = GitHub vẫn đang chạy file cũ.
2. **Camoufox smoke:** vào tab Actions, workflow "Camoufox Windows
   upstream smoke (no redistribution)" phải xuất hiện run cho nhánh
   `integration/v5.8-phase-c` (lần push áp dụng tự kích hoạt vì chính file
   workflow nằm trong danh sách `paths` của trigger). Job phải có 18 bước,
   gồm 3 bước mới ở vị trí 16–18.
3. Nếu đã áp thêm sửa đổi ở Mục 4: run smoke đạt hết 18 bước và artifact
   `LHM-Stage0-Camoufox-Configured-Report` xuất hiện — đó là bằng chứng
   cổng 2 phần phép đo có cấu hình theo Mục 12 của Hiến pháp. Chưa áp sửa
   đổi đó thì trạng thái đúng phải ghi là: fail tại bước generate, phép
   đo có cấu hình NOT_RUN.
