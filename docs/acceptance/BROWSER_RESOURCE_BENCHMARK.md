# Nghiệm thu tài nguyên trình duyệt thật trên Windows

Tài liệu này chỉ áp dụng cho phép đo tài nguyên của Chromium, Firefox và
Camoufox trên workload loopback cố định. Nó không đo tài khoản quảng cáo,
không truy cập website bên ngoài và không chứng minh khả năng tránh liên kết
tài khoản.

## Điều kiện trước khi chạy

- Dùng máy Windows thật thuộc đúng một lớp RAM 8 GB, 16 GB hoặc 32 GB.
- Checkout đúng commit cần phát hành và bảo đảm `git status --porcelain` rỗng.
- Dùng app artifact thật của build đó (`app.asar` hoặc EXE đã đóng gói).
- Chromium/Firefox: dùng đường dẫn tuyệt đối tới binary cần đo.
- Camoufox: dùng thư mục release có `publisher-ed25519.pub` và manifest đã ký;
  runner tự xác minh rồi mới resolve `camoufox.exe`. Không nhận EXE Camoufox
  truyền thẳng.
- Camoufox cần file JSON là mảng identity đã tạo bằng generator chính thức,
  có ít nhất bằng số profile đồng thời và không trùng nhau. Identity chỉ được
  đưa vào environment của process; không xuất vào report.

## Lệnh chạy một tổ hợp

Chromium:

```powershell
node tools/browser-resource-benchmark.js `
  --engine chromium `
  --binary "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --app-artifact "C:\path\to\app.asar" `
  --workload medium --concurrency 3 --samples 10 `
  --output "C:\lhm-evidence\chromium-medium-c3.json"
```

Firefox thay `--engine firefox` và `--binary`. Camoufox dùng:

```powershell
node tools/browser-resource-benchmark.js `
  --engine camoufox `
  --signed-release-dir "C:\lhm-camoufox-signed" `
  --identity-file "C:\lhm-private-input\benchmark-identities.json" `
  --app-artifact "C:\path\to\app.asar" `
  --workload medium --concurrency 3 --samples 10 `
  --output "C:\lhm-evidence\camoufox-medium-c3.json"
```

Chạy từng engine với `light`, `medium`, `heavy` và concurrency `1`, `3`, `5`,
`10`. Mỗi lệnh có một warmup bị loại khỏi report và tối thiểu 10 sample thật.
Runner dừng, đóng toàn bộ process do nó tạo và xóa profile tạm sau mỗi sample.
Nếu RAM khả dụng xuống dưới 20%, runner dừng và không tạo evidence hợp lệ.

## Hợp đồng artifact

Mỗi JSON phải có:

- schema, commit, phiên bản và SHA-256 của app/engine;
- Windows build, tổng RAM, engine, workload và concurrency;
- sample allowlist, P50/P95 startup, P50/P95 working set, CPU đỉnh;
- crash count và kết quả cleanup.

Artifact cấm tên hồ sơ, URL, cookie, proxy, token, mật khẩu, account và identity
blob. File output dùng chế độ không ghi đè; nếu tên đã tồn tại, lệnh phải fail.

## Bảng evidence phát hành

Chỉ điền `MEASURED` sau khi artifact của đúng hàng đã qua review và hash được
ghi vào hồ sơ phát hành. Không nội suy từ máy khác hoặc engine khác.

| RAM | Chromium | Firefox | Camoufox đã ký |
|---|---|---|---|
| 8 GB | UNMEASURED | UNMEASURED | UNMEASURED |
| 16 GB | UNMEASURED | UNMEASURED | UNMEASURED |
| 32 GB | UNMEASURED | UNMEASURED | UNMEASURED |

Resource Guard chỉ được nhập P95 từ artifact hợp lệ của đúng engine/workload.
Thiếu evidence thì trạng thái tiếp tục là `RESOURCE_UNMEASURED`; không đặt số
khuyến nghị hoặc số profile tối đa theo phỏng đoán.
