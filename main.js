const { app, BrowserWindow, ipcMain, clipboard, dialog, safeStorage } = require('electron');
const ProxyCredentialVault = require('./src/security/proxyCredentialVault');
const path = require('path');
const { resolveQaCaptureDir } = require('./src/ops/qaCapturePath');
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
const { createWarningService } = require('./src/monitor/warningService');
const { createWarningHistory } = require('./src/monitor/warningHistory');
const { ExitIpObservationStore } = require('./src/health/exitIpObservations');
const { MeasurementRecordStore } = require('./src/measurement/measurementRecords');
const { createCurrentContextResolver } = require('./src/measurement/currentContext');
const { observeRuntimeExitIp } = require('./src/health/runtimeEgressObservation');
const { provisionCamoufoxIdentity } = require('./src/engine/camoufoxProvisioning');
const { WorkflowStore, AutomationRunner } = require('./src/automation/studio');
const { BatchAutomation } = require('./src/automation/batch');
const { LocalScheduler } = require('./src/automation/localScheduler');
const { graphForSteps } = require('./src/automation/flowGraph');
const { createWindowBrowser } = require('./src/automation/windowBrowser');
const { RecorderManager } = require('./src/automation/recorder');
const { createRecorderWindow } = require('./src/automation/recorderWindow');
const { checkProfile } = require('./src/health/profileHealth');
const {LocalHealthDrift}=require('./src/health/localDrift');
const {GraphDefense}=require('./src/health/GraphDefense');
const {buildReadiness}=require('./src/health/releaseReadiness');
const {buildSupportReport}=require('./src/ops/supportReport');
const { ConfigBackup } = require('./src/backup/configBackup');
const { auditIsolation } = require('./src/privacy/isolation');
const { inspectFingerprint } = require('./src/privacy/fingerprintAudit');
const { diagnoseBrowsers } = require('./src/engine/browserDiagnostics');
const { RuntimeRegistry } = require('./src/engine/runtimeRegistry');
const {BundledEngineManager}=require('./src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('./src/engine/camoufoxAdapter');
const {CamoufoxPlaywrightController}=require('./src/engine/CamoufoxPlaywrightController');
const {CamoufoxInstallService,validateRelease}=require('./src/engine/camoufoxInstallService');
const {loadCamoufoxPublisherKey}=require('./src/engine/camoufoxPublisherTrust');
const {assessRuntime}=require('./src/engine/camoufoxRuntimeGate');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('./src/licensing/manager');
const {resolveEngineType}=require('./src/engine/EngineFactory');
const {arrangeWindows,openUrlForStoppedProfiles} = require('./src/ops/windowOperations');
const {openInRunning} = require('./src/ops/liveNavigation');
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

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] Unhandled promise rejection in main process:', reason);
});

