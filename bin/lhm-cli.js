#!/usr/bin/env node
'use strict';
const VALID=new Set(['status','list','active','start','stop']);
function options(args=process.argv.slice(2),env=process.env){
 const [command,id,...rest]=args;
 if(!VALID.has(command)||rest.length || (['start','stop'].includes(command)!==(id!==undefined)))
  throw Error('Usage: npm run cli -- <status|list|active|start ID|stop ID>');
 if(id!==undefined&&!/^pb_[a-z0-9]{12}$/.test(id))throw Error('Invalid profile ID');
 const port=Number(env.LHM_API_PORT||50325);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid LHM_API_PORT');
 if(typeof env.LHM_API_KEY!=='string'||env.LHM_API_KEY.length<10)
  throw Error('Set LHM_API_KEY in terminal environment');
 return {command,id,port,key:env.LHM_API_KEY};
}
async function request(cfg,fetcher=fetch){
 const routes={status:'/status',list:'/api/v1/user/list',active:'/api/v1/browser/active',
  start:'/api/v1/browser/start',stop:'/api/v1/browser/stop'};
 const uri=new URL(routes[cfg.command],'http://127.0.0.1:'+cfg.port);
 if(cfg.id)uri.searchParams.set('user_id',cfg.id);
 let res;
 try{res=await fetcher(uri,{method:'GET',headers:{'X-API-Key':cfg.key},
   signal:AbortSignal.timeout(10000),redirect:'error'});}
 catch(error){throw Error('Local API unavailable: '+error.message);}
 let json;
 try{json=await res.json();}catch(_){throw Error('Local API returned invalid JSON');}
 if(!res.ok||json.code===-1)throw Error('Local API '+res.status+': '+String(json.msg||'denied').slice(0,200));
 return json;
}
async function main(args=process.argv.slice(2),env=process.env,fetcher=fetch){
 return JSON.stringify(await request(options(args,env),fetcher),null,2);
}
if(require.main===module)main().then(x=>console.log(x)).catch(error=>{
 console.error('LHM CLI: '+error.message);process.exitCode=1;
});
module.exports={options,request,main};
