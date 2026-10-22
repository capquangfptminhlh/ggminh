'use strict';
// Update Center is explicitly user-triggered. Never auto-download or auto-run.
(() => {
 const get=id=>document.getElementById(id);
 const api=window.api;
 let busy=false;
 let canDownload=false;
 let downloaded=false;
 const label=get('lhm-update-status');
 const checkButton=get('lhm-update-check');
 const downloadButton=get('lhm-update-download');
 const folderButton=get('lhm-update-folder');
 const offerBox=get('lhm-update-offer');
 function controls() {
  checkButton.disabled=busy;
  downloadButton.disabled=busy||!canDownload;
  folderButton.disabled=busy||!downloaded;
 }
 function message(value) { label.textContent=String(value); }
 function showOffer(details) {
  offerBox.replaceChildren();
  offerBox.hidden=!details;
  if(!details)return;
  const rows=[
    ['Phiên bản mới',details.latestVersion],
    ['Kênh',details.channel],
    ['Bộ cài',details.artifact?.fileName],
    ['Kích thước',details.artifact?.bytes+' bytes'],
    ['SHA-256',details.artifact?.sha256]
  ];
  for(const [title,value] of rows) {
   const line=document.createElement('p');
   const strong=document.createElement('strong');
   strong.textContent=title+': ';
   line.append(strong,document.createTextNode(String(value??'—')));
   offerBox.append(line);
  }
 }
 async function refreshStatus() {
  try{
   const status=await api.onlineUpdateStatus();
   canDownload=!!status.canDownload;
   if(!status.configured)message('Chưa cấu hình khóa công khai Ed25519 của nhà phát hành. Không thể kiểm tra/tải cập nhật có xác minh.');
   else if(status.status==='not-checked')message('Sẵn sàng kiểm tra online theo yêu cầu. Không tự gửi kết nối ra mạng.');
   else if(status.status==='update-available')message('Đã xác minh một bản cập nhật mới. Hãy bấm tải nếu đồng ý.');
   else if(status.status==='up-to-date')message('Đã kiểm tra: chưa có bản mới trên kênh đã chọn.');
   else if(status.status==='unreachable')message('Không thể kết nối máy chủ cập nhật. Ứng dụng hiện tại vẫn dùng bình thường.');
   else if(status.status==='invalid')message('Không xác minh được bản cập nhật. Đã từ chối tải vì lý do an toàn.');
   else message('Chưa có trạng thái cập nhật hợp lệ.');
   if(status.lastCheck?.status==='update-available')showOffer(status.lastCheck.details);
   else showOffer(null);
  }catch(error){canDownload=false;message('Lỗi đọc trạng thái cập nhật: '+String(error.message||error));}
  controls();
 }
 async function checkOnline(){
  if(busy)return;
  busy=true;canDownload=false;downloaded=false;controls();
  message('Đang kiểm tra manifest có chữ ký Ed25519 qua HTTPS…');
  showOffer(null);
  try{
   const result=await api.onlineUpdateCheck();
   if(result.status==='update-available'){
    showOffer(result.details);
    canDownload=true;
    message('Có bản mới đã xác minh. Chỉ tải khi bạn chọn; chưa cài đặt tự động.');
   }else if(result.status==='up-to-date')message('Chưa có bản mới hơn phiên bản đang chạy trong kênh phát hành.');
   else if(result.status==='not-configured')message('Chưa có public key Ed25519 từ nhà phát hành. Không tải để tránh rủi ro.');
   else if(result.status==='unreachable')message('Không thể kết nối hoặc đọc manifest cập nhật. Không ảnh hưởng chương trình.');
   else message('Manifest sai chữ ký, hết hạn hoặc không đáp ứng chính sách. Đã từ chối cập nhật.');
  }catch(error){message('Kiểm tra cập nhật thất bại: '+String(error.message||error));}
  finally{busy=false;controls();}
 }
 async function downloadOnline(){
  if(busy||!canDownload)return;
  busy=true;controls();
  message('Chọn nơi lưu bộ cài. Tải qua HTTPS và xác minh byte + SHA-256…');
  try{
   const result=await api.onlineUpdateDownload();
   if(result.canceled){message('Đã hủy tải cập nhật.');return;}
   if(!result.verified)throw Error('Bộ cài chưa được xác minh');
   downloaded=true;
   message('Tải xong '+result.fileName+' ('+result.bytes+' bytes). SHA-256 khớp manifest đã ký. Bạn có thể mở thư mục và tự cài khi phù hợp.');
  }catch(error){downloaded=false;message('Đã dừng tải, không sử dụng file chưa xác minh: '+String(error.message||error));}
  finally{busy=false;controls();}
 }
 async function openFolder(){
  if(busy||!downloaded)return;
  try{await api.onlineUpdateOpenFolder();}
  catch(error){message('Không thể mở thư mục: '+String(error.message||error));}
 }
 function bind(){
  checkButton.addEventListener('click',checkOnline);
  downloadButton.addEventListener('click',downloadOnline);
  folderButton.addEventListener('click',openFolder);
  get('btn-app-about').addEventListener('click',refreshStatus);
  controls();
  void refreshStatus(); // status reads LOCAL config; makes no network request
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
 else bind();
})();
