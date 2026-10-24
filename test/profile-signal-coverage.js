'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const {model,render}=require('../src/ui/profileSignalCoverage');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/ui/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/profileSignalCoverage.css'),'utf8');
assert(html.includes('id="fp-signal-coverage" open'),'Inspector must be visible by default');
assert(html.includes('id="fp-signal-summary"')&&html.includes('id="fp-signal-groups"'));
assert(html.indexOf('profileSignalCoverage.js')<html.indexOf('renderer.js'),'module must load first');
assert(html.includes('href="profileSignalCoverage.css"'));
assert(html.includes('modal-dialog modal-lg lhm-profile-setup-dialog'));
for(const token of ['renderProfileSignalCoverage();','fieldProxyType','fieldBrowserEngine','currentGeneratedFP','profileCoverageOriginalEngine']){
  assert(renderer.includes(token), 'Missing profile live refresh: '+token);
}
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
assert(css.includes('@media(max-width:780px)'));
assert(css.includes('overflow-y:auto'));
const qa=fs.readFileSync(path.join(root,'main.js'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/windows-exe.yml'),'utf8');
assert(qa.includes('Actual Constitution profile wizard layout/status failed'),
  'Real Electron profile inspector must enforce visibility and truthful statuses');
assert(qa.includes("writeCapture('workspace-profile-editor-preview.png'"),
  'The real create-profile wizard must be captured');
assert(workflow.includes('Missing profile editor visual smoke') &&
  workflow.includes('Missing packaged profile editor visual smoke'),
  'Both source and packaged Windows Electron captures must be checked');

const flatten=x=>x.flatMap(g=>g.items);
const n=flatten(model({engine:'chromium',fingerprint:{mode:'native'}}));
assert(n.length>=16);
assert(n.some(x=>x.key==='ua'&&x.status==='native'));
assert(n.some(x=>x.key==='tls'&&x.status==='unmeasured'));
assert(n.some(x=>x.key==='storage'&&x.status==='unmeasured'));
assert(n.some(x=>x.key==='accounts'&&x.status==='external'));
const custom=flatten(model({engine:'chromium',fingerprint:{
  mode:'experimental',canvasNoiseSeed:7,audioNoiseSeed:6,webrtc:'spoof'
},proxy:{type:'http',host:'proxy.example',port:8080}}));
for(const key of ['ua','canvas','audio'])assert(custom.some(x=>x.key===key&&x.status==='custom'));
assert(custom.some(x=>x.key==='proxy'&&x.status==='declared'));
assert(custom.some(x=>x.key==='webrtc'&&x.status==='unmeasured'),
  'WebRTC experimental setting is not proof of no leak');
const missing=flatten(model({engine:'camoufox',fingerprint:{mode:'native',identityProvisioning:'unavailable'}}));
assert(!missing.some(x=>x.status==='pinned'),'Failed provisioning must not be labelled pinned');
const pinned=flatten(model({engine:'camoufox',fingerprint:{
  mode:'native',identity:{language:'vi-VN'},identityProvisioning:'provisioned'
}}));
assert(pinned.some(x=>x.key==='ua'&&x.status==='pinned'));
assert(pinned.some(x=>x.key==='canvas'&&x.status!=='pinned'),
  'Pinned identity is not evidence of Canvas runtime measurement');
const unverified=flatten(model({engine:'camoufox',fingerprint:{identity:{},identityProvisioning:'invalid'}}));
assert(!unverified.some(x=>x.status==='pinned'));
function el(){
 return {textContent:'',className:'',dataset:{},children:[],
   append(...nodes){this.children.push(...nodes);},
   appendChild(child){this.children.push(child);},
   replaceChildren(...nodes){this.children=[...nodes];}};
}
const summary=el(),groups=el();
const doc={getElementById:id=>id==='fp-signal-summary'?summary:id==='fp-signal-groups'?groups:null,createElement:el};
assert(render(doc,{engine:'camoufox',fingerprint:{identityProvisioning:'unavailable'}}));
assert(summary.textContent.includes('chưa có bằng chứng'));
assert(groups.children.length===4);
assert(groups.children.every(g=>g.children.length>=4));
assert(groups.children.some(g=>g.children.some(r=>r.children.some(c=>c.textContent==='CHƯA ĐO'))));
assert(!render({getElementById:()=>null},{engine:'chromium'}));
console.log('Profile Constitution inventory PASS: native/experimental/provisioning/proxy truth, NOT_MEASURED and responsive form');
