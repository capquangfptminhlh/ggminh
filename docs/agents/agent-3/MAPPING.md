# MAPPING — Vòng đời hồ sơ (Agent 3) theo Hiến pháp v1.3

Cơ sở: commit `8349f38` (Hiến pháp v1.3, 23 mục). Phạm vi: EngineFactory,
các adapter, CamoufoxPlaywrightController, quản lý profile/store, các đường
HTTP 409 của Local API. Trạng thái test ghi theo Mục 16: PASS / FAIL / NOT_RUN.
Test mô phỏng/integration ở mức Node (tiến trình giả lập) — không thay cho
engine thật/EXE thật (Mục 23).

## 1. Bản đồ module vòng đời

| Thành phần | File | Vai trò trong vòng đời |
|---|---|---|
| EngineFactory | `src/engine/EngineFactory.js` | `resolveEngineType(profile, settings)`: `engine_type` tường minh thắng mọi thứ; xung đột `engine`/`engine_type` → throw; legacy không `engine_type`: gecko → settings.geckoProvider (camoufox/firefox), chromium → chromium. `launchProfile`: hồ sơ camoufox phải qua `NetworkSafetyCheck` (không an toàn → `NETWORK_BLOCKED`), kết quả adapter trả sai `engineType` → throw "Engine provider response mismatch" (chặn provider mismatch ở tầng kết quả). Không có đường fallback sang engine khác. |
| Adapter Chromium | `src/engine/adapters/ChromiumAdapter.js` | Cầu mỏng → `launcher._launchInstalled(profile, url, 'chromium')`. |
| Adapter Firefox | `src/engine/adapters/FirefoxAdapter.js` | Cầu mỏng → `launcher._launchInstalled(profile, url, 'gecko')`. |
| Adapter Camoufox (cầu) | `src/engine/adapters/CamoufoxAdapter.js` | Ưu tiên controller Playwright khi `enabled`; ngược lại native adapter (`launchProfile`/`start`). Ghi `activeProcesses` kèm `onClosed` chỉ xóa record khi `provider==='camoufox'`. Controller lỗi → lỗi truyền thẳng, KHÔNG thử lại bằng native spawn. |
| BrowserLauncher | `src/engine/browserLauncher.js` | Máy trạng thái chính: `pendingStarts` (khóa đang mở, dedupe cùng một promise), `activeProcesses` (hồ sơ đang chạy). `start()` → signal-chain preflight → `engineFactory.launchProfile`. `_launchInstalled`: binary fail-closed (bundled/pinned/không thấy → throw, không tự đổi trình duyệt hệ thống), thư mục tách theo engine (`profiles/` vs `gecko-profiles/`), handler `exit` gắn trước khi await spawn, thoát sớm → reject + dọn gateway. `stop()`: SIGTERM → khóa tới khi có sự kiện `exit` thật (SIGKILL sau 1200ms nếu chưa thoát); nhánh Camoufox Playwright qua controller, native qua adapter; close lỗi → giữ khóa, cho thử lại. `isBusy()` = pending ∪ active. |
| CamoufoxPlaywrightController | `src/engine/CamoufoxPlaywrightController.js` | Phiên in-process: `pending` + `sessions`; launch trùng → throw "running or starting"; gate: controller tắt → throw, không phải native Gecko → throw, NetworkSafetyCheck → `NETWORK_BLOCKED`, verifier bắt buộc (đường tuyệt đối, tên `camoufox.exe`), thư mục `camoufox-profiles/<id>` cách ly, identity D1 phát lại env (absent = hành vi cũ). `context.on('close')` → xóa session + đóng gateway đúng 1 lần (guard) + `onClosed`. `stop()`: `context.close()` reject → GIỮ session + gateway, mở khóa cờ `closing` để thử lại. |
| Camoufox native adapter | `src/engine/camoufoxAdapter.js` | Tiến trình thật (chỉ win32): verifier → spawn `-no-remote -wait-for-browser -profile <dir>`; sẵn sàng = cửa sổ Windows xuất hiện (không dùng PID làm bằng chứng); child `exit`/`error` → `finish()`: đóng proxy, xóa session, `onClosed`. `stop()`: đóng cửa sổ graceful → SIGTERM sau 8s nếu chưa thoát; `pendingExit:true`, session chỉ xóa khi `exit` thật. Proxy cấu hình mà chưa có lab duyệt → throw trước spawn, không fallback direct. |
| Profile manager (prefs) | `src/engine/CamoufoxProfileManager.js` | `firefoxPrefs()` fail-closed theo proxy plan; `assertIsolatedProfileDirectory` chặn đường thoát khỏi root. |
| Store | `src/db/store.js` | `saveProfile`: engine của hồ sơ cũ được bảo toàn khi sửa một phần; đổi provider phải có `allowEngineChange` tường minh, không thì throw; cặp engine/engine_type không khớp → throw. Ghi bền nguyên tử (tmp + rename, rollback khi ghi lỗi). `trashProfile`/`restoreTrashedProfile` (thùng rác 30 ngày, không đụng thư mục phiên), `deleteProfile` (xóa cả `profiles/<id>` và `gecko-profiles/<id>`). Store không tự biết trạng thái đang chạy — khóa vòng đời nằm ở launcher/API/IPC. |
| Local API | `src/api/server.js` | HTTP 409: (1) start Camoufox khi controller chưa bật/không có endpoint đã kiểm chứng; (2) start hồ sơ gecko (manual-only, không CDP); (3) navigate khi controller tắt; (4) navigate khi không có context đang hoạt động; (5) POST sửa hồ sơ đang chạy/bận; (6) DELETE hồ sơ đang chạy/bận. Start Chromium thường → launcher (CDP port + ws). |
| Runtime registry | `src/engine/runtimeRegistry.js` | Binary ghim theo engine (`binaryFor(engine)`) — `findBrowserBinary` ưu tiên pinned, hỏng/thiếu → fail-closed. |

