'use strict';
// Constitution §§8/11/23: structural + synthetic behavioral checks.
// These tests never claim Google/Meta detection outcomes or a measured
// DNS/WebRTC/egress route. Production browser Gate 2/3 remains distinct.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('src/ui/index.html'),renderer=read('src/ui/renderer.js');
const style=read('src/ui/styles.css');
const consistency=require('../src/ui/profileConsistency');
const {Store}=require('../src/db/store');
const {validateCamoufoxPreferences}=require('../src/engine/camoufoxPreferences');
const ids=['fp-cap-ua','fp-cap-locale','fp-cap-device','fp-cap-render',
 'fp-cap-network','fp-cap-pin','fp-preview-engine','fp-preview-language',
 'fp-preview-timezone','fp-preview-identity','fp-config-status',
 'field-fp-locale','field-fp-timezone','fp-identity-lock-status',
 'fp-consistency-cards','fp-unmeasured-cards'];
for(const id of ids)
 assert.equal(html.split('id="'+id+'"').length-1,1,id+' must appear exactly once');
assert.ok(style.includes('.fp-capability-grid'));
assert.ok(style.includes('.fp-consistency-grid'));
assert.ok(html.indexOf('<script src="profileConsistency.js">') < html.indexOf('<script src="renderer.js">'),
 'consistency analyzer loads before profile form scripts');
assert.ok(renderer.includes('refreshFingerprintSetup();'));
assert.ok(renderer.includes('LHMProfileConsistency?.render'));
assert.ok(!/bảo đảm.+(?:Google|Facebook).+không/i.test(html));
assert.deepEqual(validateCamoufoxPreferences({
 mode:'native',language:'vi-VN',languages:['vi-VN'],timezone:'Asia/Ho_Chi_Minh'
}),{language:'vi-VN',timezone:'Asia/Ho_Chi_Minh'});
assert.deepEqual(validateCamoufoxPreferences({mode:'native'}),{language:null,timezone:null});
assert.throws(()=>validateCamoufoxPreferences({language:'xx-XX'}),/Unsupported/);
assert.throws(()=>validateCamoufoxPreferences({timezone:'Mars/Olympus'}),/Unsupported/);
assert.throws(()=>validateCamoufoxPreferences({language:'vi-VN',languages:['en-US']}),/disagree/);
const normal=consistency.assess({engine:'chromium',fingerprintMode:'native',proxyType:'direct'});
assert.equal(normal.classification,'PROFILE_CONSISTENCY_DECLARATIVE_ONLY');
assert.equal(normal.platformRiskScore,null);
assert.equal(normal.layer.length,4);
assert.equal(normal.blindspots.length,4);
assert.equal(normal.networkEvidence,'NOT_RUN');
assert.equal(normal.layer[0].state,consistency.STATUS.UNMEASURED);
assert.equal(normal.layer[2].state,consistency.STATUS.MANUAL);
assert.equal(normal.layer[3].state,consistency.STATUS.MANUAL);
assert.equal(normal.layer[1].state,consistency.STATUS.DECLARED);
assert.ok(normal.blindspots.every(x=>[consistency.STATUS.UNMEASURED,consistency.STATUS.MANUAL].includes(x.state)));
const experimental=consistency.assess({engine:'chromium',fingerprintMode:'experimental',proxyType:'http'});
assert.equal(experimental.layer[1].state,consistency.STATUS.WARNING);
assert.ok(experimental.layer[0].detail.includes('Đã khai báo HTTP'));
assert.equal(experimental.layer[0].state,consistency.STATUS.UNMEASURED);
const unprovisioned=consistency.assess({engine:'camoufox',fingerprintMode:'native',proxyType:'socks5',pinned:false});
assert.equal(unprovisioned.layer[1].state,consistency.STATUS.UNMEASURED);
const pinned=consistency.assess({engine:'camoufox',fingerprintMode:'native',pinned:true});
assert.equal(pinned.layer[1].state,consistency.STATUS.DECLARED);
assert.equal(pinned.networkEvidence,'NOT_RUN');
const nodes={};
function node(tag){
 return {tag,textContent:'',className:'',children:[],
  append(...items){this.children.push(...items)},
  replaceChildren(...items){this.children=items}};
}
const fakeDocument={getElementById(id){return nodes[id] ||= node('div')},
 createElement:node};
consistency.render({engine:'camoufox',fingerprintMode:'native',pinned:false},fakeDocument);
assert.equal(nodes['fp-consistency-cards'].children.length,4);
assert.equal(nodes['fp-unmeasured-cards'].children.length,4);
assert.equal(nodes['fp-consistency-cards'].children[0].children[0].children[1].textContent,
 consistency.STATUS.UNMEASURED);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-fingerprint-setup-'));
