'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/ui/renderer.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'src/ui/dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');

assert(main.includes("ipcMain.handle('resource-guard-status'"),
  'Main process must expose a local-only resource snapshot');
assert(preload.includes("ipcRenderer.invoke('resource-guard-status'"),
  'Preload must expose only the narrow resource status IPC');
assert(preload.includes("allowResourceReview"),
  'Manual launch must carry an explicit unmeasured-resource acknowledgement');
assert(renderer.includes('LHMResourceGuard.confirmLaunch(profile)'),
  'Manual launch must ask the Resource Guard UI before starting');
for(const id of ['lhm-resource-total','lhm-resource-available','lhm-resource-processes',
  'lhm-resource-sample','lhm-resource-profiles']){
  assert(html.includes('id="'+id+'"'),'Missing resource dashboard element: '+id);
  assert(dashboard.includes("'"+id+"'"),'Resource dashboard does not render: '+id);
}
assert(dashboard.includes('api.resourceGuardStatus()'));
assert(dashboard.includes('RESOURCE_UNMEASURED'));
assert(!dashboard.includes('localStorage'));
assert(!dashboard.includes('innerHTML'));
console.log('Resource Guard manual acknowledgement and local-only dashboard wiring passed');
