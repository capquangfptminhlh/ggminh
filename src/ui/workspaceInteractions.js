'use strict';
(() => {
  // UI-only shortcuts; all operations stay in their existing, guarded handlers.
  const el=id=>document.getElementById(id);
  const storageKey='lhm.workspace.rail.v1';
  const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const commands=Object.freeze([
    {id:'profiles',title:'Danh sách hồ sơ',detail:'Chuyển sang màn hình Browser Profiles',tag:'Điều hướng',action:()=>window.LHMMissionControl?.switchView('profiles')},
    {id:'dashboard',title:'Dashboard tổng quan',detail:'Xem thống kê, tình trạng hồ sơ và proxy',tag:'Điều hướng',action:()=>window.LHMMissionControl?.switchView('dashboard')},
    {id:'search',title:'Tìm kiếm hồ sơ',detail:'Tìm bằng tên, mã hồ sơ hoặc nhóm',tag:'Hồ sơ',action:()=>{window.LHMMissionControl?.switchView('profiles');el('lhm-v6-global-search')?.focus();}},
    {id:'create',title:'Tạo hồ sơ mới',detail:'Tạo phiên trình duyệt cục bộ',tag:'Hồ sơ',target:'btn-create-profile'},
    {id:'quick',title:'Tạo nhanh nhiều hồ sơ',detail:'Dùng trình tạo hàng loạt có kiểm tra giới hạn',tag:'Hồ sơ',target:'btn-bulk-create'},
    {id:'import',title:'Nhập hồ sơ từ CSV',detail:'Kiểm tra trước khi nhập dữ liệu',tag:'Hồ sơ',target:'btn-import-profiles'},
    {id:'proxy',title:'Proxy Center',detail:'Kiểm tra và quản lý kết nối proxy',tag:'Công cụ',target:'btn-proxy-center'},
    {id:'studio',title:'Automation Studio',detail:'Mở quy trình tự động hóa được phê duyệt',tag:'Công cụ',target:'btn-open-studio'},
    {id:'ai',title:'AI Advisor',detail:'Mở tư vấn AI theo yêu cầu',tag:'Công cụ',target:'btn-ai-advisor'},
    {id:'backup',title:'Sao lưu cấu hình',detail:'Xuất dữ liệu cấu hình cục bộ',tag:'Công cụ',target:'btn-config-backup'},
    {id:'window',title:'Quản lý cửa sổ',detail:'Sắp xếp các cửa sổ trình duyệt đang chạy',tag:'Công cụ',target:'btn-window-manager'},
    {id:'about',title:'Thông tin phần mềm',detail:'Xem phiên bản và license hiện tại',tag:'Công cụ',target:'btn-app-about'}
  ]);
  let selected=0,visible=[],previousFocus=null;
  function railEnabled(){return document.body.dataset.view==='profiles'&&window.innerWidth>1270;}
  function saveRail(expanded){
    try{window.localStorage.setItem(storageKey,expanded?'open':'closed');}catch(_){}
  }
  function setRail(expanded,{persist=true}={}){
    const rail=el('lhm-profile-panel'),show=el('lhm-v7-show-rail');
    if(!rail||!show)return;
    if(!expanded&&rail.contains(document.activeElement))show.focus();
    document.body.classList.toggle('lhm-v7-wide',!expanded);
    rail.setAttribute('aria-hidden',String(!expanded));
    // When hidden, the entire rail must be skipped in keyboard tab order.
    rail.inert=!expanded;
    show.setAttribute('aria-expanded',String(expanded));
    el('lhm-v7-rail-label').textContent=expanded?'Thu gọn bảng AI':'Hiện bảng AI';
    show.title=expanded?'Thu gọn bảng điều khiển bên phải':'Hiện AI Control Center và thông tin hồ sơ';
    if(persist)saveRail(expanded);
  }
  function setSelected(index){
    selected=Math.min(Math.max(index,0),Math.max(visible.length-1,0));
    for(const [i,node] of [...el('lhm-v7-command-list').children].entries()){
      node.classList.toggle('is-selected',i===selected);
      node.setAttribute('aria-selected',String(i===selected));
      if(i===selected){node.id='lhm-v7-option-selected';node.scrollIntoView({block:'nearest'});}
      else node.removeAttribute('id');
    }
    if(visible.length)el('lhm-v7-command-search').setAttribute('aria-activedescendant','lhm-v7-option-selected');
    else el('lhm-v7-command-search').removeAttribute('aria-activedescendant');
  }
  function render(){
    const root=el('lhm-v7-command-list'),query=fold(el('lhm-v7-command-search').value.trim());
    visible=commands.filter(cmd=>!query||fold([cmd.title,cmd.detail,cmd.tag].join(' ')).includes(query));
    root.replaceChildren();
    if(!visible.length){
      const item=document.createElement('p');
      item.className='lhm-v7-no-results';item.textContent='Không tìm thấy lệnh phù hợp.';
      root.append(item);return;
    }
    for(const [index,cmd] of visible.entries()){
      const button=document.createElement('button');
      button.type='button';button.className='lhm-v7-command-option';
      button.setAttribute('role','option');button.dataset.commandId=cmd.id;
      const body=document.createElement('span');body.className='lhm-v7-command-copy';
      const title=document.createElement('strong');title.textContent=cmd.title;
      const hint=document.createElement('small');hint.textContent=cmd.detail;
      body.append(title,hint);
      const label=document.createElement('span');label.className='lhm-v7-command-tag';label.textContent=cmd.tag;
      button.append(body,label);
      button.addEventListener('pointermove',()=>{if(selected!==index)setSelected(index);});
      button.addEventListener('click',()=>run(cmd));
      root.append(button);
    }
    setSelected(0);
  }
  function paletteVisible(){return el('lhm-v7-command-palette').classList.contains('open');}
  function open(){
    if(paletteVisible())return;
    // Avoid placing two modal dialogs on top of each other.
    if(document.querySelector('.modal-overlay.open'))return;
    previousFocus=document.activeElement;
    const modal=el('lhm-v7-command-palette');
    modal.classList.add('open');document.body.classList.add('lhm-v7-palette-open');
    el('lhm-v7-command-search').value='';render();
    el('lhm-v7-command-search').focus();
  }
  function close({restoreFocus=true}={}){
    const modal=el('lhm-v7-command-palette');
    if(!modal.classList.contains('open'))return;
    modal.classList.remove('open');document.body.classList.remove('lhm-v7-palette-open');
    if(restoreFocus&&previousFocus?.isConnected)previousFocus.focus();
  }
  function run(cmd){
    close({restoreFocus:false});
    if(cmd.action)cmd.action();
    else if(cmd.target)el(cmd.target)?.click();
  }
  function editing(node){
    return node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName||'');
  }
  function init(){
    const modal=el('lhm-v7-command-palette');
    if(!modal||!el('lhm-v7-show-rail'))return;
    let initial=true;
    try{initial=window.localStorage.getItem(storageKey)!=='closed';}catch(_){}
    setRail(initial,{persist:false});
    el('lhm-v7-show-rail').addEventListener('click',()=>{
      if(railEnabled())setRail(document.body.classList.contains('lhm-v7-wide'));
    });
    el('lhm-v7-hide-rail').addEventListener('click',()=>{if(railEnabled())setRail(false);});
    el('lhm-v7-command-open').addEventListener('click',open);
    el('lhm-v7-command-close').addEventListener('click',()=>close());
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    el('lhm-v7-command-search').addEventListener('input',render);
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key==='ArrowDown'){event.preventDefault();setSelected(selected+1);}
      if(event.key==='ArrowUp'){event.preventDefault();setSelected(selected-1);}
      if(event.key==='Enter'&&!event.isComposing&&visible.length){
        event.preventDefault();run(visible[selected]);
      }
      if(event.key==='Tab'){
        // Keep focus inside the dialog. Palette options are selected via arrows.
        event.preventDefault();
        el(event.shiftKey?'lhm-v7-command-close':'lhm-v7-command-search').focus();
      }
    });
    document.addEventListener('keydown',event=>{
      const hotkey=(event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='p';
      if(hotkey){event.preventDefault();if(paletteVisible())close();else open();return;}
      if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='b'&&
         !editing(event.target)&&railEnabled()&&!paletteVisible()){
        event.preventDefault();setRail(document.body.classList.contains('lhm-v7-wide'));
      }
    });
  }
  window.LHMWorkspaceInteractions={setRail,openPalette:open,closePalette:close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();