try{
 const store=new Store(dir);
 const profile=store.saveProfile({name:'Agency A',engine:'gecko',engine_type:'camoufox',
  fingerprint:{mode:'native',language:'vi-VN',languages:['vi-VN'],timezone:'Asia/Ho_Chi_Minh'}});
 assert.equal(profile.fingerprint.language,'vi-VN');
 assert.equal(profile.fingerprint.timezone,'Asia/Ho_Chi_Minh');
 assert.throws(()=>store.saveProfile({name:'Wrong locale',engine:'gecko',engine_type:'camoufox',
  fingerprint:{mode:'native',language:'not-valid'}}),/Unsupported/);
 // Synthetic pin from trusted internal storage (no fake generator/external auth).
 const raw=store.data.profiles.find(x=>x.id===profile.id);
 const fakePin={format:'test-only-pin',env:{CAMOU_CONFIG_1:'synthetic'}};
 raw.fingerprint.identity=fakePin;
 raw.fingerprint.identityProvisioning='provisioned';
 store.saveData();
 const renamed=store.saveProfile({id:profile.id,name:'Agency A renamed',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native'}});
 assert.deepEqual(renamed.fingerprint.identity,fakePin,'renaming cannot clear identity pin');
 assert.equal(renamed.fingerprint.language,'vi-VN');
 assert.equal(renamed.fingerprint.timezone,'Asia/Ho_Chi_Minh');
 assert.equal(renamed.fingerprint.identityProvisioning,'provisioned');
 assert.throws(()=>store.saveProfile({id:profile.id,name:'X',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native',language:'en-US'}}),/đã ghim/);
 assert.throws(()=>store.saveProfile({id:profile.id,name:'X',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native',timezone:'America/New_York'}}),/đã ghim/);
 assert.deepEqual(store.getProfile(profile.id).fingerprint.identity,fakePin);
 const injected=store.saveProfile({name:'No hand-built identity',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native',identity:{env:{CAMOU_CONFIG_1:'forged'}}}});
 assert.equal(injected.fingerprint.identity,undefined);
 // Exercise actual UI helper functions in an isolated VM DOM stub.
 const start=renderer.indexOf('function refreshFingerprintSetup()');
 const mid=renderer.indexOf('function selectedFingerprintConfig()',start);
 const stop=renderer.indexOf('function setFingerprintMode(',mid);
 assert.ok(start>=0&&mid>start&&stop>mid);
 const source=renderer.slice(start,stop);
 const el={};
 const getElementById=id=>el[id] ||= {textContent:''};
 const context={
  window:{LHMProfileConsistency:{render(){}}},
  fieldBrowserEngine:{value:'camoufox'},
  fieldProxyType:{value:'direct'},
  fieldFpMode:{value:'native'},fieldId:{value:profile.id},
  currentGeneratedFP:{mode:'native',identity:fakePin},
  fieldFpLocale:{value:'vi-VN',disabled:false,selectedOptions:[{textContent:'Tiếng Việt'}]},
  fieldFpTimezone:{value:'Asia/Ho_Chi_Minh',disabled:false},
  fpCamoufoxSettings:{hidden:true},fpCustomFields:{hidden:false},
  fpIdentityLockStatus:{textContent:'',classList:{toggle(){} }},
  fpEngineDescription:{textContent:''},fpEngineTag:{textContent:''},
  document:{getElementById}};
 vm.runInNewContext(source+';refreshFingerprintSetup();this.selected=selectedFingerprintConfig();',context);
 assert.equal(context.fpCamoufoxSettings.hidden,false);
 assert.equal(context.fieldFpLocale.disabled,true);
 assert.equal(context.fieldFpTimezone.disabled,true);
 assert.equal(context.fpCustomFields.hidden,true,'no Chromium legacy override on Camoufox');
 assert.equal(context.selected.mode,'native');
 assert.equal(context.selected.language,undefined,'cannot hand-override pinned identity');
 context.currentGeneratedFP={mode:'native'};context.fieldId.value='';
 vm.runInNewContext('this.selected=selectedFingerprintConfig();',context);
 assert.equal(context.selected.language,'vi-VN');
 assert.equal(context.selected.timezone,'Asia/Ho_Chi_Minh');
 console.log('fingerprint-setup: PASS (4-layer evidence honesty, UI, engine constraints, immutable pinned identity)');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
