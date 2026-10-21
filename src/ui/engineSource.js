'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const modal=el('modal-engine-source'),trigger=el('btn-engine-source');
 if(!modal||!trigger)return;
 const selector=el('engine-source-select');
 const result=el('engine-source-result');
 const geckoChoice=el('engine-gecko-provider');
 const geckoResult=el('engine-gecko-result');
 const installInfo=el('camoufox-install-info');
 const installButton=el('camoufox-install-button');
 let releaseAvailable=false;
 let busy=false;
 function busyState(value){
  busy=value;
  for(const id of ['engine-source-select','engine-source-save','engine-source-refresh',
   'engine-gecko-provider','engine-gecko-save'])
   el(id).disabled=value;
  installButton.disabled=value||!releaseAvailable;
 }
 async function refresh(){
  busyState(true);
  try{
   const {source,bundle,geckoProvider,camoufox}=await window.api.bundledEngineStatus();
   selector.value=source;
   geckoChoice.value=geckoProvider;
   const availability=await window.api.camoufoxInstallStatus();
   releaseAvailable=availability.available&&!availability.alreadyInstalled;
   installButton.disabled=busy||!releaseAvailable;
   installInfo.textContent=!availability.runtime?.ready?
     'Chưa thể cài Camoufox: '+availability.runtime.reason+'.':
     availability.alreadyInstalled?
       'Engine Camoufox đã được xác minh trong thư mục dữ liệu ứng dụng.':
     availability.available?'Có bản Camoufox được LHM ký số: '+availability.version+
       '. Cần xác nhận riêng trước khi tải.':
       'Chưa có bản Camoufox được LHM ký và phê duyệt; nút cài đặt chưa khả dụng.';
   geckoResult.textContent=camoufox.ready?
     'Camoufox EXE đã xác minh chữ ký · '+camoufox.version+
       '. Chỉ mở cửa sổ thủ công; không có Playwright hoặc proxy/GeoIP tự động.':
     'Camoufox chưa sẵn sàng: cần bản EXE Windows được LHM ký riêng và xác minh SHA-256. Không yêu cầu Node 22; chưa hỗ trợ proxy hoặc Automation Studio.';
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
 installButton.addEventListener('click',async()=>{
  if(busy||!releaseAvailable)return;
  busyState(true);
  installInfo.textContent='Đang thực hiện quy trình tải và xác minh engine đã ký…';
  try{
   const result=await window.api.installCamoufoxEngine();
   if(result.canceled)installInfo.textContent='Đã hủy cài đặt.';
   else{
    installInfo.textContent='Đã cài và xác minh Camoufox '+result.version+
      '. Không tự chuyển hoặc sao chép session giữa các engine.';
    releaseAvailable=false;
   }
  }catch(error){
   installInfo.textContent='Cài Camoufox không thành công: '+error.message;
  }finally{busyState(false);}
 });
 el('engine-gecko-save').addEventListener('click',async()=>{
  const provider=geckoChoice.value;
  if(!['firefox','camoufox'].includes(provider))return;
  if(!window.confirm('Đổi Firefox provider thành '+provider+'? Cần đóng toàn bộ browser.'))return;
  busyState(true);
  try{
   const data=await window.api.selectCamoufoxProvider(provider);
   geckoResult.textContent=data.provider==='camoufox'?
    'Đã chọn Camoufox chạy trực tiếp (preview). Chỉ duyệt web thủ công với profile native/direct.':
    'Đã trở về Firefox đã cài trên máy.';
  }catch(error){geckoResult.textContent='Không đổi được provider: '+error.message;}
  finally{busyState(false);}
 });
});
