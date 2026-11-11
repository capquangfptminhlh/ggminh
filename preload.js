const { contextBridge, ipcRenderer } = require('electron');

const api = {
  androidDiscover: () => ipcRenderer.invoke('android-discover'),
  androidCreateAvd: (name, image) => ipcRenderer.invoke('android-create-avd', name, image),
  androidDuplicateAvd: (source, name) => ipcRenderer.invoke('android-duplicate-avd', source, name),
  androidLaunchAvd: name => ipcRenderer.invoke('android-launch-avd', name),
  androidOpenScreen: serial => ipcRenderer.invoke('android-open-screen', serial),
  androidOpenChrome: serial => ipcRenderer.invoke('android-open-chrome', serial),
  androidChromeNavigate: (serial,url) => ipcRenderer.invoke('android-chrome-navigate',serial,url),
  androidStopEmulator: serial => ipcRenderer.invoke('android-stop-emulator', serial),
  androidControlAction: (serial,action,args) => ipcRenderer.invoke('android-control-action',serial,action,args),
  androidControlScreenshot: serial => ipcRenderer.invoke('android-control-screenshot',serial),
  androidUiInspect: serial => ipcRenderer.invoke('android-ui-inspect',serial),
  androidUiTapTarget: (serial,scanId,index) => ipcRenderer.invoke('android-ui-tap-target',serial,scanId,index),
  androidUiInvalidate: scanId => ipcRenderer.invoke('android-ui-invalidate',scanId),
  androidAgentFromInspector: (serial,scanId,index) => ipcRenderer.invoke('android-agent-from-inspector',serial,scanId,index),
  androidControlInstallApk: serial => ipcRenderer.invoke('android-control-install-apk',serial),
  androidAgentTemplate: serial => ipcRenderer.invoke('android-agent-template',serial),
  androidAgentPropose: (serial,goal,consent) => ipcRenderer.invoke('android-agent-propose',serial,goal,consent),
  androidAgentNext: sessionId => ipcRenderer.invoke('android-agent-next',sessionId),
  androidAgentCancel: sessionId => ipcRenderer.invoke('android-agent-cancel',sessionId),
  dashboardOverview: () => ipcRenderer.invoke('dashboard-overview'),
  runPerformanceLab: () => ipcRenderer.invoke('performance-lab-run'),
  exportPerformanceLab: () => ipcRenderer.invoke('performance-lab-export'),
  onlineUpdateStatus: () => ipcRenderer.invoke('app-online-update-status'),
  checkUpgradeSafety: () => ipcRenderer.invoke('app-upgrade-safety-check'),
  onlineUpdateCheck: () => ipcRenderer.invoke('app-online-update-check'),
  onlineUpdateDownload: () => ipcRenderer.invoke('app-online-update-download'),
  onlineUpdateOpenFolder: () => ipcRenderer.invoke('app-online-update-open-folder'),
  controlTowerSnapshot: () => ipcRenderer.invoke('control-tower-snapshot'),
  controlTowerTriage: () => ipcRenderer.invoke('control-tower-triage'),
  agencyHandoffExport: (ids,password) => ipcRenderer.invoke('agency-handoff-export',ids,password),
  agencyHandoffPreview: password => ipcRenderer.invoke('agency-handoff-import-preview',password),
  agencyHandoffCommit: (password,confirmation) => ipcRenderer.invoke('agency-handoff-import-commit',password,confirmation),
  controlTowerDuplicate: id => ipcRenderer.invoke('control-tower-duplicate', id),
  controlTowerStop: ids => ipcRenderer.invoke('control-tower-stop', ids),
  controlTowerOpen: ids => ipcRenderer.invoke('control-tower-open',ids),
  controlTowerAssignGroup: (ids,group) => ipcRenderer.invoke('control-tower-assign-group',ids,group),
  controlTowerAssignTags: (ids,tags,mode) => ipcRenderer.invoke('control-tower-assign-tags',ids,tags,mode),
  controlTowerExport: ids => ipcRenderer.invoke('control-tower-export', ids),
  auditProfileIsolation: () => ipcRenderer.invoke('audit-profile-isolation'),
  inspectFingerprint: value => ipcRenderer.invoke('inspect-fingerprint', value),
  getProfileHealth: id => ipcRenderer.invoke('get-profile-health', id),
  getLaunchReadiness: id => ipcRenderer.invoke('get-launch-readiness', id),
  inspectAdsLandingUrls: value => ipcRenderer.invoke('ads-landing-inspect', value),
  buildAdsUtmUrl: (url, values) => ipcRenderer.invoke('ads-utm-build', url, values),
  adsQaChecklist: () => ipcRenderer.invoke('ads-qa-checklist'),
  previewAdsQa: input => ipcRenderer.invoke('ads-qa-preview', input),
  exportAdsQa: input => ipcRenderer.invoke('ads-qa-export', input),
  agencyNetworkPreview: input => ipcRenderer.invoke('agency-network-preview',input),
  healthDriftReport: () => ipcRenderer.invoke('health-drift-report'),
  healthDriftSnapshot: () => ipcRenderer.invoke('health-drift-snapshot'),
  healthDriftClear: confirmation => ipcRenderer.invoke('health-drift-clear',confirmation),
  healthDriftExport: () => ipcRenderer.invoke('health-drift-export'),
  getAllProfileHealth: () => ipcRenderer.invoke('get-all-profile-health'),
  getLocalReadiness: () => ipcRenderer.invoke('get-local-readiness'),
  exportSupportReport: () => ipcRenderer.invoke('export-support-report'),
  customerHandoffPreview: () => ipcRenderer.invoke('customer-handoff-preview'),
  customerHandoffExport: () => ipcRenderer.invoke('customer-handoff-export'),
  exportConfigBackup: password => ipcRenderer.invoke('export-config-backup', password),
  importConfigBackup: password => ipcRenderer.invoke('import-config-backup', password),
  previewConfigBackup: password => ipcRenderer.invoke('preview-config-backup',password),
  recorderStart: options => ipcRenderer.invoke('recorder-start', options),
  recorderStatus: () => ipcRenderer.invoke('recorder-status'),
  recorderStop: () => ipcRenderer.invoke('recorder-stop'),
  recorderTake: () => ipcRenderer.invoke('recorder-take'),
  studioList: () => ipcRenderer.invoke('studio-list'),
  studioTemplates: () => ipcRenderer.invoke('studio-templates'),
  studioBatchStatus: () => ipcRenderer.invoke('studio-batch-status'),
  studioBatchPreview: (id,ids,onError) => ipcRenderer.invoke('studio-batch-preview',id,ids,onError),
  studioBatchRun: (id,ids,onError) => ipcRenderer.invoke('studio-batch-run',id,ids,onError),
  studioBatchStop: () => ipcRenderer.invoke('studio-batch-stop'),
  studioScheduleList: () => ipcRenderer.invoke('studio-schedule-list'),
  studioScheduleAdd: value => ipcRenderer.invoke('studio-schedule-add', value),
  studioScheduleEnable: (id, enabled) => ipcRenderer.invoke('studio-schedule-enable', id, enabled),
  studioScheduleDelete: id => ipcRenderer.invoke('studio-schedule-delete', id),
  studioGraphPreview: steps => ipcRenderer.invoke('studio-graph-preview', steps),
  studioSave: value => ipcRenderer.invoke('studio-save', value),
  studioDelete: id => ipcRenderer.invoke('studio-delete', id),
  studioRun: id => ipcRenderer.invoke('studio-run', id),
  studioStop: () => ipcRenderer.invoke('studio-stop'),
  studioApprove: () => ipcRenderer.invoke('studio-approve'),
  studioStatus: () => ipcRenderer.invoke('studio-status'),
  getBehaviorReport: () => ipcRenderer.invoke('get-behavior-report'),
  getWarningReport: () => ipcRenderer.invoke('get-warning-report'),
  clearWarningHistory: () => ipcRenderer.invoke('clear-warning-history'),
  getProfileMeasurement: (profileId) => ipcRenderer.invoke('get-profile-measurement', profileId),
  provisionCamoufoxIdentity: (id) => ipcRenderer.invoke('provision-camoufox-identity', id),
  getApiStatus: () => ipcRenderer.invoke('get-api-status'),
  setApiEnabled: enabled => ipcRenderer.invoke('set-api-enabled', enabled),
  setCdpEnabled: enabled => ipcRenderer.invoke('set-cdp-enabled', enabled),
  copyApiKey: () => ipcRenderer.invoke('copy-api-key'),
  listSavedProxies: () => ipcRenderer.invoke('proxy-center-list'),
  saveSavedProxy: value => ipcRenderer.invoke('proxy-center-save', value),
  deleteSavedProxy: id => ipcRenderer.invoke('proxy-center-delete', id),
  checkSavedProxy: id => ipcRenderer.invoke('proxy-center-check', id),
  importSavedProxiesCsv: csv => ipcRenderer.invoke('proxy-center-import', csv),
  checkSavedProxyBatch: ids => ipcRenderer.invoke('proxy-center-check-batch', ids),
  assignSavedProxy: (id, profileIds) => ipcRenderer.invoke('proxy-center-assign', id, profileIds),
  diagnoseBrowserEngines: () => ipcRenderer.invoke('diagnose-browser-engines'),
  getPinnedBrowserRuntimes: () => ipcRenderer.invoke('engine-runtime-status'),
  registerPinnedBrowserRuntime: engine => ipcRenderer.invoke('engine-runtime-register',engine),
  clearPinnedBrowserRuntime: engine => ipcRenderer.invoke('engine-runtime-clear',engine),
  listInstalledExtensions: () => ipcRenderer.invoke('extension-list'),
  installExtensionFromFolder: () => ipcRenderer.invoke('extension-install'),
  assignExtensionProfiles: (id,ids,enabled) => ipcRenderer.invoke('extension-assign',id,ids,enabled),
  removeInstalledExtension: id => ipcRenderer.invoke('extension-remove',id),
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getLicenseStatus: () => ipcRenderer.invoke('license-center-status'),
  getLicenseServiceStatus: () => ipcRenderer.invoke('license-center-service-status'),
  verifyLicenseOnline: () => ipcRenderer.invoke('license-center-verify-online'),
  activateLicense: token => ipcRenderer.invoke('license-center-activate',token),
  deactivateLicense: () => ipcRenderer.invoke('license-center-deactivate'),
  copyInstallationId: () => ipcRenderer.invoke('license-center-copy-installation'),
  listSessionSnapshots: id => ipcRenderer.invoke('session-snapshots-list',id),
  createSessionSnapshot: (id,pass) => ipcRenderer.invoke('session-snapshots-create',id,pass),
  inspectSessionSnapshot: (id,snapshotId,pass) => ipcRenderer.invoke('session-snapshots-inspect',id,snapshotId,pass),
  restoreSessionSnapshot: (id,snapshotId,pass,confirmation) =>
    ipcRenderer.invoke('session-snapshots-restore',id,snapshotId,pass,confirmation),
  removeSessionSnapshot: (id,snapshotId,confirmation) =>
    ipcRenderer.invoke('session-snapshots-remove',id,snapshotId,confirmation),
  exportEncryptedSnapshot: (id,snapshotId,passphrase) =>
    ipcRenderer.invoke('session-snapshots-export',id,snapshotId,passphrase),
  importEncryptedSnapshot: (id,passphrase) =>
    ipcRenderer.invoke('session-snapshots-import',id,passphrase),
  recoverProfileFromSnapshot: (passphrase,name,confirmation) =>
    ipcRenderer.invoke('session-snapshots-recover-profile',passphrase,name,confirmation),
  aiAdvisorStatus: () => ipcRenderer.invoke('ai-advisor-status'),
  aiAdvisorSetBudget: limit => ipcRenderer.invoke('ai-advisor-budget-set',limit),
  aiAdvisorConfigure: data => ipcRenderer.invoke('ai-advisor-configure',data),
  aiAdvisorForgetKey: () => ipcRenderer.invoke('ai-advisor-forget-key'),
  aiAdvisorAsk: data => ipcRenderer.invoke('ai-advisor-ask',data),
  aiAdvisorStop: () => ipcRenderer.invoke('ai-advisor-stop'),
  aiAdvisorWorkflowDraft: data => ipcRenderer.invoke('ai-advisor-workflow-draft',data),
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  bulkCreateProfiles: options => ipcRenderer.invoke('bulk-create-profiles', options),
  previewProfileCsv: text => ipcRenderer.invoke('profile-import-preview',text),
  importProfilesCsv: text => ipcRenderer.invoke('profile-import-commit',text),
  previewProfileUpdateCsv: text => ipcRenderer.invoke('profile-update-preview',text),
  updateProfilesCsv: text => ipcRenderer.invoke('profile-update-commit',text),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  listTrashedProfiles: () => ipcRenderer.invoke('list-trashed-profiles'),
  restoreTrashedProfile: id => ipcRenderer.invoke('restore-trashed-profile',id),
  purgeTrashedProfile: id => ipcRenderer.invoke('purge-trashed-profile',id),
  purgeExpiredTrash: () => ipcRenderer.invoke('purge-expired-trash'),
  startBrowser: (id) => ipcRenderer.invoke('start-browser', id),
  stopBrowser: (id) => ipcRenderer.invoke('stop-browser', id),
  getActiveBrowsers: () => ipcRenderer.invoke('get-active-browsers'),
  previewProfileCache: ids => ipcRenderer.invoke('cache-manager-preview',ids),
  clearProfileCache: (ids,confirmation) => ipcRenderer.invoke('cache-manager-clear',ids,confirmation),
  arrangeBrowserWindows: (ids, mode) => ipcRenderer.invoke('window-manager-arrange',ids,mode),
  openUrlForStoppedProfiles: (ids,url) => ipcRenderer.invoke('window-manager-open-url',ids,url),
  openUrlInRunningProfiles: (ids,url) => ipcRenderer.invoke('window-manager-open-live-url',ids,url),
  checkProxy: (proxy) => ipcRenderer.invoke('check-proxy', proxy),
  checkIpCollision: (payload) => ipcRenderer.invoke('check-ip-collision', payload),
  generateFingerprint: (options) => ipcRenderer.invoke('generate-fingerprint', options),
  bundledEngineStatus: () => ipcRenderer.invoke('bundled-engine-status'),
  camoufoxInstallStatus: () => ipcRenderer.invoke('camoufox-install-status'),
  installCamoufoxEngine: () => ipcRenderer.invoke('camoufox-install'),
  selectCamoufoxProvider: provider => ipcRenderer.invoke('camoufox-provider-select',provider),
  selectBundledEngine: source => ipcRenderer.invoke('bundled-engine-select',source),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
};

