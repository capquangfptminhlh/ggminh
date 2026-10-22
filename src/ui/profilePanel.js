(() => {
  'use strict';
  const el = id => document.getElementById(id);
  let focusedId = null;
  const label = (id, value) => { el(id).textContent = String(value ?? '—'); };

  function snapshot() {
    if (typeof window.LHMProfileContextData !== 'function') return { profiles: [], activeIds: [] };
    return window.LHMProfileContextData();
  }
  function render() {
    const { profiles, activeIds } = snapshot();
    if (!profiles.some(profile => profile.id === focusedId)) focusedId = profiles[0]?.id || null;
    const profile = profiles.find(p => p.id === focusedId);
    const selected = Boolean(profile);
    el('lhm-context-empty').hidden = selected;
    el('lhm-context-content').hidden = !selected;
    for (const row of document.querySelectorAll('#profile-list-body tr[data-profile-id]')) {
      row.classList.toggle('lhm-row-focused',row.dataset.profileId===focusedId);
    }
    if (!selected) return;
    const running=activeIds.includes(profile.id);
    const proxy=profile.proxy || {type:'direct'};
    const proxied=proxy.type !== 'direct' && Boolean(proxy.host);
    const mode=profile.engine==='gecko'||profile.fingerprint?.mode==='native';
    label('lhm-detail-name',profile.name);
    label('lhm-detail-group',profile.group||'Nhóm mặc định');
    label('lhm-detail-id',profile.id);
    label('lhm-detail-group-value',profile.group||'Mặc định');
    label('lhm-detail-engine',profile.engine_type==='camoufox'?'Camoufox / Gecko':profile.engine==='gecko'?'Firefox / Gecko':'Chromium (cài trên máy)');
    const identityState=profile.engine_type==='camoufox'
      ?(profile.fingerprint?.identity?' · Danh tính đã ghim':' · Chưa cấp danh tính đã ghim'):'';
    label('lhm-detail-fingerprint',(mode?'Thông số gốc':'Tùy chỉnh / thử nghiệm')+identityState);
    label('lhm-detail-status',running?'Đang chạy':'Đã dừng');
    el('lhm-detail-status').classList.toggle('is-running',running);
    label('lhm-detail-proxy-type',proxied ? String(proxy.type||'').toUpperCase() : 'Trực tiếp');
    label('lhm-detail-proxy-address',proxied ? String(proxy.host)+':'+String(proxy.port||'') : 'Không sử dụng proxy');
    const url=profile.startUrl || 'about:blank';
    label('lhm-detail-url',url);
    label('lhm-detail-notes',profile.notes?.trim() || 'Chưa có ghi chú.');
    label('lhm-detail-open',running?'Dừng hồ sơ':'Mở hồ sơ');
  }
  function select(id) {
    if (typeof id!=='string'||!snapshot().profiles.some(p=>p.id===id)) return;
    focusedId=id;
    render();
  }
  function existingAction(className) {
    if (!focusedId) return;
    const button=[...document.querySelectorAll('#profile-list-body '+className)]
      .find(btn=>btn.dataset.id===focusedId);
    if (button) button.click();
    else el('lhm-context-refresh').title='Hồ sơ không ở bộ lọc hiện tại. Bỏ lọc để thao tác.';
  }
  function updateTabs() {
    const filter=el('filter-status');
    for(const tab of document.querySelectorAll('.lhm-list-tab')){
      const selected=tab.dataset.lhmStatus===filter.value;
      tab.classList.toggle('is-current',selected);
      tab.setAttribute('aria-pressed',String(selected));
    }
  }
  function init() {
    const table=el('profile-list-body');
    if(!table||!el('lhm-context-content'))return;
    table.addEventListener('click',event=>{
      if(event.target.closest('button,input,select,a')) return;
      const tr=event.target.closest('tr[data-profile-id]');
      if(tr)select(tr.dataset.profileId);
    });
    el('lhm-context-refresh').addEventListener('click',render);
    el('lhm-detail-open').addEventListener('click',()=>existingAction('.btn-toggle-run'));
    el('lhm-detail-edit').addEventListener('click',()=>existingAction('.btn-edit'));
    el('lhm-detail-health').addEventListener('click',()=>existingAction('.btn-health'));
    for(const tab of document.querySelectorAll('.lhm-list-tab')){
      tab.addEventListener('click',()=>{
        const filter=el('filter-status');
        filter.value=tab.dataset.lhmStatus;
        filter.dispatchEvent(new Event('change',{bubbles:true}));
        updateTabs();
      });
    }
    el('filter-status').addEventListener('change',updateTabs);
    updateTabs();
    render();
  }
  window.LHMProfilePanel={refresh:render,select};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();