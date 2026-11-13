'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ci-install-isolation-'));
try{
 const {resolveCiAcceptanceUserData}=require('../src/ops/ciAcceptancePath');
 const userData=path.join(root,'acceptance','user-data');
 assert.strictEqual(resolveCiAcceptanceUserData({
  enabled:'1',githubActions:'true',runnerTemp:root,override:userData
 }),path.resolve(userData));
 for(const options of [
  {enabled:'0',githubActions:'true',runnerTemp:root,override:userData},
  {enabled:'1',githubActions:'false',runnerTemp:root,override:userData},
  {enabled:'1',githubActions:'true',runnerTemp:root,override:'relative'},
  {enabled:'1',githubActions:'true',runnerTemp:root,override:root},
  {enabled:'1',githubActions:'true',runnerTemp:root,
   override:path.join(root,'..','outside')}
 ]) assert.throws(()=>resolveCiAcceptanceUserData(options),/acceptance|runner|path/i);

 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const setPath=main.indexOf("app.setPath('userData', ciAcceptanceUserData)");
 const ready=main.indexOf('app.whenReady()');
 assert(setPath>=0&&setPath<ready,
  'CI install acceptance must set userData before Electron ready');
 const runner=fs.readFileSync(path.join(__dirname,'..','tools',
  'run-windows-clean-install-acceptance.ps1'),'utf8');
 for(const token of ['--user-data-dir=','LHM_CI_INSTALL_ACCEPTANCE',
  'LHM_CI_ACCEPTANCE_USER_DATA_DIR',"Environment['TEMP']=$TempData",
  "Environment['TMP']=$TempData"])
  assert(runner.includes(token),`runner missing ${token}`);
 console.log('CI installed-app acceptance userData isolation PASS');
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}
