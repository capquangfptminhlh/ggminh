'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path'),os=require('node:os');const {checkEnvelope}=require('../src/ops/snapshotPortability');
const password='synthetic-long-password',id='snap_'+'1'.repeat(24),profileId='synthetic',engine='camoufox',salt=Buffer.alloc(16,1),nonce=Buffer.alloc(12,2),key=crypto.pbkdf2Sync(password,salt,220000,32,'sha256'),info={profileId,engine,directory:path.join(os.tmpdir(),'lhm-base64-test')};
function envelope(data){const value={files:[{path:'file',data}],bytes:Buffer.from(data,'base64').length};const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('LHM-SESSION-1:'+id+':'+profileId+':'+engine));const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({format:'LHM-SESSION-1',id,profileId,engine,salt:salt.toString('base64'),nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:payload.toString('base64')});}
for(const good of ['','YQ==','YWI=','YWJj'])assert.equal(checkEnvelope(info,envelope(good),password).files,1);
for(const bad of ['A','YQ=','YQ==\n','YR==','YWJj_','!!!!'])assert.throws(()=>checkEnvelope(info,envelope(bad),password),/định dạng/);
console.log('Snapshot recovery rejects invalid and noncanonical base64: PASS');
