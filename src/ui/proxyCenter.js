(() => {
  'use strict';
  const api = window.api;
  const el = id => document.getElementById(id);
  let cached = [];
  let busy = false;
  let initialized = false;

  function message(text, error = false) {
    const item = el('pc-message');
    item.classList.toggle('is-error', error);
    item.textContent = text;
  }
  function node(type, className, text) {
    const out = document.createElement(type);
    if (className) out.className = className;
    if (text !== undefined) out.textContent = String(text);
    return out;
  }
  function selectedIds() { return window.LHMProfileSelection?.getSelected() || []; }
  function clearForm() {
    el('pc-id').value = '';
    el('pc-name').value = '';
    el('pc-tag').value = '';
    el('pc-type').value = 'http';
    el('pc-host').value = '';
    el('pc-port').value = '';
    message('');
  }
  function fillForm(p) {
    el('pc-id').value = p.id;
    el('pc-name').value = p.name;
    el('pc-tag').value = p.tag || '';
    el('pc-type').value = p.type;
    el('pc-host').value = p.host;
    el('pc-port').value = p.port;
    message('Đang sửa: ' + p.name);
  }
  function tinyButton(name, style, callback) {
    const button = node('button','btn btn-sm ' + style,name);
    button.type='button';
    button.addEventListener('click', callback);
    return button;
  }
  function makeCard(proxy) {
    const card=node('div','pc-card');
    const head=node('div','pc-card-head');
    head.append(node('strong','',proxy.name));
    head.append(node('small','',proxy.tag || 'Chưa gắn nhãn'));
    card.append(head,node('div','pc-card-endpoint',proxy.type.toUpperCase()+' · '+proxy.host+':'+proxy.port));
    card.append(node('div','pc-card-meta','Đang dùng trong '+proxy.usageCount+' hồ sơ'));
    const verify = proxy.check;
    card.append(node('div','pc-card-status '+(!verify?'':verify.status === 'verified'?'ok':verify.status==='warning'?'warning':'error'),
      !verify?'Chưa kiểm tra trong phiên làm việc này':
      (verify.verified ? '✓ IP thoát: '+verify.ip+' · '+verify.latency+' ms':'✖ '+(verify.message||'Không kết nối được'))));
    const row=node('div','pc-card-actions');
    row.append(tinyButton('🔍 Kiểm tra IP','btn-secondary', async ()=>{
      if(busy)return;
      busy=true;message('Đang kiểm tra IP thoát của '+proxy.name+'...');
      try {
        const outcome=await api.checkSavedProxy(proxy.id);
        message(outcome.verified?'Đã kiểm tra IP thoát.':'Không xác minh được IP: '+(outcome.message||'Lỗi proxy'), !outcome.verified);
        await refresh(false);
      }catch(error){message(error.message,true);} finally{busy=false;}
    }));
    row.append(tinyButton('Gán hồ sơ đã chọn','btn-primary', async ()=>{
      if(busy)return;
      const ids=selectedIds();
      if(!ids.length)return message('Chọn một hoặc nhiều hồ sơ trong bảng chính trước khi gán.',true);
      if(!confirm('Gán proxy '+proxy.name+' cho '+ids.length+' hồ sơ?\nChỉ các hồ sơ đã đóng mới được sửa. Đây là thay đổi cấu hình kết nối, không bảo đảm ẩn danh.'))return;
      busy=true;
      try{
        const outcome=await api.assignSavedProxy(proxy.id,ids);
        message('✓ Đã gán proxy cho '+outcome.updated+' hồ sơ.');
        await refresh(false);
        if(typeof loadProfiles==='function') await loadProfiles();
      }catch(error){message('Không thể gán: '+error.message,true);}finally{busy=false;}
    }));
    row.append(tinyButton('Sửa','btn-secondary',()=>fillForm(proxy)));
    row.append(tinyButton('Xóa','btn-danger',async ()=>{
      if(busy)return;
      if(!confirm('Xóa '+proxy.name+' khỏi kho? Các hồ sơ đã gán vẫn giữ cấu hình hiện có.'))return;
      busy=true;
      try {await api.deleteSavedProxy(proxy.id);clearForm();await refresh(false);message('Đã xóa khỏi kho.');}
      catch(error){message(error.message,true);}finally{busy=false;}
    }));
    card.append(row);
    return card;
  }
  async function refresh(showError = true) {
    try {
      cached=await api.listSavedProxies();
      const search=el('pc-search').value.trim().toLowerCase();
      const list=el('pc-list');
      list.replaceChildren();
      const found=cached.filter(p=>
        [p.name,p.tag,p.host,p.type].some(value=>String(value||'').toLowerCase().includes(search)));
      if(!found.length)list.append(node('p','tower-empty',cached.length?'Không tìm thấy proxy phù hợp.':'Kho proxy trống. Hãy thêm kết nối đầu tiên.'));
      else for(const p of found) list.append(makeCard(p));
      el('pc-total').textContent=String(cached.length);
      el('pc-verified').textContent=String(cached.filter(p=>p.check?.verified===true).length);
      el('pc-used').textContent=String(cached.reduce((count,p)=>count+(p.usageCount||0),0));
      const n=selectedIds().length;
      el('pc-selection-info').textContent=n?('Đang chọn '+n+' hồ sơ trên bảng chính'):'Chọn hồ sơ ở bảng chính trước khi gán proxy.';
      refreshPresets();
      initialized=true;
    }catch(error){if(showError)message('Không thể tải kho proxy: '+error.message,true);}
  }
  async function refreshPresets(existingProxy = null) {
    if(!initialized) {
      try { cached=await api.listSavedProxies();initialized=true; } catch(_) {return;}
    }
    const select=el('field-proxy-preset');
    if(!select)return;
    const previously=select.value;
    select.replaceChildren(node('option','','— Tự nhập cấu hình —'));
    select.firstChild.value='';
    for(const p of cached){
      const option=node('option','',p.name+' · '+p.type.toUpperCase()+' · '+p.host+':'+p.port);
      option.value=p.id;select.append(option);
    }
    if(existingProxy){
      const match=cached.find(p=>p.type===existingProxy.type&&p.host===existingProxy.host&&Number(p.port)===Number(existingProxy.port));
      select.value=match?.id||'';
    }else if(cached.some(p=>p.id===previously)) select.value=previously;
    else select.value='';
  }
  function presetChange() {
    const selected=cached.find(p=>p.id===el('field-proxy-preset').value);
    if(!selected)return;
    el('field-proxy-type').value=selected.type;
    el('field-proxy-host').value=selected.host;
    el('field-proxy-port').value=selected.port;
    el('field-proxy-user').value='';
    el('field-proxy-pass').value='';
    el('field-proxy-type').dispatchEvent(new Event('change'));
  }
  async function save() {
    if(busy)return;
    busy=true;el('pc-save').disabled=true;
    try {
      const draft={
        id:el('pc-id').value||undefined,
        name:el('pc-name').value,
        tag:el('pc-tag').value,
        type:el('pc-type').value,
        host:el('pc-host').value.trim(),
        port:Number(el('pc-port').value)
      };
      const saved=await api.saveSavedProxy(draft);
      clearForm();
      await refresh(false);
      message('✓ Đã lưu '+saved.name);
    }catch(error){message(error.message,true);}
    finally {busy=false;el('pc-save').disabled=false;}
  }
  function show() {
    el('modal-proxy-center').classList.add('open');
    refresh();
  }
  function close() {el('modal-proxy-center').classList.remove('open');}
  function bind() {
    el('btn-proxy-center').addEventListener('click',show);
    el('pc-close').addEventListener('click',close);
    el('pc-done').addEventListener('click',close);
    el('pc-save').addEventListener('click',save);
    el('pc-reset').addEventListener('click',clearForm);
    el('pc-refresh').addEventListener('click',()=>refresh());
    el('pc-search').addEventListener('input',()=>refresh(false));
    el('field-proxy-preset').addEventListener('change',presetChange);
  }
  window.LHMProxyCenter={show,refreshPresets};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();