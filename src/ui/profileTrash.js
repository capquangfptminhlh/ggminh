'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const modal=document.getElementById('modal-profile-trash');
  const list=document.getElementById('trash-profile-list');
  const count=document.getElementById('trash-profile-count');
  const opener=document.getElementById('btn-trash-profiles');
  const btnExpired=document.getElementById('trash-dialog-expired');
  const close=()=>modal.classList.remove('open');
  const actionButton=(title,className,fn)=>{
    const button=document.createElement('button');
    button.type='button';button.className=className;button.textContent=title;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await fn();}
      catch(error){alert('Thao tác thất bại: '+error.message);}
      finally{button.disabled=false;}
    });
    return button;
  };
  async function refresh(){
    const records=await window.api.listTrashedProfiles();
    count.textContent=records.length+' hồ sơ đang lưu trong thùng rác';
    list.replaceChildren();
    if(!records.length){
      const empty=document.createElement('p');empty.textContent='Thùng rác đang trống.';
      empty.className='lhm-trash-empty';list.append(empty);return;
    }
    for(const profile of records){
      const row=document.createElement('div');row.className='lhm-trash-row';
      const summary=document.createElement('div');summary.className='lhm-trash-summary';
      const title=document.createElement('strong');title.textContent=profile.name;
      const info=document.createElement('span');
      const hours=Date.parse(profile.expiresAt)-Date.now();
      const left=Math.max(0,Math.ceil(hours/86400000));
      info.textContent=(profile.group||'Default')+' · '+profile.id+' · còn '+left+' ngày';
      summary.append(title,info);
      const actions=document.createElement('div');actions.className='lhm-trash-actions';
      const restore=actionButton('Khôi phục','btn btn-sm btn-primary',async()=>{
        await window.api.restoreTrashedProfile(profile.id);
        await refresh();await loadProfiles();
      });
      if(left===0)restore.disabled=true;
      actions.append(restore);
      actions.append(actionButton('Xóa vĩnh viễn','btn btn-sm btn-danger',async()=>{
        const input=prompt('Nhập XOA để xóa vĩnh viễn profile "'+profile.name+
          '" và dữ liệu trình duyệt cục bộ. Không thể hoàn tác.');
        if(input!=='XOA')return;
        await window.api.purgeTrashedProfile(profile.id);
        await refresh();
      }));
      row.append(summary,actions);list.append(row);
    }
  }
  opener.addEventListener('click',async()=>{
    modal.classList.add('open');
    try{await refresh();}
    catch(error){count.textContent='Không thể tải thùng rác: '+error.message;}
  });
  for(const id of ['trash-dialog-close','trash-dialog-done'])
    document.getElementById(id).addEventListener('click',close);
  document.getElementById('trash-dialog-refresh').addEventListener('click',()=>refresh().catch(error=>alert('Không tải lại được thùng rác: '+error.message+'\nDữ liệu đang hiển thị có thể chưa mới — hãy thử lại.')));
  btnExpired.addEventListener('click',async()=>{
    btnExpired.disabled=true;
    try{
      const data=await window.api.purgeExpiredTrash();
      await refresh();
      alert('Đã dọn '+data.purged+' hồ sơ quá hạn. '+data.pending+' thư mục đang chờ xử lý lại.');
    }catch(error){alert('Dọn thùng rác thất bại: '+error.message);}
    finally{btnExpired.disabled=false;}
  });
});