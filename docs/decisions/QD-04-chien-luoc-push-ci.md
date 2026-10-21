# HỒ SƠ QUYẾT ĐỊNH QD-04 — Chiến lược push/CI cho nhánh tích hợp và bản vá workflow

- **Trạng thái:** CHỜ CHỦ DỰ ÁN QUYẾT ĐỊNH. Văn bản này là hồ sơ chuẩn bị quyết định, không phải quyết định.
- **Người soạn:** Agent 19 (đợt thương mại hoá), 2026-10-21.
- **Nền kiểm chứng:** nhánh `integration/v5.8-phase-c` @ `07150d6` trong clone cục bộ `~/workspace/ggminh-integration`.

## 1. Bối cảnh — sự thật đã kiểm chứng và nguồn

1. Toàn bộ kết quả đợt 10 agent + Đợt C nằm trên nhánh
   `integration/v5.8-phase-c` @ `07150d6` **chỉ tồn tại trong clone cục bộ**
   trên máy của hệ thống trợ lý — chưa từng được push. Đợt triển khai
   không có uỷ quyền push/merge/tag (kỷ luật đợt + Mục 9.4, 13.1 của Hiến
   pháp: thay đổi chỉ ở máy local "không được tính là đã làm" cho tới khi
   nằm trên một nhánh GitHub).
2. Cổng 2 của Mục 12 yêu cầu: *"CI Windows trên nhánh đó đạt, gồm cả các
   phép đo chạy trên runner Windows (không chỉ build/đóng gói)."* Muốn có
   bằng chứng cổng 2 cho nhánh tích hợp cần đồng thời hai thứ: (a) nhánh
   được push lên GitHub; (b) phép đo hồ sơ có cấu hình (configured
   measurement — sinh hai danh tính ghim bằng generator chính thức rồi đo
   qua controller) chạy được trên CI.
3. Phép đo (b) hiện **chỉ tồn tại dưới dạng bản vá chưa áp**:
   `tools/patches/camoufox-smoke-configured-steps.patch` (đã có trong
   repo) thêm hai bước vào `.github/workflows/camoufox-upstream-smoke.yml`:
   sinh hai danh tính (en-US/America/New_York và vi-VN/Asia/Ho_Chi_Minh)
   bằng generator chính thức, rồi chạy `stage0-measure/run-config.js` đo
   hai hồ sơ có cấu hình qua controller.
   Nguồn: nội dung file patch tại `07150d6` (Agent 19 đã đọc toàn bộ).
4. Token của GitHub App do trợ lý sử dụng **không có quyền ghi
   `.github/workflows`** (đã xác lập ở đợt PR #17: API trả 403 khi sửa
   file workflow). Hệ quả: trợ lý không thể tự áp bản vá này, và cũng
   không thể tự push nhánh tích hợp bằng token hiện tại.
5. Một chi tiết kỹ thuật trong chính bản vá: danh sách nhánh kích hoạt
   (trigger) mà bản vá thêm vào là `feature/d1-camoufox-per-profile-identity`
   — **không có** `integration/v5.8-phase-c`. Lịch sử tích hợp là hậu duệ
   trực tiếp của `8349f38` (đầu nhánh D1 trên GitHub), nên có hai cách
   khớp: push lịch sử tích hợp lên đúng tên nhánh D1 (fast-forward), hoặc
   bổ sung tên nhánh tích hợp vào danh sách trigger của bản vá trước khi
   áp. Nếu không xử lý chi tiết này, áp vá xong CI vẫn không tự chạy cho
   nhánh tích hợp (chỉ chạy khi bấm tay workflow_dispatch).
   Nguồn: hunk đầu tiên của file patch; cây commit của nhánh tích hợp.
6. Workflow còn lại, `.github/workflows/windows-exe.yml`, kích hoạt theo
   push vào `main`, theo pull_request và workflow_dispatch — một PR từ
   nhánh tích hợp sẽ chạy build EXE + `npm test` trên Windows, nhưng
   **không** chứa phép đo có cấu hình ở điểm 3. Tức là mở PR không thôi
   thì cổng 2 vẫn thiếu đúng phần "gồm cả các phép đo".
   Nguồn: `.github/workflows/windows-exe.yml:1-6` tại `07150d6`.
