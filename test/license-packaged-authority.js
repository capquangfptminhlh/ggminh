'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveLicenseEndpoint,validateConfig,EXPECTED,SCHEMA}=require('../src/licensing/authorityConfig');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-authority-bundle-'));
try{
 const dir=path.join(base,'lhm-license-authority');
 fs.mkdirSync(dir);
 const file=path.join(dir,'authority.json');
 const resolve=(developmentEndpoint='https://attacker.invalid/v1/verify')=>
  resolveLicenseEndpoint({packaged:true,resourcesPath:base,developmentEndpoint});
 const disabled={schema:SCHEMA,enabled:false,endpoint:null};
 const enabled={schema:SCHEMA,enabled:true,endpoint:EXPECTED};
 assert.equal(validateConfig(disabled),null);
 assert.equal(validateConfig(enabled),EXPECTED);
 assert.equal(resolve(),null,'Missing Preview config must not route customer license');
 fs.writeFileSync(file,JSON.stringify(disabled));
 assert.equal(resolve(),null,'Disabled Preview must not route license even with attacker environment');
 fs.writeFileSync(file,JSON.stringify(enabled));
 assert.equal(resolve(),EXPECTED,'Owner-approved bundle should route to fixed HTTPS endpoint');
 for(const candidate of [
  {...enabled,endpoint:'https://attacker.invalid/v1/verify'},
  {...enabled,endpoint:'http://browser.lhmcrm.com/v1/verify'},
  {...enabled,endpoint:'https://browser.lhmcrm.com.evil.test/v1/verify'},
  {...enabled,endpoint:'https://browser.lhmcrm.com/v1/verify?token=leak'},
  {...enabled,extra:'unreviewed'},
  {...enabled,schema:'bad'},
  {schema:SCHEMA,enabled:false,endpoint:EXPECTED}
 ]){
  assert.throws(()=>validateConfig(candidate),/Invalid|must use|must have/);
 }
 fs.writeFileSync(file,'{');
 assert.throws(resolve,/Malformed/);
 fs.writeFileSync(file,'x'.repeat(1100));
 assert.throws(resolve,/Unsafe/);
 fs.writeFileSync(file,JSON.stringify(enabled));
 const badRoot=path.join(base,'bad');
 fs.mkdirSync(path.join(badRoot,'lhm-license-authority'),{recursive:true});
 if(process.platform!=='win32'){
  fs.symlinkSync(file,path.join(badRoot,'lhm-license-authority','authority.json'));
  assert.throws(()=>resolveLicenseEndpoint({packaged:true,resourcesPath:badRoot}),/Unsafe/);
 }
 assert.equal(resolveLicenseEndpoint({packaged:false,
  developmentEndpoint:'https://internal.vendor.example/v1/verify'}),
 'https://internal.vendor.example/v1/verify','Development-only explicit URL preserved');
 assert.throws(()=>resolveLicenseEndpoint({packaged:false,
  developmentEndpoint:'http://evil.example/v1/verify'}),/HTTPS/);
 const pkg=require('../package.json');
 const bundle=pkg.build.extraResources.find(x=>x.to==='lhm-license-authority');
 assert(bundle&&bundle.from==='resources/license-authority');
 const publicDefault=JSON.parse(fs.readFileSync(path.join(__dirname,'../resources/license-authority/authority.json'),'utf8'));
 assert.equal(validateConfig(publicDefault),null,'Committable Preview must be unconfigured');
 const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 assert(main.includes('resolveLicenseEndpoint({'));
 assert(main.includes('packaged:app.isPackaged'));
 assert(main.includes('resourcesPath:process.resourcesPath'));
 console.log('Packaged license authority: disabled Preview, strict hostname, symlink/size rejection, no env override PASS');
}finally{
 fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
