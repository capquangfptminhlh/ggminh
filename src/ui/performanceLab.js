'use strict';
(() => {
  const get=id=>document.getElementById(id);
  const api=window.api;
  let running=false;
  let last=null;
  function textNode(tag,cls,value) {
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    element.textContent=String(value);
    return element;
  }
  function close(){get('modal-performance-lab').classList.remove('open');}
  function open(){get('modal-performance-lab').classList.add('open');}
  function render(data) {
    const target=get('performance-lab-metrics');
    target.replaceChildren();
    const header=textNode('div','lhm-perf-head',
      data.profileCount+' hồ sơ • '+data.iterations+' mẫu cho mỗi phép đo • '+
      'RSS tiến trình chính '+data.environment.processRssMiB+' MiB');
    target.append(header);
    const entries=[
      ['Đọc danh sách hồ sơ',data.operations.listAllProfiles],
      ['Tra cứu '+data.lookupBatchSize+' hồ sơ',data.operations.getProfileBatch],
      ['Tạo số liệu dashboard',data.operations.dashboardProjection]
    ];
    for(const [label,stats] of entries) {
      const card=document.createElement('section');
      card.className='lhm-perf-card';
      card.append(textNode('strong','',label));
      card.append(textNode('div','lhm-perf-time',
        'P50: '+stats.medianMs+' ms  ·  P95: '+stats.p95Ms+' ms'));
      card.append(textNode('small','',
        'Min '+stats.minMs+' ms · Max '+stats.maxMs+' ms · '+stats.samples+' mẫu'));
      target.append(card);
    }
  }
  async function run() {
    if(running)return;
    running=true;
    const runButton=get('performance-lab-run');
    const exportButton=get('performance-lab-export');
    runButton.disabled=true;
    exportButton.disabled=true;
    last=null;
    get('performance-lab-status').textContent='Đang đo dữ liệu cục bộ…';
    try {
      const report=await api.runPerformanceLab();
      if(report.schema!=='lhm.performance.evidence.v1')throw Error('Báo cáo sai định dạng');
      last=report;
      render(report);
      get('performance-lab-status').textContent=
        'Đã đo '+report.profileCount+' hồ sơ lúc '+new Date(report.generatedAt).toLocaleString('vi-VN')+
        ' (chỉ metadata, không phải thời gian mở trình duyệt).';
      exportButton.disabled=false;
    } catch(error) {
      get('performance-lab-status').textContent='Không thể đo: '+String(error.message||error);
    } finally {runButton.disabled=false;running=false;}
  }
  async function exportReport() {
    if(!last)return;
    const button=get('performance-lab-export');
    button.disabled=true;
    try {
      const output=await api.exportPerformanceLab();
      get('performance-lab-status').textContent=output.canceled?
        'Đã hủy lưu báo cáo.':'Đã lưu báo cáo '+output.bytes+' byte tại vị trí người dùng chọn.';
    } catch(error) {
      get('performance-lab-status').textContent='Không thể lưu: '+String(error.message||error);
    } finally {button.disabled=false;}
  }
  function bind() {
    get('btn-performance-lab').addEventListener('click',open);
    get('performance-lab-close').addEventListener('click',close);
    get('performance-lab-done').addEventListener('click',close);
    get('performance-lab-run').addEventListener('click',run);
    get('performance-lab-export').addEventListener('click',exportReport);
    get('modal-performance-lab').addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