## 2. Đối chiếu tiêu chí Hiến pháp → code → test

| Tiêu chí (mục) | Code hiện có | Phần thiếu / ghi chú | Test |
|---|---|---|---|
| Fail-closed mọi đường chạy; không fallback ngầm (Mục 8) | Factory throw khi mismatch/không hỗ trợ; adapter Camoufox vắng → throw; binary thiếu → throw; controller tắt → throw | — | `per-profile-engine-factory.js` (một phần); bổ sung ở `profile-lifecycle.js`: mismatch ở KẾT QUẢ adapter, mở lại sau reload store |
| Hồ sơ cũ giữ nguyên engine; API cũ tương thích; Chromium là lựa chọn chủ động (Mục 8) | `store.saveProfile` bảo toàn engine khi sửa một phần; đổi provider cần `allowEngineChange`; `resolveEngineType` tôn trọng `engine_type` đã lưu hơn settings hiện tại | — | `per-profile-engine-factory.js`, `api-profile-updates.js`; bổ sung: reload store → mở lại đúng engine cho cả 3 loại |
| Mở → đóng → mở lại cùng hồ sơ | Launcher: stop giữ khóa tới `exit` thật rồi mở lại được; controller/adapter có guard chạy trùng | Chưa có test trọn chu trình mở→đóng→mở lại bằng pid mới + cùng thư mục hồ sơ | MỚI: `profile-lifecycle.js` §1 (Chromium), §4 (Camoufox controller), §6 (native adapter) |
| Tiến trình chết giữa phiên (crash) → trạng thái nhất quán, mở lại được, không kẹt khóa (Mục 17.2: "sau khi tiến trình gặp sự cố") | `onExited` (launcher) / `finish()` (controller, native adapter) dọn record + gateway khi `exit`/`close` | Chưa có test crash SAU khi phiên đã thiết lập cho cả 3 đường | MỚI: `profile-lifecycle.js` §2 (Chromium), §4 (controller crash = context tự đóng), §6 (native crash) |
| Mở đồng thời nhiều hồ sơ | `pendingStarts` dedupe; mỗi hồ sơ một tiến trình + thư mục riêng | Đã test 2 hồ sơ Chromium; chưa test hỗn hợp engine + crash một hồ sơ không ảnh hưởng hồ sơ khác | `launcher-isolation.js`; MỚI: `profile-lifecycle.js` §3 |
| Sửa/xóa hồ sơ đang chạy bị từ chối đúng | API POST/DELETE → 409 khi `isBusy||getActive`; IPC trong main.js (Agent 1/9 sở hữu main.js) | Chưa test cửa sổ "đang đóng" (stopping, chưa có exit) với launcher thật | `api-profile-updates.js` (launcher giả), `launcher-isolation.js` (DELETE khi đang chạy); MỚI: `profile-lifecycle.js` §5 (409 cả khi stopping) |
| Provider mismatch bị chặn | `resolveEngineType` chặn xung đột khai báo; factory chặn kết quả adapter sai loại | Chưa có test cho mismatch ở kết quả trả về | MỚI: `profile-lifecycle.js` §7 |
| Dọn dẹp đúng một lần (gateway/session) khi đóng hoặc lỗi | Controller: `closeGateway` có guard; native adapter: `closeProxy` có guard | **Lỗi thật (nhẹ)**: đường lỗi sau khi context đã tạo (vd `page.goto` lỗi) trong controller — `finish()` đã đóng gateway qua sự kiện `close`, khối `catch` lại gọi `proxyPlan.close()` lần hai. Gateway thật hiện chịu được đóng hai lần, nhưng phá vỡ bất biến "đóng đúng một lần" mà chính test sẵn có khẳng định ở đường stop. | MỚI: `profile-lifecycle.js` §4 (probe) + sửa `CamoufoxPlaywrightController.js` + test hồi quy |
| Engine thật trên Windows (mở/đóng/crash với binary thật, EXE) | — | NOT_RUN tại máy Linux này; thuộc Đợt D / cổng 3 Mục 12 | NOT_RUN — ghi rõ ở báo cáo cuối |

## 3. Quyết định engine (Mục 8, v1.3) — trạng thái tuân thủ

- Chưa đổi mặc định trong code: mặc định vẫn Chromium; Camoufox là adapter tùy chọn theo hồ sơ. Agent 3 không thay đổi điểm này.
- Hồ sơ cũ giữ engine: `engine_type` đã lưu thắng `settings.geckoProvider` hiện tại (đã test sẵn có).
- Không chuyển ngầm engine khi lỗi: mọi đường lỗi đều throw/409, không thử engine khác (test §7 + test sẵn có).
