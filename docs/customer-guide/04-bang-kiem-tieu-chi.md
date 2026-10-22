# 4. Bảng kiểm tiêu chí của một hồ sơ — đọc thế nào

Mở chi tiết một hồ sơ, bạn gặp **Bảng kiểm theo tiêu chí**: sáu tiêu
chí kỹ thuật, mỗi tiêu chí có trạng thái riêng và bằng chứng riêng.
Đây là nơi ứng dụng trả lời câu hỏi "hồ sơ này sạch tới đâu" — và nó
trả lời **theo từng tiêu chí**, không gộp thành một kết luận chung.

## 4.1 Sáu tiêu chí và phạm vi của chúng

| Tiêu chí | Phạm vi đúng của nó |
|---|---|
| Cách ly dữ liệu giữa các hồ sơ | Cookie, localStorage, IndexedDB, Cache Storage và Service Worker — **chỉ trong các phép thử đã thực hiện**. |
| Tự nhất quán của các giá trị hồ sơ lộ ra | Các giá trị đo được phải khớp nhau và khớp cấu hình đã khai báo của chính hồ sơ. |
| Khớp danh tính đã ghim | Giá trị đo được so với danh tính đã ghim của chính hồ sơ; chỉ áp dụng khi hồ sơ có danh tính đã ghim. |
| Không trùng tín hiệu tránh được với hồ sơ khác | IP thoát và dải /24 dùng chung, bộ giá trị lộ ra trùng nhau, lệch địa lý — **chỉ trong phạm vi LHM quan sát được**. |
| Đường mạng đúng chính sách đã khai báo | IP thoát, tuyến proxy đã cấu hình, thay đổi IP trong thời gian quan sát. |
| Không thay đổi ngoài dự kiến trong thời gian quan sát | Trôi giá trị lộ ra và trôi IP thoát trong khoảng thời gian quan sát đã ghi. |

Phạm vi ghi ở cột phải là một phần của kết luận: một tiêu chí ĐẠT
chỉ có giá trị **trên đúng những điểm đã có phép đo** thuộc tiêu chí
đó. Điểm chưa có đầu đo thì tiêu chí tương ứng bắt buộc là CHƯA ĐO.

## 4.2 Ba trạng thái

- **ĐẠT** — phép thử tương ứng **đã chạy** trên đúng hồ sơ/phiên đó
  và đáp ứng điều kiện, có bằng chứng kèm theo (quan sát thấy gì,
  lúc nào, đo bằng cách nào).
- **KHÔNG ĐẠT** — phép thử đã chạy và **phát hiện vi phạm**; bằng
  chứng chỉ rõ quan sát nào không đạt và bước xử lý tiếp theo.
- **CHƯA ĐO** — chưa có bằng chứng đủ để kết luận. Lỗi thu thập dữ
  liệu (thiếu quyền, hết thời gian chờ, API không hỗ trợ) cũng nằm ở
  đây kèm lý do — và không được chuyển thành ĐẠT trong bất kỳ
  trường hợp nào.

## 4.3 Cách đọc đúng

1. **Đọc từng dòng, không đọc tổng.** Không có dòng "kết luận tổng
   hợp" và không có điểm số. Một hồ sơ có thể ĐẠT ở tiêu chí cách ly
   dữ liệu đồng thời CHƯA ĐO ở tiêu chí đường mạng — hai điều đó
   không triệt tiêu nhau.
2. **Đọc phần giới hạn của mỗi dòng.** Mỗi dòng có trường giới hạn
   (ví dụ: tiêu chí đường mạng dựa trên quan sát IP thoát ứng dụng
   đã ghi, không bao gồm DNS/WebRTC vì hai điểm đó chưa đo).
3. **CHƯA ĐO là trạng thái thường gặp ở bản hiện tại.** Nguồn dữ
   liệu đã nối vào bảng kiểm hiện nay là báo cáo cảnh báo hợp nhất:
   các cảnh báo IP cấp dữ liệu cho hai tiêu chí *Đường mạng đúng
   chính sách* và *Không trùng tín hiệu tránh được*. Các tiêu chí còn
   lại chưa có nguồn đo nối vào giao diện nên hiển thị CHƯA ĐO — đó
   là hiển thị trung thực về độ phủ đo hiện tại, không phải lỗi của
   hồ sơ của bạn. (Các phép thử cách ly và đo giá trị lộ ra tồn tại
   ở tầng công cụ kiểm thử của dự án; kết quả của chúng chưa được nối
   thành trạng thái trong bảng kiểm này.)
4. **ĐẠT hôm nay không phải ĐẠT mãi.** Kết quả đo gắn với phiên bản
   ứng dụng, phiên bản engine, cấu hình và proxy tại thời điểm đo.
   Đổi engine, đổi proxy hoặc cập nhật ứng dụng thì kết quả cũ hết
   điều kiện áp dụng và cần đo lại.
5. **Bảng kiểm không nói về nền tảng.** Không dòng nào trong bảng
   kiểm kết luận nền tảng quảng cáo có liên kết được các hồ sơ của
   bạn hay không — điều đó nằm ngoài khả năng quan sát của một phần
   mềm trên máy bạn (xem [trang giới hạn](07-nhung-gi-san-pham-khong-hua.md)).

## 4.4 Dữ liệu mẫu

Khung bảng kiểm có nút xem *dữ liệu mẫu* để bạn làm quen với bố cục
ba trạng thái. Dữ liệu mẫu luôn đi kèm banner **DỮ LIỆU MẪU** bắt
buộc — đừng nhầm với trạng thái thật của hồ sơ: trạng thái thật là
bảng không có banner đó.
