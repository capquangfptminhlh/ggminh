# KẾ HOẠCH TÍCH HỢP — các nhánh agent-2 … agent-10 về một trạng thái duy nhất

Nguyên tắc bao trùm (Hiến pháp Mục 9/12/13): tích hợp theo thứ tự cổng, không bỏ bước;
PR giữ Draft; không agent nào tự push/merge/tag — mọi lần đẩy lên GitHub do điều phối
thực hiện khi chủ dự án cho phép. Điều phối (Agent 1) sở hữu các file chung:
`package.json`, `package-lock.json`, `main.js`, `preload.js`, `src/ui/index.html`,
`.github/workflows/*`. Các agent khác chỉ đề xuất thay đổi ở các file này bằng ghi chú
trong bàn giao, không sửa trực tiếp.

## 1. Thứ tự tích hợp (theo đợt của chủ dự án)

### Đợt A — Khảo sát và chốt giao diện (đợt này)
- Agent 1: `MASTER-MAPPING.md`, `docs/architecture-contracts.md`, file này.
- Các agent còn lại: đọc Hiến pháp tại commit nền + hai tài liệu trên trước khi sửa code.
- Đầu ra bắt buộc của đợt A: bảng đối chiếu (xong), hợp đồng C1–C10 (xong), danh sách
  điều kiện ngoài (mục 4).

### Đợt B — Triển khai song song theo nhánh riêng
Mỗi agent một worktree từ commit nền `8349f38`, commit nhỏ có thể review, kèm test
liên quan + ghi rõ giới hạn và phép thử NOT_RUN. Thứ tự bàn giao khuyến nghị
(không chặn nhau, nhưng tích hợp theo thứ tự này để giảm xung đột):

| # | Agent | Phạm vi bàn giao chính | File dự kiến chạm |
|---|---|---|---|
| B1 | 2 — Nguồn engine | Rà soát/khép kín install→digest→manifest→runtime gate; test âm tính (digest sai, chữ ký sai, ngoài allowlist) | `src/engine/camoufoxInstallService.js`, `camoufoxPublisherTrust.js`, `camoufoxRuntimeGate.js`, `bundledEngineManager.js`, test tương ứng |
| B2 | 4 — Kiểm chứng cấu hình D1 | Test env-delivery (env thật sự tới `launchPersistentContext`/spawn); chạy generator end-to-end trong môi trường kiểm chứng; rà soát nhãn signalChain theo Mục 18 | `test/camoufox-identity.js` (+ test mới), `src/health/signalChain.js` (nhãn), `tools/generate-camoufox-identity.mjs` (nếu cần khai báo dependency — qua điều phối) |
| B3 | 5 — Đo runtime | Mở rộng probe `captureEnvironment`: WebGL (vendor/renderer/extensions/params/precision/hash), canvas (chuẩn hóa pixel), audio, fonts, voices, media devices, Client Hints; trường không truy cập được ghi rõ | `stage0-measure/core.js`, `stage0-measure/run.js`, `stage0-measure/run-config.js`, `stage0-measure/test.js` |
| B4 | 6 — Cách ly dữ liệu | Bổ sung kịch bản crash-recovery + chạy đồng thời vào phép đo cách ly; marker cho ETag/favicon/HSTS nếu tuyên bố | `stage0-measure/*` (phần isolation), `test/isolation.js`, `src/privacy/isolation.js` |
| B5 | 3 — Vòng đời hồ sơ | Chuẩn hóa ranh giới 3 đường Camoufox (hợp đồng C1); test mở/đóng/crash/mở lại; giữ engine hồ sơ cũ | `src/engine/EngineFactory.js`, `src/engine/adapters/*`, `src/engine/camoufoxAdapter.js`, test factory/integration |
| B6 | 7 — Network Safety | Đầu đo IP thoát từ runtime hồ sơ; thiết kế đo DNS/WebRTC/IPv6 theo Mục 19.3; bộ test fail-closed mạng | module đo mới dưới `src/engine/` hoặc `src/health/` (đề xuất qua Agent 1), test integration network |
| B7 | 8 — Cảnh báo vận hành | Nối D2 vào `behaviorMonitor.getReport()` (C4); vòng ghi quan sát IP + gọi D3 (C5); chuẩn hóa định dạng cảnh báo 6 trường (C7); đề xuất điểm nối Health Drift | `src/monitor/behaviorPatterns.js` (nếu cần), `src/health/autoIpWarnings.js` (nếu cần), **điểm nối trong `main.js`/API do điều phối áp** |
| B8 | 9 — UI và đóng gói | Bảng kiểm "sạch" 5 tiêu chí (dữ liệu từ B7); rà soát text theo Mục 11/15/17.3; trạng thái ĐẠT/KHÔNG ĐẠT/CHƯA ĐO hiển thị đúng; kiểm tra nội dung package EXE | `src/ui/*` (trừ index.html — qua điều phối), tài liệu rà soát text |
| B9 | 10 — Review/QA độc lập | Bộ test audit fail-closed tổng hợp; rà soát bảo mật (secrets, đường tải engine, vault); kiểm chứng độc lập mọi bàn giao B1–B8 | `test/*` mới (audit), báo cáo QA |

