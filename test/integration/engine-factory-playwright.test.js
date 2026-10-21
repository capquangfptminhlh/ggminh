'use strict';
const assert=require('assert');
const {EngineFactory}=require('../../src/engine/EngineFactory');
(async()=>{
 let manual=0,controlled=0;
 const profile={id:'labA',name:'Authorized lab',engine:'gecko',
  engine_type:'camoufox',proxy:{type:'direct'},
  fingerprint:{mode:'native'}};
 const controller={enabled:true,labApproved:false,
  launch:async()=>{
   controlled++;
   throw Error('Injected Playwright protocol mismatch');
  }};
 const launcher={
  _launchInstalled:async()=>{throw Error('Unexpected installed engine')},
  camoufoxAdapter:{start:async()=>{manual++;throw Error('Native fallback forbidden')}},
  camoufoxPlaywrightController:controller,
  store:{getSettings:()=>({geckoProvider:'camoufox'})},
  activeProcesses:new Map()
 };
 const factory=new EngineFactory(launcher);
 await assert.rejects(()=>factory.launchProfile(profile),/Injected Playwright protocol mismatch/);
 assert.equal(controlled,1);
 assert.equal(manual,0,'Explicit Playwright must never silently retry native spawn');
 const bad={...profile,id:'badLab',
  proxy:{type:'socks5',host:'unapproved.example',port:1080,authProxyId:'missing'}};
 await assert.rejects(()=>factory.launchProfile(bad),e=>e.code==='NETWORK_BLOCKED');
 assert.equal(controlled,1);
 assert.equal(manual,0);
 controller.launch=async()=>({
  info:{profileId:profile.id,engine:'gecko',engineType:'camoufox',
   provider:'camoufox',protocol:'playwright-internal',wsEndpoint:null}
 });
 const started=await factory.launchProfile(profile);
 assert.equal(started.protocol,'playwright-internal');
 assert.equal(started.wsEndpoint,null);
 assert.equal(started.engineType,'camoufox');
 assert.equal(launcher.activeProcesses.get(profile.id).protocol,'playwright-internal');
 console.log('EngineFactory preflight and explicit Playwright routing: no silent spawn fallback or phantom WS');
})().catch(e=>{console.error(e);process.exitCode=1});