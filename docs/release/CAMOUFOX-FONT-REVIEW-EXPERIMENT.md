# Thử nghiệm engine Camoufox giới hạn font

**Chỉ để kiểm thử nội bộ; không phát hành.** Nhánh này thử một ZIP riêng gồm 700 tệp font đã lọc bằng metadata. Việc có văn bản và URL giấy phép trong metadata không chứng minh quyền phân phối; cần rà soát nguồn, bản quyền và các thành phần khác trước khi dùng cho khách hàng.

Ứng viên được ghim riêng theo hash ZIP `db7a36ff3936c5bd8aeea5652c643324b8c042a2085d85e7cd0b7d674e5ac025` và payload `0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d`. Engine được nhập vào `engines-pinned-font-review/camoufox`; engine trong `engines-pinned/camoufox` và `engines/camoufox` không bị ghi đè. Cấu hình độ bền chỉ được áp dụng với executable đã ghim và một trong hai payload chính xác của bản cũ và ứng viên.

Các phép đo hiện có gồm nhập ZIP với manager, kiểm tra toàn bộ tệp, thử mở headless và dữ liệu cookie/localStorage giả lập. Chưa nghiệm thu UI bản đóng gói, IndexedDB, tương thích website, proxy hoặc quyền phân phối font. Loại bỏ font có thể ảnh hưởng hiển thị. Không hứa dữ liệu tồn tại khi tắt cưỡng bức, không khẳng định cách ly tuyệt đối hoặc tránh được việc nền tảng liên kết hồ sơ.
