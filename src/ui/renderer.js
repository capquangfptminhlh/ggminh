// State
let allProfiles = [];
let activeBrowserMap = new Map(); // profileId -> info
let currentGeneratedFP = null;
let apiEnabled = false;
let behaviorAlertsSeen = new Set();
let behaviorInitialized = false;
const selectedProfileIds = new Set();
window.LHMProfileContextData = () => ({profiles:allProfiles,activeIds:[...activeBrowserMap.keys()]});
window.LHMProfileSelection = {
  getSelected: () => [...selectedProfileIds],
  clear: () => { selectedProfileIds.clear(); renderProfiles(); },
  refresh: () => renderProfiles()
};

// Elements
const profileListBody = document.getElementById('profile-list-body');
const emptyState = document.getElementById('empty-state');
const statTotal = document.getElementById('stat-total');
const statActive = document.getElementById('stat-active');
const searchInput = document.getElementById('search-input');
const filterGroup = document.getElementById('filter-group');
const filterTag = document.getElementById('filter-tag');
const filterEngine = document.getElementById('filter-engine');
const filterProxy = document.getElementById('filter-proxy');
const filterStatus = document.getElementById('filter-status');
const btnRefresh = document.getElementById('btn-refresh');

// Modals
const modalProfile = document.getElementById('modal-profile');
const modalRPA = document.getElementById('modal-rpa');
const btnCreateProfile = document.getElementById('btn-create-profile');
const btnOpenRPA = document.getElementById('btn-open-rpa');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnCloseRPA = document.getElementById('btn-close-rpa');
const btnSaveProfile = document.getElementById('btn-save-profile');

// Form Elements
const fieldId = document.getElementById('field-id');
const fieldBrowserEngine = document.getElementById('field-browser-engine');
const fieldGeckoPath = document.getElementById('field-gecko-path');
const geckoPathControl = document.getElementById('gecko-path-control');
const fieldName = document.getElementById('field-name');
const fieldGroup = document.getElementById('field-group');
const fieldStartUrl = document.getElementById('field-starturl');
const fieldTags = document.getElementById('field-tags');
const fieldNotes = document.getElementById('field-notes');
const fieldProxyType = document.getElementById('field-proxy-type');
const proxyFields = document.getElementById('proxy-fields');
const fieldProxyHost = document.getElementById('field-proxy-host');
const fieldProxyPort = document.getElementById('field-proxy-port');
const fieldProxyUser = document.getElementById('field-proxy-user');
const fieldProxyPass = document.getElementById('field-proxy-pass');
const btnTestProxy = document.getElementById('btn-test-proxy');
const proxyTestResult = document.getElementById('proxy-test-result');

// Fingerprint fields
const btnRandomFP = document.getElementById('btn-random-fp');
const fieldFpOs = document.getElementById('field-fp-os');
const fieldFpScreen = document.getElementById('field-fp-screen');
const fieldFpCores = document.getElementById('field-fp-cores');
const fieldFpMemory = document.getElementById('field-fp-memory');
const fieldFpGpu = document.getElementById('field-fp-gpu');
const fieldFpUa = document.getElementById('field-fp-ua');
const fieldFpMode = document.getElementById('field-fp-mode');
const fpCustomFields = document.getElementById('fingerprint-custom-fields');
const fpAuditResults = document.getElementById('fp-audit-results');
const fieldFpCanvas = document.getElementById('field-fp-canvas');
const fieldFpAudio = document.getElementById('field-fp-audio');
const fieldFpWebrtc = document.getElementById('field-fp-webrtc');
const fpCamoufoxSettings = document.getElementById('fp-camoufox-settings');
const fieldFpLocale = document.getElementById('field-fp-locale');
const fieldFpTimezone = document.getElementById('field-fp-timezone');
const fpIdentityLockStatus = document.getElementById('fp-identity-lock-status');
const fpEngineDescription = document.getElementById('fp-setup-engine-desc');
const fpEngineTag = document.getElementById('fp-setup-engine-tag');

