'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fontReviewPaths}=require('../src/ops/fontReviewCiGuard');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-font-ci-guard-'));
try{
 const data=path.join(root,'data'),valid={GITHUB_ACTIONS:'true',RUNNER_TEMP:root,
  LHM_CI_INSTALL_ACCEPTANCE:'1',LHM_CI_ACCEPTANCE_USER_DATA_DIR:data};
 const paths=fontReviewPaths(valid,data);
 assert.equal(paths.userData,data);assert.equal(paths.downloads,path.join(data,'downloads'));
 for(const env of [{},{...valid,GITHUB_ACTIONS:'false'},{...valid,LHM_CI_INSTALL_ACCEPTANCE:'0'},
  {...valid,LHM_CI_UI_CAPTURE:'1'},{...valid,LHM_CAMOUFOX_INTERNAL:'1'},
  {...valid,LHM_CI_ACCEPTANCE_USER_DATA_DIR:path.join(root,'..','outside')}])
  assert.throws(()=>fontReviewPaths(env,data),/CI|preview|acceptance/i);
 assert.throws(()=>fontReviewPaths(valid,''),/user-data-dir/i);
 assert.throws(()=>fontReviewPaths(valid,path.join(root,'other')),/user-data-dir/i);
 const target=path.join(root,'target'),link=path.join(root,'link');fs.mkdirSync(target);fs.symlinkSync(target,link,'junction');
 assert.throws(()=>fontReviewPaths({...valid,LHM_CI_ACCEPTANCE_USER_DATA_DIR:path.join(link,'data')},path.join(link,'data')),/link/i);
 fs.mkdirSync(data);fs.symlinkSync(target,path.join(data,'downloads'),'junction');
 assert.throws(()=>fontReviewPaths(valid,data),/link/i);
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const pkg=require('../package.json');
 assert.equal(pkg.build.appId,'vn.lhm.adsbrowser.fontreview.ci','experimental installer must not share app identity');
 assert.equal(pkg.build.productName,'LHM Font Review CI','experimental app must have distinct default userData');
 const guard=main.indexOf("fontReviewPaths(process.env,app.commandLine.getSwitchValue('user-data-dir'))"),ready=main.indexOf('app.whenReady()');
 assert(guard>=0&&guard<ready,'CI-only guard must run before Electron ready');
 assert(main.includes('const downloadsRoot = fontReviewPaths(process.env,app.commandLine.getSwitchValue(\'user-data-dir\')).downloads'),'downloads must use isolated CI data');
 console.log('Font-review app requires isolated CI userData and downloads: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
