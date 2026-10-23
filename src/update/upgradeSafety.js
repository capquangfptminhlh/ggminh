'use strict';
/**
 * Local upgrade readiness, strictly read-only.
 * No backup is created, no session is copied, and no secret/identity
 * or file-system path is included in IPC reports.
 * "review" is never proof that customer data will survive installation.
 */
const fs=require('node:fs');
const path=require('node:path');

function inspectJsonFile(file,kind,{optional=false}={}) {
 if(!fs.existsSync(file)) {
  if(optional)return {present:false};
  throw Error(kind+' file is missing');
 }
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error(kind+' must be a regular file');
 if(stat.size>128*1024*1024)throw Error(kind+' exceeds safe inspection bound');
 const doc=JSON.parse(fs.readFileSync(file,'utf8'));
 return {present:true,data:doc};
}
function inspectUpgradeSafety({storageDir,store,workflowStore,proxyVault,launcher,fsApi=fs}={}) {
 const findings=[];
 const add=(severity,code,message)=>{
  if(!findings.some(x=>x.code===code))findings.push({severity,code,message});
 };
 const report={
  schema:'lhm.upgrade.safety.v1',
  status:'review',scope:'local_read_only_inspection',
  profiles:0,workflows:0,activeBrowsers:0,
  hasEncryptedProxyVault:false,encryptedProxyEntries:0,
  installationIdentityPresent:false,activationFilePresent:false,
  sessionFoldersPresent:false,backupCoversSessions:false,
  networkRequests:0,changedFiles:0,
  findings,limitations:[
   'Kiểm tra cấu hình cục bộ không phải sao lưu dữ liệu người dùng.',
   'Sao lưu cấu hình .lhmbak KHÔNG bao gồm cookie, cache, IndexedDB hay toàn bộ phiên trình duyệt.',
   'Không đo tình trạng cài đặt Windows thực hoặc đảm bảo không mất dữ liệu khi nâng cấp.'
  ]
 };
 if(typeof storageDir!=='string'||!path.isAbsolute(storageDir)||
   !store||!workflowStore) {
  add('error','invalid_context','Thiếu đường dẫn dữ liệu hoặc dịch vụ hồ sơ.');
  report.status='blocked';return report;
 }
 try {
  const stat=fsApi.lstatSync(storageDir);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid storage root');
  const db=inspectJsonFile(path.join(storageDir,'db.json'),'Profile database');
  if(!db.data||!Array.isArray(db.data.profiles))
   throw Error('Profile list invalid');
  const flows=inspectJsonFile(path.join(storageDir,'automation-workflows.json'),
    'Workflow database',{optional:true});
  if(flows.present&&!Array.isArray(flows.data))throw Error('Workflows invalid');
  const diskProfiles=db.data.profiles.length;
  const liveProfiles=store.getProfiles().length;
  const diskFlows=flows.present?flows.data.length:0;
  const liveFlows=workflowStore.list().length;
  report.profiles=diskProfiles;
  report.workflows=diskFlows;
  if(diskProfiles!==liveProfiles || diskFlows!==liveFlows)
    add('error','unsaved_metadata','Thông tin hồ sơ hoặc quy trình trong bộ nhớ chưa khớp dữ liệu đã lưu.');
  const licenseIdentity=inspectJsonFile(path.join(storageDir,'installation-id.json'),
    'Installation ID',{optional:true});
  const activation=inspectJsonFile(path.join(storageDir,'license-activation.json'),
    'Activation record',{optional:true});
  report.installationIdentityPresent=licenseIdentity.present;
  report.activationFilePresent=activation.present;
  if(activation.present&&!licenseIdentity.present)
    add('error','activation_without_identity','Có kích hoạt license nhưng thiếu tệp định danh cài đặt.');
  else if(licenseIdentity.present)
    add('notice','license_local','Định danh cài đặt được lưu trong dữ liệu ứng dụng; cần giữ nguyên thư mục này khi nâng cấp.');
  const vault=inspectJsonFile(path.join(storageDir,'proxy-credentials.enc.json'),
    'Encrypted proxy vault',{optional:true});
  if(vault.present) {
   if(vault.data?.version!==1||!vault.data?.entries||
       typeof vault.data.entries!=='object'||Array.isArray(vault.data.entries))
     throw Error('Encrypted proxy vault invalid');
   report.hasEncryptedProxyVault=true;
   report.encryptedProxyEntries=Object.keys(vault.data.entries).length;
   if(report.encryptedProxyEntries&&!proxyVault?.available?.())
     add('warning','os_encryption_unavailable',
       'Có mật khẩu proxy được mã hóa nhưng dịch vụ mã hóa hệ điều hành chưa khả dụng.');
   else if(report.encryptedProxyEntries)
     add('notice','encrypted_vault_local',
       'Kho proxy mã hóa gắn với người dùng Windows hiện tại; chuyển sang máy khác có thể không giải mã được.');
  }
  report.sessionFoldersPresent=['profiles','gecko-profiles','camoufox-profiles','session-snapshots']
    .some(root=>{
      const folder=path.join(storageDir,root);
      return fsApi.existsSync(folder) &&
        fsApi.readdirSync(folder,{withFileTypes:true}).some(x=>x.isDirectory());
    });
  if(report.sessionFoldersPresent)
    add('warning','sessions_not_in_config_backup',
      'Có dữ liệu phiên hoặc snapshot trên ổ đĩa. Sao lưu cấu hình không thay thế sao lưu phiên; hãy dùng Session Snapshots theo nhu cầu.');
  if(typeof launcher?.listActive==='function') {
   const active=launcher.listActive();
   if(!Array.isArray(active))throw Error('Active browser list invalid');
   report.activeBrowsers=active.length;
   if(active.length)add('warning','close_active_browsers',
     'Có '+active.length+' trình duyệt đang mở. Cần đóng và lưu công việc trước khi chạy bộ cài mới.');
  }else add('warning','active_state_unknown','Không xác minh được số trình duyệt đang hoạt động.');
  add('notice','uninstall_policy','LHM được cấu hình không xóa AppData khi gỡ cài đặt; vẫn cần nghiệm thu trên Windows khách thật.');
 }catch(_) {
  add('error','storage_inspection_failed',
    'Không đọc/kiểm chứng được dữ liệu cục bộ. Không nên tiến hành cài đặt trước khi kiểm tra và sao lưu.');
 }
 report.status=findings.some(x=>x.severity==='error')?'blocked':'review';
 return report;
}
module.exports={inspectUpgradeSafety};
