# Ghi chú phát hành — LHM Ads Browser 5.8.0 Preview

**Nền tảng:** Windows x64.
**Trạng thái:** bản **Preview** — chưa phải bản phát hành thương mại
chính thức.

> **Đọc trước khi dùng.** Bản 5.8.0 Preview đã qua kiểm thử tự động
> và đo kiểm trong môi trường kiểm thử, nhưng **chưa được nghiệm
> thu sau khi cài đặt trên máy Windows độc lập** (cổng nghiệm thu
> Gate 3 của dự án chưa thực hiện). Ở giai đoạn này, bản Preview
> dùng cho thử nghiệm nội bộ có giám sát. Việc dùng thử với khách
> thật chỉ bắt đầu sau khi bản cài qua được kiểm thử tối thiểu trên
> máy độc lập, kèm công khai rõ các tính năng chưa hỗ trợ — các giới
> hạn đó được liệt kê ngay trong tài liệu này và đầy đủ hơn ở
> chương 7 của Sổ tay người dùng ("Những gì sản phẩm KHÔNG hứa").

## Tệp cài đặt của bản này

| Mục | Giá trị |
| --- | --- |
| Tên tệp | `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` |
| Kích thước | 89.473.785 byte |
| SHA-256 | `54aec523bfc6436d3b0a702407fbdf1333a64b9faaf9dd448152f7c4e383b497` |

Bản cài **chưa ký số bằng chứng chỉ Authenticode** — đây là trạng
thái phát hành hiện tại do bên bán lựa chọn. Khi chạy tệp cài đặt,
Windows sẽ hiện cảnh báo SmartScreen; cách nhận diện đúng cảnh báo
và thao tác **More info → Run anyway** được hướng dẫn từng bước ở
chương 1 của Sổ tay người dùng. Hãy đối chiếu mã SHA-256 ở bảng
trên với tệp bạn nhận được trước khi cài.

## Có gì mới so với bản 5.7.0

**Hồ sơ Camoufox có danh tính ghim theo từng hồ sơ.** Khi tạo hồ
sơ Camoufox, ứng dụng dùng công cụ sinh danh tính chính thức của
Camoufox để cấp một danh tính và ghim vào hồ sơ đó. Nếu tại thời
điểm tạo, công cụ sinh hoặc engine chưa sẵn sàng, hồ sơ vẫn được
tạo nhưng **không** kèm danh tính đã ghim, và ứng dụng ghi rõ trạng
thái này trên hồ sơ thay vì im lặng; một danh tính sinh ra không
hợp lệ sẽ không được gắn vào hồ sơ. Hồ sơ tạo từ trước có thể cấp
danh tính bằng nút **Cấp danh tính** trong ứng dụng. Sau khi tạo hồ
sơ, ứng dụng thông báo kết quả cấp danh tính kèm việc bạn có thể
làm tiếp theo.

**Cài đặt Camoufox theo quy trình xác minh.** Việc cài engine
Camoufox chỉ chạy khi bạn bấm nút và xác nhận, chỉ nhận bản phát
hành được LHM ký riêng, và kiểm tra kích thước, mã SHA-256 cùng
chữ ký manifest trước khi giải nén; kiểm chứng không đạt thì cài
đặt dừng lại, ứng dụng không tự thay bằng bản khác. Lưu ý: bản
Preview này **không đóng gói kèm** bộ engine Camoufox thương mại.

**Hệ thống cảnh báo hợp nhất, có lịch sử lưu bền.** Các cảnh báo
về IP thoát (dùng chung IP giữa các hồ sơ, đổi IP trong phiên),
hành vi và Health Drift được đưa về một định dạng bằng chứng thống
nhất: quan sát thấy gì, ở hồ sơ nào, lúc nào, giới hạn của quan sát
là gì. Lịch sử cảnh báo nay được lưu lại qua các lần mở ứng dụng
(trước đây chỉ tồn tại trong phiên làm việc), và tệp trạng thái
cảnh báo bị hỏng sẽ được báo là lỗi thay vì hiển thị như dữ liệu
đúng một phần.

**Bảng kiểm tiêu chí hiển thị dữ liệu đo thật.** Mỗi hồ sơ có một
bảng kiểm 6 tiêu chí với trạng thái ĐẠT / KHÔNG ĐẠT / CHƯA ĐO, và
không có kết luận gộp. Ở các bản dựng nội bộ trước của bản 5.8,
khung bảng kiểm chưa hiển thị được dữ liệu đo — lỗi này đã được
sửa. Hiện hai tiêu chí (tuyến mạng, trùng lặp giữa các hồ sơ) nhận
dữ liệu trực tiếp từ hệ thống cảnh báo; các tiêu chí còn lại cần
bản ghi đo riêng theo từng hồ sơ — loại bản ghi này chưa được tạo
trong quá trình dùng thường, nên các tiêu chí đó vẫn ở trạng thái
CHƯA ĐO (xem mục Giới hạn).

