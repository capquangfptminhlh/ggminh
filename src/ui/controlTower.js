(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const api = window.api;
  const verbs = { profile_open:'Mở hồ sơ',profile_close:'Đóng hồ sơ',profile_save:'Lưu hồ sơ',profile_delete:'Xóa hồ sơ' };
  let loading = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }
  function empty(container, message) {
    container.replaceChildren(node('p', 'tower-empty', message));
  }
  function selected() {
    return window.LHMProfileSelection?.getSelected() || [];
  }
  function updateSelection() {
    const ids = selected();
    byId('selection-toolbar').hidden = !ids.length;
    byId('selected-count').textContent = String(ids.length);
    byId('selection-duplicate').disabled = ids.length !== 1;
    byId('selection-stop').disabled = ids.length === 0;
    byId('selection-export').disabled = ids.length === 0;
  }
  function status(message, error = false) {
    const display = byId('tower-status');
    display.textContent = message;
    display.style.color = error ? '#fda4af' : '#a3c9f0';
  }
  function makeGroup(group, max) {
    const button = node('button', 'tower-group');
    button.type = 'button';
    const row = node('div', 'tower-group-top');
    row.append(node('strong', '', group.name));
    row.append(node('small', '', group.running + ' đang mở / ' + group.total + ' hồ sơ'));
    const bar = node('div', 'tower-bar');
    const fill = node('div', 'tower-bar-fill');
    fill.style.width = ((group.total / Math.max(max, 1)) * 100).toFixed(1) + '%';
    bar.append(fill);
    button.append(row, bar);
    if (group.errors || group.warnings) {
      button.append(node('small', 'tower-muted', group.errors + ' lỗi · ' + group.warnings + ' cảnh báo'));
    }
    button.addEventListener('click', () => {
      const groupFilter = byId('filter-group');
      if ([...groupFilter.options].some(x => x.value === group.name)) {
        groupFilter.value = group.name;
        groupFilter.dispatchEvent(new Event('change'));
        close();
      }
    });
    return button;
  }
  function makeIssue(item) {
    const row = node('div', 'tower-attention '+(item.level === 'error' ? 'is-error' : 'is-warning'));
    row.append(node('strong', '', (item.level === 'error' ? '🔴 ' : '🟡 ') + item.name));
    row.append(node('p', '', item.problems.join(' · ') || 'Kiểm tra cấu hình'));
    return row;
  }
  function makeEvent(event) {
    const row = node('div', 'tower-event');
    row.append(node('span', '', (verbs[event.action] || 'Thao tác') + ' · ' + event.profileId));
    let when;
    try { when = new Date(event.at).toLocaleString('vi-VN'); }
    catch (_) { when = ''; }
    row.append(node('small', '', (event.source === 'api' ? 'API · ' : 'Thủ công · ') + when));
    return row;
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const report = await api.controlTowerSnapshot();
      byId('tower-total').textContent = String(report.total);
      byId('tower-active').textContent = String(report.active);
      byId('tower-errors').textContent = String(report.errorCount);
      byId('tower-warnings').textContent = String(report.warningCount + report.alertCount);
      const groups = byId('tower-groups');
      groups.replaceChildren();
      if (!report.groups.length) empty(groups, 'Chưa có hồ sơ, hãy tạo một hồ sơ đầu tiên.');
      else {
        const max = Math.max(...report.groups.map(group => group.total));
        for (const group of report.groups) groups.append(makeGroup(group, max));
      }
      const attention = byId('tower-attention');
      attention.replaceChildren();
      if (!report.attention.length && !report.alerts.length) empty(attention, '✓ Không có lỗi/cảnh báo đã biết.');
      else {
        for (const item of report.attention) attention.append(makeIssue(item));
        for (const item of report.alerts) {
          const row = node('div', 'tower-attention is-warning');
          row.append(node('strong', '', '⚠ ' + (item.profileId || 'Nhiều hồ sơ')));
          row.append(node('p', '', item.message));
          attention.append(row);
        }
      }
      const events = byId('tower-events');
      events.replaceChildren();
      if (!report.recentEvents.length) empty(events, 'Chưa có thao tác nào trong 24 giờ gần đây.');
      else for (const item of report.recentEvents) events.append(makeEvent(item));
      status('Dữ liệu cục bộ · làm mới ' + new Date().toLocaleTimeString('vi-VN'));
    } catch (error) {
      status('Không thể lấy dữ liệu: ' + error.message, true);
    } finally { loading = false; }
  }
  function show() {
    byId('modal-control-tower').classList.add('open');
    refresh();
  }
  function close() { byId('modal-control-tower').classList.remove('open'); }
  async function refreshProfiles() {
    if (typeof loadProfiles === 'function') await loadProfiles();
    await refresh();
  }
  async function cloneSelected() {
    const ids = selected();
    if (ids.length !== 1) return alert('Chỉ chọn một hồ sơ để tạo bản sao mẫu.');
    if (!confirm('Tạo hồ sơ mới từ cấu hình này? Cookie, đăng nhập, mật khẩu và fingerprint sẽ không được sao chép.')) return;
    try {
      const cloned = await api.controlTowerDuplicate(ids[0]);
      window.LHMProfileSelection?.clear();
      await refreshProfiles();
      alert('Đã tạo hồ sơ mới: ' + cloned.name + '\nID: ' + cloned.id + '\nHồ sơ chưa có phiên đăng nhập.');
    } catch (error) { alert('Không thể nhân bản: ' + error.message); }
  }
  async function stopSelected() {
    const ids = selected();
    if (!ids.length) return;
    if (!confirm('Đóng các cửa sổ đang chạy thuộc ' + ids.length + ' hồ sơ đã chọn?\nCác biểu mẫu chưa lưu trên website có thể mất dữ liệu.')) return;
    byId('selection-stop').disabled = true;
    try {
      const result = await api.controlTowerStop(ids);
      await refreshProfiles();
      alert('Đã đóng ' + result.stopped + '/' + result.requested + ' hồ sơ.\nCác hồ sơ không mở sẽ được bỏ qua.');
    } catch (error) { alert('Không thể đóng hồ sơ: ' + error.message); }
    finally { updateSelection(); }
  }
  async function exportProfiles(ids) {
    try {
      const outcome = await api.controlTowerExport(ids);
      if (outcome.canceled) return;
      alert('Đã xuất báo cáo CSV cho ' + outcome.count + ' hồ sơ. Không có mật khẩu hoặc cookie.');
      status('Đã xuất CSV: ' + outcome.count + ' hồ sơ');
    } catch (error) {
      alert('Không thể xuất CSV: ' + error.message);
      status(error.message, true);
    }
  }
  function showSelectedHealth() {
    const ids = selected();
    if (!ids.length) return;
    window.LHMMaintenance.showHealth(ids);
  }
  function bind() {
    byId('btn-control-tower').addEventListener('click', show);
    byId('tower-close').addEventListener('click', close);
    byId('tower-done').addEventListener('click', close);
    byId('tower-refresh').addEventListener('click', refresh);
    byId('tower-export-all').addEventListener('click', () => exportProfiles([]));
    byId('tower-open-health').addEventListener('click', () => {
      close();
      window.LHMMaintenance.showHealth();
    });
    byId('selection-clear').addEventListener('click', () => window.LHMProfileSelection.clear());
    byId('selection-duplicate').addEventListener('click', cloneSelected);
    byId('selection-stop').addEventListener('click', stopSelected);
    byId('selection-export').addEventListener('click', () => exportProfiles(selected()));
    byId('selection-health').addEventListener('click', showSelectedHealth);
    setInterval(() => {
      if (byId('modal-control-tower').classList.contains('open')) refresh();
    }, 6000);
    updateSelection();
  }
  window.LHMControlTower = { show, refresh, updateSelection };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();