let mainWindow = null;
let store = null;
let launcher = null;
let runtimeRegistry = null;
let bundledEngine = null;
let camoufoxAdapter = null;
let camoufoxInstall = null;
let camoufoxApprovedRelease = null;
let behaviorMonitor = null;
let warningService = null;
let warningHistory = null;
let ipObservationStore = null;
let measurementRecordStore = null;
let currentContextResolver = null;
let camoufoxExecutableResolver = null;
const appSessionId = require('crypto').randomUUID();
let localHealthDrift = null;
let workflowStore = null;
let automationRunner = null;
let batchAutomation = null;
let sessionSnapshots = null;
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
const LICENSE_REFRESH_MS=15*60*1000;
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
  const qaCapture = process.env.LHM_CI_UI_CAPTURE === '1';
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0f19', autoHideMenuBar: true,
    title: 'LHM Ads Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      offscreen: qaCapture
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  if (qaCapture) {
    const captureDir = resolveQaCaptureDir({
      packaged: app.isPackaged,
      appRoot: __dirname,
      userData: app.getPath('userData'),
      override: process.env.LHM_CI_UI_CAPTURE_DIR,
    });
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
          const writeCapture = (name, png) => {
            if (png.isEmpty()) throw Error('Electron returned an empty UI capture: ' + name);
            const bytes = png.toPNG();
            if (!bytes.length) throw Error('Electron encoded an empty UI capture: ' + name);
            fs.writeFileSync(path.join(captureDir, name), bytes);
          };
          const png = await mainWindow.webContents.capturePage();
          fs.mkdirSync(captureDir, { recursive: true });
          writeCapture('workspace-preview.png', png);
          console.log('[UI smoke] Saved workspace preview');
          const railCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-v7-show-rail').click(); return {collapsed:document.body.dataset.lhmRail==='closed',aria:document.getElementById('lhm-v7-show-rail').getAttribute('aria-expanded')}; })()",true);
          if(!railCheck.collapsed||railCheck.aria!=='false')
            throw Error('AI rail collapse failed: '+JSON.stringify(railCheck));
          await new Promise(resolve=>setTimeout(resolve,450));
          const fullTable=await mainWindow.webContents.capturePage();
          writeCapture('workspace-expanded-preview.png', fullTable);
          const paletteCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-v7-command-open').click(); return {opened:document.getElementById('lhm-v7-command-palette').classList.contains('open'),focus:document.activeElement?.id,count:document.querySelectorAll('.lhm-v7-command-item').length}; })()",true);
          if(!paletteCheck.opened||paletteCheck.focus!=='lhm-v7-command-search'||paletteCheck.count<6)
            throw Error('Command palette failed: '+JSON.stringify(paletteCheck));
          await new Promise(resolve=>setTimeout(resolve,280));
          const paletteImage=await mainWindow.webContents.capturePage();
          writeCapture('workspace-command-preview.png', paletteImage);
          console.log('[UI smoke] Verified expanded profile workspace and keyboard palette');
          await mainWindow.webContents.executeJavaScript("document.getElementById('lhm-v7-command-close').click()",true);
          const engineCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('btn-engine-source').click(); return {open:document.getElementById('modal-engine-source').classList.contains('open'),chromium:!!document.getElementById('engine-source-select'),gecko:!!document.getElementById('engine-gecko-provider'),apply:!!document.getElementById('engine-gecko-save')}; })()",true);
          if(!Object.values(engineCheck).every(Boolean))
            throw Error('Camoufox Gecko provider UI failed: '+JSON.stringify(engineCheck));
          await new Promise(resolve=>setTimeout(resolve,300));
          const engineImage=await mainWindow.webContents.capturePage();
          writeCapture('workspace-engine-provider-preview.png', engineImage);
          console.log('[UI smoke] Verified selected Camoufox and browser-engine provider modal');
        } catch (error) {
          console.error('[UI smoke] Screenshot unavailable:', error);
          process.exitCode = 1;
        } finally { app.exit(process.exitCode || 0); }
      }, 1800);
    });
  }
  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initIPC() {
  ipcMain.handle('get-profiles', () => store.getProfiles());
  ipcMain.handle('agency-network-preview',(_,input)=>{
    if(!input||!store.getProfile(input.profileId))throw Error('Hồ sơ không hợp lệ');
    if(!Array.isArray(input.entries)||input.entries.length>100)
      throw Error('Tối đa 100 địa chỉ khác');
    return GraphDefense.checkSubnetRisk(input.ip,input.entries,{profileId:input.profileId});
  });
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
  ipcMain.handle('camoufox-install-status',()=>{
    const runtime=assessRuntime({
      verifiedBundle:camoufoxAdapter.status().binaryVerified
    });
    return {
      available:!!camoufoxApprovedRelease&&!!camoufoxInstall&&runtime.canInstall,
      version:camoufoxApprovedRelease?.manifest?.version||null,
      alreadyInstalled:camoufoxInstall?.status().valid===true,
      installInProgress:camoufoxInstall?.running===true,
      runtime,
      notice:!runtime.ready?runtime.reason:
        !camoufoxApprovedRelease?'No separately signed LHM Camoufox release is configured.':
        'Requires explicit confirmation. No antivirus exemptions or silent downloads.'
    };
  });
  ipcMain.handle('camoufox-install',async()=>{
    if(!camoufoxApprovedRelease||!camoufoxInstall)
      throw Error('Chưa có bản Camoufox được nhà phát hành LHM phê duyệt, ký số.');
    const runtime=assessRuntime();
    if(!runtime.canInstall)throw Error(runtime.reason);
    if(launcher.listActive().length||launcher.pendingStarts.size)
      throw Error('Đóng tất cả browser trước khi cài engine');
    if(camoufoxInstall.running)throw Error('Đang cài đặt engine');
    const approved=validateRelease(camoufoxApprovedRelease,{
      publicKey:camoufoxInstall.publicKey
    });
    const result=await dialog.showMessageBox(mainWindow,{
      type:'question',buttons:['Hủy','Tải và cài'],defaultId:0,cancelId:0,noLink:true,
      title:'Cài đặt Camoufox được xác minh',
      message:'Cài Camoufox '+approved.manifest.version+' từ nguồn phát hành đã ký?',
      detail:'Tải qua HTTPS, xác minh SHA-256 và chữ ký trước khi sử dụng. Không tắt hoặc bỏ qua Windows Defender. Dung lượng tải '+Math.ceil(approved.bytes/1048576)+' MiB.'
    });
    if(result.response!==1)return {canceled:true};
    const installed=await camoufoxInstall.install(camoufoxApprovedRelease);
    return {...installed,status:camoufoxAdapter.status()};
  });
  ipcMain.handle('camoufox-provider-select', (_event,provider)=>{
    if(!['firefox','camoufox'].includes(provider))throw Error('Invalid Firefox provider');
    if(launcher.listActive().length||launcher.pendingStarts.size)
      throw Error('Đóng tất cả trình duyệt trước khi thay đổi engine Firefox');
    if(provider==='camoufox'&&!camoufoxAdapter.status().ready)
      throw Error('Camoufox needs an installed TypeScript launcher AND a signed verified Windows distribution');
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
  ipcMain.handle('health-drift-report',()=>{
    if(!localHealthDrift)throw Error('Local health snapshot history unavailable');
    return localHealthDrift.report();
  });
  ipcMain.handle('health-drift-snapshot',()=>{
    if(!localHealthDrift)throw Error('Local health snapshot history unavailable');
    const profiles=store.getProfiles();
    const reports=profiles.map(p=>checkProfile(p,{
      settings:store.getSettings(),proxies:store.data.proxies,vault:proxyVault,
      pathExists:fs.existsSync
    }));
    return localHealthDrift.add({
      profiles:profiles.length,
      errors:reports.filter(r=>r.status==='error').length,
      warnings:reports.filter(r=>r.status==='warning').length,
      active:launcher.listActive().length,
      appVersion:app.getVersion()
    });
  });
  ipcMain.handle('health-drift-clear',(_,confirmation)=>{
    if(confirmation!=='CLEAR HEALTH')throw Error('Explicit clearing confirmation required');
    if(!localHealthDrift)throw Error('Local health snapshot history unavailable');
    return localHealthDrift.clear();
  });
  ipcMain.handle('health-drift-export',async()=>{
    if(!localHealthDrift)throw Error('Local health snapshot history unavailable');
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Xuất lịch sử kiểm tra cấu hình (không có dữ liệu duyệt web)',
      defaultPath:'LHM-Local-Health-'+new Date().toISOString().slice(0,10)+'.json',
      filters:[{name:'JSON Aggregate Health Report',extensions:['json']}]
    });
    if(canceled||!filePath)return {canceled:true};
    fs.writeFileSync(filePath,localHealthDrift.exportReport(),{mode:0o600});
    return {canceled:false,stored:localHealthDrift.report().stored};
  });
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
  ipcMain.handle('save-profile', async (_, profile) => {
    // The Local API already forbids all live profile edits. Apply the same
    // lifecycle rule to desktop edits, including URLs, fingerprint and notes.
    if (profile?.id && store.getProfile(profile.id) && launcher.isBusy(profile.id))
      throw new Error('Hãy đóng hồ sơ trước khi chỉnh sửa cấu hình để tránh sai lệch dữ liệu của phiên đang chạy');
    const existing=profile?.id?store.getProfile(profile.id):null;
    let allowEngineChange=false;
    if(existing){
      const oldType=resolveEngineType(existing,store.getSettings());
      const selected=resolveEngineType({...existing,...profile},store.getSettings());
      if(oldType!==selected){
        const answer=await dialog.showMessageBox(mainWindow,{
          type:'warning',buttons:['Hủy','Đổi engine'],defaultId:0,
          cancelId:0,noLink:true,title:'Đổi engine của profile',
          message:'Chuyển từ '+oldType+' sang '+selected+'?',
          detail:'Dữ liệu phiên, cookie và thư mục Firefox/Chromium/Camoufox không được chuyển hoặc sao chép. Profile phải đang đóng.'
        });
        if(answer.response!==1)throw Error('Đã hủy chuyển đổi engine');
        allowEngineChange=true;
      }
    }
    let provisioning=null;
    if(!existing){
      // Provisioning (Constitution s.8 / contract C2): a NEW native
      // Camoufox profile gets its pinned identity drawn here, at
      // creation time, through the official generator. Unavailable
      // generator/engine never blocks creation; the outcome is
      // recorded on the profile (fingerprint.identityProvisioning).
      try{
        provisioning=await provisionCamoufoxIdentity(profile,{
          resolveExecutable:()=>{ if(!camoufoxExecutableResolver) throw Error('Camoufox resolver not ready'); return camoufoxExecutableResolver(); }});
      }catch(_){ provisioning=null; }
    }
    // Keep the provisioning reason on the profile so the UI can tell
    // the user the specific cause (Agent 16): the renderer already has
    // a translation for these reason codes.
    if(provisioning&&provisioning.reason&&profile.fingerprint)
      profile.fingerprint.identityProvisioningReason=provisioning.reason;
    const saved = store.saveProfile(profile,{allowEngineChange,
      allowIdentity: !!provisioning && provisioning.status==='provisioned'});
    if(provisioning&&provisioning.status==='provisioned')
      behaviorMonitor.record('identity_provisioned', saved.id, 'manual');
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
    // Exit-IP observation (Constitution s.19/22): record what the
    // profile's configured proxy actually exits as, feeding the
    // automatic IP warnings. Fire-and-forget: a failed measurement
    // records nothing and never affects the launch.
    void (async () => {
      try{
        if(!ipObservationStore) return;
        // Runtime egress observation (Constitution s.19.3): when an
        // LHM-controlled echo endpoint is configured (settings
        // .runtimeEchoUrl — an owner decision, never hardcoded) and
        // this session is controller-driven, measure the exit IP from
        // inside the profile's own page context and label it
        // 'browser-runtime'. Config-gated: with no endpoint set this
        // is a no-op, and a failed measurement records nothing — it is
        // never backfilled from the manager-process result below.
        try{
          const echoUrl=store.getSettings()?.runtimeEchoUrl;
          const controller=launcher.camoufoxPlaywrightController;
          const context=controller&&controller.contextFor?controller.contextFor(id):null;
          if(typeof echoUrl==='string'&&echoUrl&&context){
            void observeRuntimeExitIp({context,profileId:id,sessionId:appSessionId,
              echoUrl,store:ipObservationStore,timeoutMs:8000}).catch(()=>{});
          }
        }catch(_){}
        const p=store.getProfile(id);
        const proxy=p&&p.proxy;
        if(!proxy||!proxy.type||proxy.type==='direct'||proxy.type==='none') return;
        const result=await checkProxy(proxy);
        if(result&&typeof result.ip==='string')
          ipObservationStore.record({profileId:id,ip:result.ip,sessionId:appSessionId,
            source:'manager-process'});
      }catch(_){}
    })();
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
  ipcMain.handle('get-warning-report', () => {
    if (!warningService) warningService = createWarningService({ seed: warningHistory ? warningHistory.seedRecords() : null });
    const report = warningService.evaluate({
      behaviorEvents: behaviorMonitor ? behaviorMonitor.events : [],
      ipObservations: ipObservationStore ? ipObservationStore.list() : [],
      healthDrift: localHealthDrift ? localHealthDrift.report() : null,
      monitorAlerts: behaviorMonitor ? behaviorMonitor.getReport().alerts : [],
    });
    // Durable warning history (Constitution s.20.3): fold this report
    // into the on-disk ledger and expose the durable truth alongside
    // the in-session report. The store only ever persists the
    // normalised s.22 warning shape (whitelist projection).
    if (warningHistory) {
      warningHistory.record(report);
      report.history = warningHistory.entries();
      report.historyStatus = warningHistory.status();
    }
    return report;
  });
  ipcMain.handle('clear-warning-history', () => {
    if (warningService) warningService.reset();
    return warningHistory ? warningHistory.clear() : { ok: false, error: 'history not initialised' };
  });
  // Per-profile measurement records (Agent 9 contract, R15 wiring):
  // the checklist provider's Section-23 validity gate needs both the
  // stored record for this profile AND the running app's current
  // context (build commit + installed engine hash) to refuse stale
  // or foreign-bound records with a specific reason.
  ipcMain.handle('get-profile-measurement', (_, profileId) => {
    const record = measurementRecordStore && typeof profileId === 'string'
      ? measurementRecordStore.getForProfile(profileId) : null;
    return {
      record,
      currentContext: currentContextResolver ? currentContextResolver.getCurrentContext() : null,
      storeStatus: measurementRecordStore ? measurementRecordStore.status()
        : { status: 'error', reason: 'measurement record store not initialised' },
    };
  });
  ipcMain.handle('provision-camoufox-identity', async (_, id) => {
    const profile = store.getProfile(id);
    if (!profile) throw Error('Profile not found');
    const result = await provisionCamoufoxIdentity(profile, {
      resolveExecutable:()=>{ if(!camoufoxExecutableResolver) throw Error('Camoufox resolver not ready'); return camoufoxExecutableResolver(); }});
    if (result.status === 'provisioned') store.saveProfile(profile, { allowIdentity: true });
    else if (result.reason && profile.fingerprint) {
      // Mirror the create path: persist the specific reason so the UI
      // can explain this outcome later, not only in the live reply.
      profile.fingerprint.identityProvisioningReason = result.reason;
      store.saveProfile(profile, {});
    }
    return { status: result.status, reason: result.reason || null };
  });
  ipcMain.handle('get-api-status', apiStatus);
  ipcMain.handle('set-api-enabled', (_, enabled) => setApiEnabled(enabled === true));
  ipcMain.handle('copy-api-key', () => {
    if (!apiServer?.listening) throw new Error('Enable Local API first');
    clipboard.writeText(apiKey);
    return true;
  });
}

// Fired on the PRIMARY instance when a second launch is attempted against
// the same userData directory: surface the existing window instead of
// letting the second process run (it quits in its own whenReady guard).
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.whenReady().then(async () => {
  if (process.env.LHM_CI_UI_CAPTURE === '1') {
    app.setPath('userData', path.join(os.tmpdir(), 'lhm-ui-ci-' + process.pid));
  }
  // Single-instance guard (reconstruction of the owner's local fix,
  // Agent R12): a second LHM process on this userData directory would
  // load its own in-memory copy of db.json (Store loads once and
  // rewrites the whole file per save) and silently overwrite this
  // instance's changes on every save, act on stale state for
  // deletions, and collide on the Local API port. The lock is keyed
  // by Electron to the userData path, so it is taken AFTER the
  // CI-capture setPath above (each CI capture owns a per-PID data
  // store and must not be blocked) and BEFORE the legacy migration
  // and Store construction below.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const storageDir = path.join(app.getPath('userData'), 'storage');
  const legacyDir = path.join(__dirname, 'data');
  if (!fs.existsSync(path.join(storageDir, 'db.json')) &&
      fs.existsSync(path.join(legacyDir, 'db.json'))) {
    fs.mkdirSync(path.dirname(storageDir), { recursive: true });
    fs.cpSync(legacyDir, storageDir, { recursive: true, errorOnExist: false });
  }
  store = new Store(storageDir);
  try{localHealthDrift=new LocalHealthDrift(storageDir);}
  catch(error){
    console.warn('[HealthDrift] History unavailable:',error.message);
    localHealthDrift=null; // Preserve corrupted history for manual recovery.
  }
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
  const releaseAssets=app.isPackaged
    ?path.join(process.resourcesPath,'lhm-camoufox')
    :path.join(__dirname,'resources','camoufox-engine');
  // Never use the app-license signing key to trust a downloadable browser.
  // Without a separately provisioned publisher-ed25519.pub the entire
  // Camoufox install/launch path remains disabled and fails closed.
  let publisherKey=null;
  try{
    publisherKey=loadCamoufoxPublisherKey(releaseAssets,{
      licenseKey:LICENSE_PUBLIC_KEY
    });
    if(publisherKey){
      camoufoxInstall=new CamoufoxInstallService(storageDir,{
        publicKey:publisherKey,
        licenseKey:LICENSE_PUBLIC_KEY,
        scriptPath:app.isPackaged
          ?path.join(process.resourcesPath,'app.asar.unpacked','tools','extract-signed-engine.ps1')
          :path.join(__dirname,'tools','extract-signed-engine.ps1')
      });
      const releaseFile=path.join(releaseAssets,'release.json');
      if(fs.existsSync(releaseFile)){
        if(fs.lstatSync(releaseFile).isSymbolicLink()||
           fs.statSync(releaseFile).size>1024*1024)
          throw Error('Invalid Camoufox release descriptor file');
        const approved=JSON.parse(fs.readFileSync(releaseFile,'utf8'));
        validateRelease(approved,{publicKey:publisherKey});
        camoufoxApprovedRelease=approved;
      }
    }
  }catch(error){
    camoufoxApprovedRelease=null;
    camoufoxInstall=null;
    publisherKey=null;
    console.warn('[Engine] Camoufox publisher trust unavailable:',
      String(error.message).slice(0,200));
  }
  const camoufoxBundle=publisherKey?
    new BundledEngineManager(releaseAssets,{
      engine:'camoufox',publicKey:publisherKey
    }):null;
  const verifiedProviders={
    status(){
      if(!publisherKey)
        return {valid:false,available:false,
          reason:'Independent Camoufox publisher trust anchor missing'};
      const bundled=camoufoxBundle.status();
      return bundled.valid?bundled:camoufoxInstall.status();
    },
    resolve(engine){
      if(engine!=='camoufox'||!publisherKey)
        throw Error('Camoufox publisher signature is not trusted');
      if(camoufoxBundle.status().valid)return camoufoxBundle.resolve(engine);
      return camoufoxInstall.verifier().resolve(engine);
    }
  };
  camoufoxAdapter=new CamoufoxAdapter(storageDir,{
    bundleVerifier:verifiedProviders,store,proxyVault,
    // Explicit operator-only opt-in. Production defaults fail closed until
    // independently verified proxy/DNS/WebRTC lab acceptance.
    allowProxyLab:!app.isPackaged&&process.env.LHM_CAMOUFOX_PROXY_LAB==='1'
  });
  launcher.camoufoxAdapter=camoufoxAdapter;
  // Independent preview mode. Never enable third-party automation in the
  // packaged app until signed distribution and network lab release gates pass.
  launcher.camoufoxPlaywrightController=new CamoufoxPlaywrightController(storageDir,{
    verifier:verifiedProviders,store,proxyVault,
    enabled:!app.isPackaged&&process.env.LHM_CAMOUFOX_PLAYWRIGHT_LAB==='1',
    labApproved:!app.isPackaged&&
      process.env.LHM_CAMOUFOX_PLAYWRIGHT_LAB==='1'&&
      process.env.LHM_CAMOUFOX_PROXY_LAB==='1'
  });
  launcher.runtimeRegistry=runtimeRegistry;
  launcher.licensePolicy = licensePolicy;
  extensionManager = new ExtensionManager(store,launcher);
  launcher.extensionManager = extensionManager;
  proxyCenter = new ProxyCenter(store, launcher, {vault:proxyVault});
  behaviorMonitor = new BehaviorMonitor(storageDir);
  try{ipObservationStore=new ExitIpObservationStore(storageDir);}catch(_){}
  try{
    measurementRecordStore=new MeasurementRecordStore(storageDir);
    const loadedRecords=measurementRecordStore.status();
    if(loadedRecords.load.status==='error')
      console.warn('[measurement-records]',loadedRecords.load.reason);
    else if(loadedRecords.load.invalidDropped)
      console.warn('[measurement-records]',loadedRecords.load.invalidDropped+
        ' stored record(s) failed the contract shape and were dropped from the working set');
  }catch(_){ measurementRecordStore=null; }
  // Lazy by construction: the engine resolver is only assigned
  // below, and the commit/engine lookups run when the checklist
  // asks, memoised inside the resolver.
  currentContextResolver=createCurrentContextResolver({
    appRoot:__dirname,
    resolveEngineExecutable:()=>{ if(!camoufoxExecutableResolver) throw Error('Camoufox resolver not ready'); return camoufoxExecutableResolver(); }
  });
  // Durable warning history (s.20.3), paired with the service seed
  // below: the store counts 'authoritative' because the seeded
  // service registry already carries the accumulated totals.
  try{
    warningHistory=createWarningHistory({storageDir,countMode:'authoritative'});
    const loadedHistory=warningHistory.load();
    if(loadedHistory.status==='error')
      console.warn('[warning-history]',loadedHistory.reason);
  }catch(_){ warningHistory=null; }
  warningService = createWarningService({seed:warningHistory?warningHistory.seedRecords():null});
  camoufoxExecutableResolver = () => verifiedProviders.resolve('camoufox');
  workflowStore = new WorkflowStore(storageDir);
  // Permanent-deletion completeness (findings F3/F4 — proposal pending
  // owner decision): when a profile is purged for good, sweep the
  // automation workflows bound to it so no dangling profileId remains,
  // and say so in the log where support can see it. The hook never
  // throws into the Store: a failed sweep is logged here and repaired
  // by the orphan sweep below on a later start.
  store.onProfilePurged = (profileId) => {
    try {
      if (measurementRecordStore &&
          measurementRecordStore.forgetProfile(profileId))
        console.warn('[ProfilePurge] Removed measurement record(s) ' +
          'bound to purged profile ' + profileId);
    } catch (error) {
      console.warn('[ProfilePurge] Measurement-record removal deferred for ' +
        profileId + ': ' + error.message);
    }
    try {
      const removed = workflowStore.removeForProfile(profileId);
      if (removed.length)
        console.warn('[ProfilePurge] Removed ' + removed.length +
          ' automation workflow(s) bound to purged profile ' + profileId +
          ': ' + removed.map(w => w.name).join(', '));
    } catch (error) {
      console.warn('[ProfilePurge] Workflow sweep deferred for ' +
        profileId + ': ' + error.message);
    }
  };
  // Backstop: the startup expiry purge near the top of whenReady runs
  // BEFORE this WorkflowStore exists, so its purges could not fire the
  // hook. Sweep any workflow whose profile is neither live nor in
  // trash (trashed profiles are restorable — their workflows stay).
  try {
    const validIds = [...store.getProfiles(), ...store.getTrashedProfiles()]
      .map(p => p.id);
    const orphaned = workflowStore.sweepOrphaned(validIds);
    if (orphaned.length)
      console.warn('[ProfilePurge] Removed ' + orphaned.length +
        ' orphaned automation workflow(s): ' +
        orphaned.map(w => w.name + ' (profile ' + w.profileId + ')').join(', '));
  } catch (error) {
    console.warn('[ProfilePurge] Orphan workflow sweep deferred: ' + error.message);
  }
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
    },LICENSE_REFRESH_MS);
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
