# Gói nghiệm thu Gate 3 — LHM Ads Browser 5.8.0 Preview (bản Wave 2)

> **Trạng thái sản phẩm: Preview.** Bản này chưa qua nghiệm thu máy
> Windows thật (chính tài liệu này là công cụ để thực hiện việc đó),
> chưa kèm engine Camoufox thương mại đã ký, và chưa có cơ chế cập
> nhật ứng dụng có ký số. Mọi kết quả trong gói này chỉ có giá trị
> cho đúng artifact, đúng máy và đúng cấu hình ghi ở Mục 1 — không
> suy rộng sang máy khác, bản build khác hay môi trường khác.

Tài liệu này thay thế cách làm cũ trong
`huong-dan-do-windows-thuc-te.md` (đo từ mã nguồn trên nhánh chọn
lọc) bằng nghiệm thu **trên bản cài EXE đã phát hành qua CI**, cập
nhật theo cây Wave 2 (commit tích hợp `f280296`). Các phần đo hai
phía của hướng dẫn cũ được giữ ở Phụ lục A dưới dạng tùy chọn.

## 0. Đối tượng nghiệm thu — artifact cố định

Gate 3 chỉ nghiệm thu đúng artifact sau. Sai một giá trị trong bảng
này là dừng ngay, không nghiệm thu tiếp trên artifact khác.

| Hạng mục | Giá trị |
|---|---|
| Nhánh / commit tích hợp (mã nguồn) | `integration/v5.8-phase-c` @ `f280296` |
| Commit trên GitHub (snapshot) | `f549a631600227e52eb3dd1161facea0981b8680` |
| CI run đã build artifact | GitHub Actions run `39641363889` — kết quả Success |
| Tên artifact CI | `LHM-Ads-Browser-Windows-x64` |
| Digest ZIP do GitHub công bố | `sha256:8e5ca8a62a4c38b121935886eef6148fdd5dc76caf9a4ba45a2a4703cf560634` |
| Tên tệp cài đặt trong ZIP | `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` |
| Dung lượng tệp cài đặt | 89.473.785 byte |
| SHA-256 của tệp cài đặt | `54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497` |
| Chữ ký Authenticode | **Không có** — bản cài chưa ký số (quyết định của chủ dự án). Hệ quả dự kiến ở bước G3-02: SmartScreen hiện cảnh báo nhà phát hành không xác định. |
| Engine đóng gói kèm theo | **Không có.** Cả `resources/bundled-engines` và `resources/camoufox-engine` trong bản build chỉ chứa `README.md`. Mọi bước liên quan engine phải chấm theo đúng thực tế này (xem G3-05). |

## 1. Quy tắc chấm (theo Mục 12 và Mục 23 của Hiến pháp sản phẩm)

- Mỗi bước có một trong ba kết quả: **PASS** (hành vi khớp kỳ vọng
  đã ghi, có bằng chứng), **FAIL** (hành vi lệch kỳ vọng), hoặc
  **NOT_RUN** (không thực hiện được/không áp dụng — bắt buộc ghi lý
  do cụ thể). Không có kết quả "gần đạt".
- Kỳ vọng trong tài liệu này mô tả **hành vi đã ghi trong tài liệu
  khách hàng và sổ tay người bán của chính bản Wave 2**. Một bước
  PASS nghĩa là phần mềm làm đúng như nó tự mô tả — không có nghĩa
  là đạt bất kỳ tiêu chuẩn bên ngoài nào khác.
- **Gate 3 chỉ ĐẠT khi mọi bước bắt buộc đều PASS.** Một FAIL ở
  bước bắt buộc → Gate 3 CHƯA ĐẠT, lập danh sách lỗi, dừng việc
  chuyển sang Gate 4. Các NOT_RUN đã khai trước trong tài liệu
  (G3-05B, G3-10b) không chặn Gate 3 nhưng phải xuất hiện nguyên
  văn trong khối ký duyệt ở cuối.
- Mọi kết quả phải gắn với: mã băm artifact ở Mục 0, thông tin máy
  ở Mục 2, ngày giờ thực hiện (kèm múi giờ), và tệp bằng chứng.
  Không ghi kết luận kiểu "khớp toàn bộ" khi còn trường chưa đo.
- Đặt tên tệp bằng chứng theo mẫu `g3-<mã bước>-<số thứ tự>.<đuôi>`
  (ví dụ `g3-02-1.png` là ảnh chụp màn hình đầu tiên của bước
  G3-02). Ảnh chụp phải thấy rõ nội dung cần chứng minh (toàn bộ
  hộp thoại/thông báo, không cắt mất dòng chữ liên quan).

## 2. Điều kiện tiên quyết

### 2.1 Máy nghiệm thu (phía người thực hiện)

- Một máy Windows **độc lập**: không phải máy phát triển, không
  phải máy người bán dùng để cấp license, và **chưa từng cài** LHM
  Ads Browser (nếu đã từng cài, phải gỡ và xóa cả thư mục
  `C:\Users\<user>\AppData\Roaming\LHM Ads Browser` trước, rồi ghi
  rõ tiền lệ này vào biên bản).
- Ghi lại trước khi bắt đầu: phiên bản Windows + số build
  (`winver`), CPU, RAM, GPU, độ phân giải màn hình, múi giờ hệ
  thống, phiên bản chữ ký diệt virus của Microsoft Defender
  (Windows Security → Virus & threat protection → Protection
  updates).
- Đã cài sẵn Google Chrome hoặc Microsoft Edge (điều kiện để bước
  hồ sơ Chromium chạy được bằng engine hệ thống).
- Quyền quản trị (admin) để cài đặt; đồng hồ Windows đặt đúng giờ
  và bật đồng bộ tự động (license kiểm tra lệch đồng hồ).
- Mạng ra Internet được (tải artifact từ GitHub, kiểm tra proxy).
- Tạo sẵn hai proxy thuộc hệ thống kiểm tra IP của chủ dự án và đã
  đạt tiêu chuẩn nội bộ của hệ thống đó: một **HTTP** và một
  **SOCKS5** (có tài khoản/mật khẩu), kèm IP thoát kỳ vọng của từng
  proxy để đối chiếu. Không ghi mật khẩu proxy vào biên bản.

### 2.2 Phía người bán (chuẩn bị trước, làm trên máy người bán)

- Bộ công cụ cấp license sẵn sàng theo `docs/seller-runbook/`
  (khóa phát hành, ledger). Gate 3 dùng đường cấp thử nội bộ được
  sổ tay cho phép; license cấp cho máy nghiệm thu gắn với mã cài
  đặt lấy ở bước G3-03.
- Một tệp sao lưu cấu hình mẫu không cần ở bước này; sao lưu được
  tạo ngay trong G3-08.

### 2.3 Kỷ luật dữ liệu thử

- Chỉ dùng **dữ liệu tổng hợp**: hồ sơ đặt tên bắt đầu bằng
  `g3-` (ví dụ `g3-chromium-01`), trang kiểm tra là trang do mình
  kiểm soát hoặc trang công cộng không yêu cầu đăng nhập.
