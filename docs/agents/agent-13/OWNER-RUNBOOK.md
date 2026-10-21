# OWNER RUNBOOK — Buổi lễ khóa publisher và phát hành engine Camoufox

Tài liệu quy trình cho **chủ dự án**. Không chứa khóa thật nào.
Nguyên tắc nền (Hiến pháp Mục 8): engine chỉ được phân phối khi có
manifest ký Ed25519 bằng **khóa publisher riêng**, độc lập với khóa
license của ứng dụng; không có khóa publisher thì toàn bộ đường
cài/chạy Camoufox trong ứng dụng tự tắt (fail-closed) — đây là trạng
thái hiện tại cho tới khi bạn hoàn thành buổi lễ khóa này.

## 1. Sinh khóa publisher production

- Thực hiện trên **máy ngoại tuyến** (offline) do bạn kiểm soát, không
  phải trên máy build CI và không trong bất kỳ thư mục repo nào.
- Sinh một cặp khóa **Ed25519** mới, chỉ dành cho việc ký engine
  (không dùng cho license, không dùng lại cho mục đích nào khác):
  ví dụ bằng Node trên máy ngoại tuyến —
  `crypto.generateKeyPairSync('ed25519')`, xuất private key dạng PEM
  PKCS#8 và public key dạng PEM SPKI. Đặt tên file rõ ràng, ví dụ
  `lhm-engine-publisher-private.pem` / `lhm-engine-publisher-public.pem`.
- Kiểm tra ngay sau khi sinh: hai file mở được, khóa là Ed25519, và
  public key **khác** khóa license (công cụ ký sẽ tự từ chối nếu
  trùng, nhưng hãy kiểm tra ở bước này để không phát hiện muộn).

## 2. Lưu trữ private key

- Private key **không bao giờ**: vào repo (kể cả repo riêng), vào gói
  cài, vào thư mục engine, vào CI secrets dùng cho build thường, gửi
  qua email/chat.
- Lưu bản chính trên phương tiện mã hoá ngoài máy làm việc (USB/phần
  cứng mã hoá), đặt passphrase bảo vệ nếu công cụ lưu trữ hỗ trợ.
- Sao lưu **hai bản** ở hai nơi vật lý khác nhau; ghi lại (ngoài máy)
  vị trí từng bản và ngày tạo. Mất hết bản sao = mất khả năng ký bản
  engine mới dưới danh tính publisher hiện tại (phải đổi khóa theo
  mục 6 và phát hành lại ứng dụng).
- Chỉ người phát hành (release operator) được chạm vào private key,
  và chỉ trong buổi ký (mục 4).

## 3. Phân phối public key vào bản phát hành ứng dụng

- Public key đi **cùng ứng dụng**, tại vị trí neo tin cậy:
  file `publisher-ed25519.pub` trong thư mục tài nguyên Camoufox của
  bản đóng gói — `resources/lhm-camoufox/` (bản cài) hoặc
  `resources/camoufox-engine/` (môi trường dev). Ứng dụng nạp file
  này lúc chạy (`loadCamoufoxPublisherKey`); file là symlink, quá
  lớn, không phải Ed25519, hoặc trùng khóa license → ứng dụng từ
  chối và tắt đường Camoufox.
- Đưa file public key vào gói phát hành qua quy trình build ứng dụng
  thông thường và **kiểm chứng sau khi đóng gói**: mở bản cài, xác
  nhận file tồn tại đúng vị trí và nội dung khớp với public key đã
  sinh ở mục 1 (so fingerprint/SPKI, không so bằng mắt).
- Public key không phải bí mật — nhưng tính toàn vẹn của nó là neo
  tin cậy: chỉ thay đổi nó qua một bản phát hành ứng dụng mới.

## 4. Ký một bản engine phát hành

Điều kiện đầu vào: cây Camoufox **Windows** chính thức (lấy từ nguồn
upstream chính thức, đối chiếu digest đã ghim như quy trình staging
hiện có), máy ký có private key publisher (từ két ở mục 2, chỉ cắm
vào trong buổi ký).

