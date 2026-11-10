'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {setupPreviewIssuer}=require('../tools/setup-preview-license-issuer');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-preview-issuer-'));
const passphrase='preview-test-passphrase-32-bytes';
try{
 const result=setupPreviewIssuer(root,{passphrase});
 assert.strictEqual(crypto.createPublicKey(result.publicKey).asymmetricKeyType,'ed25519');
 assert.match(result.spkiBase64,/^[A-Za-z0-9+/=]+$/);
 assert.match(result.spkiSha256,/^[a-f0-9]{64}$/);
 const encrypted=fs.readFileSync(result.privateKeyFile,'utf8');
 assert.throws(()=>crypto.createPrivateKey(encrypted));
 assert.throws(()=>crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:'wrong-passphrase'}));
 const privateKey=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase});
 const message=Buffer.from('preview-license-issuer-test');
 const signature=crypto.sign(null,message,privateKey);
 assert(crypto.verify(null,message,result.publicKey,signature));
 assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/already exists/);
 console.log('Preview issuer bootstrap: encrypted Ed25519 key, public metadata and overwrite refusal PASS');
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}
