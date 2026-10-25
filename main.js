const { app, BrowserWindow, ipcMain, clipboard, dialog, safeStorage, shell } = require('electron');
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
const { listWorkflowTemplates } = require('./src/automation/workflowTemplates');
const { BatchAutomation } = require('./src/automation/batch');
const { LocalScheduler } = require('./src/automation/localScheduler');
const { graphForSteps } = require('./src/automation/flowGraph');
const { createWindowBrowser } = require('./src/automation/windowBrowser');
const { RecorderManager } = require('./src/automation/recorder');
const { createRecorderWindow } = require('./src/automation/recorderWindow');
const { checkProfile } = require('./src/health/profileHealth');
const { launchReadiness } = require('./src/health/launchReadiness');
const { inspectLandingUrls, buildUtmUrl } = require('./src/ads/landingGuard');
const { CHECKS: ADS_QA_CHECKS, buildCampaignQaReport } = require('./src/ads/campaignQaReport');
const {LocalHealthDrift}=require('./src/health/localDrift');
const {GraphDefense}=require('./src/health/GraphDefense');
const {buildReadiness}=require('./src/health/releaseReadiness');
const {buildFleetTriage}=require('./src/ops/fleetTriage');
const {MAX_FILE_BYTES,exportSelectedTemplates,previewTemplates,importTemplates}=require('./src/ops/agencyTemplateHandoff');
const {runPerformanceLab}=require('./src/ops/performanceLab');
const {UpdateCenter}=require('./src/update/updateCenter');
const {inspectUpgradeSafety}=require('./src/update/upgradeSafety');
const {buildSupportReport}=require('./src/ops/supportReport');
const {buildCustomerHandoff}=require('./src/ops/customerHandoff');
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
const {GoogleBrowserDesktopClient} = require('./src/licensing/googleDesktopClient');
const {googleTenantStorageRoot} = require('./src/licensing/googleTenantStorage');
const {loadGoogleStagingConfig} = require('./src/licensing/googleStagingConfig');
const {OnlineLicenseVerifier} = require('./src/licensing/onlineVerifier');
const {resolveLicenseEndpoint}=require('./src/licensing/authorityConfig');
const {getLicenseServiceStatus}=require('./src/licensing/serviceDiagnostics');
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
let googleDesktop = null;
let googleTenantRoot = null;
let googleLeaseTimer = null;
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
          // Real Electron acceptance: the prior light-theme screenshot showed
          // white/dim AI text over a nearly-white panel. Ensure readable
          // computed colors and that the rail fits the viewport.
          const readability=await mainWindow.webContents.executeJavaScript(
            "(() => { const panel=document.getElementById('lhm-profile-panel'); const title=panel.querySelector('.lhm-v6-assistant h3'); const sub=panel.querySelector('.lhm-v6-assistant h3 em'); const secondary=panel.querySelector('.lhm-v6-ai-button:not(.primary)'); const box=panel.getBoundingClientRect(); const metric=document.querySelector('.lhm-v6-metric'); return {heading:getComputedStyle(title).color,emphasis:getComputedStyle(sub).color,action:getComputedStyle(secondary).color,cardHeight:metric.getBoundingClientRect().height,railLeft:box.left,railRight:box.right,viewport:innerWidth}; })()",true);
          if(readability.heading!=='rgb(32, 55, 81)'||
             readability.emphasis!=='rgb(37, 107, 186)'||
             readability.action!=='rgb(36, 73, 103)'||
             readability.cardHeight>135||
             readability.railLeft<0||readability.railRight>readability.viewport+1)
            throw Error('Full-window AI panel contrast/layout regression: '+JSON.stringify(readability));
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
          const railBefore=await mainWindow.webContents.executeJavaScript(
            "(() => { const box=document.querySelector('.content-view .table-container'); const before=box.getBoundingClientRect().width; document.getElementById('lhm-v7-show-rail').click(); return {collapsed:document.body.dataset.lhmRail==='closed',aria:document.getElementById('lhm-v7-show-rail').getAttribute('aria-expanded'),before}; })()",true);
          // Wait for renderer layout/transition to settle before measuring.
          // The click handler changes data attributes immediately; measuring
          // synchronously in the same JS task returned stale 983px/983px.
          await new Promise(resolve=>setTimeout(resolve,460));
          const railAfter=await mainWindow.webContents.executeJavaScript(
            "(() => { const box=document.querySelector('.content-view .table-container'); const panel=document.getElementById('lhm-profile-panel'); return {after:box.getBoundingClientRect().width,hidden:getComputedStyle(panel).display==='none'}; })()",true);
          const railCheck={...railBefore,...railAfter};
          fs.writeFileSync(path.join(captureDir,'ui-layout-debug.json'),
            JSON.stringify({readability,railCheck},null,2)+'\n');
          if(!railCheck.collapsed||railCheck.aria!=='false'||!railCheck.hidden||
             railCheck.after<railCheck.before+150)
            throw Error('Full-width workspace collapse failed: '+JSON.stringify(railCheck));
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
          // Release UX Gate: exercise NEW commercial panels from both the
          // unpacked source and the actual packaged Windows EXE.
          // Use synthetic web addresses ONLY; never record license secrets.
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('engine-source-done').click()",true);
          // Owner-requested profile Constitution inspector. Test the actual
          // create-profile wizard in both unpacked and packaged Electron.
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('btn-create-profile').click()",true);
          await new Promise(resolve=>setTimeout(resolve,850));
          const profileOpen=await mainWindow.webContents.executeJavaScript(
            "(() => { const dialog=document.getElementById('modal-profile'); document.querySelector('#modal-profile [data-tab=tab-fingerprint]').click(); const groups=dialog.querySelectorAll('.fp-signal-group'); const badges=dialog.querySelectorAll('.fp-signal-state'); const box=dialog.querySelector('.lhm-profile-setup-dialog').getBoundingClientRect(); const body=dialog.querySelector('.modal-body'); return {open:dialog.classList.contains('open'),tab:document.getElementById('tab-fingerprint').classList.contains('active'),groups:groups.length,rows:dialog.querySelectorAll('.fp-signal-row').length,unmeasured:[...badges].filter(b=>b.dataset.status==='unmeasured').length,native:[...badges].filter(b=>b.dataset.status==='native').length,width:box.width,right:box.right,viewport:innerWidth,scroll:getComputedStyle(body).overflowY,summary:document.getElementById('fp-signal-summary').textContent}; })()",true);
          if(!profileOpen.open||!profileOpen.tab||profileOpen.groups!==4||
             profileOpen.rows!==16||profileOpen.unmeasured<6||
             profileOpen.native<1||profileOpen.right>profileOpen.viewport+1||
             profileOpen.width<700||profileOpen.scroll!=='auto'||
             !profileOpen.summary.includes('CHƯA ĐO'))
            throw Error('Actual Constitution profile wizard layout/status failed: '+JSON.stringify(profileOpen));
          await new Promise(resolve=>setTimeout(resolve,350));
          writeCapture('workspace-profile-editor-preview.png',await mainWindow.webContents.capturePage());
          console.log('[UI smoke] Verified Constitution wizard rendered with 16 truthful signals');
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('btn-cancel-modal').click()",true);
          const adsCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('btn-ads-launch-guard').click(); const modal=document.getElementById('modal-ads-launch-guard'); const url=document.getElementById('ads-guard-urls'); url.value='https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=ci-demo'; document.getElementById('ads-guard-inspect').click(); return {open:modal.classList.contains('open'),bg:getComputedStyle(modal.querySelector('.lhm-ads-guard-section')).backgroundColor,input:getComputedStyle(url).backgroundColor,scroll:getComputedStyle(modal.querySelector('.modal-body')).overflowY}; })()",true);
          if(!adsCheck.open||adsCheck.bg!=='rgb(245, 248, 254)'||
             adsCheck.input!=='rgb(255, 255, 255)'||adsCheck.scroll!=='auto')
            throw Error('Ads Launch Guard theme/modal failed: '+JSON.stringify(adsCheck));
          await new Promise(resolve=>setTimeout(resolve,800));
          const adsResults=await mainWindow.webContents.executeJavaScript(
            "({count:document.querySelectorAll('#ads-guard-results .lhm-ads-guard-result').length,status:document.getElementById('ads-guard-inspect-status').textContent})",true);
          if(adsResults.count!==1||!adsResults.status.includes('1 link'))
            throw Error('Ads Launch Guard live UI test failed: '+JSON.stringify(adsResults));
          writeCapture('workspace-ads-guard-preview.png',await mainWindow.webContents.capturePage());
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('ads-guard-done').click()",true);

          const perfOpen=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('btn-performance-lab').click(); document.getElementById('performance-lab-run').click(); return document.getElementById('modal-performance-lab').classList.contains('open'); })()",true);
          if(!perfOpen)throw Error('Performance Lab dialog did not open');
          await new Promise(resolve=>setTimeout(resolve,950));
          const perfReport=await mainWindow.webContents.executeJavaScript(
            "(() => { const cards=document.querySelectorAll('#performance-lab-metrics .lhm-perf-card'); return {cards:cards.length,background:cards.length?getComputedStyle(cards[0]).backgroundColor:'none',status:document.getElementById('performance-lab-status').textContent}; })()",true);
          if(perfReport.cards!==3||perfReport.background!=='rgb(246, 249, 255)'||
             !perfReport.status.includes('Đã đo'))
            throw Error('Performance Lab measured UI failed: '+JSON.stringify(perfReport));
          writeCapture('workspace-performance-lab-preview.png',await mainWindow.webContents.capturePage());
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('performance-lab-done').click()",true);

          const aboutCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('btn-app-about').click(); const modal=document.getElementById('modal-app-about'); const center=modal.querySelector('.lhm-update-center'); return {open:modal.classList.contains('open'),update:!!center,background:getComputedStyle(center).backgroundColor,check:!!document.getElementById('lhm-update-check')}; })()",true);
          if(!aboutCheck.open||!aboutCheck.update||!aboutCheck.check||
             aboutCheck.background!=='rgb(245, 248, 254)')
            throw Error('About/Update Center UI failed: '+JSON.stringify(aboutCheck));
          await new Promise(resolve=>setTimeout(resolve,350));
          writeCapture('workspace-about-update-preview.png',await mainWindow.webContents.capturePage());
          // Read-only commercial handoff: assert actual main-process signal
          // collection and that no owner-approval claims are made.
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('lhm-customer-check').click()",true);
          await new Promise(resolve=>setTimeout(resolve,900));
          const handoffCheck=await mainWindow.webContents.executeJavaScript(
            "(() => ({cards:document.querySelectorAll('#lhm-customer-checks .lhm-customer-check').length,label:document.getElementById('lhm-customer-label').textContent,status:document.getElementById('lhm-customer-status').textContent,pending:document.getElementById('lhm-customer-checks').textContent.includes('chưa xác minh')}))()",true);
          if(handoffCheck.cards!==6||handoffCheck.label==='CHƯA KIỂM TRA'||
             !handoffCheck.status.includes('Đã kiểm tra')||!handoffCheck.pending)
            throw Error('Customer handoff operational UI failed: '+JSON.stringify(handoffCheck));
          writeCapture('workspace-customer-handoff-preview.png',await mainWindow.webContents.capturePage());
          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('lhm-about-close').click()",true);

          const licenseCheck=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('btn-license-center').click(); const modal=document.getElementById('modal-license-center'); return {open:modal.classList.contains('open'),state:!!document.getElementById('license-state'),activate:!!document.getElementById('license-activate'),renew:!!document.getElementById('license-expires')}; })()",true);
          if(!Object.values(licenseCheck).every(Boolean))
            throw Error('License/renewal UI failed: '+JSON.stringify(licenseCheck));
          await new Promise(resolve=>setTimeout(resolve,350));
          const licenseMotion=await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('lhm-nm-license-next').click(); const modal=document.getElementById('modal-license-center'); const front=document.getElementById('lhm-nm-license-status-face'); const back=document.getElementById('lhm-nm-license-activate-face'); return {mode:modal.dataset.lhmLicenseMode,frontInert:front.inert,backInert:back.inert,frontHidden:front.getAttribute('aria-hidden'),backHidden:back.getAttribute('aria-hidden')}; })()",true);
          if(licenseMotion.mode!=='activate'||!licenseMotion.frontInert||licenseMotion.backInert||
             licenseMotion.frontHidden!=='true'||licenseMotion.backHidden!=='false')
            throw Error('License 3D flip / focus safety failed: '+JSON.stringify(licenseMotion));
          await new Promise(resolve=>setTimeout(resolve,880));
          const cardTransform=await mainWindow.webContents.executeJavaScript(
            "getComputedStyle(document.querySelector('.lhm-nm-flip-card')).transform",true);
          if(!cardTransform||cardTransform==='none'||!cardTransform.includes('matrix'))
            throw Error('License flip CSS transition not rendered in Electron');
          await mainWindow.webContents.executeJavaScript(
            "(() => { const id=document.getElementById('license-installation-id'); if(id)id.value='[REDACTED FOR CI SCREENSHOT]'; const token=document.getElementById('license-token'); if(token)token.value=''; })()",true);
          writeCapture('workspace-license-preview.png',await mainWindow.webContents.capturePage());
          // Fleet Triage smoke uses actual IPC -> checkProfile -> triage aggregation.
          // Screenshot contains synthetic/default local profiles only.
          await mainWindow.webContents.executeJavaScript(
            "(() => { document.getElementById('license-done').click(); document.getElementById('btn-control-tower').click(); })()",true);
          await new Promise(resolve=>setTimeout(resolve,1150));
          const fleetResult=await mainWindow.webContents.executeJavaScript(
            "(() => { const modal=document.getElementById('modal-control-tower'); const state=document.getElementById('tower-triage-status').textContent; const list=document.getElementById('tower-triage-list'); return {open:modal.classList.contains('open'),status:state,styles:!!document.querySelector('link[href=\\\"fleetTriage.css\\\"]'),list:!!list}; })()",true);
          if(!fleetResult.open||!fleetResult.list||!fleetResult.styles||
             !fleetResult.status.includes('hồ sơ đã kiểm tra'))
            throw Error('Fleet Triage packaged Electron UI failed: '+JSON.stringify(fleetResult));
          writeCapture('workspace-fleet-triage-preview.png',await mainWindow.webContents.capturePage());
          // Handoff UI smoke: secret input blank and action locked until
          // profile selection; never include real customer/private data.
          // The agency panel is below the fleet panel in the same scrollable modal.
          // The old CI wrote identical screenshots while only checking hidden DOM nodes.
          const agencyViewport=await mainWindow.webContents.executeJavaScript(
            "(() => { const p=document.querySelector('#modal-control-tower .lhm-agency-panel'); const v=document.querySelector('#modal-control-tower .tower-content'); if(!p||!v)throw Error('Agency panel missing'); p.scrollIntoView({block:'center',behavior:'instant'}); const pr=p.getBoundingClientRect(),vr=v.getBoundingClientRect(); return {top:pr.top,bottom:pr.bottom,viewTop:vr.top,viewBottom:vr.bottom}; })()",true);
          if(agencyViewport.top>=agencyViewport.viewBottom||
             agencyViewport.bottom<=agencyViewport.viewTop)
            throw Error('Agency UI is not visible for its screenshot: '+JSON.stringify(agencyViewport));
          await new Promise(resolve=>setTimeout(resolve,280));
          const handoffPanel=await mainWindow.webContents.executeJavaScript(
            "(() => { const password=document.getElementById('tower-agency-password'); const exportBtn=document.getElementById('tower-agency-export'); const preview=document.getElementById('tower-agency-preview'); const commit=document.getElementById('tower-agency-commit'); return {visible:!!password&&!!exportBtn&&!!preview&&!!commit,secure:password?.type==='password',empty:password?.value==='',importLocked:commit?.disabled===true,exportLocked:exportBtn?.disabled===true,theme:!!document.querySelector('link[href=\\\"agencyHandoff.css\\\"]')}; })()",true);
          if(!handoffPanel.visible||!handoffPanel.secure||!handoffPanel.empty||
             !handoffPanel.importLocked||!handoffPanel.exportLocked||!handoffPanel.theme)
            throw Error('Agency template handoff UI privacy gate failed: '+JSON.stringify(handoffPanel));
          writeCapture('workspace-agency-handoff-preview.png',await mainWindow.webContents.capturePage());
          console.log('[UI smoke] Agency encrypted handoff controls validated, no secret in screenshot');

          await mainWindow.webContents.executeJavaScript(
            "document.getElementById('tower-done').click()",true);
          // Actual source AND packaged Electron renderer interaction proof
          // for bounded 1,000-profile metadata table; no persistent profile changes.
          const pagerQa=await mainWindow.webContents.executeJavaScript("(() => {\n  // Synthetic metadata only; no profile is created in the store, no browser\n  // opened, no API token, proxy secret, cookie or customer data is involved.\n  const mockProfiles = Array.from({ length:1000 }, (_, i) => ({\n    id:'qa_'+String(i+1).padStart(4,'0'), name:'QA Profile '+String(i+1),\n    group:'QA local', engine:'chromium', tags:[],\n    proxy:{type:'direct',host:'',port:''},\n  }));\n  allProfiles = mockProfiles;\n  activeBrowserMap.clear();\n  window.LHMProfileSelection.clear();\n  for(const id of ['filter-group','filter-tag','filter-engine','filter-proxy','filter-status']){\n    document.getElementById(id).value='all';\n  }\n  document.getElementById('search-input').value='';\n  document.getElementById('profile-page-size').value='50';\n  document.getElementById('profile-page-size').dispatchEvent(new Event('change',{bubbles:true}));\n  const rows = () => document.querySelectorAll('#profile-list-body tr');\n  const first = {rows:rows().length,\n    first:rows()[0]?.dataset.profileId,\n    last:rows()[rows().length-1]?.dataset.profileId,\n    label:document.getElementById('profile-page-status').textContent};\n  const head = document.getElementById('select-all');\n  head.click(); // The selected IDs must be exactly page 1 (50), never 1000.\n  const selectedPage1 = window.LHMProfileSelection.getSelected().length;\n  document.getElementById('profile-page-next').click();\n  const second = {rows:rows().length,first:rows()[0]?.dataset.profileId,\n    selected:window.LHMProfileSelection.getSelected().length};\n  const check = rows()[0]?.querySelector('input[type=\"checkbox\"][data-id]');\n  check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));\n  const selectedCrossPage=window.LHMProfileSelection.getSelected().length;\n  const input=document.getElementById('search-input');\n  input.value='QA Profile 1000';\n  input.dispatchEvent(new Event('input',{bubbles:true}));\n  const filtered={rows:rows().length,first:rows()[0]?.dataset.profileId,\n    selected:window.LHMProfileSelection.getSelected().length};\n  input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));\n  const size=document.getElementById('profile-page-size');\n  size.value='100';size.dispatchEvent(new Event('change',{bubbles:true}));\n  const hundred={rows:rows().length,label:document.getElementById('profile-page-status').textContent,\n    selected:window.LHMProfileSelection.getSelected().length};\n  return {first,selectedPage1,second,selectedCrossPage,filtered,hundred};\n})()",true);
          if(pagerQa.first.rows!==50||pagerQa.first.first!=='qa_0001'||
             pagerQa.first.last!=='qa_0050'||!pagerQa.first.label.includes('1000')||
             pagerQa.selectedPage1!==50||pagerQa.second.rows!==50||
             pagerQa.second.first!=='qa_0051'||pagerQa.second.selected!==50||
             pagerQa.selectedCrossPage!==51||pagerQa.filtered.rows!==1||
             pagerQa.filtered.first!=='qa_1000'||pagerQa.filtered.selected!==51||
             pagerQa.hundred.rows!==100||pagerQa.hundred.selected!==51||
             !pagerQa.hundred.label.includes('1000'))
            throw Error('Real Electron 1000-profile pager regression: '+JSON.stringify(pagerQa));
          writeCapture('workspace-profile-paging-preview.png',await mainWindow.webContents.capturePage());
          console.log('[UI smoke] 1000 synthetic metadata profiles: bounded rows, cross-page selection, full-dataset search and 100/page PASS');

          console.log('[UI smoke] Fleet Triage real local health aggregation rendered and captured');

          console.log('[UI smoke] Ads Guard, real metadata timing, signed-update UI, and license renewal panels verified in actual Electron');

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
  const updatePublicKeyFile=app.isPackaged
    ?path.join(process.resourcesPath,'lhm-update-publisher','update-publisher-ed25519.pub')
    :path.join(app.getAppPath(),'resources','update-publisher','update-publisher-ed25519.pub');
  const onlineUpdates=new UpdateCenter({
    currentVersion:app.getVersion(),
    publicKeyFile:updatePublicKeyFile,
    licenseKey:LICENSE_PUBLIC_KEY
  });
  let lastVerifiedInstallerPath=null;
  const inspectCurrentUpgrade=()=>inspectUpgradeSafety({
    storageDir:store.baseDir,store,workflowStore,proxyVault,launcher
  });
  ipcMain.handle('app-upgrade-safety-check',()=>inspectCurrentUpgrade());
  ipcMain.handle('app-online-update-status',()=>onlineUpdates.status());
  ipcMain.handle('app-online-update-check',()=>onlineUpdates.check());
  ipcMain.handle('app-online-update-download',async()=>{
    // A corrupt/unreadable local data store must be reviewed before updating.
    const readiness=inspectCurrentUpgrade();
    if(readiness.status==='blocked')
      throw Error('Kiểm tra dữ liệu trước nâng cấp chưa đạt; hãy kiểm tra hồ sơ và sao lưu trước.');
    // No renderer-supplied URL, filename, hash or destination.
    const offer=onlineUpdates.lastOffer;
    if(!offer||onlineUpdates.busy)throw Error('Chưa có bản cập nhật được xác minh');
    const artifact=offer.details.artifact;
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Tải bộ cài LHM đã xác minh SHA-256',
      defaultPath:path.join(app.getPath('downloads'),artifact.fileName),
      filters:[{name:'Bộ cài Windows',extensions:['exe']}]
    });
    if(canceled||!filePath)return {canceled:true};
    // Enforce verified signed filename, so saved EXE cannot be swapped
    // with a differently named artifact by a compromised renderer.
    if(path.basename(filePath)!==artifact.fileName)
      throw Error('Tên tệp phải khớp với bộ cài trong manifest đã ký');
    lastVerifiedInstallerPath=null;
    const result=await onlineUpdates.download(filePath);
    lastVerifiedInstallerPath=filePath;
    return {canceled:false,...result};
  });
  ipcMain.handle('app-online-update-open-folder',()=>{
    if(!lastVerifiedInstallerPath||!fs.existsSync(lastVerifiedInstallerPath))
      throw Error('Chưa có bộ cài đã xác minh để mở thư mục');
    require('electron').shell.showItemInFolder(lastVerifiedInstallerPath);
    return {opened:true};
  });
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
  ipcMain.handle('license-center-service-status', () =>
    getLicenseServiceStatus(onlineLicenseVerifier,licenseManager));
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
  ipcMain.handle('ai-advisor-budget-set', (_, limit) => aiAdvisor.setMonthlyRequestLimit(limit));
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
  // Measurements contain aggregate numbers only. They are not browser
  // startup timings and never leave this computer automatically.
  let lastPerformanceEvidence=null;
  ipcMain.handle('performance-lab-run', () => {
    lastPerformanceEvidence=runPerformanceLab(store);
    return lastPerformanceEvidence;
  });
  ipcMain.handle('performance-lab-export', async () => {
    if(!lastPerformanceEvidence)throw Error('Hãy chạy phép đo trước khi xuất báo cáo');
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Lưu bằng chứng hiệu năng LHM (chỉ số tổng hợp)',
      defaultPath:'LHM-Performance-'+lastPerformanceEvidence.generatedAt.slice(0,10)+'.json',
      filters:[{name:'JSON performance evidence',extensions:['json']}]
    });
    if(canceled||!filePath)return {canceled:true};
    const text=JSON.stringify(lastPerformanceEvidence,null,2)+'\n';
    fs.writeFileSync(filePath,text,{encoding:'utf8',mode:0o600});
    return {canceled:false,bytes:Buffer.byteLength(text,'utf8')};
  });
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
  ipcMain.handle('control-tower-triage', () => {
    const profiles=store.getProfiles();
    const settings=store.getSettings();
    const proxies=store.data.proxies;
    const health=profiles.map(p=>checkProfile(p,{settings,proxies,vault:proxyVault}));
    return buildFleetTriage(profiles,health,launcher.listActive());
  });
  // Consent-based, single-user OFFLINE template handoff (not cloud sync/RBAC).
  // Keep only the ENCRYPTED selected file in RAM for up to 10 minutes.
  let pendingAgencyHandoff=null;
  ipcMain.handle('agency-handoff-export',async(_,ids,password)=>{
    const result=exportSelectedTemplates(store,ids,password);
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Chia sẻ mẫu hồ sơ LHM đã mã hóa (không có cookie/phiên)',
      defaultPath:'LHM-Agency-Templates-'+new Date().toISOString().slice(0,10)+'.lhmshare',
      filters:[{name:'LHM Encrypted Templates',extensions:['lhmshare']}]
    });
    if(canceled||!filePath)return {canceled:true};
    fs.writeFileSync(filePath,result.text,{encoding:'utf8',mode:0o600});
    return {canceled:false,count:result.count,encrypted:true,
      includesSessions:false,includesProxyCredentials:false};
  });
  ipcMain.handle('agency-handoff-import-preview',async(_,password)=>{
    pendingAgencyHandoff=null;
    if(typeof password!=='string'||password.length<12||password.length>512)
      throw Error('Mật khẩu chia sẻ cần 12–512 ký tự');
    const selected=await dialog.showOpenDialog(mainWindow,{
      title:'Chọn gói mẫu hồ sơ LHM được chia sẻ đã mã hóa',
      properties:['openFile'],
      filters:[{name:'LHM Encrypted Templates',extensions:['lhmshare']}]
    });
    if(selected.canceled||!selected.filePaths?.length)return {canceled:true};
    const name=selected.filePaths[0];
    const meta=fs.lstatSync(name);
    if(!meta.isFile()||meta.isSymbolicLink()||meta.size>MAX_FILE_BYTES)
      throw Error('Gói chia sẻ không hợp lệ hoặc quá lớn (256 KB).');
    const encrypted=fs.readFileSync(name,'utf8');
    const summary=previewTemplates(encrypted,password);
    pendingAgencyHandoff={encrypted,createdAt:Date.now()};
    return {canceled:false,...summary};
  });
  ipcMain.handle('agency-handoff-import-commit',(_,password,confirmation)=>{
    if(confirmation!=='IMPORT_NEW_TEMPLATES')
      throw Error('Chưa xác nhận nhập hồ sơ mới.');
    const pending=pendingAgencyHandoff;
    pendingAgencyHandoff=null; // one-shot, even if password or license fails
    if(!pending||Date.now()-pending.createdAt>10*60*1000)
      throw Error('Phiên xem trước đã hết hạn; hãy chọn lại gói chia sẻ.');
    return importTemplates(store,pending.encrypted,password);
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
  ipcMain.handle('ads-qa-checklist', () => ADS_QA_CHECKS);
  ipcMain.handle('ads-qa-preview', (_, input) => {
    const {report} = buildCampaignQaReport(input);
    return {decision:report.decision,summary:report.summary,scope:report.scope,
      note:report.disclaimer};
  });
  ipcMain.handle('ads-qa-export', async (_, input) => {
    // Explicit local export. Never automatically upload advertising/customer data.
    const {report,text} = buildCampaignQaReport(input);
    const {canceled,filePath} = await dialog.showSaveDialog(mainWindow,{
      title:'Lưu báo cáo kiểm tra chiến dịch (không chứa URL gốc)',
      defaultPath:'LHM-Ads-QA-'+report.generatedAt.slice(0,10)+'.json',
      filters:[{name:'JSON QA report',extensions:['json']}]
    });
    if(canceled || !filePath)return {canceled:true};
    fs.writeFileSync(filePath,text,{encoding:'utf8',flag:'w'});
    return {canceled:false,decision:report.decision,
      sha256:report.integrity.bodySha256,bytes:Buffer.byteLength(text,'utf8')};
  });
    ipcMain.handle('ads-landing-inspect', (_, input) => inspectLandingUrls(input));
  ipcMain.handle('ads-utm-build', (_, url, values) => buildUtmUrl(url, values));
    ipcMain.handle('get-launch-readiness', (_, id) => {
    const profile = store.getProfile(id);
    if (!profile) throw Error('Không tìm thấy hồ sơ');
    return launchReadiness(profile, {
      proxies: store.data.proxies,
      vault: proxyVault
    });
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
  // Local customer handoff: strictly projected aggregate data. Never send
  // license tokens, installation IDs, profile names or paths to renderer.
  const customerHandoff=()=>{
    const profiles=store.getProfiles();
    const reports=profiles.map(profile=>checkProfile(profile,{
      settings:store.getSettings(),proxies:store.data.proxies,vault:proxyVault
    }));
    const local=buildReadiness({profiles,reports,proxies:proxyCenter.list(),
      active:launcher.listActive(),workflows:workflowStore.list(),
      vault:proxyVault,platform:process.platform});
    return buildCustomerHandoff({
      appInfo:{version:app.getVersion(),platform:process.platform,arch:process.arch,
        packaged:app.isPackaged},
      license:licensePolicy.status(),
      update:onlineUpdates.status(),
      upgrade:inspectCurrentUpgrade(),
      local
    });
  };
  ipcMain.handle('customer-handoff-preview',()=>customerHandoff());
  ipcMain.handle('customer-handoff-export',async()=>{
    // Export freshly computed evidence only AFTER explicit user interaction.
    const report=customerHandoff();
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{
      title:'Lưu báo cáo bàn giao LHM (không chứa thông tin định danh)',
      defaultPath:'LHM-Customer-Handoff-'+report.createdAt.slice(0,10)+'.json',
      filters:[{name:'JSON Customer Handoff',extensions:['json']}]
    });
    if(canceled||!filePath)return {canceled:true};
    const content=JSON.stringify(report,null,2)+'\n';
    fs.writeFileSync(filePath,content,{mode:0o600,encoding:'utf8'});
    return {canceled:false,bytes:Buffer.byteLength(content,'utf8'),
      status:report.status};
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
  ipcMain.handle('studio-templates', () => listWorkflowTemplates());
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
  const googleConfig=loadGoogleStagingConfig({packaged:app.isPackaged});
  if (!googleConfig && !fs.existsSync(path.join(storageDir, 'db.json')) &&
      fs.existsSync(path.join(legacyDir, 'db.json'))) {
    fs.mkdirSync(path.dirname(storageDir), { recursive: true });
    fs.cpSync(legacyDir, storageDir, { recursive: true, errorOnExist: false });
  }
  if(googleConfig){
    googleDesktop=new GoogleBrowserDesktopClient({
      root:path.join(app.getPath('userData'),'google-saas-secure'),
      safeStorage,apiOrigin:googleConfig.apiOrigin,publicKey:googleConfig.publicKey
    });
    googleTenantRoot=googleTenantStorageRoot(storageDir,googleDesktop.state.customer_id,{create:true});
  }
  store = new Store(googleTenantRoot||storageDir);
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
    endpoint:resolveLicenseEndpoint({
      packaged:app.isPackaged,
      resourcesPath:process.resourcesPath,
      developmentEndpoint:process.env.LHM_LICENSE_VERIFY_URL||null
    })
  });
  licensePolicy.onlineVerifier=onlineLicenseVerifier;
  if(googleDesktop){
    // Legacy trial/v1 signed keys never authorize commercial Gmail profiles.
    licensePolicy={
      status:()=>{const s=googleDesktop.status();return {...s,
        access:s.allowed?'licensed':'blocked',status:s.allowed?'active':'inactive',
        active:s.allowed,expiresAt:s.validUntil||null,plan:s.plan||null,
        trial:false,reason:s.reason||null,remainingDays:s.allowed?
          Math.ceil((Date.parse(s.validUntil)-Date.now())/86400000):0};},
      require:feature=>googleDesktop.require(feature),
      assertCapacity:(count,addition)=>googleDesktop.assertCapacity(count,addition)
    };
  }
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
  if(!googleDesktop && onlineLicenseVerifier.endpoint){
    onlineLicenseVerifier.verifyNow().catch(error=>console.warn('[License] Online check unavailable:',error.message));
    licenseTimer=setInterval(()=>{
      onlineLicenseVerifier.verifyNow().catch(error=>console.warn('[License] Online check unavailable:',error.message));
    },LICENSE_REFRESH_MS);
    licenseTimer.unref?.();
  }
  if(googleDesktop){
    // Renewal happens in Electron main; a failure to contact the server
    // cannot extend a signed lease beyond its original 72-hour deadline.
    googleLeaseTimer=setInterval(async()=>{
      if(!googleDesktop.state.seat_id)return;
      try{
        await googleDesktop.heartbeat();
        if(googleDesktop.status().allowed)await googleDesktop.refreshLease();
      }catch(error){
        if(error.code!=='NETWORK_UNAVAILABLE')
          console.warn('[Google SaaS] Renewal:',error.code||'service_unavailable');
      }
    },5*60*1000);
    googleLeaseTimer.unref?.();
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
  if (googleLeaseTimer) clearInterval(googleLeaseTimer);
  if (batchAutomation) batchAutomation.stop();
  if (automationRunner) automationRunner.stop();
  if (recorderManager?.status().state === 'recording') recorderManager.stop();
  if (launcher) for (const active of launcher.listActive()) launcher.stop(active.profileId);
  if (apiServer) apiServer.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
