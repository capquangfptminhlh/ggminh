'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {classifySnapshot}=require('../stage0-measure/localstorage-snapshot');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-snapshot-test-'));
try{
 const file=path.join(root,'data.sqlite'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE data (key TEXT PRIMARY KEY, conversion_type INTEGER, compression_type INTEGER, value BLOB)');
 db.prepare('INSERT INTO data VALUES (?, ?, ?, ?)').run('stage0_lab_marker',1,0,Buffer.from('sample-last'));
 db.close();
 assert.equal(classifySnapshot(file,['sample-old','sample-last'],'prior').status,'last');
 assert.equal(classifySnapshot(file,['sample-last','sample-new'],'prior').status,'earlierInBatch');
 assert.equal(classifySnapshot(file,['other'],'sample-last').status,'previousSample');
 assert.equal(classifySnapshot(path.join(root,'absent.sqlite'),['other'],'prior').status,'missing');
 console.log('Synthetic SQLite snapshot classifies committed values without disclosing them: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
