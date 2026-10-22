# 7. Những gì sản phẩm KHÔNG hứa

Trang này là một phần của tài liệu chính thức và không tách rời
được khỏi các chương còn lại. LHM Ads Browser được xây theo nguyên
tắc: chỉ nói điều đã đo được, trạng thái nào chưa đo thì ghi chưa
đo. Dưới đây là các giới hạn nói thẳng.

## 7.1 Không hứa về kết quả phía nền tảng quảng cáo

- Sản phẩm **không hứa** hồ sơ vượt qua mọi kiểm tra của Google,
  Facebook hay bất kỳ nền tảng nào, không hứa tài khoản không bị yêu
  cầu xác minh, không bị hạn chế hay bị khóa. Kết quả mỗi lần thử do
  nền tảng quyết định và còn phụ thuộc các tín hiệu nằm ngoài trình
  duyệt.
- Sản phẩm **không hứa** "luôn là người mới" hay bất kỳ tỉ lệ phần
  trăm hiệu quả nào. Không có con số phần trăm nào về khả năng "qua
  mặt" nền tảng được đưa ra, vì không có phép đo nào đứng sau những
  con số như vậy.
- Một lần tạo tài khoản hoàn tất mà không xuất hiện yêu cầu xác minh
  số điện thoại chỉ được ghi đúng là: *"Lần thử này hoàn tất mà
  không xuất hiện yêu cầu xác minh số điện thoại."* Đó là quan sát
  của một lần thử — không phải bằng chứng cho các lần khác, không
  thay cho nghiệm thu cách ly hay mạng, và không có nghĩa nền tảng
  coi hồ sơ là người mới. Hồ sơ trình duyệt mới cũng không bảo đảm
  thiết bị, mạng hay người vận hành là mới đối với nền tảng.
- Từ **"sạch"** trong sản phẩm này chỉ có nghĩa: đạt các tiêu chí
  kỹ thuật đã kiểm thử trong phạm vi công bố của bảng kiểm (chương
  4). Nó không có nghĩa nền tảng không thể liên hệ các phiên, IP có
  uy tín tốt, hay tài khoản sẽ không bị yêu cầu xác minh.

## 7.2 Những thứ nằm ngoài trình duyệt — sản phẩm không kiểm soát và không nhận làm

- **Chất lượng/uy tín IP:** sản phẩm không chấm điểm, không đánh
  giá IP "sạch" hay "xấu". LHM chỉ chịu trách nhiệm phần cấu hình
  proxy, IP thoát quan sát được và cảnh báo dùng chung/đổi tuyến.
  Việc kiểm chất lượng IP thuộc hệ thống riêng của người vận hành;
  hãy chỉ dùng những IP đã qua hệ thống kiểm tra của bạn.
- **Quan hệ tài khoản phía nền tảng:** số điện thoại/email khôi
  phục dùng chung, phương thức thanh toán dùng chung, quan hệ bạn
  bè/Business Manager, lịch sử và uy tín sẵn có của tài khoản — các
  tín hiệu này nằm ngoài trình duyệt; phần mềm trên máy bạn không
  nhìn thấy và không thay đổi được chúng.
- **Hành vi ngoài ứng dụng:** ứng dụng chỉ quan sát thao tác trong
  chính ứng dụng. Nó không đo được mọi thao tác của bạn trên
  website và không kết luận nền tảng sẽ xử lý tài khoản ra sao từ
  các mẫu hành vi.

## 7.3 Những điểm hiện CHƯA ĐO trong sản phẩm

Các hạng mục sau **chưa có phép đo xác nhận trên đường chạy của sản
phẩm** ở bản hiện tại. "Chưa đo" nghĩa là chưa biết — không phải đã
đạt và không phải đã hỏng:

- **WebRTC/ICE trên đường chạy thật:** đã có logic phân loại
  candidate theo loại (host/srflx/relay, mDNS, địa chỉ riêng/công
  khai) và công cụ đo trong phòng lab, nhưng phép đo trên phiên
  trình duyệt qua STUN kiểm soát được chưa cho kết quả (môi trường
  đo hiện tại trình duyệt không gửi yêu cầu tới STUN server đã cấu
  hình — thiếu quan sát, không phải bằng chứng không rò rỉ).
- **DNS:** chưa có đầu đo bằng máy chủ DNS kiểm soát được; chưa kết
  luận được tuyến phân giải tên miền của hồ sơ.
- **Dấu vết giao thức:** TLS (JA3/JA4), HTTP/2, thứ tự HTTP header —
  giữ theo engine, chưa đo trong sản phẩm.
- **IPv6 song song, QUIC/HTTP/3 rò tuyến:** chưa đo.
- **WebGL đối chiếu danh tính:** danh tính đã ghim có chứa giá trị
  WebGL kỳ vọng, nhưng chưa có đầu đo so sánh trên môi trường có
  WebGL (môi trường đo hiện tại không tạo được ngữ cảnh WebGL nên
  phép so có 0 trường so được — ghi là chưa đo, không tính là khớp
  hay lệch).
