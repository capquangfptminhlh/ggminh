'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const api = window.api;
  let busy = false;
  let qaBusy = false;
  let qaLoaded = false;
  const qaChoiceLabels = [
    ['not-checked','Chưa kiểm tra'],
    ['confirmed','Tôi đã tự xác nhận'],
    ['needs-work','Cần xử lý'],
    ['not-applicable','Không áp dụng']
  ];
  function node(tag, className, content) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = String(content);
    return item;
  }
  function show() {
    byId('modal-ads-launch-guard').classList.add('open');
    byId('ads-guard-urls').focus();
    if (!qaLoaded) void loadQaChecklist();
  }
  function hide() { byId('modal-ads-launch-guard').classList.remove('open'); }
  async function inspect() {
    if (busy) return;
    busy = true;
    const button = byId('ads-guard-inspect');
    const status = byId('ads-guard-inspect-status');
    const container = byId('ads-guard-results');
    button.disabled = true;
    container.replaceChildren();
    status.textContent = 'Đang kiểm tra trên máy…';
    try {
      const report = await api.inspectAdsLandingUrls(byId('ads-guard-urls').value);
      status.textContent = report.checked + ' link · ' + report.blocked + ' cần sửa · ' +
        report.review + ' cần xem · ' + report.ready + ' không phát hiện lỗi URL/UTM';
      for (const item of report.items) {
        const card = node('article', 'lhm-ads-guard-result');
        card.dataset.state = item.status;
        const head = node('div', 'lhm-ads-guard-result-head');
        head.append(node('strong','', 'Link ' + item.index + ' · ' + item.destination));
        head.append(node('span', 'lhm-ads-guard-state', item.status === 'blocked' ?
          'CẦN SỬA' : item.status === 'review' ? 'CẦN XEM' : 'CHỈ PASS CẤU HÌNH'));
        card.append(head);
        for (const finding of item.findings) {
          const row = node('p','lhm-ads-guard-finding is-' + finding.level,
            finding.level === 'error' ? 'Lỗi · ' + finding.message :
              finding.level === 'warning' ? 'Cảnh báo · ' + finding.message :
                'Lưu ý · ' + finding.message);
          card.append(row);
        }
        if (!item.findings.length)
          card.append(node('p','lhm-ads-guard-finding','Không thấy lỗi URL/UTM trong kiểm tra offline.'));
        container.append(card);
      }
    } catch (error) {
      status.textContent = 'Không kiểm tra được: ' + String(error.message || error);
    } finally { busy = false; button.disabled = false; }
  }
  async function build() {
    const button = byId('ads-guard-build');
    const status = byId('ads-guard-build-status');
    const output = byId('ads-guard-output');
    button.disabled = true;
    output.value = '';
    status.textContent = 'Đang tạo URL trên máy…';
    const values = Object.fromEntries([
      ['utm_source','ads-guard-source'],
      ['utm_medium','ads-guard-medium'],
      ['utm_campaign','ads-guard-campaign'],
      ['utm_content','ads-guard-content'],
      ['utm_term','ads-guard-term']
    ].map(([key,id]) => [key,byId(id).value]));
    try {
      const result = await api.buildAdsUtmUrl(byId('ads-guard-base').value,values);
      output.value = result.url;
      status.textContent = 'Đã tạo link UTM. Hãy kiểm tra trước khi sử dụng và sao chép bằng Ctrl+C.';
      output.focus();
      output.select();
    } catch (error) {
      status.textContent = 'Không tạo được link: ' + String(error.message || error);
    } finally { button.disabled = false; }
  }
  async function loadQaChecklist() {
    const status = byId('ads-qa-status');
    const previewBtn = byId('ads-qa-preview');
    const exportBtn = byId('ads-qa-export');
    previewBtn.disabled = true;
    exportBtn.disabled = true;
    status.textContent = 'Đang tải mẫu checklist…';
    try {
      const rows = await api.adsQaChecklist();
      if (!Array.isArray(rows) || rows.length < 4 || rows.length > 20)
        throw Error('Mẫu checklist không hợp lệ');
      const target = byId('ads-qa-checklist');
      target.replaceChildren();
      for (const entry of rows) {
        const label = node('label','lhm-ads-qa-item');
        const caption = node('span','',entry.label);
        const picker = document.createElement('select');
        picker.dataset.checkId = entry.id;
        picker.setAttribute('aria-label','Trạng thái: ' + entry.label);
        for (const [value,title] of qaChoiceLabels) {
          const option = node('option','',title);
          option.value = value;
          picker.append(option);
        }
        picker.addEventListener('change', () => {
          status.textContent = 'Checklist đã thay đổi. Chọn Xem tổng hợp để kiểm tra lại.';
        });
        label.append(caption,picker);
        target.append(label);
      }
      qaLoaded = true;
      status.textContent = 'Checklist đã sẵn sàng. Tất cả mục mặc định chưa kiểm tra.';
      previewBtn.disabled = false;
      exportBtn.disabled = false;
    } catch (error) {
      qaLoaded = false;
      status.textContent = 'Không tải được checklist: ' + String(error.message || error);
    }
  }
  function qaPayload() {
    const checks = {};
    for (const picker of byId('ads-qa-checklist').querySelectorAll('select[data-check-id]'))
      checks[picker.dataset.checkId] = picker.value;
    return {urls:byId('ads-guard-urls').value,checks};
  }
  function explainDecision(value) {
    return value === 'NEEDS_CORRECTION' ? 'Có mục cần sửa' :
      value === 'REQUIRES_REVIEW' ? 'Cần rà soát thêm' :
      'Đã ghi nhận QA cục bộ và xác nhận thủ công (không bảo đảm phê duyệt)';
  }
  async function campaignQa(exportFile) {
    if (qaBusy || !qaLoaded) return;
    qaBusy = true;
    const previewBtn = byId('ads-qa-preview');
    const exportBtn = byId('ads-qa-export');
    const status = byId('ads-qa-status');
    previewBtn.disabled = true;
    exportBtn.disabled = true;
    status.textContent = exportFile ? 'Đang chuẩn bị file báo cáo…' : 'Đang tính tổng hợp…';
    try {
      const report = exportFile ?
        await api.exportAdsQa(qaPayload()) :
        await api.previewAdsQa(qaPayload());
      if (report.canceled) {
        status.textContent = 'Đã hủy lưu, không có file nào được tạo.';
      } else {
        const s = report.summary || null;
        status.textContent = explainDecision(report.decision) +
          (s ? ' · ' + s.offlineUrls + ' link, ' + s.urlBlocked +
            ' URL cần sửa, ' + s.userConfirmed + ' mục tự xác nhận, ' +
            s.userNotChecked + ' mục chưa kiểm tra.' : '') +
          (exportFile ? ' · Báo cáo JSON đã lưu vào vị trí bạn chọn.' : '');
      }
    } catch (error) {
      status.textContent = 'Không thể ' + (exportFile ? 'lưu' : 'tạo') +
        ' báo cáo: ' + String(error.message || error);
    } finally {
      qaBusy = false;
      previewBtn.disabled = false;
      exportBtn.disabled = false;
    }
  }
  function bind() {
    byId('btn-ads-launch-guard').addEventListener('click', show);
    byId('lhm-open-ads-review')?.addEventListener('click', show);
    for (const id of ['ads-guard-close','ads-guard-done'])
      byId(id).addEventListener('click',hide);
    byId('ads-guard-inspect').addEventListener('click',inspect);
    byId('ads-guard-build').addEventListener('click',build);
    byId('ads-qa-preview').addEventListener('click',() => campaignQa(false));
    byId('ads-qa-export').addEventListener('click',() => campaignQa(true));
    byId('ads-guard-urls').addEventListener('input', () => {
      byId('ads-qa-status').textContent =
        'Danh sách URL đã thay đổi. Hãy kiểm tra lại trước khi xuất báo cáo.';
    });
    byId('modal-ads-launch-guard').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hide(); }
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
