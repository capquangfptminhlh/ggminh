'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const renderer=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'tablePreferences.js'),'utf8');
const css=fs.readFileSync(path.join(root,'workspace.css'),'utf8');
for(const id of ['btn-table-options','table-options-panel','table-density','table-options-reset'])
  assert(html.includes('id="'+id+'"'));
for(const key of ['id','proxy','engine','status']){
  assert(html.includes('data-table-column="'+key+'"'));
  assert(html.includes('data-table-col="'+key+'"'));
  assert(renderer.includes('data-table-col="'+key+'"'));
}
assert(renderer.includes('window.LHMTablePreferences?.apply();'));
assert(ui.includes('localStorage.setItem(KEY'));
assert(ui.includes("table.classList.toggle('lhm-table-compact'"));
assert(ui.includes('cell.hidden='));
assert(css.includes('.profile-table [data-table-col][hidden]'));
console.log('v3.7 configurable profile columns, persisted density and renderer integration passed');
