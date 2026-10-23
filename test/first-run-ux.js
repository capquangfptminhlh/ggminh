'use strict';
/* First-run UX guidance tests (Agent 16, commercial wave).
 * Tier: static wiring assertions + VM-executed message builders with
 * stubbed DOM/API — NOT evidence about the packaged app (Section 23).
 * Covers: provisioning verdict surfaced after profile creation, the
 * per-row "Cấp danh tính" action wired to the existing IPC, the
 * first-run vs filtered-empty state split, Camoufox readiness hint in
 * the profile form, and the engine dialog's translated guidance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const uiDir = path.join(__dirname, '../src/ui');
const renderer = fs.readFileSync(path.join(uiDir, 'renderer.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(uiDir, 'engineSource.js'), 'utf8');
const profilePanel = fs.readFileSync(path.join(uiDir, 'profilePanel.js'), 'utf8');

// --- Static wiring ---
assert.ok(renderer.includes('provisioningSaveNotice(savedProfile)'),
  'save flow must surface the provisioning verdict for new profiles');
assert.ok(renderer.includes('window.api.provisionCamoufoxIdentity(profile.id)'),
  'row action must call the existing provision IPC');
assert.ok(renderer.includes('btn-provision') && renderer.includes('Cấp danh tính'),
  'profile rows must offer the provision action for unprovisioned Camoufox profiles');
assert.ok(renderer.includes('camoufox-form-hint') && renderer.includes('camoufoxInstallStatus()'),
  'profile form must show live Camoufox readiness when Camoufox is selected');
assert.ok(renderer.includes('Không có hồ sơ nào khớp'),
  'empty state must distinguish filter-no-match from a fresh install');
assert.ok(engineSource.includes('camoufoxRuntimeGuidance'),
  'engine dialog must translate raw runtime reasons into guidance');
assert.ok(profilePanel.includes("'Camoufox / Gecko'"),
  'detail panel must not mislabel Camoufox profiles as plain Firefox');
assert.ok(profilePanel.includes('Danh tính đã ghim'),
  'detail panel must expose the pinned-identity state');
console.log('PASS first-run wiring (static)');

// --- Behavioural: renderer message builders in a stubbed window ---
function makeElement() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
    checked: false, indeterminate: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, appendChild() {},
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}
const rendererWindow = { addEventListener() {} };
const rendererSandbox = {
  window: rendererWindow,
  document: {
    getElementById: () => makeElement(),
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    addEventListener() {},
  },
  console, setInterval: () => {}, alert: () => {},
};
vm.createContext(rendererSandbox);
// Renderer loads after profilePagination.js in the real Electron document.
// Execute that real browser helper in this sandbox too, rather than
// replacing it with a fake default or weakening the production dependency.
const paginationSource = fs.readFileSync(path.join(uiDir, 'profilePagination.js'), 'utf8');
vm.runInContext(paginationSource, rendererSandbox, { filename: 'profilePagination.js' });
assert.equal(rendererWindow.LHMProfilePagination.DEFAULT_SIZE, 50);
vm.runInContext(renderer, rendererSandbox, { filename: 'renderer.js' });
const guide = rendererWindow.LHMFirstRunGuide;
assert.ok(guide, 'renderer must expose LHMFirstRunGuide');

const fxProfile = (over = {}) => ({
  id: 'p1', name: 'Ads A', engine: 'gecko', engine_type: 'camoufox',
  fingerprint: { mode: 'native' }, ...over,
});
assert.equal(guide.provisioningSaveNotice({ engine_type: 'chromium', fingerprint: {} }), null,
  'non-Camoufox saves stay silent');
const okNotice = guide.provisioningSaveNotice(fxProfile({
  fingerprint: { mode: 'native', identityProvisioning: 'provisioned', identity: { format: 'x' } },
}));
assert.ok(okNotice.includes('cấp danh tính đã ghim'), 'provisioned notice states the pinned identity');
const unNotice = guide.provisioningSaveNotice(fxProfile({
  fingerprint: { mode: 'native', identityProvisioning: 'unavailable' },
}));
assert.ok(unNotice.includes('chưa cấp được danh tính đã ghim'), 'unavailable notice names the missing identity');
assert.ok(unNotice.includes('hộp thoại "Engine"'), 'unavailable notice points at the engine dialog');
assert.ok(unNotice.includes('"Cấp danh tính"'), 'unavailable notice names the follow-up action');
const invNotice = guide.provisioningSaveNotice(fxProfile({
  fingerprint: { mode: 'native', identityProvisioning: 'invalid' },
}));
assert.ok(invNotice.includes('không qua được kiểm chứng'), 'invalid notice explains the rejection');
for (const text of [okNotice, unNotice, invNotice]) {
  assert.ok(!/100\s?%/.test(text), 'no unmeasured percentages in guidance copy');
  assert.ok(!text.includes('bảo đảm'), 'no guarantee wording in guidance copy');
}
const actOk = guide.provisioningActionMessage(fxProfile(), { status: 'provisioned' });
assert.ok(actOk.startsWith('Đã cấp và ghim danh tính'), 'provision action confirms success');
const actFail = guide.provisioningActionMessage(fxProfile(),
  { status: 'unavailable', reason: 'engine-not-installed-or-unverified' });
assert.ok(actFail.startsWith('Không cấp được danh tính'), 'provision failure follows the standard pattern');
assert.ok(actFail.includes('chưa qua kiểm chứng'), 'provision failure explains the engine cause');
assert.ok(actFail.includes('hộp thoại "Engine"'), 'provision failure gives a next step');
assert.equal(guide.identityMetaText(fxProfile({
  fingerprint: { identity: { format: 'x' } } })), 'Danh tính đã ghim');
assert.equal(guide.identityMetaText(fxProfile()), 'Chưa cấp danh tính đã ghim');
assert.equal(guide.identityMetaText({ engine: 'chromium', fingerprint: { mode: 'native' } }),
  'Thông số trình duyệt gốc');
assert.equal(guide.identityMetaText({ engine: 'chromium', fingerprint: { mode: 'experimental' } }),
  'Cấu hình tùy chỉnh');
console.log('PASS first-run provisioning guidance (behavioural)');

// --- Behavioural: engine dialog guidance in a stubbed window ---
const engineElements = {};
function engineElement(id) {
  if (!engineElements[id]) {
    engineElements[id] = {
      disabled: false, hidden: false, textContent: '', value: '',
      classList: { add() {}, remove() {} }, _listeners: {},
      addEventListener(ev, fn) { this._listeners[ev] = fn; },
      async click() { if (this._listeners.click) await this._listeners.click(); },
    };
  }
  return engineElements[id];
}
let installStatus = null;
let domReady = null;
const engineWindow = {
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domReady = fn; },
  confirm: () => true,
  api: {
    bundledEngineStatus: async () => ({
      source: 'system', geckoProvider: 'firefox',
      bundle: { valid: true, version: '5.8.0', fileCount: 3, sha256: 'a'.repeat(64) },
      camoufox: { ready: false },
    }),
    camoufoxInstallStatus: async () => installStatus,
  },
};
const engineSandbox = {
  window: engineWindow,
  document: { getElementById: engineElement },
  console,
};
vm.createContext(engineSandbox);
vm.runInContext(engineSource, engineSandbox, { filename: 'engineSource.js' });
assert.equal(typeof domReady, 'function', 'engine dialog registers its init');
domReady();
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

(async () => {
  installStatus = {
    available: false, alreadyInstalled: false,
    runtime: { ready: false, reason: 'Separately publisher-signed Camoufox EXE not available' },
  };
  await engineElement('btn-engine-source').click();
  await flush();
  const notReadyText = engineElement('camoufox-install-info').textContent;
  assert.ok(notReadyText.includes('chưa có bản Camoufox được LHM ký riêng'),
    'raw English runtime reason must be translated, got: ' + notReadyText);
  assert.ok(notReadyText.includes('liên hệ'), 'not-ready guidance must give a next step');

  installStatus = { available: false, alreadyInstalled: true, runtime: { ready: true } };
  await engineElement('engine-source-refresh').click();
  await flush();
  assert.ok(engineElement('camoufox-install-info').textContent.includes('tạo hồ sơ Camoufox'),
    'installed state must tell the user they can create Camoufox profiles now');

  installStatus = { available: true, version: '156.0.1', alreadyInstalled: false, runtime: { ready: true } };
  await engineElement('engine-source-refresh').click();
  await flush();
  assert.ok(engineElement('camoufox-install-info').textContent.includes('Bấm nút cài đặt bên dưới'),
    'available state must point at the install button');
  console.log('PASS engine dialog guidance (behavioural)');
  console.log('first-run-ux: all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
