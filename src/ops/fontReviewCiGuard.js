'use strict';
const path=require('node:path');
const {resolveCiAcceptanceUserData}=require('./ciAcceptancePath');
function fontReviewPaths(env={},earlyUserData=''){
 if(env.LHM_CI_UI_CAPTURE==='1'||env.LHM_CAMOUFOX_INTERNAL==='1')
  throw Error('Font-review CI preview cannot share other preview modes');
 const userData=resolveCiAcceptanceUserData({enabled:env.LHM_CI_INSTALL_ACCEPTANCE,
  githubActions:env.GITHUB_ACTIONS,runnerTemp:env.RUNNER_TEMP,override:env.LHM_CI_ACCEPTANCE_USER_DATA_DIR});
 const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
 if(typeof earlyUserData!=='string'||!path.isAbsolute(earlyUserData)||normalize(earlyUserData)!==normalize(userData))
  throw Error('Font-review CI requires matching early --user-data-dir');
 const downloads=resolveCiAcceptanceUserData({enabled:env.LHM_CI_INSTALL_ACCEPTANCE,
  githubActions:env.GITHUB_ACTIONS,runnerTemp:env.RUNNER_TEMP,override:path.join(userData,'downloads')});
 return {userData,downloads};
}
module.exports={fontReviewPaths};
