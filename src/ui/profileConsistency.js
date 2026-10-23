'use strict';
/*
 * LHM operator consistency review, NOT a probability score, account-linkage
 * evasion guide or a simulation of Google/Meta integrity classifiers.
 * This module performs NO network access and stores NO external account data.
 * Observability is intentionally conservative: proxy configured != route proven,
 * native selected != runtime inspected, and business assets require human review.
 */
(function register(root) {
  const STATUS=Object.freeze({
    DECLARED:'ĐÃ KHAI BÁO', WARNING:'CẦN RÀ SOÁT',
    UNMEASURED:'CHƯA ĐO', MANUAL:'KIỂM TRA THỦ CÔNG'
  });
  function assess(input={}) {
    const engine=['chromium','gecko','camoufox'].includes(input.engine)?input.engine:'chromium';
    const proxyType=['direct','http','socks5'].includes(input.proxyType)?input.proxyType:'direct';
    const native=input.fingerprintMode==='native' || engine!=='chromium';
    const pinned=engine==='camoufox'&&input.pinned===true;
    const language=typeof input.language==='string'?input.language:'';
    const timezone=typeof input.timezone==='string'?input.timezone:'';
    const layer=[
      {
        id:'network',title:'1 · Kết nối và IP',state:STATUS.UNMEASURED,
        detail: proxyType==='direct'
          ? 'Đã chọn kết nối trực tiếp. Không có tuyến proxy cần xác minh; chưa đo IP/DNS/WebRTC của phiên.'
          : 'Đã khai báo '+(proxyType==='socks5'?'SOCKS5':'HTTP')+
            '. Cần đo IP thoát, rớt proxy, DNS/WebRTC thực tế; khai báo không phải bằng chứng không rò rỉ.'
      },
      {
        id:'browser',title:'2 · Trình duyệt và dữ liệu',
        state:!native?STATUS.WARNING:pinned?STATUS.DECLARED:
          engine==='camoufox'?STATUS.UNMEASURED:STATUS.DECLARED,
        detail: !native
          ? 'Chế độ Chromium thử nghiệm can thiệp thuộc tính; có nguy cơ mâu thuẫn so với engine thực.'
          : pinned
            ? 'Danh tính Camoufox đã ghim trong hồ sơ. Cần đo thuộc tính thực tế và tính ổn định sau khi khởi động lại.'
            : engine==='camoufox'
              ? 'Camoufox chưa có danh tính được ghim. Chưa thể xác minh bộ tham số runtime của hồ sơ.'
              : 'Đã chọn thông số gốc. Mỗi hồ sơ có thư mục dữ liệu riêng; cần kiểm tra cách ly khi chạy.'
      },
      {
        id:'assets',title:'3 · Tài sản và thanh toán',
        state:STATUS.MANUAL,
        detail:'Xác minh chủ thể quảng cáo, quyền quản lý tài sản và thông tin thanh toán hợp lệ. Trình duyệt không đo hoặc phân loại uy tín thẻ, Pixel, Fanpage hay MCC.'
      },
      {
        id:'operations',title:'4 · Quy trình vận hành',
        state:STATUS.MANUAL,
        detail:'Kiểm tra quyền của người vận hành, nhật ký thay đổi, quy trình phê duyệt và giới hạn thao tác. Không sử dụng cookie warming hoặc mô phỏng người dùng để né kiểm duyệt.'
      }
    ];
    const blindspots=[
      {id:'dns-webrtc',title:'Đường đi mạng (DNS / WebRTC / IPv4 / IPv6)',state:STATUS.UNMEASURED,
       detail:'Chỉ xác nhận bằng phép đo kết nối thực trong phiên được phép. Không suy ra từ ô Proxy.'},
      {id:'tls-tcp',title:'TLS / TCP và hệ điều hành',state:STATUS.UNMEASURED,
       detail:'Không thể xác nhận chữ ký đường truyền chỉ từ form cấu hình hoặc JavaScript Inspector.'},
      {id:'landing',title:'Trang đích và nội dung quảng cáo',state:STATUS.MANUAL,
       detail:'Đối chiếu chính sách nội dung, tính minh bạch của doanh nghiệp và website đích. Dùng chung hạ tầng không tự động là vi phạm.'},
      {id:'activity',title:'Hoạt động hàng loạt',state:STATUS.MANUAL,
       detail:'Kiểm toán tự động hóa được ủy quyền và lưu lịch sử. Không cam kết mô phỏng nhịp người thật qua được hệ thống xét duyệt.'}
    ];
    const constraints=engine==='camoufox'&&!pinned?{
      language:language||'Theo bộ sinh',
      timezone:timezone||'Theo bộ sinh'
    }:null;
    return {classification:'PROFILE_CONSISTENCY_DECLARATIVE_ONLY',
      engine,layer,blindspots,constraints,platformRiskScore:null,
      outsideReviewRequired:true,networkEvidence:'NOT_RUN'};
  }
  function render(input,doc) {
    const report=assess(input);
    const documentRoot=doc||root?.document;
    if(!documentRoot?.getElementById||!documentRoot?.createElement)return report;
    const make=(item)=>{
      const card=documentRoot.createElement('article');card.className='fp-consistency-card';
      const top=documentRoot.createElement('div');top.className='fp-consistency-card-head';
      const title=documentRoot.createElement('strong');title.textContent=item.title;
      const status=documentRoot.createElement('span');
      status.className='fp-consistency-state '+(
        item.state===STATUS.WARNING?'is-warning':
        item.state===STATUS.UNMEASURED||item.state===STATUS.MANUAL?'is-unknown':'');
      status.textContent=item.state;
      const desc=documentRoot.createElement('p');desc.textContent=item.detail;
      top.append(title,status);card.append(top,desc);return card;
    };
    const attach=(id,items)=>{
      const host=documentRoot.getElementById(id);
      if(host&&typeof host.replaceChildren==='function')
        host.replaceChildren(...items.map(make));
    };
    attach('fp-consistency-cards',report.layer);
    attach('fp-unmeasured-cards',report.blindspots);
    return report;
  }
  const api=Object.freeze({STATUS,assess,render});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&typeof root==='object')root.LHMProfileConsistency=api;
})(typeof window!=='undefined'?window:null);
