'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const api = window.api;
  let busy = false;
  function node(tag, className, content) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = String(content);
    return item;
  }
  function show() {
    byId('modal-ads-launch-guard').classList.add('open');
    byId('ads-guard-urls').focus();
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
  function bind() {
    byId('btn-ads-launch-guard').addEventListener('click', show);
    for (const id of ['ads-guard-close','ads-guard-done'])
      byId(id).addEventListener('click',hide);
    byId('ads-guard-inspect').addEventListener('click',inspect);
    byId('ads-guard-build').addEventListener('click',build);
    byId('modal-ads-launch-guard').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hide(); }
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
