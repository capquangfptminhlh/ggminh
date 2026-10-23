# Sổ tay người bán (runbook) — LHM Ads Browser

Tài liệu vận hành nội bộ cho bên bán/cấp license. Mọi lệnh dưới đây
đối chiếu với `tools/license-admin.js`, `tools/issue-license.js` và
`src/licensing/` trong repo tại commit của bản phát hành.

> **Ranh giới an toàn bắt buộc**
> - Công cụ cấp license **không nằm trong bộ cài của khách**: cấu
>   hình đóng gói loại trừ tường minh `tools/issue-license.js`,
>   `tools/license-admin.js`, `tools/license-authority.js`,
>   `tools/license-registry.js`, `tools/license-dashboard.js` và
>   `tools/sign-bundled-engine.js` khỏi gói ứng dụng. Chỉ chạy các
>   công cụ này trên máy của bên bán.
> - Khóa riêng của nhà phát hành, sổ khách hàng (ledger) và sổ thu
>   hồi (registry) phải nằm **ngoài repo và ngoài bộ cài**. Ledger
>   và registry là hai file khác nhau — công cụ từ chối nếu trùng.
> - Mật khẩu khóa (passphrase) chỉ truyền qua biến môi trường
>   `LHM_ISSUER_PASSPHRASE` (tối thiểu 12 ký tự), **không** truyền
>   qua tham số dòng lệnh.
> - Token license được **in ra đúng một lần** khi cấp và không được
>   ghi vào ledger. Làm mất token sau khi cấp = cấp license mới;
>   không có cách lấy lại token cũ từ sổ.

## 1. Chuẩn bị một lần

1. Tạo khóa phát hành Ed25519 đã mã hóa bằng passphrase, lưu ở
   đường dẫn tuyệt đối ngoài repo. Công cụ quản trị yêu cầu: file
   khóa là file thường (không phải symlink), dung lượng ≤ 25 KB,
   đường dẫn tuyệt đối.
2. Tạo thư mục vận hành ngoài repo chứa: file khóa, `ledger.json`
   (sổ khách hàng), `registry.json` (sổ thu hồi, dùng cho xác minh
   online). Sao lưu thư mục này theo quy trình riêng của bên bán —
   mất ledger là mất khả năng gia hạn đúng hồ sơ khách.
3. Mỗi phiên làm việc cấp license: đặt biến môi trường trước:

   ```bat
   set LHM_ISSUER_PASSPHRASE=<mật khẩu khóa, tối thiểu 12 ký tự>
   ```

## 2. Quy trình cấp license cho khách mới

1. Khách cài ứng dụng, mở mục **License**, bấm sao chép **mã cài
   đặt** (Installation ID — UUID của bản cài trên máy khách) và gửi
   cho bên bán. Nhắc khách: mã này gắn với đúng bản cài đó; cài lại
   sang máy khác là mã khác.
2. Thêm khách vào sổ:

   ```bat
   node tools\license-admin.js add <LEDGER> "<Tên khách>" <INSTALLATION_ID>
   ```

   Lệnh trả về bản ghi khách kèm `customerId`.
3. Cấp license:

   ```bat
   node tools\license-admin.js issue <LEDGER> <CUSTOMER_ID> <starter|pro|business> <MONTHS> <MAX_PROFILES> <PRIVATE_PEM> [owner-sweep|strict]
   ```

   - `MONTHS`: số tháng hiệu lực (công cụ cấp trực tiếp giới hạn
     1–12 tháng; bản ghi gia hạn dùng lại gói và giới hạn cũ).
   - `MAX_PROFILES`: giới hạn số hồ sơ của khách.
   - Gói **đúng 30 ngày**: thay `<MONTHS>` bằng `--days 30`, ví dụ:
     `node tools\license-admin.js issue <LEDGER> <CUSTOMER_ID> pro --days 30 100 <PRIVATE_PEM> owner-sweep`.
     `--days` nhận số nguyên 1–365, mỗi ngày đúng 24 giờ. Không dùng cùng tháng.
     Các lệnh tháng lịch cũ và token đã cấp giữ nguyên ý nghĩa; 1 tháng không
     đồng nghĩa 30 ngày.
   - Gói và tính năng: **starter** = chỉ tính năng hồ sơ;
     **pro** và **business** = hồ sơ + API cục bộ + Automation.
   - Mặc định là `owner-sweep`: hết kỳ thuê vẫn dùng được khi máy chủ
     chủ sở hữu ngoại tuyến; lần quét khởi động/định kỳ sẽ ghi thu hồi,
     và máy khách khóa thao tác mới sau khi nhận biên nhận có chữ ký.
     Chọn `strict` nếu muốn máy khách tự khóa đúng ngày hết hạn.
4. Gửi `token` trong kết quả cho khách qua kênh liên lạc đã thỏa
   thuận, kèm ngày hết hạn (`expiresAt`) để khách đối chiếu. Khách
   dán token vào mục License — trạng thái đúng là "Đã kích hoạt
   thành công".
