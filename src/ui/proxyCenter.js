(() => {
  'use strict';
  const api = window.api;
  const el = id => document.getElementById(id);
  const cell = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  let cached = [];
  let busy = false;
  let initialized = false;
  let activeId = null;

  function notice(text, error = false) {
    const item = el('pc-message');
    item.classList.toggle('is-error', error);
    item.textContent = text;
  }
  function selectedIds() { return window.LHMProfileSelection?.getSelected() || []; }
  function lock(value) {
    busy = value;
    for (const button of el('modal-proxy-center').querySelectorAll(
      '#pc-save,#pc-reset,#pc-refresh,#pc-list button')) button.disabled = value;
    el('pc-selection-info').textContent =
      value ? 'Đang xử lý yêu cầu…'
        : selectedIds().length + ' hồ sơ được chọn trong bảng chính';
  }
  function clearForm() {
    for (const key of ['pc-id','pc-name','pc-tag','pc-host','pc-port']) el(key).value = '';
    el('pc-type').value = 'http';
    activeId = null;
    el('pc-auth-user').value='';
    el('pc-auth-pass').value='';
    el('pc-clear-auth').checked=false;
    el('pc-credential-info').textContent='Nhập cả hai trường để thêm mật khẩu. Mật khẩu được mã hóa trên thiết bị.';
    notice('');
  }
  function fillForm(proxy) {
    activeId = proxy.id;
    el('pc-id').value = proxy.id;
    el('pc-name').value = proxy.name;
    el('pc-tag').value = proxy.tag || '';
    el('pc-type').value = proxy.type;
    el('pc-host').value = proxy.host;
    el('pc-port').value = proxy.port;
    el('pc-auth-user').value='';
    el('pc-auth-pass').value='';
    el('pc-clear-auth').checked=false;
    el('pc-credential-info').textContent=proxy.hasCredentials ? 'Đã có mật khẩu mã hóa. Để trống sẽ giữ nguyên; nhập cả hai để thay.' : 'Chưa lưu mật khẩu.';
    notice('Đang sửa: ' + proxy.name);
    el('pc-name').focus();
  }
  function action(label, className, callback) {
    const button = cell('button', 'btn btn-sm ' + className, label);
    button.type='button';
    button.addEventListener('click', callback);
    return button;
  }
  async function runAction(work, onError='Không thể hoàn tất') {
    if (busy) return;
    lock(true);
    try { await work(); }
    catch (error) { notice(onError + ': ' + error.message, true); }
    finally { lock(false); }
  }
  function makeRow(proxy) {
    const row = cell('tr', 'pc-table-row');
    row.dataset.proxyId = proxy.id;
    const name = cell('td', 'pc-name-cell');
    const title = cell('strong', '', proxy.name);
    const tag = cell('small', '', (proxy.tag || 'Chưa phân nhóm') + (proxy.hasCredentials ? ' · Có mật khẩu' : ''));
    name.append(title, tag);
    const endpoint = cell('td','pc-endpoint-cell');
    endpoint.append(cell('strong','',proxy.host + ':' + proxy.port));
    endpoint.append(cell('small','',proxy.type.toUpperCase()));
    const used = cell('td','pc-used-cell',proxy.usageCount + ' hồ sơ');
    const verify=proxy.check;
    const state = cell('td', 'pc-state-cell');
    const badge = cell('span', 'pc-check-badge ' +
       (!verify ? 'pending' : verify.verified ? 'verified' : 'failed'));
    badge.textContent= !verify ? 'Chưa kiểm tra' : verify.verified ? 'Đã xác minh' : 'Không xác minh';
    state.append(badge);
    if (verify) state.append(cell('small','',
      verify.verified ? ('IP thoát: ' + (verify.ip || '—')) : (verify.message || 'Lỗi kết nối')));
    const actions=cell('td','pc-action-cell');
    const wrapper=cell('div','pc-row-actions');
    wrapper.append(action('Kiểm tra', 'btn-secondary', () => runAction(async () => {
      notice('Đang kiểm tra IP thoát: ' + proxy.name);
      const outcome = await api.checkSavedProxy(proxy.id);
      await refresh();
      notice(outcome.verified ? 'IP thoát đã xác minh cho ' + proxy.name :
        'Chưa xác minh được IP: ' + (outcome.message||'Không phản hồi'), !outcome.verified);
    },'Lỗi kiểm tra IP')));
    wrapper.append(action('Gán', 'btn-secondary', () => {
      const ids=selectedIds();
      if (!ids.length) { notice('Hãy chọn hồ sơ trong danh sách chính trước khi gán.',true); return; }
      if (!confirm('Gán ' + proxy.name + ' cho ' + ids.length +
          ' hồ sơ đã chọn? Chỉ hồ sơ đã đóng mới được thay đổi.')) return;
      runAction(async () => {
        const result=await api.assignSavedProxy(proxy.id,ids);
        await refresh();
        if(typeof loadProfiles === 'function') await loadProfiles();
        window.LHMProfilePanel?.refresh();
        notice('Đã gán proxy cho ' + result.updated + ' hồ sơ.');
      },'Không thể gán proxy');
    }));
    wrapper.append(action('Sửa','btn-secondary',()=>fillForm(proxy)));
    const del=action('Xóa','btn-secondary pc-danger',()=>{
      if(!confirm('Xóa "'+proxy.name+'" khỏi kho? Hồ sơ đã gán vẫn giữ cấu hình hiện tại.'))return;
      runAction(async () => {
        await api.deleteSavedProxy(proxy.id);
        if(activeId===proxy.id)clearForm();
        await refresh();
        notice('Đã xóa proxy khỏi kho.');
      },'Không thể xóa proxy');
    });
    del.setAttribute('aria-label','Xóa proxy '+proxy.name);
    wrapper.append(del);
    actions.append(wrapper);
    row.append(name,endpoint,used,state,actions);
    return row;
  }
  function render() {
    const search=el('pc-search').value.trim().toLowerCase();
    const list=el('pc-list');
    list.replaceChildren();
    const items=cached.filter(p => [p.name,p.tag,p.host,p.type].some(
      v=>String(v||'').toLowerCase().includes(search)));
    for(const p of items)list.append(makeRow(p));
    el('pc-no-results').hidden = items.length>0;
    el('pc-no-results').textContent = cached.length ?
      'Không có proxy nào khớp từ khóa.' : 'Chưa có proxy. Thêm kết nối ở bảng bên trái.';
    el('pc-total').textContent=cached.length;
    el('pc-verified').textContent=cached.filter(p=>p.check?.verified).length;
    el('pc-used').textContent=cached.reduce((sum,p)=>sum+(p.usageCount||0),0);
    el('pc-selection-info').textContent=selectedIds().length + ' hồ sơ được chọn trong bảng chính';
    refreshPresets();
  }
  async function refresh() {
    cached=await api.listSavedProxies();
    initialized=true;
    render();
  }
  async function refreshPresets(existingProxy = null) {
    if(!initialized) {
      try {cached=await api.listSavedProxies();initialized=true;}
      catch (_) {return;}
    }
    const select=el('field-proxy-preset');
    if(!select)return;
    const previous=select.value;
    const placeholder=cell('option','','Tự nhập cấu hình');
    placeholder.value='';
    select.replaceChildren(placeholder);
    for(const p of cached) {
      const option=cell('option','',p.name + ' · ' + p.type.toUpperCase() + ' · ' + p.host + ':' + p.port);
      option.value=p.id;select.append(option);
    }
    if(existingProxy) {
      const matching=cached.find(p=>p.type===existingProxy.type &&
        p.host===existingProxy.host && Number(p.port)===Number(existingProxy.port));
      select.value=matching?.id||'';
    }else select.value=cached.some(p=>p.id===previous) ? previous : '';
  }
  function presetChange() {
    const p=cached.find(entry=>entry.id===el('field-proxy-preset').value);
    if(!p)return;
    el('field-proxy-type').value=p.type;
    el('field-proxy-host').value=p.host;
    el('field-proxy-port').value=p.port;
    el('field-proxy-user').value='';
    el('field-proxy-pass').value='';
    el('field-proxy-type').dispatchEvent(new Event('change'));
  }
  function save() {
    runAction(async () => {
      const payload={
        id:el('pc-id').value||undefined,
        name:el('pc-name').value.trim(),
        tag:el('pc-tag').value.trim(),
        type:el('pc-type').value,
        host:el('pc-host').value.trim(),
        port:Number(el('pc-port').value),
        authUsername:el('pc-auth-user').value,
        authPassword:el('pc-auth-pass').value,
        clearCredentials:el('pc-clear-auth').checked
      };
      const result=await api.saveSavedProxy(payload);
      clearForm();
      await refresh();
      notice('Đã lưu ' + result.name);
    },'Không lưu được proxy');
  }
  function show() {
    el('modal-proxy-center').classList.add('open');
    refresh().catch(error=>notice('Không đọc được kho proxy: '+error.message,true));
  }
  function close() {el('modal-proxy-center').classList.remove('open');}
  function bind() {
    el('btn-proxy-center').addEventListener('click',show);
    el('pc-close').addEventListener('click',close);
    el('pc-done').addEventListener('click',close);
    el('pc-save').addEventListener('click',save);
    el('pc-reset').addEventListener('click',clearForm);
    el('pc-refresh').addEventListener('click',()=>{
      runAction(async()=>{await refresh();notice('Danh sách đã được cập nhật.');});
    });
    // Search is local; no network/IPC request for each keystroke.
    el('pc-search').addEventListener('input',render);
    el('field-proxy-preset').addEventListener('change',presetChange);
    el('pc-type').addEventListener('change',()=>{
      const socks=el('pc-type').value==='socks5';
      el('pc-auth-user').disabled=socks;
      el('pc-auth-pass').disabled=socks;
      el('pc-credential-info').textContent=socks ? 'SOCKS5 có mật khẩu chưa được hỗ trợ.' : 'Để trống sẽ giữ nguyên thông tin đã lưu.';
    });
  }
  window.LHMProxyCenter={show,refresh,refreshPresets};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();