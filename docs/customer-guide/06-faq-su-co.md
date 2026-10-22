# 6. FAQ xử lý sự cố

Mỗi mục theo mẫu: **Hiện tượng → Nguyên nhân (ở mức kiểm chứng được
trong phần mềm) → Cách xử lý**. Phần mềm này chặn theo thiết kế
(fail-closed) khi điều kiện bắt buộc không đạt: bị chặn kèm lý do là
hành vi đúng spec, không phải phần mềm hỏng — và nó **không** tự mở
hồ sơ bằng engine hay đường mạng khác để "qua mặt" điều kiện chặn.

<a name="http-409"></a>
## 6.1 Lỗi HTTP 409 từ API cục bộ

API cục bộ (cổng 50325) trả 409 trong đúng các trường hợp sau:

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Mở hồ sơ Camoufox qua API báo 409 "Camoufox automation unavailable…" | Hồ sơ Camoufox không có endpoint/context Playwright đã xác minh để điều khiển qua API. Firefox DevTools không phải CDP nên phần mềm không giả lập một cổng điều khiển. | Mở hồ sơ Camoufox bằng giao diện để duyệt thủ công. Muốn điều khiển qua API, cần cấu hình phòng lab đã được duyệt của dự án — liên hệ bên bán. |
| Mở hồ sơ Gecko qua API báo 409 "Gecko profile is manual-only; CDP API is not supported." | Hồ sơ Firefox/Gecko được thiết kế chỉ chạy thủ công; API điều khiển bị từ chối theo fail-closed. | Mở bằng giao diện. Nếu cần RPA/API, dùng hồ sơ Chromium. |
| Gọi điều hướng (navigate) báo 409 "Playwright lab unavailable" | Controller Playwright chưa được bật trong cấu hình hiện tại. | Bật cấu hình lab tương ứng hoặc điều hướng trực tiếp trong trình duyệt. |
| Gọi điều hướng báo 409 "No active Camoufox Playwright context" | Hồ sơ chưa được mở qua controller nên chưa có context đang hoạt động. | Mở hồ sơ trước, rồi mới gọi điều hướng. |
| Sửa hồ sơ qua API báo 409 "Stop browser and wait for exit before editing profile" | Hồ sơ đang chạy trình duyệt (hoặc tiến trình chưa thoát hẳn). | Đóng trình duyệt của hồ sơ, chờ tiến trình thoát, sửa lại. |
| Xóa hồ sơ qua API báo 409 "Stop browser and wait for exit before deleting profile" | Tương tự khi xóa. | Đóng trình duyệt, chờ thoát hẳn, xóa lại. (Xóa qua giao diện cũng bị chặn tương tự khi hồ sơ đang bận.) |

<a name="network-blocked"></a>
## 6.2 Mở hồ sơ bị chặn: `NETWORK_BLOCKED`

**Hiện tượng:** mở hồ sơ thất bại với lỗi bắt đầu bằng
`NETWORK_BLOCKED:` kèm lý do.

**Nguyên nhân theo từng lý do (đây là các nhánh kiểm tra có thật
trước khi mở):**

- *"GeoIP behavior has not been verified"* — hồ sơ bật GeoIP trong
  khi hành vi GeoIP chưa được kiểm chứng trong sản phẩm. Tắt GeoIP
  trong cấu hình hồ sơ hoặc chờ bản có kiểm chứng.
- *"Authenticated Camoufox proxy requires approved Windows network
  lab"* — hồ sơ Camoufox dùng proxy có xác thực nhưng môi trường
  chưa được duyệt làm phòng lab mạng. Ở bản Preview, đường proxy có
  xác thực cho Camoufox chỉ mở trong điều kiện lab đã duyệt; ngoài
  lab, dùng hồ sơ không proxy xác thực hoặc engine khác.
- *"Proxy Center vault and approved upstream required"* / *"Proxy
  reference mismatch"* / *"Missing proxy credentials"* — proxy tham
  chiếu trong hồ sơ không khớp bản ghi trong Proxy Center (host,
  loại, cổng) hoặc kho bảo mật không có đủ tài khoản/mật khẩu. Vào
  Proxy Center kiểm tra lại bản ghi proxy và gán lại cho hồ sơ.
- Cấu hình proxy sai định dạng cũng bị chặn ở bước chuẩn hoá — kiểm
  tra lại host/cổng/loại proxy đã nhập.

## 6.3 Cảnh báo PREFLIGHT_ONLY là gì — hồ sơ có "an toàn" không?

**Hiện tượng:** kiểm tra trước khi mở cho kết quả `PREFLIGHT_ONLY`
(hồ sơ không dùng proxy) hoặc `LAB_PREFLIGHT_ONLY` (proxy đã được
duyệt trong lab) và hồ sơ vẫn mở được.

