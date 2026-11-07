'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {createMcpHandler,allowedSerials,parseAvdBindings}=require('../src/android/mcpReadOnly');

let calls={avds:0,devices:0,inspections:0};
let rawSecret='otp 123456 account@private.example';
let avdOwner='Pixel_Test_01';
const manager={
  tool:name=>name==='adb'?'adb.exe':null,
  run:async (_adb,args)=>{
    if(args.includes('emu') && args.includes('name'))
      return avdOwner+'\nOK\n';
    throw Error('Unexpected ADB operation');
  },
  avds:async()=>{calls.avds++;return ['Pixel_Test_01','Other_Private_Profile','bad;evil']},
  devices:async()=>{calls.devices++;return [
    {serial:'emulator-5554',status:'device',kind:'emulator',model:'Sensitive Person Name',product:rawSecret},
    {serial:'ABCD',status:'unauthorized',kind:'physical',model:'Secret 2'}
  ]}
};
let late;
const inspector={
  inspect:async serial=>{
    calls.inspections++;
    if(serial!=='emulator-5554')throw Error('Sensitive read exception '+rawSecret);
    if(late)await late;
    return {
      serial,capturedAt:123,
      totalNodes:2,actionableCount:1,truncated:false,privacy:'geometry-only',
      extraSecret:rawSecret,
      elements:[{index:1,type:'Button',role:'button',hint:'search',
        rawText:rawSecret,bounds:{
          x:80,y:90,width:100,height:40,left:30,top:70,right:130,bottom:110
        }}]
    };
  }
};
const handler=createMcpHandler({manager,inspector,
  allowedSerials:['emulator-5554'],
  avdBindings:'emulator-5554=Pixel_Test_01'
});
assert.deepEqual([...allowedSerials('emulator-5554, PHONE')],['emulator-5554','PHONE']);
assert.deepEqual([...allowedSerials('')],[]);
assert.deepEqual([...allowedSerials(undefined)],[]);
assert.throws(()=>allowedSerials('emulator-5554;rm -rf /'),/Invalid/);
assert.throws(()=>allowedSerials(Array(9).fill('emulator-5554')),/At most 8/);
assert.deepEqual([...parseAvdBindings('emulator-5554=Pixel_Test_01')],
  [['emulator-5554','Pixel_Test_01']]);
assert.equal(parseAvdBindings(undefined).size,0);
for(const wrong of [
  'PHONE=Personal','emulator-5554=../Other',
  'emulator-5554=Pixel_Test_01,emulator-5554=Other',
  'emulator-5554=Pixel_Test_01,emulator-5556=Pixel_Test_01',
  'emulator-5554=Pixel_Test_01;rm',
  'emulator-5554=Pixel Test',
  'emulator-5554=Pixel=Test'
])assert.throws(()=>parseAvdBindings(wrong),Error);
assert.throws(()=>parseAvdBindings(Array(9).fill(
  'emulator-5554=Pixel_Test_01')),/At most eight/);

