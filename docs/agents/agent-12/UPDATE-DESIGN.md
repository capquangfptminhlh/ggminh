# Thiết kế — Cơ chế kiểm tra cập nhật ứng dụng có ký (Agent 12)

Trạng thái: **thiết kế + nguyên mẫu kiểm tra** (check-only). Nguyên mẫu
KHÔNG tải artifact, KHÔNG áp dụng bản cập nhật, KHÔNG có hành vi tự
động nào phía người dùng — đúng kỷ luật "không tải ngầm" của sản phẩm
(Hiến pháp Mục 8: cài đặt engine chỉ khi người dùng chủ động; nguyên
tắc đó áp dụng tương tự cho cập nhật ứng dụng).

## 1. Mục tiêu và phạm vi

- Ứng dụng có thể trả lời một câu hỏi duy nhất một cách đáng tin:
  "có bản ứng dụng mới hơn bản đang chạy, do đúng nhà phát hành ký,
  hay không?"
- Mọi lỗi (mạng, manifest hỏng, chữ ký sai, manifest hết hạn, hạ cấp)
  đều fail-closed theo nghĩa: **coi như không có cập nhật**, ghi lại
  lý do ở tầng log/chi tiết, và **không bao giờ chặn ứng dụng chạy**.
- Việc tải và cài bản mới (nếu chủ dự án duyệt ở bước sau) là một
  luồng riêng do người dùng bấm, dùng lại mẫu `downloadPinned` của
  engine (ghim kích thước + SHA-256 trước khi tải), rồi người dùng
  chạy bộ cài NSIS như cài mới. Luồng đó KHÔNG nằm trong nguyên mẫu
  này.

## 2. Manifest cập nhật

Một tài liệu JSON duy nhất (gọi là update descriptor), tách khỏi
manifest engine. Mẫu hình (shape) khóa cố định — thừa hoặc thiếu một
khóa là hỏng, theo đúng kỷ luật `canonicalManifest` của engine:

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `schema` | số | đúng `1` |
| `product` | chuỗi | đúng `lhm-ads-browser` |
| `version` | chuỗi | semver của bản MỚI (`x.y.z`, cho phép hậu tố prerelease) |
| `channel` | chuỗi | `stable` hoặc `preview` |
| `publishedAt` | chuỗi | ISO-8601 UTC, mang nguyên văn vào payload ký |
| `expiresAt` | chuỗi | ISO-8601 UTC, sau `publishedAt`; khuyến nghị hạn ≤ 45 ngày |
| `artifact.fileName` | chuỗi | tên file đơn (không thư mục), kết thúc `.exe` |
| `artifact.url` | chuỗi | HTTPS, không credential/port/search/hash, host thuộc allowlist |
| `artifact.bytes` | số | nguyên an toàn, 1 .. 2 GiB |
| `artifact.sha256` | chuỗi | 64 hex thường |
| `signature` | chuỗi | Ed25519, base64url, đúng 64 byte, trên payload canonical |

Ví dụ (chữ ký rút gọn):

```json
{
  "schema": 1,
  "product": "lhm-ads-browser",
  "version": "5.9.0",
  "channel": "stable",
  "publishedAt": "2026-11-01T00:00:00.000Z",
  "expiresAt": "2026-12-15T00:00:00.000Z",
  "artifact": {
    "fileName": "LHM-Ads-Browser-5.9.0-Setup-x64.exe",
    "url": "https://github.com/<owner>/<repo>/releases/download/v5.9.0/LHM-Ads-Browser-5.9.0-Setup-x64.exe",
    "bytes": 198000000,
    "sha256": "<64 hex>"
  },
  "signature": "<86 ký tự base64url>"
}
```

## 3. Payload canonical và tách miền

- Payload ký = tiền tố miền + JSON canonical dựng lại từ các trường
  đã kiểm chứng (thứ tự khóa cố định, không ký trên chuỗi JSON thô
  nhận từ mạng — cùng cách `signedPayload` của engine).
- Miền riêng: `LHM_APP_UPDATE_V1\n` — khác miền engine
  (`LHM_BROWSER_ENGINE_BUNDLE_V1\n`) và khác miền token license.
  Nhờ tách miền, một chữ ký tạo cho engine/token **không bao giờ**
  kiểm chứng được cho manifest cập nhật và ngược lại, kể cả khi cùng
  một khóa ký cả hai loại tài liệu.
- `expiresAt` + quy tắc "chỉ nhận bản mới hơn bản đang chạy" cùng
  nhau chặn tấn công phát lại (replay) một manifest cũ-từng-hợp-lệ:
  manifest cũ hoặc hết hạn, hoặc thấp hơn bản đã cài — cả hai đường
  đều bị từ chối.

## 4. Ai ký, khóa ở đâu

- Ký bởi **release operator của chủ dự án, ngoại tuyến**, bằng công
  cụ ký offline tương tự `tools/sign-bundled-engine.js` (công cụ đó
  thuộc bước triển khai sau; nguyên mẫu này chỉ gồm phía kiểm chứng
  + hàm dựng payload dùng chung để công cụ ký tương lai tái sử dụng).
