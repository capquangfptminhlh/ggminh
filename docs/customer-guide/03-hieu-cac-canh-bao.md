# 3. Hiểu các cảnh báo

Ứng dụng có nhiều lớp cảnh báo khác nhau. Điểm chung bắt buộc của mọi
cảnh báo trong sản phẩm: mỗi cảnh báo trả lời được sáu câu — quan sát
thấy gì; ở hồ sơ/phiên nào; lúc nào và bằng cách nào; so với cấu hình
hoặc tiêu chí nào; **giới hạn của kết luận là gì**; và bạn có thể kiểm
tra/xử lý gì tiếp theo. Khi đọc cảnh báo, hãy đọc cả phần giới hạn —
bỏ qua phần đó là hiểu sai cảnh báo.

Và một nguyên tắc xuyên suốt: **cảnh báo mô tả điều ứng dụng quan sát
được, không kết luận nền tảng quảng cáo đã liên kết các hồ sơ hay sẽ
xử lý tài khoản ra sao.** Ví dụ cảnh báo đúng cách viết là "Hai hồ sơ
có cùng IP thoát tại thời điểm đo" — không phải "hai hồ sơ đã bị
liên kết".

## 3.1 Cảnh báo IP (từ quan sát IP thoát của ứng dụng)

**Cách đo:** ứng dụng ghi lại các *quan sát IP thoát* — mỗi quan sát
gồm hồ sơ, địa chỉ IPv4 công khai quan sát được, thời điểm và phiên
ứng dụng (quan sát được ghi sau khi mở hồ sơ có proxy cấu hình, qua
kiểm tra proxy sẵn có của ứng dụng). Lớp cảnh báo đối chiếu các quan
sát này với nhau và với chính sách vận hành. Vì phép đo chạy ở tiến
trình quản lý, IP ghi được là IP thoát theo cấu hình proxy của hồ
sơ — đó là giới hạn phương pháp cần nhớ: nó không phải phép đo từ
bên trong phiên trình duyệt đang chạy.

| Cảnh báo | Quan sát nghĩa là gì | Bạn nên làm gì tiếp theo |
|---|---|---|
| Nhiều hồ sơ dùng chung một IP thoát | Tại các thời điểm đo, từ hai hồ sơ trở lên cho cùng một IP thoát. Đây là tài nguyên mạng dùng chung quan sát được — theo học thuyết tín hiệu của sản phẩm, IP thoát dùng chung thuộc nhóm tín hiệu liên kết mạnh nhất. | Mở Proxy Center, kiểm tra proxy đang gán cho từng hồ sơ; gán mỗi hồ sơ một IP thoát riêng rồi đo lại IP thoát trước khi chạy các hồ sơ đồng thời. |
| Nhiều hồ sơ tập trung trên cùng một /24 | Các IP thoát mới nhất của nhiều hồ sơ nằm trong cùng một dải /24 (GraphDefense đối chiếu theo quan sát mới nhất của mỗi hồ sơ). | Kiểm tra dải IP của các proxy đang gán; tránh tập trung nhiều hồ sơ trên cùng /24 nếu không có lý do vận hành; đo lại sau khi đổi proxy. |
| Thời gian sử dụng chồng lấp trên cùng một /24 | Hai hồ sơ có khoảng thời gian sử dụng chồng lấp trong khi IP thoát thuộc cùng một /24. | Kiểm tra các proxy cùng /24 và thời gian sử dụng của chúng; đo lại sau khi đổi proxy hoặc đổi lịch sử dụng. |
| IP thoát thay đổi trong một phiên ứng dụng | Cùng một hồ sơ, trong cùng một phiên mở ứng dụng, cho hai IP thoát khác nhau ở hai lần đo. | Kiểm tra độ ổn định của proxy (rớt tuyến, tự đổi cổng ra). Lưu ý: chỉ biết IP khác nhau **giữa hai lần đo** (ví dụ đo lúc 10:02 và 10:07); thời điểm thay đổi chính xác chưa xác định được. |
| Một hồ sơ xuất hiện trên nhiều IP thoát | Một hồ sơ được quan sát trên từ 4 IP thoát khác nhau (ngưỡng của mẫu cảnh báo). | Kiểm tra proxy có đang xoay IP không; nếu có, cân nhắc proxy cố định cho hồ sơ; đo lại nhiều lần để xác nhận độ ổn định. |

**Giới hạn của cảnh báo IP (ghi trong chính phần mềm):** cùng IP
thoát hoặc cùng /24 **không chứng minh** các hồ sơ do cùng một người
dùng; địa lý IP là ước lượng, không mặc định là vị trí vật lý chính
xác; và cảnh báo không nói nền tảng đã dùng tín hiệu này hay chưa.

## 3.2 Cảnh báo hành vi thao tác (nút "Cảnh báo hành vi")

**Cách đo:** ứng dụng chỉ ghi các thao tác **trong chính ứng dụng**
— mở/đóng/lưu/xóa hồ sơ, kể cả thao tác qua API cục bộ — kèm thời
điểm. Ứng dụng **không** ghi nội dung trang web, phím gõ, mật khẩu,
clipboard hay nội dung biểu mẫu. Hộp thoại cảnh báo hành vi hiển thị
hoạt động trong cửa sổ 10 phút gần nhất; lớp phân tích mẫu (D2) xét
thêm các mẫu liên hồ sơ dưới đây.

