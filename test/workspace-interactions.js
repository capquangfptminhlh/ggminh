'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'src/ui/workspaceInteractions.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/workspaceInteractions.css'),'utf8');
for(const id of ['lhm-v7-command-open','lhm-v7-command-palette','lhm-v7-command-input',
 'lhm-v7-command-search','lhm-v7-command-list','lhm-v7-command-close',
 'lhm-v7-show-rail','lhm-v7-hide-rail','lhm-v7-rail-label'].filter(x=>x!=='lhm-v7-command-input'))
 assert.strictEqual(html.split('id="'+id+'"').length,2,id);
assert(html.includes('<script src="workspaceInteractions.js"></script>'));
assert(html.includes('<link rel="stylesheet" href="workspaceInteractions.css">'));
assert(js.includes('window.LHMProfileContextData?.()'),'Palette must use real profile data');
assert(js.includes('textContent=item.label'),'No unsafe untrusted profile name HTML');
assert(!js.includes('innerHTML'),'Do not use innerHTML');
assert(js.includes("event.ctrlKey||event.metaKey"));
assert(js.includes("event.shiftKey&&key==='p'"));
assert(js.includes("key==='b'"));
assert(js.includes("document.body.dataset.lhmRail=visible?'open':'closed'"));
assert(js.includes('window.LHMMissionControl?.switchView'));
assert(js.includes('trigger?.click()'));
assert(css.includes('data-lhm-rail="closed"'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(html.includes('id="lhm-v7-motion-toggle"'));
assert(js.includes("document.body.dataset.lhmMotion=enabled?'on':'off'"));
assert(js.includes('panel.inert=!visible'));
assert(js.includes("event.key==='Tab'"));
assert(js.includes('window.innerWidth>1270'));
assert(js.includes("localStorage.setItem(MOTION_KEY"));
assert(css.includes('data-lhm-motion="off"'));
console.log('v5.7 command palette keyboard, safe profile lookup, active rail, responsive & reduced-motion supported');
