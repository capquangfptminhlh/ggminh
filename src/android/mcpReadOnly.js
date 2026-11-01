'use strict';

/**
 * LHM Android MCP stdio — intentionally read-only.
 * No socket listener, no screenshots, no device writes and no remote AI calls.
 * Interactive control remains exclusively behind Electron's native approvals.
 */
const readline = require('node:readline');
const {AndroidManager} = require('./androidManager');
const {AndroidControl} = require('./androidControl');
const {AndroidUIInspector} = require('./uiInspector');

const NAME='lhm-android-readonly';
const VERSION='0.1.0';
const PROTOCOL='2025-06-18';
const MAX_LINE_BYTES=64*1024;
const MAX_IN_FLIGHT=1;
const SAFE_SERIAL=/^[A-Za-z0-9._:-]{1,128}$/;
const TOOLS=Object.freeze([
  {
    name:'android_list_devices',
    title:'List connected Android devices',
    description:'Read-only: list ADB-attached Android devices and authorization states. Does not start Android or act on devices.',
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:{
      type:'object',properties:{},additionalProperties:false
    }
  },
  {
    name:'android_list_avds',
    title:'List configured Android virtual devices',
    description:'Read-only: list existing local Android Virtual Device names. Does not create, launch or stop them.',
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:{
      type:'object',properties:{},additionalProperties:false
    }
  },
  {
    name:'android_inspect_ui',
    title:'Inspect Android UI geometry',
    description:'Read-only: inspect an ADB-authorized device and return bounded widget types, roles, safe navigation hints and screen bounds. Never returns UI text, passwords, screenshots or account identifiers. Android controls require separate human approval inside LHM.',
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:{
      type:'object',
      properties:{
        serial:{type:'string',minLength:1,maxLength:128,description:'Exact ADB serial for one currently authorized device'}
      },
      required:['serial'],additionalProperties:false
    }
  },
  {
    name:'android_capabilities',
    title:'LHM Android MCP capabilities',
    description:'Read-only: return which Android tools are exposed to this agent connection; no write operations available.',
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:{
      type:'object',properties:{},additionalProperties:false
    }
  }
]);

const TOOL_NAMES=new Set(TOOLS.map(t=>t.name));
function cleanId(id) {
  if(typeof id==='number' && Number.isSafeInteger(id)) return id;
  if(typeof id==='string' && id.length>=1 && id.length<=128) return id;
  return null;
}
function paramsObject(args,allowedKeys=[]) {
  if(args===undefined)args={};
  if(args===null || typeof args!=='object' || Array.isArray(args) ||
      Object.keys(args).some(key=>!allowedKeys.includes(key)))
    throw Error('Invalid tool arguments');
  return args;
}
function textResult(data) {
  return {content:[{type:'text',text:JSON.stringify(data)}],isError:false};
}
function errorResult(message) {
  return {content:[{type:'text',text:message}],isError:true};
}
function redactDevice(device) {
  return {
    serial:String(device.serial||'').slice(0,128),
    status:['device','offline','unauthorized','recovery','sideload','bootloader'].includes(device.status)?
      device.status:'unknown',
    kind:device.kind==='emulator'?'emulator':'physical'
  };
}
function redactUI(result) {
  // Whitelist a safe return shape independent of upstream additions.
  const elements=Array.isArray(result.elements)?result.elements:[];
  return {
    privacy:'geometry-only',
    totalNodes:Number.isInteger(result.totalNodes)?result.totalNodes:0,
    actionableCount:Number.isInteger(result.actionableCount)?result.actionableCount:0,
    truncated:result.truncated===true,
    elements:elements.slice(0,120).map(n=>({
      index:Number.isInteger(n.index)?n.index:0,
      type:typeof n.type==='string'?n.type.slice(0,64):'View',
      role:typeof n.role==='string'?n.role.slice(0,24):'interactive-view',
      hint:typeof n.hint==='string'&&['back','home','search','menu','close','next'].includes(n.hint)?n.hint:null,
      bounds:{
        x:Number.isInteger(n.bounds?.x)?n.bounds.x:0,
        y:Number.isInteger(n.bounds?.y)?n.bounds.y:0,
        width:Number.isInteger(n.bounds?.width)?n.bounds.width:0,
        height:Number.isInteger(n.bounds?.height)?n.bounds.height:0
      }
    }))
  };
}

