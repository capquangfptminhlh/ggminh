'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-session-snapshots');
 const profile=el('snapshots-profile'),password=el('snapshots-password');
 const list=el('snapshots-list'),status=el('snapshots-status');
 const create=el('snapshots-create');
 const button=(text,variant,callback)=>{
  const node=document.createElement('button');
  node.type='button';node.textContent=text;node.className='btn btn-sm '+variant;
  node.addEventListener('click',callback);
  return node;
 };
 const selected=()=>profile.value;
 async function profiles(){
  const old=profile.value,all=await window.api.getProfiles();
  const live=new Set((await window.api.getActiveBrowsers()).map(x=>x.profileId));
  profile.replaceChildren();
  profile.add(new Option('Chọn hồ sơ đã đóng',''));
  for(const p of all.filter(x=>!live.has(x.id)))
   profile.add(new Option(p.name+(p.engine==='gecko'?' · Firefox':' · Chromium'),p.id));
  if([...profile.options].some(x=>x.value===old))profile.value=old;
 }
 async function refresh(){
  list.replaceChildren();
  if(!selected()){status.textContent='Chọn hồ sơ đã đóng để xem snapshot.';return;}
  const saved=await window.api.listSessionSnapshots(selected());
  if(!saved.length){
   const empty=document.createElement('p');empty.textContent='Chưa có snapshot nào.';
   list.append(empty);return;
  }
  for(const snapshot of saved){
   const row=document.createElement('div');row.className='lhm-snapshot-entry';
   const desc=document.createElement('div');
   const heading=document.createElement('strong');
   heading.textContent=new Date(snapshot.createdAt).toLocaleString('vi-VN');
   const detail=document.createElement('p');
   detail.textContent=snapshot.fileCount+' tệp · '+
    (snapshot.encryptedBytes/1024/1024).toFixed(2)+' MB mã hóa';
   desc.append(heading,detail);
   const actions=document.createElement('div');actions.className='buttons';
   actions.append(button('Xem trước','btn-secondary',async()=>{
    try{
     const info=await window.api.inspectSessionSnapshot(selected(),snapshot.id,password.value);
     status.textContent='Snapshot hợp lệ: '+info.files+' tệp · '+
      (info.bytes/1024/1024).toFixed(2)+' MB. '+info.warning;
    }catch(error){status.textContent='Không đọc được snapshot: '+error.message;}
   }));
   actions.append(button('Xuất file','btn-secondary',async()=>{
    if(!password.value||!selected()){
     status.textContent='Nhập mật khẩu snapshot trước khi xuất file.';return;
    }
    try{
     const out=await window.api.exportEncryptedSnapshot(selected(),snapshot.id,password.value);
     if(out.canceled)return;
     status.textContent='Đã xuất '+out.files+' tệp được mã hóa tới: '+out.filePath+
      '. Giữ riêng file và mật khẩu.';
     password.value='';
    }catch(error){status.textContent='Không thể xuất file: '+error.message;}
   }));
   actions.append(button('Khôi phục','btn-primary',async()=>{
    if(!password.value||!selected()){status.textContent='Hãy nhập mật khẩu trước.';return;}
    if(!confirm('KHÔI PHỤC SẼ THAY THẾ CÁC FILE PHIÊN HIỆN TẠI. Bạn đã sao lưu trạng thái hiện tại và đóng trình duyệt?'))return;
    const typed=prompt('Để xác nhận, nhập chính xác: KHOI PHUC');
    if(typed!=='KHOI PHUC'){status.textContent='Đã hủy thao tác.';return;}
    try{
     const report=await window.api.restoreSessionSnapshot(selected(),snapshot.id,password.value,typed);
     password.value='';
     status.textContent='Đã khôi phục '+report.files+' file. Có thể mở lại trình duyệt để kiểm tra.';
     await refresh();
    }catch(error){status.textContent='Khôi phục thất bại: '+error.message;}
   }));
   actions.append(button('Xóa','btn-danger',async()=>{
    if(!confirm('Xóa vĩnh viễn snapshot này? Không thể hoàn tác.'))return;
    const typed=prompt('Xác nhận xóa snapshot: nhập XOA SNAPSHOT');
    if(typed!=='XOA SNAPSHOT')return;
    try{
     await window.api.removeSessionSnapshot(selected(),snapshot.id,typed);
     status.textContent='Đã xóa snapshot.';await refresh();
    }catch(error){status.textContent='Không xóa được: '+error.message;}
   }));
   row.append(desc,actions);list.append(row);
  }
 }
 async function show(){
  modal.classList.add('open');
  status.textContent='';
  try{await profiles();await refresh();}
  catch(error){status.textContent='Không thể mở Snapshots: '+error.message;}
 }
 el('btn-session-snapshots').addEventListener('click',show);
 function close(){password.value='';modal.classList.remove('open');}
 el('snapshots-close').addEventListener('click',close);
 el('snapshots-done').addEventListener('click',close);
 profile.addEventListener('change',()=>refresh().catch(e=>{status.textContent=e.message;}));
 el('snapshots-import').addEventListener('click',async()=>{
  if(!selected()||password.value.length<12){
   status.textContent='Chọn hồ sơ đích và nhập mật khẩu dài ít nhất 12 ký tự.';return;
  }
  if(!confirm('Chỉ nhập file snapshot do chính bạn sở hữu. File phải thuộc đúng profile ID và loại trình duyệt. Tiếp tục?'))return;
  const button=el('snapshots-import');button.disabled=true;
  try{
   const res=await window.api.importEncryptedSnapshot(selected(),password.value);
   if(res.canceled)return;
   status.textContent='Đã nhập '+res.files+' tệp vào kho snapshot mã hóa. Chưa khôi phục dữ liệu phiên.';
   password.value='';await refresh();
  }catch(error){status.textContent='Nhập file thất bại: '+error.message;}
  finally{button.disabled=false;}
 });
 el('snapshots-refresh').addEventListener('click',async()=>{
  try{await profiles();await refresh();}
  catch(error){status.textContent=error.message;}
 });
 create.addEventListener('click',async()=>{
  if(!selected()||password.value.length<12){
   status.textContent='Hãy chọn profile và nhập mật khẩu ít nhất 12 ký tự.';return;
  }
  if(!confirm('Tạo bản sao lưu dữ liệu phiên mã hóa trên máy này? Bạn có trách nhiệm giữ mật khẩu.'))return;
  create.disabled=true;
  try{
   const entry=await window.api.createSessionSnapshot(selected(),password.value);
   status.textContent='Đã lưu snapshot '+entry.fileCount+' tệp; mật khẩu không được lưu.';
   password.value='';await refresh();
  }catch(error){status.textContent='Không tạo được: '+error.message;}
  finally{create.disabled=false;}
 });
});