**Nguyên nhân/diễn giải đúng:** hai mã này nghĩa là *kiểm tra cấu
hình đã đạt* — đồng thời phần mềm ghi rõ trong chính kết quả:
với hồ sơ trực tiếp là "an toàn rò rỉ mạng **chưa được chứng
nhận**", với hồ sơ lab là "kết quả DNS/WebRTC **vẫn chưa được kiểm
tra**". Kiểm tra trước khi mở (preflight) **không phải** chứng nhận
chống rò rỉ WebRTC/DNS — hai điểm đó hiện CHƯA ĐO trong sản phẩm.

**Cách xử lý:** không cần xử lý để mở hồ sơ. Cần ghi nhớ đúng phạm
vi: đừng coi PREFLIGHT_ONLY là bằng chứng tuyến mạng đã được kiểm
chứng; nếu nghiệp vụ của bạn bắt buộc có bằng chứng DNS/WebRTC, đó
là hạng mục chưa có trong bản này (xem
[trang giới hạn](07-nhung-gi-san-pham-khong-hua.md)).

<a name="provisioning"></a>
## 6.4 Tạo hồ sơ Camoufox xong nhưng không có danh tính đã ghim (provisioning unavailable)

**Hiện tượng:** hồ sơ Camoufox tạo thành công nhưng trạng thái cấp
danh tính ghi *unavailable*, hoặc thao tác cấp danh tính cho hồ sơ
sẵn có trả về `unavailable`/`invalid`.

**Nguyên nhân (theo từng mã lý do trong phần mềm):**

- `engine-not-installed-or-unverified` — máy chưa có engine Camoufox
  đã qua kiểm chứng chữ ký (cơ chế sinh danh tính cần đúng binary đã
  kiểm chứng đó). Đây là nguyên nhân thường gặp nhất ở máy mới.
- `generator-package-missing` — thành phần sinh danh tính chính thức
  chưa được cài trong bản đóng gói.
- `no-verified-engine-resolver` — thành phần kiểm chứng engine chưa
  sẵn sàng trong phiên chạy (ví dụ mở thao tác quá sớm sau khi khởi
  động, hoặc engine chưa từng được cấu hình).
- `generated-identity-failed-validation` (trạng thái `invalid`) —
  danh tính sinh ra không qua được chính bộ kiểm chứng của ứng dụng;
  phần mềm **không gắn** danh tính đó vào hồ sơ. Hồ sơ vẫn dùng được
  với thông số gốc của engine.

**Cách xử lý:** (1) Mở hộp thoại Engine, kiểm tra trạng thái
Camoufox; cài/cài lại bằng nút **Cài đặt Camoufox được xác minh**
nếu chưa có. (2) Sau khi engine đạt kiểm chứng, dùng thao tác cấp
danh tính cho hồ sơ đã có, hoặc tạo hồ sơ mới. (3) Nếu vẫn
`generator-package-missing` hoặc `invalid` sau các bước trên, gửi mã
lý do cho bên bán — không tự sửa file danh tính bằng tay: danh tính
chỉ hợp lệ khi do cơ chế chính thức sinh và qua kiểm chứng.

## 6.5 Cài Camoufox / dùng engine bị từ chối kiểm chứng

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "Browser release was not signed by the trusted publisher" | Bản phát hành không được ký bằng khóa publisher độc lập mà ứng dụng tin cậy. | Chỉ cài bản do bên bán/LHM phát hành chính thức. Không thay khóa, không tắt kiểm chứng. |
| "Release SHA-256 or length does not match published descriptor" | Tệp tải về không khớp kích thước/mã băm trong descriptor đã ký (tải dở, sai bản, hoặc bị thay đổi). | Tải lại từ nguồn phát hành chính thức; kiểm tra mạng; thử lại. Vẫn lệch thì dừng và báo bên bán — đừng cài tiếp. |
| "Browser packages must come from an explicit HTTPS GitHub release" | URL tải không thuộc nguồn phát hành HTTPS được phép. | Dùng đúng đường phát hành chính thức; phần mềm không nhận nguồn khác. |
| "Existing Camoufox directory is invalid; do not overwrite. Review and back it up manually." | Thư mục Camoufox hiện có không hợp lệ và trình cài từ chối ghi đè. | Sao lưu thư mục đó thủ công ra nơi khác, xóa thư mục hỏng, rồi cài lại. Phần mềm cố ý không tự ghi đè để tránh mất dữ liệu. |
| "Engine installation is already in progress" | Một lần cài đang chạy. | Đợi lần cài hiện tại kết thúc; không mở song song. |
| Nguồn Bundled Chromium không khả dụng | Manifest chưa ký đúng hoặc có tệp không khớp SHA-256. | Dùng nguồn System (Chrome/Edge trên máy) trong lúc chờ bản bundled đạt kiểm chứng từ nhà phát hành. |

