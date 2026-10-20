'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'toolMenu.js'),'utf8');
const css=fs.readFileSync(path.join(root,'workspace.css'),'utf8');
assert(html.includes('id="lhm-tools-menu"'));
const menu=html.slice(html.indexOf('id="lhm-tools-menu"'),html.indexOf('</details>',html.indexOf('id="lhm-tools-menu"')));
for(const id of ['btn-api-toggle','btn-cache-manager','btn-extension-center','btn-window-manager','btn-trash-profiles','btn-update-csv','btn-import-profiles']){
 assert(menu.includes('id="'+id+'"'),'Missing action in tools menu: '+id);
 assert(html.split('id="'+id+'"').length===2,'Duplicate action: '+id);
}
assert(html.includes('id="btn-create-profile"'));
assert(html.includes('id="btn-bulk-create"'));
assert(js.includes('event.key==='));
assert(css.includes('.lhm-tools-panel'));
console.log('v4.2 compact tools menu, preserved actions and keyboard handling passed');
