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
 let localPinned=false;
 let busy=false;
 // The runtime gate reports raw English technical reasons; translate the
 // known ones into an explanation plus what the user can actually do.
 function camoufoxRuntimeGuidance(reason){
  const raw=String(reason||'');
  if(/Windows-only/i.test(raw))
   return 'Chưa thể cài Camoufox: bản Camoufox gốc chỉ chạy trên Windows, nên mục này '+
    'không khả dụng khi ứng dụng đang chạy ngoài Windows.';
  if(/publisher-signed|signed Camoufox EXE/i.test(raw))
   return 'Chưa thể cài Camoufox: chưa có bản Camoufox được LHM ký riêng để xác minh trên máy này. '+
    'Việc bạn có thể làm: dùng engine Chromium hoặc Firefox hệ thống trong lúc chờ, hoặc liên hệ '+
    'bên bán để nhận bản phát hành Camoufox đã ký. (Chi tiết kỹ thuật: '+raw+'.)';
  return 'Chưa thể cài Camoufox: '+(raw||'điều kiện chạy chưa sẵn sàng')+
   '. Thử bấm Làm mới; nếu vẫn vậy, hãy liên hệ bên bán kèm theo thông báo này.';
 }
 // The bundle check returns raw Node errors that carry install paths (and so
 // the Windows user name); never show those, explain the state instead.
 function bundledEngineGuidance(reason){
  const raw=String(reason||'');
  if(/ENOENT/.test(raw)&&/manifest\.json/i.test(raw))
   return 'Bản cài này không kèm engine Chromium đóng gói. Chế độ System vẫn hoạt động: '+
    'hồ sơ Chromium sẽ mở bằng Chrome hoặc Edge đã cài trên máy.';
  const detail=raw.replace(/'[^']*[\\/][^']*'|"[^"]*[\\/][^"]*"|[A-Za-z]:\\\S+/g,'[đường dẫn]');
  return 'Chưa có engine đóng gói được xác thực'+(detail?' ('+detail+')':'')+
   '. Chế độ System vẫn hoạt động.';
 }
 function localZipInstallGuidance(reason){
  const raw=String(reason||'');
  if(/ZIP hash mismatch|Invalid ZIP archive size or path/i.test(raw))
   return 'Tệp ZIP Camoufox không khớp với gói được hỗ trợ. Hãy chọn lại ZIP đã được cung cấp hoặc liên hệ hỗ trợ để nhận đúng tệp.';
  if(/không đủ dung lượng|ENOSPC/i.test(raw))
   return 'Không đủ dung lượng để cài Camoufox. Hãy giải phóng dung lượng trên ổ cài dữ liệu và thử lại.';
  if(/installation already exists/i.test(raw))
   return 'Thư mục engine Camoufox đã tồn tại. Hãy bấm Làm mới; nếu có cảnh báo, sao lưu thư mục trước khi liên hệ hỗ trợ.';
  if(/thư mục tạm từ lần nhập trước/i.test(raw))
   return 'Lần nhập trước còn thư mục tạm. Hãy đóng trình duyệt và liên hệ hỗ trợ để kiểm tra trước khi thử lại.';
  return 'Không thể cài Camoufox từ ZIP. Hãy thử lại; nếu vẫn lỗi, liên hệ hỗ trợ.';
 }
 window.LHMEngineGuidance={camoufoxRuntimeGuidance,bundledEngineGuidance};
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
   localPinned=availability.mode==='local-pinned';
   releaseAvailable=availability.available&&!availability.alreadyInstalled;
   if(localPinned){
    installButton.textContent='Chọn file ZIP Camoufox';
    installInfo.textContent=availability.invalidExisting?
     'Thư mục engine Camoufox hiện có không vượt qua kiểm tra. Hãy đóng trình duyệt và sao lưu thư mục engine Camoufox trước khi liên hệ hỗ trợ; ứng dụng không tự ghi đè.':
     availability.alreadyInstalled?
     'Camoufox đã được kiểm tra theo hash của gói. Có thể tạo hồ sơ và mở trình duyệt.':
     'Chọn file ZIP engine Camoufox 156.0.1 đã được cung cấp. Ứng dụng kiểm tra hash ZIP và từng file; gói không có chữ ký publisher.';
    geckoResult.textContent=camoufox.ready?
     'Camoufox đã kiểm tra hash và sẵn sàng dùng trực tiếp. Proxy chưa được hỗ trợ.':
     'Camoufox chưa sẵn sàng; hãy chọn file ZIP engine để cài.';
    result.textContent=bundle.valid?'Engine Chromium đóng gói hợp lệ · '+bundle.version:bundledEngineGuidance(bundle.reason);
    return;
   }
   installButton.disabled=busy||!releaseAvailable;
   installInfo.textContent=availability.alreadyInstalled?
     availability.runtime?.manualReady?
       'Engine Camoufox đã được xác minh trên máy này. '+
       'Bạn có thể tạo hồ sơ Camoufox; ứng dụng sẽ thử cấp danh tính đã ghim khi tạo hồ sơ.':
       camoufoxRuntimeGuidance(availability.runtime?.reason):
     !availability.runtime?.canInstall?
       camoufoxRuntimeGuidance(availability.runtime?.reason):
     availability.available?'Có bản Camoufox được LHM ký số: '+availability.version+
       '. Bấm nút cài đặt bên dưới để bắt đầu; ứng dụng sẽ hỏi xác nhận riêng trước khi tải.':
       'Chưa có bản Camoufox được LHM ký và phê duyệt; nút cài đặt chưa khả dụng. '+
       'Hãy liên hệ bên bán để nhận bản phát hành đã ký. Trong lúc chờ, hồ sơ Chromium và Firefox vẫn dùng được.';
   geckoResult.textContent=camoufox.ready?
     'Camoufox EXE đã xác minh chữ ký · '+camoufox.version+'. Cửa sổ thủ công sẵn sàng. '+
       (camoufox.approvedProxyTypes?.length===2?
        'Proxy HTTP/SOCKS5 đã nghiệm thu cho phiên bản này.':
        camoufox.approvedProxyTypes?.length?
         'Proxy '+camoufox.approvedProxyTypes.join('/').toUpperCase()+' đã nghiệm thu cho phiên bản này.':
         'Proxy chưa được duyệt cho phiên bản engine này.')+
       ' Không có Playwright hoặc Automation Studio.':
     'Camoufox chưa sẵn sàng: '+(camoufox.note||
       'cần EXE Windows được ký riêng và capability đúng phiên bản.')+
       ' Không yêu cầu Node 22; không fallback sang Firefox hoặc direct.';
   result.textContent=bundle.valid?
    'Engine đóng gói hợp lệ · phiên bản '+bundle.version+
     ' · '+bundle.fileCount+' tệp · SHA-256: '+bundle.sha256.slice(0,16)+'…':
    bundledEngineGuidance(bundle.reason);
  }catch(error){result.textContent='Không kiểm tra được Engine: '+error.message+
   '. Thử bấm Làm mới; nếu vẫn lỗi, hãy khởi động lại ứng dụng rồi thử lại.';}
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
  }catch(error){result.textContent='Không thay đổi Engine: '+error.message+
   '. Hãy đóng toàn bộ trình duyệt đang mở rồi thử lại.';}
  finally{busyState(false);}
 });
 installButton.addEventListener('click',async()=>{
  if(busy||!releaseAvailable)return;
  busyState(true);
  installInfo.textContent=localPinned?'Đang kiểm tra và giải nén engine; việc này có thể mất vài phút…':'Đang thực hiện quy trình tải và xác minh engine đã ký…';
  try{
   const result=await window.api.installCamoufoxEngine();
   if(result.canceled)installInfo.textContent='Đã hủy cài đặt.';
   else{
    installInfo.textContent='Đã cài và xác minh Camoufox '+result.version+
      '. Khi tạo hồ sơ Camoufox mới, ứng dụng sẽ thử cấp danh tính đã ghim cho hồ sơ. '+
      'Không tự chuyển hoặc sao chép session giữa các engine.';
    releaseAvailable=false;
   }
  }catch(error){
   installInfo.textContent=localPinned?localZipInstallGuidance(error.message):'Cài Camoufox không thành công: '+error.message+
    '. Kiểm tra kết nối mạng và dung lượng trống rồi thử lại; nếu vẫn lỗi, '+
    'hãy ghi lại thông báo này khi liên hệ hỗ trợ.';
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
    'Đã chọn Camoufox chạy trực tiếp. Chỉ duyệt web thủ công; proxy chỉ mở khi đúng phiên bản đã nghiệm thu.':
    'Đã trở về Firefox đã cài trên máy.';
  }catch(error){geckoResult.textContent='Không đổi được provider: '+error.message+
   '. Hãy đóng toàn bộ trình duyệt đang mở rồi thử lại.';}
  finally{busyState(false);}
 });
});
