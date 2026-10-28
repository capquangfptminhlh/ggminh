'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {prepareGoogleStagingPackage,TRUST,BUILDER,ALLOW,ORIGIN}
 =require('../tools/prepare-google-staging-package');
const {assertPreviewBuild}=require('../tools/assert-preview-build');
const {assertGoogleStagingPackage}=require('../tools/assert-google-staging-package');
const sourceConfig=fs.readFileSync('src/licensing/googleStagingConfig.js','utf8');
const pkg=require('../package.json');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-gmail-packaged-'));
try{
 const key=crypto.generateKeyPairSync('ed25519');
 const publicDer=key.publicKey.export({format:'der',type:'spki'});
 const publicSpkiB64=publicDer.toString('base64');
 const fingerprint=crypto.createHash('sha256').update(publicDer).digest('hex');
 const conf={root,publicKeyB64:publicSpkiB64,confirmation:ALLOW,
  expectedSha256:fingerprint,packageBuild:pkg.build};
 assert.equal(assertPreviewBuild(root),true);
 assert.throws(()=>prepareGoogleStagingPackage({...conf,confirmation:'false'}),/authorization/);
 assert.throws(()=>prepareGoogleStagingPackage({...conf,
   expectedSha256:'f'.repeat(64)}),/fingerprint mismatch/);
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 assert.throws(()=>prepareGoogleStagingPackage({...conf,
   publicKeyB64:rsa.publicKey.export({format:'der',type:'spki'}).toString('base64'),
   expectedSha256:undefined}),/Ed25519/);
 const output=prepareGoogleStagingPackage(conf);
 assert.equal(output.publicSpkiSha256,fingerprint);
 assert.equal(output.appId,'vn.lhm.adsbrowser.gmailstaging');
 assert.equal(assertGoogleStagingPackage(root),true);
 assert.throws(()=>assertPreviewBuild(root),/Refusing to package Preview/);
 assert.throws(()=>prepareGoogleStagingPackage(conf),/refusing overwrite/);
 const trust=fs.readFileSync(path.join(root,TRUST),'utf8');
 const builder=JSON.parse(fs.readFileSync(path.join(root,BUILDER),'utf8'));
 assert(trust.includes(publicSpkiB64));
 assert(!trust.includes(key.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')));
 assert(!trust.includes('BROWSER_SAAS_ADMIN_TOKEN'));
 assert(!trust.includes('BROWSER_GOOGLE_CLIENT_SECRET'));
 assert.equal(builder.productName,'LHM Ads Browser Gmail Staging');
 assert.notEqual(builder.appId,pkg.build.appId);
 assert.notEqual(builder.directories.output,pkg.build.directories.output);
 assert(builder.nsis.artifactName.startsWith('LHM-Ads-Browser-Gmail-Staging-'));
 assert(builder.nsis.artifactName.includes('${version}'));
 assert(builder.files.includes('**/*'));
 const dir=path.join(root,'src/licensing');
 fs.mkdirSync(dir,{recursive:true});
 const loadFile=path.join(dir,'googleStagingConfig.js');
 fs.writeFileSync(loadFile,sourceConfig);
 const load=()=>{delete require.cache[require.resolve(loadFile)];
  return require(loadFile).loadGoogleStagingConfig({packaged:true,env:{
   LHM_GOOGLE_BROWSER_STAGING:'1',LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE:'/untrusted.pem'}});};
 const config=load();
 assert.equal(config.mode,'google-saas-packaged-staging');
 assert.equal(config.apiOrigin,ORIGIN);
 assert.equal(config.publicSpkiSha256,fingerprint);
 assert.equal(config.publicKey.asymmetricKeyType,'ed25519');
 const tampered=trust.replace(fingerprint,'0'.repeat(64));
 fs.writeFileSync(path.join(root,TRUST),tampered);
 delete require.cache[require.resolve(path.join(root,TRUST))];
 assert.throws(load,/fingerprint mismatch/);
 // Default packaged Preview includes no generated trust and ignores local
 // staging environment variables that would otherwise try to unlock Gmail.
 const clean=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-gmail-preview-'));
 try{
  const nested=path.join(clean,'src/licensing');
  fs.mkdirSync(nested,{recursive:true});
  fs.writeFileSync(path.join(nested,'googleStagingConfig.js'),sourceConfig);
  const preview=require(path.join(nested,'googleStagingConfig.js'));
  assert.equal(preview.loadGoogleStagingConfig({packaged:true,env:{
   LHM_GOOGLE_BROWSER_STAGING:'1',LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE:'/fake.pem'}}),null);
 }finally{fs.rmSync(clean,{recursive:true,force:true});}
 assert.equal(assertPreviewBuild(path.resolve('.')),true,
   'CI/Preview checkout must never accidentally carry Gmail staging trust');
 console.log('PASS: two distinct Windows app identities, no private signer in EXE, fixed public Ed25519 pin, tamper fails closed, normal Preview ignores Gmail env');
}finally{fs.rmSync(root,{recursive:true,force:true});}
