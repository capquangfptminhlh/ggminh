'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const {classifySnapshot}=require('../stage0-measure/localstorage-snapshot');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-snapshot-test-'));
(async()=>{
let child,childExit;
try{
 const file=path.join(root,'data.sqlite'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE data (key TEXT PRIMARY KEY, conversion_type INTEGER, compression_type INTEGER, value BLOB)');
 db.prepare('INSERT INTO data VALUES (?, ?, ?, ?)').run('stage0_lab_marker',1,0,Buffer.from('sample-last'));
 db.close();
 assert.equal(classifySnapshot(file,['sample-old','sample-last'],'prior').status,'last');
 assert.equal(classifySnapshot(file,['sample-last','sample-new'],'prior').status,'earlierInBatch');
 assert.equal(classifySnapshot(file,['other'],'sample-last').status,'previousSample');
 assert.equal(classifySnapshot(path.join(root,'absent.sqlite'),['other'],'prior').status,'missing');
 const script=`const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]);
 db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA cache_size=1; BEGIN IMMEDIATE');
 db.prepare('UPDATE data SET value=? WHERE key=?').run(Buffer.alloc(1024*1024,65),'stage0_lab_marker');
 console.log('READY');setInterval(()=>{},1000);`;
 child=spawn(process.execPath,['-e',script,file],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 childExit=new Promise(resolve=>child.once('exit',resolve));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('SQLite fixture timed out')),15000);
  let output='';
  child.stdout.on('data',data=>{output+=String(data);if(output.includes('READY')){clearTimeout(timer);resolve()}});
  child.once('error',error=>{clearTimeout(timer);reject(error)});
  child.once('exit',code=>{if(code!==null){clearTimeout(timer);reject(Error('SQLite fixture exited early'))}});
 });
 child.kill('SIGKILL');await childExit;
 const journal=file+'-journal';
 assert(fs.existsSync(journal),'Synthetic hot journal was not created');
 const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const before=[digest(file),digest(journal)];
 const readonly=path.join(root,'readonly');fs.mkdirSync(readonly);
 const copy=path.join(readonly,'data.sqlite');fs.copyFileSync(file,copy);fs.copyFileSync(journal,copy+'-journal');
 assert.throws(()=>{const old=new DatabaseSync(copy,{readOnly:true});
  try{old.prepare('SELECT value FROM data').all()}finally{old.close()}},/readonly|read-only|attempt to write/i,
  'Fixture must reproduce the read-only hot-journal failure');
 assert.equal(classifySnapshot(file,['sample-last','sample-new'],'prior').status,'earlierInBatch');
 assert.deepEqual([digest(file),digest(journal)],before,'Original synthetic database and journal must not be changed');
 console.log('Synthetic SQLite snapshot classifies committed values without disclosing them: PASS');
}finally{
 if(child&&child.exitCode===null&&child.signalCode===null){
  child.kill('SIGKILL');
  const stopped=await Promise.race([childExit.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),10000))]);
  if(!stopped)throw Error('Synthetic SQLite process did not exit; fixture retained');
 }
 fs.rmSync(root,{recursive:true,force:true});
}
})().catch(error=>{console.error(error);process.exitCode=1});
