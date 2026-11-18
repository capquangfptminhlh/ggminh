'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {WorkflowStore}=require('../src/automation/studio');
const {ConfigBackup,encrypt,decrypt}=require('../src/backup/configBackup');
const password='strong backup passphrase 2026';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-backup-transaction-'));
try {
  const store=new Store(dir),workflows=new WorkflowStore(dir);
  const profile=store.saveProfile({name:'Source',startUrl:'https://example.com/'});
  workflows.save({name:'QA workflow',profileId:profile.id,hosts:'example.com',
    steps:[{type:'navigate',url:'https://example.com/'},
      {type:'approval',label:'Review'},{type:'fill',selector:'#name',value:'SENSITIVE_INPUT'}]});
  store.saveProfile({name:'Auth source',proxy:{type:'http',host:'proxy.example',port:8080,
    authProxyId:'px_0123456789abcdef'}});
  const backup=new ConfigBackup(store,workflows);
  const staleWorkflowStore=new WorkflowStore(dir);
  workflows.save({...workflows.list()[0],name:'Updated QA workflow'});
  assert.throws(()=>staleWorkflowStore.save({name:'Stale writer',profileId:profile.id,hosts:'example.com',
    steps:[{type:'navigate',url:'https://example.com/'}]}),/WORKFLOW_CONFLICT/);
  const sealed=backup.export(password);
  const preview=backup.inspect(sealed,password);
  assert.strictEqual(preview.profiles,2);
  assert.strictEqual(preview.workflows,1);
  assert.strictEqual(preview.requiresProxySetup,1);
  const payload=decrypt(sealed,password);
  assert(!JSON.stringify(payload).includes('SENSITIVE_INPUT'));
  assert(!JSON.stringify(payload).includes('px_0123456789abcdef'));
  const sourceBytes=()=>[fs.readFileSync(store.dbFile,'utf8'),
    fs.readFileSync(workflows.file,'utf8'),
    JSON.stringify(store.data),JSON.stringify(workflows.items)];
  const before=sourceBytes();
  const invalid=structuredClone(payload);
  invalid.profiles[1].name='';
  assert.throws(()=>backup.import(encrypt(invalid,password),password),/Profile name/);
  assert.deepStrictEqual(sourceBytes(),before);
  const realSaveData=store.saveData;
  const concurrentWorkflow='external concurrent workflow';
  store.saveData=()=>{fs.writeFileSync(workflows.file,concurrentWorkflow);throw Error('STORE_CONFLICT')};
  assert.throws(()=>backup.import(sealed,password),/STORE_CONFLICT/);
  assert.equal(fs.readFileSync(workflows.file,'utf8'),concurrentWorkflow);
  store.saveData=realSaveData;
  fs.writeFileSync(workflows.file,before[1]);
  const badWorkflow=structuredClone(payload);
  badWorkflow.workflows[0].steps.push({type:'click',selector:''});
  assert.throws(()=>backup.import(encrypt(badWorkflow,password),password),/CSS selector/);
  assert.deepStrictEqual(sourceBytes(),before);
  const persist=workflows.persist;
  const foreign=path.join(dir,'synthetic-foreign-file'),legacyRollback=store.dbFile+'.rollback-'+process.pid;
  fs.writeFileSync(foreign,'preserve outside data');fs.linkSync(foreign,legacyRollback);
  workflows.persist=()=>{throw Error('SIMULATED_WRITE_FAILURE')};
  assert.throws(()=>backup.import(sealed,password),/SIMULATED_WRITE_FAILURE/);
  assert.equal(fs.readFileSync(foreign,'utf8'),'preserve outside data','Rollback must not overwrite a pre-existing hardlink');
  fs.unlinkSync(legacyRollback);
  assert.deepStrictEqual(sourceBytes(),before);
  workflows.persist=persist;
  workflows.persist=()=>{fs.writeFileSync(workflows.file,'concurrent change during persist');throw Error('SIMULATED_WRITE_FAILURE')};
  assert.throws(()=>backup.import(sealed,password),/hoàn tác|SIMULATED_WRITE_FAILURE/);
  assert.equal(fs.readFileSync(workflows.file,'utf8'),'concurrent change during persist');
  fs.writeFileSync(workflows.file,before[1]);
  workflows.persist=persist;
  const result=backup.import(sealed,password);
  assert.deepStrictEqual(result,{profiles:2,workflows:1,excludesSessions:true});
  assert.strictEqual(store.getProfiles().length,4);
  assert.strictEqual(workflows.list().length,2);
  const imported=store.getProfiles().find(p=>p.name==='Auth source (nhập)');
  assert(imported && imported.requiresProxySetup===true);
  assert.deepStrictEqual(imported.proxy,{type:'direct'});
  assert(!fs.existsSync(path.join(dir,'profiles',imported.id)));
  const newFlow=workflows.list().find(w=>w.profileId!==profile.id);
  assert(newFlow && newFlow.steps[2].value==='');
  console.log('Backup 3.0: inspect, redaction, prevalidation and rollback passed');
}finally {fs.rmSync(dir,{recursive:true,force:true});}