- **Client Hints độ phân giải cao, định dạng locale, danh sách font,
  giọng đọc hệ thống, thiết bị media, trạng thái quyền, bố cục bàn
  phím, pin:** đã có đầu đo ở tầng công cụ kiểm thử cho một số điểm
  (đầu đo mở rộng 23 điểm đã chạy trên engine thật trong môi trường
  kiểm thử Linux: 13 điểm đo được, 9 điểm engine không hỗ trợ, 1
  điểm bị chặn) — nhưng kết quả đó **chưa phải** phép đo trên bản
  Windows bạn đang dùng và chưa được nối thành trạng thái trong
  bảng kiểm của ứng dụng.
- **Khớp địa lý IP với múi giờ/ngôn ngữ trên đường chạy:** hiện mới
  kiểm tra ở mức cấu hình trước khi mở; GeoIP tự động chưa được
  kiểm chứng (và bị chặn theo fail-closed nếu bật).

Ngược lại, phần đã có bằng chứng đo được gồm: cách ly lưu trữ giữa
hai hồ sơ (cookie, localStorage, IndexedDB, Cache Storage, Service
Worker) trong các phép thử đã thực hiện — gồm ghi đồng thời, khôi
phục sau sự cố tiến trình, sao lưu/khôi phục và cache HTTP/favicon
trong môi trường kiểm thử; và đối chiếu các giá trị danh tính cơ
bản (UA, nền tảng, ngôn ngữ, múi giờ, màn hình, số nhân CPU) khớp
danh tính đã ghim trên engine thật ở môi trường kiểm thử. Một giới
hạn đã đo được trong phép thử sự cố: nếu tiến trình trình duyệt bị
giết ngay sau khi ghi, phần dữ liệu localStorage chưa kịp ghi xuống
đĩa của engine có thể quay về trạng thái đã lưu trước đó (đây là
tính bền ghi của engine; không phát hiện dữ liệu rò sang hồ sơ
khác trong các phép thử đó).

## 7.4 Giới hạn về diễn giải cảnh báo

- Cùng IP thoát hoặc cùng dải /24 **không chứng minh** các hồ sơ do
  cùng một người dùng; địa lý IP là ước lượng. Ngược lại, khác IP
  cũng không tự nó tách được các hồ sơ nếu chúng dùng chung lưu trữ,
  thanh toán hay quan hệ tài khoản.
- Hash dấu vết giống nhau không chứng minh cùng thiết bị; khác nhau
  không chứng minh khác người.
- Cảnh báo được phát **sau khi** ứng dụng quan sát thấy sự kiện đáp
  ứng điều kiện cảnh báo, kèm thời điểm và khoảng giữa hai lần đo —
  ứng dụng không quan sát được thời điểm một hệ thống bên ngoài sử
  dụng dữ liệu, nên không hứa "cảnh báo trước khi nền tảng dùng tín
  hiệu".

## 7.5 Trạng thái phát hành hiện tại

- Bản 5.8.0 là **Preview — chưa phải bản sẵn sàng sản xuất** theo
  tài liệu phát hành đi kèm: còn thiếu nghiệm thu trên máy Windows
  sạch đã cài đặt, kiểm thử trực tiếp với proxy có xác thực/DNS/
  WebRTC trên đường thật, cơ chế cập nhật có ký số, và các kiểm tra
  xuất bản cấp khách hàng. Bản Camoufox phân phối lại kèm theo cần
  bản quyền phát hành đã ký của LHM — nếu chưa có, engine đó chưa
  phải phần hoàn chỉnh của sản phẩm bán ra.
- Vì vậy: dùng bản Preview để đánh giá và vận hành thử trong phạm
  vi bạn kiểm soát được rủi ro; các cam kết của bên bán với bạn nên
  đối chiếu với trang này và với trạng thái ĐẠT/KHÔNG ĐẠT/CHƯA ĐO
  trong chính ứng dụng, không dựa trên lời giới thiệu chung chung.

## 7.6 Dữ liệu ứng dụng thu thập về chính bạn

Để công bằng cả hai chiều, đây là dữ liệu ứng dụng ghi **trên máy
của bạn**: sự kiện thao tác trong ứng dụng (mở/đóng/lưu/xóa hồ sơ —
giữ tối đa 1.200 sự kiện, trong 24 giờ) phục vụ cảnh báo hành vi;
quan sát IP thoát của các hồ sơ có proxy (giữ tối đa 20.000 quan
sát, trong 7 ngày) phục vụ cảnh báo IP. Ứng dụng **không** ghi mật
khẩu, nội dung phím gõ, clipboard hay nội dung biểu mẫu để phân
tích hành vi. Muốn xóa toàn bộ các dữ liệu này: xóa thư mục dữ
liệu của ứng dụng theo chương 5. Các dữ liệu trên không được đồng
bộ lên cloud của LHM.
