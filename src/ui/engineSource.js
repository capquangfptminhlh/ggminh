'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const modal=el('modal-engine-source'),trigger=el('btn-engine-source');
 if(!modal||!trigger)return;
 const selector=el('engine-source-select');
 const result=el('engine-source-result');
 let busy=false;
 function busyState(value){
  busy=value;
  for(const id of ['engine-source-select','engine-source-save','engine-source-refresh'])
   el(id).disabled=value;
 }
 async function refresh(){
  busyState(true);
  try{
   const {source,bundle}=await window.api.bundledEngineStatus();
   selector.value=source;
   result.textContent=bundle.valid?
    'Engine đóng gói hợp lệ · phiên bản '+bundle.version+
     ' · '+bundle.fileCount+' tệp · SHA-256: '+bundle.sha256.slice(0,16)+'…':
    'Chưa có engine đóng gói được xác thực: '+bundle.reason+
     '. Chế độ System vẫn hoạt động.';
  }catch(error){result.textContent='Không kiểm tra được Engine: '+error.message;}
  finally{busyState(false);}
 }
 function close(){
  if(busy)return;
  modal.classList.remove('open');
 }
 trigger.addEventListener('click',()=>{
  modal.classList.add('open');
  refresh();
 });
 el('engine-source-close').addEventListener('click',close);
 el('engine-source-done').addEventListener('click',close);
 el('engine-source-refresh').addEventListener('click',refresh);
 el('engine-source-save').addEventListener('click',async()=>{
  const source=selector.value;
  if(!['system','bundled'].includes(source))return;
  if(!window.confirm('Đổi nguồn khởi chạy Chromium sang '+source+
   '? Cần đóng toàn bộ trình duyệt hiện tại.'))return;
  busyState(true);
  try{
   const updated=await window.api.selectBundledEngine(source);
   result.textContent=updated.source==='bundled'?
    'Đã chọn engine đóng gói hợp lệ. Mỗi lần mở profile sẽ xác minh lại.':
    'Đã chọn trình duyệt hệ thống. Đường dẫn ghim hiện có vẫn được ưu tiên.';
  }catch(error){result.textContent='Không thay đổi Engine: '+error.message;}
  finally{busyState(false);}
 });
});
