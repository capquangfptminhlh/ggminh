'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {signedUpdatePayload}=require('../src/update/updateCheck');
const {UpdateCenter,downloadVerifiedArtifact,safeUrl}=require('../src/update/updateCenter');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-online-updater-'));
const key=crypto.generateKeyPairSync('ed25519');
const keyPath=path.join(root,'publisher.pub');
fs.writeFileSync(keyPath,key.publicKey.export({format:'pem',type:'spki'}));
const pkg=Buffer.from('synthetic installer byte sequence for LHM unit test');
const artifactName='LHM-Ads-Browser-5.9.0-Setup-x64.exe';
const artifactUrl='https://github.com/capquangfptminhlh/ggminh/releases/download/v5.9.0/'+artifactName;
const manifestUrl='https://github.com/capquangfptminhlh/ggminh/releases/download/lhm-updates/stable.json';
const cdnUrl='https://release-assets.githubusercontent.com/release/fixture?authorized=signed';
const now=Date.now();
function sign(doc){
 const signature=crypto.sign(null,signedUpdatePayload(doc),key.privateKey).toString('base64url');
 return {...doc,signature};
}
const valid=sign({
 schema:1,product:'lhm-ads-browser',version:'5.9.0',channel:'stable',
 publishedAt:new Date(now-60000).toISOString(),
 expiresAt:new Date(now+86400000).toISOString(),
 artifact:{fileName:artifactName,url:artifactUrl,bytes:pkg.length,
   sha256:crypto.createHash('sha256').update(pkg).digest('hex')},
 signature:'unsigned'
});
function responder({data=pkg,redirect=true,badManifest=null,badLength=false,badRedirect=false}={}){
 const calls=[];
 const request=(url,callback)=>{
  const req=new EventEmitter();
  req.setTimeout=()=>{};
  req.destroy=()=>{};
  calls.push(String(url));
  process.nextTick(()=>{
   const res=new PassThrough();
   if(String(url).includes('/lhm-updates/')){
    res.statusCode=200;
    res.headers={};
    callback(res);
    res.end(badManifest ?? JSON.stringify(valid));
   } else if(String(url)===artifactUrl && redirect){
    res.statusCode=302;
    res.headers={location:badRedirect?'https://evil.example/installer.exe':cdnUrl};
    callback(res);
    res.end();
   } else{
    res.statusCode=200;
    res.headers={'content-length':String(badLength ? data.length+1:data.length)};
    callback(res);
    res.end(data);
   }
  });
  return req;
 };
 return {request,calls};
}
async function main(){
 try{
  const missingResponder=responder();
  const missing=new UpdateCenter({
   currentVersion:'5.8.0',publicKeyFile:path.join(root,'missing.pub'),
   manifestUrl,request:missingResponder.request
  });
  assert.equal(missing.status().configured,false);
  assert.equal((await missing.check()).status,'not-configured');
  assert.equal(missingResponder.calls.length,0,'No publisher key -> no network call');
  await assert.rejects(()=>missing.download(path.join(root,artifactName)),/Chưa có/);

  const live=responder();
  const center=new UpdateCenter({currentVersion:'5.8.0',
    publicKeyFile:keyPath,manifestUrl,request:live.request});
  assert.equal(center.status().status,'not-checked');
  assert.equal(live.calls.length,0,'Local status cannot phone home');
  const offer=await center.check();
  assert.equal(offer.status,'update-available');
  assert.equal(center.status().canDownload,true);
  assert.equal(live.calls.length,1,'Check downloads manifest ONLY');
  assert.equal(offer.details.artifact.sha256,valid.artifact.sha256);
  const dest=path.join(root,artifactName);
  const outcome=await center.download(dest);
  assert.equal(outcome.verified,true);
  assert.equal(outcome.bytes,pkg.length);
  assert.deepEqual(fs.readFileSync(dest),pkg);
  assert.equal(live.calls.length,3,'Download follows HTTPS allowlisted release CDN');
  assert.equal(live.calls[2],cdnUrl);
  await assert.rejects(()=>center.download(dest),/replace an existing installer/);
  assert.equal(fs.readdirSync(root).filter(x=>x.endsWith('.partial')).length,0);

  const attacker=responder({data:Buffer.from('different update installer bytes!')});
  const attackCenter=new UpdateCenter({currentVersion:'5.8.0',
    publicKeyFile:keyPath,manifestUrl,request:attacker.request});
  assert.equal((await attackCenter.check()).status,'update-available');
  const tamperedPath=path.join(fs.mkdtempSync(path.join(root,'tampered-')),artifactName);
  await assert.rejects(()=>attackCenter.download(tamperedPath),
    /content length differs|SHA-256 mismatch|size differs/);
  assert(!fs.existsSync(tamperedPath),'Never retain tampered EXE');

  const equalLengthCorruption=Buffer.from(pkg);equalLengthCorruption[0]^=255;
  const corrupt=responder({data:equalLengthCorruption});
  const corruptCenter=new UpdateCenter({currentVersion:'5.8.0',
    publicKeyFile:keyPath,manifestUrl,request:corrupt.request});
  assert.equal((await corruptCenter.check()).status,'update-available');
  const corruptDir=fs.mkdtempSync(path.join(root,'corrupt-'));
  await assert.rejects(()=>corruptCenter.download(path.join(corruptDir,artifactName)),/SHA-256 mismatch/);
  assert.deepEqual(fs.readdirSync(corruptDir),[],'Partial files must be cleaned up');

  const evil=responder({badRedirect:true});
  const evilCenter=new UpdateCenter({currentVersion:'5.8.0',
    publicKeyFile:keyPath,manifestUrl,request:evil.request});
  assert.equal((await evilCenter.check()).status,'update-available');
  const evilDir=fs.mkdtempSync(path.join(root,'evil-'));
  await assert.rejects(()=>evilCenter.download(path.join(evilDir,artifactName)),
    /HTTPS allowlist/);
  assert.deepEqual(fs.readdirSync(evilDir),[]);

  const forged={...valid,version:'9.0.0'};
  const invalid=responder({badManifest:JSON.stringify(forged)});
  const invalidCenter=new UpdateCenter({currentVersion:'5.8.0',
    publicKeyFile:keyPath,manifestUrl,request:invalid.request});
  assert.equal((await invalidCenter.check()).status,'invalid');
  assert.equal(invalidCenter.status().canDownload,false);
  await assert.rejects(()=>invalidCenter.download(path.join(root,'new',artifactName)),/Chưa có/);

  const expiredOffer= {status:'update-available',details:{
    ...offer.details,expiresAt:new Date(now-10000).toISOString()}};
  await assert.rejects(()=>downloadVerifiedArtifact({offer:expiredOffer,
    currentVersion:'5.8.0',destination:path.join(root,'bad',artifactName)}),/expired/);
  assert.throws(()=>safeUrl('http://github.com/installer.exe',['github.com']),/HTTPS/);
  assert.throws(()=>safeUrl('https://evil.example/installer.exe',['github.com']),/HTTPS/);
  assert.throws(()=>safeUrl('https://github.com/installer.exe?token=abc',['github.com']),/HTTPS/);

  const repo=path.resolve(__dirname,'..');
  const mainSource=fs.readFileSync(path.join(repo,'main.js'),'utf8');
  const preload=fs.readFileSync(path.join(repo,'preload.js'),'utf8');
  const html=fs.readFileSync(path.join(repo,'src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(repo,'src/ui/onlineUpdateCenter.js'),'utf8');
  const pkgJson=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
  assert(mainSource.includes("ipcMain.handle('app-online-update-check'"));
  assert(mainSource.includes("ipcMain.handle('app-online-update-download'"));
  assert(mainSource.includes('update-publisher-ed25519.pub'));
  assert(preload.includes('onlineUpdateCheck:'));
  assert(preload.includes('onlineUpdateDownload:'));
  for(const id of ['lhm-update-check','lhm-update-download','lhm-update-folder',
    'lhm-update-status','lhm-update-offer'])
    assert(html.includes('id="'+id+'"'),'Missing online update UI: '+id);
  assert(html.includes('src="onlineUpdateCenter.js"'));
  assert(html.includes('href="onlineUpdateCenter.css"'));
  assert(!ui.includes('innerHTML'),'Update information must be displayed as text');
  assert(pkgJson.build.extraResources.some(x=>x.to==='lhm-update-publisher'));
  assert(pkgJson.scripts['test:steps'].includes('node test/online-update-center.js'));
  console.log('Signed online updates: no-key fail-closed, signed manifest, HTTPS redirect, stream SHA-256, corruption refusal and UI tests PASS');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