- Khóa ký là khóa **publisher** — cùng gốc tin cậy với khóa publisher
  của engine. Việc dùng CHUNG một khóa publisher cho cả engine và
  cập nhật ứng dụng, hay tách thêm một khóa riêng cho cập nhật, là
  **quyết định còn chờ chủ dự án** (liên hệ QD-02 về khóa publisher:
  hồ sơ đó khuyến nghị một khóa publisher riêng tách khỏi khóa
  license dùng cho cả hai engine). Nguyên mẫu nhận public key qua
  tham số cấu hình nên tương thích cả hai lựa chọn; điều không được
  phép trong mọi lựa chọn là dùng khóa license để ký cập nhật
  (module kiểm chứng từ chối nếu public key truyền vào trùng khóa
  license khi nơi gọi cung cấp cả hai — xem INTEGRATION-NOTES).
- Private key: không bao giờ nằm trong repo, trong bộ cài, hay
  trong bản phát hành — cùng kỷ luật khóa engine hiện tại. Public
  key được phân phối sẵn trong bản đóng gói (cùng cơ chế file neo
  tin cậy như `publisher-ed25519.pub` của engine).
- Thu hồi khóa khi lộ: phát hành một bản ứng dụng mang public key
  mới qua kênh ngoài băng (out-of-band), ký lại manifest — cùng cơ
  chế thu hồi đã ghi trong runbook phân phối engine của Agent 13.

## 5. Kênh phân phối manifest

Manifest là một file nhỏ (vài trăm byte) — kênh khả thi, theo thứ
tự ưu tiên để chủ dự án chọn (xem INTEGRATION-NOTES, quyết định D2):

1. **GitHub Releases** — cùng nơi phát hành engine hiện tại; chính
   sách URL của engine đã allowlist `github.com` + đường dẫn
   release, nguyên mẫu mặc định cũng vậy.
2. Trang tĩnh/CDN của chủ dự án — cần bổ sung host vào allowlist khi
   tích hợp (tham số `allowedHosts`).
3. Đóng kèm liên kết trong ứng dụng chỉ là *địa chỉ lấy manifest*;
   bản thân manifest không bao giờ được tin nếu chưa qua kiểm chứng
   chữ ký — kênh phân phối không cần đáng tin, chữ ký mới là gốc
   tin cậy.

Giới hạn đọc manifest khi kiểm tra từ xa: tối đa 256 KiB, timeout
ngắn, chỉ chuyển hướng HTTPS trong allowlist (tối đa 3 lần) — theo
mẫu `downloadPinned`. Hàm kiểm tra từ xa **chỉ tải manifest**,
không bao giờ tải artifact.

## 6. Hành vi theo từng kết quả (fail-closed)

| Kết quả | Nghĩa | Hành vi ứng dụng (đề xuất tích hợp) |
|---|---|---|
| `up-to-date` | Đã ký đúng, phiên bản ≤ bản đang chạy (hoặc khác kênh) | Hiển thị "đang ở bản mới nhất trong phạm vi đã kiểm chứng"; không hành động |
| `update-available` | Đã ký đúng, phiên bản mới hơn, manifest còn hạn | Hiển thị phiên bản + kích thước + hash rút gọn; nút tải/cài chỉ xuất hiện khi chủ dự án duyệt luồng áp dụng |
| `invalid` | Hỏng cú pháp/shape, sai chữ ký, khóa lạ, hạ cấp, hết hạn, URL ngoài allowlist, thiếu khóa tin cậy | Coi như không có cập nhật; ghi log kèm `reason`; KHÔNG hiển thị cảnh báo gây hoang mang, KHÔNG chặn ứng dụng |
| `unreachable` | Lỗi mạng/timeout/HTTP ≠ 200 khi lấy manifest | Coi như không có cập nhật; ghi log; thử lại ở lần kiểm tra sau do người dùng bấm |

Lý do chi tiết (`details.reason`) phục vụ log và hỗ trợ kỹ thuật;
giao diện người dùng chỉ nên hiển thị trạng thái trung tính — một
manifest bị tấn công không được biến thành thông báo lỗi dọa người
dùng, và một lần rớt mạng không được biến thành "lỗi cập nhật".

## 7. Giới hạn trung thực

- Manifest ký + hash artifact bảo đảm *tính xác thực của thông tin
  cập nhật*; bản thân bộ cài Windows hiện **chưa có chữ ký
  Authenticode** (tài sản/quyết định của chủ dự án — xem báo cáo
  Agent 1), nên SmartScreen vẫn có thể cảnh báo. Không văn bản nào
  được nói bộ cài "đã ký số" chừng nào điều đó chưa đúng.
- Kiểm tra cập nhật là một lần đọc mạng khi người dùng (hoặc lịch
  được duyệt) kích hoạt — nó tiết lộ cho máy chủ manifest biết có
  một lượt kiểm tra từ địa chỉ IP của máy tại thời điểm đó. Đây là
  lý do mặc định đề xuất là **kiểm tra thủ công** (xem
  INTEGRATION-NOTES, quyết định D1).
- Nguyên mẫu dừng ở kiểm tra + báo cáo. Không có tự tải, tự cài,
  tự khởi động lại — bất kỳ bước nào như vậy đều cần quyết định
  riêng của chủ dự án và một vòng thiết kế riêng.