// First-run guidance for Camoufox identity provisioning. The main process
// records the provisioning outcome on the saved profile
// (fingerprint.identityProvisioning); these helpers turn that stored
// status into an explanation plus a concrete next step, instead of the
// save dialog closing silently (the pre-existing behaviour).
function provisioningReasonText(reason) {
  switch (reason) {
    case 'engine-not-installed-or-unverified':
      return 'engine Camoufox chưa được cài đặt hoặc chưa qua kiểm chứng trên máy này';
    case 'generator-package-missing':
      return 'thành phần sinh danh tính chưa sẵn sàng trong bản cài đặt này';
    case 'no-verified-engine-resolver':
      return 'ứng dụng chưa sẵn sàng kiểm chứng engine Camoufox';
    case 'generator-failed':
      return 'quá trình sinh danh tính gặp lỗi';
    case 'generated-identity-failed-validation':
      return 'bộ danh tính sinh ra không qua được kiểm chứng nội bộ';
    case 'generated-identity-contradicts-profile':
      return 'bộ danh tính sinh ra mâu thuẫn với cấu hình của hồ sơ';
    default:
      return 'máy này chưa đủ điều kiện để cấp danh tính';
  }
}
function provisioningSaveNotice(saved) {
  if (!saved || saved.engine_type !== 'camoufox') return null;
  const status = saved.fingerprint?.identityProvisioning;
  if (status === 'provisioned') return 'Đã tạo hồ sơ Camoufox "' + saved.name + '" và cấp danh tính đã ghim: ' +
    'một bộ thông số nhất quán (User-Agent, nền tảng, ngôn ngữ, múi giờ, màn hình) sinh bằng cơ chế ' +
    'chính thức của Camoufox. Hồ sơ sẽ dùng đúng bộ danh tính này ở các lần mở sau.';
  if (status === 'unavailable') return 'Đã tạo hồ sơ Camoufox "' + saved.name + '" nhưng chưa cấp được ' +
    'danh tính đã ghim: ' + provisioningReasonText(saved.fingerprint?.identityProvisioningReason) + '. ' +
    'Hồ sơ vẫn chạy bằng thông số gốc của engine, chưa có bộ danh tính riêng được ghim.\n' +
    'Việc bạn có thể làm: mở hộp thoại "Engine" trên thanh công cụ để cài và kiểm chứng Camoufox, ' +
    'sau đó bấm "Cấp danh tính" ngay tại hàng của hồ sơ này trong bảng hồ sơ. Nếu đã cài engine mà vẫn ' +
    'chưa cấp được, hãy liên hệ bên bán để kiểm tra tình trạng engine.';
  if (status === 'invalid') return 'Đã tạo hồ sơ Camoufox "' + saved.name + '" nhưng bộ danh tính vừa sinh ' +
    'không qua được kiểm chứng (' + provisioningReasonText(saved.fingerprint?.identityProvisioningReason) + ') ' +
    'nên ứng dụng không gắn vào hồ sơ; hồ sơ chạy bằng thông số gốc.\n' +
    'Việc bạn có thể làm: bấm "Cấp danh tính" tại hàng của hồ sơ để thử lại. Nếu tình trạng lặp lại, ' +
    'hãy liên hệ bên bán kèm theo thông báo này.';
  return null;
}
function provisioningActionMessage(profile, result) {
  const status = result?.status;
  if (status === 'provisioned') return 'Đã cấp và ghim danh tính cho hồ sơ "' + profile.name + '". ' +
    'Các lần mở sau sẽ dùng đúng bộ danh tính này.';
  if (status === 'already-present') return 'Hồ sơ "' + profile.name + '" đã có danh tính đã ghim.';
  if (status === 'invalid') return 'Không cấp được danh tính cho hồ sơ "' + profile.name + '": bộ danh tính ' +
    'sinh ra không qua được kiểm chứng nên không được gắn.\n' +
    'Hãy thử lại sau; nếu tình trạng lặp lại, hãy liên hệ bên bán kèm theo thông báo này.';
  return 'Không cấp được danh tính cho hồ sơ "' + profile.name + '": ' +
    provisioningReasonText(result?.reason) + '.\n' +
    'Mở hộp thoại "Engine" trên thanh công cụ để cài và kiểm chứng Camoufox, rồi bấm "Cấp danh tính" thử lại.';
}
function identityMetaText(profile) {
  const fp = profile.fingerprint || {};
  if (profile.engine_type === 'camoufox') {
    if (fp.identity) return 'Danh tính đã ghim';
    if (fp.identityProvisioning === 'invalid') return 'Danh tính sinh ra không hợp lệ — chưa gắn' +
      (fp.identityProvisioningReason ? ' (' + provisioningReasonText(fp.identityProvisioningReason) + ')' : '');
    return 'Chưa cấp danh tính đã ghim';
  }
  return fp.mode === 'native' || profile.engine === 'gecko' ? 'Thông số trình duyệt gốc' : 'Cấu hình tùy chỉnh';
}
window.LHMFirstRunGuide = { provisioningSaveNotice, provisioningActionMessage, provisioningReasonText, identityMetaText };

// Live Camoufox readiness hint inside the profile form. The static note
// under the engine select cannot say whether THIS machine already has a
// verified engine; this hint fills that gap when Camoufox is selected.
// The element itself is static markup in index.html (#camoufox-form-hint,
// Agent 16 proposal 2a, applied by Agent R18); this function only fills it.
let camoufoxHintEl = null;
async function updateCamoufoxFormHint() {
  if (!fieldBrowserEngine) return;
  if (!camoufoxHintEl) camoufoxHintEl = document.getElementById('camoufox-form-hint');
  if (!camoufoxHintEl) return;
  if (fieldBrowserEngine.value !== 'camoufox') { camoufoxHintEl.hidden = true; return; }
  camoufoxHintEl.hidden = false;
  camoufoxHintEl.textContent = 'Đang kiểm tra tình trạng engine Camoufox trên máy này…';
  try {
    const availability = await window.api.camoufoxInstallStatus();
    if (fieldBrowserEngine.value !== 'camoufox') return; // selection changed meanwhile
    camoufoxHintEl.textContent = availability.alreadyInstalled
      ? 'Engine Camoufox đã cài và xác minh trên máy này: khi lưu hồ sơ, ứng dụng sẽ thử cấp một danh tính đã ghim cho hồ sơ.'
      : availability.available
        ? 'Máy này chưa cài Camoufox nhưng đã có bản được LHM ký để cài. Bạn vẫn tạo hồ sơ được ngay (chưa có danh tính đã ghim), hoặc mở hộp thoại "Engine" để cài trước rồi tạo hồ sơ sau.'
        : 'Máy này chưa có engine Camoufox đã kiểm chứng: hồ sơ vẫn được tạo và chạy bằng thông số gốc, nhưng chưa cấp được danh tính đã ghim. Mở hộp thoại "Engine" để kiểm tra khả năng cài đặt, hoặc liên hệ bên bán nếu chưa có bản phát hành đã ký.';
  } catch (_) {
    camoufoxHintEl.textContent = 'Không kiểm tra được tình trạng engine Camoufox. Hồ sơ vẫn tạo được; kết quả cấp danh tính sẽ được thông báo sau khi lưu.';
  }
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadProfiles();
  await refreshApiStatus();
  await refreshBehaviorAlerts();
  startStatusPoller();
  setInterval(() => refreshBehaviorAlerts().catch(console.error), 5000);
});

function setupTabs() {
  document.querySelectorAll('.tabs').forEach(tabContainer => {
    const btns = tabContainer.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const parent = tabContainer.parentElement;
        const targetId = btn.getAttribute('data-tab');
        parent.querySelectorAll('.tab-content').forEach(content => {
          content.classList.toggle('active', content.id === targetId);
        });
      });
    });
  });
}

async function refreshApiStatus() {
  const state = await window.api.getApiStatus();
  apiEnabled = state.enabled;
  document.getElementById('stat-api').textContent = state.enabled ? '127.0.0.1:' + state.port : 'Đang tắt';
  document.getElementById('btn-api-toggle').textContent = state.enabled ? 'API: Bật' : 'API: Tắt';
  document.getElementById('btn-api-copy').style.display = state.enabled ? '' : 'none';
}

