'use strict';
// Read-only explanation of the Constitution signal inventory, never a Google risk score.
// A configured native engine or pinned Camoufox identity is NOT an observed runtime measurement.
const SIGNALS = Object.freeze([
  ['network','Mạng và định tuyến',[
    ['proxy','Proxy / địa chỉ thoát','Cấu hình mạng chỉ là khai báo; cần kiểm tra IP thoát thực tế'],
    ['dns','DNS, IPv6, QUIC','CHƯA ĐO: tuyến DNS, IPv6 và QUIC của hồ sơ đang chạy'],
    ['webrtc','WebRTC ICE','CHƯA ĐO: không coi bật tùy chọn thử nghiệm là đã ngăn rò rỉ'],
    ['tls','TLS / JA4, HTTP/2, HTTP headers','Giữ giá trị engine; CHƯA ĐO từ máy chủ kiểm thử']
  ]],
  ['identity','Thiết bị và Navigator',[
    ['ua','User-Agent, Client Hints','Không dùng UA đơn lẻ làm bằng chứng về danh tính mới'],
    ['device','Nền tảng, CPU, RAM, màn hình','Cần quan sát trong trình duyệt thật để xác nhận các giá trị hiển lộ'],
    ['locale','Ngôn ngữ, múi giờ, locale','Cần so khớp mạng và thiết lập thiết bị sau khi chạy'],
    ['navigator','Permissions, plugins, touch, webdriver','CHƯA ĐO trong hồ sơ hiện tại']
  ]],
  ['render','Đồ họa và âm thanh',[
    ['canvas','Canvas 2D / OffscreenCanvas','Không xác nhận hash/độ nhất quán khi chưa có phép đo'],
    ['gpu','WebGL, GPU, shader, WebGPU','Không xác nhận GPU thật chỉ từ chuỗi cấu hình'],
    ['audio','WebAudio / sample rate','Không xác nhận kết quả âm thanh khi chưa đo'],
    ['devices','Fonts, giọng đọc, camera, micro','Giữ nguồn engine/thiết bị; CHƯA ĐO từng đầu ra']
  ]],
  ['storage','Dữ liệu và hoạt động',[
    ['storage','Cookie, localStorage, IndexedDB, cache','Có kiểm thử cách ly trên runner; riêng hồ sơ này CHƯA ĐO'],
    ['cache','HSTS, ETag, Service Worker và favicon','CHƯA ĐO đầy đủ theo hồ sơ'],
    ['behavior','Hành vi mở/đóng, thay đổi trong phiên','Chỉ có cảnh báo vận hành cục bộ, không đo đánh giá Google'],
    ['accounts','Tài khoản, xác minh và thanh toán Google Ads','Ngoài quyền kiểm soát của fingerprint trình duyệt']
  ]]
]);
const STATES = Object.freeze({
  native:'ENGINE QUẢN LÝ', pinned:'ĐÃ GHIM CẤU HÌNH',
  custom:'THỬ NGHIỆM', declared:'ĐÃ KHAI BÁO',
  unmeasured:'CHƯA ĐO', external:'NGOÀI TRÌNH DUYỆT'
});
function model({engine='chromium',fingerprint={},proxy={}}={}){
  const fp=fingerprint&&typeof fingerprint==='object'?fingerprint:{};
  const p=proxy&&typeof proxy==='object'?proxy:{};
  const native=engine!=='chromium'||fp.mode==='native';
  const pinned=engine==='camoufox'&&Boolean(fp.identity)&&fp.identityProvisioning==='provisioned';
  const status=(key)=>{
    if(key==='accounts') return 'external';
    if(key==='proxy') return p.type&&p.type!=='direct'&&p.host&&p.port?'declared':'native';
    if(key==='ua'||key==='device'||key==='locale') return pinned?'pinned':native?'native':'custom';
    if(key==='canvas') return !native&&Number(fp.canvasNoiseSeed)>0?'custom':'native';
    if(key==='audio') return !native&&Number(fp.audioNoiseSeed)>0?'custom':'native';
    // All other runtime surface observations require measured evidence bound to
    // this profile. None are supplied to this form, so do not mark them PASS.
    return 'unmeasured';
  };
  return SIGNALS.map(([id,title,items])=>({id,title,items:items.map(([key,name,note])=>({
    key,name,note,status:status(key),statusLabel:STATES[status(key)]
  }))}));
}
function render(doc,config){
  const summary=doc.getElementById('fp-signal-summary');
  const target=doc.getElementById('fp-signal-groups');
  if(!summary||!target) return false;
  const engine=config.engine||'chromium',fp=config.fingerprint||{};
  const pinned=engine==='camoufox'&&fp.identity&&fp.identityProvisioning==='provisioned';
  summary.textContent=engine==='camoufox'
    ?pinned?'Camoufox: đã lưu danh tính ghim; CHƯA ĐO các tín hiệu đang lộ ra.':
      'Camoufox: chưa có bằng chứng cấp danh tính ghim hợp lệ; đang dùng/chờ engine. CHƯA ĐO runtime.'
    :engine==='gecko'?'Firefox/Gecko: giữ thông số engine; CHƯA ĐO runtime.':
      fp.mode==='experimental'?'Chromium: có thiết lập thử nghiệm, chưa xác minh nhất quán hoặc dấu vết runtime.':
        'Chromium: mặc định dùng thông số engine gốc; CHƯA ĐO runtime.';
  target.replaceChildren();
  for(const group of model(config)){
    const section=doc.createElement('section');section.className='fp-signal-group';
    const heading=doc.createElement('h4');heading.textContent=group.title;section.appendChild(heading);
    for(const item of group.items){
      const row=doc.createElement('div');row.className='fp-signal-row';
      const description=doc.createElement('div');
      const name=doc.createElement('strong');name.textContent=item.name;
      const help=doc.createElement('small');help.textContent=item.note;
      description.append(name,help);
      const badge=doc.createElement('span');badge.className='fp-signal-state';badge.dataset.status=item.status;badge.textContent=item.statusLabel;
      row.append(description,badge);section.appendChild(row);
    }
    target.appendChild(section);
  }
  return true;
}
const exported={model,render,STATES};
if(typeof module!=='undefined'&&module.exports) module.exports=exported;
if(typeof window!=='undefined') window.LHMProfileSignalCoverage=exported;
