const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../src/ui/workflowStudio.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../src/ui/workspace.css'),'utf8');
const packageJson=require('../package.json');
for(const id of ['studio-graph','studio-graph-scroll','studio-graph-refresh','studio-graph-status']){
  assert(html.includes('id="'+id+'"'),'Missing visual editor UI: '+id);
  assert(js.includes("'"+id+"'"),'Missing renderer binding: '+id);
}
assert(html.indexOf('id="studio-graph"') < html.indexOf('id="studio-steps"'));
assert(js.includes('api.studioGraphPreview(current.steps)'));
assert(js.includes("row.dataset.stepIndex=String(i)"));
assert(js.includes('queueGraph();'));
assert(js.includes('highlightGraphRun(state)'));
assert(js.includes('detail.textContent=node.detail'));
assert(!js.includes('surface.innerHTML'));
assert(preload.includes("studioGraphPreview: steps => ipcRenderer.invoke('studio-graph-preview', steps)"));
assert(main.includes("ipcMain.handle('studio-graph-preview', (_, steps) => graphForSteps(steps))"));
assert(css.includes('.studio-graph-node'));
assert(css.includes('.studio-graph-line'));
assert.strictEqual(packageJson.version,'2.5.0');
console.log('Visual flow editor bindings, safe text rendering and version tests passed');
