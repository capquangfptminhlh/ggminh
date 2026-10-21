const { app, BrowserWindow, ipcMain, clipboard, dialog, safeStorage } = require('electron');
const ProxyCredentialVault = require('./src/security/proxyCredentialVault');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const Store = require('./src/db/store');
const {inspectProfilesCsv,importProfilesCsv} = require('./src/ops/profileCsvImport');
const {inspectProfilesCsvUpdate,updateProfilesFromCsv} = require('./src/ops/profileCsvUpdate');
const BrowserLauncher = require('./src/engine/browserLauncher');
const { generateFingerprint } = require('./src/engine/fingerprint');
const { checkProxy } = require('./src/engine/proxyChecker');
const { createApiServer } = require('./src/api/server');
const BehaviorMonitor = require('./src/monitor/behaviorMonitor');
const { WorkflowStore, AutomationRunner } = require('./src/automation/studio');
const { BatchAutomation } = require('./src/automation/batch');
const { LocalScheduler } = require('./src/automation/localScheduler');
const { graphForSteps } = require('./src/automation/flowGraph');
const { createWindowBrowser } = require('./src/automation/windowBrowser');
const { RecorderManager } = require('./src/automation/recorder');
const { createRecorderWindow } = require('./src/automation/recorderWindow');
const { checkProfile } = require('./src/health/profileHealth');
const {buildReadiness}=require('./src/health/releaseReadiness');
const {buildSupportReport}=require('./src/ops/supportReport');
const { ConfigBackup } = require('./src/backup/configBackup');
const { auditIsolation } = require('./src/privacy/isolation');
const { inspectFingerprint } = require('./src/privacy/fingerprintAudit');
const { diagnoseBrowsers } = require('./src/engine/browserDiagnostics');
const { RuntimeRegistry } = require('./src/engine/runtimeRegistry');
const {BundledEngineManager}=require('./src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('./src/engine/camoufoxAdapter');
const {arrangeWindows,openUrlForStoppedProfiles} = require('./src/ops/windowOperations');
const {openInRunning} = require('./src/ops/liveNavigation');
const {NavigationSynchronizer}=require('./src/ops/navigationSynchronizer');
const {CloudClient}=require('./src/sync/cloudClient');
const {applyCloudMetadata}=require('./src/sync/applyMetadata');
const cacheManager = require('./src/ops/cacheManager');
const {SessionSnapshots} = require('./src/ops/sessionSnapshots');
const {exportEncrypted,importEncrypted} = require('./src/ops/snapshotPortability');
const {recoverProfile} = require('./src/ops/snapshotRecovery');
const ProxyCenter = require('./src/proxies/proxyCenter');
const {ExtensionManager} = require('./src/extensions/manager');
const {AIAdvisor} = require('./src/ai/advisor');
const {proposeWorkflow} = require('./src/ai/workflowDraft');
const {LicenseManager} = require('./src/licensing/manager');
const {LicensePolicy} = require('./src/licensing/enforcement');
const {OnlineLicenseVerifier} = require('./src/licensing/onlineVerifier');
const { duplicateTemplate, batchStop, batchOpen, batchAssignGroup, batchAssignTags, overview, exportCsv, uniqueIds } = require('./src/ops/operations');
const { buildDashboardSummary } = require('./src/ops/dashboard');

let mainWindow = null;
let store = null;
let launcher = null;
let runtimeRegistry = null;
let bundledEngine = null;
let camoufoxAdapter = null;
let behaviorMonitor = null;
let workflowStore = null;
let automationRunner = null;
let batchAutomation = null;
let sessionSnapshots = null;
let navigationSynchronizer = null;
let localScheduler = null;
let schedulerTimer = null;
let recorderManager = null;
let configBackup = null;
let proxyCenter = null;
let extensionManager = null;
let aiAdvisor = null;
let licenseManager = null;
let licensePolicy = null;
let onlineLicenseVerifier = null;
let licenseTimer = null;
let proxyVault = null;
let apiServer = null;
const apiKey = crypto.randomBytes(32).toString('hex');

function apiStatus() {
  return { enabled: !!apiServer?.listening, port: store.getSettings().apiPort || 50325 };
}

async function setApiEnabled(enabled) {
  if (!enabled) {
    if (apiServer) {
      const current = apiServer;
      apiServer = null;
      await new Promise(resolve => current.close(resolve));
    }
    store.updateSettings({ apiEnabled: false });
    return apiStatus();
  }
  licensePolicy.require('api');
  if (apiServer?.listening) return apiStatus();
  const port = Number(store.getSettings().apiPort || 50325);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid API port');
  }
  const service = createApiServer(store, launcher, { apiKey, behaviorMonitor,licensePolicy });
  try {
    await new Promise((resolve, reject) => {
      service.once('error', reject);
      service.listen(port, '127.0.0.1', () => {
        service.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    try { service.close(); } catch (_) {}
    throw new Error('Cannot start Local API: ' + error.message);
  }
  apiServer = service;
  store.updateSettings({ apiEnabled: true });
  return apiStatus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0f19', autoHideMenuBar: true,
    title: 'LHM Ads Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    mainWindow.setSize(1440, 900);
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          // The image used as a release preview must show the real version.
          const release=app.getVersion();
          const shown=await mainWindow.webContents.executeJavaScript(
            `({ready:document.body.dataset.versionReady,
               header:document.getElementById('lhm-header-version')?.textContent,
               nav:document.getElementById('lhm-nav-version')?.textContent,
               title:document.title})`,true);
          if(shown.ready!=='true'||shown.header!=='v'+release||
             shown.nav!=='v'+release||!shown.title.includes('v'+release))
            throw Error('UI screenshot version mismatch: '+JSON.stringify(shown));
          const png = await mainWindow.webContents.capturePage();
          const output = path.join(__dirname, 'dist', 'workspace-preview.png');
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, png.toPNG());
          console.log('[UI smoke] Saved workspace preview');
          const railCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-v7-show-rail').click(); return {collapsed:document.body.dataset.lhmRail==='closed',aria:document.getElementById('lhm-v7-show-rail').getAttribute('aria-expanded')}; })()",true);
          if(!railCheck.collapsed||railCheck.aria!=='false')
            throw Error('AI rail collapse failed: '+JSON.stringify(railCheck));
          await new Promise(resolve=>setTimeout(resolve,450));
          const fullTable=await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname,'dist','workspace-expanded-preview.png'),fullTable.toPNG());
          const paletteCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-v7-command-open').click(); return {opened:document.getElementById('lhm-v7-command-palette').classList.contains('open'),focus:document.activeElement?.id,count:document.querySelectorAll('.lhm-v7-command-item').length}; })()",true);
          if(!paletteCheck.opened||paletteCheck.focus!=='lhm-v7-command-search'||paletteCheck.count<6)
            throw Error('Command palette failed: '+JSON.stringify(paletteCheck));
          await new Promise(resolve=>setTimeout(resolve,280));
          const paletteImage=await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname,'dist','workspace-command-preview.png'),paletteImage.toPNG());
          console.log('[UI smoke] Verified expanded profile workspace and keyboard palette');
          const cloudCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-v7-command-close').click(); document.getElementById('btn-cloud-sync').click(); return {open:document.getElementById('modal-cloud-sync').classList.contains('open'),token:!!document.getElementById('cloud-sync-token'),device:!!document.getElementById('cloud-sync-device-key'),team:!!document.getElementById('cloud-team-invite'),history:!!document.getElementById('cloud-sync-history')}; })()",true);
          if(!Object.values(cloudCheck).every(Boolean))
            throw Error('Cloud Sync + Team UI failed: '+JSON.stringify(cloudCheck));
          await new Promise(resolve=>setTimeout(resolve,300));
          const cloudImage=await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname,'dist','workspace-cloud-sync-preview.png'),cloudImage.toPNG());
          const syncCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('cloud-sync-done').click(); document.getElementById('btn-window-manager').click(); return {open:document.getElementById('modal-window-manager').classList.contains('open'),master:!!document.getElementById('wm-sync-master'),hosts:!!document.getElementById('wm-sync-hosts'),start:!!document.getElementById('wm-sync-start'),stop:!!document.getElementById('wm-sync-stop')}; })()",true);
          if(!Object.values(syncCheck).every(Boolean))
            throw Error('Synchronizer modal UI failed: '+JSON.stringify(syncCheck));
          await new Promise(resolve=>setTimeout(resolve,350));
          const syncImage=await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname,'dist','workspace-synchronizer-preview.png'),syncImage.toPNG());
          console.log('[UI smoke] Verified integrated Team, Cloud Sync and Synchronizer modals');
        } catch (error) {
          console.error('[UI smoke] Screenshot unavailable:', error);
          process.exitCode = 1;
        } finally { app.quit(); }
      }, 1800);
    });
  }
  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initIPC() {
  ipcMain.handle('get-profiles', () => store.getProfiles());
  ipcMain.handle('get-app-info', () => ({
    name:'LHM Ads Browser',
    version:app.getVersion(),
    platform:process.platform,
    arch:process.arch,
    packaged:app.isPackaged
  }));
  ipcMain.handle('license-center-status', () => licensePolicy.status());
  ipcMain.handle('license-center-verify-online', async () => {
    const result=await onlineLicenseVerifier.verifyNow();
    return {result,license:licensePolicy.status()};
  });
  ipcMain.handle('license-center-activate', async (_,token) => {
    licenseManager.activate(token);
    if(onlineLicenseVerifier.endpoint){
      try{await onlineLicenseVerifier.verifyNow();}
      catch(error){console.warn('[License] Online activation pending:',error.message);}
    }
    return licensePolicy.status();
  });
  ipcMain.handle('license-center-deactivate', () => {
    licenseManager.deactivate();
    return licensePolicy.status();
  });
  ipcMain.handle('license-center-copy-installation', () => {
    clipboard.writeText(licenseManager.installationId);
    return true;
  });
  ipcMain.handle('session-snapshots-list', (_,id) => sessionSnapshots.list(id));
  ipcMain.handle('session-snapshots-create', (_,id,passphrase) =>
    sessionSnapshots.create(id,passphrase));
  ipcMain.handle('session-snapshots-inspect', (_,id,snapshotId,passphrase) =>
    sessionSnapshots.inspect(id,snapshotId,passphrase));
  ipcMain.handle('session-snapshots-restore', (_,id,snapshotId,passphrase,confirmation) =>
    sessionSnapshots.restore(id,snapshotId,passphrase,confirmation));
  ipcMain.handle('session-snapshots-remove', (_,id,snapshotId,confirmation) =>
    sessionSnapshots.remove(id,snapshotId,confirmation));
  ipcMain.handle('session-snapshots-export', async (_,id,snapshotId,passphrase) => {
    // Do not ask the renderer to pick or transmit filesystem paths.
    // Validate profile ownership + password before exposing the destination dialog.
    sessionSnapshots.inspect(id,snapshotId,passphrase);
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Xuất snapshot mã hóa ra ổ sao lưu',
      defaultPath:'LHM-'+snapshotId+'.lhmsnap',
      filters:[{name:'LHM Encrypted Session Snapshot',extensions:['lhmsnap']}]
    });
    if(canceled||!filePath)return {canceled:true};
    return {canceled:false,...exportEncrypted(sessionSnapshots,id,snapshotId,filePath,passphrase)};
  });
  ipcMain.handle('session-snapshots-recover-profile', async (_,passphrase,name,confirmation) => {
    if(confirmation!=='TAO HO SO')throw Error('Xác nhận khôi phục bằng TAO HO SO');
    if(typeof passphrase!=='string'||passphrase.length<12)
      throw Error('Nhập mật khẩu snapshot trước khi chọn file');
    const {canceled,filePaths}=await dialog.showOpenDialog(mainWindow,{
      title:'Khôi phục hồ sơ gốc từ file snapshot mã hóa',
      properties:['openFile'],
      filters:[{name:'LHM Encrypted Session Snapshot',extensions:['lhmsnap']}]
    });
    if(canceled||!filePaths?.length)return {canceled:true};
    const result=recoverProfile(sessionSnapshots,filePaths[0],passphrase,name,confirmation);
    behaviorMonitor.record('profile_save',result.profileId,'manual');
    return {canceled:false,...result};
  });
  ipcMain.handle('session-snapshots-import', async (_,id,passphrase) => {
    if(typeof passphrase!=='string'||passphrase.length<12)
      throw Error('Nhập mật khẩu snapshot trước khi chọn file');
    sessionSnapshots.source(id);
    const {canceled,filePaths}=await dialog.showOpenDialog(mainWindow,{
      title:'Nhập snapshot mã hóa của đúng hồ sơ',
      properties:['openFile'],
      filters:[{name:'LHM Encrypted Session Snapshot',extensions:['lhmsnap']}]
    });
    if(canceled||!filePaths?.length)return {canceled:true};
    return {canceled:false,...importEncrypted(sessionSnapshots,id,filePaths[0],passphrase)};
  });
  ipcMain.handle('ai-advisor-status', () => aiAdvisor.status());
  ipcMain.handle('ai-advisor-configure', (_, value) => aiAdvisor.configure(value));
  ipcMain.handle('ai-advisor-forget-key', () => aiAdvisor.clear());
  ipcMain.handle('ai-advisor-ask', (_, value) => aiAdvisor.ask(value,store.getProfiles()));
  ipcMain.handle('ai-advisor-stop', () => aiAdvisor.abort());
  ipcMain.handle('ai-advisor-workflow-draft', (_, data) =>
    proposeWorkflow(aiAdvisor,store,data));
  ipcMain.handle('profile-import-preview', (_, csv) => inspectProfilesCsv(store,csv));
  ipcMain.handle('profile-import-commit', (_, csv) => {
    const result=importProfilesCsv(store,csv);
    for(const id of result.profileIds)behaviorMonitor.record('profile_save',id,'manual');
    return result;
  });
  ipcMain.handle('profile-update-preview', (_, csv) =>
    inspectProfilesCsvUpdate(store,launcher,csv));
  ipcMain.handle('profile-update-commit', (_, csv) => {
    const result=updateProfilesFromCsv(store,launcher,csv);
    for(const id of result.profileIds)behaviorMonitor.record('profile_save',id,'manual');
    return result;
  });
  ipcMain.handle('bulk-create-profiles', (_, options) => {
    const created = store.createProfilesBulk(options);
    for (const profile of created) behaviorMonitor.record('profile_save', profile.id, 'manual');
    return { count: created.length, profileIds: created.map(p => p.id) };
  });
  ipcMain.handle('diagnose-browser-engines', () => diagnoseBrowsers(store.getSettings()));
  ipcMain.handle('engine-runtime-status', () => runtimeRegistry.status());
  ipcMain.handle('bundled-engine-status', () => ({
    source:store.getSettings().engineSource==='bundled'?'bundled':'system',
    bundle:bundledEngine.status(),
    geckoProvider:store.getSettings().geckoProvider==='camoufox'?'camoufox':'firefox',
    camoufox:camoufoxAdapter.status()
  }));
  ipcMain.handle('camoufox-provider-select', (_event,provider)=>{
    if(!['firefox','camoufox'].includes(provider))throw Error('Invalid Firefox provider');
    if(launcher.listActive().length||launcher.pendingStarts.size)
      throw Error('Đóng tất cả trình duyệt trước khi thay đổi engine Firefox');
    if(provider==='camoufox'&&!camoufoxAdapter.status().installed)
      throw Error('Camoufox TypeScript package not installed; no browser binary is bundled');
    store.updateSettings({geckoProvider:provider});
    return {provider,status:camoufoxAdapter.status()};
  });
  ipcMain.handle('bundled-engine-select', (_event,source) => {
    if(!['system','bundled'].includes(source))throw Error('Unsupported engine source');
    if(launcher.listActive().length||launcher.pendingStarts.size)
      throw Error('Đóng tất cả trình duyệt trước khi đổi nguồn engine');
    if(source==='bundled')bundledEngine.verify();
    store.updateSettings({engineSource:source});
    return {source,bundle:bundledEngine.status()};
  });
  ipcMain.handle('engine-runtime-register', async (_,engine) => {
    if(!['chromium','gecko'].includes(engine))throw Error('Unknown browser engine');
    if(launcher.listActive().some(x=>x.engine===engine)||launcher.pendingStarts.size)
      throw Error('Đóng tất cả trình duyệt trước khi ghim bản engine');
    const selection=await dialog.showOpenDialog(mainWindow,{
      title:'Chọn Chrome/Edge hoặc Firefox chính thức để ghim phiên bản',
      properties:['openFile'],
      filters:[{name:'Windows browser executable',extensions:['exe']}]
    });
    if(selection.canceled||!selection.filePaths?.length)return {canceled:true};
    return {canceled:false,runtime:runtimeRegistry.register(engine,selection.filePaths[0])};
  });
  ipcMain.handle('engine-runtime-clear', (_,engine) => {
    if(!['chromium','gecko'].includes(engine))throw Error('Unknown browser engine');
    if(launcher.listActive().some(x=>x.engine===engine)||launcher.pendingStarts.size)
      throw Error('Đóng tất cả trình duyệt trước khi bỏ ghim engine');
    return runtimeRegistry.clear(engine);
  });
  ipcMain.handle('extension-list', () => extensionManager.list());
  ipcMain.handle('extension-install', async () => {
    const selected=await dialog.showOpenDialog(mainWindow,{
      title:'Chọn thư mục tiện ích Chromium đã giải nén',
      properties:['openDirectory']
    });
    if(selected.canceled||!selected.filePaths?.length)return {canceled:true};
    return {canceled:false,extension:extensionManager.install(selected.filePaths[0])};
  });
  ipcMain.handle('extension-assign', (_,id,ids,enabled) =>
    extensionManager.assign(id,ids,enabled));
  ipcMain.handle('extension-remove', (_,id) => extensionManager.remove(id));
  ipcMain.handle('inspect-fingerprint', (_, input) => inspectFingerprint(input));

  ipcMain.handle('proxy-center-list', () => proxyCenter.list());
  ipcMain.handle('proxy-center-save', (_, proxy) => proxyCenter.save(proxy));
  ipcMain.handle('proxy-center-delete', (_, id) => proxyCenter.delete(id));
  ipcMain.handle('proxy-center-check', (_, id) => proxyCenter.verify(id));
  ipcMain.handle('proxy-center-import', (_, csv) => proxyCenter.importCsv(csv));
  ipcMain.handle('proxy-center-check-batch', (_, ids) => proxyCenter.verifyBatch(ids));
  ipcMain.handle('proxy-center-assign', (_, id, profileIds) => {
    const result = proxyCenter.assign(id, profileIds);
    for (const profileId of result.profileIds) behaviorMonitor.record('profile_save', profileId, 'manual');
    return result;
  });

  ipcMain.handle('audit-profile-isolation', () =>
    auditIsolation(store.baseDir, store.getProfiles(), { isRunning: id => launcher.isBusy(id) }));
  ipcMain.handle('dashboard-overview', () => {
    const profiles = store.getProfiles();
    return buildDashboardSummary({
      profiles,
      active: launcher.listActive(),
      healthReports: profiles.map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault })),
      proxies: proxyCenter.list(),
      workflows: workflowStore.list(),
      automation: automationRunner.status(),
      behavior: behaviorMonitor.getReport()
    });
  });
  ipcMain.handle('control-tower-snapshot', () => {
    const profiles = store.getProfiles();
    const reports = profiles.map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault }));
    return overview(profiles, launcher.listActive(), reports, behaviorMonitor.getReport());
  });
  ipcMain.handle('control-tower-duplicate', (_, id) => {
    const newProfile = duplicateTemplate(store, id);
    behaviorMonitor.record('profile_save', newProfile.id, 'manual');
    return newProfile;
  });
  ipcMain.handle('control-tower-open', (_, ids) => batchOpen(store,launcher,ids,behaviorMonitor));
  ipcMain.handle('control-tower-assign-group', (_, ids, group) =>
    batchAssignGroup(store,launcher,ids,group,behaviorMonitor));
  ipcMain.handle('control-tower-assign-tags', (_, ids, tags, mode) =>
    batchAssignTags(store,ids,tags,mode,behaviorMonitor));
  ipcMain.handle('control-tower-stop', (_, ids) => {
    const selected = uniqueIds(ids);
    const status = automationRunner.status();
    const inUseProfile = status.status === 'running'
      ? (workflowStore.get(status.workflowId)?.profileId || status.profileId) : null;
    if (inUseProfile && selected.includes(inUseProfile)) {
      throw new Error('Hãy dừng Automation Studio trước khi đóng hồ sơ đang chạy quy trình');
    }
    return batchStop(store, launcher, selected, behaviorMonitor);
  });
  ipcMain.handle('control-tower-export', async (_, ids) => {
    const all = store.getProfiles();
    const profiles = Array.isArray(ids) && ids.length
      ? (() => { const chosen = uniqueIds(ids); return all.filter(p => chosen.includes(p.id)); })()
      : all;
    if (!profiles.length) throw new Error('Không có hồ sơ để xuất');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất báo cáo danh sách hồ sơ (không có mật khẩu)',
      defaultPath: 'LHM-Profiles-' + new Date().toISOString().slice(0, 10) + '.csv',
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const reports = profiles.map(p => checkProfile(p, { settings: store.getSettings() }));
    const report = exportCsv(profiles, reports, launcher.listActive());
    fs.writeFileSync(filePath, report, 'utf8');
    return { canceled: false, count: profiles.length };
  });
  ipcMain.handle('get-profile-health', (_, id) => {
    const profile = store.getProfile(id);
    if (!profile) throw new Error('Không tìm thấy hồ sơ');
    return checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault });
  });
  ipcMain.handle('get-all-profile-health', () =>
    store.getProfiles().map(profile => checkProfile(profile, { settings: store.getSettings(), proxies: store.data.proxies, vault: proxyVault })));
  ipcMain.handle('get-local-readiness', () => {
    const profiles=store.getProfiles();
    const reports=profiles.map(profile=>checkProfile(profile,{
      settings:store.getSettings(),proxies:store.data.proxies,vault:proxyVault
    }));
    return buildReadiness({profiles,reports,proxies:proxyCenter.list(),
      active:launcher.listActive(),workflows:workflowStore.list(),
      vault:proxyVault,platform:process.platform});
  });
  ipcMain.handle('export-support-report', async () => {
    const profiles=store.getProfiles();
    const reports=profiles.map(profile=>checkProfile(profile,{
      settings:store.getSettings(),proxies:store.data.proxies,vault:proxyVault
    }));
    const summary=buildReadiness({profiles,reports,proxies:proxyCenter.list(),
      active:launcher.listActive(),workflows:workflowStore.list(),vault:proxyVault});
    const report=buildSupportReport(summary,{
      version:app.getVersion(),platform:process.platform,arch:process.arch
    });
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Xuất báo cáo kỹ thuật LHM (không chứa dữ liệu nhạy cảm)',
      defaultPath:'LHM-Support-'+new Date().toISOString().slice(0,10)+'.json',
      filters:[{name:'JSON Support Report',extensions:['json']}]
    });
    if(canceled||!filePath)return {canceled:true};
    fs.writeFileSync(filePath,JSON.stringify(report,null,2),{mode:0o600});
    return {canceled:false};
  });
  ipcMain.handle('export-config-backup', async (_, passphrase) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất bản sao lưu cấu hình được mã hóa',
      defaultPath: 'LHM-Config-Backup-' + new Date().toISOString().slice(0, 10) + '.lhmbak',
      filters: [{ name: 'LHM Encrypted Backup', extensions: ['lhmbak'] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const data = configBackup.export(passphrase);
    fs.writeFileSync(filePath, data, { mode: 0o600 });
    return { canceled: false, filePath };
  });
  ipcMain.handle('preview-config-backup', async (_, passphrase) => {
    const {canceled,filePaths}=await dialog.showOpenDialog(mainWindow,{
      title:'Xem trước bản sao lưu được mã hóa (không nhập dữ liệu)',
      properties:['openFile'],
      filters:[{name:'LHM Encrypted Backup',extensions:['lhmbak']}]
    });
    if(canceled||!filePaths?.length)return {canceled:true};
    if(fs.statSync(filePaths[0]).size>8*1024*1024)throw Error('Tệp sao lưu quá lớn');
    return {canceled:false,...configBackup.inspect(fs.readFileSync(filePaths[0],'utf8'),passphrase)};
  });
  ipcMain.handle('import-config-backup', async (_, passphrase) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn bản sao lưu cấu hình LHM',
      properties: ['openFile'],
      filters: [{ name: 'LHM Encrypted Backup', extensions: ['lhmbak'] }]
    });
    if (canceled || !filePaths.length) return { canceled: true };
    const stats = fs.statSync(filePaths[0]);
    if (stats.size > 8 * 1024 * 1024) throw new Error('Tệp sao lưu quá lớn');
    const report = configBackup.import(fs.readFileSync(filePaths[0], 'utf8'), passphrase);
    return { canceled: false, ...report };
  });
  ipcMain.handle('studio-list', () => workflowStore.list());
  ipcMain.handle('studio-batch-status', () => batchAutomation.status());
  ipcMain.handle('studio-batch-preview', (_, id,ids,onError) =>
    batchAutomation.preview(id,ids,onError));
  ipcMain.handle('studio-batch-run', (_, id,ids,onError) => {
    licensePolicy.require('automation');
    if(recorderManager.status().state==='recording')
      throw Error('Dừng Recorder trước khi chạy hàng đợi');
    return batchAutomation.start(id,ids,onError);
  });
  ipcMain.handle('studio-batch-stop', () => batchAutomation.stop());
  ipcMain.handle('studio-schedule-list', () => localScheduler.list());
  ipcMain.handle('studio-schedule-add', (_, value) => localScheduler.create(value));
  ipcMain.handle('studio-schedule-enable', (_, id, enabled) => localScheduler.setEnabled(id, enabled));
  ipcMain.handle('studio-schedule-delete', (_, id) => localScheduler.remove(id));

  ipcMain.handle('studio-graph-preview', (_, steps) => graphForSteps(steps));
  ipcMain.handle('studio-save', (_, value) => {
    if(batchAutomation.status().active &&
       value?.id===batchAutomation.status().batch?.workflowId)
      throw Error('Không sửa quy trình khi hàng đợi đang chạy');
    return workflowStore.save(value);
  });
  ipcMain.handle('studio-delete', (_, id) => {
    if (automationRunner.status().status === 'running' && automationRunner.status().workflowId === id) throw Error('Hãy dừng quy trình trước khi xóa');
    if (batchAutomation.status().active && batchAutomation.status().batch?.workflowId===id)
      throw Error('Hãy dừng hàng đợi RPA trước khi xóa quy trình');
    return workflowStore.delete(id);
  });
  ipcMain.handle('studio-run', (_, id) => {
    if (recorderManager.status().state === 'recording') throw new Error('Dừng Recorder trước khi chạy Automation Studio');
    if (batchAutomation.status().active)throw Error('Hàng đợi RPA đang hoạt động');
    return automationRunner.run(id);
  });
  ipcMain.handle('recorder-start', async (_, options) => {
    licensePolicy.require('automation');
    if (automationRunner.status().status === 'running' || batchAutomation.status().active)
      throw new Error('Hãy dừng workflow hoặc hàng đợi RPA trước khi ghi thao tác');
    return recorderManager.start(options);
  });
  ipcMain.handle('recorder-status', () => recorderManager.status());
  ipcMain.handle('recorder-stop', () => recorderManager.stop());
  ipcMain.handle('recorder-take', () => recorderManager.takeSteps());
  ipcMain.handle('studio-stop', () =>
    batchAutomation.status().active?batchAutomation.stop():automationRunner.stop());
  ipcMain.handle('studio-approve', () => automationRunner.approve());
  ipcMain.handle('studio-status', () => automationRunner.status());
  ipcMain.handle('save-profile', (_, profile) => {
    // The Local API already forbids all live profile edits. Apply the same
    // lifecycle rule to desktop edits, including URLs, fingerprint and notes.
    if (profile?.id && store.getProfile(profile.id) && launcher.isBusy(profile.id))
      throw new Error('Hãy đóng hồ sơ trước khi chỉnh sửa cấu hình để tránh sai lệch dữ liệu của phiên đang chạy');
    const saved = store.saveProfile(profile);
    behaviorMonitor.record('profile_save', saved.id, 'manual');
    return saved;
  });
  ipcMain.handle('list-trashed-profiles', () => store.getTrashedProfiles());
  ipcMain.handle('restore-trashed-profile', (_, id) => {
    const restored=store.restoreTrashedProfile(id);
    behaviorMonitor.record('profile_save',id,'manual');
    return restored;
  });
  ipcMain.handle('purge-trashed-profile', (_, id) => store.purgeTrashedProfile(id));
  ipcMain.handle('purge-expired-trash', () => store.purgeExpiredTrashedProfiles());
  ipcMain.handle('delete-profile', (_, id) => {
    if (launcher.isBusy(id)) throw new Error('Hãy đóng hồ sơ và đợi tiến trình thoát trước khi xóa dữ liệu');
    const state = automationRunner.status();
    if (state.status === 'running' && state.profileId === id) throw new Error('Hồ sơ đang được Automation Studio sử dụng');
    if (batchAutomation.status().active &&
      batchAutomation.status().batch?.tasks.some(x=>x.profileId===id))
      throw Error('Không xóa profile khi hàng đợi RPA đang sử dụng');
    if (recorderManager.status().state === 'recording' && recorderManager.status().profileId === id) throw new Error('Hồ sơ đang được Recorder sử dụng');
    const deleted = store.trashProfile(id);
    if (deleted) behaviorMonitor.record('profile_delete', id, 'manual');
    return deleted;
  });
  ipcMain.handle('start-browser', async (_, id) => {
    const opened = await launcher.start(id);
    behaviorMonitor.record('profile_open', id, 'manual');
    return { profileId: opened.profileId, port: opened.port, alreadyRunning: !!opened.alreadyRunning };
  });
  ipcMain.handle('stop-browser', (_, id) => {
    const result = launcher.stop(id);
    if (result.success) behaviorMonitor.record('profile_close', id, 'manual');
    return result;
  });
  ipcMain.handle('get-active-browsers', () => launcher.listActive());
  ipcMain.handle('cache-manager-preview', (_, ids) => cacheManager.preview(store,launcher,ids));
  ipcMain.handle('cache-manager-clear', (_, ids, confirm) => cacheManager.clear(store,launcher,ids,confirm));
  ipcMain.handle('window-manager-arrange', (_, ids, mode) =>
    arrangeWindows(launcher,ids,mode));
  ipcMain.handle('window-manager-open-url', (_, ids, url) =>
    openUrlForStoppedProfiles(store,launcher,ids,url,behaviorMonitor));
  ipcMain.handle('window-manager-open-live-url', (_, ids, url) =>
    openInRunning(store,launcher,ids,url));
  ipcMain.handle('navigation-sync-status',()=>navigationSynchronizer.status());
  ipcMain.handle('navigation-sync-start',(_,options)=>navigationSynchronizer.start(options));
  ipcMain.handle('navigation-sync-stop',()=>navigationSynchronizer.stop());
  // Cloud Sync is always explicit. Keep API secrets ephemeral; never persist
  // customer bearer tokens or encryption passphrases in the local store.
  const cloudClientFor=(event,options)=>{
    if(event.sender!==mainWindow?.webContents)throw Error('Untrusted Cloud Sync IPC caller');
    return new CloudClient(options);
  };
  ipcMain.handle('cloud-sync-preview',async(event,options)=>{
    const cloud=cloudClientFor(event,options);
    return cloud.pull(options.passphrase);
  });
  ipcMain.handle('cloud-sync-push',async(event,options)=>{
    const cloud=cloudClientFor(event,options);
    return cloud.push(options.passphrase,store.getProfiles());
  });
  ipcMain.handle('cloud-sync-apply',async(event,options)=>{
    const cloud=cloudClientFor(event,options);
    const remote=await cloud.pull(options.passphrase);
    if(remote.empty)throw Error('Cloud is empty; nothing to apply');
    return applyCloudMetadata(store,launcher,remote.profiles,{
      remoteRevision:remote.revision,expectedRevision:options.expectedRevision,
      confirmation:options.confirmation
    },behaviorMonitor);
  });
  ipcMain.handle('cloud-team-members',async(event,options)=>
    cloudClientFor(event,options).listMembers());
  ipcMain.handle('cloud-team-invite',async(event,options,invite)=>
    cloudClientFor(event,options).issueInvite(invite));
  ipcMain.handle('cloud-team-revoke',async(event,options,memberId)=>
    cloudClientFor(event,options).revokeMember(memberId));
  ipcMain.handle('cloud-team-redeem',async(event,options,token)=>
    cloudClientFor(event,options).redeemInvite(token));
  ipcMain.handle('cloud-team-devices',async(event,options)=>
    cloudClientFor(event,options).listDevices());
  ipcMain.handle('cloud-team-enroll-device',async(event,options,request)=>
    cloudClientFor(event,options).enrollDevice(request));
  ipcMain.handle('cloud-team-revoke-device',async(event,options,id)=>
    cloudClientFor(event,options).revokeDevice(id));
  ipcMain.handle('cloud-sync-history',async(event,options)=>
    cloudClientFor(event,options).listHistory());
  ipcMain.handle('cloud-sync-restore-history',async(event,options,revision,confirmation)=>{
    if(confirmation!=='RESTORE CLOUD')throw Error('Type RESTORE CLOUD to confirm');
    return cloudClientFor(event,options).restoreHistory(options.passphrase,revision);
  });
  ipcMain.handle('check-proxy', (_, proxy) => checkProxy(proxy));
  ipcMain.handle('generate-fingerprint', (_, options) => generateFingerprint(options));
  ipcMain.handle('get-settings', () => store.getSettings());
  ipcMain.handle('save-settings', (_, settings) => {
    const allowed = {};
    if (typeof settings?.chromePath === 'string') allowed.chromePath = settings.chromePath;
    if (typeof settings?.geckoPath === 'string') allowed.geckoPath = settings.geckoPath;
    if (['dark', 'light'].includes(settings?.theme)) allowed.theme = settings.theme;
    return store.updateSettings(allowed);
  });
  ipcMain.handle('get-behavior-report', () => behaviorMonitor.getReport());
  ipcMain.handle('get-api-status', apiStatus);
  ipcMain.handle('set-api-enabled', (_, enabled) => setApiEnabled(enabled === true));
  ipcMain.handle('copy-api-key', () => {
    if (!apiServer?.listening) throw new Error('Enable Local API first');
    clipboard.writeText(apiKey);
    return true;
  });
}

