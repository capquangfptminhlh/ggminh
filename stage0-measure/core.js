'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const FIELDS=Object.freeze(['cookie','localStorage','indexedDB','cacheStorage']);
function safeOptions(env=process.env){
 const executable=env.LHM_CAMOUFOX_EXECUTABLE;
 const expectedSha256=env.LHM_CAMOUFOX_EXE_SHA256;
 if(typeof executable!=='string'||!executable.trim())
  throw Error('LHM_CAMOUFOX_EXECUTABLE must specify an approved absolute camoufox.exe');
 if(!/^[a-f0-9]{64}$/i.test(expectedSha256||''))
  throw Error('LHM_CAMOUFOX_EXE_SHA256 must be the independently approved executable digest');
 return {executable,expectedSha256:expectedSha256.toLowerCase()};
}
function stageStorageResult(beforeB,afterA,afterB,restartA,restartB,markers){
 for(const [name,value] of Object.entries({beforeB,afterA,afterB,restartA,restartB}))
  assert.ok(value,'Missing observation '+name);
 const left=markers.a,right=markers.b;
 if(typeof left!=='string'||typeof right!=='string'||!left||!right||left===right)
  throw Error('Distinct synthetic profile markers required');
 const checks={};
 for(const field of FIELDS){
  checks[field]={
   noAInFreshB:beforeB[field]===null,
   aIsolatedAfterBWrite:afterA[field]===left,
   bIsolatedAfterBWrite:afterB[field]===right,
   aPersistsAfterRestart:restartA[field]===left,
   bPersistsAfterRestart:restartB[field]===right
  };
 }
 return {pass:Object.values(checks).every(x=>Object.values(x).every(Boolean)),checks};
}
function digestFile(file){
 const fs=require('node:fs'),hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
 try{const buffer=Buffer.allocUnsafe(512*1024);let n;
  while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));
 }finally{fs.closeSync(fd)}
 return hash.digest('hex');
}
const IDENTITY_FIELD_MAP=Object.freeze({
 userAgent:'userAgent',platform:'platform',language:'language',
 timezone:'timezone',hardwareConcurrency:'hardwareConcurrency'
});
function identityExpectationResult(expectations,observed){
 if(!expectations||typeof expectations!=='object')
  throw Error('Identity expectations required');
 if(!observed||typeof observed!=='object')
  throw Error('Observed browser environment required');
 const fields={};
 for(const [expectedKey,observedKey] of Object.entries(IDENTITY_FIELD_MAP)){
  const expected=expectations[expectedKey]??null;
  fields[expectedKey]={expected,observed:observed[observedKey]??null,
   match:expected===null?null:expected===observed[observedKey]};
 }
 for(const [expectedKey,screenKey] of [['screenWidth','width'],['screenHeight','height']]){
  const expected=expectations[expectedKey]??null;
  const seen=observed.screen?observed.screen[screenKey]??null:null;
  fields[expectedKey]={expected,observed:seen,
   match:expected===null?null:expected===seen};
 }
 const compared=Object.values(fields).filter(f=>f.match!==null);
 return {fields,compared:compared.length,
  pass:compared.length>0&&compared.every(f=>f.match===true)};
}
/* ------------------------------------------------------------------ *
 * Extended runtime probe (Agent 5, constitution v1.3 Sections 4.2-4.4,
 * 18, 23). `extendedProbe` is a SELF-CONTAINED page-side function: it is
 * serialised by Playwright and evaluated in the page, so it must not
 * reference anything outside its own body. Every sub-probe is isolated:
 * one failing API cannot erase the others. Raw results are turned into
 * per-point statuses by `summarizeProbe` — each point is MEASURED,
 * UNSUPPORTED (API absent in this engine) or BLOCKED (API present but
 * the call failed), never merged into an overall verdict.
 * ------------------------------------------------------------------ */
