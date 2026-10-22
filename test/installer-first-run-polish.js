'use strict';
/* Installer / first-run polish tests (Agent R18, release-prep wave).
 * Tier: static wiring assertions + VM-executed hint behaviour with
 * stubbed DOM/API — NOT evidence about the packaged app (Section 23).
 * Covers Agent 16 proposal #10 applied in-branch: the Camoufox form
 * hint as static index.html markup (2a), a real create button inside
 * the empty state (2b), and the pinned-identity sentence in the static
 * engine note (2c), plus the renderer simplifications they allow. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const uiDir = path.join(__dirname, '../src/ui');
const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(uiDir, 'renderer.js'), 'utf8');

// --- 2a: the Camoufox form hint is static markup, exactly once ---
const hintAt = html.indexOf('id="camoufox-form-hint"');
assert.ok(hintAt > -1, 'index.html must carry the static #camoufox-form-hint element');
assert.equal(html.indexOf('id="camoufox-form-hint"', hintAt + 1), -1,
  '#camoufox-form-hint must appear exactly once');
assert.ok(html.slice(hintAt - 40, hintAt + 120).includes('role="status"'),
  'static hint keeps role="status"');
assert.ok(html.slice(hintAt, hintAt + 160).includes('hidden'),
  'static hint starts hidden, like the runtime-created element did');
const noteAt = html.indexOf('Đổi engine không mang theo phiên đăng nhập');
assert.ok(noteAt > -1 && hintAt > noteAt,
  'static hint sits after the static engine note, where the runtime element was appended');

// --- 2c: the static note states the pinned-identity outcome ---
assert.ok(html.includes('thử cấp một danh tính đã ghim bằng cơ chế chính thức của Camoufox'),
  'static engine note must mention the pinned-identity attempt');
assert.ok(html.includes('kết quả được thông báo ngay sau khi lưu'),
  'static engine note must say where the provisioning result appears');

// --- 2b: a real create button inside the empty state ---
const emptyAt = html.indexOf('id="empty-state"');
const btnAt = html.indexOf('id="empty-state-create"');
assert.ok(emptyAt > -1 && btnAt > emptyAt && btnAt < emptyAt + 700,
  'the create button must live inside #empty-state');
assert.ok(html.slice(btnAt, btnAt + 120).includes('Tạo hồ sơ đầu tiên'),
  'empty-state button label must name the first-profile action');

// --- renderer: hint is looked up, never created at runtime ---
assert.ok(renderer.includes("getElementById('camoufox-form-hint')"),
  'renderer must look the static hint up by id');
assert.ok(!renderer.includes("camoufoxHintEl.id = 'camoufox-form-hint'"),
  'renderer must not stamp the hint id onto a runtime-created element');
assert.ok(!renderer.includes('appendChild(camoufoxHintEl)'),
  'renderer must not append a runtime-created hint element');
assert.ok(renderer.includes('camoufoxInstallStatus()'),
  'the hint must still check live engine status');

// --- renderer: empty-state button wiring + per-state visibility ---
assert.ok(renderer.includes("getElementById('empty-state-create')?.addEventListener('click', () => btnCreateProfile.click())"),
  'empty-state button must trigger the same create flow as the toolbar button');
assert.ok(renderer.includes('emptyCreateBtn.hidden = allProfiles.length !== 0'),
  'the create button must hide in the filter-no-match state');
console.log('PASS installer polish wiring (static)');

// --- Behavioural: the extracted hint function against stubbed DOM/API ---
const fnStart = renderer.indexOf('async function updateCamoufoxFormHint()');
assert.ok(fnStart > -1, 'updateCamoufoxFormHint must exist');
const fnEnd = renderer.indexOf('\n}\n', fnStart);
assert.ok(fnEnd > fnStart, 'hint function body must be extractable');
const fnSource = renderer.slice(fnStart, fnEnd + 3);

async function runHint({ engine, status, elementPresent = true }) {
  const hintEl = { hidden: true, textContent: '' };
  let apiCalls = 0;
  const sandbox = {
    fieldBrowserEngine: { value: engine },
    document: {
      getElementById: id => (elementPresent && id === 'camoufox-form-hint' ? hintEl : null),
    },
    window: {
      api: {
        camoufoxInstallStatus: async () => {
          apiCalls += 1;
          if (status === 'throw') throw new Error('ipc down');
          return status;
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext('let camoufoxHintEl = null;\n' + fnSource, sandbox, { filename: 'hint.js' });
  await sandbox.updateCamoufoxFormHint();
  return { hintEl, apiCalls };
}

(async () => {
  // Non-Camoufox selection: hint hides and no status call is made.
  let r = await runHint({ engine: 'chromium', status: { alreadyInstalled: true } });
  assert.equal(r.hintEl.hidden, true, 'hint must stay hidden for Chromium');
  assert.equal(r.apiCalls, 0, 'no engine status call for non-Camoufox selections');

  // Installed + verified engine.
  r = await runHint({ engine: 'camoufox', status: { alreadyInstalled: true, available: true } });
  assert.equal(r.hintEl.hidden, false, 'hint must show for Camoufox');
  assert.ok(r.hintEl.textContent.includes('đã cài và xác minh trên máy này'),
    'installed state must be stated');

  // Signed build available but not installed.
  r = await runHint({ engine: 'camoufox', status: { alreadyInstalled: false, available: true } });
  assert.ok(r.hintEl.textContent.includes('Bạn vẫn tạo hồ sơ được ngay'),
    'available state must say the profile can still be created');

  // No verified engine anywhere.
  r = await runHint({ engine: 'camoufox', status: { alreadyInstalled: false, available: false } });
  assert.ok(r.hintEl.textContent.includes('chưa có engine Camoufox đã kiểm chứng'),
    'unavailable state must be stated honestly');

  // IPC failure degrades to a neutral message, never a crash.
  r = await runHint({ engine: 'camoufox', status: 'throw' });
  assert.ok(r.hintEl.textContent.includes('Không kiểm tra được tình trạng engine Camoufox'),
    'status failure must degrade to the neutral message');

  // Missing static element (older markup) is a silent no-op.
  r = await runHint({ engine: 'camoufox', status: { alreadyInstalled: true }, elementPresent: false });
  assert.equal(r.apiCalls, 0, 'missing element must short-circuit before any status call');

  console.log('PASS installer polish hint behaviour (VM)');
  console.log('installer-first-run-polish: all assertions passed');
})().catch(error => { console.error(error); process.exit(1); });