const behaviorActions = {
  profile_open: 'Mở hồ sơ',
  profile_close: 'Đóng hồ sơ',
  profile_save: 'Lưu hồ sơ',
  profile_delete: 'Xóa hồ sơ'
};
function behaviorDate(at) {
  return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function renderBehaviorRows(containerId, data, builder) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('p');
    empty.className = 'behavior-empty';
    empty.textContent = containerId === 'behavior-alert-list' ? 'Chưa phát hiện thao tác lặp vượt ngưỡng.' : 'Chưa ghi nhận hoạt động.';
    container.appendChild(empty);
    return;
  }
  for (const item of data) container.appendChild(builder(item));
}
function makeBehaviorAlert(alertItem) {
  const row = document.createElement('div');
  row.className = 'behavior-alert-item ' + (alertItem.level === 'high' ? 'is-high' : 'is-medium');
  const title = document.createElement('strong');
  title.textContent = (alertItem.level === 'high' ? 'Cần kiểm tra' : 'Chú ý') +
    ' · ' + alertItem.count + ' lần / 10 phút';
  const detail = document.createElement('p');
  detail.textContent = alertItem.message;
  const meta = document.createElement('small');
  meta.textContent = (alertItem.profileId || 'Tất cả hồ sơ') + ' · ' + behaviorDate(alertItem.latestAt);
  row.append(title, detail, meta);
  return row;
}
function makeBehaviorEvent(event) {
  const row = document.createElement('div');
  row.className = 'behavior-event-item';
  const action = document.createElement('span');
  action.textContent = behaviorActions[event.action] || 'Thao tác';
  const meta = document.createElement('small');
  meta.textContent = event.profileId + ' · ' + (event.source === 'api' ? 'Local API' : 'Thủ công') + ' · ' + behaviorDate(event.at);
  row.append(action, meta);
  return row;
}
async function refreshBehaviorAlerts() {
  const report = await window.api.getBehaviorReport();
  const trigger = document.getElementById('btn-behavior-alert');
  const counter = document.getElementById('behavior-alert-count');
  counter.textContent = String(report.alertCount);
  counter.hidden = report.alertCount === 0;
  trigger.classList.toggle('has-warning', report.alertCount > 0);
  document.getElementById('behavior-level').textContent =
    report.level === 'high' ? 'Cần kiểm tra' : report.level === 'medium' ? 'Chú ý' : 'Chưa vượt ngưỡng';
  document.getElementById('behavior-activities').textContent = String(report.activities10m);
  document.getElementById('behavior-profiles').textContent = String(report.profileCount10m);
  renderBehaviorRows('behavior-alert-list', report.alerts, makeBehaviorAlert);
  renderBehaviorRows('behavior-event-list', report.recentEvents.slice(0, 20), makeBehaviorEvent);

  const current = new Set(report.alerts.map(a => a.code + ':' + a.profileId + ':' + a.latestAt));
  if (behaviorInitialized && report.alertCount > 0 &&
      report.alerts.some(a => !behaviorAlertsSeen.has(a.code + ':' + a.profileId + ':' + a.latestAt))) {
    const notice = document.getElementById('behavior-inline-notice');
    notice.textContent = 'Có thao tác lặp lại bất thường trong phần mềm. Mở “Cảnh báo hành vi” để kiểm tra.';
    notice.hidden = false;
  }
  behaviorInitialized = true;
  behaviorAlertsSeen = current;
}

