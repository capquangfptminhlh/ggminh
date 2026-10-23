# LHM Ads Browser v5.8.0 — tình trạng phát hành thương mại (22/10/2026)

> Hồ sơ lịch sử của các commit ghi bên dưới, không phải kết quả của bản tích hợp mới.
> Xem `docs/audits/integration-convergence-20261023.md` cho phạm vi tích hợp tiếp theo.

**QUYẾT ĐỊNH:** NOT_READY. Chủ dự án đã đề nghị phát hành chính thức, nhưng chỉ sau khi đủ **Gate 1 → Gate 2 → Gate 3 → Gate 4** theo `TIEU-CHI-SAN-PHAM.md` §12. Không gắn tag, không merge `main`, không tạo GitHub Release từ cây chưa nghiệm thu.

## Bằng chứng mới nhất đã đối chiếu trực tiếp GitHub

| Hạng mục | Bằng chứng | Trạng thái |
|---|---|---|
| Code v5.8 có giao diện fingerprint | PR #23, commit `cd7d6b95ecc74a255de8098751b163b67c842388` | Code ở nhánh Draft |
| Gate 1 / Windows unit/integration | [Run 39755135028](https://github.com/capquangfptminhlh/ggminh/actions/runs/39755135028), **224/224 PASS** trước thay đổi release guard | PASS trên commit trên; chạy lại khi có commit mới |
| Installer Windows Preview | Artifact `LHM-Ads-Browser-Windows-x64` của run trên; EXE SHA-256 `9cea6d96056768f9c35448f76ddc4febfbb6b2c2abfceee02797cb5611beb26f` | Đóng gói PASS, **không ký Authenticode** |
| Gate 2 Camoufox cấu hình | [Run 39740173747](https://github.com/capquangfptminhlh/ggminh/actions/runs/39740173747): **FAIL**. Hai bước đo timeout/không tạo `stage0-*-report.json`, bộ kiểm chứng kết luận NOT_RUN | KHÔNG ĐẠT |
| Engine phân phối | Cây Windows chính thức cần quyết định 218 tên font (QD-05), ký publisher Ed25519 production riêng với khóa license, xác minh quyền phân phối | CHƯA ĐẠT |
| Gate 3 Windows máy độc lập | Chưa có biên bản cài đúng EXE, ảnh chụp, log, thử proxy/mạng, license, gỡ cài và đo theo Hiến pháp §23 | CHƯA ĐO |
| Chủ dự án QD-01..05, D1..D4, F3/F4, Echo | Gói quyết định tại `docs/decisions/OWNER-DECISIONS-CONSOLIDATED.md` và hồ sơ QD-05 | CHƯA CHỐT ĐỦ |
| Gate 4 | `main` vẫn là `6b417bfc46d01a897280981936187e1af2367d1f`, PR #20/#21/#23 Draft, chưa tag/release | CHƯA THỰC HIỆN |

**Lưu ý:** run CI của Camoufox trả FAILED dù các bước riêng đã chạy; đọc log xác nhận cả hai report không tồn tại. Không biến tên step SUCCESS thành nghiệm thu PASS.

## Bộ cổng phát hành tự kiểm

Đã thêm hai lệnh an toàn:

```powershell
npm run release:status
npm run release:gate
```

- `release:status`: in JSON có `NOT_READY`, các blocker, luôn exit 0 để xem; không phát hành.
- `release:gate`: **exit code 2 nếu chưa đủ**; không phát hành.
- Muốn cấp bằng chứng ngoài repo sau nghiệm thu: `node tools/commercial-release-gate.js --strict --evidence "D:\Evidence\commercial-evidence.json"`.
- Mẫu: `release/commercial-evidence-template.json`. **Không điền sẵn PASS**. Không commit chứng từ khách hàng, ảnh có thông tin riêng tư, mã OTP, thông tin thẻ, proxy credentials hoặc private key. Chỉ lưu bằng chứng nhạy cảm trong kho riêng được kiểm soát quyền.
- Công cụ kiểm tra cú pháp, commit, phiên bản, SHA-256 đúng byte của EXE, báo cáo Camoufox A/B đúng engine/commit, checklist Gate 3 và chữ ký xác nhận của người phụ trách; đây là lớp **kiểm tra cấu trúc** và không thể tự chứng thực môi trường Windows thật hay quyền phân phối ngoài phần mềm. Kết quả cao nhất là `READY_FOR_OWNER_FINAL_REVIEW`; công cụ **không tự merge/tag/release**.

## Những việc phải có từ phía chủ dự án

1. Chốt bằng văn bản QD-01..QD-05, D1–D4, F3/F4, endpoint Echo, publisher; riêng vấn đề 218 tên font phải quyết trước bước ký engine.
2. Thực hiện lễ khóa Ed25519 production ngoại tuyến và chuẩn bị cây Camoufox chính thức có quyền phân phối; không gửi private key vào chat hoặc GitHub.
3. Nghiệm thu bản EXE **đúng SHA-256** trên Windows độc lập theo `docs/acceptance/gate-3-wave2.md` và `docs/acceptance/gate-3-waver-addendum.md`, chụp/log đủ G3-01…G3-12, không vô hiệu hóa SmartScreen/Defender.
4. Sau khi Gate 2 và Gate 3 PASS trên cùng cây đóng băng, chủ dự án xác nhận bản phát hành cuối theo đúng commit và artifact, lúc đó mới thực thi GitHub tag/merge/release.

**Không quảng cáo Camoufox thương mại đã đóng gói, bảo đảm Google/Meta không quét, hoặc phần trăm độ an toàn** khi chưa có phép đo và nguồn xác thực.

Mọi thay đổi code sau lần test Windows PASS đều cần chạy lại Gate 1/2 và Gate 3 trên artifact đã rebuild. Khóa ký production không được tạo tự động trong dự án.

## Đợt nghiệm thu sau sửa bằng chứng Gate 3

- Gate 2 đã PASS ở [run 39759151441](https://github.com/capquangfptminhlh/ggminh/actions/runs/39759151441) tại `caf00ad`, báo cáo Camoufox có cấu hình 7/7 từng hồ sơ trước và sau restart, 20/20 mục cách ly lưu trữ và cleanup PASS.
- Đã nâng kiểm tra Gate 3: **mọi** PASS cần file bằng chứng có thật thuộc thư mục nghiệm thu, SHA-256 đúng byte; không chấp nhận file ngoài thư mục, mất file, hash không đúng hoặc khai báo khống kiểu chữ.
- Khi commit phát hành thay đổi, hai workflow phải chạy lại trên SHA mới, không kế thừa Gate 2 từ commit cũ. Chính workflow Stage-0 theo dõi `tools/commercial-release-gate.js` để kích hoạt kiểm chứng lại.
- Gói nghiệm thu cục bộ là bản Preview, không phân phối camoufox.exe commercial hoặc khóa production.
