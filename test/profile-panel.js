const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'profilePanel.js'),'utf8');
const css=fs.readFileSync(path.join(root,'workspace.css'),'utf8');
const renderer=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
for(const id of ['lhm-profile-panel','lhm-context-empty','lhm-context-content','lhm-context-title',
 'lhm-detail-name','lhm-detail-group','lhm-detail-id','lhm-detail-engine',
 'lhm-detail-proxy-type','lhm-detail-proxy-address','lhm-detail-status',
 'lhm-detail-open','lhm-detail-edit','lhm-detail-health','lhm-detail-fingerprint',
 'lhm-detail-url','lhm-detail-notes','lhm-detail-group-value','lhm-context-refresh']){
 assert(html.includes('id="'+id+'"'),'Missing usable profile detail field '+id);
 if(id.startsWith('lhm-detail-'))assert(js.includes("'"+id+"'"),'Not bound to real data '+id);
}
assert(html.includes('<script src="profilePanel.js"></script>'));
assert(renderer.includes("tr.dataset.profileId=profile.id"));
assert(renderer.includes("window.LHMProfileContextData"));
assert(renderer.includes("window.LHMProfilePanel?.refresh()"));
assert(js.includes('window.LHMProfilePanel={refresh:render,select}'));
assert(js.includes("filter.dispatchEvent(new Event('change'"));
assert(js.includes("button.click()"),'Actions must reuse original row handlers');
assert(js.includes('textContent'),'No dynamic unsafe HTML from profile data');
assert(!js.includes('innerHTML'),'Never insert profile data as HTML');
for(const status of ['all','running','stopped'])assert(html.includes('data-lhm-status="'+status+'"'));
assert(css.includes('.lhm-context-panel'));
assert(css.includes('.lhm-nav-label,.lhm-nav-bottom{display:none!important}'));
assert(css.includes('body[data-view="dashboard"] .lhm-context-panel{display:none!important}'));
console.log('Clean reference-inspired workspace: functional profile pane, filter tabs and UI safety tests passed');