function setupEventListeners() {
  fieldFpMode.addEventListener('change', () => {
    const native = fieldFpMode.value === 'native';
    setFingerprintMode(native ? 'native' : 'experimental');
    if (native) currentGeneratedFP = { mode: 'native' };
    else window.api.generateFingerprint({ os: fieldFpOs.value }).then(applyFingerprintToForm).catch(console.error);
    refreshFingerprintSetup();
    fpAuditResults.textContent = 'Cấu hình đã thay đổi. Nhấn Kiểm tra cấu hình để xem cảnh báo.';
  });
  for (const select of [fieldFpLocale, fieldFpTimezone]) {
    select.addEventListener('change', () => {
      refreshFingerprintSetup();
      fpAuditResults.textContent = 'Cấu hình khai báo đã đổi. Lưu hồ sơ rồi kiểm tra engine thực tế trên máy.';
    });
  }
  document.getElementById('btn-fp-inspect').addEventListener('click', async () => {
    fpAuditResults.textContent = 'Đang chẩn đoán...';
    try {
      const audit = await window.api.inspectFingerprint({
        engine:fieldBrowserEngine.value==='chromium'?'chromium':'gecko',
        fingerprint:selectedFingerprintConfig()
      });
      fpAuditResults.replaceChildren();
      const title = document.createElement('div');
      title.className = 'fp-audit-summary';
      title.textContent = audit.mode === 'native'
        ? 'Thông số gốc — không cần giả lập UA/Canvas'
        : 'Tùy chỉnh thử nghiệm — ' + audit.warningCount + ' cảnh báo';
      fpAuditResults.append(title);
      for (const issue of audit.issues) {
        const row = document.createElement('div');
        row.className = 'fp-audit-item ' + issue.level;
        row.textContent = (issue.level === 'warning' ? '' : '') + issue.message;
        fpAuditResults.append(row);
      }
      const footer = document.createElement('p');
      footer.textContent = audit.explanation;
      fpAuditResults.append(footer);
      if (fieldBrowserEngine.value === 'camoufox') {
        const note = document.createElement('p');
        note.textContent = 'Ngôn ngữ/múi giờ là yêu cầu gửi đến bộ sinh Camoufox, không phải đo thực tế; việc cấp danh tính và khả năng khớp chỉ được xác nhận sau khi có engine đã ký và bước kiểm chứng thành công.';
        fpAuditResults.append(note);
      }
    } catch (error) { fpAuditResults.textContent = 'Kiểm tra thất bại: ' + error.message; }
  });
  fieldBrowserEngine.addEventListener('change', () => {
    const gecko = fieldBrowserEngine.value !== 'chromium';
    geckoPathControl.hidden = fieldBrowserEngine.value !== 'gecko';
    if (gecko) setFingerprintMode('native');
    fieldFpMode.disabled = gecko;
    refreshFingerprintSetup();
    updateCamoufoxFormHint();
  });
  document.getElementById('btn-behavior-alert').addEventListener('click', async () => {
    await refreshBehaviorAlerts();
    document.getElementById('behavior-inline-notice').hidden = true;
    openModal(document.getElementById('modal-behavior'));
  });
  document.getElementById('btn-close-behavior').addEventListener('click', () =>
    closeModal(document.getElementById('modal-behavior')));
  document.getElementById('btn-behavior-done').addEventListener('click', () =>
    closeModal(document.getElementById('modal-behavior')));
  document.getElementById('btn-refresh-behavior').addEventListener('click', refreshBehaviorAlerts);

  document.getElementById('btn-api-toggle').addEventListener('click', async () => {
    try {
      await window.api.setApiEnabled(!apiEnabled);
      await refreshApiStatus();
      alert(apiEnabled ? 'Đã bật API chỉ trên máy này. Dùng nút Sao chép API Key để kết nối.' : 'Local API đã tắt.');
    } catch (error) { alert('Không thể thay đổi API: ' + error.message); }
  });
  document.getElementById('btn-api-copy').addEventListener('click', async () => {
    try { await window.api.copyApiKey(); alert('Đã sao chép API Key vào clipboard. Không chia sẻ với người khác.'); }
    catch (error) { alert('Không sao chép được API Key: ' + error.message + '\nKiểm tra Local API đang bật rồi thử lại.'); }
  });
  // Proxy Type Toggle
  fieldProxyType.addEventListener('change', () => {
    proxyFields.style.display = fieldProxyType.value === 'direct' ? 'none' : 'block';
  });

  // Modal Open / Close
  btnCreateProfile.addEventListener('click', () => openProfileModal());
  document.getElementById('empty-state-create')?.addEventListener('click', () => btnCreateProfile.click());
  const bulkModal = document.getElementById('modal-bulk-create');
  const bulkButton = document.getElementById('btn-bulk-create');
  const bulkSubmit = document.getElementById('bulk-create-submit');
  bulkButton.addEventListener('click', () => openModal(bulkModal));
  for (const id of ['bulk-create-close','bulk-create-cancel'])
    document.getElementById(id).addEventListener('click', () => closeModal(bulkModal));
  bulkSubmit.addEventListener('click', async () => {
    bulkSubmit.disabled = true;
    try {
      const response = await window.api.bulkCreateProfiles({
        namePrefix: document.getElementById('bulk-create-prefix').value,
        count: Number(document.getElementById('bulk-create-count').value),
        group: document.getElementById('bulk-create-group').value,
        engine: document.getElementById('bulk-create-engine').value,
        startUrls: parseStartupUrls(document.getElementById('bulk-create-urls').value),
        tags: parseTags(document.getElementById('bulk-create-tags').value)
      });
      closeModal(bulkModal);
      await loadProfiles();
      alert('Đã tạo ' + response.count + ' hồ sơ mới, có phiên độc lập.');
    } catch (error) { alert('Không thể tạo nhanh: ' + error.message); }
    finally { bulkSubmit.disabled = false; }
  });
  btnCloseModal.addEventListener('click', () => closeModal(modalProfile));
  btnCancelModal.addEventListener('click', () => closeModal(modalProfile));

  btnOpenRPA.addEventListener('click', () => openModal(modalRPA));
  btnCloseRPA.addEventListener('click', () => closeModal(modalRPA));

  // Randomize Fingerprint
  btnRandomFP.addEventListener('click', async () => {
    const os = fieldFpOs.value;
    const fp = await window.api.generateFingerprint({ os });
    applyFingerprintToForm(fp);
  });

  // Test Proxy
  btnTestProxy.addEventListener('click', async () => {
    proxyTestResult.textContent = 'Đang kiểm tra kết nối...';
    proxyTestResult.className = 'test-result';
    const proxyConfig = {
      type: fieldProxyType.value,
      host: fieldProxyHost.value.trim(),
      port: fieldProxyPort.value.trim(),
      user: fieldProxyUser.value.trim(),
      pass: fieldProxyPass.value.trim()
    };
    const res = await window.api.checkProxy(proxyConfig);
    if (['success', 'verified', 'warning'].includes(res.status)) {
      proxyTestResult.className = res.status === 'warning' ? 'test-result error' : 'test-result success';
      proxyTestResult.textContent = res.status === 'warning' ? `${res.message} IP: ${res.ip}` : res.status === 'verified' ? `${res.message} Proxy IP: ${res.ip}${res.directIp ? ' | IP máy: ' + res.directIp : ''} (${res.latency}ms)` : `IP trực tiếp: ${res.ip} (${res.latency}ms)`;
    } else {
      proxyTestResult.className = 'test-result error';
      proxyTestResult.textContent = `Lỗi: ${res.message}`;
    }
  });

  // Save Profile
  btnSaveProfile.addEventListener('click', async () => {
    const name = fieldName.value.trim();
    if (!name) {
      alert('Vui lòng nhập tên Profile');
      return;
    }

    const [scrW, scrH] = fieldFpScreen.value.split('x').map(Number);
    const profile = {
      id: fieldId.value || undefined,
      name,
      engine:fieldBrowserEngine.value==='chromium'?'chromium':'gecko',
      engine_type:fieldBrowserEngine.value==='gecko'?'firefox':fieldBrowserEngine.value,
      group: fieldGroup.value.trim() || 'Default',
      startUrls: parseStartupUrls(fieldStartUrl.value),
      tags: parseTags(fieldTags.value),
      notes: fieldNotes.value.trim(),
      proxy: {
        type: fieldProxyType.value,
        host: fieldProxyHost.value.trim(),
        port: fieldProxyPort.value.trim(),
        user: fieldProxyUser.value.trim(),
        pass: fieldProxyPass.value.trim()
      },
      fingerprint: selectedFingerprintConfig()
    };

    const isCreate = !fieldId.value;
    let savedProfile = null;
    try {
      if (fieldBrowserEngine.value === 'gecko' && fieldGeckoPath.value.trim()) {
        await window.api.saveSettings({ geckoPath: fieldGeckoPath.value.trim() });
      }
      savedProfile = await window.api.saveProfile(profile);
    }
    catch (error) { alert('Không lưu được hồ sơ: ' + error.message); return; }
    closeModal(modalProfile);
    await loadProfiles();
    await refreshBehaviorAlerts();
    // A new Camoufox profile always gets a provisioning verdict; surface
    // it instead of closing silently (see LHMFirstRunGuide above).
    if (isCreate) {
      const notice = provisioningSaveNotice(savedProfile);
      if (notice) alert(notice);
    }
  });

  // Select all currently visible (filtered) profiles.
  document.getElementById('select-all').addEventListener('change', event => {
    const boxes = [...profileListBody.querySelectorAll('input[type="checkbox"][data-id]')];
    for (const input of boxes) {
      if (event.target.checked) selectedProfileIds.add(input.dataset.id);
      else selectedProfileIds.delete(input.dataset.id);
      input.checked = event.target.checked;
    }
    window.LHMControlTower?.updateSelection();
  });

  // Search & Filter
  searchInput.addEventListener('input', renderProfiles);
  filterGroup.addEventListener('change', renderProfiles);
  filterTag.addEventListener('change', renderProfiles);
  filterEngine.addEventListener('change', renderProfiles);
  filterProxy.addEventListener('change', renderProfiles);
  filterStatus.addEventListener('change', renderProfiles);
  btnRefresh.addEventListener('click', loadProfiles);
}

