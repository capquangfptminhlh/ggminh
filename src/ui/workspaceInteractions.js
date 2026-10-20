'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const STATE_KEY='lhm-workspace-rail-v1';
 const MOTION_KEY='lhm-workspace-motion-v1';
 const ACTIONS=Object.freeze([
  {label:'Tất cả hồ sơ',hint:'Danh sách profile',action:'profiles',search:'profile hồ sơ danh sách'},
  {label:'Dashboard',hint:'Số liệu cục bộ',action:'dashboard',search:'tổng quan'},
  {label:'Tạo hồ sơ mới',hint:'Mở cửa sổ tạo hồ sơ',action:'btn-create-profile',search:'thêm tạo profile'},
  {label:'Nhập danh sách CSV',hint:'Nhập hồ sơ từ tệp',action:'btn-import-profiles',search:'import csv'},
  {label:'Tạo hồ sơ hàng loạt',hint:'Tạo từ mẫu',action:'btn-bulk-create',search:'bulk nhanh'},
  {label:'Quản lý proxy',hint:'Kiểm tra kết nối và proxy',action:'btn-proxy-center',search:'mạng kết nối ip'},
  {label:'Automation Studio',hint:'Mở quy trình tự động hóa',action:'btn-open-studio',search:'rpa quy trình'},
  {label:'AI Advisor',hint:'Mở trợ lý AI',action:'btn-ai-advisor',search:'trợ lý'},
  {label:'Snapshot & khôi phục',hint:'Sao lưu phiên mã hóa',action:'btn-session-snapshots',search:'backup restore'},
  {label:'Giấy phép & gia hạn',hint:'Xem trạng thái license',action:'btn-license-center',search:'thuê bao'},
  {label:'Kiểm tra sức khỏe hồ sơ',hint:'Chẩn đoán cấu hình',action:'btn-profile-health',search:'health check'},
  {label:'Quản lý cửa sổ',hint:'Sắp xếp browser đang chạy',action:'btn-window-manager',search:'window tile'},
  {label:'Thùng rác',hint:'Khôi phục hồ sơ đã xóa',action:'btn-trash-profiles',search:'recycle'}
 ]);
 const norm=text=>String(text||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')
  .toLocaleLowerCase('vi').trim();
 let selected=0;
 let results=[];
 let previousFocus=null;
 let initialized=false;
 let shown=false;
 function isTyping(node){
  return !!node&&(node.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(node.tagName));
 }
 function setRail(visible){
  document.body.dataset.lhmRail=visible?'open':'closed';
  $('lhm-v7-show-rail').setAttribute('aria-expanded',String(visible));
  $('lhm-v7-rail-label').textContent=visible?'Thu gọn bảng AI':'Hiển thị bảng AI';
  try{localStorage.setItem(STATE_KEY,visible?'open':'closed');}catch(_){}
 }
 function toggleRail(){setRail(document.body.dataset.lhmRail==='closed');}
 function setMotion(enabled){
  document.body.dataset.lhmMotion=enabled?'on':'off';
  const control=$('lhm-v7-motion-toggle');
  control.textContent=enabled?'Hiệu ứng: Bật':'Hiệu ứng: Tắt';
  control.setAttribute('aria-pressed',String(enabled));
  try{localStorage.setItem(MOTION_KEY,enabled?'on':'off');}catch(_){}
 }
 function toggleMotion(){setMotion(document.body.dataset.lhmMotion!=='on');}
 function profileCommands(query){
  const snapshot=window.LHMProfileContextData?.();
  const profiles=Array.isArray(snapshot?.profiles)?snapshot.profiles:[];
  if(!query)return [];
  return profiles
   .filter(p=>{
    const text=[p.name,p.id,p.group,...(Array.isArray(p.tags)?p.tags:[])].join(' ');
    return norm(text).includes(query);
   })
   .slice(0,6)
   .map(p=>({
     label:String(p.name||p.id),
     hint:'Hồ sơ · '+String(p.group||'Mặc định'),
     action:'profile',
     profileId:p.id,
     profileName:p.name||p.id,
     search:norm(p.id+' '+(p.group||''))
   }));
 }
 function searchCommands(query){
  const needle=norm(query);
  const actions=ACTIONS.filter(a=>!needle||norm(a.label+' '+a.hint+' '+a.search).includes(needle));
  return [...actions.slice(0,needle?8:7),...profileCommands(needle)].slice(0,12);
 }
 function setSelected(index){
  if(!results.length)return;
  selected=(index+results.length)%results.length;
  const list=$('lhm-v7-command-list');
  const options=[...list.querySelectorAll('[role="option"]')];
  options.forEach((option,i)=>{
   option.setAttribute('aria-selected',String(i===selected));
   if(i===selected)option.scrollIntoView({block:'nearest'});
  });
  $('lhm-v7-command-search').setAttribute('aria-activedescendant',
   options[selected]?.id||'');
 }
 function render(){
  const list=$('lhm-v7-command-list');
  results=searchCommands($('lhm-v7-command-search').value);
  list.replaceChildren();
  if(!results.length){
   const empty=document.createElement('p');
   empty.className='lhm-v7-command-empty';
   empty.textContent='Không tìm thấy lệnh hay hồ sơ phù hợp.';
   list.append(empty);
   $('lhm-v7-command-search').removeAttribute('aria-activedescendant');
   return;
  }
  results.forEach((item,i)=>{
   const row=document.createElement('button');
   row.type='button';
   row.className='lhm-v7-command-item';
   row.id='lhm-v7-command-option-'+i;
   row.setAttribute('role','option');
   row.setAttribute('aria-selected','false');
   const icon=document.createElement('span');
   icon.className='lhm-v7-command-item-mark';
   icon.textContent=item.action==='profile'?'◉':'↗';
   const content=document.createElement('span');
   content.className='lhm-v7-command-item-copy';
   const title=document.createElement('strong');title.textContent=item.label;
   const hint=document.createElement('small');hint.textContent=item.hint;
   content.append(title,hint);
   const arrow=document.createElement('span');arrow.textContent='↵';
   arrow.className='lhm-v7-command-arrow';
   row.append(icon,content,arrow);
   row.addEventListener('mouseenter',()=>setSelected(i));
   row.addEventListener('click',()=>activate(i));
   list.append(row);
  });
  selected=Math.min(selected,results.length-1);
  setSelected(selected);
 }
 function close(){
  if(!shown)return;
  shown=false;
  const modal=$('lhm-v7-command-palette');
  modal.classList.remove('open');
  $('lhm-v7-command-search').value='';
  $('lhm-v7-command-search').removeAttribute('aria-activedescendant');
  if(previousFocus?.isConnected)previousFocus.focus();
 }
 function open(){
  if(shown)return;
  if(document.querySelector('.modal-overlay.open'))return;
  shown=true;previousFocus=document.activeElement;selected=0;
  $('lhm-v7-command-palette').classList.add('open');
  $('lhm-v7-command-search').value='';
  render();
  $('lhm-v7-command-search').focus();
 }
 function activate(index){
  const command=results[index];
  if(!command)return;
  close();
  if(command.action==='profiles'||command.action==='dashboard'){
   window.LHMMissionControl?.switchView(command.action);
   return;
  }
  if(command.action==='profile'){
   window.LHMMissionControl?.switchView('profiles');
   for(const id of ['filter-group','filter-tag','filter-engine','filter-proxy','filter-status']){
     const control=$(id);
     if(control){control.value='all';control.dispatchEvent(new Event('change',{bubbles:true}));}
   }
   const field=$('search-input');
   field.value=String(command.profileId);
   field.dispatchEvent(new Event('input',{bubbles:true}));
   $('lhm-v6-global-search').value=field.value;
   // Locating a saved profile is safe; no window is opened automatically.
   requestAnimationFrame(()=>document.querySelector(
    '#profile-list-body tr[data-profile-id="'+CSS.escape(String(command.profileId))+'"]')
    ?.scrollIntoView({block:'center',behavior:'smooth'}));
   return;
  }
  const trigger=$(command.action);
  trigger?.click();
 }
 function init(){
  if(initialized)return;initialized=true;
  const dialog=$('lhm-v7-command-palette');
  const input=$('lhm-v7-command-search');
  if(!dialog||!input||!$('lhm-v7-show-rail')||!$('lhm-v7-hide-rail'))return;
  try{setRail(localStorage.getItem(STATE_KEY)!=='closed');}catch(_){setRail(true);}
  try{setMotion(localStorage.getItem(MOTION_KEY)!=='off');}catch(_){setMotion(true);}
  $('lhm-v7-motion-toggle').addEventListener('click',toggleMotion);
  $('lhm-v7-show-rail').addEventListener('click',toggleRail);
  $('lhm-v7-hide-rail').addEventListener('click',()=>setRail(false));
  $('lhm-v7-command-open').addEventListener('click',open);
  $('lhm-v7-command-close').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  input.addEventListener('input',()=>{selected=0;render();});
  input.addEventListener('keydown',event=>{
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();setSelected(selected+(event.key==='ArrowDown'?1:-1));
   }else if(event.key==='Enter'){
    event.preventDefault();activate(selected);
   }else if(event.key==='Escape'){event.preventDefault();close();}
  });
  // Capture-phase prevents an older global search shortcut swallowing the
  // explicit Ctrl+Shift+P command-palette combination.
  document.addEventListener('keydown',event=>{
   const key=event.key.toLowerCase();
   if(event.key==='Escape'&&shown){event.preventDefault();event.stopImmediatePropagation();close();return;}
   if((event.ctrlKey||event.metaKey)&&event.shiftKey&&key==='p'){
    event.preventDefault();event.stopImmediatePropagation();
    shown?close():open();return;
   }
   if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&key==='b'&&!isTyping(event.target)){
    event.preventDefault();toggleRail();
   }
  },true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
 window.LHMWorkspaceInteractions={open,close,toggleRail,searchCommands};
})();