### Đợt C — Tích hợp vào luồng ứng dụng (điều phối thực thi)
Thứ tự áp các thay đổi vào file chung, mỗi bước kèm chạy test liên quan trước khi đi tiếp:
1. **Khâu sinh danh tính khi tạo hồ sơ** (từ B2): điểm nối ở luồng tạo hồ sơ (`main.js` IPC + API create) → store lưu `fingerprint.identity`; khai báo dependency cho khâu sinh do điều phối quyết (gói `camoufox` chính thức hoặc gọi tool như tiến trình con có kiểm chứng đầu ra). Điều kiện dừng riêng: nếu không giải quyết được dependency một cách sạch, khâu sinh ở lại dạng tool provisioning có hướng dẫn, và hồ sơ phải hiển thị "chưa có danh tính riêng" — không tích hợp nửa vời.
2. **Nối D2** vào `get-behavior-report` (từ B7).
3. **Vòng ghi quan sát IP + gọi D3** (từ B6+B7): nguồn runtime trước, nguồn quản lý gắn nhãn riêng.
4. **Bảng kiểm + cảnh báo 6 trường** lên UI (từ B8).
5. Áp **vá workflow** `tools/patches/camoufox-smoke-configured-steps.patch` — chỉ khi người đẩy có quyền ghi `.github/workflows` (token hiện tại không có; xem mục 4).
Sau đợt C: chạy toàn bộ `npm test` trên nhánh tích hợp; phân loại kết quả PASS/FAIL/NOT_RUN
theo tầng (mô phỏng / integration / engine thật) đúng Mục 23.

### Đợt D — Nghiệm thu EXE (cổng 3, trên máy Windows của chủ dự án)
1. Build EXE từ commit tích hợp đã chốt (`build:win`), ghi SHA-256 của installer.
2. Cài đặt trên máy Windows thật; chạy gói nghiệm thu bằng dữ liệu tổng hợp:
   tạo hồ sơ → có danh tính → mở → đo runtime → cách ly → cảnh báo → đóng/mở lại.
3. Lập evidence pack theo Mục 23 (commit, engine version/hash, OS, cấu hình đã bỏ bí mật,
   thời gian, phương pháp, phạm vi, kết quả kỳ vọng/thực tế/trạng thái, phần NOT_RUN).
4. Chỉ sau đó điều phối mới đề xuất chủ dự án quyết định tag/merge (cổng 4). Đổi mặc định
   engine theo định hướng Gecko là quyết định riêng tiếp theo, không nằm trong đợt này.

## 2. File chung và rủi ro xung đột