async function extendedProbe(){
 const out={};
 // No optional browser capability is allowed to stall all release evidence.
 // Timeout marks that point BLOCKED; it does NOT promote unmeasured data to PASS.
 const run=async(name,fn)=>{
  let timeout;
  try{
   const value=await Promise.race([
    Promise.resolve().then(fn),
    new Promise((_,reject)=>{
     timeout=setTimeout(()=>reject(Error('Extended capability probe timed out')),2500);
    })
   ]);
   out[name]=value===undefined?{status:'unsupported'}:{status:'measured',value};
  }catch(error){
   out[name]={status:'blocked',
    error:String((error&&error.name)||'Error')+': '+
     String((error&&error.message)||'').slice(0,120)};
  }finally{clearTimeout(timeout)}
 };
 const fnv=(bytes)=>{
  let h=0x811c9dc5;
  for(let i=0;i<bytes.length;i++){h^=bytes[i]&0xff;h=Math.imul(h,0x01000193)>>>0}
  return ('0000000'+h.toString(16)).slice(-8);
 };
 const fnvText=(text)=>{
  let h=0x811c9dc5;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i)&0xff;h=Math.imul(h,0x01000193)>>>0}
  return ('0000000'+h.toString(16)).slice(-8);
 };
 await run('webgl',()=>{
  const canvas=document.createElement('canvas');
  let gl=canvas.getContext('webgl2');
  const api=gl?'webgl2':null;
  if(!gl){gl=canvas.getContext('webgl')||canvas.getContext('experimental-webgl');}
  if(!gl)return undefined;
  const kind=api||'webgl1';
  const fields={};
  const param=(name,code)=>{
   try{const v=gl.getParameter(code);
    fields[name]=v&&typeof v==='object'&&'length' in v?Array.from(v):v;
   }catch(_){fields[name]=null}
  };
  param('maxTextureSize',gl.MAX_TEXTURE_SIZE);
  param('maxCubeMapTextureSize',gl.MAX_CUBE_MAP_TEXTURE_SIZE);
  param('maxRenderbufferSize',gl.MAX_RENDERBUFFER_SIZE);
  param('maxViewportDims',gl.MAX_VIEWPORT_DIMS);
  param('maxVertexAttribs',gl.MAX_VERTEX_ATTRIBS);
  param('maxTextureImageUnits',gl.MAX_TEXTURE_IMAGE_UNITS);
  param('maxVertexTextureImageUnits',gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
  param('maxCombinedTextureImageUnits',gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  param('maxFragmentUniformVectors',gl.MAX_FRAGMENT_UNIFORM_VECTORS);
  param('maxVertexUniformVectors',gl.MAX_VERTEX_UNIFORM_VECTORS);
  param('aliasedPointSizeRange',gl.ALIASED_POINT_SIZE_RANGE);
  param('aliasedLineWidthRange',gl.ALIASED_LINE_WIDTH_RANGE);
  let anisotropy=null;
  try{const ext=gl.getExtension('EXT_texture_filter_anisotropic');
   if(ext)anisotropy=gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);}catch(_){}
  const precision={};
  for(const shader of ['VERTEX_SHADER','FRAGMENT_SHADER']){
   precision[shader]={};
   for(const level of ['HIGH_FLOAT','MEDIUM_FLOAT','HIGH_INT']){
    try{const p=gl.getShaderPrecisionFormat(gl[shader],gl[level]);
     precision[shader][level]={precision:p.precision,rangeMin:p.rangeMin,rangeMax:p.rangeMax};
    }catch(_){precision[shader][level]=null}
   }
  }
  let extensions=null;
  try{extensions=gl.getSupportedExtensions()}catch(_){}
  let unmasked=null;
  try{const dbg=gl.getExtension('WEBGL_debug_renderer_info');
   if(dbg)unmasked={vendor:gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
    renderer:gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)};
  }catch(_){}
  // Fixed render task: same scene every run, hash of the raw pixels.
  let renderHash=null,renderDataUrlHash=null;
  try{
   const c2=document.createElement('canvas');c2.width=64;c2.height=64;
   const g=c2.getContext(kind)||c2.getContext('webgl');
   if(g){
    const vs='attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
    const fs='precision mediump float;varying vec2 v;void main(){gl_FragColor=vec4(v.x,v.y,0.5,1.);}';
    const sh=(t,s)=>{const o=g.createShader(t);g.shaderSource(o,s);g.compileShader(o);return o};
    const pr=g.createProgram();
    g.attachShader(pr,sh(g.VERTEX_SHADER,vs));g.attachShader(pr,sh(g.FRAGMENT_SHADER,fs));
    g.linkProgram(pr);g.useProgram(pr);
    const buf=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buf);
    g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),g.STATIC_DRAW);
    const loc=g.getAttribLocation(pr,'p');g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc,2,g.FLOAT,false,0,0);
    g.viewport(0,0,64,64);g.drawArrays(g.TRIANGLES,0,3);
    const px=new Uint8Array(64*64*4);g.readPixels(0,0,64,64,g.RGBA,g.UNSIGNED_BYTE,px);
    renderHash=fnv(px);
    renderDataUrlHash=fnvText(c2.toDataURL());
   }
  }catch(_){}
  return {api:kind,
   masked:{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER)},
   unmasked,extensions,params:fields,anisotropy,precision,renderHash,renderDataUrlHash};
 });
 await run('canvas2d',async()=>{
  const W=256,H=64;
  const draw=(ctx)=>{
   const grad=ctx.createLinearGradient(0,0,W,0);
   grad.addColorStop(0,'#f60');grad.addColorStop(1,'#069');
   ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
   ctx.fillStyle='rgba(20,80,200,0.7)';
   ctx.beginPath();ctx.arc(200,32,22,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#102030';ctx.font='24px Arial, sans-serif';
   ctx.fillText('LHM Stage-0 Cwm fjord',6,28);
   ctx.font='15px Georgia, serif';ctx.fillStyle='#ffffff';
   ctx.fillText('probe 0123456789',6,52);
  };
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');draw(ctx);
  const pixels=ctx.getImageData(0,0,W,H).data;
  const pixelHash=fnv(pixels);
  const dataUrl=canvas.toDataURL('image/png');
  const dataUrlHash=fnvText(dataUrl);
  // Normalise the data-URL export back to pixels before comparing
  // (Constitution Section 18): decode it and hash the decoded pixels.
  let decodedPixelHash=null;
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=()=>reject(Error('decode'));img.src=dataUrl;
   });
   const back=document.createElement('canvas');back.width=W;back.height=H;
   const bctx=back.getContext('2d');bctx.drawImage(img,0,0);
   decodedPixelHash=fnv(bctx.getImageData(0,0,W,H).data);
  }catch(_){}
  const metrics={};
  for(const family of ['sans-serif','serif','monospace']){
   const mctx=document.createElement('canvas').getContext('2d');
   mctx.font='32px '+family;
   const m=mctx.measureText('mmmmmmmmmmlliWW 0123456789');
   metrics[family]={width:m.width,
    actualBoundingBoxAscent:m.actualBoundingBoxAscent??null,
    actualBoundingBoxDescent:m.actualBoundingBoxDescent??null};
  }
  return {pixelHash,dataUrlHash,decodedPixelHash,
   exportsConsistent:decodedPixelHash===null?null:decodedPixelHash===pixelHash,
   textMetrics:metrics};
 });
 await run('audioBasic',()=>{
  if(typeof AudioContext==='undefined'&&typeof webkitAudioContext==='undefined')
   return undefined;
  const Ctx=typeof AudioContext!=='undefined'?AudioContext:webkitAudioContext;
  const ctx=new Ctx();
  const value={sampleRate:ctx.sampleRate,state:ctx.state,
   baseLatency:'baseLatency' in ctx?ctx.baseLatency:null,
   outputLatency:'outputLatency' in ctx?ctx.outputLatency:null,
   maxChannelCount:ctx.destination?ctx.destination.maxChannelCount:null,
   channelCount:ctx.destination?ctx.destination.channelCount:null};
  if(typeof ctx.close==='function')ctx.close().catch(()=>{});
  return value;
 });
 await run('audioOfflineHash',async()=>{
  if(typeof OfflineAudioContext==='undefined')return undefined;
  const ctx=new OfflineAudioContext(1,44100,44100);
  const osc=ctx.createOscillator();osc.type='triangle';osc.frequency.value=10000;
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-50;comp.knee.value=40;comp.ratio.value=12;
  comp.attack.value=0;comp.release.value=0.25;
  osc.connect(comp);comp.connect(ctx.destination);
  osc.start(0);
  const buffer=await ctx.startRendering();
  const data=buffer.getChannelData(0);
  let sum=0;for(let i=4500;i<5000&&i<data.length;i++)sum+=Math.abs(data[i]);
  return {sampleSum:sum.toFixed(8),sampleRate:buffer.sampleRate,length:buffer.length};
 });
 await run('fonts',()=>{
  const candidates=['Arial','Arial Black','Calibri','Cambria','Candara','Comic Sans MS',
   'Consolas','Courier New','DejaVu Sans','DejaVu Serif','Georgia','Helvetica','Impact',
   'Liberation Sans','Liberation Serif','Lucida Console','Lucida Sans Unicode',
   'Microsoft Sans Serif','Noto Sans','Noto Serif','Palatino Linotype','Roboto',
   'Segoe UI','Segoe UI Symbol','Tahoma','Times New Roman','Trebuchet MS','Verdana',
   'Ubuntu','Cantarell','Menlo','Monaco','Courier','MS Gothic','MS PGothic','Meiryo',
   'Malgun Gothic','SimSun','SimHei','Microsoft YaHei','Microsoft JhengHei',
   'Apple SD Gothic Neo','Helvetica Neue','SF Pro Display','Wingdings'];
  const text='mmmmmmmmmmlliWW 0123456789';
  const base={};
  const probe=document.createElement('canvas').getContext('2d');
  for(const fallback of ['monospace','sans-serif','serif']){
   probe.font='72px '+fallback;base[fallback]=probe.measureText(text).width;
  }
  const detected=[];
  for(const name of candidates){
   let found=false;
   for(const fallback of ['monospace','sans-serif','serif']){
    probe.font='72px "'+name+'", '+fallback;
    if(probe.measureText(text).width!==base[fallback]){found=true;break}
   }
   if(found)detected.push(name);
  }
  return {tested:candidates.length,detected};
 });
 await run('mediaDevices',async()=>{
  if(!navigator.mediaDevices||typeof navigator.mediaDevices.enumerateDevices!=='function')
   return undefined;
  const devices=await navigator.mediaDevices.enumerateDevices();
  const byKind={};let labelsPresent=0,groupIdsPresent=0;
  for(const d of devices){
   byKind[d.kind]=(byKind[d.kind]||0)+1;
   if(d.label)labelsPresent++;
   if(d.groupId)groupIdsPresent++;
  }
  return {total:devices.length,byKind,labelsPresent,
   labelsEmpty:devices.length-labelsPresent,groupIdsPresent};
 });
 await run('voices',async()=>{
  if(typeof speechSynthesis==='undefined')return undefined;
  const collect=()=>speechSynthesis.getVoices().map(v=>({
   name:v.name,lang:v.lang,default:v.default,localService:v.localService}));
  let voices=collect();
  if(!voices.length){
   voices=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve(collect()),300);
    speechSynthesis.addEventListener('voiceschanged',()=>{
     clearTimeout(timer);resolve(collect());
    },{once:true});
   });
  }
  return {count:voices.length,voices:voices.slice(0,64)};
 });
 await run('userAgentData',async()=>{
  const uad=navigator.userAgentData;
  if(!uad)return undefined;
  const value={brands:uad.brands,mobile:uad.mobile,platform:uad.platform,highEntropy:null};
  if(typeof uad.getHighEntropyValues==='function'){
   try{value.highEntropy=await uad.getHighEntropyValues(
    ['architecture','bitness','model','platformVersion','fullVersionList','formFactor','wow64']);
   }catch(error){value.highEntropyError=String((error&&error.name)||'Error')}
  }
  return value;
 });
 await run('navigatorMisc',()=>{
  const nav=navigator;
  const value={
   webdriver:'webdriver' in nav?nav.webdriver:null,
   oscpu:nav.oscpu??null,
   deviceMemory:nav.deviceMemory??null,
   maxTouchPoints:nav.maxTouchPoints??null,
   cookieEnabled:nav.cookieEnabled??null,
   doNotTrack:nav.doNotTrack??null,
   globalPrivacyControl:nav.globalPrivacyControl??null,
   pdfViewerEnabled:nav.pdfViewerEnabled??null,
   vendor:nav.vendor??null,
   plugins:[],pluginsCount:0,mimeTypesCount:0,connection:null
  };
  try{value.plugins=Array.from(nav.plugins||[]).map(p=>p.name);
   value.pluginsCount=value.plugins.length;}catch(_){}
  try{value.mimeTypesCount=(nav.mimeTypes||[]).length}catch(_){}
  try{const c=nav.connection;
   if(c)value.connection={effectiveType:c.effectiveType??null,downlink:c.downlink??null,
    rtt:c.rtt??null,saveData:c.saveData??null};}catch(_){}
  return value;
 });
 await run('windowMetrics',()=>({
  innerWidth:window.innerWidth,innerHeight:window.innerHeight,
  outerWidth:window.outerWidth,outerHeight:window.outerHeight,
  availWidth:screen.availWidth,availHeight:screen.availHeight,
  pixelDepth:screen.pixelDepth
 }));
 await run('localeFormats',()=>{
  const resolved=Intl.DateTimeFormat().resolvedOptions();
  return {locale:resolved.locale,calendar:resolved.calendar??null,
   numberingSystem:resolved.numberingSystem??null,
   dateSample:new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'long'})
    .format(new Date(1735689600000)),
   numberSample:new Intl.NumberFormat().format(1234567.89)};
 });
 await run('storageEstimate',async()=>{
  if(!navigator.storage)return undefined;
  const value={estimate:null,persisted:null};
  if(typeof navigator.storage.estimate==='function')
   value.estimate=await navigator.storage.estimate();
  if(typeof navigator.storage.persisted==='function')
   value.persisted=await navigator.storage.persisted();
  return value;
 });
 await run('permissions',async()=>{
  if(!navigator.permissions||typeof navigator.permissions.query!=='function')
   return undefined;
  const names=['notifications','geolocation','camera','microphone',
   'clipboard-read','clipboard-write'];
  const states={};
  for(const name of names){
   try{const s=await navigator.permissions.query({name});states[name]=s.state}
   catch(error){states[name]='error:'+String((error&&error.name)||'Error')}
  }
  return states;
 });
 await run('keyboard',async()=>{
  if(!navigator.keyboard||typeof navigator.keyboard.getLayoutMap!=='function')
   return undefined;
  const map=await navigator.keyboard.getLayoutMap();
  return {layoutEntries:map.size};
 });
 await run('battery',async()=>{
  if(typeof navigator.getBattery!=='function')return undefined;
  const b=await navigator.getBattery();
  return {level:b.level,charging:b.charging};
 });
 await run('displayMedia',()=>{
  const query=(q)=>{try{return window.matchMedia(q).matches}catch(_){return null}};
  return {prefersDark:query('(prefers-color-scheme: dark)'),
   prefersLight:query('(prefers-color-scheme: light)'),
   reducedMotion:query('(prefers-reduced-motion: reduce)'),
   forcedColors:query('(forced-colors: active)'),
   contrastMore:query('(prefers-contrast: more)')};
 });
 await run('offscreenCanvas',()=>{
  if(typeof OffscreenCanvas==='undefined')return undefined;
  const c=new OffscreenCanvas(32,32);
  const ctx=c.getContext('2d');
  if(ctx){ctx.fillStyle='#123456';ctx.fillRect(0,0,32,32)}
  return {available:true,context2d:!!ctx};
 });
 return out;
}
const PROBE_POINT_DEFS=Object.freeze([
 ['webgl.vendorRenderer','4.3'],['webgl.extensions','4.3'],
 ['webgl.parameters','4.3'],['webgl.shaderPrecision','4.3'],
 ['webgl.renderHash','4.3'],['canvas2d.hash','4.3'],
 ['canvas2d.fontMetrics','4.3'],['audio.basic','4.3'],
 ['audio.offlineHash','4.3'],['fonts.detected','4.4'],
 ['media.devices','4.4'],['media.voices','4.4'],
 ['clientHints.low','4.2'],['clientHints.high','4.2'],
 ['navigator.misc','4.2'],['navigator.storageEstimate','4.2'],
 ['navigator.permissions','4.2'],['navigator.keyboard','4.2'],
 ['navigator.battery','4.2'],['window.metrics','4.2'],
 ['locale.formats','4.2'],['display.mediaQueries','4.2'],
 ['offscreenCanvas','4.3']
]);
function summarizeProbe(raw){
 if(!raw||typeof raw!=='object')throw Error('Raw extended probe result required');
 const group=(name)=>{
  const g=raw[name];
  if(!g||typeof g!=='object')return {status:'BLOCKED',error:'MissingProbeGroup'};
  if(g.status==='measured')return {status:'MEASURED',value:g.value};
  if(g.status==='unsupported')return {status:'UNSUPPORTED'};
  return {status:'BLOCKED',error:g.error||'Error'};
 };
 const points={};
 const put=(id,row,s)=>{points[id]={row,status:s.status,
  ...(s.value!==undefined?{value:s.value}:{}),
  ...(s.error?{error:s.error}:{})}};
 const webgl=group('webgl');
 if(webgl.status==='MEASURED'){
  const v=webgl.value;
  const source=v.unmasked?'debug-info':(v.masked?'masked-only':'none');
  const vendor=v.unmasked?v.unmasked.vendor:(v.masked?v.masked.vendor:null);
  const renderer=v.unmasked?v.unmasked.renderer:(v.masked?v.masked.renderer:null);
  put('webgl.vendorRenderer','4.3',{status:'MEASURED',
   value:{api:v.api,vendor,renderer,source,
    masked:v.masked||null,unmasked:v.unmasked||null}});
  put('webgl.extensions','4.3',Array.isArray(v.extensions)
   ?{status:'MEASURED',value:{count:v.extensions.length,list:v.extensions}}
   :{status:'BLOCKED',error:'ExtensionsUnavailable'});
  const paramEntries=Object.entries(v.params||{});
  const measuredParams=paramEntries.filter(([,x])=>x!==null).map(([k])=>k);
  put('webgl.parameters','4.3',{status:'MEASURED',value:{
   measured:measuredParams,
   unavailable:paramEntries.filter(([,x])=>x===null).map(([k])=>k),
   values:v.params,anisotropy:v.anisotropy??null}});
  put('webgl.shaderPrecision','4.3',{status:'MEASURED',value:v.precision});
  put('webgl.renderHash','4.3',v.renderHash
   ?{status:'MEASURED',value:{renderHash:v.renderHash,
     renderDataUrlHash:v.renderDataUrlHash}}
   :{status:'BLOCKED',error:'RenderTaskFailed'});
 }else{
  for(const id of ['webgl.vendorRenderer','webgl.extensions','webgl.parameters',
   'webgl.shaderPrecision','webgl.renderHash'])
   put(id,'4.3',webgl);
 }
 const canvas=group('canvas2d');
 if(canvas.status==='MEASURED'){
  put('canvas2d.hash','4.3',{status:'MEASURED',value:{
   pixelHash:canvas.value.pixelHash,dataUrlHash:canvas.value.dataUrlHash,
   decodedPixelHash:canvas.value.decodedPixelHash,
   exportsConsistent:canvas.value.exportsConsistent}});
  put('canvas2d.fontMetrics','4.3',{status:'MEASURED',
   value:canvas.value.textMetrics});
 }else{
  put('canvas2d.hash','4.3',canvas);put('canvas2d.fontMetrics','4.3',canvas);
 }
 const audioBasic=group('audioBasic');
 put('audio.basic','4.3',audioBasic);
 const audioOffline=group('audioOfflineHash');
 if(audioOffline.status==='MEASURED'){
  put('audio.offlineHash','4.3',{status:'MEASURED',value:{
   ...audioOffline.value,
   methodNote:'OfflineAudioContext rendered-buffer sample sum: a property '+
    'of the offline rendering pipeline implementation, NOT a direct '+
    'measurement of sound-card hardware error (Constitution Section 18).'}});
 }else put('audio.offlineHash','4.3',audioOffline);
 const fonts=group('fonts');
 if(fonts.status==='MEASURED'){
  put('fonts.detected','4.4',{status:'MEASURED',value:{
   ...fonts.value,
   methodNote:'Width-comparison probing result only; not the machine '+
    'full font inventory (Constitution Section 18).'}});
 }else put('fonts.detected','4.4',fonts);
 put('media.devices','4.4',group('mediaDevices'));
 put('media.voices','4.4',group('voices'));
 const uad=group('userAgentData');
 if(uad.status==='MEASURED'){
  put('clientHints.low','4.2',{status:'MEASURED',value:{
   brands:uad.value.brands,mobile:uad.value.mobile,platform:uad.value.platform}});
  put('clientHints.high','4.2',uad.value.highEntropy
   ?{status:'MEASURED',value:uad.value.highEntropy}
   :{status:'BLOCKED',error:uad.value.highEntropyError||'HighEntropyUnavailable'});
 }else{
  put('clientHints.low','4.2',uad);put('clientHints.high','4.2',uad);
 }
 put('navigator.misc','4.2',group('navigatorMisc'));
 put('navigator.storageEstimate','4.2',group('storageEstimate'));
 put('navigator.permissions','4.2',group('permissions'));
 put('navigator.keyboard','4.2',group('keyboard'));
 put('navigator.battery','4.2',group('battery'));
 put('window.metrics','4.2',group('windowMetrics'));
 put('locale.formats','4.2',group('localeFormats'));
 put('display.mediaQueries','4.2',group('displayMedia'));
 put('offscreenCanvas','4.3',group('offscreenCanvas'));
 const counts={MEASURED:0,UNSUPPORTED:0,BLOCKED:0};
 for(const point of Object.values(points))counts[point.status]++;
 return {points,counts,total:Object.keys(points).length};
}
function webglExpectationResult(expectations,webglPoint){
 if(!expectations||typeof expectations!=='object')
  throw Error('Identity expectations required');
 if(!webglPoint||typeof webglPoint!=='object')
  throw Error('WebGL probe point required');
 const observed=webglPoint.status==='MEASURED'&&webglPoint.value
  ?webglPoint.value:null;
 const fields={};
 for(const [expectedKey,observedKey] of
  [['webglVendor','vendor'],['webglRenderer','renderer']]){
  const expected=expectations[expectedKey]??null;
  const seen=observed?observed[observedKey]??null:null;
  fields[expectedKey]={expected,observed:seen,
   match:expected===null||seen===null?null:expected===seen};
 }
 const compared=Object.values(fields).filter(f=>f.match!==null);
 return {fields,compared:compared.length,
  pass:compared.length>0&&compared.every(f=>f.match===true),
  status:webglPoint.status};
}
/**
 * Extended isolation conditions (Constitution Section 17.2). The classic
 * stageStorageResult covers sequential writes + clean restart. The builders
 * below judge the protocol steps run.js never exercised: simultaneous and
 * interleaved cross-writes while both profiles are open, engine-process
 * kill mid-session, profile-directory snapshot/restore, and HTTP/favicon
 * cache partitioning. All markers are synthetic; observations are plain
 * field->value maps produced by the runner. A builder never upgrades a
 * missing observation into a pass: absent data throws.
 */
