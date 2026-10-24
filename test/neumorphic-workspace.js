'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'neumorphicWorkspace.css'),'utf8');
const js=fs.readFileSync(path.join(base,'neumorphicWorkspace.js'),'utf8');
const {init,setMode}=require('../src/ui/neumorphicWorkspace');

assert(html.includes('<link rel="stylesheet" href="neumorphicWorkspace.css">'));
assert(html.includes('<script src="neumorphicWorkspace.js"></script>'));
assert(html.indexOf('commercialPolish.css')<html.indexOf('neumorphicWorkspace.css'),
 '3D skin must load after previous workspace styles');
assert(html.indexOf('licenseCenter.js')<html.indexOf('neumorphicWorkspace.js'),
 'License control remains owned by the real signed-license script');

for(const id of [
 'modal-license-center','lhm-nm-license-status-face','lhm-nm-license-activate-face',
 'lhm-nm-license-next','lhm-nm-license-back',
 'license-state','license-plan','license-expires','license-limit',
 'license-installation-id','license-copy-installation','license-token',
 'license-activate','license-refresh','license-verify-online',
 'license-deactivate','license-online-state','license-features','license-message',
 'btn-create-profile','profile-list-body','lhm-v6-total','lhm-v6-running',
 'lhm-v7-motion-toggle'
])assert.equal(html.split('id="'+id+'"').length,2,'Missing or duplicate action: '+id);
assert(html.includes('id="lhm-nm-license-activate-face" class="lhm-nm-license-face back" aria-label="Kích hoạt giấy phép" aria-hidden="true" inert'));
assert(css.includes('#modal-ads-launch-guard #ads-guard-urls{background-color:#fff!important}'),
 'Component-specific Ads Guard input must retain existing release-verified white background');
// Regression from inspected Windows screenshot: pale right rail previously
// inherited white text, making its heading, KPIs and secondary action unreadable.
for(const contract of [
 '#lhm-profile-panel .lhm-v6-assistant h3{',
 '#lhm-profile-panel .lhm-v6-assistant h3 em{',
 '#lhm-profile-panel .lhm-v6-ai-health strong{',
 '#lhm-profile-panel .lhm-v6-ai-button:not(.primary){',
 '#lhm-profile-panel .lhm-v6-assistant small{',
 'body[data-view="profiles"] .lhm-v6-metric{',
 '#modal-license-center .modal-body>.lhm-bulk-help{'
])assert(css.includes(contract),'Full UI density/contrast contract missing: '+contract);
const main=fs.readFileSync(path.join(base,'../../main.js'),'utf8');
assert(main.includes('Full-window AI panel contrast/layout regression'),
 'Actual Windows Electron screenshot gate must measure sidebar contrast');
assert(main.includes('Full-width workspace collapse failed'),
 'Actual Windows Electron screenshot gate must measure real full-width state');

assert(!js.includes('fetch(')&&!js.includes('window.api')&&!js.includes('localStorage'),
 'Video motion must not introduce fake authentication or alter licensing');
for(const signature of [
 'perspective:1500px','transform:rotateY(180deg)','backface-visibility:hidden',
 'box-shadow:var(--nm-in)','linear-gradient(135deg,#2ab0ff,#0675e8)',
 '.app-container',' .lhm-v6-metric','.profile-table',' .modal-dialog',
 'prefers-reduced-motion:reduce','data-lhm-motion="off"'
])assert(css.includes(signature),'Video visual / accessibility rule missing: '+signature);

function node(){
 const handlers={},attrs={};
 return {attrs,handlers,inert:false,focused:false,
  setAttribute(k,v){attrs[k]=v;},
  addEventListener(type,handler){handlers[type]=handler;},
  focus(){this.focused=true;},
  click(){if(!handlers.click)throw Error('Button not wired');handlers.click();}
 };
}
const status=node(),activation=node(),next=node(),back=node(),open=node(),close=node(),done=node(),token=node();
const nodes={
 'lhm-nm-license-status-face':status,'lhm-nm-license-activate-face':activation,
 'lhm-nm-license-next':next,'lhm-nm-license-back':back,'license-token':token,
 'btn-license-center':open,'license-center-close':close,'license-done':done
};
const modal={dataset:{},querySelector(sel){return nodes[sel.slice(1)]||null;}};
nodes['modal-license-center']=modal;
const doc={getElementById(id){return nodes[id]||null;}};
assert.equal(init(doc),true);
assert.equal(modal.dataset.lhmLicenseMode,'status');
assert.equal(status.inert,false);assert.equal(activation.inert,true);
assert.equal(activation.attrs['aria-hidden'],'true');
next.click();
assert.equal(modal.dataset.lhmLicenseMode,'activate');
assert.equal(status.inert,true);assert.equal(activation.inert,false);
assert.equal(status.attrs['aria-hidden'],'true');assert.equal(activation.attrs['aria-hidden'],'false');
assert.equal(token.focused,true);
back.click();
assert.equal(modal.dataset.lhmLicenseMode,'status');
assert.equal(next.focused,true);
next.click();open.click();
assert.equal(modal.dataset.lhmLicenseMode,'status','Reopen must start on summary');
next.click();close.click();
assert.equal(modal.dataset.lhmLicenseMode,'status');
next.click();done.click();
assert.equal(modal.dataset.lhmLicenseMode,'status');
assert.throws(()=>setMode(modal,'register'),/Unknown/,'No fake registration mode');
assert.equal(init({getElementById:()=>null}),false);
console.log('Neumorphic full-shell: video-matched 3D flip, real license control preservation, focus/inert, user and OS motion gates PASS');
