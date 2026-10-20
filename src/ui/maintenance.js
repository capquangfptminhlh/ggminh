(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const api = window.api;
  let selectedProfile = null;
  function open(id) { el(id).classList.add('open'); }
  function close(id) { el(id).classList.remove('open'); }
  function labeled(className, value) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = value;
    return node;
  }
  async function updateHealth() {
    const [profiles, statuses] = await Promise.all([api.getProfiles(), api.getAllProfileHealth()]);
    const names = new Map(profiles.map(p => [p.id, p.name]));
    const results = Array.isArray(selectedProfile)
      ? statuses.filter(s => selectedProfile.includes(s.profileId))
      : selectedProfile ? statuses.filter(s => s.profileId === selectedProfile) : statuses;
    el('health-total').textContent = String(results.length);
    el('health-errors').textContent = String(results.filter(s => s.status === 'error').length);
    el('health-warnings').textContent = String(results.filter(s => s.status === 'warning').length);
    const list = el('health-items');
    list.replaceChildren();
    if (!results.length) {
      list.append(labeled('health-issue', 'Chưa có hồ sơ để kiểm tra.'));
      return;
    }
    for (const result of results) {
      const wrapper = document.createElement('section');
      wrapper.className = 'health-item';
      const heading = document.createElement('div');
      heading.className = 'health-item-head';
      heading.append(labeled('health-name', (names.get(result.profileId) || result.profileId) + ' · ' + result.engine));
      heading.append(labeled('health-status ' + result.status,
        result.status === 'error' ? 'Cần xử lý' : result.status === 'warning' ? 'Cần xem lại' : 'Có thể mở'));
      wrapper.append(heading);
      const issues = document.createElement('div');
      issues.className = 'health-issues';
      for (const item of result.issues) {
        issues.append(labeled('health-issue ' + item.level,
          item.message));
      }
      if (!result.issues.length) issues.append(labeled('health-issue', 'Không phát hiện lỗi cấu hình đã biết.'));
      wrapper.append(issues);
      list.append(wrapper);
    }
  }
  async function updateReadiness() {
    const target=el('health-readiness-items');
    const refresh=el('health-readiness-refresh');
    refresh.disabled=true;
    target.replaceChildren(labeled('health-issue','Đang kiểm tra...'));
    try {
      const report=await api.getLocalReadiness();
      const counts=report.counts;
      el('health-readiness-summary').textContent=
        counts.profiles+' hồ sơ · '+counts.active+' đang chạy · '+
        counts.proxies+' proxy · '+counts.workflows+' quy trình';
      target.replaceChildren();
      for(const entry of report.items) {
        const line=document.createElement('div');
        line.className='health-readiness-row';
        line.dataset.status=entry.status;
        const heading=document.createElement('div');
        heading.className='health-readiness-label';
        const label=document.createElement('strong');
        label.textContent=entry.label;
        const state=document.createElement('span');
        state.className='health-readiness-tag';
        state.textContent=entry.status==='ready'?'Sẵn sàng'
          :entry.status==='error'?'Cần xử lý'
          :entry.status==='warning'?'Cần xem lại':'Chưa triển khai';
        heading.append(label,state);
        line.append(heading,labeled('health-readiness-detail',entry.detail));
        target.append(line);
      }
      target.append(labeled('health-footnote',report.note));
    } catch(error) {
      target.replaceChildren(labeled('health-issue error','Không kiểm tra được: '+error.message));
    } finally {refresh.disabled=false;}
  }
  async function showHealth(profileId = null) {
    selectedProfile = profileId;
    open('modal-health');
    try { await Promise.all([updateHealth(),updateReadiness()]); }
    catch (error) { el('health-items').replaceChildren(labeled('health-issue error', 'Không kiểm tra được: ' + error.message)); }
  }
  async function checkEngines() {
    const container = el('health-engines-results');
    const button = el('health-check-engines');
    button.disabled = true;
    container.replaceChildren(labeled('health-issue', 'Đang đọc phiên bản engine...'));
    try {
      const report = await api.diagnoseBrowserEngines();
      container.replaceChildren();
      for (const engine of report.engines) {
        const line = document.createElement('div');
        line.className = 'engine-diagnostics-line';
        const mark = engine.status === 'ready' ? 'Đã tìm thấy'
          : engine.status === 'missing' ? 'Chưa cài đặt' : 'Cần kiểm tra';
        line.append(labeled('engine-diagnostics-name', engine.name + ' · ' + mark));
        line.append(labeled('health-issue', 'Phiên bản: ' + (engine.version || 'Chưa xác định')));
        line.append(labeled('health-issue', engine.message));
        container.append(line);
      }
      container.append(labeled('isolation-disclaimer', report.note));
    } catch (error) {
      container.replaceChildren(labeled('health-issue error', 'Không thể kiểm tra: ' + error.message));
    } finally { button.disabled = false; }
  }
  async function auditIsolation() {
    const container = el('isolation-audit-results');
    container.replaceChildren(labeled('health-issue', 'Đang kiểm tra...'));
    try {
      const report = await api.auditProfileIsolation();
      container.replaceChildren();
      container.append(labeled('isolation-overview',
        (report.storageSeparate ? 'Các đường dẫn lưu trữ đã kiểm tra không trùng nhau.' :
          'Phát hiện trùng hoặc liên kết thư mục cần xử lý.') + ' Đã kiểm tra: ' + report.checked + ' hồ sơ.'));
      for (const entry of report.entries) {
        const line = document.createElement('div');
        line.className = 'isolation-entry';
        line.append(labeled('isolation-name',
          (entry.storageSeparate ? '' : '') + entry.name + ' · ' + entry.engine));
        line.append(labeled('health-issue',
          entry.issues.length ? entry.issues.join('; ') :
            entry.storageInitialized ? 'Có thư mục riêng; ' + (entry.running ? 'đang sử dụng' : 'chưa mở') :
              'Có đường dẫn riêng; thư mục sẽ được tạo khi mở lần đầu'));
        container.append(line);
      }
      container.append(labeled('isolation-disclaimer', report.disclaimer));
    } catch (error) {
      container.replaceChildren(labeled('health-issue error','Không kiểm tra được: ' + error.message));
    }
  }
  async function refreshPinnedRuntimes(){
    const container=el('runtime-status');
    container.replaceChildren(labeled('health-issue','Đang kiểm tra dấu SHA-256...'));
    try{
      const states=await api.getPinnedBrowserRuntimes();
      container.replaceChildren();
      for(const [engine,label] of [['chromium','Chrome / Edge'],['gecko','Firefox']]){
        const row=document.createElement('div');row.className='engine-diagnostics-line';
        const status=states[engine];
        row.append(labeled('engine-diagnostics-name',label+' · '+
          (!status.configured?'Chưa ghim':status.valid?'Đúng bản đã ghim':'Cần kiểm tra')));
        row.append(labeled('health-issue',!status.configured
          ?'Dùng trình duyệt cài trên máy theo cấu hình hiện tại'
          :(status.name+' · SHA-256 '+(status.sha256?.slice(0,16)||'chưa đọc được')+'… · '+status.message)));
        if(status.configured){
          const remove=document.createElement('button');remove.type='button';
          remove.className='btn btn-sm btn-secondary';remove.textContent='Bỏ ghim';
          remove.addEventListener('click',async()=>{
            if(!confirm('Bỏ kiểm tra SHA-256 cho '+label+'? Sau đó dùng engine mặc định trên máy.'))return;
            try{await api.clearPinnedBrowserRuntime(engine);await refreshPinnedRuntimes();}
            catch(error){container.prepend(labeled('health-issue error',error.message));}
          });row.append(remove);
        }
        container.append(row);
      }
    }catch(error){container.replaceChildren(labeled('health-issue error','Không thể kiểm tra: '+error.message));}
  }
  async function registerPinned(engine){
    const button=el('runtime-register-'+engine);
    button.disabled=true;
    try{
      const result=await api.registerPinnedBrowserRuntime(engine);
      if(!result.canceled)await refreshPinnedRuntimes();
    }catch(error){el('runtime-status').prepend(labeled('health-issue error',error.message));}
    finally{button.disabled=false;}
  }
  function showBackup() {
    el('backup-password').value = '';
    el('backup-result').textContent = '';
    el('backup-mode').value = 'export';
    open('modal-backup');
  }
  async function executeBackup() {
    const password = el('backup-password').value;
    const mode = el('backup-mode').value;
    if (password.length < 12) {
      el('backup-result').textContent = 'Mật khẩu cần ít nhất 12 ký tự.';
      return;
    }
    if (mode === 'import' && !confirm('Nhập hồ sơ MỚI, không khôi phục cookies/phiên. Tiếp tục?')) return;
    el('backup-execute').disabled = true;
    el('backup-result').textContent = 'Đang xử lý...';
    try {
      const value = mode === 'export' ? await api.exportConfigBackup(password) : await api.importConfigBackup(password);
      if (value.canceled) el('backup-result').textContent = 'Đã hủy chọn tệp.';
      else if (mode === 'export') el('backup-result').textContent = 'Đã xuất bản sao lưu mã hóa. Hãy giữ mật khẩu tại nơi an toàn.';
      else {
        el('backup-result').textContent = 'Đã nhập thêm ' + value.profiles + ' hồ sơ, ' + value.workflows + ' quy trình. Phiên trình duyệt không được sao chép.';
        if (typeof loadProfiles === 'function') await loadProfiles();
      }
    } catch (error) { el('backup-result').textContent = '' + error.message; }
    finally { el('backup-password').value = ''; el('backup-execute').disabled = false; }
  }
  function bind() {
    el('btn-profile-health').addEventListener('click', () => showHealth());
    el('health-close').addEventListener('click', () => close('modal-health'));
    el('health-done').addEventListener('click', () => close('modal-health'));
    el('health-refresh').addEventListener('click', () => updateHealth().catch(console.error));
    el('health-isolation-audit').addEventListener('click', auditIsolation);
    el('health-check-engines').addEventListener('click', checkEngines);
    el('runtime-check').addEventListener('click',refreshPinnedRuntimes);
    el('runtime-register-chromium').addEventListener('click',()=>registerPinned('chromium'));
    el('runtime-register-gecko').addEventListener('click',()=>registerPinned('gecko'));
    el('health-readiness-refresh').addEventListener('click',updateReadiness);
    el('health-support-export').addEventListener('click',async()=>{
      const button=el('health-support-export');
      button.disabled=true;
      try{
        const result=await api.exportSupportReport();
        el('health-readiness-summary').textContent=result.canceled ?
          'Đã hủy xuất báo cáo.' : 'Đã lưu báo cáo chỉ gồm trạng thái cấu hình, không có tên hồ sơ, IP hoặc mật khẩu.';
      }catch(error){
        el('health-readiness-summary').textContent='Không xuất được báo cáo: '+error.message;
      }finally{button.disabled=false;}
    });
    el('btn-config-backup').addEventListener('click', showBackup);
    el('backup-close').addEventListener('click', () => close('modal-backup'));
    el('backup-cancel').addEventListener('click', () => close('modal-backup'));
    el('backup-execute').addEventListener('click', executeBackup);
    el('backup-preview').addEventListener('click',async()=>{
      const password=el('backup-password').value;
      if(password.length<12){
        el('backup-result').textContent='Nhập mật khẩu tối thiểu 12 ký tự trước khi xem trước.';return;
      }
      const button=el('backup-preview');button.disabled=true;
      try{
        const result=await api.previewConfigBackup(password);
        el('backup-result').textContent=result.canceled ? 'Đã hủy chọn tệp.' :
          'Tệp chứa '+result.profiles+' hồ sơ, '+result.workflows+
          ' quy trình; '+result.requiresProxySetup+
          ' hồ sơ cần gán lại proxy. Xem trước không sửa dữ liệu hiện có.';
      }catch(error){el('backup-result').textContent='Không xem được bản sao lưu: '+error.message;}
      finally {button.disabled=false;}
    });
  }
  window.LHMMaintenance = { showHealth };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();