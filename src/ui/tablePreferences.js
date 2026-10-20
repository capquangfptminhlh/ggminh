'use strict';
(() => {
  const KEY='lhm.tablePreferences.v1';
  const OPTIONAL_COLUMNS=['id','proxy','engine','status'];
  const defaults=()=>({visible:{id:true,proxy:true,engine:true,status:true},density:'comfortable'});
  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY)||'null');
      if(!raw || typeof raw!=='object')return defaults();
      const out=defaults();
      for(const col of OPTIONAL_COLUMNS){
        if(typeof raw.visible?.[col]==='boolean')out.visible[col]=raw.visible[col];
      }
      if(['compact','comfortable'].includes(raw.density))out.density=raw.density;
      return out;
    }catch(_){return defaults();}
  }
  let prefs=load();
  const el=id=>document.getElementById(id);
  function apply(){
    const table=document.querySelector('.profile-table');
    if(!table)return;
    table.classList.toggle('lhm-table-compact',prefs.density==='compact');
    for(const cell of table.querySelectorAll('[data-table-col]')){
      const name=cell.dataset.tableCol;
      cell.hidden=OPTIONAL_COLUMNS.includes(name) && !prefs.visible[name];
    }
  }
  function sync(){
    for(const box of document.querySelectorAll('[data-table-column]')){
      box.checked=prefs.visible[box.dataset.tableColumn]!==false;
    }
    el('table-density').value=prefs.density;
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(_){}
    apply();
  }
  function init(){
    const button=el('btn-table-options'),panel=el('table-options-panel');
    if(!button||!panel)return;
    button.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;
      button.setAttribute('aria-expanded',String(!panel.hidden));
    });
    for(const box of document.querySelectorAll('[data-table-column]')){
      box.addEventListener('change',()=>{
        const key=box.dataset.tableColumn;
        if(!OPTIONAL_COLUMNS.includes(key))return;
        prefs.visible[key]=box.checked;save();
      });
    }
    el('table-density').addEventListener('change',event=>{
      if(['compact','comfortable'].includes(event.target.value)){
        prefs.density=event.target.value;save();
      }
    });
    el('table-options-reset').addEventListener('click',()=>{
      prefs=defaults();sync();save();
    });
    sync();apply();
  }
  window.LHMTablePreferences={apply};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();