'use strict';
const assert=require('node:assert/strict');
const {stageStorageResult,safeOptions,FIELDS,identityExpectationResult}=require('./core');
const markers={a:'a-synthetic',b:'b-synthetic'};
const left=Object.fromEntries(FIELDS.map(x=>[x,markers.a]));
const right=Object.fromEntries(FIELDS.map(x=>[x,markers.b]));
const empty=Object.fromEntries(FIELDS.map(x=>[x,null]));
assert.equal(stageStorageResult(empty,left,right,left,right,markers).pass,true);
assert.equal(stageStorageResult({...empty,cookie:markers.a},left,right,left,right,markers).pass,false);
assert.equal(stageStorageResult(empty,left,{...right,indexedDB:markers.a},left,right,markers).pass,false);
assert.equal(stageStorageResult(empty,left,right,{...left,cacheStorage:null},right,markers).pass,false);
assert.throws(()=>safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'bad'}),/digest/);
assert.equal(safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'A'.repeat(64)}).expectedSha256,'a'.repeat(64));
assert.throws(()=>stageStorageResult(empty,left,right,left,right,{a:'same',b:'same'}),/Distinct/);
// Identity expectation contract: a configured profile must expose exactly
// the values its pinned identity declares, field by field.
const expectations={userAgent:'UA-A',platform:'Win32',language:'en-US',
 timezone:'America/New_York',screenWidth:1920,screenHeight:1080,
 hardwareConcurrency:8,webglVendor:null,webglRenderer:null};
const observed={userAgent:'UA-A',platform:'Win32',language:'en-US',
 timezone:'America/New_York',screen:{width:1920,height:1080},hardwareConcurrency:8};
const good=identityExpectationResult(expectations,observed);
assert.equal(good.pass,true);
assert.equal(good.fields.webglVendor,undefined,'webgl is not captured by this probe and must not be compared');
assert.equal(identityExpectationResult(expectations,
 {...observed,timezone:'Asia/Tokyo'}).pass,false);
assert.equal(identityExpectationResult(expectations,
 {...observed,screen:{width:1366,height:1080}}).fields.screenWidth.match,false);
assert.equal(identityExpectationResult(expectations,
 {...observed,userAgent:'UA-B'}).fields.userAgent.match,false);
assert.throws(()=>identityExpectationResult(null,observed),/expectations/);
// Extended runtime probe contracts (Agent 5): the probe function must be
// self-contained (it is serialised into the page), summarisation must keep
// every point's status separate, and WebGL expectations are compared by
// the dedicated function only.
const {extendedProbe,summarizeProbe,webglExpectationResult,PROBE_POINT_DEFS}=require('./core');
assert.equal(typeof extendedProbe,'function');
const probeSource=extendedProbe.toString();
assert.ok(!/require\(|module\.exports|process\./.test(probeSource),
 'extendedProbe must not reference Node-side scope');
assert.ok(!/^\s*async function extendedProbe/.test('')&&probeSource.length>1000);
const rawFixture={
 webgl:{status:'measured',value:{api:'webgl2',
  masked:{vendor:'Mozilla',renderer:'Generic'},
  unmasked:{vendor:'VendorX',renderer:'RendererY'},
  extensions:['EXT_a','WEBGL_debug_renderer_info'],
  params:{maxTextureSize:8192,maxViewportDims:[8192,8192],maxVertexAttribs:null},
  anisotropy:16,precision:{VERTEX_SHADER:{HIGH_FLOAT:{precision:23,rangeMin:127,rangeMax:127}}},
  renderHash:'abcd1234',renderDataUrlHash:'ef567890'}},
 canvas2d:{status:'measured',value:{pixelHash:'1111aaaa',dataUrlHash:'2222bbbb',
  decodedPixelHash:'1111aaaa',exportsConsistent:true,
  textMetrics:{'sans-serif':{width:612.5,actualBoundingBoxAscent:24,actualBoundingBoxDescent:6}}}},
 audioBasic:{status:'measured',value:{sampleRate:48000,state:'suspended',
  baseLatency:0.005333,outputLatency:null,maxChannelCount:2,channelCount:2}},
 audioOfflineHash:{status:'unsupported'},
 fonts:{status:'measured',value:{tested:48,detected:['Arial','Verdana']}},
 mediaDevices:{status:'measured',value:{total:0,byKind:{},labelsPresent:0,
  labelsEmpty:0,groupIdsPresent:0}},
 voices:{status:'measured',value:{count:0,voices:[]}},
 userAgentData:{status:'unsupported'},
 navigatorMisc:{status:'measured',value:{webdriver:false,pluginsCount:5}},
 storageEstimate:{status:'blocked',error:'NotAllowedError'},
 permissions:{status:'measured',value:{notifications:'prompt',
  geolocation:'error:TypeError'}},
 keyboard:{status:'unsupported'},
 battery:{status:'unsupported'},
 windowMetrics:{status:'measured',value:{innerWidth:1280,innerHeight:900,
  outerWidth:1296,outerHeight:990,availWidth:1920,availHeight:1040,pixelDepth:24}},
 localeFormats:{status:'measured',value:{locale:'en-US',calendar:'gregory',
  numberingSystem:'latn',dateSample:'x',numberSample:'1,234,567.89'}},
 displayMedia:{status:'measured',value:{prefersDark:false,prefersLight:true,
  reducedMotion:false,forcedColors:false,contrastMore:false}},
 offscreenCanvas:{status:'measured',value:{available:true,context2d:true}}
};
const summary=summarizeProbe(rawFixture);
assert.equal(summary.total,PROBE_POINT_DEFS.length);
assert.equal(summary.points['webgl.vendorRenderer'].value.vendor,'VendorX');
assert.equal(summary.points['webgl.vendorRenderer'].value.source,'debug-info');
assert.equal(summary.points['webgl.extensions'].value.count,2);
assert.deepEqual(summary.points['webgl.parameters'].value.unavailable,['maxVertexAttribs']);
assert.equal(summary.points['canvas2d.hash'].value.exportsConsistent,true);
assert.equal(summary.points['audio.offlineHash'].status,'UNSUPPORTED');
assert.equal(summary.points['clientHints.low'].status,'UNSUPPORTED');
assert.equal(summary.points['clientHints.high'].status,'UNSUPPORTED');
assert.equal(summary.points['navigator.storageEstimate'].status,'BLOCKED');
assert.equal(summary.points['navigator.keyboard'].status,'UNSUPPORTED');
assert.match(summary.points['fonts.detected'].value.methodNote,/probing result only/);
assert.equal(summary.counts.MEASURED+summary.counts.UNSUPPORTED+summary.counts.BLOCKED,
 summary.total);
assert.throws(()=>summarizeProbe(null),/Raw extended probe/);
const webglPoint=summary.points['webgl.vendorRenderer'];
assert.equal(webglExpectationResult(
 {webglVendor:'VendorX',webglRenderer:'RendererY'},webglPoint).pass,true);
assert.equal(webglExpectationResult(
 {webglVendor:'Other',webglRenderer:'RendererY'},webglPoint)
 .fields.webglVendor.match,false);
assert.equal(webglExpectationResult(
 {webglVendor:null,webglRenderer:null},webglPoint).compared,0);
assert.equal(webglExpectationResult(expectations,
 {status:'UNSUPPORTED'}).pass,false);
assert.throws(()=>webglExpectationResult(null,webglPoint),/expectations/);
console.log('Stage-0 contract: PASS (incl. extended probe contracts); real Windows browser measurements NOT_RUN');