- **Không** đăng nhập tài khoản thật của khách hay của chủ dự án
  vào các hồ sơ nghiệm thu; không dùng cookie/phiên thật.
- Các trang kiểm tra IP/WebRTC công cộng chỉ dùng để *quan sát*;
  kết quả quan sát ghi đúng những gì thấy, không kết luận về khả
  năng liên kết tài khoản của bất kỳ nền tảng nào.

## 3. G3-01 — Tải artifact và đối chiếu toàn vẹn (BẮT BUỘC)

**Thao tác**

1. Mở trang CI run `39641363889` của repo trên GitHub, tải artifact
   `LHM-Ads-Browser-Windows-x64` (ZIP) về máy nghiệm thu.
2. Nếu giao diện GitHub hiển thị digest của artifact, đối chiếu
   với digest ở Mục 0.
3. Giải nén ZIP; xác nhận bên trong có đúng một tệp
   `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`.
4. Trong PowerShell, tại thư mục chứa tệp cài đặt:

   ```powershell
   (Get-Item .\LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe).Length
   (Get-FileHash -LiteralPath .\LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe -Algorithm SHA256).Hash
   ```

**Kỳ vọng**

- Dung lượng đúng `89473785`.
- SHA-256 đúng `54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497`
  (không phân biệt hoa/thường khi so).

**Bằng chứng**: ảnh chụp cửa sổ PowerShell thấy rõ cả hai giá trị
(`g3-01-1.png`).

**Chấm**: PASS khi cả hai giá trị khớp. Lệch bất kỳ giá trị nào →
FAIL và **dừng toàn bộ nghiệm thu**: tệp trên máy không phải
artifact đã được CI của dự án tạo ra; tải lại từ đúng CI run, vẫn
lệch thì báo chủ dự án, không cài đặt.

## 4. G3-02 — Cài đặt, SmartScreen và Defender (BẮT BUỘC)

**Thao tác**

1. Nhấp đúp tệp cài đặt. Ghi lại **nguyên văn** những gì Windows
   hiện trước khi trình cài đặt mở ra:
   - Có hiện màn hình SmartScreen "Windows protected your PC" /
     nhà phát hành không xác định không? Nếu có: chụp lại, rồi
     ghi nhận cảnh báo và tình trạng chặn. Nếu hệ thống không cho phép
     cài đặt, đánh dấu KHÔNG ĐẠT và tạm dừng; không yêu cầu vô hiệu hóa
     hoặc vượt qua SmartScreen/Defender để có kết quả nghiệm thu.
   - Hộp thoại UAC ghi nhà phát hành là gì (dự kiến: không xác
     định/unknown, vì bản cài chưa ký Authenticode)?
2. Đi hết trình cài đặt (bản này cho chọn thư mục cài, không phải
   cài một chạm). Ghi lại thư mục cài đã chọn.
3. Sau khi cài xong, mở Windows Security → Virus & threat
   protection: chạy **Quick scan**; nếu Defender có mục quét tùy
   chọn, quét thêm thư mục cài. Ghi kết quả quét (số mối đe dọa
   phát hiện) và kiểm tra Protection history xem có mục nào liên
   quan tới LHM Ads Browser trong lúc cài/chạy lần đầu không.
4. Kiểm tra shortcut trên desktop và trong Start Menu: ứng dụng mở
   được từ shortcut; **ghi lại icon đang hiển thị** — bản Wave R
   hiện có `build/icon.ico`; phải xác minh icon thực tế trong bản
   đóng gói trên máy, không mặc định icon Electron vẫn được dùng.
   Kết quả nhận diện cần ghi riêng với kết quả tính năng
   thương mại, ghi nhận chứ không tính FAIL chức năng.

**Kỳ vọng**

- Cài đặt hoàn tất, ứng dụng xuất hiện trong Settings → Apps.
- SmartScreen/UAC có thể hiện cảnh báo như mô tả ở trên — đó là
  hành vi dự kiến của Windows với tệp chưa ký, **không phải lỗi
  của phần mềm**; điều bắt buộc là ghi lại đúng những gì đã hiện.
- Defender quét xong, không có phát hiện đe dọa nào gắn với tệp
  cài đặt hay thư mục cài. Nếu Defender chặn/xóa tệp: đó là FAIL,
  ghi nguyên văn tên phát hiện (detection name) — không tắt
  Defender để "cài cho được".

**Bằng chứng**: ảnh SmartScreen/UAC nếu có (`g3-02-1.png`), ảnh
kết quả quét Defender (`g3-02-2.png`), ảnh Protection history
(`g3-02-3.png`), ảnh icon trên desktop (`g3-02-4.png`).

**Chấm**: PASS khi cài xong + quét sạch + đã ghi đủ các quan sát
trên. FAIL khi cài không xong, hoặc Defender phát hiện/chặn tệp
(ghi detection name), hoặc ứng dụng không mở được từ shortcut.

## 5. G3-03 — Chạy lần đầu và trạng thái dùng thử (BẮT BUỘC)

**Thao tác**

1. Mở ứng dụng lần đầu. Chờ ứng dụng tạo thư mục dữ liệu; kiểm tra
   thư mục sau đã tồn tại:
   `C:\Users\<user>\AppData\Roaming\LHM Ads Browser\storage`
2. Vào mục **License** trong ứng dụng. Chụp trạng thái hiển thị:
   đang dùng thử, số ngày còn lại, giới hạn hồ sơ, danh sách tính
   năng. Bấm **Sao chép mã cài đặt** (Installation ID) và gửi mã
   này cho phía người bán để chuẩn bị G3-07.
3. Tạo nhanh các hồ sơ Chromium rỗng cho tới khi chạm giới hạn
   dùng thử (xem cách tạo ở G3-04; có thể tạo 9 hồ sơ phụ sau hồ
   sơ chính, đặt tên `g3-trial-02`…`g3-trial-10`), rồi thử tạo hồ
   sơ thứ 11.

**Kỳ vọng** (đối chiếu tài liệu khách hàng, chương 1)

- Dùng thử tự bắt đầu ở lần cài đầu tiên: **10 ngày, tối đa 10 hồ
  sơ**, gồm tính năng hồ sơ + Automation + API cục bộ.
- Hồ sơ thứ 11 bị chặn với thông báo rõ ràng về giới hạn dùng thử.
- Thư mục `storage` được tạo đúng vị trí đã ghi.

**Bằng chứng**: ảnh mục License (`g3-03-1.png`), ảnh thông báo
chặn hồ sơ thứ 11 (`g3-03-2.png`), ảnh thư mục storage trong
Explorer (`g3-03-3.png`). Ghi mã cài đặt vào biên bản (mã này
không phải bí mật, nhưng chỉ dùng cho máy nghiệm thu này).

