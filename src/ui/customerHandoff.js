'use strict';
/**
 * Read-only, explicit-user-action customer handoff.
 * Results are strictly data from main process; never interpolate HTML.
 */
(() => {
 const byId=id=>document.getElementById(id);
 const api=window.api;
 const states={
   ready:['ĐẠT CỤC BỘ','is-ready'],
   warning:['CẦN RÀ SOÁT','is-warning'],
   error:['CẦN SỬA','is-error']
 };
 let busy=false;
 let tested=false;
 function setStatus(text){byId('lhm-customer-status').textContent=String(text);}
 function render(report){
   if(report?.schema!=='lhm.customer.handoff.v1'||!Array.isArray(report.checks))
     throw Error('Báo cáo bàn giao không đúng định dạng');
   const root=byId('lhm-customer-checks');
   root.replaceChildren();
   const label=byId('lhm-customer-label');
   label.dataset.state=report.status;
   label.textContent=report.status==='blocked'?'CẦN SỬA':
    report.status==='review'?'CẦN RÀ SOÁT':'CHỈ ĐẠT CỤC BỘ';
   for(const item of report.checks){
     const row=document.createElement('article');
     row.className='lhm-customer-check';
     row.dataset.state=item.state;
     const head=document.createElement('div');
     const name=document.createElement('strong');
     name.textContent=item.title;
     const pill=document.createElement('span');
     pill.textContent=states[item.state]?.[0]||'CHƯA ĐO';
     pill.className='lhm-customer-state '+(states[item.state]?.[1]||'');
     head.append(name,pill);
     const description=document.createElement('p');
     description.textContent=item.note;
     row.append(head,description);
     root.append(row);
   }
   const required=document.createElement('p');
   required.className='lhm-customer-required';
   required.textContent=report.requiredBeforePublicRelease.length+
      ' cổng nghiệm thu bên ngoài chưa xác minh. Không được coi là bản bán thương mại chính thức.';
   root.append(required);
   setStatus('Đã kiểm tra '+report.checks.length+' hạng mục cục bộ. '+
     'Hồ sơ: '+report.counts.profiles+', hoạt động: '+report.counts.active+
     ', lỗi cấu hình: '+report.counts.configErrors+'.');
 }
 async function run(){
   if(busy)return;
   busy=true;
   tested=false;
   const runButton=byId('lhm-customer-check');
   const exportButton=byId('lhm-customer-export');
   runButton.disabled=true;exportButton.disabled=true;
   setStatus('Đang đối chiếu trạng thái cục bộ…');
   try{
     const report=await api.customerHandoffPreview();
     render(report);
     tested=true;
     exportButton.disabled=false;
   }catch(error){
     setStatus('Không kiểm tra được: '+String(error.message||error));
     byId('lhm-customer-label').textContent='CHƯA KIỂM TRA';
     byId('lhm-customer-label').dataset.state='unknown';
   }finally{busy=false;runButton.disabled=false;}
 }
 async function exportReport(){
   if(!tested||busy)return;
   busy=true;
   const btn=byId('lhm-customer-export');
   btn.disabled=true;
   try{
     const result=await api.customerHandoffExport();
     setStatus(result.canceled?'Đã hủy lưu báo cáo.':
       'Đã lưu báo cáo tại vị trí người dùng chọn ('+result.bytes+' bytes).');
   }catch(error){
     setStatus('Không thể lưu báo cáo: '+String(error.message||error));
   }finally{busy=false;btn.disabled=false;}
 }
 function bind(){
   byId('lhm-customer-check').addEventListener('click',run);
   byId('lhm-customer-export').addEventListener('click',exportReport);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
 else bind();
})();
