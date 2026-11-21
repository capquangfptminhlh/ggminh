# Checklist phát hành Camoufox bản sửa localStorage — việc của chủ dự án

Tài liệu này dành cho **chủ dự án**. Agent đã làm phần chuẩn bị. Mọi bước có
`[OWNER]` chỉ chủ dự án được làm: tạo khóa, ký, ghim khóa, phân phối, merge, tag,
publish. Agent không có và không được giữ khóa production.

Bổ sung cho `docs/agents/agent-13/OWNER-RUNBOOK.md` (nghi thức khóa) và
`docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md` (ngày phát hành). Khác biệt
chính là cây engine: **không còn dùng cây upstream nguyên trạng** mà dùng bản
build có patch localStorage. Vì vậy mục 3 và 4 của checklist ngày phát hành
được thay bằng mục 3 dưới đây.

## 0. Trạng thái khi bàn giao (2026-11-21)

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Nguyên nhân gốc | Đã xác minh | Firefox `FIREFOX_156_0_1_RELEASE` `dom/localstorage/ActorsParent.cpp`: `kFlushTimeoutMs = 5000`, `Connection::ScheduleFlush`. Camoufox `7a4ac0d` (tag v156.0.1-beta.36) không patch đường này. |
| Build engine sửa | PASS | Run 44736873136. ZIP `c0837412fa7c1943c21806d9949994384603be7bf07a6630375190171d23eeee`, `camoufox.exe` `1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331`, patch `3bb13fa6…247c0e`. |
| Lưu trữ + độ bền khi kill, engine sửa, CI Windows | PASS có giới hạn | Run 44872332491 với cấu hình yêu cầu 0 ms: các mốc kiểm bắt buộc đạt; các lượt trước từng mất dữ liệu tại 500 ms và 1000 ms. Một lần đạt không bảo đảm giới hạn mất dữ liệu. |
| Cùng phép thử, engine upstream | FAIL ở localStorage (đã biết) | Chỉ mốc kill 6000 ms còn dữ liệu. Các trường khác và hồ sơ B đạt. |
| Ký engine bằng khóa production | NOT_RUN | Việc của chủ dự án, mục 1–3. |
| Nghiệm thu bản cài trên Windows sạch | NOT_RUN | Mục 6. |

**Giới hạn phải giữ nguyên trong mọi tài liệu bán hàng hay hỗ trợ:**
- Patch cho phép rút ngắn thời gian chờ flush; cấu hình LHM yêu cầu 0 ms cho đúng cây engine đã xác minh. Thời gian commit thực tế không được bảo đảm và ảnh hưởng hiệu năng chưa đo.
- Kill gần như ngay sau khi ghi vẫn có thể mất bản ghi cuối. Đo được: mốc 0 ms mất, mốc 50–100 ms mất một phần.
- Mất điện còn phụ thuộc hệ điều hành và ổ đĩa có tôn trọng fsync hay không.
- Không có kết quả nào ở đây chứng minh một website không thể liên kết các hồ sơ.

## 1. Tạo khóa publisher production `[OWNER]`

Làm theo OWNER-RUNBOOK mục 1–2, trên máy ngoại tuyến, ngoài mọi thư mục repo.

- [ ] Sinh cặp Ed25519 mới. Không dùng lại khóa RC1 đang nằm trong
      `resources/camoufox-engine/publisher-ed25519.pub` (SPKI sha256 `bec427c0…`), vì đó là khóa diễn tập.
- [ ] Public key phải khác khóa license. Công cụ ký sẽ từ chối nếu trùng.
- [ ] Private key cất vào két mã hóa, kèm 2 bản sao lưu ở 2 nơi khác nhau. Không bao giờ đưa vào repo, CI hay gói cài.
- [ ] Lập biên nhận nghi thức `lhm.camoufox-publisher-ceremony.v1` với
      `environmentClass: owner-offline-production` (preflight kiểm tra digest khóa).

## 2. Ghim khóa production vào ứng dụng `[OWNER]` (một commit riêng, có review)

