'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8');
const start=source.indexOf("  btnSaveProfile.addEventListener('click', async () => {");
const end=source.indexOf('  // Select only rendered profiles',start);
assert(start>=0&&end>start,'Profile save handler not found');
const handler=source.slice(start,end);
async function exercise(approved,type){
 let click,saved,confirmCalls=0;
 const field=value=>({value,trim(){return this.value.trim()}});
 const context={
  btnSaveProfile:{addEventListener:(_,fn)=>{click=fn}},
  fieldName:field('Recovered'),fieldId:field('pb_recovered'),fieldBrowserEngine:field('chromium'),
  fieldGroup:field(''),fieldAdStatus:null,fieldStartUrl:field('https://example.com/'),
  fieldTags:field(''),fieldNotes:field(''),fieldFpScreen:field('1280x800'),fieldProxyType:field(type),
  fieldProxyHost:field(type==='direct'?'':'proxy.example'),fieldProxyPort:field(type==='direct'?'':'8080'),
  fieldProxyUser:field(''),fieldProxyPass:field(''),profileCoverageOriginalEngine:null,currentGeneratedFP:null,
  allProfiles:[{id:'pb_recovered',requiresProxySetup:true,proxy:{type:'direct'}}],
  selectedFingerprintConfig:()=>({mode:'native'}),parseStartupUrls:v=>[v],parseTags:()=>[],
  confirm:()=>{confirmCalls++;return approved},alert:()=>{},closeModal:()=>{},modalProfile:{},
  loadProfiles:async()=>{},refreshBehaviorAlerts:async()=>{},
  window:{api:{saveProfile:async profile=>{saved=profile;return profile}}}
 };
 vm.runInNewContext(handler,context,{timeout:1000});await click();return {saved,confirmCalls};
}
(async()=>{
 const declined=await exercise(false,'direct');assert.equal(declined.confirmCalls,1);assert.equal(declined.saved,undefined);
 const direct=await exercise(true,'direct');assert.equal(direct.confirmCalls,1);assert.equal(direct.saved.requiresProxySetup,false);
 const proxy=await exercise(false,'http');assert.equal(proxy.confirmCalls,0);assert.equal(proxy.saved.proxy.type,'http');
 console.log('Recovered profile requires confirmation before choosing direct connection PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