// Electron prefixes every error thrown in the main process with
// "Error invoking remote method '<channel>': Error: ". Customers saw that
// technical English in alerts and the License screen, so strip it here once
// for every call. Main-process messages a customer meets in everyday flows
// (session snapshots, signed updates, proxy vault, opening a profile) are
// still English in the core modules; translate those exact messages here.
// test/ipc-error-messages.js checks each key still exists in src/.
// (Activation errors are explained by src/ui/licenseCenter.js.)
const IPC_PREFIX = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/;
const CUSTOMER_TEXT = {
  'Close the browser and finish RPA before changing session data':
    'Hãy đóng trình duyệt của hồ sơ và chờ RPA chạy xong rồi mới thao tác với dữ liệu phiên.',
  'Maximum ten snapshots per profile; delete an older one first':
    'Mỗi hồ sơ có tối đa 10 snapshot. Hãy xóa bớt một snapshot cũ trước.',
  'Profile directory is empty; open and close browser first':
    'Hồ sơ chưa có dữ liệu phiên. Hãy mở hồ sơ, đóng trình duyệt rồi tạo snapshot.',
  'Profile snapshot is larger than 1200 files or 32 MB':
    'Dữ liệu phiên của hồ sơ vượt giới hạn snapshot (1.200 tệp hoặc 32 MB). Hãy dọn bộ nhớ đệm của hồ sơ rồi thử lại.',
  'Snapshot exceeds 32 MB': 'Snapshot vượt giới hạn 32 MB.',
  'Not a valid LHM encrypted session snapshot': 'Tệp này không phải snapshot phiên mã hóa của LHM.',
  'Corrupted encrypted snapshot': 'Snapshot bị hỏng, không khôi phục được.',
  'Snapshot belongs to a different profile or browser engine':
    'Snapshot này thuộc hồ sơ khác hoặc loại trình duyệt khác.',
  'Type KHOI PHUC to confirm': 'Gõ đúng KHOI PHUC để xác nhận khôi phục.',
  'Type XOA SNAPSHOT to confirm': 'Gõ đúng XOA SNAPSHOT để xác nhận xóa.',
  'No signed update was verified':
    'Chưa có bản cập nhật nào được xác minh chữ ký. Bấm "Kiểm tra phiên bản online" trước.',
  'Signed update offer expired or invalid':
    'Thông tin bản cập nhật đã hết hạn hoặc không hợp lệ. Hãy bấm kiểm tra lại.',
  'Update size differs from signed manifest':
    'Tệp tải về không khớp bản đã ký nên đã bị loại bỏ. Hãy thử tải lại.',
  'Update SHA-256 mismatch: discarded unsafe installer':
    'Tệp tải về không khớp bản đã ký (SHA-256) nên đã bị xóa để an toàn. Hãy thử tải lại.',
  'Refusing to replace an existing installer':
    'Thư mục tải đã có tệp bộ cài cùng tên. Hãy xóa hoặc đổi tên tệp cũ rồi tải lại.',
  'Destination directory does not exist': 'Thư mục lưu bộ cài không tồn tại.',
  'OS credential vault unavailable':
    'Windows chưa cho phép mã hóa mật khẩu trên tài khoản này nên chưa lưu được mật khẩu proxy.',
  'Installed runtime cannot handle this engine':
    'Trình duyệt cài trên máy không hỗ trợ loại trình duyệt của hồ sơ này. Kiểm tra mục Nguồn trình duyệt.'
};
const CUSTOMER_PREFIX = [
  ['Restore rollback failed; original data remains at ', 'Khôi phục thất bại và không hoàn tác được; dữ liệu gốc vẫn ở: '],
  ['Launch readiness blocked: ', 'Chưa mở được hồ sơ — kiểm tra trước khi mở báo: '],
  ['Signal-chain preflight blocked inconsistent profile: ', 'Chưa mở được hồ sơ vì cấu hình không nhất quán: ']
];
function customerText(message) {
  if (Object.prototype.hasOwnProperty.call(CUSTOMER_TEXT, message)) return CUSTOMER_TEXT[message];
  for (const [prefix, text] of CUSTOMER_PREFIX)
    if (message.startsWith(prefix)) return text + message.slice(prefix.length);
  return message;
}
function cleanIpcError(error) {
  if (!error || typeof error.message !== 'string') return error;
  const stripped = error.message.replace(IPC_PREFIX, '');
  const text = customerText(stripped);
  if (text === error.message) return error;
  const clean = new Error(text);
  if (error.code) clean.code = error.code;
  return clean;
}
for (const [name, fn] of Object.entries(api)) {
  api[name] = (...args) => {
    const result = fn(...args);
    return result && typeof result.then === 'function'
      ? result.catch(error => { throw cleanIpcError(error); })
      : result;
  };
}

contextBridge.exposeInMainWorld('api', api);