5. Ghi lại việc đã gửi token vào quy trình chăm sóc khách riêng của
   bên bán (không ghi token vào ledger — ledger chỉ có metadata).

Đường cấp trực tiếp không qua sổ (chỉ dùng khi thật cần, ví dụ cấp
thử nội bộ): `tools/issue-license.js --key <PEM> --installation
<UUID> --customer <Tên> --plan <gói> --months <1–12>
[--max-profiles <1–10000, mặc định 100>]`. License cấp đường này luôn
dùng chế độ `strict`; công cụ từ chối `owner-sweep` vì không có bản ghi
ledger để quét. License cấp đường này
không có trong ledger nên không tra cứu/gia hạn theo quy trình
chuẩn được.

## 3. Hết hạn và gia hạn

1. Kiểm tra định kỳ các license sắp hết hạn (mặc định 14 ngày tới):

   ```bat
   node tools\license-admin.js due <LEDGER> [SỐ_NGÀY]
   ```

   Tổng quan toàn bộ sổ: `node tools\license-admin.js report <LEDGER>`.
2. Gia hạn theo license cũ (giữ nguyên khách, gói và giới hạn hồ
   sơ của bản ghi cũ):

   ```bat
   node tools\license-admin.js renew <LEDGER> <OLD_LICENSE_ID> <MONTHS> <PRIVATE_PEM>
   ```

   Gia hạn đúng 30 ngày: `node tools\license-admin.js renew <LEDGER> <OLD_LICENSE_ID> --days 30 <PRIVATE_PEM>`.
   Nếu còn hạn thì cộng từ hạn cũ; nếu đã hết hạn thì cộng từ thời điểm cấp.
   Vẫn giữ giới hạn tổng thời hạn token không quá 370 ngày tính từ lúc cấp.

3. Gửi token mới cho khách; khách dán thay token cũ trong mục
   License.

Điều cần nói trước với khách (đúng hành vi phần mềm): gói `strict`
khóa thao tác vận hành khi hết hạn. Gói `owner-sweep` chỉ khóa thao
tác mới sau khi chủ sở hữu quét và máy khách nhận biên nhận thu hồi
có chữ ký; không tự đóng browser đang chạy. Ở cả hai chế độ, **dữ
liệu vẫn xem được, sao lưu được và khôi phục được**; license hết hạn
**không** tự quay lại dùng thử. Khách mới chưa mua có dùng thử 10
ngày, tối đa 10 hồ sơ, đủ ba nhóm tính năng.

## 4. Thu hồi (khi bắt buộc)

### Vận hành máy chủ owner-sweep

Máy chủ xác minh phải chạy trên máy của bên bán và không được đóng
gói cho khách. Cấu hình tối thiểu trước khi khởi động:

```bat
set LHM_LICENSE_LEDGER_PATH=C:\secure\lhm\ledger.json
set LHM_LICENSE_REGISTRY_PATH=C:\secure\lhm\registry.json
set LHM_ISSUER_KEY_PATH=C:\secure\lhm\issuer-private.pem
set LHM_ISSUER_PASSPHRASE=<mật khẩu khóa, tối thiểu 12 ký tự>
set LHM_OWNER_SWEEP_INTERVAL_MINUTES=1440
node tools\license-authority.js
```

`LHM_LICENSE_LEDGER_PATH` bật lần quét ngay khi máy chủ khởi động và
lặp theo chu kỳ (mặc định 1.440 phút). Máy khách ở ngoài mạng nội bộ
chỉ nhận được biên nhận khi endpoint này được xuất bản qua HTTPS an
toàn và cấu hình bằng `LHM_LICENSE_VERIFY_URL`; chỉ bật máy tính chủ
sở hữu mà không có đường mạng tới endpoint là chưa đủ. Khóa riêng,
ledger và registry phải được phân quyền hệ điều hành cho đúng tài
khoản vận hành và sao lưu tách biệt.

Nếu máy chủ ngoại tuyến, license `owner-sweep` đã hết kỳ thuê tiếp tục
được dùng đúng theo chính sách đã chốt. Khi máy chủ hoạt động lại,
lần quét ghi trạng thái thu hồi; lần xác minh kế tiếp của máy khách
nhận biên nhận có chữ ký và chặn các thao tác mới. Cơ chế này không
tự đóng browser đang chạy và không thể được mô tả là chống bẻ khóa
tuyệt đối: quản trị viên có đặc quyền trên máy khách vẫn có thể can
thiệp dữ liệu cục bộ, vì vậy mọi quyết định thương mại phải dựa thêm
vào log và đối soát phía bán.

License `owner-sweep` mới phải liên hệ thành công với endpoint ít nhất
một lần để nhận biên nhận đăng ký có chữ ký. Thiếu URL xác minh hoặc
chưa từng nhận biên nhận thì ứng dụng chặn thao tác mới với trạng thái
cấu hình/đăng ký chưa hoàn tất; không được hướng dẫn khách bỏ biến môi
trường để tiếp tục sử dụng.

