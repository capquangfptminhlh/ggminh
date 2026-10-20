'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const identity=fs.readFileSync(path.join(root,'src/ui/appIdentity.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
assert.strictEqual(pkg.version,lock.version);
assert.strictEqual(pkg.version,lock.packages[''].version);
assert(!html.includes('LHM Browser · 2.8'));
assert(!html.includes('<h1>LHM Browser <span>2.8</span></h1>'));
for(const id of ['lhm-nav-version','lhm-header-version','btn-app-about',
 'modal-app-about','lhm-about-version','lhm-about-platform','lhm-about-build',
 'lhm-about-license','lhm-about-refresh','lhm-about-message']){
 assert.strictEqual(html.split('id="'+id+'"').length,2,id+' missing or duplicated');
}
assert(html.includes('<script src="appIdentity.js"></script>'));
assert(main.includes("ipcMain.handle('get-app-info'"));
assert(main.includes('version:app.getVersion()'));
assert(preload.includes("getAppInfo: () => ipcRenderer.invoke('get-app-info')"));
assert(identity.includes('window.api.getAppInfo('));
assert(identity.includes("document.body.dataset.versionReady='true'"));
assert(identity.includes("el('lhm-nav-version').textContent=display"));
assert(identity.includes("el('lhm-header-version').textContent=display"));
assert(identity.includes("document.title='LHM Ads Browser '+display"));
assert(!identity.includes('innerHTML'));
assert(!/\b2\.8\b/.test(html));
console.log('Runtime version labels, About UI and app package/lock sync passed');
