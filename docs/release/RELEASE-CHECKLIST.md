# RELEASE-CHECKLIST — LHM Ads Browser v5.8.0

Checklist đóng băng phát hành, neo theo **Hiến pháp Mục 12** (chuỗi
cổng nghiệm thu — thứ tự bắt buộc, không bỏ qua, không đảo thứ tự)
và **Mục 23** (mọi kết quả nghiệm thu phải gắn với commit + hash
engine + hệ điều hành/môi trường + cấu hình + số trường đo được).

**Quyết định Hiến pháp v1.4 (2026-10-22):** không bắt buộc ký
Authenticode cho EXE/installer Windows để phát hành thương mại.
Giữ nghiệm thu Windows thật, checksum SHA-256, công bố nguy cơ cảnh báo
SmartScreen/Defender và bảo vệ xác minh engine/manifest/cập nhật.
Không đánh dấu sẵn sàng thương mại chỉ nhờ miễn chữ ký EXE.

**Trạng thái tổng thể hiện tại: NOT_READY** — Gate 1 đạt, Gate 2
đạt một nửa (build/hồi quy), Gate 3 và Gate 4 chưa thực hiện.
Các ô `____` là chỗ điền bằng chứng tại thời điểm thực thi; không
điền trước, không điền thay bằng kết quả của cây code khác.

| Trường | Giá trị / chỗ điền |
|---|---|
| Phiên bản | 5.8.0 |
| Cây tích hợp local | `integration/v5.8-phase-c` @ `f280296` |
| Bản chụp GitHub của cây tích hợp | `f549a63` (snapshot — xem runbook) |
| Nền so sánh | `main` công khai v5.7.0 @ `77075f3` |
| Người thực thi đóng băng | ____ |
| Ngày bắt đầu đóng băng | ____ |

---

## Gate 1 — Test cục bộ trên code của chính nhánh (Mục 12.1)

**Trạng thái: ĐẠT** (ở tầng Linux; được xác nhận chéo bởi Gate 2
phần build trên Windows — xem dưới).

Bằng chứng hiện có:

- Chuỗi `npm test` = **201 bước** (đếm từ `package.json` của cây
  tích hợp, không đổi từ khi tích hợp Wave 2).
- Chạy độc lập bởi Agent 20 (QA) trên clone sạch của `f280296`
  (`npm ci`, 483 gói): **199 PASS / 2 FAIL, 43,4 giây**.
- Cả 2 FAIL đã đọc code để xác minh cơ chế — đều là fixture phụ
  thuộc nền tảng Windows, không phải lỗi sản phẩm, và delta Wave 2
  không chạm file nào của chúng:
  - `browser-diagnostics`: fixture dùng đường dẫn `C:\...`, hàm
    `path.isAbsolute` của POSIX loại trước khi tới mock tồn tại
    file (`src/engine/browserDiagnostics.js`).
  - `runtime-registry`: cổng kiểm tra đường dẫn ổ đĩa chạy trước
    bước kiểm tra tên binary trong khi file tạm của test nằm ở
    `/tmp` POSIX (`src/engine/runtimeRegistry.js`).
- Sáu điểm sửa nổi bật được QA kiểm độc lập, đều PASS: khung
  checklist bất đồng bộ; xoá đủ 4 gốc dữ liệu; kho quan sát IP giữ
  cả hai tính chất (ghi nguyên tử + nhãn nguồn); file license hỏng
  fail-closed; thu gọn payload API; license-center 0 fail trong 35
  lần chạy lặp của QA.

Điền khi đóng băng (bắt buộc chạy lại trên đúng commit đóng băng):

- [ ] Commit đóng băng cuối cùng: `____`
- [ ] Chạy `npm run test:all` trên commit đó — tổng số bước: ____ /
      PASS: ____ / FAIL: ____ (kèm giải thích từng FAIL)
- [ ] Không có thay đổi code nào sau lần chạy này (nếu có: chạy lại
      từ đầu Gate 1)

## Gate 2 — CI Windows trên nhánh, gồm cả phép đo (Mục 12.2)

### 2a. Build + hồi quy — **ĐẠT**

- Run: **39641363889**, commit `f549a63`, kết luận **Success**
  (đã mở trang run kiểm chứng trực tiếp).
- Chuỗi 201 bước PASS trọn trên Windows — qua đó hai fixture ở
  Gate 1 được xác nhận dứt điểm là phụ thuộc nền tảng.
- Artifact: `LHM-Ads-Browser-Windows-x64`, 85,3 MB, ZIP digest
  `sha256:8e5ca8a62a4c38b121935886eef6148fdd5dc76caf9a4ba45a2a4703cf560634`;
  EXE cài đặt bên trong: 89.473.785 byte, SHA-256
  `54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497`.
- Artifact giao diện: `LHM-Workspace-UI-Preview`, 770 KB,
  `sha256:c340861ec5af2468fa08f95c3c8bffd0ce775ae101e442391dcac96af923e15e`.

