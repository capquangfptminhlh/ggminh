# TAG-AND-MERGE RUNBOOK — LHM Ads Browser v5.8.0

Quy trình **chủ dự án tự thực thi** bằng git thật trên máy của mình
(tài khoản chủ repo, có quyền push + quyền ghi `.github/workflows`).
Trợ lý không push/merge/tag thay. Thứ tự các bước là bắt buộc;
điều kiện tiên quyết của từng bước ghi ngay đầu bước.

> Đọc trước: `RELEASE-CHECKLIST.md` (trạng thái từng cổng) và
> `docs/agents/agent-13/OWNER-RUNBOOK.md` (buổi lễ khóa publisher).

---

## 0. Bản đồ tình hình — vì sao runbook này không chỉ là "merge PR"

Hiện tồn tại **ba lịch sử khác nhau của cùng một cây code**, cộng
**ba dòng phân kỳ** chưa hoà giải. Xử lý sai chỗ này là mất lịch sử
thật hoặc nhân đôi mọi commit:

| # | Dòng | Head đã biết | Ghi chú |
|---|---|---|---|
| A | Clone tích hợp local (điều phối viên) | `integration/v5.8-phase-c` @ `f280296` | **Lịch sử merge đầy đủ**: 90 commit trên nền `77075f3`, từng agent một merge commit. Đây là lịch sử nên đi vào `main`. |
| B | Nhánh cùng tên trên GitHub | `f549a63` | **Lịch sử phẳng (snapshot)**: 4 commit chụp cây (`e1de963` → `1c3e065` → `38b25d7` → `f549a63`) vì môi trường của trợ lý không có thông tin đăng nhập git — đường push duy nhất là công cụ chụp cây. Cây file của `f549a63` ≡ cây của `f280296` (đã kiểm chứng bằng CI xanh + đối chiếu khi push), nhưng **lịch sử thì không**. Nhánh này chỉ là phương tiện chạy CI (PR #18). |
| C | Nhánh D1 (luồng của chủ dự án) | `feature/d1-camoufox-per-profile-identity` @ `7f13c3f` | Hậu duệ của `8349f38`, chứa phần việc **không có** trong A: kiểm toán fail-closed, workflow stage-0 đã cấu hình, cảnh báo hành vi, tăng cường chống sửa license, +48 dòng cho `camoufox-upstream-smoke.yml`. |
| D | Nhánh selective trên GitHub | `integration/v5.8-core-selective` | Head do luồng chủ dự án báo là `8c1ab69`; ref theo dõi trong clone điều phối viên còn ở `67287ae` — **phải fetch và ghi lại head thật ở Bước 1**, không tin số nào có sẵn. |
| E | Checkout local của chủ dự án | commit `89b3c2c` (chưa lên GitHub) + **2 thay đổi chưa commit** | (1) khóa single-instance dùng chung một kho dữ liệu; (2) sửa công cụ ký Camoufox: tách khóa publisher + chặn khóa riêng trong gói engine — **cùng hai khoảng trống mà Agent 2 đã sửa độc lập ở commit `e72991b` trong dòng A**. Hoà giải phải diff hai bản cài đặt, không chọn bừa một bản. |

**Nguyên tắc xử lý lịch sử (quyết định của runbook này):**

- Merge vào `main` bằng **lịch sử đầy đủ của dòng A** (sau khi đã
  hoà giải C/D/E vào A). Lịch sử merge theo agent là hồ sơ kiểm
  toán của dự án — không vứt.
- **Không bao giờ merge nhánh snapshot B vào `main`.** Làm vậy sẽ
  kéo 4 commit chụp cây (mỗi commit chứa toàn bộ delta) chồng lên
  lịch sử thật, sinh lịch sử song song không liên quan và chôn
  90 commit thật dưới các commit chụp.
- Nhánh B giữ nguyên cho tới khi merge từ A được kiểm chứng xong
  (nó là bản ghi chính xác của cái CI đã test), sau đó xoá hoặc
  reset theo Bước 6.

## Bước 0 — Điều kiện tiên quyết

- [ ] Gate 1, 2a đạt; **Gate 3 ĐẠT** trên artifact của Gate 2a
      (xem `RELEASE-CHECKLIST.md`). Chưa đạt Gate 3 → dừng.
- [ ] Các quyết định QD-01..QD-04, A12-D1..D4, A17-F3/F4 đã chốt
      và ghi vào checklist.
- [ ] Sao lưu ngoài máy: clone tích hợp (dòng A) + checkout local
      (dòng E) + thư mục khoá (nếu đã làm lễ khóa).
- [ ] Mọi working tree liên quan đều sạch (`git status` không còn
      gì ngoài 2 thay đổi đã biết của dòng E — hai thay đổi đó
      được xử lý tường minh ở Bước 2.3, không để lẫn).

## Bước 1 — Fetch và kiểm kê các head thật

Trong clone làm việc của bạn (clone có remote GitHub đầy đủ):

```bat
git fetch origin --prune
git fetch <remote-cua-clone-tich-hop> --prune   :: nếu clone tích hợp là một remote riêng; nếu không, clone nó về cạnh bên

:: Ghi lại head thật của từng dòng vào phiếu kiểm toán (đừng tin tài liệu):
git log -1 --format="%H %ci %s" origin/main
git log -1 --format="%H %ci %s" origin/integration/v5.8-phase-c
git log -1 --format="%H %ci %s" origin/feature/d1-camoufox-per-profile-identity
git log -1 --format="%H %ci %s" origin/integration/v5.8-core-selective
```

Kỳ vọng để đối chiếu (sai lệch thì dừng và tìm hiểu trước):
`main` = `77075f3`; snapshot = `f549a63`; D1 = `7f13c3f`.

Mang lịch sử đầy đủ của dòng A vào clone làm việc (nếu chưa có):

```bat
git fetch <clone-tich-hop> integration/v5.8-phase-c:refs/heads/integration/v5.8-phase-c-local
git log -1 --format="%H %s" integration/v5.8-phase-c-local   :: kỳ vọng f280296
```

## Bước 2 — Hoà giải các dòng phân kỳ vào một nhánh đóng băng

Tạo nhánh đóng băng từ head của dòng A (lịch sử đầy đủ):

```bat
git checkout -b release/v5.8.0-freeze integration/v5.8-phase-c-local
```

### 2.1 Dòng C (D1 @ `7f13c3f`)

Phần riêng của C so với tổ tiên chung `8349f38`:

```bat
git log --oneline 8349f38..origin/feature/d1-camoufox-per-profile-identity
git diff --stat 8349f38 origin/feature/d1-camoufox-per-profile-identity
```

Đối chiếu từng mục với dòng A (phần lớn nội dung D1 — D1/D2/D3 —
đã vào A qua đợt triển khai 10 agent; phần **chỉ C có** là: kiểm
toán fail-closed, cảnh báo hành vi bản của C, tăng cường chống sửa
license, và file smoke đã áp bản vá). Riêng file
`camoufox-upstream-smoke.yml`: bản trong `release/workflows/` của
A đã được kiểm chứng byte-identical với bản của C cộng đúng 1 dòng
trigger — lấy bản của A làm chuẩn.

Đưa phần chỉ-C-có vào bằng cherry-pick chọn lọc, giải quyết xung
đột bằng cách đọc cả hai bản cài đặt:

```bat
git cherry-pick <sha-tung-commit-can-lay>
npm run test:all   :: sau mỗi nhóm cherry-pick, không dồn hết rồi mới chạy
```

### 2.2 Dòng D (selective)

```bat
git log --oneline 77075f3..origin/integration/v5.8-core-selective
```

Dòng selective là **tổ tiên ý tưởng** của dòng A (A được xây lại
có chọn lọc từ nó theo danh sách giữ/bỏ đã duyệt). Mặc định:
không merge; chỉ rà danh sách commit tìm mục nào A chưa có tương
đương, ghi vào phiếu kiểm toán kèm quyết định lấy/không lấy.

### 2.3 Dòng E (checkout local của bạn)

```bat
:: Trong checkout local đó:
git log -1 --format="%H %s"            :: kỳ vọng 89b3c2c
git diff > e-uncommitted.patch         :: 2 thay đổi chưa commit
git format-patch 77075f3..HEAD -o e-commits

:: Trong clone làm việc, trên nhánh freeze:
git am e-commits/*.patch               :: hoặc cherry-pick nếu cùng kho remote
git apply e-uncommitted.patch
```

Điểm bắt buộc diff tay: **bản sửa công cụ ký của E so với commit
`e72991b` của A** (cùng sửa hai khoảng trống: ép khóa license +
không kiểm tra khóa riêng trong gói). So hai bản:

```bat
git show e72991b -- tools/sign-bundled-engine.js src/engine/camoufoxInstallService.js
git show 89b3c2c -- <duong-dan-tuong-ung>   :: và phần tương ứng trong e-uncommitted.patch
```

Giữ bản nào chặt hơn ở từng điểm (từ chối khóa license / quét khóa
riêng / vị trí neo public key), ghi quyết định vào phiếu kiểm
toán. Tương tự với thay đổi single-instance lock: đối chiếu với
`main.js` của A (A có wiring ở hai điểm tạo warningService —
đừng để thay đổi lock làm lệch hành vi khởi tạo đó).

### 2.4 Chốt hoà giải

```bat
npm run test:all
```

- Kỳ vọng: 201+ bước (số bước có thể tăng nếu hoà giải thêm test),
  FAIL = 0 trên Windows; trên Linux chỉ chấp nhận đúng 2 fixture
  nền tảng đã biết kèm giải thích cơ chế.
- Commit mọi sửa chữa hoà giải với thông điệp nêu rõ lấy từ dòng
  nào, bỏ gì, vì sao. Ghi head của nhánh freeze vào checklist:
  `release/v5.8.0-freeze` @ `____`.

## Bước 3 — Kiểm toán cuối trước merge

- [ ] **Quét bí mật trên toàn cây đóng băng** (không chỉ delta):

```bat
git grep -n "BEGIN .*PRIVATE KEY" -- . || echo "khong co khoa rieng"
git ls-files | findstr /R /C:"\.pem$" /C:"\.key$" /C:"id_rsa" /C:"id_ed25519"
```

  Kết quả kỳ vọng: 0 khóa riêng. (Fence `.gitignore` của QA-002 đã
  chặn *.pem/*.key/id_* ở các đợt trước — kiểm lại vẫn bắt buộc.)
- [ ] **Quét câu chữ Mục 11** trên các file hướng ra khách hàng đã
      đổi trong đợt này (CHANGELOG này, tài liệu khách hàng, nhãn
      UI): không phần trăm hiệu quả chưa đo, không khẳng định về
      đối thủ chưa kiểm chứng, không "an toàn để chạy Ads", không
      tuyệt đối hoá.
- [ ] **Workflow bản cuối đã ở đúng chỗ:** chép
      `release/workflows/*.yml` vào `.github/workflows/` (theo
      APPLY-GUIDE), kèm quyết định về bản sửa bước generate của
      Gate 2b. Commit riêng cho việc này để dễ hồi lui.
- [ ] **Tên artifact:** quyết định giữ chữ `Preview` trong
      `artifactName` hay đổi (`package.json` → `build.nsis`) —
      đổi thì build lại và chạy lại Gate 2a + Gate 3 trên artifact
      mới; không đổi thì ghi rõ bản thương mại đầu vẫn mang nhãn
      Preview trong tên file.
- [ ] Đẩy nhánh freeze lên GitHub bằng git của bạn và để CI chạy
      trọn trên đúng cây đóng băng; lưu run id vào checklist.

## Bước 4 — Ký (ngoại tuyến, release operator thực hiện)

### 4.1 Khóa publisher production

Nếu chưa làm: thực hiện buổi lễ khóa theo
`docs/agents/agent-13/OWNER-RUNBOOK.md` — sinh cặp Ed25519 **mới,
riêng cho engine**, trên máy ngoại tuyến; private key để ngoài
repo, hai bản sao mã hoá ở hai nơi; public key là neo tin cậy đi
cùng ứng dụng. Không có bước này thì 4.2/4.3 không thực hiện được
và đường engine ký tiếp tục fail-closed (đúng thiết kế).

### 4.2 Ký cây engine Camoufox Windows

```bat
:: Chuẩn bị cây engine chính thức (Windows) NGOÀI repo.
:: BẮT BUỘC trước khi ký: rà tên mọi file trong cây theo luật
:: manifest (ký tự như [ ] , bị cấm). Công cụ ký từ chối fail-
:: closed nếu gặp tên cấm — sửa tên file, KHÔNG nới luật trong code.
node tools/sign-bundled-engine.js --tree <cay-engine> --key <private-key-publisher.pem> --out <manifest-da-ky>
```

- Công cụ tự từ chối: khóa license đưa vào làm khóa ký, cây chứa
  vật liệu khóa riêng, khóa ký nằm trong cây được ký.
- Kiểm chứng sau ký bằng chính đường nạp của ứng dụng trên máy
  sạch: cài engine qua luồng trong ứng dụng, xác nhận manifest
  hợp lệ + hash khớp + trạng thái `alreadyPresent` ở lần hai.
- Đặt public key vào bản đóng gói tại
  `resources/lhm-camoufox/publisher-ed25519.pub` (bản cài) — sau
  đóng gói mở bản cài kiểm lại file tồn tại, đúng nội dung (so
  fingerprint SPKI, không so bằng mắt). Public key là symlink /
  quá lớn / không phải Ed25519 / trùng khóa license → ứng dụng tự
  từ chối: gặp các trạng thái đó là dừng, không lách.

### 4.3 Gói engine Chromium đóng kèm (chỉ khi quyết định giao kèm)

Cùng công cụ và cùng khóa publisher (QD-02 phương án 1). Nếu
QD-02 chốt khác, ghi ngoại lệ chính thức vào checklist — không
được tuyên bố "mọi engine đã tách khóa" khi chưa đúng sự thật.

### 4.4 Manifest cập nhật ứng dụng — TRẠNG THÁI THẬT, ĐỌC KỸ

**Bước này hiện KHÔNG thực hiện được và KHÔNG thuộc bản v5.8.0:**

- Phía ứng dụng mới có thư viện kiểm tra manifest đã ký
  (`src/update/updateCheck.js`, nguyên mẫu của Agent 12) và nó
  **chưa được nối vào ứng dụng**.
- Công cụ ký phía phát hành **đã được xây** (Agent R9, Wave R:
  `tools/sign-app-update.js` + `test/app-update-signing.js`
  25/25) nhưng mới ở tầng công cụ: chưa có khóa publisher
  production (phụ thuộc QD-02/A12-D3) và chưa nối vào ứng dụng.
- Hệ quả: v5.8.0 giao đi **không có** khả năng cập nhật có ký;
  không ký, không công bố bất kỳ manifest cập nhật nào cho bản
  này. Muốn có ở bản sau: lập hạng mục riêng (nối IPC theo ghi
  chú tích hợp của Agent 12 + quyết định A12-D1..D4 + nghi thức
  khóa publisher).

### 4.5 Authenticode cho gói cài

Đã quyết **không mua** (2026-10-22) → bỏ qua bước `signtool`;
gói cài giao không ký, câu chữ SmartScreen phải có trong tài liệu
và tin nhắn giao hàng (checklist đã có mục này). Nếu sau này đổi
quyết định: ký là bước thuần ở khâu build, không sửa code.

## Bước 5 — Merge và tag (chỉ sau Gate 3 ĐẠT + Bước 2–4 xong)

Merge **lịch sử đầy đủ** từ nhánh freeze (hậu duệ của dòng A):

```bat
git checkout main
git pull origin main                        :: kỳ vọng vẫn ở 77075f3
git merge --no-ff release/v5.8.0-freeze -m "release: LHM Ads Browser v5.8.0"
npm run test:all                            :: kiểm tra lần cuối trên cây đã merge
git push origin main
```

Gắn tag **sau** merge, tại commit merge:

```bat
git tag -a v5.8.0 -m "LHM Ads Browser v5.8.0" <commit-merge>
git push origin v5.8.0
```

Tag bổ sung còn thiếu cho bản cũ (cùng phiên, nếu duyệt):

```bat
git tag -a v5.7.0 -m "LHM Ads Browser v5.7.0" 77075f3
git push origin v5.7.0
```

## Bước 6 — Kiểm chứng sau merge + dọn nhánh snapshot

- [ ] CI trên `main` sau merge xanh — run id: ____ (lưu vào
      checklist Gate 4).
- [ ] Build artifact từ `main`, ghi SHA-256, cài smoke trên máy
      Gate 3: ĐẠT.
- [ ] PR #18: đóng với ghi chú "đã thay bằng merge lịch sử đầy đủ
      từ nhánh freeze; PR chỉ dùng để chạy CI".
- [ ] Nhánh snapshot B: sau khi các mục trên đạt, xoá khỏi GitHub
      (`git push origin --delete integration/v5.8-phase-c`) hoặc
      giữ làm bản lưu — ghi lựa chọn: ____. Clone tích hợp local
      (dòng A) giữ nguyên làm hồ sơ.
- [ ] Cập nhật trạng thái phát hành vào `RELEASE-CHECKLIST.md` và
      sổ đăng ký Mục 4 Hiến pháp (phần thuộc thẩm quyền chủ dự án).

## Hồi lui (rollback)

| Tình huống | Cách xử lý |
|---|---|
| **Gate 3 KHÔNG ĐẠT** (trước merge) | Dừng đóng băng. Sửa trên nhánh tích hợp/freeze, build artifact **mới**, chạy lại từ Gate 1. Tuyệt đối không vá trực tiếp lên artifact đã build, không hạ tiêu chuẩn Gate 3 cho khớp kết quả. |
| **CI trên `main` đỏ sau merge** (trước khi giao khách) | `git revert -m 1 <commit-merge>` rồi push — `main` trở lại trạng thái v5.7.0 an toàn trong khi điều tra trên nhánh freeze. **Không force-push `main`** trong mọi trường hợp. Tag `v5.8.0` nếu đã push: xoá tag remote + local (xem hàng dưới) vì chưa có khách nào nhận bản. |
| **Tag sai / tag sớm** (chưa giao khách) | `git tag -d v5.8.0` + `git push origin :refs/tags/v5.8.0`, sửa, gắn lại. **Sau khi đã giao bất kỳ khách nào: không bao giờ di chuyển tag** — phát hành bản vá `v5.8.1` thay thế. |
| **Manifest engine ký sai** (sai cây / sai khóa / hash lệch) | Không ký lại lặng lẽ trên cùng cây. Thu hồi theo Mục 6 của OWNER-RUNBOOK (đổi khóa publisher + phát hành lại ứng dụng mang public key mới) nếu lỗi thuộc về khóa; nếu chỉ sai cây, dựng lại cây đúng, ký lại, và ghi cả hai manifest vào hồ sơ phát hành kèm lý do bản đầu bị loại. |
| **Phát hiện lỗi nghiêm trọng sau khi đã giao khách** | Không thu hồi được file đã giao — phát hành `v5.8.1` với quy trình rút gọn nhưng **đủ Gate 1 + Gate 2a + Gate 3 smoke trên máy thật**, kèm thông báo trung thực cho khách về lỗi và bản thay thế. License đã cấp không bị ảnh hưởng. |

---

*Runbook này mô tả quy trình; nó không tự thực thi bước nào.
Mọi lệnh trên do chủ dự án chạy trên máy và tài khoản của mình.*
