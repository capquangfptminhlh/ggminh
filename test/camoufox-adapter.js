'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const EventEmitter=require('events');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-test-'));
 const contexts=[],visited=[],options=[];
 const loader=async()=>async config=>{
  options.push(config);
  const context=new EventEmitter();
  context.closed=false;
  context.newPage=async()=>({
   goto:async(url,opts)=>{visited.push({url,opts,dir:config.user_data_dir});}
  });
  context.close=async()=>{
   if(context.closed)return;
   context.closed=true;context.emit('close');
  };
  contexts.push(context);
  return context;
 };
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const store=new Store(base);
  store.updateSettings({geckoProvider:'camoufox'});
  const a=store.saveProfile({name:'Account A',engine:'gecko',
   fingerprint:{mode:'native'},startUrl:'https://example.com/',proxy:{type:'direct'}});
  const b=store.saveProfile({name:'Account B',engine:'gecko',
   fingerprint:{mode:'native'},startUrl:'https://example.com/',proxy:{type:'direct'}});
  const fakeBinary=path.join(base,'approved-camoufox','camoufox.exe');
  const bundleVerifier={resolve:engine=>{
   assert.strictEqual(engine,'camoufox');return fakeBinary;
  },status:()=>({valid:true,version:'134.0.2'})};
  const adapter=new CamoufoxAdapter(base,{loader,bundleVerifier});
  const launcher=new BrowserLauncher(store);
  launcher.camoufoxAdapter=adapter;
  launcher.findBrowserBinary=()=>{throw Error('Camoufox must not call system Firefox');};
  const [first,duplicate]=await Promise.all([
   launcher.start(a.id),launcher.start(a.id)
  ]);
  assert.strictEqual(first.provider,'camoufox');
  assert.strictEqual(first.name,'Account A');
  assert.strictEqual(first.port,null);
  assert.strictEqual(first.pid,null);
  assert.strictEqual(duplicate.profileId,a.id);
  assert.strictEqual(contexts.length,1);
  const second=await launcher.start(b.id);
  assert.strictEqual(contexts.length,2);
  assert.strictEqual(second.profileId,b.id);
  assert.notStrictEqual(options[0].user_data_dir,options[1].user_data_dir);
  assert(options[0].user_data_dir.includes(path.join('camoufox-profiles',a.id)));
  assert(options[1].user_data_dir.includes(path.join('camoufox-profiles',b.id)));
  assert.deepStrictEqual(options.map(o=>Object.keys(o).sort()),
   [['executable_path','headless','persistent_context','user_data_dir'],
    ['executable_path','headless','persistent_context','user_data_dir']]);
  assert(options.every(o=>o.executable_path===fakeBinary&&o.persistent_context===true));
  assert(visited.every(item=>item.url==='https://example.com/'));
  assert(launcher.listActive().every(s=>s.port===null&&s.provider==='camoufox'));
  assert.strictEqual(launcher.stop(a.id).success,true);
  await assert.rejects(()=>launcher.start(a.id),/đang đóng/);
  await flush();await flush();
  assert.strictEqual(launcher.isBusy(a.id),false);
  assert.strictEqual(launcher.isBusy(b.id),true);
  const restarted=await launcher.start(a.id);
  assert.strictEqual(restarted.profileId,a.id);
  assert.strictEqual(options[2].user_data_dir,options[0].user_data_dir);
  assert.strictEqual(launcher.stop(a.id).success,true);
  assert.strictEqual(launcher.stop(b.id).success,true);
  await flush();await flush();
  assert.strictEqual(launcher.listActive().length,0);
  store.updateSettings({geckoProvider:'firefox'});
  assert.strictEqual(store.getSettings().geckoProvider,'firefox');
  store.updateSettings({geckoProvider:'camoufox'});
  const bad=store.saveProfile({name:'Proxy profile',engine:'gecko',
   fingerprint:{mode:'native'},proxy:{type:'socks5',host:'proxy.example',port:1080}});
  await assert.rejects(()=>launcher.start(bad.id),/does not support a configured proxy/);
  assert.strictEqual(contexts.length,3);
  const custom=store.saveProfile({name:'Custom profile',engine:'gecko',
   fingerprint:{mode:'custom',userAgent:'example'},proxy:{type:'direct'}});
  await assert.rejects(()=>launcher.start(custom.id),/requires native profile settings/);
  assert(!fs.existsSync(path.join(base,'camoufox-profiles',custom.id)));
  const unsafe=await assert.rejects(()=>launcher.start(a.id,'file:///etc/passwd'),/Start URL/);
  assert.strictEqual(unsafe,undefined);
  console.log('Camoufox persistent context adapter, two-profile isolation, restart, stop, proxy fail-closed and no-CDP tests passed');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
