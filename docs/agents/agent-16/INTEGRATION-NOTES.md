# INTEGRATION NOTES — Agent 16: trải nghiệm lần chạy đầu (first-run UX)

Phạm vi đã sửa trong nhánh này (chỉ `src/ui/*.js`, trừ index.html và
criteriaChecklistProvider.js): `renderer.js`, `engineSource.js`,
`profilePanel.js` + test mới `test/first-run-ux.js`. Các mục dưới đây
là phần cần điều phối/chủ dự án xử lý ở file chung.

## 1. Chuỗi test (package.json — điều phối)

Đề xuất thêm vào chuỗi `test`, ngay sau `node test/integration-wiring.js`:

```
&& node test/first-run-ux.js
```

`node --check src/ui/renderer.js` và `node --check src/ui/engineSource.js`
đã có trong chuỗi; `profilePanel.js` cũng đã có qua `node --check
src/ui/profilePanel.js` (kiểm chứng: có trong chuỗi hiện tại).

## 2. index.html — ba đề xuất (chưa tự sửa)

### 2a. Phần tử gợi ý Camoufox trong form tạo hồ sơ

Hiện `renderer.js` tự tạo `<p id="camoufox-form-hint">` và gắn vào
`.form-group` của ô chọn engine lúc chạy. Nên thay bằng phần tử tĩnh
để bố cục ổn định. Vị trí: trong `tab-general`, ngay sau đoạn `<p>`
ghi chú tĩnh dưới `#field-browser-engine` (dòng ~838):

```html
<p id="camoufox-form-hint" role="status" style="margin-top:6px;font-size:12px;color:#dba66f" hidden></p>
```

Sau khi có phần tử tĩnh, rút gọn `updateCamoufoxFormHint()` trong
renderer.js thành tra cứu theo id (bỏ nhánh tự tạo phần tử).

### 2b. Nút hành động ngay trong trạng thái rỗng

`#empty-state` (dòng ~367) hiện chỉ có chữ. Đề xuất thêm một nút bấm
thật để người dùng lần đầu không phải tự tìm nút trên thanh công cụ:

```html
<button type="button" class="btn btn-primary" id="empty-state-create">Tạo hồ sơ đầu tiên</button>
```

và nối trong renderer.js:
`document.getElementById('empty-state-create')?.addEventListener('click', () => btnCreateProfile.click());`

### 2c. Câu ghi chú tĩnh dưới ô chọn engine (tùy chọn)

Đoạn ghi chú hiện tại chưa nhắc tới danh tính đã ghim. Đề xuất thêm
một câu vào cuối đoạn (sau "Đổi engine không mang theo phiên đăng nhập."):

> "Với Camoufox, khi lưu hồ sơ ứng dụng sẽ thử cấp một danh tính đã
> ghim bằng cơ chế chính thức của Camoufox; kết quả được thông báo
> ngay sau khi lưu và hiển thị tại hàng của hồ sơ."

## 3. main.js — lưu lý do provisioning để UI nói đúng nguyên nhân

Handler `save-profile` hiện nhận kết quả từ `provisionCamoufoxIdentity`
nhưng chỉ lưu hồ sơ; `reason` bị bỏ. Vì vậy thông báo sau khi tạo hồ
sơ (renderer) chỉ nói được ở mức chung. Đề xuất: trong handler, khi
kết quả có `reason`, ghi kèm vào hồ sơ trước khi lưu:

```js
if (provisioning && provisioning.reason)
  profile.fingerprint.identityProvisioningReason = provisioning.reason;
```

Khi đó renderer có thể dùng `provisioningReasonText()` (đã có sẵn
trong `window.LHMFirstRunGuide`) để nói đúng nguyên nhân thay vì câu
chung. IPC `provision-camoufox-identity` đã trả `reason` nên nút
"Cấp danh tính" không cần thay đổi.

## 4. Đã kiểm tra — không cần xử lý

- Tạo nhanh (bulk create) **không** có lựa chọn Camoufox trong ô chọn
  engine (chỉ Chrome/Edge và Firefox/Gecko — index.html dòng ~391),
  nên không tồn tại đường tạo hồ sơ Camoufox nào bỏ qua provisioning.
- Sổ tay khách hàng của Agent 14 (mục 2.1) mô tả người dùng có thể
  "yêu cầu cấp danh tính sau bằng thao tác cấp danh tính cho hồ sơ đã
  có" — trước nhánh này thao tác đó **không tồn tại** trong UI (IPC
  có trong preload nhưng không module UI nào gọi). Nút "Cấp danh tính"
  mới ở hàng hồ sơ đã làm cho mô tả đó thành đúng; tài liệu không cần
  sửa.