- [ ] Thay `resources/camoufox-engine/publisher-ed25519.pub` bằng public key production.
- [ ] Trong `src/engine/camoufoxProductionTrust.js`, đặt
      `PRODUCTION_PUBLISHER_SPKI_SHA256` bằng SPKI SHA-256 của khóa đó. Lấy giá trị bằng:
      `node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(c.createPublicKey(f.readFileSync(process.argv[1])).export({format:'der',type:'spki'})).digest('hex'))" publisher-ed25519.pub`
- [ ] Sửa `test/camoufox-production-gate.js`: thay kiểm tra `=== null` bằng so khớp
      digest production. Sửa `EXPECTED_SPKI_SHA256` trong `test/camoufox-production-trust-anchor.js`.
- [ ] Chưa ghim thì bản đóng gói **tự tắt Camoufox**, còn Chromium vẫn chạy (đã có test).

## 3. Lấy và ký engine sửa `[OWNER]`

1. [ ] Tải artifact `camoufox-156.0.1-beta.36-win.x86_64-lhm-lsflush-UNVERIFIED` của run 44736873136.
       Kiểm SHA-256 của ZIP và của `camoufox.exe` theo mục 0.
       Artifact hết hạn sau 14 ngày (khoảng 2026-12-04). Muốn tái tạo thì đẩy commit
       lên nhánh `engine-build/<tên>`. Workflow `camoufox-engine-build.yml` build lại
       đúng commit upstream cộng patch (khoảng 2,5 giờ) và lưu artifact 90 ngày.
2. [ ] Giải nén bằng .NET `ZipFile.ExtractToDirectory`, **không dùng `tar.exe`**
       (tar bỏ qua 12 tên font NFD). Kỳ vọng 1579 file, tổng 2.563.244.348 byte.
3. [ ] Chạy cổng quét tên file (RELEASE-DAY-CHECKLIST mục 4) trên cây vừa giải nén.
4. [ ] Đối chiếu manifest chưa ký:
       `node tools/camoufox-engine/unsigned-manifest.js <CAY> 156.0.1 <ra.json>`
       phải ra payload SHA-256 `c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be`
       (bản ghi: `tools/camoufox-engine/records/…unsigned-manifest.json`).
5. [ ] Ký offline:
       `LHM_ENGINE_SIGNING_KEY_FILE=<private> LHM_ENGINE_PUBLISHER_KEY_FILE=<public> node tools/sign-bundled-engine.js <CAY> 156.0.1 camoufox`
6. [ ] So khớp sau khi ký:
       `node tools/camoufox-engine/unsigned-manifest.js --compare <ra.json> <CAY>/manifest.json` phải in ra `"match":true`.
7. [ ] Đóng gói ZIP cây đã ký, tạo descriptor:
       `node tools/create-camoufox-release-descriptor.js <zip> <CAY>/manifest.json <public> <release.json> https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`
       rồi thay `resources/camoufox-engine/release.json` và chạy
       `node tools/verify-camoufox-release-resources.js resources/camoufox-engine`.

## 4. Nghĩa vụ MPL-2.0 khi phân phối engine đã sửa `[OWNER]`

Firefox và Camoufox là phần mềm MPL-2.0. Phân phối bản executable của file
MPL **đã sửa** kéo theo các nghĩa vụ sau (MPL-2.0 mục 3.2):
- [ ] Công bố **Source Code Form** của các file đã sửa:
      `dom/localstorage/ActorsParent.cpp` và `modules/libpref/init/StaticPrefList.yaml`,
      bản đầy đủ sau patch (không chỉ đường dẫn tới upstream), theo đúng giấy phép MPL-2.0.
      Cách đơn giản: kèm thư mục `source/` của artifact build (patch, `SOURCE.txt` có ref
      upstream đã ghim) **và** hai file đầy đủ sau patch vào cùng bản phát hành.
      Phát hành cả cây nguồn đã patch còn an toàn hơn.
