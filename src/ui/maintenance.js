(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const api = window.api;
  let selectedProfile = null;
  function open(id) { el(id).classList.add('open'); }
  function close(id) { el(id).classList.remove('open'); }
  function labeled(className, value) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = value;
    return node;
  }
  async function updateHealth() {
    const [profiles, statuses] = await Promise.all([api.getProfiles(), api.getAllProfileHealth()]);
    const names = new Map(profiles.map(p => [p.id, p.name]));
    const results = selectedProfile ? statuses.filter(s => s.profileId === selectedProfile) : statuses;
    el('health-total').textContent = String(results.length);
    el('health-errors').textContent = String(results.filter(s => s.status === 'error').length);
    el('health-warnings').textContent = String(results.filter(s => s.status === 'warning').length);
    const list = el('health-items');
    list.replaceChildren();
    if (!results.length) {
      list.append(labeled('health-issue', 'Chưa có hồ sơ để kiểm tra.'));
      return;
    }
    for (const result of results) {
      const wrapper = document.createElement('section');
      wrapper.className = 'health-item';
      const heading = document.createElement('div');
      heading.className = 'health-item-head';
      heading.append(labeled('health-name', (names.get(result.profileId) || result.profileId) + ' · ' + result.engine));
      heading.append(labeled('health-status ' + result.status,
        result.status === 'error' ? '🔴 Cần xử lý' : result.status === 'warning' ? '🟡 Cần xem lại' : '🟢 Có thể mở'));
      wrapper.append(heading);
      const issues = document.createElement('div');
      issues.className = 'health-issues';
      for (const item of result.issues) {
        issues.append(labeled('health-issue ' + item.level,
          (item.level === 'error' ? '✖ ' : item.level === 'warning' ? '⚠ ' : 'ℹ ') + item.message));
      }
      if (!result.issues.length) issues.append(labeled('health-issue', 'Không phát hiện lỗi cấu hình đã biết.'));
      wrapper.append(issues);
      list.append(wrapper);
    }
  }
  async function showHealth(profileId = null) {
    selectedProfile = profileId;
    open('modal-health');
    try { await updateHealth(); }
    catch (error) { el('health-items').replaceChildren(labeled('health-issue error', 'Không kiểm tra được: ' + error.message)); }
  }
  function showBackup() {
    el('backup-password').value = '';
    el('backup-result').textContent = '';
    el('backup-mode').value = 'export';
    open('modal-backup');
  }
  async function executeBackup() {
    const password = el('backup-password').value;
    const mode = el('backup-mode').value;
    if (password.length < 12) {
      el('backup-result').textContent = 'Mật khẩu cần ít nhất 12 ký tự.';
      return;
    }
    if (mode === 'import' && !confirm('Nhập hồ sơ MỚI, không khôi phục cookies/phiên. Tiếp tục?')) return;
    el('backup-execute').disabled = true;
    el('backup-result').textContent = 'Đang xử lý...';
    try {
      const value = mode === 'export' ? await api.exportConfigBackup(password) : await api.importConfigBackup(password);
      if (value.canceled) el('backup-result').textContent = 'Đã hủy chọn tệp.';
      else if (mode === 'export') el('backup-result').textContent = '✓ Đã xuất bản sao lưu mã hóa. Hãy giữ mật khẩu tại nơi an toàn.';
      else {
        el('backup-result').textContent = '✓ Đã nhập thêm ' + value.profiles + ' hồ sơ, ' + value.workflows + ' quy trình. Phiên trình duyệt không được sao chép.';
        if (typeof loadProfiles === 'function') await loadProfiles();
      }
    } catch (error) { el('backup-result').textContent = '✖ ' + error.message; }
    finally { el('backup-password').value = ''; el('backup-execute').disabled = false; }
  }
  function bind() {
    el('btn-profile-health').addEventListener('click', () => showHealth());
    el('health-close').addEventListener('click', () => close('modal-health'));
    el('health-done').addEventListener('click', () => close('modal-health'));
    el('health-refresh').addEventListener('click', () => updateHealth().catch(console.error));
    el('btn-config-backup').addEventListener('click', showBackup);
    el('backup-close').addEventListener('click', () => close('modal-backup'));
    el('backup-cancel').addEventListener('click', () => close('modal-backup'));
    el('backup-execute').addEventListener('click', executeBackup);
  }
  window.LHMMaintenance = { showHealth };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();