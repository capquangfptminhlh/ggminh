# APPLY-PROCEDURE — Quy trình áp bộ workflow khép Gate 2 (chủ dự án thực hiện)

- **Người soạn:** Agent R1 (đợt chuẩn bị phát hành), trên nền
  `integration/v5.8-phase-c` local @ `f280296`.
- **Ai áp:** chủ repo, bằng git thật và tài khoản có quyền push của chính
  mình (đúng tuyến QD-04 phương án 1: chủ dự án tự áp, không chia sẻ
  PAT). Token của trợ lý không có quyền ghi `.github/workflows` — đây là
  lý do bộ file này tồn tại.
- **Lấy file ở đâu:** thư mục `release/gate2-final/` trên nhánh
  `agent-r1/gate2-final` trong clone tích hợp của điều phối viên. Chỉ
  hai file `.yml` có tên chuẩn dưới đây được chép; các file `.md` và
  bản `.without-fix.yml` là tài liệu duyệt, không chép.

## 1. Các bước áp (Windows, tại checkout của nhánh tích hợp)

```bat
git fetch origin
git checkout integration/v5.8-phase-c
git pull origin integration/v5.8-phase-c
copy /Y release\gate2-final\windows-exe.yml .github\workflows\windows-exe.yml
copy /Y release\gate2-final\camoufox-upstream-smoke.yml .github\workflows\camoufox-upstream-smoke.yml
git add .github/workflows/windows-exe.yml .github/workflows/camoufox-upstream-smoke.yml
git commit -m "ci: apply Gate 2 final workflows (staging verify + configured stage-0 steps + runtime-prefix fix)"
git push origin integration/v5.8-phase-c
```

Lưu ý:

- Chép file có tên đúng `camoufox-upstream-smoke.yml` — đó là bản ĐÃ
  sửa (bản khuyến nghị). **Không** chép
  `camoufox-upstream-smoke.without-fix.yml`: bản đó giữ lại chỉ để diff
  đối chiếu; áp nó là tái tạo lỗi fail tại bước generate đã biết.
- Nhánh `integration/v5.8-phase-c` trên GitHub hiện là lịch sử snapshot
  phẳng (head `f549a63`), clone local của điều phối viên giữ lịch sử đầy
  đủ (`f280296`) — hai phía sẽ hội tụ ở bước hoà giải Gate 4. Nội dung
  hai file workflow là một, bất kể lịch sử nào mang chúng.
- Lần push áp dụng tự kích hoạt cả hai workflow: "Build Windows EXE"
  qua PR #18 (trigger `pull_request`), và smoke workflow qua trigger
  `push` (chính file smoke nằm trong danh sách `paths` của nó, và nhánh
  tích hợp nằm trong danh sách nhánh trigger).

## 2. Tín hiệu CI chứng minh phần phép đo của Gate 2 đã khép

Kiểm tra theo thứ tự; cả 5 tín hiệu đầu phải có:

1. **Build Windows EXE:** run mới nhất của PR #18 chạy theo file mới —
   job `windows-installer` có **12 bước**, trong đó có bước "Verify
   external bundled engine staging", và bước chụp giao diện kỳ vọng đủ
   4 ảnh. Run kết thúc SUCCESS, có 2 artifact
   `LHM-Ads-Browser-Windows-x64` và `LHM-Workspace-UI-Preview`. (Nếu
   bước staging-verify fail, kiểm 6 điều kiện staging ở Mục 3 của
   `release/workflows/APPLY-GUIDE.md` trước khi nghi workflow — cả 6
   điều kiện đã được kiểm chứng đang đúng tại `f280296`.)
2. **Smoke workflow xuất hiện:** trong tab Actions có run của workflow
   "Camoufox Windows upstream smoke (no redistribution)" cho nhánh
   `integration/v5.8-phase-c`.
3. **Bước generate đạt:** bước "Generate two pinned identities with the
   official launcher" (bước YAML 15/18; bước 16 trên giao diện GitHub —
   đúng bước đã fail trong run D1 `39614246764`) kết thúc SUCCESS. Đây
   là tín hiệu trực tiếp cho thấy bản sửa prefix có tác dụng.
4. **Bước đo chạy thật:** bước "Measure two configured Camoufox
   profiles through the selective controller" ở trạng thái đã chạy
   (không phải skipped), và bước cuối "Verify no upstream browser
   binary entered the shipping source tree" cũng chạy.
5. **Có báo cáo:** artifact `LHM-Stage0-Camoufox-Configured-Report` đính
   kèm run; mở `stage0-config-report.json` bên trong để đọc kết luận
   của chính phép đo. (Bước upload đặt `if-no-files-found: ignore` nên
   sự hiện diện của artifact là bằng chứng bổ trợ; hai tín hiệu quyết
   định là mục 3 và 4.)

**Kỷ luật diễn giải:** nếu bước đo làm run fail, đó là KẾT QUẢ của phép
đo (hai hồ sơ có cấu hình không đạt), không phải lỗi workflow. Phần
workflow của Gate 2 khép lại khi phép đo chạy trọn vẹn đầu-cuối trên CI
và sinh được báo cáo; kết luận của phép đo sau đó được xét trên bằng
chứng của chính nó theo Mục 12/23 của Hiến pháp
(`TIEU-CHI-SAN-PHAM.md`).

## 3. Rollback

Hai file workflow độc lập với mọi trạng thái khác của cây: revert đúng
commit áp dụng là khôi phục `windows-exe.yml` của `main` và gỡ file
smoke, không ảnh hưởng gì thêm.