- [ ] Báo cho người nhận cách lấy mã nguồn đó: một dòng trong ghi chú phát hành
      hoặc trong màn hình giới thiệu/giấy phép, kèm liên kết. Mức phí không được vượt chi phí phân phối.
- [ ] Giữ nguyên các thông báo giấy phép sẵn có trong engine (`about:license`, file LICENSE). Không gỡ bỏ.
- [ ] Các nghĩa vụ đang có khi phân phối Camoufox upstream (font, thư viện bên thứ ba)
      vẫn áp dụng như trước.
- Ghi chú: đây là tóm tắt kỹ thuật, không phải tư vấn pháp lý. Chủ dự án tự xác nhận.

## 5. Phân phối `[OWNER]`

- [ ] Tạo GitHub release (tag do chủ dự án đặt), tải lên ZIP đã ký và phần nguồn ở mục 4.
- [ ] URL phải khớp `url` trong `release.json`. Ứng dụng chỉ chấp nhận
      `https://github.com/<o>/<r>/releases/download/<tag>/<file>.zip`.

## 6. Nghiệm thu bản cài trên Windows sạch `[OWNER]` + `[CI-WIN]`

- [ ] Build bản cài sau khi đã có commit ghim khóa (mục 2) và descriptor mới (mục 3.7).
- [ ] Chạy workflow `Windows clean-install evidence (manual, no release)` với run id
      của bản build đó.
- [ ] Trên máy Windows sạch thật: cài, cài engine Camoufox từ release đã ký, mở
      hồ sơ Camoufox thủ công, đóng/mở lại, kiểm tra Chromium vẫn chạy.
- [ ] Chạy `stage0-measure/run-isolation.js` với **engine đã cài** (đặt
      `LHM_CAMOUFOX_EXECUTABLE`/`LHM_CAMOUFOX_EXE_SHA256` theo bản đã ký).
      Kỳ vọng mọi điều kiện PASS, kể cả `crashRecovery` và `crashRecoveryKillSweep`.
      Ghi lại `launchRetries`: có thử lại thì báo cáo, không bỏ qua.
- [ ] Lập envelope bằng chứng `crash` cho preflight:
      `idleFlush={status,idleMs:10000}`, `shortCrash={status,idleMs:1500}` lấy từ
      `crashRecoveryIdleFlush`/`crashRecovery`, và
      `killSweep={status,gateMs:500,gatedSamples:<số mẫu gated>}`. Cổng giờ **bắt buộc PASS**
      và không còn chấp nhận `KNOWN_FINDING` của engine upstream.
- [ ] `npm run camoufox:release-preflight -- --resources-dir … --engine-dir … --installer … --evidence-dir … --publisher-receipt … --clean-install-receipt …`
      Mọi cổng phải PASS. Cổng nào `MANUAL_REQUIRED` hoặc `BLOCKED` thì dừng.
- [ ] Chỉ khi đã có bằng chứng ở trên: thêm phiên bản `156.0.1` vào
      `resources/camoufox-engine/capabilities.json` (`manual:true`, `verdict:"PASS"`,
      `evidence` trỏ tới JSON trong `stage0-measure/`). Để `proxyTypes:[]` cho đến khi có
      bằng chứng proxy thật riêng.

## 7. Duyệt cuối `[OWNER]`

- [ ] CI của PR xanh hết. Đọc lại giới hạn ở mục 0.
- [ ] Merge, tag và publish do chủ dự án làm theo `docs/release/TAG-AND-MERGE-RUNBOOK.md`.

## Việc còn mở (không chặn bản sửa localStorage)

- Thời gian mở Camoufox trên Windows thường 10–15 giây, đôi khi vượt giới hạn 30 giây
  của controller, gặp ở **cả engine upstream lẫn engine sửa**, trên máy dev và trên
  runner CI. Bộ đo đã thử lại một lần và ghi `launchRetries`. Bản thân controller
  cần một quyết định riêng: tăng giới hạn, hoặc thử lại kèm thông báo cho người dùng.
