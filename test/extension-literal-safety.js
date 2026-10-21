'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {generateExtension}=require('../src/engine/extensionGenerator');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-script-safety-'));
try{
 const injected="';globalThis.UNSAFE_CODE_EXECUTED=true;//";
 const data={id:'pb_test',fingerprint:{
  mode:'legacy',platform:injected,userAgent:'',
  languages:['en-US'],
  hardwareConcurrency:'4);globalThis.UNSAFE_CODE_EXECUTED=true;//',
  deviceMemory:'8);globalThis.UNSAFE_CODE_EXECUTED=true;//',
  webgl:{unmaskedVendor:injected,unmaskedRenderer:injected,
   vendor:injected,renderer:injected},
  webrtc:injected,
  screen:{width:'1234);globalThis.UNSAFE_CODE_EXECUTED=true;//',
   height:800,availWidth:1200,availHeight:700}
 }};
 generateExtension(data,root);
 const script=fs.readFileSync(path.join(root,'stealth.js'),'utf8');
 assert(script.includes('get: () => 8')); // invalid CPU/GPU numbers must be sanitized
 assert(script.includes('width: 1920')); // invalid width safely defaults
 assert(script.includes(JSON.stringify(injected)));
 assert.doesNotThrow(()=>new vm.Script(script,{filename:'stealth.js'}));
 const context=vm.createContext({navigator:{},
  window:{screen:{},RTCPeerConnection:null,WebGLRenderingContext:null},
  Object,JSON,Function,Math,Array,Map,Number,console});
 // Don't run the legacy shim: it mutates global prototypes intentionally.
 assert.strictEqual(context.UNSAFE_CODE_EXECUTED,undefined);
 console.log('Legacy extension literals escaped, numeric injection blocked and generated script parses');
}finally{fs.rmSync(root,{recursive:true,force:true});}
