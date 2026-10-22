# INTEGRATION NOTES — Agent R18 (installer & first-run polish)

Branch `agent-r18/installer-polish` on base f280296. Files changed:
`src/ui/index.html`, `src/ui/renderer.js`, new
`test/installer-first-run-polish.js`, and this report set under
`docs/agents/agent-r18/`. No shared files edited; no push/merge/tag.

## 1. Test chain (package.json — coordinator)

Append after `node test/first-run-ux.js` in the `test` chain:

```
&& node test/installer-first-run-polish.js
```

`node --check src/ui/renderer.js` is already in the chain; index.html
has no syntax step (the new test parses it as text). Verified locally:
the new test PASSes, and first-run-ux / app-identity / workspace-ui /
dashboard-ui / profile-panel / license-center-ui / release-readiness
all still PASS with the branch's changes.

## 2. License activation message map (proposal — owner wording)

Do NOT change `src/licensing/manager.js` strings (tests pin them).
Translate at the presentation layer in `src/ui/licenseCenter.js`:
replace the three verbatim surfacings (lines 51, 61, 69) with a lookup
that maps known manager messages to Vietnamese and falls back to a
generic sentence + the original in parentheses for support:

| Manager message | Proposed customer wording |
|---|---|
| `License signature mismatch` | `Mã kích hoạt không hợp lệ với bản phát hành này (chữ ký không khớp). Kiểm tra lại mã bên bán đã gửi.` |
| `License expired` | `License đã hết hạn. Liên hệ bên bán để gia hạn.` |
| `Invalid license fields` / `Invalid license period` / `Invalid license entitlements` | `Mã kích hoạt bị thiếu hoặc sai thông tin. Liên hệ bên bán để cấp lại.` |
| `Invalid license encoding` / `Invalid license signature` | `Mã kích hoạt không đúng định dạng. Hãy dán lại toàn bộ mã, không thêm khoảng trắng.` |
| (clock errors, per Agent 18) | `Đồng hồ máy tính không khớp ngày thật. Chỉnh lại ngày giờ hệ thống rồi thử lại.` |

Also align the single generic blocking message Agent 18 flagged
(clock_error users currently get expired/revoked wording). Owner
approves wording; then the change is small and license-center-ui tests
must be extended, not weakened.

## 3. maintenance.js one-line prefix (proposal — coordinator)

`src/ui/maintenance.js:251`: `el('backup-result').textContent = '' + error.message;`
→ prefix like its siblings: `'Sao lưu thất bại: ' + error.message`.
Left unapplied: outside R18's applied-change scope (first-run flows).

## 4. For R5 (build assets) — from AUDIT-REPORT §E

- Replace package.json `author` `"Antigravity Senior Engineer"` with
  the owner's selling name (owner supplies the string).
- The in-app "Preview" disclosure is an owner decision (options in the
  report §E); options 2 and 3 both touch files outside R18's scope
  (package.json / appIdentity.js + index.html) — R18 applied none.
- When the owner answers UNINSTALL-DECISION.md, set
  `nsis.deleteAppDataOnUninstall` **explicitly** (one line) so the
  behaviour is a recorded decision, whichever way it goes.

## 5. Deliberately NOT done here

- Customer-guide SmartScreen wording (R7 owns the guide).
- Icon/installer assets (R5).
- Any `.github/workflows` or package.json edits.
- The per-Windows-user trial observation (report §F) is flagged for a
  licensing-policy decision; no code proposed.