function openModal(modal) {
  modal.classList.add('open');
}

function closeModal(modal) {
  modal.classList.remove('open');
}

async function openProfileModal(existingProfile = null) {
  proxyTestResult.textContent = '';
  const settings = await window.api.getSettings();
  fieldGeckoPath.value = settings.geckoPath || '';
  if (existingProfile) {
    document.getElementById('modal-title').textContent = 'Chỉnh sửa Profile';
    fieldId.value = existingProfile.id;
    fieldBrowserEngine.value=(existingProfile.engine_type==='camoufox'||
      !existingProfile.engine_type&&existingProfile.engine==='gecko'&&
      settings.geckoProvider==='camoufox')?
      'camoufox':existingProfile.engine==='gecko'?'gecko':'chromium';
    fieldName.value = existingProfile.name;
    fieldGroup.value = existingProfile.group || 'Default';
    fieldStartUrl.value = (existingProfile.startUrls || [existingProfile.startUrl || 'https://ads.google.com/']).join('\n');
    fieldTags.value = (existingProfile.tags || []).join(', ');
    fieldNotes.value = existingProfile.notes || '';

    const pxy = existingProfile.proxy || {};
    fieldProxyType.value = pxy.type || 'direct';
    fieldProxyHost.value = pxy.host || '';
    fieldProxyPort.value = pxy.port || '';
    fieldProxyUser.value = pxy.user || '';
    fieldProxyPass.value = pxy.pass || '';
    proxyFields.style.display = fieldProxyType.value === 'direct' ? 'none' : 'block';

    currentGeneratedFP = existingProfile.fingerprint || { mode: 'native' };
    if (currentGeneratedFP.mode !== 'native') applyFingerprintToForm(currentGeneratedFP);
    fieldFpLocale.value = currentGeneratedFP.language || currentGeneratedFP.languages?.[0] || '';
    if (!fieldFpLocale.value) fieldFpLocale.value = '';
    fieldFpTimezone.value = currentGeneratedFP.timezone || '';
    if (!fieldFpTimezone.value) fieldFpTimezone.value = '';
    setFingerprintMode(currentGeneratedFP.mode === 'native' ? 'native' : 'experimental');
  } else {
    document.getElementById('modal-title').textContent = 'Tạo Profile Mới';
    fieldId.value = '';
    fieldBrowserEngine.value = 'chromium';
    fieldName.value = `Profile_${allProfiles.length + 1}`;
    fieldGroup.value = 'Default';
    fieldStartUrl.value = 'https://ads.google.com/';
    fieldTags.value = '';
    fieldNotes.value = '';
    fieldProxyType.value = 'direct';
    proxyFields.style.display = 'none';

    currentGeneratedFP = { mode: 'native' };
    fieldFpLocale.value = '';
    fieldFpTimezone.value = '';
    setFingerprintMode('native');
  }
  geckoPathControl.hidden = fieldBrowserEngine.value !== 'gecko';
  fieldFpMode.disabled = fieldBrowserEngine.value !== 'chromium';
  refreshFingerprintSetup();
  await window.LHMProxyCenter?.refreshPresets(existingProfile?.proxy || null);
  updateCamoufoxFormHint();
  openModal(modalProfile);
}

function parseStartupUrls(value) {
  return value.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
}
function parseTags(value) {
  return value.split(',').map(tag => tag.trim()).filter(Boolean);
}

