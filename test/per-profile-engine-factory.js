'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {EngineFactory,resolveEngineType}=require('../src/engine/EngineFactory');
const BrowserLauncher=require('../src/engine/browserLauncher');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-per-profile-engine-'));
 try{
  const store=new Store(dir);
  assert.strictEqual(resolveEngineType({engine:'chromium'}),'chromium');
  assert.strictEqual(resolveEngineType({engine:'gecko'}),'firefox');
  assert.strictEqual(resolveEngineType({engine:'gecko'},{geckoProvider:'camoufox'}),'camoufox');
  assert.strictEqual(resolveEngineType({engine:'gecko',engine_type:'firefox'},{geckoProvider:'camoufox'}),'firefox');
  assert.throws(()=>resolveEngineType({engine:'chromium',engine_type:'camoufox'}),/conflicts/);
  assert.throws(()=>resolveEngineType({engine_type:'patched-unknown'}),/Unsupported/);
  const chrome=store.saveProfile({name:'Chrome',engine:'chromium',
   engine_type:'chromium',fingerprint:{mode:'native'},startUrl:'https://example.com/'});
  const firefox=store.saveProfile({name:'Firefox',engine:'gecko',
   engine_type:'firefox',fingerprint:{mode:'native'},startUrl:'https://example.com/'});
  const fox=store.saveProfile({name:'Camoufox',engine:'gecko',
   engine_type:'camoufox',fingerprint:{mode:'native'},startUrl:'https://example.com/'});
  assert.deepStrictEqual([chrome.engine_type,firefox.engine_type,fox.engine_type],
   ['chromium','firefox','camoufox']);
  assert.strictEqual(store.getProfile(fox.id).engine,'gecko');
  store.updateSettings({geckoProvider:'camoufox'});
  assert.strictEqual(resolveEngineType(store.getProfile(firefox.id),store.getSettings()),'firefox');
  assert.strictEqual(resolveEngineType(store.getProfile(fox.id),store.getSettings()),'camoufox');
  const untouched=store.saveProfile({id:firefox.id,name:'Renamed'});
  assert.strictEqual(untouched.engine_type,'firefox');
  const noType=store.saveProfile({name:'Legacy Gecko',engine:'gecko'});
  assert.strictEqual(noType.engine_type,'camoufox');
  assert.throws(()=>store.saveProfile({id:firefox.id,name:'Swap',engine:'gecko',
   engine_type:'camoufox'}),/explicit confirmation/);
  assert.strictEqual(store.getProfile(firefox.id).engine_type,'firefox');
  const swapped=store.saveProfile({id:firefox.id,name:'Swap',engine:'gecko',
   engine_type:'camoufox'},{allowEngineChange:true});
  assert.strictEqual(swapped.engine_type,'camoufox');
  assert.throws(()=>store.saveProfile({name:'Invalid pair',engine:'chromium',engine_type:'firefox'}),
   /disagree/);
  const reloaded=new Store(dir);
  assert.strictEqual(reloaded.getProfile(fox.id).engine_type,'camoufox');
  assert.strictEqual(reloaded.getProfile(chrome.id).engine_type,'chromium');
  const calls=[];
  const fakeLauncher={
   store,
   _launchInstalled:async(profile,_url,engine)=>{
    calls.push({profileId:profile.id,engine});
    return {profileId:profile.id,engine,engineType:engine==='gecko'?'firefox':'chromium'};
   },
   camoufoxAdapter:{
    start:async(profile,{onClosed})=>{
     calls.push({profileId:profile.id,engine:'camoufox'});
     return {profileId:profile.id,engine:'gecko',provider:'camoufox'};
    }
   },
   activeProcesses:new Map()
  };
  const factory=new EngineFactory(fakeLauncher);
  assert.strictEqual((await factory.launchProfile(chrome)).engineType,'chromium');
  assert.strictEqual((await factory.launchProfile({
   ...firefox,engine_type:'firefox'
  })).engineType,'firefox');
  assert.strictEqual((await factory.launchProfile(fox)).engineType,'camoufox');
  assert.deepStrictEqual(calls.map(x=>x.engine),['chromium','gecko','camoufox']);
  assert.strictEqual(fakeLauncher.activeProcesses.get(fox.id).engineType,'camoufox');
  fakeLauncher.camoufoxAdapter=null;
  await assert.rejects(()=>factory.launchProfile(fox),/unavailable/);
  assert.strictEqual(calls.length,3); // No silent Chromium fallback.
  const fullLauncher=new BrowserLauncher(store);
  assert.strictEqual(fullLauncher.engineFactory.select(fox,store.getSettings()).engineType,'camoufox');
  assert.strictEqual(fullLauncher.engineFactory.select(chrome,store.getSettings()).engineType,'chromium');
  assert(!fs.existsSync(path.join(dir,'camoufox-profiles',fox.id)));
  console.log('Per-profile engine persistence, legacy fallback, provider routing and explicit switch safety passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