<a name="license"></a>
## 6.6 License

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Kích hoạt báo license thuộc bản cài khác (`different_installation`) | Mã license được cấp cho một mã cài đặt (Installation ID) khác — thường do cấp nhầm mã, hoặc cài lại ứng dụng/máy mới làm đổi mã cài đặt. | Mở mục License, sao chép **mã cài đặt hiện tại** và gửi bên bán cấp lại đúng mã này. |
| "License expired" khi kích hoạt, hoặc thao tác bị chặn với lý do `expired` | License đã quá ngày hết hạn ghi trong chính license. | Liên hệ bên bán gia hạn; bên bán cấp mã mới, bạn dán lại vào mục License. Dữ liệu vẫn xem/sao lưu/khôi phục được trong lúc chờ. |
| Báo `trial_expired` | Đã hết 10 ngày dùng thử (tối đa 10 hồ sơ) và chưa có license hiệu lực. | Kích hoạt license đã mua. Dùng thử không tự bắt đầu lại; license hết hạn cũng không quay về dùng thử. |
| Báo lỗi đồng hồ (`clock_error`) | Đồng hồ hệ thống của máy ở trạng thái không hợp lệ so với mốc thời gian đã ghi (ví dụ giờ máy bị lùi về trước thời điểm bắt đầu dùng thử). | Đặt lại ngày giờ Windows cho đúng (bật đồng bộ giờ tự động), khởi động lại ứng dụng. Vẫn lỗi thì liên hệ bên bán — trạng thái này có cơ chế chống sửa giờ nên không tự bỏ qua được. |
| "License không ở trạng thái hiệu lực" sau khi dán mã | Mã thuộc về máy này nhưng chưa tới ngày hiệu lực (`not_yet_valid`) hoặc đã bị thu hồi phía máy chủ xác minh. | Kiểm tra ngày giờ máy; nếu đúng giờ, hỏi bên bán về trạng thái license của bạn. |
| Tạo hồ sơ báo đạt giới hạn (ví dụ "Giới hạn 10 profile của gói dùng thử đã đạt") | Số hồ sơ hiện có + số sắp tạo vượt `maxProfiles` của gói. | Xóa bớt hồ sơ không dùng (vào thùng rác) hoặc nâng gói. Mở/sửa hồ sơ hiện có vẫn được. |
| Tính năng bị chặn kiểu "Gói … không cho phép api/automation" | Gói Starter chỉ gồm tính năng hồ sơ; API và Automation thuộc gói Pro/Business. | Nâng gói nếu cần tính năng đó. |

## 6.7 Sao lưu / khôi phục

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| "Mật khẩu sao lưu cần tối thiểu 12 ký tự" | Mật khẩu đặt cho bản sao lưu ngắn hơn quy định. | Đặt mật khẩu từ 12 ký tự trở lên. |
| Giải mã thất bại khi nhập bản sao lưu | Sai mật khẩu, hoặc tệp sao lưu đã bị thay đổi/hỏng (mã hóa AES-256-GCM phát hiện được thay đổi). | Kiểm tra lại mật khẩu và dùng bản sao lưu gốc. Không có mật khẩu đúng thì không đọc được — phần mềm không có đường vòng. |
| "Sao lưu không chứa thông tin đăng nhập proxy" | Tệp sao lưu chứa trường tài khoản/mật khẩu proxy — định dạng sao lưu cấm điều này. | Chỉ dùng tệp do chính ứng dụng xuất ra; sau khi nhập, gán lại thông tin proxy trong Proxy Center. |
| Hồ sơ nhập về bị khóa, đòi gán proxy | Hồ sơ có proxy mã hóa được khôi phục ở trạng thái *cần gán lại proxy* theo thiết kế. | Mở hồ sơ, gán proxy từ Proxy Center, sau đó mở bình thường. |

## 6.8 Khác

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Khôi phục từ thùng rác báo hết hạn ("Trash retention has expired after 30 days") | Hồ sơ đã nằm trong thùng rác quá 30 ngày. | Không khôi phục được nữa; nếu còn bản sao lưu cấu hình/snapshot, khôi phục từ đó. |
| Kiểm tra Health Drift báo "insufficient" | Chưa đủ snapshot: mỗi cửa sổ so sánh cần tối thiểu 3 snapshot. | Lưu thêm snapshot ở các thời điểm khác nhau rồi kiểm tra lại. Đây là trạng thái "chưa đủ dữ liệu", không phải lỗi. |
| Kiểm tra proxy đạt nhưng cảnh báo IP vẫn xuất hiện | Hai việc khác nhau: kiểm tra proxy đo kết nối tại thời điểm bấm; cảnh báo IP đối chiếu các quan sát đã ghi theo thời gian và theo đội hồ sơ (dùng chung IP, /24, đổi IP giữa phiên…). | Đọc nội dung cảnh báo (chương 3) để biết quan sát cụ thể và bước xử lý tương ứng. |
| Tạo Gmail xong không bị hỏi số điện thoại — hồ sơ đã "sạch" chưa? | Kết quả một lần thử tạo tài khoản không phải phép đo các tiêu chí của hồ sơ. | Cách ghi đúng và duy nhất: *"Lần thử này hoàn tất mà không xuất hiện yêu cầu xác minh số điện thoại."* Muốn biết tình trạng hồ sơ, xem bảng kiểm tiêu chí (chương 4) — tiêu chí nào CHƯA ĐO thì kết luận tương ứng là chưa biết. |