1. **Kiểm tra cây trước khi ký:** cây chứa `camoufox.exe`; mọi tên
   file phải hợp lệ với định dạng manifest (công cụ ký từ chối tên
   chứa ký tự ngoài `[A-Za-z0-9_.-]` theo từng đoạn đường dẫn —
   nếu upstream đổi tên file, xử lý ở bước chuẩn bị cây, không nới
   quy tắc); trong cây **không có** bất kỳ file khóa nào.
2. Đặt hai biến môi trường (đường dẫn tuyệt đối, nằm ngoài cây
   engine và ngoài repo):
   `LHM_ENGINE_SIGNING_KEY_FILE` = private key publisher;
   `LHM_ENGINE_PUBLISHER_KEY_FILE` = public key publisher.
3. Chạy: `node tools/sign-bundled-engine.js <DUONG_DAN_CAY_ENGINE> <PHIEN_BAN> camoufox`
   Công cụ tự từ chối nếu: thiếu file khóa publisher, khóa publisher
   trùng khóa license, private key không khớp public key, cây chứa
   private key, hoặc file khóa nằm trong cây.
4. **Kiểm chứng độc lập ngay sau ký:** chạy `BundledEngineManager`
   (engine `camoufox`, public key = khóa publisher) trên cây đã ký —
   phải đạt; và thử dưới khóa license — phải bị từ chối.
5. Đóng gói ZIP cây engine **không kèm `manifest.json`** (manifest
   đi trong descriptor ở bước 6); tính SHA-256 và kích thước archive.
6. Lập **release descriptor** (JSON): `schema: 1`,
   `url` = URL GitHub Releases chính thức dạng
   `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`,
   `archiveSha256`, `archiveBytes`, `manifest` = nội dung manifest
   đã ký ở bước 3. Đăng ZIP + descriptor lên GitHub Release.
7. Rút private key khỏi máy ký, trả về két lưu trữ (mục 2).

## 5. Kiểm chứng trước khi công bố bản phát hành

- Trên một máy Windows sạch: cài ứng dụng bản phát hành, thực hiện
  cài engine từ descriptor đã đăng — phải cài thành công và trạng
  thái engine hợp lệ; ghi hồ sơ nghiệm thu theo Mục 23 của Hiến pháp
  (commit, digest engine, hệ điều hành, cấu hình, thời gian, phạm vi
  đã đo).
- Thử một descriptor bị sửa (đổi 1 ký tự SHA) — ứng dụng phải từ chối.
- Chỉ công bố sau khi hai phép thử trên đạt. Một bản engine đã ký
  nhưng chưa qua cổng này vẫn là bản **chưa phát hành**.

## 6. Thu hồi / đổi khóa

Khóa publisher bị lộ hoặc nghi lộ = mọi manifest ký bằng khóa đó
không còn đáng tin. Quy trình:

1. Sinh cặp khóa publisher **mới** theo mục 1–2.
2. Phát hành **bản ứng dụng mới** mang `publisher-ed25519.pub` mới
   (mục 3). Đây là cơ chế thu hồi duy nhất: ứng dụng chỉ tin neo
   khóa đóng trong gói của nó, nên bản ứng dụng mới tự động từ chối
   mọi engine ký bằng khóa cũ. Người dùng còn ở bản ứng dụng cũ vẫn
   tin khóa cũ — cần thông báo nâng cấp là bắt buộc vì lý do an toàn
   engine.
3. Ký lại các bản engine đang phân phối bằng khóa mới (mục 4) và
   đăng descriptor mới; hạ các descriptor ký bằng khóa cũ khỏi kênh
   phát hành.
4. Huỷ private key cũ theo quy trình huỷ phương tiện lưu trữ của
   bạn; ghi lại sự kiện đổi khóa (ngày, lý do, fingerprint khóa cũ
   và mới) vào hồ sơ phát hành — không ghi nội dung khóa.
5. Đổi khóa định kỳ (không có sự cố): cùng quy trình; có thể rút
   gọn bước thông báo nếu bản ứng dụng mới được phát hành theo lịch
   thông thường, nhưng không bỏ bước 2–3.
