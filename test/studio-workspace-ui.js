'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const js=fs.readFileSync(path.join(dir,'workflowStudio.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'workspace.css'),'utf8');
const proxyJs=fs.readFileSync(path.join(dir,'proxyCenter.js'),'utf8');
for(const id of ['studio-workflow-search','studio-workflows','studio-editor','studio-graph',
  'studio-graph-refresh','studio-steps','studio-add-step','studio-stop','studio-run']) {
  assert(html.includes('id="'+id+'"'),'Missing studio control: '+id);
}
assert(js.includes("el('studio-workflow-search').addEventListener('input'"),'Studio search not bound');
assert(js.includes('if(query && !flow.name.toLowerCase().includes(query))continue;'),'Studio search filtering absent');
assert(js.includes('api.studioGraphPreview(current.steps)'),'Real flow visualization missing');
assert(js.includes('highlightGraphRun(state)'),'Runtime highlighting missing');
assert(!js.includes("button('🗑'"),'Emoji icon still used in studio saved list');
for(const id of ['pc-no-results','pc-list','pc-save','pc-search','pc-refresh','pc-total']){
  assert(html.includes('id="'+id+'"'),'Missing Proxy Center control '+id);
}
assert(html.includes('<table class="pc-table">'),'Proxy Center must have real accessible table');
assert(proxyJs.includes('api.assignSavedProxy(proxy.id,ids)'),'Bulk proxy action disconnected');
assert(proxyJs.includes('api.checkSavedProxy(proxy.id)'),'Proxy verification disconnected');
assert(proxyJs.includes('api.saveSavedProxy(payload)'),'Proxy save disconnected');
assert(proxyJs.includes('api.deleteSavedProxy(proxy.id)'),'Proxy delete disconnected');
assert(proxyJs.includes('list.replaceChildren()'),'Proxy table must use safe DOM');
assert(!proxyJs.includes('innerHTML'),'Unsafe HTML in proxy table');
assert(css.includes('#modal-studio .studio-graph-node'),'Studio restyling absent');
assert(css.includes('#modal-proxy-center .pc-table'),'Proxy table restyling absent');
console.log('Studio & Proxy Center 2.6 workspace visual parity and action wiring passed');
