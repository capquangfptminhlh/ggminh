'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const ProxyCenter=require('../src/proxies/proxyCenter');
const {parseProxyCsv}=require('../src/proxies/bulkImport');
(async()=>{
 assert.deepStrictEqual(parseProxyCsv('name,type,host,port,tag\r\n"Proxy, A",http,proxy.example,8080,"Team, A"\r\n'),
  [{name:'Proxy, A',type:'http',host:'proxy.example',port:'8080',tag:'Team, A'}]);
 assert.throws(()=>parseProxyCsv('name,type,host,port,user\nx,http,p.example,10,alice'),/Không chấp nhận/);
 assert.throws(()=>parseProxyCsv('name,type,host,port,tag\n"a,http,p.example,80,t'),/chưa được đóng/);
 assert.throws(()=>parseProxyCsv('name,type,host,port,tag\np,http,host,8080'),/5 cột/);
 assert.throws(()=>parseProxyCsv('a'.repeat(70*1024)),/64 KiB/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-proxy-bulk-'));
 try{
  const store=new Store(dir);
  let active=0,maximum=0,checked=0;
  const mgr=new ProxyCenter(store,{isBusy:()=>false},{checkProxy:async input=>{
   active++;maximum=Math.max(maximum,active);checked++;
   await new Promise(resolve=>setTimeout(resolve,12));
   active--;
   if(input.host==='fail.example')throw Error('THE_SECRET_SHOULD_NOT_LEAK');
   return {status:'verified',verified:true,ip:'203.0.113.22'};
  }});
  const imported=mgr.importCsv([
   'name,type,host,port,tag',
   'Proxy A,http,a.example,8080,Ops',
   'Proxy B,socks5,b.example,1080,Ops',
   'Proxy C,http,fail.example,8088,Ops',
   'Duplicate,http,A.EXAMPLE,8080,Ops'
  ].join('\r\n'));
  assert.deepStrictEqual(imported,{imported:3,skipped:1,total:3});
  assert.strictEqual(mgr.list().length,3);
  assert.strictEqual(mgr.list()[0].name,'Proxy A');
  assert(!fs.readFileSync(store.dbFile,'utf8').includes('password'));
  const prev=store.data.proxies.map(p=>p.id);
  assert.throws(()=>mgr.importCsv('name,type,host,port,tag\nGood,http,good.example,80,Ok\nBad,socks5,invalid/,80,X'),/không hợp lệ/);
  assert.deepStrictEqual(store.data.proxies.map(p=>p.id),prev);
  assert.deepStrictEqual(mgr.importCsv('name,type,host,port,tag\nCopy,http,A.example,8080,X'),
   {imported:0,skipped:1,total:3});
  const originalSave=store.saveData.bind(store);
  store.saveData=()=>{throw Error('Disk is read-only');};
  assert.throws(()=>mgr.importCsv('name,type,host,port,tag\nNew,http,new.example,8000,X'),/Disk is read-only/);
  assert.strictEqual(mgr.list().length,3);
  store.saveData=originalSave;
  const ids=mgr.list().map(x=>x.id);
  const batch=await mgr.verifyBatch(ids);
  assert.strictEqual(batch.checked,3);
  assert.strictEqual(batch.verified,2);
  assert.strictEqual(batch.failures,1);
  assert(maximum<=3);
  assert(!JSON.stringify(batch).includes('THE_SECRET_SHOULD_NOT_LEAK'));
  assert.strictEqual(mgr.list().filter(x=>x.check?.verified).length,2);
  await assert.rejects(()=>mgr.verifyBatch([]),/1 đến 20/);
  await assert.rejects(()=>mgr.verifyBatch(['invalid-id']),/Invalid proxy ID/);
  assert(checked===3);
  // Twenty verification workers, but never more than three concurrently.
  const more=Array.from({length:17},(_,i)=>'Extra'+i+',http,x'+i+'.example,'+(2000+i)+',Bulk');
  const extra=mgr.importCsv('name,type,host,port,tag\n'+more.join('\n'));
  assert.strictEqual(extra.imported,17);
  const twenty=await mgr.verifyBatch(mgr.list().map(p=>p.id));
  assert.strictEqual(twenty.checked,20);
  assert(maximum<=3);
  console.log('Proxy CSV import, atomic persistence, duplicate skip, batch limit and concurrency tests passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});