```bat
node tools\license-admin.js revoke <LEDGER> <REGISTRY> <LICENSE_ID>
node tools\license-admin.js allow  <LEDGER> <REGISTRY> <LICENSE_ID>
```

Thu hồi ghi vào registry (dùng cho xác minh online) và ghi nhận vào
ledger — hai file cập nhật độc lập; nếu một phía lỗi, công cụ báo
lỗi và bên bán phải đối soát thủ công hai file trước khi coi việc
thu hồi là hoàn tất. License không có trong ledger thì lệnh bị từ
chối ngay.

## 5. Hỗ trợ khách: engine chưa cài / không qua kiểm chứng

Đối chiếu với hộp thoại **Engine** phía khách và các lỗi có thật
trong trình cài engine:

| Tình huống phía khách | Kiểm tra và xử lý phía bán |
|---|---|
| Chưa có Camoufox, hồ sơ Camoufox không mở/không cấp được danh tính | Hướng dẫn khách mở hộp thoại Engine → **Cài đặt Camoufox được xác minh**. Điều kiện: bản phát hành Camoufox phải được ký bằng **khóa publisher riêng** của LHM (không dùng khóa license — trình cài tự từ chối nếu hai khóa trùng) và descriptor có kích thước + SHA-256 đúng. Nếu phía bán chưa phát hành bản Camoufox đã ký riêng, tính năng Camoufox **chưa hoàn chỉnh để bán** — không hứa thay bằng bản tải tay. |
| Khách báo "release was not signed by the trusted publisher" hoặc lệch SHA-256 | Bản khách đang cài không phải bản phát hành chính thức hoặc tải lỗi. Cho khách tải lại đúng bản từ kênh phát hành; vẫn lệch thì dừng, đối chiếu descriptor đã ký phía bán. Không bao giờ hướng dẫn tắt kiểm chứng. |
| "Existing Camoufox directory is invalid; do not overwrite…" | Khách sao lưu thư mục Camoufox cũ ra nơi khác, xóa thư mục hỏng, cài lại. Đây là chủ đích chống mất dữ liệu. |
| Hồ sơ Camoufox có proxy xác thực bị `NETWORK_BLOCKED` ("requires approved Windows network lab") | Đúng thiết kế ở bản Preview: proxy có xác thực cho Camoufox chỉ mở trong điều kiện lab đã duyệt. Không có cách "mở khóa" phía khách — tư vấn khách dùng cấu hình được hỗ trợ ở bản hiện tại và ghi nhận nhu cầu. |
| Khách hỏi PREFLIGHT_ONLY có phải lỗi không | Không phải lỗi: hồ sơ mở được, nhưng kết quả ghi rõ an toàn rò rỉ mạng chưa được chứng nhận / DNS-WebRTC chưa kiểm tra. Trả lời đúng phạm vi này; xem trang giới hạn trong sổ tay khách. |
| License báo `different_installation` sau khi khách đổi máy/cài lại | Lấy mã cài đặt mới từ máy khách, cấp license mới gắn mã đó (cân nhắc thu hồi license cũ theo mục 4 nếu đã chuyển máy hẳn). |
| License báo lỗi đồng hồ (`clock_error`) | Khách đặt lại giờ Windows đúng + bật đồng bộ tự động, khởi động lại ứng dụng. Nếu vẫn lỗi, ghi nhận mã cài đặt và thời điểm, chuyển xử lý kỹ thuật — không cấp license mới để "né" lỗi này. |

## 6. Kỷ luật phát ngôn khi bán và hỗ trợ

Áp dụng Mục 11 của Hiến pháp sản phẩm cho mọi trao đổi với khách:

- Không hứa tài khoản "an toàn để chạy ads", không hứa tỉ lệ phần
  trăm hiệu quả, không dùng từ tuyệt đối ("100%", "không bao giờ").
- Khi khách hỏi "có sạch không", trả lời bằng bảng kiểm tiêu chí
  trong ứng dụng của chính khách (ĐẠT / KHÔNG ĐẠT / CHƯA ĐO kèm bằng
  chứng), không trả lời thay bằng lời bảo đảm.
- Kết quả tạo tài khoản chỉ được ghi: *"Lần thử này hoàn tất mà
  không xuất hiện yêu cầu xác minh số điện thoại."*
- Mọi khẳng định về đối thủ phải có bằng chứng tự kiểm chứng được;
  định vị bán hàng dựa trên những gì LHM đo được về chính LHM
  (local-first, cảnh báo có bằng chứng, trạng thái đo trung thực).
- Trạng thái phát hành hiện tại là **Preview** (chưa qua nghiệm thu
  máy Windows thật theo chuỗi cổng của dự án, chưa có cơ chế cập
  nhật có ký số) — điều khoản bán và thời hạn bảo hành phải phản ánh
  đúng trạng thái này.
