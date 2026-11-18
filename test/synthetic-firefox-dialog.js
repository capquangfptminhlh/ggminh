'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareSyntheticFirefoxProfile,prepareFixtureRoot,writeFixtureReport}=require('../tools/synthetic-firefox-fixture');
const {applyGeckoIdentityPrefs,updateGeckoProxy}=require('../src/engine/geckoProxy');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-synthetic-pref-test-'));
try{
 const app=path.join(root,'app'),id='pb_0123456789ab',profile=path.join(app,'gecko-profiles',id);
 fs.mkdirSync(app);fs.writeFileSync(path.join(root,'fixture.marker'),'token',{flag:'wx'});
 assert.equal(prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:id,markerToken:'token'}),profile);
 const prefs=path.join(profile,'user.js');assert.equal(fs.readFileSync(prefs,'utf8'),'user_pref("privacy.spoof_english", 1);\n');
 updateGeckoProxy(profile,{type:'direct'});applyGeckoIdentityPrefs(profile,{});
 assert.match(fs.readFileSync(prefs,'utf8'),/user_pref\("privacy\.spoof_english", 1\);/);
 assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:id,markerToken:'token'}));
 assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:'../../x',markerToken:'token'}));
 assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:'pb_111111111111',markerToken:'wrong'}));
 assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:root,profileId:id,markerToken:'token'}));
 assert(!fs.existsSync(path.join(app,'profiles')));
 assert.throws(()=>prepareFixtureRoot(root),'Existing evidence must not be overwritten');
 assert.equal(fs.readFileSync(path.join(root,'fixture.marker'),'utf8'),'token');
 const evidenceDir=path.join(root,'evidence');fs.mkdirSync(evidenceDir);
 const evidence=path.join(evidenceDir,'storage-isolation-report.json');fs.writeFileSync(evidence,'old report');
 assert.throws(()=>prepareFixtureRoot(evidenceDir));assert.equal(fs.readFileSync(evidence,'utf8'),'old report');
 const empty=path.join(root,'fresh');assert.equal(prepareFixtureRoot(empty),empty);
 const savedReport=path.join(empty,'test-report.json');writeFixtureReport(savedReport,{value:1});
 assert.throws(()=>writeFixtureReport(savedReport,{value:2}));assert.equal(JSON.parse(fs.readFileSync(savedReport)).value,1);
 if(process.platform==='win32')assert.throws(()=>prepareFixtureRoot('\\\\server\\share\\output'));
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-synthetic-outside-'));
 try{
  const linked=path.join(root,'restored');fs.symlinkSync(outside,linked,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:linked,profileId:'pb_111111111111',markerToken:'token'}));
  assert(!fs.existsSync(path.join(outside,'gecko-profiles')),'Fixture must not write through junction');
  fs.unlinkSync(linked);
  const marker=path.join(root,'fixture.marker');fs.unlinkSync(marker);
  const outsideMarker=path.join(outside,'marker');fs.writeFileSync(outsideMarker,'token');
  try{
   fs.symlinkSync(outsideMarker,marker,'file');
   assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:'pb_333333333333',markerToken:'token'}));
   assert(!fs.existsSync(path.join(app,'gecko-profiles','pb_333333333333')));
  }catch(error){if(error.code!=='EPERM')throw error}
  finally{if(fs.existsSync(marker))fs.unlinkSync(marker);fs.writeFileSync(marker,'token',{flag:'wx'})}
  fs.unlinkSync(marker);fs.linkSync(outsideMarker,marker);
  assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:root,appRoot:app,profileId:'pb_444444444444',markerToken:'token'}));
  fs.unlinkSync(marker);fs.writeFileSync(marker,'token',{flag:'wx'});
  const alias=path.join(outside,'fixture-link');fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>prepareSyntheticFirefoxProfile({fixtureRoot:alias,appRoot:path.join(alias,'app'),profileId:'pb_222222222222',markerToken:'token'}));
  assert.throws(()=>prepareFixtureRoot(alias));
  assert(!fs.existsSync(path.join(app,'gecko-profiles','pb_222222222222')));
 }finally{fs.rmSync(outside,{recursive:true,force:true})}
 console.log('Synthetic Firefox pref remains scoped to fresh isolated fixture: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true})}
