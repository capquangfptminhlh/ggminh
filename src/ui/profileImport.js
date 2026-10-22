'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.getElementById('modal-import-profiles');
  const button=document.getElementById('btn-import-profiles');
  const fileInput=document.getElementById('profile-import-file');
  const area=document.getElementById('profile-import-text');
  const previewButton=document.getElementById('profile-import-preview');
  const commitButton=document.getElementById('profile-import-commit');
  const message=document.getElementById('profile-import-status');
  let verifiedText=null;
  function close(){dialog.classList.remove('open');}
  function invalidate(){
    verifiedText=null;commitButton.disabled=true;
    message.textContent='Xem trước để kiểm tra mọi dòng trước khi nhập.';
  }
  button.addEventListener('click',()=>{
    dialog.classList.add('open');
    area.focus();
  });
  for(const id of ['profile-import-close','profile-import-cancel'])
    document.getElementById(id).addEventListener('click',close);
  area.addEventListener('input',invalidate);
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    if(file.size>256*1024){
      message.textContent='File vượt quá 256 KB; không thể nhập.';
      invalidate();return;
    }
    try{area.value=await file.text();invalidate();}
    catch(error){message.textContent='Đọc file thất bại: '+error.message;}
  });
  document.getElementById('profile-import-sample').addEventListener('click',()=>{
    area.value=[
      'name,group,engine,startUrls,tags,notes,proxyType,proxyHost,proxyPort',
      '"Agency 01","Khách hàng A",chromium,"https://ads.google.com/|https://example.com/","Marketing|Chính thức","Phiên mới",direct,,',
      '"Agency 02","Khách hàng B",gecko,"https://example.org/","QA","Thử nghiệm",direct,,'
    ].join('\r\n');
    invalidate();
  });
  previewButton.addEventListener('click',async()=>{
    verifiedText=null;commitButton.disabled=true;previewButton.disabled=true;
    message.textContent='Đang kiểm tra dữ liệu...';
    try{
      const current=area.value;
      const result=await window.api.previewProfileCsv(current);
      verifiedText=current;
      message.textContent='Hợp lệ: '+result.count+' hồ sơ; '+
        result.groups.length+' nhóm; '+result.configuredProxies+
        ' proxy cấu hình (chưa được kiểm tra kết nối). '+result.note;
      commitButton.disabled=false;
    }catch(error){message.textContent='Không hợp lệ: '+error.message;}
    finally{previewButton.disabled=false;}
  });
  commitButton.addEventListener('click',async()=>{
    if(!verifiedText || verifiedText!==area.value){invalidate();return;}
    if(!confirm('Tạo '+(await window.api.previewProfileCsv(verifiedText)).count+
      ' profile mới, mỗi profile có phiên trống và không mang cookies?'))return;
    commitButton.disabled=true;previewButton.disabled=true;
    try{
      const saved=await window.api.importProfilesCsv(verifiedText);
      close();verifiedText=null;
      await loadProfiles();
      alert('Đã nhập '+saved.count+' profile mới vào thiết bị.');
    }catch(error){
      message.textContent='Nhập không thành công: '+error.message;
    }finally{previewButton.disabled=false;}
  });
});