function refreshFingerprintSetup() {
  const engine = fieldBrowserEngine.value;
  const isCamoufox = engine === 'camoufox';
  const isFirefox = engine === 'gecko';
  const isChromium = engine === 'chromium';
  const legacy = isChromium && fieldFpMode.value === 'experimental';
  const pinned = isCamoufox && !!fieldId.value && !!currentGeneratedFP?.identity;

  fpCamoufoxSettings.hidden = !isCamoufox;
  fpCustomFields.hidden = !legacy;
  fieldFpLocale.disabled = pinned;
  fieldFpTimezone.disabled = pinned;
  fpIdentityLockStatus.classList.toggle('is-locked', pinned);
  fpIdentityLockStatus.textContent = pinned
    ? 'Danh tính đã ghim: ngôn ngữ/múi giờ không thể đổi trên hồ sơ này. Để sử dụng bộ danh tính khác, hãy tạo hồ sơ mới.'
    : 'Các lựa chọn sẽ được chuyển đến bộ sinh Camoufox khi tạo hồ sơ. Nếu thiếu engine đã được ký hoặc bộ sinh không đạt, ứng dụng ghi rõ CHƯA CẤP; không giả làm đã áp dụng.';

  const textByEngine = isCamoufox
    ? 'Camoufox: thiết lập ngôn ngữ và múi giờ trước khi cấp danh tính bằng bộ sinh chính thức. Các đặc điểm khác không thể gõ tùy ý.'
    : isFirefox
      ? 'Firefox hệ thống: sử dụng thuộc tính trình duyệt và thiết bị thực; trình chỉnh sửa vân tay không áp dụng cho engine này.'
      : legacy
        ? 'Chromium thử nghiệm: có các thông số mở rộng bên dưới; extension can thiệp có thể gây sai lệch, không bảo đảm nhất quán hoặc không bị nhận diện.'
        : 'Chrome/Edge hệ thống: dùng thông số thực, không thay User-Agent, Canvas, WebGL hoặc thông tin CPU/RAM bằng extension.';
  fpEngineDescription.textContent = textByEngine;
  fpEngineTag.textContent = isCamoufox ? (pinned ? 'Đã ghim' : 'Tạo bằng engine') :
    isFirefox ? 'Native Gecko' : legacy ? 'Thử nghiệm' : 'Native Chromium';

  const statusById = {
    'fp-cap-ua': isCamoufox ? 'Bộ sinh chính thức' : legacy ? 'Thử nghiệm' : 'Theo engine',
    'fp-cap-locale': isCamoufox ? (pinned ? 'Đã khóa' : 'Có lựa chọn') : legacy ? 'Chưa đồng bộ' : 'Theo hệ thống',
    'fp-cap-device': isCamoufox ? 'Đồng bộ theo danh tính' : legacy ? 'Thử nghiệm' : 'Thiết bị thật',
    'fp-cap-render': isCamoufox ? 'Theo Camoufox' : legacy ? 'Thử nghiệm' : 'Theo engine',
    'fp-cap-network': 'Phải đo riêng',
    'fp-cap-pin': pinned ? 'Đã ghim · chưa đo' : isCamoufox ? 'Chưa cấp danh tính' : 'Phụ thuộc engine'
  };
  for (const [id, value] of Object.entries(statusById))
    document.getElementById(id).textContent = value;
  document.getElementById('fp-preview-engine').textContent = isCamoufox ? 'Camoufox / Native' :
    isFirefox ? 'Firefox / Native' : legacy ? 'Chromium / Thử nghiệm' : 'Chromium / Native';
  document.getElementById('fp-preview-language').textContent = isCamoufox
    ? (pinned ? currentGeneratedFP.identity.expectations?.language || 'Không ghi nhận'
      : fieldFpLocale.selectedOptions[0]?.textContent || 'Tự động')
    : legacy ? (currentGeneratedFP?.languages?.[0] || 'Chưa xác nhận')
      : 'Theo trình duyệt';
  document.getElementById('fp-preview-timezone').textContent = isCamoufox
    ? (pinned ? currentGeneratedFP.identity.expectations?.timezone || 'Không ghi nhận'
      : fieldFpTimezone.value || 'Theo bộ sinh')
    : legacy ? (currentGeneratedFP?.timezone || 'Chưa xác nhận')
      : 'Theo máy';
  document.getElementById('fp-preview-identity').textContent =
    pinned ? 'Đã lưu (không sửa trực tiếp)' :
      isCamoufox ? 'Chờ cấp / kiểm chứng' : legacy ? 'Giá trị thử nghiệm' : 'Thông số gốc';
  document.getElementById('fp-config-status').textContent = pinned ? 'Đã ghim' :
    legacy ? 'Thử nghiệm' : isCamoufox ? 'Chờ cấp' : 'Mặc định';
}

function selectedFingerprintConfig() {
  if (fieldBrowserEngine.value === 'camoufox') {
    // Identity is immutable per existing profile. A regular edit is NOT
    // permission to replace the CAMOU_CONFIG blob with renderer-controlled data.
    // The store preserves the pinned identity for the same profile/engine.
    if (fieldId.value && currentGeneratedFP?.identity) return { mode: 'native' };
    const fp = { mode: 'native' };
    if (fieldFpLocale.value) {
      fp.language = fieldFpLocale.value;
      fp.languages = [fieldFpLocale.value];
    }
    if (fieldFpTimezone.value) fp.timezone = fieldFpTimezone.value;
    return fp;
  }
  if (fieldFpMode.value === 'native' || fieldBrowserEngine.value !== 'chromium')
    return { mode: 'native' };
  const [width,height] = fieldFpScreen.value.split('x').map(Number);
  return {
    ...(currentGeneratedFP || {}),
    mode: 'experimental',
    os: fieldFpOs.value,
    userAgent: fieldFpUa.value.trim(),
    hardwareConcurrency: Number(fieldFpCores.value),
    deviceMemory: Number(fieldFpMemory.value),
    screen: { width, height, availWidth: width, availHeight: height - 40, colorDepth: 24 },
    canvasNoiseSeed: fieldFpCanvas.checked ? (Number(currentGeneratedFP?.canvasNoiseSeed) || 1) : 0,
    audioNoiseSeed: fieldFpAudio.checked ? (Number(currentGeneratedFP?.audioNoiseSeed) || 1) : 0,
    webrtc: fieldFpWebrtc.checked ? 'spoof' : 'real'
  };
}
function setFingerprintMode(mode) {
  fieldFpMode.value = mode === 'native' ? 'native' : 'experimental';
  fpCustomFields.hidden = fieldFpMode.value === 'native';
  fpAuditResults.textContent = 'Nhấn Kiểm tra cấu hình để xem phân tích.';
  refreshFingerprintSetup();
}

function applyFingerprintToForm(fp) {
  currentGeneratedFP = fp;
  fieldFpOs.value = fp.os || 'Windows';
  fieldFpUa.value = fp.userAgent || '';
  fieldFpGpu.value = `${fp.webgl?.renderer || 'Intel/NVIDIA GPU'}`;
  fieldFpCores.value = String(fp.hardwareConcurrency || 8);
  fieldFpMemory.value = String(fp.deviceMemory || 8);

  const scr = fp.screen || {};
  const resStr = `${scr.width || 1920}x${scr.height || 1080}`;
  if (['1920x1080', '2560x1440', '1536x864', '1440x900'].includes(resStr)) {
    fieldFpScreen.value = resStr;
  } else {
    fieldFpScreen.value = '1920x1080';
  }

  fieldFpCanvas.checked = (fp.canvasNoiseSeed !== 0);
  fieldFpAudio.checked = (fp.audioNoiseSeed !== 0);
  fieldFpWebrtc.checked = (fp.webrtc !== 'real');
  refreshFingerprintSetup();
}

