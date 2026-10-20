'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const EventEmitter=require('events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {ExtensionManager,validateFolder}=require('../src/extensions/manager');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ext-'));
 try{
  const data=path.join(root,'data'),folder=path.join(root,'source');
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({
   manifest_version:3,name:'QA Test Extension',version:'1.2.3',
   permissions:['storage'],description:'Quality assurance extension'
  }));
  fs.writeFileSync(path.join(folder,'script.js'),'console.log("QA only")');
  const store=new Store(data);
  const a=store.saveProfile({name:'A',engine:'chromium'});
  const b=store.saveProfile({name:'B',engine:'gecko'});
  const busy=new Set(),launcher={isBusy:id=>busy.has(id)};
  const manager=new ExtensionManager(store,launcher);
  assert.strictEqual(validateFolder(folder).count,2);
  const installed=manager.install(folder);
  assert.strictEqual(installed.name,'QA Test Extension');
  assert.strictEqual(manager.list().length,1);
  assert(fs.existsSync(path.join(manager.base,installed.id,'manifest.json')));
  fs.writeFileSync(path.join(folder,'script.js'),'different content');
  assert.strictEqual(fs.readFileSync(path.join(manager.base,installed.id,'script.js'),'utf8'),'console.log("QA only")');
  assert.strictEqual(manager.assign(installed.id,[a.id],true).assigned,1);
  assert.deepStrictEqual(manager.getEnabledPaths(a.id),[path.join(manager.base,installed.id)]);
  assert.strictEqual(new Store(data).data.extensions[0].profileIds[0],a.id);
  assert.throws(()=>manager.assign(installed.id,[b.id],true),/Chromium-only/);
  busy.add(a.id);
  assert.throws(()=>manager.assign(installed.id,[a.id],false),/Close browser/);
  assert.throws(()=>manager.remove(installed.id),/Close assigned/);
  busy.delete(a.id);
  const before=store.data,save=store.saveData;
  store.saveData=()=>{throw Error('SIMULATED_DISK_FAILURE')};
  assert.throws(()=>manager.assign(installed.id,[a.id],false),/SIMULATED_DISK_FAILURE/);
  assert.strictEqual(store.data,before);
  store.saveData=save;
  assert.strictEqual(manager.assign(installed.id,[a.id],false).assigned,0);
  assert(manager.remove(installed.id));
  assert.strictEqual(manager.list().length,0);
  assert(!fs.existsSync(path.join(manager.base,installed.id)));
  const bad=path.join(root,'bad');fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad,'manifest.json'),JSON.stringify({
   manifest_version:2,name:'Legacy',version:'1.0.0'
  }));
  assert.throws(()=>manager.install(bad),/Manifest V3/);
  if(process.platform!=='win32'){
   const link=path.join(folder,'symlink');
   fs.symlinkSync('/tmp',link);
   assert.throws(()=>manager.install(folder),/symlinks/);
   fs.unlinkSync(link);
  }
  const assigned=manager.install(folder);
  manager.assign(assigned.id,[a.id],true);
  let args;
  const processObj=new EventEmitter();
  processObj.pid=10345;
  const browser=new BrowserLauncher(store,{
   extensionManager:manager,
   spawnProcess:(_file,values)=>{args=values;process.nextTick(()=>processObj.emit('spawn'));return processObj;}
  });
  browser.findBrowserBinary=()=>process.execPath;
  await browser.start(a.id);
  assert(args.some(x=>x.startsWith('--load-extension=')&&x.includes(assigned.id)));
  processObj.emit('exit',0);
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/extensionCenter.js'),'utf8');
  assert(html.includes('id="btn-extension-center"')&&html.includes('id="modal-extension-center"'));
  assert(ui.includes('listInstalledExtensions(')&&ui.includes('assignExtensionProfiles('));
  console.log('v4.0 Chromium extension catalog, assignments, rollback, startup and UI passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});