**Chấm**: PASS khi cả ba kỳ vọng đúng. FAIL khi trạng thái dùng
thử khác công bố (số ngày/giới hạn/tính năng), hoặc tạo được hồ
sơ thứ 11, hoặc dữ liệu nằm ở vị trí khác tài liệu mô tả. Sau
bước này, xóa các hồ sơ `g3-trial-*` phụ (để thùng rác là đủ)
trước khi sang G3-04 để các bước sau gọn.

## 6. G3-04 — Hồ sơ Chromium: tạo, mở, đóng (BẮT BUỘC)

**Thao tác**

1. Trước khi tạo hồ sơ, mở hộp thoại **Engine** trên thanh công
   cụ, xác nhận nguồn Chromium đang là **System** (Chrome/Edge
   trên máy). Chụp hộp thoại — hộp thoại cũng liệt kê các nguồn
   khác và trạng thái của chúng ở bản này (bundled/Camoufox chưa
   khả dụng vì chưa có bản engine đã ký; xem G3-05).
2. **Tạo Profile Mới** → tab *Thông tin chung*: engine **Chrome /
   Edge**, tên `g3-chromium-01`, trang khởi động đặt một trang
   kiểm tra do mình kiểm soát hoặc trang công cộng không cần đăng
   nhập. Tab *Vân tay phần cứng*: giữ **Thông số gốc**. Lưu.
3. **Mở** hồ sơ: chờ trình duyệt mở đúng trang khởi động. Trong
   phiên, mở một trang hiển thị IP thoát quan sát được và một
   trang hiển thị User-Agent; chụp cả hai.
4. **Đóng** trình duyệt; chờ tiến trình thoát hẳn (hồ sơ hết trạng
   thái đang chạy trong bảng hồ sơ). Mở lại hồ sơ lần thứ hai và
   xác nhận mở lại bình thường.

**Kỳ vọng**

- Hồ sơ tạo/mở/đóng/mở lại trọn vẹn bằng Chrome/Edge hệ thống.
- Chế độ thông số gốc: không có extension can thiệp vân tay; giá
  trị lộ ra là giá trị thật của trình duyệt đang chạy (đối chiếu
  User-Agent thuộc đúng bản Chrome/Edge trên máy).
- Khi hồ sơ đang chạy, thao tác sửa/xóa hồ sơ đó bị từ chối (đây
  là hành vi fail-closed đã thiết kế) — thử bấm sửa một lần để
  xác nhận, ghi lại thông báo.

**Bằng chứng**: ảnh hộp thoại Engine (`g3-04-1.png`), ảnh phiên
đang mở (`g3-04-2.png`), ảnh trang IP/User-Agent (`g3-04-3.png`),
ảnh thông báo từ chối sửa khi đang chạy nếu có hiện
(`g3-04-4.png`).

**Chấm**: PASS khi tạo/mở/đóng/mở lại đều được và các quan sát
khớp kỳ vọng. FAIL khi hồ sơ không mở được bằng engine hệ thống,
khi giá trị lộ ra mâu thuẫn với chế độ gốc đã khai, hoặc khi sửa
được hồ sơ đang chạy.

## 7. G3-05 — Hồ sơ Camoufox: tạo hồ sơ và trạng thái cấp danh tính (BẮT BUỘC)

Bối cảnh bắt buộc phải hiểu trước khi chấm: bản Preview này
**không kèm engine Camoufox đã ký của LHM** (Mục 0). Hộp thoại
Engine có nút **Cài đặt Camoufox được xác minh**, nhưng việc cài
chỉ hoàn tất khi phía người bán đã phát hành một bản Camoufox ký
bằng khóa publisher riêng — tại thời điểm viết gói này, bản phát
hành như vậy **chưa tồn tại**. Vì vậy kỳ vọng chuẩn của bước này
là đường đi *chưa có engine*: ứng dụng phải xử lý trung thực và
chặn an toàn (fail-closed), không ngụy trang thành công.

**Thao tác**

1. Trong hộp thoại **Engine**, bấm **Cài đặt Camoufox được xác
   minh** (nếu nút hiện) và đi tới cuối quá trình. Ghi lại
   nguyên văn kết quả/thông báo (dự kiến: không cài được vì chưa
   có bản phát hành đã ký để cài). Không làm bất kỳ cách nào để
   "lách" kiểm chứng (không chép tay engine lạ vào thư mục ứng
   dụng — làm vậy là phá điều kiện nghiệm thu).
2. **Tạo Profile Mới** → engine **Camoufox / Gecko**, tên
   `g3-camoufox-01`, chế độ thông số gốc, không proxy. Trong lúc
   tạo, form hiển thị trạng thái engine Camoufox — chụp lại.
3. Sau khi tạo, mở chi tiết hồ sơ trong bảng hồ sơ và ghi lại
   **trạng thái cấp danh tính** đang hiển thị thuộc trường hợp
   nào trong ba trường hợp sau:
   - *Đã ghim danh tính* (ứng dụng sinh được bộ danh tính bằng cơ
     chế chính thức và ghim cho hồ sơ);
   - *Chưa cấp được* — trạng thái ghi là `unavailable` và giao
     diện hiện nhãn trung thực tương ứng (hồ sơ vẫn được tạo,
     chạy bằng thông số gốc của engine);
   - *Không hợp lệ* — bộ danh tính sinh ra mâu thuẫn với hồ sơ đã
     khai nên bị từ chối gắn.
4. Bấm thao tác **Cấp danh tính** cho hồ sơ đã có (nút trong giao
   diện hồ sơ) và ghi lại kết quả.
5. Thử **Mở** hồ sơ `g3-camoufox-01`. Ghi lại nguyên văn kết quả:
   dự kiến ở trạng thái chưa có engine đã kiểm chứng, ứng dụng
   **chặn mở và báo lý do** (fail-closed), không tự mở bằng
   engine khác thay thế.

**Kỳ vọng**

- Việc tạo hồ sơ không treo và không báo thành công giả: trạng
  thái cấp danh tính hiển thị thuộc đúng một trong ba trường hợp
  ở thao tác 3, khớp với thực tế engine trên máy (chưa cài được
  engine → không thể là "đã ghim và chạy được").
- Mở hồ sơ khi chưa có engine đã kiểm chứng bị chặn kèm lý do rõ
  ràng; không có hiện tượng tự chuyển sang Chromium/Firefox.