**Đo IP thoát từ bên trong phiên trình duyệt (khi được cấu hình).**
Ứng dụng có thêm khả năng đo IP thoát ngay trong phiên trình
duyệt và ghi nhãn nguồn đo là từ trình duyệt, tách bạch với số đo
từ tiến trình quản lý. Khả năng này chỉ hoạt động khi bên bán cấu
hình một điểm đo (endpoint) do LHM vận hành; chưa cấu hình thì
không có số đo nào được ghi theo nguồn này.

**API cục bộ giảm dữ liệu trả ra.** API cục bộ không còn trả về
ghi chú của hồ sơ và toàn bộ dữ liệu danh tính của hồ sơ qua HTTP;
thay vào đó chỉ trả thông tin nguồn gốc của danh tính (định dạng,
phiên bản, công cụ sinh, thời điểm sinh). Đường dữ liệu đầy đủ qua
giao diện ứng dụng không thay đổi.

**Xóa vĩnh viễn hồ sơ xóa đủ bốn vùng lưu trữ.** Khi một hồ sơ bị
xóa vĩnh viễn, dữ liệu của nó được xóa ở cả bốn vùng lưu trữ của
ứng dụng — gồm vùng hồ sơ Camoufox và vùng tiện ích mở rộng. Các
bản dựng trước của dòng 5.8 chỉ dọn hai vùng, khiến dữ liệu của hồ
sơ Camoufox đã xóa vẫn còn trên đĩa; lỗi này đã được sửa và có
kiểm thử ghim lại. Sao lưu và khôi phục cấu hình cũng đã qua diễn
tập kiểm chứng: khôi phục đúng nội dung đã sao lưu, mật khẩu sai
hoặc tệp sao lưu bị sửa dù một byte đều bị từ chối.

**License bền hơn khi tệp trạng thái hỏng.** Nếu tệp trạng thái
license trên máy bị hỏng, ứng dụng không còn dừng khi khởi động;
trạng thái được báo là không hợp lệ và việc dùng tính năng bị
chặn theo đúng chính sách, và việc kích hoạt lại bằng license hợp
lệ sẽ tự khôi phục.

