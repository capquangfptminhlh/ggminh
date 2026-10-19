const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const { createApiServer } = require('../src/api/server');

(async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-launcher-isolation-'));
  try {
    const store=new Store(root);
    const first=store.saveProfile({name:'Customer A',engine:'chromium',proxy:{type:'direct'}});
    const second=store.saveProfile({name:'Customer B',engine:'chromium',proxy:{type:'direct'}});
    let spawnCount=0;
    const processes=[];
    const commandLines=[];
    function fakeSpawn(_bin,args) {
      spawnCount++;
      commandLines.push(args);
      const proc=new EventEmitter();
      proc.pid=50000+spawnCount;
      proc.kill=()=>true;
      proc.exitCode=null;
      proc.signalCode=null;
      processes.push(proc);
      process.nextTick(()=>proc.emit('spawn'));
      return proc;
    }
    const launcher=new BrowserLauncher(store,{spawnProcess:fakeSpawn});
    launcher.findBrowserBinary=()=>process.execPath;
    // Both callers get the exact same launched process (no competing profile lock).
    const [one,alsoOne]=await Promise.all([launcher.start(first.id),launcher.start(first.id)]);
    assert.strictEqual(spawnCount,1);
    assert.strictEqual(one.pid,alsoOne.pid);
    assert.strictEqual(launcher.isBusy(first.id),true);
    const two=await launcher.start(second.id);
    assert.notStrictEqual(two.pid,one.pid);
    assert.strictEqual(spawnCount,2);
    const folderA=path.join(root,'profiles',first.id);
    const folderB=path.join(root,'profiles',second.id);
    assert(fs.existsSync(folderA));
    assert(fs.existsSync(folderB));
    assert.notStrictEqual(folderA,folderB);
    assert(commandLines[0].some(x=>x==='--user-data-dir='+folderA));
    assert(commandLines[1].some(x=>x==='--user-data-dir='+folderB));
    assert(commandLines[0].includes('--disable-sync'));
    assert(!commandLines[0].includes('--password-store=basic'));
    assert.throws(()=>createLaunchArgs({
      engine:'chromium', profileDir:folderA,url:'https://user:password@example.com/'
    }),/credentials/);
    const result=launcher.stop(first.id);
    assert.strictEqual(result.success,true);
    assert.strictEqual(launcher.isBusy(first.id),true);
    await assert.rejects(launcher.start(first.id),/đang đóng/);
    processes[0].emit('exit',0);
    assert.strictEqual(launcher.isBusy(first.id),false);
    assert.strictEqual(launcher.isBusy(second.id),true);
    // The local API must refuse deletion of a still-running profile.
    const api=createApiServer(store,launcher,{apiKey:'test-secret'});
    const server=await new Promise(resolve=>{
      const s=api.listen(0,'127.0.0.1',()=>resolve(s));
    });
    try{
      const host='http://127.0.0.1:'+server.address().port;
      const res=await fetch(host+'/api/profiles/'+second.id,{
        method:'DELETE',headers:{'X-API-Key':'test-secret'}
      });
      assert.strictEqual(res.status,409);
      assert(store.getProfile(second.id));
    } finally{await new Promise(resolve=>server.close(resolve));}
    assert.strictEqual(launcher.stop(second.id).success,true);
    processes[1].emit('exit',0);
    assert.strictEqual(launcher.isBusy(second.id),false);
    console.log('Concurrent profile startup, process lifecycle, URL safety and deletion-guard tests passed');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