async function loadProfiles() {
  allProfiles = await window.api.getProfiles();
  const freshIds = new Set(allProfiles.map(p => p.id));
  for (const id of selectedProfileIds) if (!freshIds.has(id)) selectedProfileIds.delete(id);
  const activeList = await window.api.getActiveBrowsers();
  activeBrowserMap.clear();
  activeList.forEach(item => activeBrowserMap.set(item.profileId, item));

  // Populate Groups
  const groups = new Set(allProfiles.map(p => p.group || 'Default'));
  const priorGroup = filterGroup.value;
  filterGroup.innerHTML = '<option value="all">Tất cả Nhóm</option>';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    filterGroup.appendChild(opt);
  });

  if (groups.has(priorGroup)) filterGroup.value = priorGroup;
  const tags = new Set(allProfiles.flatMap(p => p.tags || []));
  const previousTag = filterTag.value;
  filterTag.replaceChildren(new Option('Tất cả Tag','all'));
  [...tags].sort((a,b)=>a.localeCompare(b,'vi')).forEach(tag =>
    filterTag.add(new Option(tag,tag)));
  if (tags.has(previousTag)) filterTag.value = previousTag;
  renderProfiles();
  updateStats();
}

function updateStats() {
  statTotal.textContent = allProfiles.length;
  window.LHMProfilePanel?.refresh();
  window.LHMPremiumWorkspace?.refreshFromProfiles(allProfiles,activeBrowserMap.size);
  statActive.textContent = activeBrowserMap.size;
  document.getElementById('lhm-profiles-total').textContent = allProfiles.length;
  document.getElementById('lhm-profiles-running').textContent = activeBrowserMap.size;
}

