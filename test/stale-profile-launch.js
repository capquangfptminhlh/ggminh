'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stale-launch-'));
 try{
  const current=new Store(dir),profile=current.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const stale=new Store(dir);
  current.saveProfile({...profile,proxy:{type:'http',host:'127.0.0.1',port:1234}});
  let spawns=0;
  const launcher=new BrowserLauncher(stale,{spawnProcess:()=>{spawns++;throw Error('must not spawn')}});
  launcher.findBrowserBinary=()=>process.execPath;
  await assert.rejects(launcher.start(profile.id),/STORE_CONFLICT/);
  assert.equal(spawns,0,'Stale direct configuration must not reach browser spawn');
  const direct=current.saveProfile({...profile,proxy:{type:'direct'}});
  const changing=new BrowserLauncher(current,{spawnProcess:()=>{spawns++;throw Error('must not spawn')},
   resourceGuard:{assess:async()=>{
    current.saveProfile({...direct,proxy:{type:'http',host:'127.0.0.1',port:1234}});
    return {allowed:true,reviewRequired:false};
   }}});
  changing.findBrowserBinary=()=>process.execPath;
  await assert.rejects(changing.start(profile.id),/STORE_CONFLICT/);
  assert.equal(spawns,0,'Changes during launch must not use a stale profile snapshot');
  console.log('Stale profile cannot start with outdated proxy configuration PASS');
 }finally{
  const real=fs.realpathSync(dir),temp=fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(real),temp);assert(path.basename(real).startsWith('lhm-stale-launch-'));
  fs.rmSync(real,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
