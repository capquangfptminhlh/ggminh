'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store');
const {FORMAT,MAX_FILE_BYTES,safeStartOrigin,
  exportSelectedTemplates,previewTemplates,importTemplates,open,seal}=require('../src/ops/agencyTemplateHandoff');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-team-template-'));
const password='test-strong-passphrase-2026';
const secret='SUPER_SECRET_CUSTOMER_TOKEN_ABCDEFG_2026';
try {
  const source=new Store(path.join(root,'source'));
  const p1=source.saveProfile({
    name:'Agency Campaign A',group:'VIP Agency',tags:['ads','client'],
    engine:'chromium',engine_type:'chromium',
    startUrl:'https://shop.example.com/private/customer-289?token='+secret,
    notes:secret,proxy:{type:'direct'},
    fingerprint:{mode:'custom',userAgent:'SECRET_USER_AGENT_'+secret}
  });
  const p2=source.saveProfile({
    name:'Agency Campaign B',group:'Client B',tags:['b-team'],
    engine:'gecko',engine_type:'firefox',
    startUrl:'https://partner.example.com/PRIVATE_TOKEN?access_token='+secret,
    notes:'SECRET_NOTE',proxy:{type:'http',host:'proxy.secret.internal',port:8999},
    fingerprint:{mode:'native'}
  });
  const sessionFile=path.join(source.baseDir,'profiles',p1.id,'Default','Network','Cookies');
  fs.mkdirSync(path.dirname(sessionFile),{recursive:true});
  fs.writeFileSync(sessionFile,secret);
  const activeNames=[p1.id,p2.id];
  const first=exportSelectedTemplates(source,activeNames,password);
  assert.equal(first.count,2);
  assert(first.encrypted);
  assert(!first.includesSessions&&!first.includesProxyCredentials&&!first.includesIdentity);
  const envelope=JSON.parse(first.text);
  assert.equal(envelope.format,FORMAT);
  assert.equal(envelope.cipher,'aes-256-gcm');
  assert.equal(envelope.kdf,'scrypt-16384');
  assert(!first.text.includes(secret));
  for(const str of [p1.id,p2.id,'VIP Agency','Agency Campaign A','proxy.secret.internal',
      'shop.example.com','partner.example.com','SECRET_NOTE']) {
    assert(!first.text.includes(str),'Unencrypted template metadata: '+str);
  }
  const plaintext=open(first.text,password);
  assert.equal(plaintext.length,2);
  assert.equal(plaintext[0].name,'Agency Campaign A');
  assert.equal(plaintext[0].startUrl,'https://shop.example.com/');
  assert.equal(plaintext[0].engine,'chromium');
  assert.equal(plaintext[0].requiresProxySetup,false);
  assert.equal(plaintext[1].startUrl,'https://partner.example.com/');
  assert.equal(plaintext[1].requiresProxySetup,true);
  for(const p of plaintext){
    assert(!JSON.stringify(p).includes(secret));
    assert(!Object.hasOwn(p,'id'));
    assert(!Object.hasOwn(p,'fingerprint'));
    assert(!Object.hasOwn(p,'notes'));
    assert(!Object.hasOwn(p,'proxy'));
    assert(!Object.hasOwn(p,'password'));
  }
  const pre=previewTemplates(first.text,password);
  assert.equal(pre.schema,'lhm.agency.preview.v1');
  assert.equal(pre.count,2);
  assert.equal(pre.requiresProxySetup,1);
  assert.deepEqual(pre.browserFamilies,{chromium:1,gecko:1});
  assert(!JSON.stringify(pre).includes('Agency Campaign'));
  assert.throws(()=>open(first.text,'wrong-password'),/Mật khẩu không đúng/);
  assert.throws(()=>open(first.text,'another-strong-pass-2026'),/Mật khẩu không đúng/);
  const tampered={...envelope,payload:envelope.payload.slice(0,-4)+'AAAA'};
  assert.throws(()=>open(JSON.stringify(tampered),password),/sửa đổi|không hợp lệ/);
  assert.throws(()=>open('hello',password),/JSON/);
  assert.throws(()=>open(JSON.stringify({...envelope,format:'LHM-CONFIG-BACKUP-1'}),password),/định dạng/);
  assert.throws(()=>open('x'.repeat(MAX_FILE_BYTES+1),password),/quá lớn/);
  assert.equal(safeStartOrigin('https://abc.test/orders/token?private=yes'),'https://abc.test/');
  assert.equal(safeStartOrigin('http://abc.test/'), 'https://ads.google.com/');
  assert.equal(safeStartOrigin('https://user:pass@abc.test'), 'https://ads.google.com/');
  assert.equal(safeStartOrigin('file:///etc/passwd'),'https://ads.google.com/');
  assert.throws(()=>exportSelectedTemplates(source,[],password),/1 đến 50/);
  assert.throws(()=>exportSelectedTemplates(source,['missing'],password),/không còn tồn tại/);
  assert.throws(()=>exportSelectedTemplates(source,[p1.id],'weak'),/12–512/);

  const target=new Store(path.join(root,'target'));
  const originalId=target.saveProfile({name:'Existing profile',proxy:{type:'direct'}}).id;
  const before=fs.readFileSync(target.dbFile);
  const failLicense={assertCapacity(){throw Error('LICENSE CAPACITY REFUSED')}};
  target.licensePolicy=failLicense;
  assert.throws(()=>importTemplates(target,first.text,password),/LICENSE CAPACITY REFUSED/);
  assert.deepEqual(fs.readFileSync(target.dbFile),before);
  target.licensePolicy=null;
  const data=importTemplates(target,first.text,password);
  assert.deepEqual(data,{created:2,needsProxySetup:1,sessionsImported:0,
    credentialsImported:0,identityImported:0});
  const post=target.getProfiles();
  assert.equal(post.length,3);
  assert(post.some(p=>p.id===originalId));
  const a=post.find(p=>p.name.startsWith('Agency Campaign A'));
  const b=post.find(p=>p.name.startsWith('Agency Campaign B'));
  assert(a&&b);
  assert.notEqual(a.id,p1.id);
  assert.notEqual(b.id,p2.id);
  assert.equal(a.startUrl,'https://shop.example.com/');
  assert.equal(a.proxy.type,'direct');
  assert.deepEqual(a.fingerprint,{mode:'native'});
  assert.equal(a.notes,'');
  assert.equal(b.requiresProxySetup,true);
  assert.equal(b.proxy.type,'direct');
  assert.equal(b.engine_type,'firefox');
  assert.deepEqual(b.fingerprint,{mode:'native'});
  assert(!fs.existsSync(path.join(target.baseDir,'profiles',a.id,'Default','Network','Cookies')));
  assert(!JSON.stringify(post).includes(secret));
  assert(!JSON.stringify(post).includes('proxy.secret.internal'));
  assert(!JSON.stringify(post).includes(p1.id));
  assert(!JSON.stringify(post).includes(p2.id));

  const beforeRollback=fs.readFileSync(target.dbFile);
  const oldSave=target.saveData;
  target.saveData=()=>{throw Error('SYNTHETIC DISK ERROR')};
  assert.throws(()=>importTemplates(target,first.text,password),/SYNTHETIC DISK ERROR/);
  target.saveData=oldSave;
  assert.deepEqual(fs.readFileSync(target.dbFile),beforeRollback);
  assert.equal(target.getProfiles().length,3);

  const forged=seal({schema:'lhm.agency.templates.v1',templates:[
    {name:'Forged',group:'Fake',engine:'chromium',startUrl:'https://evil.test/',
     tags:[],requiresProxySetup:false,session:{cookie:secret}}]},password);
  assert.throws(()=>open(forged,password),/cấu trúc không hợp lệ/);
  const rootRepo=path.resolve(__dirname,'..');
  const main=fs.readFileSync(path.join(rootRepo,'main.js'),'utf8');
  const preload=fs.readFileSync(path.join(rootRepo,'preload.js'),'utf8');
  const html=fs.readFileSync(path.join(rootRepo,'src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(rootRepo,'src/ui/controlTower.js'),'utf8');
  const css=fs.readFileSync(path.join(rootRepo,'src/ui/agencyHandoff.css'),'utf8');
  for(const x of ['agency-handoff-export','agency-handoff-import-preview','agency-handoff-import-commit'])
    assert(main.includes("'"+x+"'"));
  assert(main.includes("confirmation!=='IMPORT_NEW_TEMPLATES'"));
  assert(main.includes('10*60*1000'));
  assert(main.includes('pendingAgencyHandoff=null'));
  for(const m of ['agencyHandoffExport','agencyHandoffPreview','agencyHandoffCommit'])
    assert(preload.includes(m)&&ui.includes('api.'+m+'('));
  for(const id of ['tower-agency-password','tower-agency-export','tower-agency-preview','tower-agency-commit','tower-agency-status'])
    assert(html.includes('id="'+id+'"'));
  assert(html.includes('type="password" id="tower-agency-password"'));
  assert(html.includes('href="agencyHandoff.css"'));
  assert(!ui.includes('innerHTML'),'Do not inject imported metadata into HTML');
  assert(css.includes('.lhm-agency-fields'));
  console.log('LHM Agency Handoff: AES-256-GCM authenticity, metadata filtering, 2-machine import, no sessions, rollback, license and UI PASS');
} finally{fs.rmSync(root,{recursive:true,force:true});}
