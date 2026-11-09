'use strict';
// Compact profile workspace: the secondary filters and the per-row actions
// live in native <details> menus (keyboard and screen-reader semantics kept).
// Close them like the tools menu: outside click, Escape, or after an action.
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const filterMenu=el('lhm-filter-menu');
 const filterIds=['filter-group','filter-tag','filter-engine','filter-proxy'];
 const openRowMenus=()=>[...document.querySelectorAll('#profile-list-body details.lhm-row-more[open]')];

 function updateFilterCount(){
  const active=filterIds.filter(id=>el(id)&&el(id).value!=='all').length;
  const badge=el('lhm-filter-count');
  if(!badge)return;
  badge.textContent=String(active);
  badge.hidden=active===0;
  filterMenu?.classList.toggle('has-active',active>0);
 }
 for(const id of filterIds)el(id)?.addEventListener('change',updateFilterCount);
 el('lhm-filter-clear')?.addEventListener('click',()=>{
  for(const id of filterIds){
   const select=el(id);
   if(select&&select.value!=='all'){select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  updateFilterCount();
 });
 updateFilterCount();

 // Row menus are re-rendered with the table, so listen on the document.
 document.addEventListener('toggle',event=>{
  const menu=event.target;
  if(!(menu instanceof HTMLDetailsElement)||!menu.open||!menu.classList.contains('lhm-row-more'))return;
  for(const other of openRowMenus())if(other!==menu)other.open=false;
 },true);
 document.addEventListener('click',event=>{
  const item=event.target.closest?.('.lhm-row-menu button');
  if(item)item.closest('details').open=false;
  for(const menu of openRowMenus())if(!menu.contains(event.target))menu.open=false;
  if(filterMenu?.open&&!filterMenu.contains(event.target))filterMenu.open=false;
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const menu of openRowMenus()){menu.open=false;menu.querySelector('summary')?.focus();}
  if(filterMenu?.open){filterMenu.open=false;filterMenu.querySelector('summary')?.focus();}
 });
});

// UI rebuild phase 8: dialogs split into tabs (.lhm-dialog-tabs) reopen on
// their first tab. A dialog's own script may pick another tab afterwards
// (AI Advisor opens its settings when no API key is saved).
window.addEventListener('DOMContentLoaded',()=>{
 for(const overlay of document.querySelectorAll('.modal-overlay')){
  const first=overlay.querySelector('.lhm-dialog-tabs .tab-btn');
  if(!first)continue;
  let wasOpen=overlay.classList.contains('open');
  new MutationObserver(()=>{
   const open=overlay.classList.contains('open');
   if(open&&!wasOpen)first.click();
   wasOpen=open;
  }).observe(overlay,{attributes:true,attributeFilter:['class']});
 }
});