### 2b. Phép đo hồ sơ-có-cấu-hình trên CI — **CHƯA ĐẠT**

- Cây local đã chứa bộ workflow hoàn chỉnh, nhưng **nhánh trên
  GitHub vẫn chạy workflow của `main`** (token của trợ lý không có
  quyền ghi `.github/workflows`): `windows-exe.yml` trên remote
  thiếu bước staging-verify và ảnh chụp giao diện thứ 4;
  `camoufox-upstream-smoke.yml` chưa tồn tại trên remote.
- Hai file bản cuối nằm ở `release/workflows/` kèm
  `release/workflows/APPLY-GUIDE.md` (hướng dẫn áp bằng git thật).
- Lỗi đã biết trước: bước "Generate two pinned identities" của
  smoke workflow chắc chắn fail trên CI vì không bước nào tạo thư
  mục runtime `$RUNNER_TEMP/lhm-camoufox-runtime` mà bước đó đòi
  (bằng chứng: run D1 `39614246764` fail tại bước 16). Bản sửa tối
  thiểu dạng diff nằm trong APPLY-GUIDE — chủ dự án duyệt riêng
  (liên quan QD-04), không tự ý gắn vào file giao.

Điền khi thực thi:

- [ ] Đã chép 2 file từ `release/workflows/` vào
      `.github/workflows/` và push bằng git thật — ngày: ____ /
      commit: `____`
- [ ] Quyết định về bản sửa bước generate: áp / không áp — ____
- [ ] Smoke run sau khi áp: run id `____` / kết luận ____ /
      số bước ____ (kỳ vọng 18 bước, có bước đo cấu hình)
- [ ] Artifact báo cáo đo cấu hình: tên ____ / digest `____`
- [ ] Cập nhật trạng thái tương ứng trong sổ đăng ký Mục 4 của
      Hiến pháp (chỉ chủ dự án sửa file tiêu chí — Mục 13)

## Gate 3 — Nghiệm thu trên máy Windows thật bằng EXE đã cài (Mục 12.3)

**Trạng thái: CHƯA THỰC HIỆN** — chưa có bằng chứng nào.
CI xanh ở Gate 2 **không** thay thế cổng này: đó là bằng chứng
build/hồi quy trên runner của GitHub, không phải bằng chứng sau
cài đặt trên máy độc lập.

Đối tượng nghiệm thu phải là đúng artifact của Gate 2a (SHA-256
EXE `54aec523…` ở trên), để chuỗi bằng chứng khép kín:
commit → CI → file cài → máy thật.

Phạm vi tối thiểu (gói nghiệm thu chi tiết do điều phối viên chuẩn
bị riêng; tóm tắt để checklist này tự đứng được):

- [ ] Cài đặt từ EXE: SmartScreen (bản không ký — ghi lại màn hình
      thực tế), đường dẫn cài, shortcut
- [ ] Tạo / mở / đóng hồ sơ Chromium và hồ sơ Camoufox (nếu đường
      engine cho phép ở thời điểm nghiệm thu — ghi rõ trạng thái
      engine thực tế, không suy diễn)
- [ ] Dữ liệu hồ sơ: tạo dữ liệu, đóng mở lại, xoá vào thùng rác,
      xoá hẳn — đối chiếu đủ 4 gốc dữ liệu
- [ ] Proxy: hồ sơ có proxy chạy qua đúng tuyến khai báo; cảnh báo
      IP xuất hiện đúng định dạng
- [ ] License: dùng thử bắt đầu đúng, kích hoạt token do người bán
      cấp, gia hạn, trạng thái hết hạn (chặn đúng, vẫn xem/sao
      lưu/khôi phục được)
- [ ] Windows Defender: quét bản cài và thư mục dữ liệu — ghi kết
      quả nguyên văn, không tự diễn giải
- [ ] Cập nhật: xác nhận ứng dụng **không** tự tải/cài cập nhật
      (đúng giới hạn đã công bố của bản này)
- [ ] Gỡ cài đặt: chương trình được gỡ; phần dữ liệu còn lại trên
      đĩa khớp với điều tài liệu khách hàng phần 05 đã viết
- [ ] Đối chiếu các mục F3/F4 (snapshot phiên do người dùng tạo,
      workflow còn tham chiếu hồ sơ đã xoá) trên máy thật

Điền khi thực thi:

- Máy nghiệm thu: ____ / Windows: ____ (bản dựng ____)
- Ngày nghiệm thu: ____ / Người nghiệm thu: ____
- Báo cáo đo: ____ / Ảnh chụp: ____ / Nhật ký: ____
      (đường dẫn lưu trữ gói bằng chứng)
- Kết luận Gate 3: ĐẠT / KHÔNG ĐẠT — lý do nếu KHÔNG ĐẠT: ____
- Chữ ký chủ dự án: ____

> Nếu Gate 3 KHÔNG ĐẠT: dừng đóng băng tại đây. Sửa trên nhánh
> tích hợp, chạy lại từ Gate 1 với artifact mới. Không vá trực
> tiếp lên artifact đã build. (Xem mục Hồi lui trong
> `TAG-AND-MERGE-RUNBOOK.md`.)

