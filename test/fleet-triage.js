'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildFleetTriage,groupFor,ACTIONS}=require('../src/ops/fleetTriage');

assert.equal(groupFor('proxy_credential_missing'),'proxy');
assert.equal(groupFor('browser_missing'),'browser');
assert.equal(groupFor('signal_timezone_mismatch'),'signal');
assert.equal(groupFor('invalid_starturl'),'starturl');
assert.equal(groupFor('ua_outdated'),'identity');
assert.equal(groupFor('no_name'),'profile');
assert.equal(groupFor('../../CUSTOMER_PRIVATE_SECRET'),'other');
assert.equal(groupFor(null),'other');
assert.throws(()=>buildFleetTriage('wrong',[],[]),/Invalid/);
assert.throws(()=>buildFleetTriage([],[],[],{limit:8}),/Invalid/);
assert.equal(buildFleetTriage([],[],[]).checked,0);

const privateName='PRIVATE_CUSTOMER_JOHN_NAME';
const privateUrl='https://example.com/sensitive?access_token=SECRET_123';
const profiles=Array.from({length:1000},(_,i)=>({
  id:'profile_'+i,name:privateName+'_'+i,
  startUrl:privateUrl,proxy:{host:'sensitive.proxy.internal',password:'SECRET_123'}
}));
const reports=profiles.map((p,i)=>{
  const issues=i%3===0?[
    {code:'proxy_credential_missing',level:'error',message:'SECRET_123 private proxy'},
    {code:'proxy_invalid',level:'warning',message:privateUrl}
  ]:i%3===1?[
    {code:'ua_outdated',level:'warning',message:'CUSTOMER_PRIVATE'},
    {code:'signal_locale_mismatch',level:'warning',message:privateUrl}
  ]:[];
  return {profileId:p.id,status:i%3===0?'error':i%3===1?'warning':'ready',issues};
});
const active=Array.from({length:20},(_,i)=>({profileId:'profile_'+i}));
const beforeProfiles=JSON.stringify(profiles),beforeReports=JSON.stringify(reports);
const result=buildFleetTriage(profiles,reports,active);
assert.equal(result.schema,'lhm.fleet.triage.v1');
assert.equal(result.profileCount,1000);
assert.equal(result.checked,1000);
assert.equal(result.error,334);
assert.equal(result.warning,333);
assert.equal(result.ready,333);
assert.equal(result.unexamined,0);
assert.equal(result.activeCount,20);
assert.equal(result.items.length,3);
assert.equal(result.items[0].code,'proxy');
assert.equal(result.items[0].affected,334);
assert.equal(result.items[0].blocking,334);
assert.equal(result.items[0].review,0);
assert.equal(result.items[0].action,'proxy');
assert.equal(result.items[1].code,'signal');
assert(result.items.every(i=>Object.hasOwn(ACTIONS,i.code)));
assert.equal(result.networkRequests,0);
assert.equal(result.mutations,0);
const serialized=JSON.stringify(result);
for(const secret of [privateName,privateUrl,'SECRET_123','sensitive.proxy','profile_10'])
  assert(!serialized.includes(secret),'Fleet triage must not export profile data: '+secret);
assert.equal(JSON.stringify(profiles),beforeProfiles);
assert.equal(JSON.stringify(reports),beforeReports);

const duplicated=buildFleetTriage(profiles.slice(0,1),[
 {profileId:'profile_0',status:'error',issues:[
  {code:'browser_missing',level:'error',message:'x'},
  {code:'browser_missing',level:'error',message:'y'}]},
 {profileId:'profile_0',status:'error',issues:[
  {code:'proxy_invalid',level:'error',message:'z'}]},
 {profileId:'unknown',status:'error',issues:[{code:'proxy_invalid',level:'error'}]}
]);
assert.equal(duplicated.checked,1);
assert.equal(duplicated.items.length,1);
assert.equal(duplicated.items[0].affected,1);
assert.equal(duplicated.items[0].action,'engines');
assert.equal(duplicated.unexamined,0);

const baseline=buildFleetTriage(profiles.slice(0,2),reports.slice(0,1),active);
assert.equal(baseline.unexamined,1);
assert.equal(baseline.activeCount,2);
assert.equal(baseline.checked,1);
const unknown=buildFleetTriage([{id:'x'}],[{profileId:'x',status:'warning',
 issues:[{code:'token_SECRET',level:'warning',message:'PRIVATE'}]}]);
assert.equal(unknown.items[0].code,'other');
assert(!JSON.stringify(unknown).includes('token_SECRET'));
assert(!JSON.stringify(unknown).includes('PRIVATE'));

const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'src/ui/controlTower.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/fleetTriage.css'),'utf8');
assert(main.includes("ipcMain.handle('control-tower-triage'"));
assert(main.includes('buildFleetTriage(profiles,health,launcher.listActive())'));
assert(preload.includes('controlTowerTriage'));
for(const id of ['tower-triage-list','tower-triage-refresh','tower-triage-status'])
 assert(html.includes('id="'+id+'"'));
assert(html.includes('href="fleetTriage.css"'));
assert(script.includes('api.controlTowerTriage()'));
assert(script.includes('window.LHMMaintenance?.showHealth()'));
assert(script.includes('btn-proxy-center'));
assert(script.includes('btn-engine-source'));
assert(!script.includes('innerHTML'));
assert(css.includes('.lhm-triage-item'));
assert(main.includes("'workspace-fleet-triage-preview.png'"));
console.log('LHM Fleet Triage: 1,000 real-metadata fixtures, privacy-safe category aggregation, remediations and UI wiring PASS');
