'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/ui/appIdentity.js'),'utf8');
async function render(info){
 const nodes=new Map();
 const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,classList:{add(){},remove(){},contains(){return false;}},addEventListener(){}});return nodes.get(id)};
 const document={getElementById:el,body:{dataset:{}},title:'',addEventListener(){}};
 let onReady;
 const window={api:{getAppInfo:async()=>info},addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')onReady=fn;}};
 vm.runInNewContext(source,{window,document,Promise});
 onReady();
 await new Promise(resolve=>setImmediate(resolve));
 return {document,nodes};
}
(async()=>{
 const base={name:'LHM Ads Browser',version:'5.8.0',platform:'win32',arch:'x64',packaged:false};
 const preview=await render({...base,internalPreview:true});
 assert.match(preview.document.title,/thử nội bộ/i);
 assert.match(preview.nodes.get('app-mode-message').textContent,/chỉ kết nối trực tiếp/i);
 const warning=preview.nodes.get('lhm-internal-preview-warning');
 assert.equal(warning.hidden,false);
 assert.match(warning.textContent,/đóng hồ sơ bình thường/i);
 assert.match(warning.textContent,/dừng đột ngột.*mất dữ liệu.*mới ghi/i);
 const ordinary=await render({...base,internalPreview:false});
 assert.doesNotMatch(ordinary.document.title,/thử nội bộ/i);
 const packaged=await render({...base,packaged:true,internalPreview:true});
 assert.doesNotMatch(packaged.document.title,/thử nội bộ/i);
 assert.notEqual(packaged.nodes.get('lhm-internal-preview-warning')?.hidden,false);
 console.log('Only the source-only internal preview is labelled as such: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