## Gate 4 — Tag và merge vào `main` (Mục 12.4)

**Trạng thái: CHƯA THỰC HIỆN** — chỉ chủ dự án quyết, sau khi
Gate 3 ĐẠT. Quy trình lệnh chi tiết: `TAG-AND-MERGE-RUNBOOK.md`.

Điền khi thực thi:

- [ ] Hoà giải các dòng phân kỳ hoàn tất (runbook bước 1–2) —
      commit hoà giải: `____`
- [ ] Kiểm toán cuối trước merge hoàn tất (runbook bước 3) —
      ngày: ____
- [ ] Ký engine/manifest hoàn tất hoặc ghi rõ không áp dụng cho
      bản này (runbook bước 4) — ____
- [ ] Merge vào `main` — commit merge: `____` / ngày: ____
- [ ] Tag `v5.8.0` tại: `____` (annotated, sau merge)
- [ ] Tag `v5.7.0` tại `77075f3` (đang thiếu trên remote — tạo bổ
      sung trong cùng phiên nếu chủ dự án duyệt): có / không ____
- [ ] CI trên `main` sau merge: run id `____` / kết luận ____
- [ ] Artifact build từ `main`: tên ____ / SHA-256 `____`
- [ ] Cài thử artifact đó trên máy Gate 3 (smoke): ĐẠT / KHÔNG ĐẠT

---

## Quyết định chính sách phải chốt trước khi đóng băng

Mỗi mục: ghi lựa chọn + ngày; hồ sơ chi tiết ở `docs/decisions/`
(QD-01..QD-04) và ghi chú tích hợp của Agent 12/17.

| Mục | Nội dung | Lựa chọn | Ngày |
|---|---|---|---|
| QD-01 | Hồ sơ Camoufox direct với `PREFLIGHT_ONLY`: giữ + cảnh báo rõ (khuyến nghị: phương án 3) | ____ | ____ |
| QD-02 | Khóa publisher riêng cho cả hai engine (khuyến nghị: phương án 1) | ____ | ____ |
| QD-03 | Cập nhật Hiến pháp Mục 4 + 17.2 theo bằng chứng đo (khuyến nghị: phương án 1) | ____ | ____ |
| QD-04 | Áp workflow + bản sửa bước generate (liên quan Gate 2b) | ____ | ____ |
| A12-D1 | Khi nào kiểm tra cập nhật (khuyến nghị: thủ công cho bản thương mại đầu) | ____ | ____ |
| A12-D2 | Kênh manifest cập nhật (GitHub Releases / CDN riêng) | ____ | ____ |
| A12-D3 | Khóa ký cập nhật dùng chung khóa publisher hay riêng (gắn với QD-02) | ____ | ____ |
| A12-D4 | Luồng áp cập nhật: chỉ thông báo / tải khi người dùng bấm (cấm cài lặng) | ____ | ____ |
| A17-F3 | Snapshot phiên do người dùng tạo có bị purge không + công bố trong UI | ____ | ____ |
| A17-F4 | Workflow còn tham chiếu hồ sơ đã xoá: dọn tự động hay để nguyên | ____ | ____ |
| Echo | Endpoint echo do LHM vận hành cho quan sát IP từ runtime (chưa có → tính năng giữ tắt) | ____ | ____ |

## Tài sản phát hành phải sẵn sàng trước Gate 4

- [ ] Buổi lễ khóa publisher production (ngoại tuyến, theo
      `docs/agents/agent-13/OWNER-RUNBOOK.md`): xong / chưa ____
- [ ] Cây Camoufox Windows chính thức: kiểm tra tên file hợp lệ
      với luật manifest **trước** khi ký (công cụ ký từ chối fail-
      closed nếu tên file chứa ký tự cấm — sửa tên file, không nới
      luật): xong / chưa ____
- [ ] Public key publisher đặt đúng vị trí trong bản đóng gói và
      đã kiểm chứng sau đóng gói: xong / chưa ____
- [ ] Icon sản phẩm: cung cấp file icon / quyết định giao với icon
      mặc định: ____
- [ ] Authenticode EXE/installer: **tùy chọn, KHÔNG phải cổng bắt buộc**
      (chủ dự án quyết định 2026-10-22 không mua). Nếu giao EXE
      không ký, kiểm tra tài liệu người dùng đã thông báo nguy cơ
      SmartScreen/Defender/chính sách máy chặn cài đặt: có ____
      (thiếu thông báo là lỗi truyền thông, không phải lỗi ký số).
      Không áp miễn trừ này cho engine manifest/cập nhật.
- [ ] Tên artifact: hiện chứa chữ `Preview`
      (`LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`) — giữ
      nguyên cho bản thương mại / đổi tên (đổi tên = sửa
      `package.json`, build lại, chạy lại Gate 2a + Gate 3):
      ____