const ask=(id,method,params)=>handler.handle({jsonrpc:'2.0',id,method,params});
(async()=>{
  assert.equal((await ask(1,'tools/list',{})).error.code,-32000);
  const init=await ask(2,'initialize',{
    protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'1'},capabilities:{}
  });
  assert.equal(init.result.protocolVersion,'2025-06-18');
  assert.equal(init.result.capabilities.tools.listChanged,false);
  assert.equal((await ask(3,'ping',{})).result!==undefined,true);
  assert.equal(await handler.handle({jsonrpc:'2.0',method:'notifications/initialized'}),null);
  const tools=await ask(4,'tools/list',{});
  assert.equal(tools.result.tools.length,4);
  assert.deepEqual(tools.result.tools.map(x=>x.name),[
    'android_list_devices','android_list_avds','android_inspect_ui','android_capabilities'
  ]);
  assert(tools.result.tools.every(x=>x.annotations.readOnlyHint===true));
  assert(!tools.result.tools.some(x=>/tap|swipe|install|screenshot|shell|execute|approve/.test(x.name)));
  const decode=message=>JSON.parse(message.result.content[0].text);
  const caps=await ask(5,'tools/call',{name:'android_capabilities',arguments:{}});
  assert.equal(decode(caps).actions,'disabled');
  assert.equal(decode(caps).authorizedDeviceCount,1);
  assert.equal(decode(caps).deviceAccess,'serial-and-avd-identity-bound');
  assert.equal(decode(caps).privateProfileNamesHidden,true);
  const dev=decode(await ask(6,'tools/call',{name:'android_list_devices',arguments:{}}));
  assert.equal(dev.devices.length,1);
  assert.equal(dev.devices[0].serial,'emulator-5554');
  assert(!JSON.stringify(dev).includes('Sensitive'));
  assert(!JSON.stringify(dev).includes(rawSecret));
  const avds=decode(await ask(7,'tools/call',{name:'android_list_avds',arguments:{}}));
  assert.deepEqual(avds.avds,['Pixel_Test_01']);
  assert(!JSON.stringify(avds).includes('Other_Private_Profile'));
  const ui=decode(await ask(8,'tools/call',{name:'android_inspect_ui',
    arguments:{serial:'emulator-5554'}}));
  assert.equal(ui.privacy,'geometry-only');
  assert.equal(ui.elements[0].role,'button');
  assert.equal(ui.elements[0].hint,'search');
  assert.equal(ui.elements[0].bounds.x,80);
  assert(!JSON.stringify(ui).includes(rawSecret));
  assert(!JSON.stringify(ui).includes('left')); // No extra coordinates
  // ADB serials are recycled! A new profile on emulator-5554 MUST NOT
  // inherit the old allowlist or expose another AVD's UI / AVD names.
  avdOwner='Other_Private_Profile';
  const swappedDev=decode(await ask(91,'tools/call',{
    name:'android_list_devices',arguments:{}
  }));
  assert.deepEqual(swappedDev.devices,[]);
  const swappedAvds=decode(await ask(92,'tools/call',{
    name:'android_list_avds',arguments:{}
  }));
  assert.deepEqual(swappedAvds.avds,[]);
  const leaked=await ask(93,'tools/call',{
    name:'android_inspect_ui',arguments:{serial:'emulator-5554'}
  });
  assert.equal(leaked.result.isError,true);
  assert(!JSON.stringify(leaked).includes(rawSecret));
  assert(!JSON.stringify(leaked).includes('Other_Private_Profile'));
  avdOwner='Pixel_Test_01';

  const serialOnly=createMcpHandler({manager,inspector,
    allowedSerials:['emulator-5554'],avdBindings:''});
  await serialOnly.handle({jsonrpc:'2.0',id:80,method:'initialize',
    params:{protocolVersion:'2025-06-18'}});
  const deniedAvds=await serialOnly.handle({jsonrpc:'2.0',id:81,
    method:'tools/call',params:{name:'android_list_avds',arguments:{}}});
  assert.deepEqual(JSON.parse(deniedAvds.result.content[0].text).avds,[]);
  const deniedDevices=await serialOnly.handle({jsonrpc:'2.0',id:82,
    method:'tools/call',params:{name:'android_list_devices',arguments:{}}});
  assert.deepEqual(JSON.parse(deniedDevices.result.content[0].text).devices,[]);
  const deniedUi=await serialOnly.handle({jsonrpc:'2.0',id:83,
    method:'tools/call',params:{name:'android_inspect_ui',
      arguments:{serial:'emulator-5554'}}});
  assert.equal(deniedUi.result.isError,true);
  assert(!JSON.stringify(deniedUi).includes(rawSecret));

  // Cross-device switch mid-inspection: the *second* identity check must
  // refuse returning stale geometry from a different profile.
  let allowFinish;
  late=new Promise(resolve=>{allowFinish=resolve;});
  const midRead=ask(94,'tools/call',{name:'android_inspect_ui',
    arguments:{serial:'emulator-5554'}});
  await new Promise(resolve=>setImmediate(resolve));
  avdOwner='Other_Private_Profile';
  allowFinish();
  const changed=await midRead;
  assert.equal(changed.result.isError,true);
  assert(!JSON.stringify(changed).includes(rawSecret));
  avdOwner='Pixel_Test_01';
  late=null;

  const denied=await ask(9,'tools/call',{name:'android_touch',arguments:{serial:'emulator-5554'}});
  assert.equal(denied.result.isError,true);
  assert.equal(denied.result.content[0].text,'Tool is not exposed');
  const malformed=await ask(10,'tools/call',{name:'android_inspect_ui',
    arguments:{serial:'emulator-5554',command:'reboot'}});
  assert.equal(malformed.result.isError,true);
  assert.equal(malformed.result.content[0].text,'Invalid arguments');
  const inaccessible=await ask(11,'tools/call',{name:'android_inspect_ui',
    arguments:{serial:'ABCD'}});
  assert.equal(inaccessible.result.isError,true);
  assert(!JSON.stringify(inaccessible).includes(rawSecret));
  assert.equal(inaccessible.result.content[0].text,'Device not permitted by LHM MCP allowlist');
  const unconfigured=createMcpHandler({manager,inspector,allowedSerials:[]});
  const initNew=await unconfigured.handle({jsonrpc:'2.0',id:41,method:'initialize',
    params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test'}}});
  assert.equal(initNew.result.protocolVersion,'2025-06-18');
  const hidden=await unconfigured.handle({jsonrpc:'2.0',id:42,method:'tools/call',
    params:{name:'android_list_devices',arguments:{}}});
  assert.deepEqual(JSON.parse(hidden.result.content[0].text).devices,[]);
  const refused=await unconfigured.handle({jsonrpc:'2.0',id:43,method:'tools/call',
    params:{name:'android_inspect_ui',arguments:{serial:'emulator-5554'}}});
  assert.equal(refused.result.isError,true);
  const unsafe=await ask(12,'tools/call',{name:'android_inspect_ui',
    arguments:{serial:'evil;rm -rf'}});
  assert.equal(unsafe.result.isError,true);
  assert.equal(unsafe.result.content[0].text,'Invalid serial');
  assert.equal((await ask(13,'some-other-method',{})).error.code,-32601);
  assert.equal((await handler.handle({jsonrpc:'1.0',id:14,method:'tools/list'})).error.code,-32600);
  assert.equal((await handler.handle({jsonrpc:'2.0',id:null,method:'tools/list'})).error.code,-32600);

  let release;
  late=new Promise(resolve=>release=resolve);
  const work=ask(15,'tools/call',{name:'android_inspect_ui',arguments:{serial:'emulator-5554'}});
  await new Promise(resolve=>setImmediate(resolve));
  const busy=await ask(16,'tools/call',{name:'android_list_devices',arguments:{}});
  assert.equal(busy.result.isError,true);
  assert.equal(busy.result.content[0].text,'Android read busy');
  release();await work;late=null;

  // Test actual stdio framed operation without depending on Android SDK.
  const child=spawn(process.execPath,[path.join(__dirname,'../bin/lhm-android-mcp.js')],{
    stdio:['pipe','pipe','pipe'],windowsHide:true
  });
  let out='',err='';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>out+=chunk);
  child.stderr.on('data',chunk=>err+=chunk);
  const messages=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{
      protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}
    }},
    {jsonrpc:'2.0',method:'notifications/initialized'},
    {jsonrpc:'2.0',id:2,method:'tools/list',params:{}},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{
      name:'android_capabilities',arguments:{}
    }}
  ];
  child.stdin.end(messages.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const exit=await Promise.race([
    new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('close',code=>resolve(code));
    }),
    new Promise((_,reject)=>setTimeout(()=>{child.kill();reject(Error('stdio MCP timed out'))},5000))
  ]);
  assert.equal(exit,0,'MCP child exited with stderr: '+err.slice(0,150));
  const lines=out.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.deepEqual(lines.map(x=>x.id),[1,2,3]);
  assert.equal(lines[1].result.tools.length,4);
  assert.equal(JSON.parse(lines[2].result.content[0].text).scope,'read-only');
  assert.equal(err,'');
  console.log('LHM Android local read-only MCP handshake, security and stdio tests: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