const ISO_FIELDS=Object.freeze(['cookie','localStorage','indexedDB','cacheStorage','serviceWorker']);
function assertObservation(value,name){
 if(!value||typeof value!=='object')throw Error('Missing observation '+name);
 for(const field of ISO_FIELDS)
  if(!(field in value))throw Error('Missing observation '+name+'.'+field);
 return value;
}
function assertDistinctMarkers(markers){
 const values=Object.values(markers||{});
 if(values.length<2||values.some(v=>typeof v!=='string'||!v)||
    new Set(values).size!==values.length)
  throw Error('Distinct synthetic markers required');
 return markers;
}
function concurrentIsolationResult(rounds,markers){
 assertDistinctMarkers(markers);
 const first={a:assertObservation(rounds?.afterFirst?.a,'afterFirst.a'),
  b:assertObservation(rounds?.afterFirst?.b,'afterFirst.b')};
 const second={a:assertObservation(rounds?.afterSecond?.a,'afterSecond.a'),
  b:assertObservation(rounds?.afterSecond?.b,'afterSecond.b')};
 const checks={};
 for(const field of ISO_FIELDS){
  checks[field]={
   aOwnAfterSimultaneousWrite:first.a[field]===markers.a1,
   bOwnAfterSimultaneousWrite:first.b[field]===markers.b1,
   aOwnAfterCrossWrite:second.a[field]===markers.a2,
   bOwnAfterCrossWrite:second.b[field]===markers.b2
  };
 }
 return {pass:Object.values(checks).every(x=>Object.values(x).every(Boolean)),checks};
}
function crashRecoveryResult(observations,markers){
 assertDistinctMarkers(markers);
 const aBefore=assertObservation(observations?.aBefore,'aBefore');
 const aAfter=assertObservation(observations?.aAfter,'aAfter');
 const bBefore=assertObservation(observations?.bBefore,'bBefore');
 const bAfter=assertObservation(observations?.bAfter,'bAfter');
 const checks={};
 for(const field of ISO_FIELDS){
  checks[field]={
   aHadMarkerBeforeCrash:aBefore[field]===markers.a,
   aMarkerIntactAfterCrash:aAfter[field]===markers.a,
   bUnchangedByCrashOfA:bAfter[field]===markers.b&&bBefore[field]===markers.b
  };
 }
 return {pass:Object.values(checks).every(x=>Object.values(x).every(Boolean)),checks};
}
function restoreIsolationResult(observations,markers){
 assertDistinctMarkers(markers);
 const restored=assertObservation(observations?.restored,'restored');
 const other=assertObservation(observations?.other,'other');
 const checks={};
 for(const field of ISO_FIELDS){
  checks[field]={
   restoredEqualsSnapshot:restored[field]===markers.snapshot,
   restoredExcludesPostSnapshot:restored[field]!==markers.postSnapshot,
   restoredExcludesOtherProfile:restored[field]!==markers.other,
   otherProfileUnaffected:other[field]===markers.other
  };
 }
 return {pass:Object.values(checks).every(x=>Object.values(x).every(Boolean)),checks};
}
function httpCacheIsolationResult(observations){
 if(!observations||typeof observations!=='object')
  throw Error('Missing cache observations');
 for(const key of ['hitsAfterAFirst','hitsAfterASecond','hitsAfterBFirst'])
  if(!Number.isInteger(observations[key])||observations[key]<0)
   throw Error('Missing cache observation '+key);
 for(const key of ['bodyAFirst','bodyASecond','bodyBFirst','aEtag','revalidationEtagSeen'])
  if(typeof observations[key]!=='string'||!observations[key])
   throw Error('Missing cache observation '+key);
 const checks={
  aSecondLoadServedFromOwnCache:observations.hitsAfterASecond===observations.hitsAfterAFirst&&
   observations.bodyASecond===observations.bodyAFirst,
  bFetchedFreshFromServer:observations.hitsAfterBFirst===observations.hitsAfterASecond+1,
  bBodyDiffersFromA:observations.bodyBFirst!==observations.bodyAFirst,
  aRevalidationPresentsOwnEtag:observations.revalidationEtagSeen===observations.aEtag
 };
 return {pass:Object.values(checks).every(Boolean),checks};
}
function faviconCacheResult(observations){
 if(!observations||!Number.isInteger(observations.hitsAfterA)||
    !Number.isInteger(observations.hitsAfterB)||
    observations.hitsAfterA<0||observations.hitsAfterB<observations.hitsAfterA)
  throw Error('Missing favicon observations');
 // measurable=false means the engine never requested a favicon at all in
 // this automation mode; the runner must report NOT_RUN, not FAIL or PASS.
 const measurable=observations.hitsAfterA>0;
 const checks={
  aFetchedFavicon:measurable,
  bFetchedOwnFavicon:observations.hitsAfterB>observations.hitsAfterA
 };
 return {measurable,pass:measurable&&checks.bFetchedOwnFavicon,checks};
}
module.exports={FIELDS,safeOptions,stageStorageResult,digestFile,
 IDENTITY_FIELD_MAP,identityExpectationResult,
 extendedProbe,summarizeProbe,webglExpectationResult,PROBE_POINT_DEFS,
 ISO_FIELDS,concurrentIsolationResult,crashRecoveryResult,
 restoreIsolationResult,httpCacheIsolationResult,faviconCacheResult};
