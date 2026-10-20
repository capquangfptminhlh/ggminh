'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const modal=document.getElementById('modal-profile-csv-update');
  const text=document.getElementById('profile-update-text');
  const file=document.getElementById('profile-update-file');
  const commit=document.getElementById('profile-update-commit');
  const preview=document.getElementById('profile-update-preview');
  const status=document.getElementById('profile-update-status');
  let validated=null;
  const invalidate=()=>{
    validated=null;commit.disabled=true;
    status.textContent='Xem trước để xác nhận dữ liệu hợp lệ.';
  };
  const close=()=>modal.classList.remove('open');
  document.getElementById('btn-update-csv').addEventListener('click',()=>{
    modal.classList.add('open');text.focus();
  });
  for(const id of ['profile-update-close','profile-update-cancel'])
    document.getElementById(id).addEventListener('click',close);
  text.addEventListener('input',invalidate);
  file.addEventListener('change',async()=>{
    const chosen=file.files?.[0];if(!chosen)return;
    if(chosen.size>256*1024){invalidate();status.textContent='File quá 256 KB';return;}
    try{text.value=await chosen.text();invalidate();}
    catch(error){invalidate();status.textContent='Không đọc được file: '+error.message;}
  });
  document.getElementById('profile-update-example').addEventListener('click',async()=>{
    try{
      const profiles=await window.api.getProfiles();
      if(!profiles.length){alert('Chưa có profile để điền mẫu.');return;}
      const p=profiles[0];
      // Example uses only safe display metadata; no cookies or secrets.
      const csvCell=value=>'"'+String(value||'').replace(/"/g,'""')+'"';
      text.value='id,name,group,tags,notes,startUrls\r\n'+
        [p.id,p.name,p.group||'Default',(p.tags||[]).join('|'),p.notes||'',
          (p.startUrls||[p.startUrl]).join('|')].map(csvCell).join(',')+'\r\n';
      invalidate();
    }catch(error){status.textContent='Không thể đọc profile mẫu: '+error.message;}
  });
  preview.addEventListener('click',async()=>{
    commit.disabled=true;preview.disabled=true;validated=null;
    try{
      const input=text.value;
      const result=await window.api.previewProfileUpdateCsv(input);
      validated=input;
      status.textContent='Hợp lệ: '+result.count+' profile sẽ được sửa.\n'+
        result.preview.map(p=>p.id+' → '+p.name+' ('+p.group+')').join('\n');
      commit.disabled=false;
    }catch(error){status.textContent='Dữ liệu lỗi: '+error.message;}
    finally{preview.disabled=false;}
  });
  commit.addEventListener('click',async()=>{
    if(!validated||validated!==text.value){invalidate();return;}
    if(!confirm('Cập nhật thông tin '+(await window.api.previewProfileUpdateCsv(validated)).count+
      ' profile hiện có? Mọi thay đổi được kiểm tra và lưu cùng một lần.'))return;
    commit.disabled=true;preview.disabled=true;
    try{
      const result=await window.api.updateProfilesCsv(validated);
      close();validated=null;await loadProfiles();
      alert('Đã cập nhật '+result.count+' hồ sơ.');
    }catch(error){status.textContent='Cập nhật thất bại: '+error.message;}
    finally{preview.disabled=false;}
  });
});