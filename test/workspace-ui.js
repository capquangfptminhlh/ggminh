const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const iconJs = fs.readFileSync(path.join(__dirname,'../src/ui/icons.js'),'utf8');
const workspaceCss = fs.readFileSync(path.join(__dirname,'../src/ui/workspace.css'),'utf8');
const renderer = fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8');
const dashboard = fs.readFileSync(path.join(__dirname,'../src/ui/dashboard.js'),'utf8');
assert(html.includes('<body data-view="profiles">'));
assert(html.includes('<link rel="stylesheet" href="workspace.css">'));
assert(html.includes('<script src="icons.js"></script>'));
assert(html.indexOf('icons.js') < html.indexOf('renderer.js'));
assert(html.includes('id="lhm-profiles-total"'));
assert(html.includes('id="lhm-profiles-running"'));
assert(html.includes('id="btn-create-profile"'));
for (const id of ['btn-proxy-center','btn-control-tower','btn-profile-health',
 'btn-config-backup','btn-open-studio','btn-behavior-alert','btn-open-rpa',
 'btn-api-toggle','btn-api-copy','profile-list-body','select-all','filter-group',
 'filter-status','search-input']) assert(html.includes('id="'+id+'"'), 'Missing original action '+id);
for (const icon of ['panels-top-left','layout-dashboard','network','workflow',
 'layers','shield-check','activity','database-backup','plus','search',
 'refresh-cw','play','square','edit','trash','terminal']) {
 assert(iconJs.includes("'"+icon+"'"), 'Missing icon '+icon);
}
assert(!html.includes('class="lhm-hero-art"'));
assert(!html.includes('class="lhm-network-graphic"'));
assert(renderer.includes('window.LHMIcons?.decorate(tr)'));
assert(renderer.includes("document.getElementById('lhm-profiles-total')"));
assert(dashboard.includes("document.body.dataset.view = 'profiles'"));
assert(workspaceCss.includes('color-scheme:light'));
assert(workspaceCss.includes('background:#fff'));
assert(!html.includes('id="lhm-kpi-accuracy"'));
console.log('Workspace 2.2 theme, SVG icons and operational UI element tests passed');
