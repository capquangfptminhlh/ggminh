'use strict';
(() => {
  // All metrics come from the application's real local overview;
  // no sample values are injected into production data.
  const el=id=>document.getElementById(id);
  let fetching=false;
  let lastSnapshot=null;
  const navigate=id=>el(id)?.click();

  function display(id,value){
    const node=el(id);
    if(!node)return;
    const text=String(Number.isFinite(value)?Math.max(0,value):'—');
    if(node.textContent===text)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduce) {
      node.classList.remove('lhm-v6-count-pop');
      void node.offsetWidth;
      node.classList.add('lhm-v6-count-pop');
    }
    node.textContent=text;
  }
  function refreshFromProfiles(profiles,activeCount){
    if(!Array.isArray(profiles))return;
    display('lhm-v6-total',profiles.length);
    display('lhm-v6-running',activeCount);
  }
  function apply(snapshot){
    if(!snapshot||!snapshot.profiles||!snapshot.proxies||!snapshot.automation)
      throw Error('Dữ liệu overview không hợp lệ');
    lastSnapshot=snapshot;
    const p=snapshot.profiles;
    display('lhm-v6-total',p.total);
    display('lhm-v6-running',p.active);
    display('lhm-v6-proxies',snapshot.proxies.verified);
    display('lhm-v6-workflows',snapshot.automation.total);
    display('lhm-v6-attention',p.errors+p.warnings);
    display('lhm-v6-automation',snapshot.automation.total);
    const notice=el('lhm-v6-refresh');
    notice.title='Dữ liệu lúc '+new Date().toLocaleTimeString('vi-VN');
  }
  async function refresh(){
    if(fetching)return;
    fetching=true;
    const button=el('lhm-v6-refresh');
    button.disabled=true;button.classList.add('is-loading');
    try{
      apply(await window.api.dashboardOverview());
    }catch(error){
      button.title='Không đọc được số liệu: '+error.message;
    }finally{
      fetching=false;button.disabled=false;button.classList.remove('is-loading');
    }
  }
  function init(){
    const globalSearch=el('lhm-v6-global-search'),filter=el('search-input');
    if(!globalSearch||!filter)return;
    let syncing=false;
    function mirror(source,target){
      if(syncing)return;
      syncing=true;
      target.value=source.value;
      target.dispatchEvent(new Event('input',{bubbles:true}));
      syncing=false;
    }
    globalSearch.addEventListener('input',()=>{
      mirror(globalSearch,filter);
      if(document.body.dataset.view!=='profiles')
        window.LHMMissionControl?.switchView('profiles');
    });
    filter.addEventListener('input',()=>{
      if(!syncing)globalSearch.value=filter.value;
    });
    document.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        if(document.body.dataset.view!=='profiles')
          window.LHMMissionControl?.switchView('profiles');
        globalSearch.focus();globalSearch.select();
      }
    });
    const actions={
      'lhm-v6-import':'btn-import-profiles',
      'lhm-v6-bulk':'btn-bulk-create',
      'lhm-v6-studio':'btn-open-studio',
      'lhm-v6-ai-open':'btn-ai-advisor',
      'lhm-v6-studio-open':'btn-open-studio'
    };
    for(const [id,target] of Object.entries(actions))
      el(id).addEventListener('click',()=>navigate(target));
    el('lhm-v6-refresh').addEventListener('click',refresh);
    refresh();
    // Keep overview fresh while the default workspace is visible. The
    // underlying dashboard endpoint returns metadata only, not sessions.
    setInterval(()=>{
      if(document.body.dataset.view==='profiles'&&!document.hidden&&
         !document.querySelector('.modal-overlay.open'))refresh();
    },20000);
  }
  window.LHMPremiumWorkspace={refresh,refreshFromProfiles};
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();