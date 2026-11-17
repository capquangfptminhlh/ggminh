'use strict';
window.LHMLaunchReadiness = (() => {
  const get = id => document.getElementById(id);
  let activeResolve = null;
  let currentProfile = null;
  let lastReport = null;
  const riskLabels = Object.freeze({
    network: '1. Mạng / IP / DNS / WebRTC',
    storage: '2. Cách ly dữ liệu hồ sơ',
    fingerprint: '3. Cấu hình trình duyệt',
    behavior: '4. Hành vi / phía nền tảng'
  });
  function resolveAndClose(allow) {
    get('modal-launch-readiness').classList.remove('open');
    const callback = activeResolve;
    activeResolve = null;
    currentProfile = null;
    lastReport = null;
    get('launch-readiness-confirm').disabled = true;
    if (callback) callback(allow);
  }
  function row(parent, text, className = '') {
    const el = document.createElement('p');
    el.className = 'lhm-launch-row ' + className;
    el.textContent = text;
    parent.append(el);
  }
  function render(report) {
    const banner = get('launch-readiness-status');
    const list = get('launch-readiness-issues');
    const layers = get('launch-readiness-layers');
    const confirm = get('launch-readiness-confirm');
    list.replaceChildren();
    layers.replaceChildren();
    if (report.errorCount > 0) {
      banner.textContent = 'ĐANG CHẶN: ' + report.errorCount +
        ' lỗi cấu hình cần xử lý trước khi mở hồ sơ.';
      banner.dataset.state = 'blocked';
    } else {
      banner.textContent = 'CÓ THỂ TIẾP TỤC SAU KHI XÁC NHẬN — ' +
        report.warningCount + ' cảnh báo / thông số chưa được kiểm chứng.';
      banner.dataset.state = report.warningCount ? 'review' : 'ready';
    }
    for (const item of report.issues) row(list,
      (item.level === 'error' ? 'LỖI · ' : 'LƯU Ý · ') + item.message,
      item.level === 'error' ? 'is-error' : 'is-warning');
    if (!report.issues.length) row(list, 'Chưa phát hiện lỗi trong phạm vi cấu hình đã kiểm tra.');
    for (const layer of report.layers) {
      const section = document.createElement('section');
      section.className = 'lhm-launch-layer';
      const title = document.createElement('strong');
      title.textContent = riskLabels[layer.key] || layer.key;
      section.append(title);
      row(section, layer.observation);
      const badge = document.createElement('span');
      badge.className = 'lhm-launch-state';
      badge.textContent = layer.status === 'blocked' ? 'CẦN SỬA' :
        layer.status === 'review' ? 'CHƯA XÁC MINH / CẦN XEM' : 'ĐÃ KIỂM TRA CẤU HÌNH';
      section.append(badge);
      layers.append(section);
    }
    confirm.disabled = !report.canLaunch;
    confirm.textContent = report.canLaunch ?
      'Tôi hiểu giới hạn kiểm tra · Mở hồ sơ' : 'Phải sửa lỗi trước khi mở';
  }
  async function confirm(profileId) {
    if (activeResolve) return false;
    const modal = get('modal-launch-readiness');
    const openButton = get('launch-readiness-confirm');
    const status = get('launch-readiness-status');
    const list = get('launch-readiness-issues');
    get('launch-readiness-profile').textContent = 'Hồ sơ: ' + String(profileId);
    status.textContent = 'Đang kiểm tra cấu hình cục bộ trước khi mở…';
    status.dataset.state = 'loading';
    list.replaceChildren();
    get('launch-readiness-layers').replaceChildren();
    openButton.disabled = true;
    modal.classList.add('open');
    const answer = new Promise(resolve => { activeResolve = resolve; });
    currentProfile = profileId;
    try {
      const report = await window.api.getLaunchReadiness(profileId);
      if (currentProfile !== profileId) return answer;
      lastReport = report;
      render(report);
    } catch (e) {
      if (currentProfile === profileId) {
        status.dataset.state = 'blocked';
        status.textContent = 'KHÔNG THỂ KIỂM TRA — KHÔNG MỞ HỒ SƠ';
        row(list, String(e.message || e), 'is-error');
        openButton.disabled = true;
      }
    }
    return answer;
  }
  function bind() {
    get('launch-readiness-confirm').addEventListener('click', () => {
      if (!lastReport?.canLaunch) return;
      resolveAndClose(true);
    });
    for (const id of ['launch-readiness-cancel', 'launch-readiness-close'])
      get(id).addEventListener('click', () => resolveAndClose(false));
    get('modal-launch-readiness').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); resolveAndClose(false); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  return { confirm };
})();