app.whenReady().then(async () => {
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    app.setPath('userData', path.join(os.tmpdir(), 'lhm-ui-ci-' + process.pid));
  }
  const storageDir = path.join(app.getPath('userData'), 'storage');
  const legacyDir = path.join(__dirname, 'data');
  if (!fs.existsSync(path.join(storageDir, 'db.json')) &&
      fs.existsSync(path.join(legacyDir, 'db.json'))) {
    fs.mkdirSync(path.dirname(storageDir), { recursive: true });
    fs.cpSync(legacyDir, storageDir, { recursive: true, errorOnExist: false });
  }
  store = new Store(storageDir);
  runtimeRegistry = new RuntimeRegistry(storageDir);
  try { store.purgeExpiredTrashedProfiles(); }
  catch(error) { console.warn('[ProfileTrash] startup cleanup deferred:',error.message); }
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    const samples = [
      ['Demo · Chiến dịch 01','Khách hàng A','chromium'],
      ['Demo · Nội dung 02','Khách hàng B','chromium'],
      ['Demo · Kiểm thử 03','Nội bộ','gecko'],
      ['Demo · Đối soát 04','Khách hàng A','chromium']
    ];
    for (const [name,group,engine] of samples) {
      store.saveProfile({name,group,engine,startUrl:'https://example.com',
        fingerprint:{mode:'native'},proxy:{type:'direct'}});
    }
  }
  proxyVault = new ProxyCredentialVault(storageDir, safeStorage);
  aiAdvisor = new AIAdvisor(storageDir,safeStorage);
  licenseManager = new LicenseManager(storageDir);
  licensePolicy = new LicensePolicy(storageDir,licenseManager);
  onlineLicenseVerifier = new OnlineLicenseVerifier(storageDir,licenseManager,{
    endpoint:process.env.LHM_LICENSE_VERIFY_URL||null
  });
  licensePolicy.onlineVerifier=onlineLicenseVerifier;
  store.licensePolicy = licensePolicy;
  launcher = new BrowserLauncher(store,{proxyVault});
  bundledEngine=new BundledEngineManager(app.isPackaged
    ?path.join(process.resourcesPath,'lhm-engines')
    :path.join(__dirname,'resources','bundled-engines'));
  launcher.bundledEngine=bundledEngine;
  camoufoxAdapter=new CamoufoxAdapter(storageDir);
  launcher.camoufoxAdapter=camoufoxAdapter;
  navigationSynchronizer=new NavigationSynchronizer(store,launcher);
  launcher.runtimeRegistry=runtimeRegistry;
  launcher.licensePolicy = licensePolicy;
  extensionManager = new ExtensionManager(store,launcher);
  launcher.extensionManager = extensionManager;
  proxyCenter = new ProxyCenter(store, launcher, {vault:proxyVault});
  behaviorMonitor = new BehaviorMonitor(storageDir);
  workflowStore = new WorkflowStore(storageDir);
  configBackup = new ConfigBackup(store, workflowStore);
  automationRunner = new AutomationRunner(workflowStore, store, createWindowBrowser);
  automationRunner.licensePolicy = licensePolicy;
  batchAutomation = new BatchAutomation(storageDir, workflowStore, store, automationRunner);
  sessionSnapshots = new SessionSnapshots(store,launcher,{inUse:id=>
    (automationRunner.status().status==='running'&&automationRunner.status().profileId===id)||
    (batchAutomation.status().active&&batchAutomation.status().batch?.tasks.some(t=>t.profileId===id))||
    (recorderManager?.status().state==='recording'&&recorderManager.status().profileId===id)
  });
  localScheduler = new LocalScheduler(storageDir, workflowStore, automationRunner);
  // In-app polling only, never a Windows background service.
  schedulerTimer = setInterval(() => {
    if (recorderManager?.status().state === 'recording') return;
    localScheduler.tick().catch(error => console.warn('[Scheduler]',error.message));
  }, 60000);
  schedulerTimer.unref?.();
  if(onlineLicenseVerifier.endpoint){
    onlineLicenseVerifier.verifyNow().catch(error=>console.warn('[License] Online check unavailable:',error.message));
    licenseTimer=setInterval(()=>{
      onlineLicenseVerifier.verifyNow().catch(error=>console.warn('[License] Online check unavailable:',error.message));
    },12*60*60*1000);
    licenseTimer.unref?.();
  }
  recorderManager = new RecorderManager(store, createRecorderWindow);
  initIPC();
  createWindow();
  if (store.getSettings().apiEnabled === true) {
    try { await setApiEnabled(true); }
    catch (error) {
      console.error('[Local API]', error.message);
      store.updateSettings({ apiEnabled: false });
    }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  console.error('Cannot initialize desktop application:', error);
  app.quit();
});

app.on('before-quit', () => {
  if (navigationSynchronizer) navigationSynchronizer.stop();
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (licenseTimer) clearInterval(licenseTimer);
  if (batchAutomation) batchAutomation.stop();
  if (automationRunner) automationRunner.stop();
  if (recorderManager?.status().state === 'recording') recorderManager.stop();
  if (launcher) for (const active of launcher.listActive()) launcher.stop(active.profileId);
  if (apiServer) apiServer.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
