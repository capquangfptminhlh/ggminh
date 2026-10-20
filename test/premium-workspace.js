'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/premiumWorkspace.css'),'utf8');
const js=fs.readFileSync(path.join(root,'src/ui/premiumWorkspace.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/ui/renderer.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'src/ui/dashboard.js'),'utf8');
const required=['lhm-v6-global-search','lhm-v6-refresh','lhm-v6-total','lhm-v6-running',
 'lhm-v6-proxies','lhm-v6-workflows','lhm-v6-attention','lhm-v6-automation',
 'lhm-v6-ai-open','lhm-v6-studio-open','lhm-v6-import','lhm-v6-bulk','lhm-v6-studio'];
for(const id of required){
 assert.strictEqual(html.split('id="'+id+'"').length,2,'Missing/duplicate new UI control: '+id);
 assert(js.includes("'"+id+"'"),'New UI control is not wired: '+id);
}
for(const id of ['btn-ai-advisor','btn-open-studio','btn-import-profiles','btn-bulk-create',
 'search-input','btn-create-profile','profile-list-body','lhm-context-content']){
 assert(html.includes('id="'+id+'"'),'Legacy operation must survive redesign: '+id);
}
assert(html.includes('<link rel="stylesheet" href="premiumWorkspace.css">'));
assert(html.includes('<script src="premiumWorkspace.js"></script>'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('lhm-v6-arrive'));
assert(css.includes('lhm-v6-row'));
assert(css.includes('lhm-v6-count'));
assert(css.includes('lhm-v6-metric:hover'));
assert(js.includes('window.api.dashboardOverview()'));
assert(!js.includes('innerHTML'));
assert(js.includes('window.LHMMissionControl?.switchView'));
assert(js.includes("event.key.toLowerCase()==='k'"));
assert(renderer.includes('window.LHMPremiumWorkspace?.refreshFromProfiles(allProfiles,activeBrowserMap.size)'));
assert(dashboard.includes("selectedNav('profiles')"));
console.log('v5.6 premium workspace: animation, responsive/reduced-motion, live KPI API, search, navigation, AI/RPA actions and old IPC targets passed');