function createMcpHandler(options={}) {
  const manager=options.manager||new AndroidManager();
  const inspector=options.inspector||new AndroidUIInspector(new AndroidControl(manager));
  let initialized=false;
  let busy=false;
  let calls=0;

  async function tool(name,args) {
    if(!TOOL_NAMES.has(name))throw Error('Unknown or unauthorized Android tool');
    if(busy)throw Error('Another Android read is still running');
    busy=true;
    try {
      if(name==='android_capabilities') {
        paramsObject(args);
        return {name:NAME,transport:'stdio',scope:'read-only',
          actions:'disabled',
          noScreenshots:true,
          noRemoteListener:true,
          tools:TOOLS.map(x=>x.name)};
      }
      if(name==='android_list_avds') {
        paramsObject(args);
        const names=await manager.avds();
        return {avds:names.filter(n=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(n)).slice(0,50)};
      }
      if(name==='android_list_devices') {
        paramsObject(args);
        const devices=await manager.devices();
        return {devices:devices.slice(0,30).map(redactDevice)};
      }
      const inputs=paramsObject(args,['serial']);
      if(typeof inputs.serial!=='string'||!SAFE_SERIAL.test(inputs.serial))
        throw Error('Specify one valid Android device serial');
      const result=await inspector.inspect(inputs.serial);
      return redactUI(result);
    }finally {busy=false;calls++;}
  }

  async function handle(request) {
    if(!request || typeof request!=='object' || Array.isArray(request) ||
        request.jsonrpc!=='2.0' || typeof request.method!=='string')
      return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}};
    // MCP notifications have no response.
    const id=request.id===undefined ? undefined:cleanId(request.id);
    if(request.id===undefined) return null;
    if(id===null) return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid id'}};
    const respond=result=>({jsonrpc:'2.0',id,result});
    const fault=(code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
    if(request.method==='initialize') {
      if(!request.params || typeof request.params!=='object' ||
         typeof request.params.protocolVersion!=='string')return fault(-32602,'Invalid initialize parameters');
      initialized=true;
      // A server may negotiate down to its supported version.
      return respond({
        protocolVersion:PROTOCOL,
        capabilities:{tools:{listChanged:false}},
        serverInfo:{name:NAME,version:VERSION},
        instructions:'Read-only local Android metadata only. All Android taps, typing, installs, screenshots and Agent steps require separate operator approval inside the LHM Electron app.'
      });
    }
    if(request.method==='ping')return respond({});
    if(!initialized)return fault(-32000,'MCP initialize required');
    if(request.method==='tools/list') {
      return respond({tools:TOOLS.map(x=>({...x}))});
    }
    if(request.method==='tools/call') {
      const params=request.params;
      if(!params||typeof params!=='object'||Array.isArray(params)||
         typeof params.name!=='string')
        return fault(-32602,'Invalid tool call');
      try {return respond(textResult(await tool(params.name,params.arguments)));}
      catch(error){
        // Do not leak raw subprocess stdout, exception traces, serials or
        // secret UI content to any model provider.
        const msg=String(error?.message||'');
        const safe=msg==='Unknown or unauthorized Android tool'?'Tool is not exposed':
          msg==='Another Android read is still running'?'Android read busy':
          msg==='Specify one valid Android device serial'?'Invalid serial':
          msg==='Invalid tool arguments'?'Invalid arguments':
          'Android read unavailable; verify local SDK, ADB authorization and device screen';
        return respond(errorResult(safe));
      }
    }
    return fault(-32601,'Method not found');
  }
  return {handle,tools:TOOLS,getStats:()=>({calls,initialized})};
}

function startStdio({stdin=process.stdin,stdout=process.stdout,handler=createMcpHandler()}={}) {
  // Zero HTTP listeners. stdout is exclusively newline-delimited MCP JSON.
  let buffer='';
  let dropping=false;
  const queue=[];
  let pumping=false;
  const write=response=>{
    if(response!==null && response!==undefined)stdout.write(JSON.stringify(response)+'\n');
  };
  async function drain() {
    if(pumping)return;
    pumping=true;
    while(queue.length) {
      const line=queue.shift();
      try {
        const msg=JSON.parse(line);
        write(await handler.handle(msg));
      }catch(_) {
        write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});
      }
    }
    pumping=false;
  }
  stdin.setEncoding('utf8');
  stdin.on('data',chunk=>{
    buffer+=chunk;
    // Never allocate unbounded buffers for an untrusted agent process.
    if(Buffer.byteLength(buffer)>MAX_LINE_BYTES*2) {
      buffer='';dropping=true;
      write({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Message too large'}});
      return;
    }
    let newline;
    while((newline=buffer.indexOf('\n'))!==-1) {
      const line=buffer.slice(0,newline).replace(/\r$/,'');
      buffer=buffer.slice(newline+1);
      if(dropping) {dropping=false;continue;}
      if(Buffer.byteLength(line)>MAX_LINE_BYTES) {
        write({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Message too large'}});
      } else if(line.trim()) {
        if(queue.length>=MAX_IN_FLIGHT*8) {
          write({jsonrpc:'2.0',id:null,error:{code:-32001,message:'Too many pending requests'}});
        } else queue.push(line);
      }
    }
    void drain();
  });
  return {close:()=>stdin.removeAllListeners('data')};
}

module.exports={
  NAME,VERSION,PROTOCOL,TOOLS,createMcpHandler,startStdio,
  redactUI,redactDevice
};