function renderProfiles() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedGroup = filterGroup.value;
  const selectedTag = filterTag.value;
  const selectedEngine = filterEngine.value;
  const selectedProxy = filterProxy.value;
  const selectedStatus = filterStatus.value;

  const filtered = allProfiles.filter(p => {
    const matchQuery = !query ||
      p.name.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      (p.group && p.group.toLowerCase().includes(query)) ||
      (p.tags || []).some(tag => tag.toLowerCase().includes(query)) ||
      (p.proxy?.host && p.proxy.host.toLowerCase().includes(query));

    const matchGroup = selectedGroup === 'all' || (p.group || 'Default') === selectedGroup;
    const isRunning = activeBrowserMap.has(p.id);
    const matchStatus = selectedStatus === 'all' ||
      (selectedStatus === 'running' && isRunning) ||
      (selectedStatus === 'stopped' && !isRunning);

    const matchEngine = selectedEngine === 'all' ||
      (p.engine || 'chromium') === selectedEngine;
    const matchProxy = selectedProxy === 'all' ||
      (selectedProxy === 'direct' && (!p.proxy || p.proxy.type === 'direct')) ||
      (selectedProxy === 'proxy' && p.proxy?.type !== 'direct' && !!p.proxy?.type);
    return matchQuery && matchGroup && matchStatus && matchEngine && matchProxy &&
      (selectedTag === 'all' || (p.tags || []).includes(selectedTag));
  });

  profileListBody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    // The static markup text describes a fresh install; when profiles
    // exist but the search/filters hide all of them, say that instead.
    const emptyTitle = emptyState.querySelector('h3');
    const emptyCopy = emptyState.querySelector('p');
    // The in-place create button (Agent 16 proposal 2b) only fits the
    // fresh-install state; in the filter-no-match state the copy already
    // tells the user to clear the search/filters instead.
    const emptyCreateBtn = document.getElementById('empty-state-create');
    if (emptyCreateBtn) emptyCreateBtn.hidden = allProfiles.length !== 0;
    if (allProfiles.length === 0) {
      if (emptyTitle) emptyTitle.textContent = 'Chưa có hồ sơ';
      if (emptyCopy) emptyCopy.textContent = 'Bấm "Tạo hồ sơ" trên thanh công cụ để tạo hồ sơ đầu tiên. ' +
        'Nếu định dùng Camoufox, hãy mở hộp thoại "Engine" trước để cài và kiểm chứng engine trên máy này.';
    } else {
      if (emptyTitle) emptyTitle.textContent = 'Không có hồ sơ nào khớp';
      if (emptyCopy) emptyCopy.textContent = 'Không có hồ sơ nào khớp từ khóa hoặc bộ lọc hiện tại. ' +
        'Thử xóa từ khóa tìm kiếm hoặc đặt các bộ lọc về "Tất cả".';
    }
    document.getElementById('select-all').checked = false;
    document.getElementById('select-all').indeterminate = false;
    window.LHMControlTower?.updateSelection();
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach(profile => {
    const isRunning = activeBrowserMap.has(profile.id);
    const activeInfo = activeBrowserMap.get(profile.id);
    const fp = profile.fingerprint || {};

    const tr = document.createElement('tr');
    tr.dataset.profileId=profile.id;
    tr.innerHTML = `
      <td><input type="checkbox" aria-label="Chọn hồ sơ" data-id="${escapeHtml(profile.id)}" ${selectedProfileIds.has(profile.id) ? 'checked' : ''}></td>
      <td data-table-col="id"><code class="profile-id">${escapeHtml(profile.id)}</code></td>
      <td><div class="profile-name-box"><span class="p-name">${escapeHtml(profile.name)}</span><span class="p-group">${escapeHtml(profile.group || 'Default')}</span><span class="lhm-profile-tags">${(profile.tags || []).map(tag => '<span class="lhm-profile-tag">' + escapeHtml(tag) + '</span>').join('')}</span></div></td>
      <td data-table-col="proxy"><div class="proxy-badge"><span class="proxy-primary">${profile.proxy?.type === 'direct' || !profile.proxy?.host ? 'Trực tiếp' : escapeHtml(String(profile.proxy.type || '').toUpperCase())}</span><span class="proxy-address">${profile.proxy?.type === 'direct' || !profile.proxy?.host ? 'Không sử dụng proxy' : escapeHtml(String(profile.proxy.host || '')) + ':' + escapeHtml(String(profile.proxy.port || ''))}</span></div></td>
      <td data-table-col="engine"><div class="browser-info"><span class="browser-engine">${profile.engine_type==='camoufox'?'Camoufox / Gecko':profile.engine==='gecko'?'Firefox / Gecko':'Chromium'}</span><span class="browser-meta">${escapeHtml(identityMetaText(profile))}</span></div></td>
      <td data-table-col="status"><span class="status-pill ${isRunning ? 'running' : 'stopped'}">${isRunning ? 'Đang chạy' : 'Đã dừng'}</span></td>
      <td><div class="actions-cell">
        <button type="button" class="btn btn-sm ${isRunning ? 'btn-secondary' : 'btn-primary'} btn-toggle-run" data-id="${escapeHtml(profile.id)}"><span data-lhm-icon="${isRunning ? 'square' : 'play'}"></span>${isRunning ? 'Dừng' : 'Mở'}</button>
        <button type="button" class="btn btn-sm btn-secondary btn-health lhm-row-icon" data-id="${escapeHtml(profile.id)}" title="Kiểm tra cấu hình" aria-label="Kiểm tra cấu hình"><span data-lhm-icon="shield-check"></span></button>
        ${profile.engine_type === 'camoufox' && !fp.identity ? '<button type="button" class="btn btn-sm btn-secondary btn-provision" data-id="' + escapeHtml(profile.id) + '" title="Cấp danh tính đã ghim cho hồ sơ Camoufox này">Cấp danh tính</button>' : ''}
        <button type="button" class="btn btn-sm btn-secondary btn-copy-rpa lhm-row-icon" data-id="${escapeHtml(profile.id)}" title="Tùy chọn RPA" aria-label="Tùy chọn RPA"><span data-lhm-icon="terminal"></span></button>
        <button type="button" class="btn btn-sm btn-secondary btn-edit lhm-row-icon" data-id="${escapeHtml(profile.id)}" title="Sửa hồ sơ" aria-label="Sửa hồ sơ"><span data-lhm-icon="edit"></span></button>
        <button type="button" class="btn btn-sm btn-secondary btn-delete lhm-row-icon" data-id="${escapeHtml(profile.id)}" title="Xóa hồ sơ" aria-label="Xóa hồ sơ"><span data-lhm-icon="trash"></span></button>
      </div></td>
    `;
    window.LHMIcons?.decorate(tr);

    // Selection remains stable during live status polling and filtering.
    tr.querySelector('input[type="checkbox"][data-id]').addEventListener('change', event => {
      if (event.target.checked) selectedProfileIds.add(profile.id);
      else selectedProfileIds.delete(profile.id);
      window.LHMControlTower?.updateSelection();
    });
    // Row Actions
    const btnToggle = tr.querySelector('.btn-toggle-run');
    btnToggle.addEventListener('click', async () => {
      btnToggle.disabled = true;
      try {
        if (isRunning) await window.api.stopBrowser(profile.id);
        else await window.api.startBrowser(profile.id);
      } catch (error) { alert('Không thể mở/đóng hồ sơ: ' + error.message); }
      await loadProfiles();
      await refreshBehaviorAlerts();
    });

    tr.querySelector('.btn-health').addEventListener('click', () => window.LHMMaintenance.showHealth(profile.id));
    const btnProvision = tr.querySelector('.btn-provision');
    if (btnProvision) btnProvision.addEventListener('click', async () => {
      btnProvision.disabled = true;
      try {
        const result = await window.api.provisionCamoufoxIdentity(profile.id);
        alert(provisioningActionMessage(profile, result));
      } catch (error) {
        alert('Không cấp được danh tính cho hồ sơ "' + profile.name + '": ' + error.message + '\n' +
          'Mở hộp thoại "Engine" trên thanh công cụ để kiểm tra engine Camoufox, rồi thử lại.');
      }
      await loadProfiles();
    });
    const btnRpa = tr.querySelector('.btn-copy-rpa');
    if (profile.engine === 'gecko') {
      btnRpa.disabled = true;
      btnRpa.title = 'RPA qua Chromium CDP chưa hỗ trợ với Gecko';
    }
    btnRpa.addEventListener('click', () => {
      openModal(modalRPA);
      // Update code examples with this profile's ID
      document.querySelectorAll('#modal-rpa code').forEach(codeElem => {
        codeElem.textContent = codeElem.textContent.replace(/pb_[a-z0-9]+/g, profile.id);
      });
    });

    const btnEdit = tr.querySelector('.btn-edit');
    btnEdit.addEventListener('click', () => openProfileModal(profile));

    const btnDelete = tr.querySelector('.btn-delete');
    btnDelete.addEventListener('click', async () => {
      if (confirm(`Chuyển hồ sơ "${profile.name}" vào thùng rác 30 ngày? Bạn có thể khôi phục trong mục Thùng rác.`)) {
        await window.api.deleteProfile(profile.id);
        await loadProfiles();
        await refreshBehaviorAlerts();
      }
    });

    profileListBody.appendChild(tr);
  });
  const visible = [...profileListBody.querySelectorAll('input[type="checkbox"][data-id]')];
  const selectAll = document.getElementById('select-all');
  selectAll.checked = visible.length > 0 && visible.every(x => x.checked);
  selectAll.indeterminate = visible.some(x => x.checked) && !selectAll.checked;
  window.LHMControlTower?.updateSelection();
  window.LHMTablePreferences?.apply();
}

function startStatusPoller() {
  setInterval(async () => {
    const activeList = await window.api.getActiveBrowsers();
    let changed = false;
    if (activeList.length !== activeBrowserMap.size) {
      changed = true;
    } else {
      for (const item of activeList) {
        if (!activeBrowserMap.has(item.profileId)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      activeBrowserMap.clear();
      activeList.forEach(item => activeBrowserMap.set(item.profileId, item));
      renderProfiles();
      updateStats();
    }
  }, 2000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