7. Cổng 3 (nghiệm thu EXE trên máy Windows thật của chủ dự án, có gói
   bằng chứng) và cổng 4 (chủ dự án quyết tag/gộp main) **không phụ thuộc**
   vào lựa chọn ở hồ sơ này về mặt kỹ thuật — cổng 3 cần máy Windows của
   chủ dự án trong mọi trường hợp. Nhưng thứ tự Mục 12 là bắt buộc:
   cổng 4 chỉ mở sau cổng 3, và cổng 3 đứng sau cổng 2.

## 2. Các lựa chọn

### Lựa chọn 1 — Chủ dự án tự push + tự áp bản vá bằng tài khoản của mình

- Nội dung: trợ lý chuẩn bị sẵn (i) bản vá đã bổ sung
  `integration/v5.8-phase-c` vào danh sách trigger, (ii) một hướng dẫn
  từng lệnh: lấy nhánh tích hợp về máy chủ dự án (hoặc trợ lý xuất file
  git bundle của nhánh để chủ dự án import), `git apply` bản vá, push
  nhánh, mở/cập nhật PR dạng Draft. Chủ dự án thực hiện bằng tài khoản
  GitHub của mình — tài khoản chủ repo không bị giới hạn quyền workflow.
- Hệ quả kỹ thuật: đầy đủ nhất — CI chạy cả build/test lẫn phép đo có
  cấu hình trên runner Windows; cổng 2 có thể khép lại bằng bằng chứng
  thật. Không tạo bề mặt credential mới nào.
- Hệ quả thương mại/vận hành: tốn ~15–30 phút thao tác tay của chủ dự án,
  một lần. Đây cũng là lần đầu code của đợt tích hợp rời khỏi máy trợ lý
  — đúng yêu cầu Mục 13.1.

### Lựa chọn 2 — Chủ dự án cấp một PAT fine-grained có thời hạn để trợ lý làm toàn bộ

- Nội dung: chủ dự án tạo Personal Access Token dạng fine-grained, giới
  hạn đúng repo `ggminh`, hai quyền Contents + Workflows (read/write),
  hạn dùng ngắn (ví dụ 7 ngày), và đưa cho trợ lý qua kênh lưu trữ thông
  tin xác thực an toàn của hệ thống (không dán vào chat thường). Trợ lý
  dùng token đó để push nhánh, áp bản vá, mở PR Draft và theo dõi CI,
  sau đó chủ dự án thu hồi token ngay khi xong.
- Hệ quả kỹ thuật: kết quả CI giống hệt Lựa chọn 1; chủ dự án không phải
  thao tác tay.
- Hệ quả thương mại/vận hành: tạo thêm một bề mặt credential phải quản
  lý (dù đã giới hạn phạm vi + thời hạn + thu hồi). Đổi quyền của GitHub
  App hiện tại **không** phải đường khả thi từ phía chủ repo: quyền của
  một GitHub App do nhà phát triển app đặt ra, chủ repo không tự nâng
  được — vì vậy PAT là đường credential duy nhất nếu muốn trợ lý tự làm.

### Lựa chọn 3 — Chỉ push nhánh, hoãn bản vá workflow

- Nội dung: đẩy nhánh tích hợp lên GitHub (bằng một trong hai cách ở
  Lựa chọn 1/2 nhưng chỉ cần quyền Contents), mở PR Draft để CI
  build + test trên Windows chạy; bản vá workflow để áp sau.
- Hệ quả kỹ thuật: code hết trạng thái "chỉ ở máy local" (đạt Mục 13.1),
  có bằng chứng build/test Windows. Nhưng phép đo có cấu hình vẫn
  NOT_RUN → **cổng 2 vẫn chỉ đạt một phần**, và theo thứ tự bắt buộc của
  Mục 12, chuỗi cổng vẫn dừng trước cổng 4. Phép đo cấu hình vẫn có thể
  chạy tay trên máy Windows của chủ dự án ở cổng 3 như một phần của gói
  bằng chứng, nhưng không thay thế được bằng chứng CI của cổng 2.
