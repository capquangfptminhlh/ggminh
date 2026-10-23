# Tích hợp lại trên main — 23/10/2026

## Phạm vi đã được chủ dự án chấp thuận

Đối chiếu và tích hợp phần còn thiếu trên nền main mới; giữ tính năng đã có,
không đẩy nguyên nhánh cũ để thay thế main. Không tự merge main, tag hay phát hành.
Áp dụng Hiến pháp v1.4: Authenticode của installer là tùy chọn; xác minh engine,
chữ ký manifest/cập nhật và các cổng nghiệm thu vẫn giữ nguyên.

## Nguồn tích hợp cố định cho lượt này

- main: `4d63f006239aaab0d69caaacdc67df2e067c8dc2` (bao gồm PR #25–#45).
- PR #23: `cd7d6b95ecc74a255de8098751b163b67c842388`, gồm nền PR #21.
- PR #24: `19564b581fac84a9c036e28b67ff523be9254fd7`.
- Nhánh cục bộ: `08edd42` cùng thay đổi chưa commit về cảnh báo, xóa dữ liệu
  giám sát, cấu hình endpoint đo IP và thông tin nguồn bản build.
- PR #22 không gộp nguyên nhánh: giao diện trùng PR #23 trên nền cũ.

## Thứ tự thực hiện

1. Bảo toàn và kiểm thử phần đang gộp dở PR #23. Sửa seam test dùng đúng
   giao diện BehaviorMonitor, không hạ điều kiện kiểm thử.
2. Gộp main đã ghim, giữ đủ tính năng và chuỗi test mới; đối chiếu các file
   dùng chung (main, preload, renderer, index, package, workflow).
3. Gộp PR #24. Phân biệt nguồn build, bằng chứng artifact CI và công cụ xét
   điều kiện phát hành; nối dữ liệu giữa chúng thay vì dựng cổng thứ hai.
4. Kiểm thử hồi quy, rà soát độc lập, kiểm tra đóng gói theo điều kiện máy.
5. Đẩy nhánh tích hợp và mở Draft PR; ghi chính xác commit, lệnh, kết quả,
   những phép thử CHƯA ĐO. Không dùng CI của commit cũ thay cho lượt này.

## Ranh giới bằng chứng

Kiểm thử bằng dữ liệu tổng hợp không thay nghiệm thu EXE đã cài. Chưa có
lab proxy/DNS/STUN được cấp phép và chưa có khóa publisher production do
chủ dự án cung cấp. Không sinh hoặc công bố bí mật, không chuyển các hạng mục
đó thành ĐẠT. Công cụ phát hành chỉ hỗ trợ rà soát, không tự cấp quyền phát hành.

## Kết quả tích hợp mã nguồn

- `ab35a67`: PR #23 và phần quan sát/cảnh báo hiện hành; không suy diễn
  IP runtime thành chứng nhận tuyến mạng. Xóa dữ liệu giám sát chống ghi
  lại từ kết quả bất đồng bộ cũ; nêu rõ snapshot Health Drift giữ riêng.
- `a6e59ad`: giữ toàn bộ main qua PR #44. `bd3a71b`: nhận PR #24.
- `d51fe38`: gói thuê đúng số ngày bằng `--days`, giữ tháng lịch cũ;
  chỉ còn một bộ tạo bằng chứng `ci-release-evidence.js`. Hai file
  `tools/release-evidence.js` và test tương ứng được hợp nhất, không xóa
  dữ liệu khách; có thể phục hồi từ commit cha nếu cần đối chiếu.
- `eecff14`: nhận PR #45 sửa cập nhật trạng thái hồ sơ.
- Bằng chứng build đối chiếu build-info trong app.asar với nguồn CI,
  SHA-256/size EXE, hash và size của 12 ảnh source + 12 ảnh packaged.
  Cổng thương mại đọc cùng định dạng, không chấp nhận thiếu bằng chứng ảnh,
  phê duyệt sai SHA hoặc trước thời điểm Gate 3. Đây vẫn chỉ là kiểm tra
  cấu trúc bằng chứng, không tự chứng thực lời khai hay tự phát hành.
- Không đổi engine mặc định; không nhập private key production; không
  phát hành Camoufox thương mại hoặc ký thay cho chủ dự án.

## Việc chỉ nghiệm thu thật mới khép được

1. Khóa Ed25519 production do chủ sở hữu quản lý: public key phải vào
   đúng build; engine và bản cập nhật có manifest đã xác minh, quyền
   phân phối/font được chủ sở hữu giải quyết. Authenticode EXE là tùy chọn.
2. Máy chủ license có HTTPS truy cập được từ máy khách, cùng public key,
   ledger/registry bền vững và sweep thực tế. Máy chủ được phép ngoại tuyến
   theo chính sách đã chốt, nhưng kích hoạt ban đầu cần kết nối xác minh.
3. Lab proxy/DNS/STUN được phép kiểm thử để đo tuyến mạng thực tế; thiếu
   đo giữ CHƯA XÁC MINH. Test tổng hợp không thay thế kết quả này.
4. Gate 3 trên máy Windows độc lập dùng đúng EXE/hash; Gate 4 phê duyệt
   đúng commit/hash sau Gate 3. Chưa có bằng chứng thì giữ Preview/Draft.

Các hồ sơ ngày 22/10 và CI của nhánh cũ chỉ là lịch sử. Không dùng chúng
để xác nhận bản build của nhánh `codex/v58-wave-r-finish`.
