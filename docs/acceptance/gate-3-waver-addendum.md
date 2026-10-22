# Phụ lục Gate 3 — Artifact Wave R (bổ sung cho gate-3-wave2.md)

Phụ lục này điều chỉnh gói nghiệm thu `gate-3-wave2.md` khi artifact được kiểm là bản build từ cây Wave R. Mọi bước không nhắc tới ở đây giữ nguyên như gói gốc.

## 1. Gắn kết (thay cho phần gắn kết của gói gốc)

- Cây nguồn: local `f091a1b` (nhánh `integration/v5.8-phase-c` sau tích hợp Wave R) / snapshot GitHub `ae1385c` trên nhánh `integration/v5.8-wave-r`.
- Artifact: bản build Windows CI của PR #19 (Draft, chỉ để kích CI). Tại bước G3-01, ghi lại **run ID, tên artifact, kích thước và SHA-256 thực tế** của bản đã tải; dừng nghiệm thu nếu hash thay đổi giữa chừng. Gắn kết `f549a63` / EXE `54aec523…` trong gói gốc KHÔNG áp dụng cho artifact này.
- Chuỗi test local trên cây này: 217 bước — 215 PASS / 2 FAIL (hai fixture nền Windows: browser-diagnostics, runtime-registry). CI của PR #19 chạy lại toàn chuỗi trên Windows.

## 2. Khác biệt theo bước

- **G3-02 (cài đặt / biểu tượng):** nhánh wave-r trên GitHub thiếu 13 file icon nhị phân (giới hạn kênh đẩy snapshot) nên EXE từ CI dùng **icon Electron mặc định — đây là trạng thái ĐÃ BIẾT của artifact này, không phải FAIL**. Sau khi chủ dự án đẩy bổ sung các file icon bằng git và build lại, kỳ vọng đổi thành icon LHM.
- **G3-09 (xoá vĩnh viễn):** cây Wave R đã gồm bản triển khai R17 — kỳ vọng cập nhật: snapshot phiên bị xoá tại thời điểm xoá vĩnh viễn (giữ lại khi còn trong thùng rác), tham chiếu workflow của hồ sơ được quét sạch, bốn gốc dữ liệu hồ sơ bị xoá như gói gốc. Hai kho vẫn sống lâu hơn hồ sơ theo thiết kế lưu giữ: quan sát IP thoát (tối đa 7 ngày) và lịch sử cảnh báo (tối đa 90 ngày) — quyết định R17-F5/F6 còn chờ chủ dự án; ghi nhận vào hồ sơ, **không tính FAIL** khi quyết định chưa chốt.
- **G3-12 (mở hai tiến trình):** áp dụng như đã bổ sung trong gói gốc (khóa đơn tiến trình bản dựng lại của R12).
- **Hồ sơ đo theo hồ sơ (R15, tuỳ chọn bổ sung bằng chứng):** sau G3-05/G3-06 có thể chạy `node tools/measure-profile.js` trên bản cài đặt phát triển để xuất hồ sơ đo gắn commit/engine. Bản đóng gói chưa có bước sinh `build-info.json` (việc của bước đóng băng phát hành) nên trường commit có thể đọc là `unknown` — ghi nhận giới hạn này, không vì thế mà FAIL các bước bắt buộc.

## 3. Mục test IP (phần phía trình duyệt)

Hệ thống kiểm tra IP riêng của chủ dự án nằm ngoài phạm vi; mục này chỉ gồm các phép đo phía trình duyệt đã có sẵn công cụ:

1. **Trong gói Gate 3 — G3-06:** IP thoát trong phiên qua proxy HTTP và SOCKS5, từ chối khi proxy hỏng, và ghi nhận PREFLIGHT_ONLY với hồ sơ Camoufox trực tiếp (thiếu bằng chứng thì báo thiếu bằng chứng, không suy diễn).
2. **windows-pack script 01 (STUN):** quan sát địa chỉ phản chiếu srflx trên mạng thật. Diễn giải theo Mục 19.3 của Hiến pháp theo loại candidate; **0 request quan sát được = CHƯA ĐO, không phải đạt**.
3. **windows-pack script 03 (DNS qua proxy):** kiểm đường DNS khi đi qua proxy bằng tên miền kiểm soát được.
4. **windows-pack script 04 (IP runtime so với tiến trình quản lý):** cần một endpoint echo HTTPS. Cách triển khai nhanh: theo `tools/echo-service/DEPLOY.md` (VPS + Caddy tự cấp chứng chỉ), sau đó đặt `settings.runtimeEchoUrl` trỏ tới endpoint đó. Chưa có endpoint HTTPS thật thì bước này ghi **NOT_RUN** — không thay bằng endpoint HTTP thường.
5. **Script 02 (WebGL)** không thuộc IP nhưng nằm cùng bộ windows-pack; chạy kèm để bổ sung các hàng §4.3 còn CHƯA ĐO trên Windows/GPU thật.

## 4. Quy tắc kết luận

Giữ nguyên gói gốc: Gate 3 chỉ ĐẠT khi mọi bước bắt buộc PASS trên đúng artifact đã gắn kết ở Mục 1; FAIL ở bước bắt buộc thì sửa, build artifact mới, nghiệm thu lại từ đầu trên artifact mới.
