(() => {
  'use strict';
  const api = window.api;
  const $ = id => document.getElementById(id);
  const ACTIONS = {
    profile_open: 'Mở hồ sơ',
    profile_close: 'Đóng hồ sơ',
    profile_save: 'Cập nhật hồ sơ',
    profile_delete: 'Xóa hồ sơ'
  };
  const EXTERNAL = {
    create: 'btn-create-profile',
    proxy: 'btn-proxy-center',
    automation: 'btn-open-studio',
    tower: 'btn-control-tower',
    health: 'btn-profile-health',
    behavior: 'btn-behavior-alert',
    backup: 'btn-config-backup'
  };
  let working = false;
  function element(tag, css, message) {
    const el = document.createElement(tag);
    if (css) el.className = css;
    if (message !== undefined) el.textContent = String(message);
    return el;
  }
  function text(id, value) { $(id).textContent = String(value); }
  function selectedNav(page) {
    for (const entry of document.querySelectorAll('.lhm-nav-btn')) {
      const selected = entry.dataset.lhmTarget === page;
      entry.classList.toggle('is-current', selected);
      if (selected) entry.setAttribute('aria-current', 'page');
      else entry.removeAttribute('aria-current');
    }
  }
  function switchView(page) {
    if (!['dashboard','profiles'].includes(page)) return;
    document.body.dataset.view = page;
    selectedNav(page);
    if (page === 'dashboard') refresh();
    if (page === 'profiles') $('search-input')?.focus();
  }
  function navigate(target) {
    if (target === 'dashboard' || target === 'profiles') {
      switchView(target);
      return;
    }
    const id = EXTERNAL[target];
    if (!id) return;
    // Existing operational handlers remain the single source of truth.
    const trigger = $(id);
    if (!trigger) {
      $('lhm-dashboard-status').textContent = 'Tính năng này chưa sẵn sàng.';
      return;
    }
    trigger.click();
  }

  function renderWarnings(items) {
    const list = $('lhm-attention-list');
    list.replaceChildren();
    if (!items.length) {
      list.append(element('p', 'lhm-empty', 'Không có cảnh báo cấu hình đã biết trong lần kiểm tra này.'));
      return;
    }
    for (const item of items) {
      const row = element('div','lhm-attention-entry');
      row.append(element('span','lhm-attention-dot',item.level === 'error' ? '●' : '◆'));
      const copy = element('div','');
      copy.append(element('strong','',item.profileName));
      copy.append(element('span','',item.message));
      row.append(copy);
      list.append(row);
    }
  }
  function renderGroups(groups) {
    const container = $('lhm-dashboard-groups');
    container.replaceChildren();
    if (!groups.length) {
      container.append(element('p', 'lhm-empty', 'Chưa có nhóm hồ sơ. Hãy tạo hồ sơ đầu tiên.'));
      return;
    }
    for (const group of groups) {
      const block = element('div','lhm-dashboard-group');
      const head = element('div','lhm-group-meta');
      head.append(element('strong','',group.name));
      head.append(element('small','',group.active + ' đang mở / ' + group.total));
      const bar = element('div','lhm-group-bar');
      const fill = element('div','lhm-group-bar-fill');
      fill.style.width = Math.min(100,Math.max(0,group.total ? group.active/group.total*100 : 0)) + '%';
      bar.append(fill);
      block.append(head,bar);
      container.append(block);
    }
  }
  function renderEvents(events) {
    const list = $('lhm-activity-list');
    list.replaceChildren();
    if (!events.length) {
      list.append(element('p','lhm-empty','Chưa có hoạt động nào được ghi nhận trong LHM.'));
      return;
    }
    for (const event of events) {
      const row = element('div','lhm-activity-item');
      row.append(element('span','',
        (ACTIONS[event.action] || 'Hoạt động') + ' · ' + event.profileId));
      let when = '—';
      if (event.at && Number.isFinite(event.at)) {
        const date = new Date(event.at);
        if (Number.isFinite(date.getTime())) when = date.toLocaleTimeString('vi-VN');
      }
      row.append(element('small','',when));
      list.append(row);
    }
  }
  function render(snapshot) {
    const p = snapshot.profiles;
    text('lhm-kpi-total', p.total);
    text('lhm-kpi-active', p.active);
    text('lhm-kpi-attention', p.errors + p.warnings);
    text('lhm-kpi-workflows', snapshot.automation.total);
    text('lhm-workflow-state', snapshot.automation.running
      ? 'Đang chạy: ' + (snapshot.automation.workflowName || 'Một quy trình')
      : 'Trạng thái: ' + ({
          idle:'Chưa chạy',completed:'Hoàn thành',stopped:'Đã dừng',failed:'Cần xử lý'
        }[snapshot.automation.state] || 'Chưa chạy'));
    text('lhm-native-count', p.native);
    text('lhm-experimental-count', p.experimental);
    text('lhm-error-count', p.errors);
    const ready = Math.max(0,p.total - p.errors - p.warnings);
    text('lhm-health-ready', ready + '/' + p.total);
    const percentage = p.total ? Math.round(ready / p.total * 100) : 0;
    $('lhm-health-ring').style.setProperty('--h-pct', percentage + '%');
    text('lhm-proxy-total', snapshot.proxies.total);
    text('lhm-proxy-verified', snapshot.proxies.verified);
    text('lhm-activity-10m', snapshot.activity.activities10m);
    text('lhm-activity-alerts', snapshot.activity.alertCount);
    renderWarnings(snapshot.warnings || []);
    renderGroups(snapshot.groups || []);
    renderEvents(snapshot.activity.recentEvents || []);
    text('lhm-dashboard-status',
      'Đồng bộ số liệu cục bộ lúc ' + new Date().toLocaleTimeString('vi-VN') +
      ' · Không đo khả năng Google nhận diện tài khoản');
  }
  async function refresh() {
    if (working) return;
    working = true;
    $('lhm-dashboard-refresh').disabled = true;
    try {
      const snapshot = await api.dashboardOverview();
      if (!snapshot || !snapshot.profiles || !snapshot.proxies || !snapshot.activity) {
        throw new Error('Dữ liệu dashboard không hợp lệ');
      }
      render(snapshot);
    } catch (error) {
      text('lhm-dashboard-status', 'Không đọc được số liệu cục bộ: ' + error.message);
    } finally {
      working = false;
      $('lhm-dashboard-refresh').disabled = false;
    }
  }
  function init() {
    for (const button of document.querySelectorAll('[data-lhm-target]')) {
      button.addEventListener('click', () => navigate(button.dataset.lhmTarget));
    }
    $('lhm-dashboard-refresh').addEventListener('click', refresh);
    document.body.dataset.view = 'profiles';
    selectedNav('profiles');
    refresh();
    setInterval(() => {
      if (document.body.dataset.view === 'dashboard' &&
          !document.querySelector('.modal-overlay.open')) refresh();
    }, 9000);
  }
  window.LHMMissionControl = { refresh, switchView };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();