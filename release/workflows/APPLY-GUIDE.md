# Gate 2 — Áp workflow Camoufox và Windows thật (2026-10-22)

## Trạng thái quyền và nguồn
- Nguồn tích hợp hiện tại: `main`, Wave R đã merge qua PR #19; `integration/v5.8-wave-r` còn commit riêng.
- `release/workflows/windows-exe.yml` và `release/workflows/camoufox-upstream-smoke.yml` là hai file **staged**, chưa chạy chỉ vì đang nằm trong `release/`.
- Trên GitHub, `.github/workflows/camoufox-upstream-smoke.yml` hiện CHƯA CÓ. Github App không có quyền workflow; KHÔNG cố vượt cơ chế quyền.
- Run Build Windows EXE SUCCESS không tự chứng minh configured Camoufox D1, DNS, WebRTC hay proxy.

## Đã xử lý lỗi cũ trong bản staged
- D1 smoke run #39614246764 FAIL vì `$RUNNER_TEMP/lhm-camoufox-runtime/node_modules/camoufox` chưa hề được cài.
- Bản staged mới thực hiện `npm install --prefix "$runtime" --no-save --no-package-lock --ignore-scripts --no-audit --no-fund camoufox@0.5.8 playwright-core@1.62.0` trước khi sinh identity.
- Cú pháp pinned runtime được guard bằng `test/staged-workflow-contract.js` trong `npm test`; đây chỉ là **kiểm tra tĩnh**, không được gọi là Gate2 PASS.
- Kích hoạt cho `main` và `integration/v5.8-wave-r` để không phụ thuộc vào các nhánh trước merge.

## Quy trình chuẩn của chủ repo (cần quyền sửa workflow)
1. `git fetch origin` và checkout một **nhánh mới từ main** để không sửa trực tiếp main.
2. Sao chép `release/workflows/windows-exe.yml` vào `.github/workflows/windows-exe.yml` và `release/workflows/camoufox-upstream-smoke.yml` vào `.github/workflows/camoufox-upstream-smoke.yml`.
3. Kiểm tra diff và đường dẫn. Không đưa Camoufox upstream binary hay private key vào Git hoặc artifact.
4. Commit rồi push nhánh đó; mở Draft PR để CI. Không merge khi chưa có Gate 3 và quyết định phát hành.
5. Đọc job steps: verify engine staging, pinned runtime install, generate identity A/B, configured stage0 measurement, uploaded `LHM-Stage0-Camoufox-Configured-Report`.
6. Chỉ đánh dấu configured Gate 2 **ĐẠT** khi workflow chạy trên đúng commit, report thực tế phù hợp Hiến pháp Mục 23. `npm test`/build đơn thuần không đủ.

## Các phép đo vẫn chưa chứng minh được
- Real residential proxy/DNS/WebRTC STUN/IPv4+IPv6/quic routes và DNS resolver đo trực tiếp cần lab riêng có quyền.
- Engine thương mại cần nguồn chính thức, digest, giấy phép phân phối và manifest ký Ed25519 publisher production tách khỏi license.
- Windows installed-app Gate 3 cần ảnh/log/bản đo cho đúng EXE và máy, không thay bằng runner.

**Không tự tạo khóa production, không kích hoạt mạng ngoài nếu chưa được LHM phê duyệt, không bỏ qua Gate 4.**