- Nhãn giao diện dùng đúng sự thật (ví dụ "Chưa cấp danh tính đã
  ghim"), không có nhãn nào khẳng định hồ sơ đã sẵn sàng chạy
  Camoufox khi engine chưa có.

**Bằng chứng**: ảnh kết quả cài engine (`g3-05-1.png`), ảnh form
tạo hồ sơ thấy trạng thái engine (`g3-05-2.png`), ảnh chi tiết
hồ sơ thấy trạng thái cấp danh tính (`g3-05-3.png`), ảnh thông
báo khi bấm Mở (`g3-05-4.png`).

**Chấm**

- PASS: các kỳ vọng trên đúng — kể cả khi kết quả thực tế là
  "chưa cấp được + chặn mở", vì đó là hành vi đúng của bản
  Preview chưa có engine ký.
- FAIL: hồ sơ hiển thị đã ghim danh tính nhưng không có danh
  tính thật gắn kèm; hoặc mở được hồ sơ bằng engine khác mà
  không báo; hoặc ứng dụng treo/sập ở bất kỳ thao tác nào; hoặc
  nhãn giao diện khẳng định điều không đúng với trạng thái thật.
- Nếu ở thao tác 3 trạng thái là *đã ghim*: ghi thêm vào biên
  bản là thành phần sinh danh tính trong bản cài đã hoạt động
  trên máy này, và chuyển sang thực hiện thêm G3-05B nếu đã có
  engine (điều kiện ở G3-05B).

### G3-05B — Nhánh đầy đủ khi đã có engine Camoufox đã ký (CÓ ĐIỀU KIỆN)

Chỉ thực hiện khi **cả hai** điều kiện sau đúng: (1) phía người
bán đã phát hành bản Camoufox ký bằng khóa publisher riêng theo
sổ tay người bán; (2) bước cài ở G3-05 thao tác 1 đã hoàn tất và
engine qua kiểm chứng (kích thước + SHA-256 + chữ ký manifest).

1. Mở hồ sơ `g3-camoufox-01` (đã cấp danh tính): trình duyệt
   Camoufox mở bằng tiến trình Windows riêng cho duyệt thủ công.
2. Trong phiên, mở trang hiển thị User-Agent/ngôn ngữ/múi giờ và
   đối chiếu với bộ danh tính đã ghim trong chi tiết hồ sơ: các
   giá trị quan sát được phải khớp bộ đã khai (đây là kiểm tra
   *khai báo so với lộ ra* trong phạm vi các trường trang đo đọc
   được; trường nào trang không đọc được thì ghi chưa đo).
3. Đóng và mở lại hồ sơ; xác nhận danh tính vẫn là bộ đã ghim
   (không đổi sang bộ khác).

**Chấm**: PASS/FAIL theo cùng nguyên tắc G3-05. Nếu điều kiện
chưa đủ: ghi **NOT_RUN — chưa có bản Camoufox đã ký của LHM**
và để nguyên văn dòng này trong khối ký duyệt. NOT_RUN ở bước
này không chặn Gate 3, nhưng chừng nào nó còn NOT_RUN thì tính
năng Camoufox **chưa được nghiệm thu trên máy thật** và không
được mô tả với khách là đã sẵn sàng.

## 8. G3-06 — Proxy: HTTP, SOCKS5 và các trường hợp từ chối (BẮT BUỘC)

Dùng hai proxy đã chuẩn bị ở Mục 2.1. Hồ sơ dùng cho bước này là
Chromium (`g3-chromium-01`) để tách lỗi proxy khỏi tình trạng
engine Camoufox ở G3-05.

**Thao tác**

1. Mở **Proxy Center**, thêm proxy **HTTP** (kèm tài khoản/mật
   khẩu nếu có) và proxy **SOCKS5** vào kho. Kiểm tra từng proxy
   bằng nút kiểm tra trong Proxy Center (kiểm tra tối đa 20
   proxy) hoặc nút **Kiểm tra kết nối Proxy** trong tab *Proxy &
   Mạng* của form hồ sơ khi gán; ghi IP thoát quan sát được và
   đối chiếu với IP kỳ vọng đã chuẩn bị. (Phép kiểm tra này đo
   từ góc nhìn của ứng dụng quản lý tại thời điểm bấm — biên
   bản ghi rõ nhãn nguồn đo này, không coi là IP của phiên
   trình duyệt.)
2. Gán proxy HTTP cho `g3-chromium-01`, mở hồ sơ, mở trang hiển
   thị IP: IP quan sát trong phiên phải là IP thoát của proxy
   HTTP. Đóng hồ sơ.
3. Đổi gán sang proxy SOCKS5, mở lại, lặp lại việc kiểm tra IP
   trong phiên. Đóng hồ sơ.
4. Trường hợp từ chối — proxy hỏng: tạo một proxy trong Proxy
   Center trỏ tới một địa chỉ/cổng không tồn tại, gán cho hồ
   sơ, bấm mở. Ghi lại nguyên văn hành vi (thông báo lỗi gì, hồ
   sơ có mở bằng đường trực tiếp thay thế không).
5. Trường hợp direct: bỏ gán proxy (Direct), mở hồ sơ Camoufox
   `g3-camoufox-01` nếu bước G3-05B đã chạy được; ghi lại mã kết
   quả tiền kiểm quan sát được (dự kiến hồ sơ direct qua tiền
   kiểm ở mức `PREFLIGHT_ONLY` — hồ sơ mở được nhưng mức này
   **không** có nghĩa an toàn rò rỉ mạng đã được chứng nhận).
   Nếu G3-05B là NOT_RUN, thao tác này cũng ghi NOT_RUN kèm lý
   do.

**Kỳ vọng**

- Kiểm tra kết nối trong Proxy Center trả IP thoát khớp IP kỳ
  vọng của từng proxy.
- Trong phiên Chromium: gán proxy nào thì IP quan sát là IP của
  proxy đó; đổi proxy thì IP đổi tương ứng.
- Proxy hỏng: ứng dụng **không** lặng lẽ mở hồ sơ bằng đường
  trực tiếp; phải có thông báo lỗi rõ ràng (với hồ sơ Camoufox,
  lỗi chặn theo thiết kế có dạng `NETWORK_BLOCKED` kèm lý do —
  nếu gặp ở biến thể Chromium, ghi nguyên văn thông báo thực
  tế, không tự đổi tên).
- Hai hồ sơ dùng hai proxy khác nhau (nếu thực hiện thêm với
  một hồ sơ Chromium thứ hai) cho hai IP thoát khác nhau tương
  ứng.

**Bằng chứng**: ảnh kết quả Kiểm tra kết nối của hai proxy
(`g3-06-1.png`, `g3-06-2.png`), ảnh IP trong phiên cho HTTP
(`g3-06-3.png`) và SOCKS5 (`g3-06-4.png`), ảnh thông báo trường
hợp proxy hỏng (`g3-06-5.png`), ảnh/ghi chép kết quả direct ở
thao tác 5 (`g3-06-6.png`).

**Chấm**: PASS khi cả bốn thao tác đầu đúng kỳ vọng và thao tác
5 đã thực hiện hoặc đã ghi NOT_RUN có lý do. FAIL khi: IP trong
phiên không phải IP của proxy đã gán; proxy hỏng mà hồ sơ vẫn mở
bằng đường trực tiếp không cảnh báo; hoặc Proxy Center báo kết
nối thành công trong khi phiên không dùng được proxy đó.

## 9. G3-07 — License trên bản cài thật: kích hoạt, gia hạn, thu hồi, hủy (BẮT BUỘC)

Thực hiện trên chính bản cài đang nghiệm thu, dùng mã cài đặt đã
lấy ở G3-03. Các lệnh phía người bán chạy trên máy người bán
theo `docs/seller-runbook/` — không chạy công cụ cấp license
trên máy nghiệm thu.

**Thao tác**

1. **Kích hoạt.** Người bán thêm máy nghiệm thu vào sổ và cấp
   một license (gói bất kỳ, ghi lại gói/giới hạn hồ sơ/số tháng
   đã cấp). Dán token vào mục **License** trên máy nghiệm thu,
   bấm kích hoạt.
2. **Kiểm tra trạng thái sau kích hoạt**: gói, ngày hết hạn, giới
   hạn hồ sơ hiển thị phải khớp bản ghi đã cấp; thử tạo hồ sơ
   vượt trần dùng thử 10 (nay theo trần của license) để xác
   nhận trần mới có hiệu lực.
3. **Token bị sửa (âm tính).** Sao chép token, đổi đúng một ký
   tự ở phần giữa chuỗi, dán thử kích hoạt. Ghi lại thông báo.
   Sau đó kích hoạt lại bằng token đúng để trở về trạng thái ở
   thao tác 2.
4. **Gia hạn.** Người bán chạy lệnh gia hạn theo license cũ
   (giữ nguyên gói và giới hạn), gửi token mới. Thay token trên
   máy nghiệm thu; kiểm tra ngày hết hạn mới.
5. **Thu hồi.** Người bán chạy lệnh thu hồi vào sổ thu hồi
   (registry). Trên máy nghiệm thu **đang ngoại tuyến về mặt xác
   minh** (bản Preview mặc định chưa cấu hình máy chủ xác minh):
   mở mục License, bấm nút kiểm tra máy chủ xác minh nếu có, và
   ghi lại trạng thái license hiển thị sau khi thu hồi.
6. **Hủy license trên máy.** Bấm nút **Xóa license trên máy
   này** trong mục License. Ghi lại trạng thái quay về: còn bao
   nhiêu ngày dùng thử.

**Kỳ vọng**

- Thao tác 1–2: báo "Đã kích hoạt thành công"; trạng thái khớp
  bản ghi cấp (gói, hết hạn, trần hồ sơ). Token chỉ in một lần
  phía người bán và không xuất hiện trong ledger — phía nghiệm
  thu không cần kiểm ledger, chỉ đối chiếu các trường hiển thị.
- Thao tác 3: token bị sửa bị từ chối với lỗi chữ ký/không hợp
  lệ; trạng thái license đang có **không** bị phá bởi lần thử
  này sau khi kích hoạt lại token đúng.
- Thao tác 4: gia hạn giữ nguyên gói và giới hạn hồ sơ, ngày
  hết hạn lùi đúng số tháng đã gia hạn.
- Thao tác 5 — **kỳ vọng theo đúng thiết kế hiện tại, ghi trung
  thực**: thu hồi ghi vào registry phục vụ xác minh *online*;
  máy chưa cấu hình máy chủ xác minh thì license cục bộ **vẫn
  hiển thị đang hiệu lực** sau thu hồi. Đây là giới hạn đã biết
  của cơ chế offline, không phải PASS cho mệnh đề "thu hồi có
  hiệu lực trên máy khách". Biên bản bắt buộc ghi nguyên văn
  quan sát này; nó đi vào danh sách giới hạn công khai với
  khách, không được bỏ qua khi ký duyệt.
- Thao tác 6: sau khi xóa license, ứng dụng quay về **phần dùng
  thử còn lại tính từ ngày cài đầu tiên** (không phải một đợt
  30 ngày mới). Đối chiếu số ngày còn lại với ngày cài ở G3-02.

**Bằng chứng**: ảnh trạng thái sau kích hoạt (`g3-07-1.png`),
ảnh lỗi token bị sửa (`g3-07-2.png`), ảnh trạng thái sau gia
hạn (`g3-07-3.png`), ảnh trạng thái sau thu hồi + kết quả kiểm
tra máy chủ xác minh (`g3-07-4.png`), ảnh trạng thái sau khi
xóa license (`g3-07-5.png`). Biên bản ghi: gói, số tháng, trần
hồ sơ đã cấp; ngày giờ từng thao tác. **Không** ghi token vào
biên bản hay ảnh chụp (cắt/che phần token nếu lọt vào khung
hình).

**Chấm**: PASS khi thao tác 1, 2, 3, 4, 6 đúng kỳ vọng và thao
tác 5 đã quan sát + ghi đúng giới hạn. FAIL khi: kích hoạt đúng
token mà không thành công; token bị sửa vẫn được chấp nhận;
gia hạn làm đổi gói/trần; xóa license cho lại trọn 30 ngày dùng
thử mới; hoặc trạng thái hiển thị không khớp bản ghi đã cấp ở
bất kỳ điểm nào.

## 10. G3-08 — Sao lưu và khôi phục cấu hình (vòng kín) (BẮT BUỘC)

Dùng cơ chế **Sao lưu cấu hình** (không phải Snapshot phiên —
snapshot được dùng ở G3-09). Điều kiện: trên máy đang có ít
nhất hồ sơ `g3-chromium-01` (đã gán proxy từ kho ở G3-06) và
`g3-camoufox-01`.

**Thao tác**

1. Trong mục bảo trì, **Sao lưu cấu hình**: đặt mật khẩu tối
   thiểu 12 ký tự, xuất tệp sao lưu. Tính SHA-256 của tệp sao
   lưu bằng PowerShell và ghi lại.
2. **Mật khẩu sai (âm tính)**: thử nhập chính tệp đó với một
   mật khẩu khác. Ghi lại kết quả.
3. Ghi lại trạng thái trước khôi phục: danh sách hồ sơ hiện có
   và hồ sơ nào đang gán proxy nào.
4. **Nhập** tệp sao lưu bằng mật khẩu đúng. Đọc kỹ màn hình xem
   trước (số hồ sơ/workflow, số hồ sơ cần gán lại proxy) trước
   khi xác nhận.
5. Sau khi nhập: kiểm tra các hồ sơ được nhập xuất hiện dưới
   dạng hồ sơ **mới** có hậu tố "(nhập)"; mở một hồ sơ "(nhập)"
   và xác nhận nó bắt đầu từ phiên rỗng (không mang theo phiên
   đăng nhập/cookie của hồ sơ gốc); kiểm tra hồ sơ "(nhập)" có
   proxy thuộc loại đã mã hóa thì đang ở trạng thái khóa chờ
   gán lại proxy trong Proxy Center.
6. Xóa các hồ sơ "(nhập)" sau khi kiểm tra xong (để thùng rác
   là đủ) để G3-09 làm trên tập hồ sơ gọn.

**Kỳ vọng** (đối chiếu tài liệu khách hàng, chương 5)

- Mật khẩu sai → nhập bị từ chối, không ghi dở dữ liệu nào.
- Nhập đúng mật khẩu → hồ sơ mới "(nhập)", **không ghi đè** hồ
  sơ đang có, **không** khôi phục cookie/phiên (đúng dòng chữ
  trong hộp xác nhận của ứng dụng).
- Mật khẩu proxy không nằm trong bản sao lưu; hồ sơ có proxy mã
  hóa bị khóa cho tới khi gán lại — đây là chủ đích bảo vệ,
  không phải lỗi.

**Bằng chứng**: ghi SHA-256 tệp sao lưu vào biên bản; ảnh màn
hình xem trước khi nhập (`g3-08-1.png`), ảnh lỗi mật khẩu sai
(`g3-08-2.png`), ảnh danh sách hồ sơ sau nhập thấy hậu tố
"(nhập)" (`g3-08-3.png`), ảnh trạng thái khóa proxy nếu có
(`g3-08-4.png`).

**Chấm**: PASS khi cả ba kỳ vọng đúng. FAIL khi: mật khẩu sai
vẫn nhập được; nhập ghi đè hồ sơ cũ; hồ sơ "(nhập)" mang theo
phiên/cookie của hồ sơ gốc; hoặc tệp sao lưu chứa mật khẩu
proxy dạng đọc được (kiểm tra bằng cách tìm chuỗi mật khẩu
proxy trong tệp — tệp là dữ liệu mã hóa nên việc tìm thấy
chuỗi đọc được là FAIL nghiêm trọng).

## 11. G3-09 — Xóa hồ sơ, xóa vĩnh viễn và kiểm kê phần còn lại (BẮT BUỘC)

Bước này kiểm chứng hành vi xóa trên bản cài thật, gồm cả hai
tồn tại đã biết từ kiểm tra ở tầng mã nguồn: **(F3)** snapshot
phiên do người dùng tạo (`storage\session-snapshots\<mã hồ
sơ>\`) không nằm trong phạm vi xóa vĩnh viễn và giao diện chưa
công bố điều này; **(F4)** tệp quy trình tự động
(`automation-workflows.json`) có thể còn tham chiếu mã hồ sơ đã
xóa vĩnh viễn. Nhiệm vụ của Gate 3 là **đo và ghi lại phần còn
lại thực tế trên bản cài**, không phải sửa chúng tại chỗ.

**Thao tác**

1. Đóng hồ sơ `g3-chromium-01`. Tạo một **Snapshot phiên** cho
   hồ sơ này (đặt mật khẩu riêng), rồi kiểm tra trong thư mục
   dữ liệu: ghi lại đường dẫn và dung lượng của thư mục
   snapshot tương ứng dưới
   `AppData\Roaming\LHM Ads Browser\storage\session-snapshots\`.
2. (Tùy chọn nhưng nên làm) Tạo một quy trình (workflow) đơn
   giản trong Automation Studio tham chiếu `g3-chromium-01`,
   lưu lại. Nếu bỏ qua, ghi NOT_RUN cho riêng thao tác con F4.
3. Xóa `g3-chromium-01` vào **thùng rác**; mở thùng rác, xác
   nhận hồ sơ có mặt và còn khôi phục được. Sau đó **xóa vĩnh
   viễn** (purge) chính hồ sơ đó trong thùng rác.
4. Kiểm kê sau purge — liệt kê mọi vết còn lại của hồ sơ đã
   xóa, kiểm tra tối thiểu các vị trí sau trong thư mục
   `storage` và ghi *có/không + đường dẫn* cho từng vị trí:
   - bốn thư mục dữ liệu hồ sơ: `profiles\`, `gecko-profiles\`,
     `camoufox-profiles\`, `extensions\` (thư mục con mang mã
     của hồ sơ đã xóa còn không);
   - `session-snapshots\<mã hồ sơ>` (kỳ vọng theo F3: **còn**);
   - tìm mã hồ sơ trong `db.json` và trong
     `automation-workflows.json` (kỳ vọng theo F4: workflow còn
     tham chiếu nếu đã tạo ở thao tác 2);
   - mở lại ứng dụng, xác nhận hồ sơ đã biến mất khỏi bảng hồ
     sơ và thùng rác.
5. Lặp lại xóa + purge cho `g3-camoufox-01` (không cần snapshot)
   và kiểm kê nhanh bốn thư mục dữ liệu như trên.

**Kỳ vọng**

- Purge xóa sạch dữ liệu hồ sơ ở **cả bốn** thư mục dữ liệu (đây
  là hành vi đã sửa và đã kiểm ở tầng mã nguồn — Gate 3 xác
  nhận lại trên bản cài).
- Snapshot phiên còn lại sau purge đúng như F3 đã ghi: biên bản
  phải liệt kê nó là **phần còn lại đã biết, chờ quyết định của
  chủ dự án**, và mục này làm cho tiêu chí "xóa vĩnh viễn là
  xóa hết" **không được chấm PASS trọn vẹn** — ghi rõ trong
  khối ký duyệt là Gate 3 đạt *kèm tồn tại F3/F4 đã công bố*,
  không viết "đã xóa sạch toàn bộ".
- Hồ sơ khác (`g3-camoufox-01` trước khi tới lượt nó) không bị
  ảnh hưởng bởi purge của `g3-chromium-01`.

**Bằng chứng**: ảnh thùng rác trước/sau purge (`g3-09-1.png`,
`g3-09-2.png`); bản kiểm kê dạng văn bản (`g3-09-3.txt`) liệt
kê từng vị trí ở thao tác 4 kèm kết quả có/không; ảnh chụp kết
quả tìm mã hồ sơ trong hai tệp JSON (`g3-09-4.png`).

**Chấm**: PASS khi kiểm kê đầy đủ và bốn thư mục dữ liệu sạch
như kỳ vọng, đồng thời phần còn lại F3/F4 được ghi đúng thực
tế. FAIL khi: còn dữ liệu hồ sơ ở bất kỳ thư mục nào trong bốn
thư mục dữ liệu sau purge; purge xóa nhầm dữ liệu của hồ sơ
khác; hoặc hồ sơ đã purge vẫn xuất hiện trong ứng dụng. Riêng
sự tồn tại của snapshot (F3) và tham chiếu workflow (F4)
**không** tính FAIL cho bước này vì là hành vi đã biết và đã
khai trước — nhưng nếu chúng *không* xuất hiện như mô tả
(nghĩa là hành vi bản cài khác với hồ sơ tầng mã nguồn), phải
ghi lại như một quan sát lệch và báo chủ dự án.

## 12. G3-10 — Cập nhật: kiểm tra xác minh online và kiểm tra bản cập nhật (BẮT BUỘC ghi nhận)

Bước này có hai nửa với kỳ vọng khác nhau. Đọc kỹ trước khi
chấm — không gộp thành một kết quả chung.

### G3-10a — Nút kiểm tra máy chủ xác minh trong mục License

**Thao tác**: mở mục **License**, bấm nút kiểm tra máy chủ xác
minh (nếu hiện). Ghi lại nguyên văn thông báo.

**Kỳ vọng**: ở cấu hình Preview mặc định (phía người bán chưa
cấu hình máy chủ xác minh), ứng dụng báo trạng thái kiểu "Máy
chủ xác minh chưa được cấu hình" — đây là trạng thái cấu hình
đã ghi trong tài liệu khách hàng, không phải lỗi máy người
dùng, và license offline vẫn có hiệu lực theo chữ ký của nó.

**Bằng chứng**: ảnh thông báo (`g3-10-1.png`).

**Chấm**: PASS khi thông báo khớp kỳ vọng (hoặc, nếu phía người
bán *đã* cấu hình máy chủ, khi việc kiểm tra hoàn tất và trạng
thái hiển thị nhất quán với kết quả ở G3-07 thao tác 5). FAIL
khi ứng dụng treo, báo lỗi khó hiểu không thuộc hai trường hợp
trên, hoặc một lần kiểm tra thất bại làm thay đổi trạng thái
license đang có.

### G3-10b — Kiểm tra cập nhật ứng dụng

**Thực tế của bản Wave 2, khai trước**: cơ chế kiểm tra bản cập
mới hiện mới tồn tại ở tầng mã nguồn (module kiểm tra manifest
đã ký + bộ test đi kèm); nó **chưa được nối vào giao diện** của
bản cài Preview, và các quyết định về kênh phát hành manifest/
thời điểm kiểm tra vẫn đang chờ chủ dự án. Do đó trên bản cài
này **không có thao tác kiểm tra cập nhật để thực hiện**.

**Thao tác ghi nhận**: rà soát mục License và khu vực cài đặt
của ứng dụng; xác nhận không có nút/mục kiểm tra cập nhật ứng
dụng nào khả dụng cho người dùng. Nếu phát hiện có một mục như
vậy, chụp lại và báo chủ dự án (hành vi khác hồ sơ thiết kế).

**Chấm**: **NOT_RUN — tính năng chưa nối vào giao diện bản
Preview; mới có ở tầng mã nguồn.** Dòng này bắt buộc xuất hiện
nguyên văn trong khối ký duyệt. Hệ quả phải nói rõ với khách:
bản Preview **không có cơ chế cập nhật**; bản mới được phân
phối và cài lại thủ công theo thông báo của bên bán.

## 13. G3-11 — Gỡ cài đặt và kiểm kê tồn dư (BẮT BUỘC)

Thực hiện **sau cùng**, khi mọi bước trên đã xong và bằng chứng
đã sao ra khỏi máy nghiệm thu (gỡ cài đặt không được phá bằng
chứng của chính nó).

**Thao tác**

1. Chụp lại cây thư mục trước khi gỡ:
   `C:\Users\<user>\AppData\Roaming\LHM Ads Browser\` (toàn bộ,
   kèm dung lượng thư mục `storage`) và thư mục cài đã chọn ở
   G3-02.
2. Gỡ ứng dụng bằng Settings → Apps của Windows (hoặc shortcut
   gỡ cài đặt đi kèm). Ghi lại quá trình gỡ có hỏi gì về xóa dữ
   liệu không.
3. Kiểm kê sau gỡ, ghi *còn/mất + đường dẫn* cho từng mục:
   - thư mục cài (tệp chương trình còn lại những gì);
   - lối tắt desktop/Start Menu;
   - thư mục `AppData\Roaming\LHM Ads Browser` và thư mục con
     `storage` bên trong (hồ sơ, kho proxy, nhật ký quan sát);
   - bản Camoufox đã cài qua hộp thoại Engine, nếu G3-05B đã
     chạy (nằm trong thư mục dữ liệu của ứng dụng);
   - Chrome/Edge/Firefox hệ thống (phải còn nguyên — gỡ LHM
     không được đụng phần mềm của máy).
4. Kỳ vọng theo cấu hình đóng gói hiện tại: tùy chọn
   `deleteAppDataOnUninstall` **không được đặt** trong cấu hình
   NSIS của bản này, nên hành vi mặc định là gỡ cài đặt **chỉ
   xóa tệp chương trình, thư mục dữ liệu vẫn còn nguyên**. Gate
   3 xác nhận hành vi thật có đúng vậy không — đây cũng là
   đúng nội dung tài liệu khách hàng đã công bố (chương 5, mục
   5.5: muốn xóa sạch phải tự xóa thư mục dữ liệu).
5. Sau khi kiểm kê xong, nếu máy nghiệm thu cần trả về trạng
   thái sạch: tự xóa thư mục
   `C:\Users\<user>\AppData\Roaming\LHM Ads Browser` theo đúng
   hướng dẫn ở mục 5.5 của tài liệu khách hàng, và xác nhận
   xóa xong. Việc xóa tay này là thao tác của người nghiệm
   thu, không phải hành vi của trình gỡ cài đặt — ghi tách
   bạch hai việc trong biên bản.

**Bằng chứng**: ảnh cây thư mục trước gỡ (`g3-11-1.png`), ảnh
kiểm kê sau gỡ (`g3-11-2.png`), bản kiểm kê dạng văn bản
(`g3-11-3.txt`).

**Chấm**: PASS khi kiểm kê đầy đủ và hành vi thật khớp kỳ vọng
ở thao tác 4 (chương trình bị gỡ, dữ liệu còn nguyên theo mặc
định đã công bố, phần mềm hệ thống không bị ảnh hưởng). FAIL
khi: gỡ không xong hoặc còn tiến trình chạy nền; trình gỡ xóa
dữ liệu người dùng *khác* với công bố; hoặc gỡ LHM làm hỏng
Chrome/Edge/Firefox của máy. Nếu hành vi thật khác kỳ vọng ở
thao tác 4 theo hướng dữ liệu bị xóa sạch luôn, đó vẫn là
lệch công bố — chấm FAIL và ghi rõ, vì tài liệu khách hàng
đang hứa dữ liệu còn lại sau gỡ.

## 14. G3-12 — Mở hai tiến trình cùng lúc (khóa một tiến trình, BẮT BUỘC)

Bổ sung ở Wave R (Agent R12): ứng dụng nay có khóa một tiến trình
(single-instance lock) trên cùng thư mục dữ liệu — tiến trình thứ
hai phải tự thoát và cửa sổ của tiến trình đầu được đưa lên trước,
thay vì hai tiến trình cùng ghi `db.json` và ghi đè lẫn nhau.

1. Mở ứng dụng, tạo hoặc sửa một hồ sơ (ghi lại thay đổi).
2. Trong khi ứng dụng đang mở, chạy lại gói cài/tệp thực thi lần
   hai (double-click biểu tượng hoặc chạy từ shortcut).
3. Kỳ vọng: không xuất hiện cửa sổ thứ hai; cửa sổ đang mở được
   focus (nếu đang thu nhỏ thì được khôi phục). Tiến trình thứ
   hai tự thoát — kiểm tra bằng Task Manager: chỉ còn một tiến
   trình chính của ứng dụng.
4. Đóng ứng dụng, mở lại: thay đổi ở bước 1 vẫn còn nguyên (không
   bị bản sao nào ghi đè mất).

Kết quả: PASS khi cả 4 điểm đúng; FAIL nếu mở được hai cửa sổ
song song hoặc thay đổi bị mất. Ghi kèm ảnh chụp Task Manager
vào bằng chứng.

## Phụ lục A — Các phép đo hai phía trên máy nghiệm thu (TÙY CHỌN, không tính cổng)

Các phép đo dưới đây kế thừa hướng dẫn đo cũ (Phần A–D) và
dùng bộ công cụ `stage0-measure/` trong repo tại đúng commit
`f280296` (checkout riêng trên máy nghiệm thu — bộ công cụ
không nằm trong bản cài). Chúng **không** thuộc điều kiện ĐẠT
của Gate 3; kết quả của chúng nạp vào hồ sơ đo của sản phẩm
(theo Mục 23) và phần còn thiếu của Gate 2. Mỗi phép đo hoặc
có kết quả kèm tệp bằng chứng, hoặc ghi NOT_RUN kèm lý do —
không để trống.

- **A1. Cách ly lưu trữ bằng bộ đo trong repo** (kế thừa Phần
  A cũ): chạy `stage0-measure\run.ps1` với bản Camoufox chính
  thức đã đối chiếu SHA-256 từ nguồn phát hành do người thực
  hiện tự kiểm chứng (không dùng SHA lấy từ báo cáo chat). Kỳ
  vọng tham chiếu: 20/20 điều kiện như các lần đo trước trên
  Linux/CI — lệch thì ghi lệch, không tự giải thích.
- **A2. Thuộc tính lộ ra + header phía server** (kế thừa Phần B
  cũ): chạy `echo-server.js` (cổng 5199) từ bản checkout, mở
  hai hồ sơ thử trong **bản cài đang nghiệm thu**, đo snapshot,
  đóng/mở lại, đo lại, so sánh bằng `compare.js`. Chỉ kết luận
  trong phạm vi trường đã đo: tính nhất quán giữa phía trình
  duyệt và phía server trong từng hồ sơ, và tính ổn định của
  mỗi hồ sơ với chính nó sau khi mở lại. Với hồ sơ Camoufox:
  chỉ thực hiện nếu G3-05B đã chạy được.
- **A3. DNS qua phòng lab trong repo**: `stage0-measure/` có
  máy chủ DNS lab và kịch bản chạy (`run-dns-lab.js`,
  `DNS-LAB.md`). Nếu thực hiện, ghi rõ đường đi đã đo (trực
  tiếp hay qua proxy) — phép đo trên đường trực tiếp đã có ở
  tầng lab Linux; đường qua proxy vẫn là phần chưa đo của sản
  phẩm. Không có điều kiện chạy → NOT_RUN.
- **A4. Quan sát WebRTC/STUN và WebGL trên máy thật**: máy
  nghiệm thu là môi trường Windows thật đầu tiên có UDP và GPU
  thật (các lần đo trước ở môi trường không có hai thứ này).
  Trong phiên hồ sơ, mở trang kiểm tra WebRTC và ghi candidate
  quan sát được theo đúng phân loại của Mục 19 (không suy diễn
  từ việc "không thấy"); mở trang kiểm tra WebGL và ghi
  vendor/renderer quan sát được. Ghi kèm cấu hình mạng của máy
  (có proxy hay direct) cho mỗi quan sát.

## Bảng tổng kết và ký duyệt Gate 3

Sao chép bảng này vào biên bản nghiệm thu, điền kết quả thực
tế. Không sửa tên bước, không xóa dòng NOT_RUN.

| Bước | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| G3-01 | Tải artifact + đối chiếu SHA-256/dung lượng | | |
| G3-02 | Cài đặt + SmartScreen + Defender (+ ghi nhận icon) | | |
| G3-03 | Chạy lần đầu + dùng thử 10 ngày/10 hồ sơ + trần hồ sơ | | |
| G3-04 | Hồ sơ Chromium: tạo/mở/đóng/mở lại, thông số gốc | | |
| G3-05 | Hồ sơ Camoufox: trạng thái cấp danh tính + chặn mở khi chưa có engine | | |
| G3-05B | Nhánh Camoufox đầy đủ với engine đã ký (có điều kiện) | | |
| G3-06 | Proxy HTTP + SOCKS5 trong phiên; proxy hỏng; direct | | |
| G3-07 | License: kích hoạt/token sửa/gia hạn/thu hồi/hủy | | |
| G3-08 | Sao lưu + khôi phục cấu hình (vòng kín, mật khẩu sai) | | |
| G3-09 | Xóa + purge + kiểm kê F3/F4 | | |
| G3-10a | Kiểm tra máy chủ xác minh trong mục License | | |
| G3-10b | Kiểm tra cập nhật ứng dụng — NOT_RUN khai trước | | |
| G3-11 | Gỡ cài đặt + kiểm kê tồn dư | | |
| G3-12 | Mở hai tiến trình: bản thứ hai thoát, cửa sổ đầu được focus, dữ liệu không mất | | |
| Phụ lục A | A1/A2/A3/A4 (tùy chọn, không tính cổng) | | |

**Thông tin ràng buộc kết quả** (điền đủ, thiếu thì biên bản
không hợp lệ):

- Artifact: tên tệp + SHA-256 đã đối chiếu ở G3-01.
- Máy: Windows (phiên bản + build), CPU, RAM, GPU, độ phân
  giải, múi giờ; phiên bản chữ ký Defender.
- Người thực hiện, ngày giờ bắt đầu/kết thúc (kèm múi giờ).
- Cấu hình mạng khi nghiệm thu: hai proxy đã dùng (loại + IP
  thoát kỳ vọng, không ghi mật khẩu), đường mạng của máy.

**Khối ký duyệt**

- Kết luận Gate 3: ĐẠT / CHƯA ĐẠT (theo quy tắc Mục 1 của tài
  liệu này).
- Danh sách FAIL (nếu có): mã bước + mô tả lệch + bằng chứng.
- Danh sách NOT_RUN kèm lý do — bắt buộc gồm G3-10b (trừ khi
  thực tế khác hồ sơ thiết kế) và G3-05B nếu chưa có engine đã
  ký.
- Tồn tại đã công bố đi kèm kết luận: F3 (snapshot phiên còn
  lại sau purge), F4 (workflow còn tham chiếu hồ sơ đã purge),
  giới hạn thu hồi license offline ở G3-07 thao tác 5, icon
  mặc định ở G3-02 — cùng bất kỳ tồn tại mới nào phát hiện
  trong quá trình nghiệm thu.
- Câu phạm vi bắt buộc, ghi nguyên văn vào biên bản: *"Kết quả
  này chỉ áp dụng cho artifact, máy và cấu hình đã ghi ở trên.
  Gate 3 đạt không có nghĩa là sản phẩm đã sẵn sàng phát hành
  thương mại — việc đó thuộc Gate 4 và quyết định của chủ dự
  án."*
- Chữ ký người thực hiện + chữ ký chủ dự án (phê duyệt chuyển
  Gate 4 hoặc yêu cầu sửa và nghiệm thu lại).