- Hệ quả thương mại/vận hành: ít việc nhất trong ngắn hạn; rủi ro là
  trạng thái "gần xong" kéo dài — bản vá workflow từng bị hoãn từ đợt
  PR #17 tới nay chính theo cách này.

## 3. Khuyến nghị của Agent 19 (khuyến nghị — KHÔNG phải quyết định)

**Khuyến nghị Lựa chọn 1.** Lý do:

1. Nó khép được cổng 2 trọn vẹn (cả build/test lẫn phép đo) trong một
   lần thao tác, bằng credential **đã tồn tại** (tài khoản chủ repo) —
   không tạo bề mặt credential mới như Lựa chọn 2.
2. Chi phí thật của nó nhỏ và một lần: ~15–30 phút thao tác theo hướng
   dẫn từng lệnh mà trợ lý chuẩn bị sẵn, gồm cả bản vá đã sửa danh sách
   trigger (điểm §1.5 — nếu dùng bản vá nguyên trạng, CI sẽ không tự
   chạy cho nhánh tích hợp).
3. Lựa chọn 3 lặp lại đúng mẫu đã khiến bản vá này nằm chờ từ đợt PR
   #17: mỗi lần hoãn đều hợp lý trong ngắn hạn, và tổng thời gian hoãn
   đến nay đã dài hơn nhiều so với thời gian áp vá.
4. Lựa chọn 2 vẫn khả thi làm phương án dự phòng nếu chủ dự án không
   muốn thao tác tay — với điều kiện token giới hạn đúng repo, hạn
   ngắn, và thu hồi ngay sau khi CI có kết quả.

## 4. Câu quyết định cần chủ dự án trả lời

**Để đưa nhánh integration/v5.8-phase-c lên GitHub và áp bản vá workflow cho phép đo có cấu hình (cổng 2), chủ dự án chọn Lựa chọn 1 (tự push + tự áp vá theo hướng dẫn trợ lý chuẩn bị), Lựa chọn 2 (cấp PAT fine-grained ngắn hạn để trợ lý làm toàn bộ), hay Lựa chọn 3 (chỉ push nhánh, hoãn bản vá workflow)?**

## 5. Việc xảy ra sau khi quyết

| Nếu chọn | Ai làm | Việc | Ước lượng |
|---|---|---|---|
| 1 | Trợ lý/điều phối | Soạn bản vá bổ sung (thêm `integration/v5.8-phase-c` vào trigger), viết hướng dẫn từng lệnh kèm git bundle của nhánh tích hợp, kiểm chứng kết quả CI sau khi chủ dự án chạy | ~0,5 ngày chuẩn bị + theo dõi CI |
| 1 | Chủ dự án | Thực hiện theo hướng dẫn: import/clone nhánh, `git apply` bản vá, push, mở PR Draft | ~15–30 phút |
| 2 | Chủ dự án | Tạo PAT fine-grained (đúng repo ggminh; Contents + Workflows; hạn ≤7 ngày), chuyển qua kênh an toàn; thu hồi token sau khi trợ lý báo xong | ~10 phút tạo + 2 phút thu hồi |
| 2 | Trợ lý/điều phối | Push nhánh, áp bản vá (kèm bổ sung trigger), mở PR Draft, theo dõi CI Windows + phép đo có cấu hình, báo cáo kết quả cổng 2 theo Mục 23 | ~0,5 ngày gồm chờ CI |
| 3 | Chủ dự án hoặc trợ lý (tuỳ cách push) | Push nhánh + mở PR Draft; ghi trạng thái cổng 2 = "đạt một phần: build/test Windows có bằng chứng, phép đo có cấu hình NOT_RUN" vào hồ sơ phát hành | ~15–30 phút + chờ CI |
| Mọi lựa chọn | Chủ dự án | Sau cổng 2: xếp lịch cổng 3 trên máy Windows thật (hướng dẫn nghiệm thu đã có sẵn từ các đợt trước); cổng 4 chỉ quyết sau khi có gói bằng chứng cổng 3 | Theo lịch của chủ dự án |