| Mẫu cảnh báo | Ngưỡng quan sát được | Diễn giải đúng |
|---|---|---|
| Nhiều hồ sơ mở gần như đồng thời | Từ 3 hồ sơ khác nhau được mở trong cửa sổ 60 giây. | Mô tả nhịp vận hành của bạn trong ứng dụng. Nếu mở đồng thời là chủ đích, ghi nhận và bỏ qua; nếu không, mở so le từng hồ sơ. |
| Hai hồ sơ lặp lại cùng chuỗi thao tác | Cùng một chuỗi 3 thao tác liên tiếp xuất hiện ở hai hồ sơ trong cửa sổ 10 phút. | Xem lại quy trình đang sao chép giữa hai hồ sơ; thay đổi thứ tự/ngữ cảnh thao tác nếu phù hợp. |
| Mở/đóng hồ sơ hàng loạt | Từ 8 lần mở và 8 lần đóng trong 10 phút trên toàn ứng dụng. | Thường do tác vụ hàng loạt hoặc script qua API cục bộ — kiểm tra tác vụ đang chạy. |
| Một hồ sơ mở theo nhịp gần như không đổi | Một hồ sơ được mở từ 4 lần, khoảng cách giữa các lần mở đều tới mức hệ số biến thiên dưới 0,1. | Xem lại lịch/tác vụ tự động đang mở hồ sơ theo nhịp cố định. |
| Các cảnh báo nhịp thao tác khác | Mở lặp lại cùng một hồ sơ, chu kỳ mở/đóng liên tục, sửa hồ sơ liên tiếp, lượng yêu cầu mở tăng cao toàn ứng dụng. | Đối chiếu với việc bạn (hoặc script/API của bạn) vừa làm. |

**Giới hạn của cảnh báo hành vi:** mẫu thao tác đều đặn, gõ nhanh,
dán nội dung hay dùng autofill **không phải bằng chứng** chắc chắn
về người hay máy — mẫu này cũng có thể xuất phát từ quy trình vận
hành hợp lệ. Cảnh báo chỉ mô tả mẫu quan sát được trong ứng dụng;
ứng dụng không quan sát thao tác của bạn trên trang web, và không
kết luận nền tảng sẽ xử lý tài khoản ra sao.

## 3.3 Health Drift (trôi sức khỏe cấu hình theo thời gian)

**Cách đo:** bạn chủ động **lưu snapshot** sức khỏe trong mục bảo
trì; snapshot chỉ chứa *số đếm tổng hợp* về cấu hình cục bộ (bao
nhiêu hồ sơ ở trạng thái lỗi/cảnh báo…) — không chứa IP, định danh
hay dữ liệu duyệt web. Lớp so sánh (detectDrift) đối chiếu 3 snapshot
gần nhất với cửa sổ snapshot trước đó.

- Chưa đủ snapshot (mỗi cửa sổ cần tối thiểu 3): trạng thái là
  **insufficient — chưa đủ dữ liệu**, không phải "ổn định".
- **stable:** tỉ lệ lỗi/cảnh báo không tăng đáng kể giữa hai cửa sổ.
- **review:** tỉ lệ hồ sơ *cảnh báo* cấu hình ở cửa sổ gần nhất tăng
  từ 0,30 so với cửa sổ trước.
- **investigate:** tỉ lệ hồ sơ *lỗi* cấu hình tăng từ 0,20.
- Cảnh báo riêng "Phiên bản ứng dụng thay đổi giữa các lần đo": kết
  quả đo cũ có điều kiện hết hiệu lực khi phiên bản đổi — cần đo lại
  theo phiên bản mới.

**Giới hạn:** Health Drift chỉ nói về cấu hình cục bộ của đội hồ sơ
theo thời gian; nó không nói gì về hệ thống bên ngoài, không chứa dữ
liệu định danh, và không thay thế việc xử lý từng hồ sơ đang lỗi —
bước tiếp theo là mở kiểm tra sức khỏe hồ sơ, sửa các lỗi cấu hình
đang tăng, rồi lưu thêm snapshot để đối chiếu lại.

## 3.4 Khi một nguồn dữ liệu chưa có

Báo cáo cảnh báo hợp nhất của ứng dụng đánh giá từng nguồn riêng:
nguồn nào chưa có dữ liệu (ví dụ chưa có quan sát IP thoát nào được
ghi) thì nguồn đó ở trạng thái **chưa đo (not_measured)** kèm lý do,
và kết quả chung ghi là chưa đầy đủ — một nguồn thiếu dữ liệu
không được tính là "bình thường" trong bất kỳ trường hợp nào. Nếu bạn thấy trạng
thái chưa đo, cách xử lý là tạo điều kiện đo (mở hồ sơ có proxy để
ứng dụng ghi quan sát IP; lưu đủ snapshot cho Health Drift), không
phải bỏ qua.