| File / khu vực | Ai được sửa | Rủi ro | Cách xử lý |
|---|---|---|---|
| `package.json` / `package-lock.json` | Chỉ điều phối | Nhiều agent cùng thêm test vào script `test` (một chuỗi dài) → xung đột chắc chắn | Agent ghi test mới + dòng script đề xuất trong bàn giao; điều phối nối chuỗi một lần ở đợt C |
| `main.js` | Chỉ điều phối | B5/B7 cùng cần điểm nối IPC | Áp theo thứ tự C2→C3 ở đợt C, mỗi bước một commit |
| `preload.js`, `src/ui/index.html` | Chỉ điều phối | B8 cần kênh IPC hiển thị mới | B8 mô tả kênh cần thêm; điều phối áp cùng lúc với mục C4 |
| `.github/workflows/*` | Chủ dự án / người có quyền workflows | Token Muse GitHub App không có quyền ghi workflows (đã xác nhận 403) | Vá có sẵn dạng patch; điều phối bàn giao patch + hướng dẫn áp |
| `src/engine/camoufoxIdentity.js` | Agent 4 đề xuất, Agent 3 tiêu thụ | Thay đổi hợp đồng C2 làm vỡ cả controller + adapter + run-config | Đóng băng chữ ký hai hàm hợp đồng; đổi phải qua Agent 1 và chạy đồng thời 3 test: identity, adapter, stage0 contract |
| `stage0-measure/core.js` | Agent 5 (probe) + Agent 6 (isolation) | Cùng sửa một file ở hai phạm vi | Agent 6 chỉ thêm kịch bản trong `run.js`/test riêng; thay đổi `core.js` do Agent 5 giữ, Agent 6 gửi yêu cầu qua Agent 1 |
| `src/health/signalChain.js` | Agent 4 (nhãn) → Agent 8 (hiển thị) | Sửa nhãn sau khi Agent 8 đã nối hiển thị → lệch định dạng C7 | Thứ tự bắt buộc: B2 (nhãn) tích hợp trước B7 (nối) |
| `src/db/store.js` | Điều phối (đợt C) | Khâu sinh danh tính + giữ tương thích hồ sơ cũ | Chỉ áp ở bước C1 kèm test store-persistence + quick-create |
| `TIEU-CHI-SAN-PHAM.md` | Không agent nào | Sửa luật để hợp thức hóa code (Mục 13.3 cấm) | Mọi đề xuất sửa tiêu chí gửi chủ dự án, ngoài phạm vi đợt này |

## 3. Quy tắc bàn giao của từng agent (bắt buộc)

- Nhánh riêng từ commit nền; commit nhỏ, thông điệp rõ phạm vi.
- Bàn giao gồm: danh sách commit; test đã chạy (lệnh + kết quả PASS/FAIL); phép thử
  NOT_RUN kèm lý do; phần chạm file chung dạng *đề xuất* (không tự sửa); giới hạn còn lại.
- Kết luận tách ba mức (Mục 14): quan sát đo được / suy luận từ code / chưa đo.
- Không kết luận về khả năng nền tảng liên kết hồ sơ từ bất kỳ kết quả nào phía trình duyệt.

## 4. Điều kiện ngoài còn thiếu (phát hiện ở đợt A)

1. **Quyền ghi `.github/workflows`** — cần để áp vá smoke configured và chạy phép đo
   run-config trên CI Windows (cổng 2 đầy đủ). Hiện token tích hợp không có quyền này.
2. **Máy Windows thật của chủ dự án** — điều kiện của cổng 3 (nghiệm thu EXE) và của
   phép đo Camoufox qua controller trên Windows (chưa từng chạy end-to-end).
3. **Bản phát hành Camoufox do publisher ký + khóa riêng publisher** — do chủ dự án giữ
   ngoài repo; thiếu nó, nghiệm thu cài đặt engine end-to-end ở trạng thái NOT_RUN.
4. **Chứng chỉ Authenticode** — EXE hiện chưa ký (trạng thái ứng viên thương mại chưa ký);
   mua chứng chỉ là việc của chủ dự án, ngoài phạm vi agent.
5. **Môi trường mạng kiểm chứng (proxy lab)** — cần để đo DNS/WebRTC/IPv6/đổi tuyến giữa
   phiên theo Mục 19 trên đường mạng thật; hiện mọi phép đo mạng thật đều NOT_RUN.
6. **Đối chiếu trạng thái local của chủ dự án** (commit 89b3c2c + 2 thay đổi chưa commit
   ở checkout khác) — cần chủ dự án cung cấp/đẩy lên để hợp nhất về một nguồn sự thật (Mục 13).
