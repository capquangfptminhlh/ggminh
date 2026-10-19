const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const js = fs.readFileSync(path.join(__dirname,'../src/ui/dashboard.js'),'utf8');
const requiredIds=[
  'dashboard-view','lhm-dashboard-refresh','lhm-dashboard-status',
  'lhm-kpi-total','lhm-kpi-active','lhm-kpi-attention','lhm-kpi-workflows',
  'lhm-workflow-state','lhm-native-count','lhm-experimental-count',
  'lhm-error-count','lhm-health-ring','lhm-health-ready',
  'lhm-proxy-total','lhm-proxy-verified','lhm-activity-10m',
  'lhm-activity-alerts','lhm-attention-list','lhm-activity-list',
  'lhm-dashboard-groups'
];
for(const id of requiredIds) {
  assert(html.includes('id="'+id+'"'), 'Missing dashboard element: '+id);
  assert(js.includes("'"+id+"'"), 'Renderer does not reference: '+id);
}
for(const route of [
  'btn-create-profile','btn-proxy-center','btn-open-studio',
  'btn-control-tower','btn-profile-health','btn-behavior-alert','btn-config-backup'
]) assert(html.includes('id="'+route+'"'), 'Missing action route '+route);
assert(html.includes('<script src="dashboard.js"></script>'));
assert(html.includes('data-view="dashboard"'));
assert(js.includes('api.dashboardOverview()'));
assert(!js.includes('innerHTML ='));
assert(!html.includes('100% Safe'));
assert(!html.includes('Anti-Detect 100%'));
console.log('Mission Control dashboard wiring and safe text rendering tests passed');