**Trải nghiệm lần đầu rõ ràng hơn.** Nhãn trạng thái danh tính của
hồ sơ được sửa cho đúng sự thật ("Danh tính đã ghim" / "Chưa cấp
danh tính đã ghim"), hộp thoại nguồn engine hướng dẫn bằng tiếng
Việt kèm bước xử lý khi có lỗi, và trạng thái sẵn sàng của engine
Camoufox được hiển thị ngay trong biểu mẫu tạo hồ sơ.

## Giới hạn đã biết của bản Preview

Danh sách đầy đủ nằm ở chương 7 của Sổ tay người dùng. Các điểm
chính:

- **Chưa nghiệm thu trên máy Windows độc lập** (Gate 3): bản cài
  chưa được cài và kiểm chứng trên một máy Windows thật ngoài môi
  trường CI, gồm cả hành vi với Windows Defender và dữ liệu còn
  lại sau khi gỡ cài đặt.
- **Các điểm CHƯA ĐO:** WebRTC/ICE trên đường chạy thật với STUN
  kiểm soát được; DNS qua tuyến proxy và hành vi DNS-over-HTTPS;
  dấu vết TLS/HTTP2; IPv6 và QUIC; WebGL đối chiếu danh tính trên
  máy Windows có GPU thật; khớp địa lý IP với múi giờ/ngôn ngữ một
  cách tự động. "Chưa đo" nghĩa là chưa biết — không phải đã đạt
  và không phải đã hỏng.
- **Ba tiêu chí cách ly của bảng kiểm vẫn CHƯA ĐO** cho từng hồ sơ
  cụ thể, vì chưa có bản ghi đo theo hồ sơ; phép đo cách ly đã có
  ở tầng môi trường kiểm thử, chưa thay thế được bản ghi theo hồ
  sơ trên máy của bạn.
- **Chưa có cập nhật tự động trong ứng dụng.** Một module kiểm tra
  bản cập nhật có ký số đã tồn tại ở mức nguyên mẫu trong mã
  nguồn nhưng chưa được nối vào giao diện; phiên bản mới vẫn được
  cung cấp qua bên bán.
- **Snapshot phiên do người dùng tự tạo chưa được xóa** khi xóa
  vĩnh viễn hồ sơ, và giao diện xóa chưa nêu rõ điều này; các
  workflow tự động còn tham chiếu tới hồ sơ đã xóa cũng chưa được
  tự dọn. Dữ liệu phiên trong snapshot vì vậy vẫn còn trên đĩa cho
  tới khi bạn tự xóa thư mục snapshot.
- **Chưa có biểu tượng (icon) riêng:** ứng dụng đang dùng icon mặc
  định của Electron.
- **Engine Camoufox thương mại chưa đi kèm:** quy trình cài đặt và
  xác minh engine đã có trong ứng dụng, nhưng bộ engine ký bằng
  khóa phát hành chính thức chưa được phân phối cùng bản Preview.

## Bắt đầu sử dụng

Cài đặt, dùng thử 30 ngày và kích hoạt license: xem chương 1 của
Sổ tay người dùng đi kèm. Mọi mô tả trong ghi chú này chỉ nói về
những gì phần mềm làm được và đã kiểm chứng ở phạm vi ghi kèm;
phần mềm không hứa kết quả phía các nền tảng quảng cáo — xem
chương 7 của Sổ tay để biết các giới hạn nói thẳng.

---

## Phụ lục biên tập — nguồn của các khẳng định (xóa trước khi công bố)

| Khẳng định | Nguồn |
| --- | --- |
| Trạng thái Preview, chưa nghiệm thu máy Windows độc lập | Hiến pháp §12 (Gate 3 chưa có bằng chứng); `docs/customer-guide/README.md`; chương 7 §7.5 |
| SHA-256 và kích thước tệp cài đặt | Artifact của Windows CI run 39641363889 tại commit `f549a63`; mã băm tệp EXE do phía chủ dự án tính từ artifact đã tải về |
| Bản cài chưa ký Authenticode theo lựa chọn của bên bán | Quyết định của chủ dự án ghi ngày 2026-10-22; hướng dẫn SmartScreen ở chương 1 §1.1 của Sổ tay |
| Cấp danh tính khi tạo hồ sơ; không có công cụ sinh thì tạo hồ sơ không kèm danh tính và ghi trạng thái | `src/engine/camoufoxProvisioning.js` (ghi `fingerprint.identityProvisioning = 'unavailable'`; danh tính không hợp lệ không được gắn) |
| Nút Cấp danh tính; thông báo kết quả cấp danh tính; nhãn trạng thái; hướng dẫn tiếng Việt ở hộp thoại engine | Thay đổi giao diện đợt Wave 2 (agent-16), kiểm thử `test/first-run-ux.js` |
| Cài Camoufox xác minh: chỉ bản LHM ký, kiểm kích thước + SHA-256 + chữ ký manifest | `src/engine/camoufoxInstallService.js`; Sổ tay chương 1 §1.4 |
| Bản Preview không đóng gói engine Camoufox thương mại | Điều kiện kiểm tra staging trong workflow đóng gói (thư mục engine đóng gói không chứa tệp engine thương mại ở bản Preview) |
| Cảnh báo hợp nhất theo định dạng bằng chứng; lịch sử lưu bền; hỏng tệp báo lỗi | `src/health/` + `src/monitor/warningService.js`; `src/monitor/warningHistory.js` (projection whitelist, retention, trạng thái lỗi khi hỏng) |
| Bảng kiểm 6 tiêu chí; lỗi không hiển thị dữ liệu đã sửa; 2 tiêu chí có dữ liệu trực tiếp; tiêu chí cách ly CHƯA ĐO vì chưa có bản ghi theo hồ sơ | `src/ui/criteriaChecklist.js`, `src/ui/criteriaChecklistProvider.js`; hợp đồng bản ghi `lhm-profile-measurement` v1 (agent-9) |
| Đo IP thoát từ trong phiên trình duyệt, chỉ khi cấu hình endpoint | `src/health/runtimeEgressObservation.js`; nối dây có điều kiện `settings.runtimeEchoUrl` trong `main.js` |
| API không trả ghi chú và dữ liệu danh tính qua HTTP | `src/api/server.js` (`apiProfile()` thay blob danh tính bằng metadata nguồn gốc có `redacted: true`) |
| Xóa vĩnh viễn đủ bốn vùng lưu trữ | `src/db/store.js`: `PROFILE_DATA_ROOTS` (dòng 25), dùng ở `cleanupTrashedFolders` và `deleteProfile`; kiểm thử `test/profile-deletion-backup-drill.js` |
| Diễn tập sao lưu/khôi phục; sai mật khẩu hoặc sửa tệp bị từ chối | Kiểm thử diễn tập agent-17 trên đường sao lưu thật (`ConfigBackup`) |
| License hỏng không dừng ứng dụng, chặn theo chính sách | Sửa lỗi agent-18 trong `src/licensing/`; ma trận trạng thái `test/license-state-matrix.js` |
| Module kiểm tra cập nhật mới ở mức nguyên mẫu, chưa nối giao diện | `src/update/updateCheck.js` tồn tại; không có tham chiếu nào từ `main.js`/`preload.js`/giao diện (đã kiểm bằng tìm kiếm trong cây mã) |
| Snapshot phiên chưa xóa theo hồ sơ; workflow mồ côi | Hạng mục mở F3/F4 của agent-17 |
| Chưa có icon riêng | Cấu hình đóng gói không đặt `build.icon`; không có thư mục `build/` chứa icon trong cây mã |
| Các điểm CHƯA ĐO | Sổ tay chương 7 §7.3; Hiến pháp §4 (cột trạng thái đo) |
