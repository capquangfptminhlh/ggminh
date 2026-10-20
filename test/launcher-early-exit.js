'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-early-quit-'));
 try{
   const store=new Store(dir);
   const profile=store.saveProfile({name:'Early-exit test',engine:'chromium',
     startUrl:'https://example.org',fingerprint:{mode:'native'}});
   for(const kind of ['exit-before-spawn','exit-after-spawn']){
     const launcher=new BrowserLauncher(store,{spawnProcess:()=>{
       const proc=new EventEmitter();
       proc.pid=3000;
       proc.kill=()=>true;
       process.nextTick(()=>{
         if(kind==='exit-after-spawn')proc.emit('spawn');
         proc.emit('exit',1);
       });
       return proc;
     }});
     launcher.findBrowserBinary=()=>process.execPath;
     await assert.rejects(()=>launcher.start(profile.id),/Trình duyệt/);
     assert.strictEqual(launcher.activeProcesses.size,0);
     assert.strictEqual(launcher.isBusy(profile.id),false);
   }
   // A healthy startup still records a running process and unlocks at exit.
   let spawned;
   const launcher=new BrowserLauncher(store,{spawnProcess:()=>{
     spawned=new EventEmitter();spawned.pid=4444;spawned.kill=()=>true;
     process.nextTick(()=>spawned.emit('spawn'));
     return spawned;
   }});
   launcher.findBrowserBinary=()=>process.execPath;
   const actual=await launcher.start(profile.id);
   assert.strictEqual(actual.pid,4444);
   assert.strictEqual(launcher.isBusy(profile.id),true);
   spawned.emit('exit',0);
   assert.strictEqual(launcher.isBusy(profile.id),false);
   console.log('Browser pre-spawn and immediate post-spawn exit handling tests passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});