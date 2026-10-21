'use strict';
const {encryptMetadata,decryptMetadata,portableProfiles}=require('./encryptedMetadata');
function endpoint(raw){
 if(typeof raw!=='string'||raw.length>512)throw Error('Enter an HTTPS server URL');
 let u;
 try{u=new URL(raw);}catch(_){throw Error('Invalid Cloud API URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    (u.pathname!=='/'&&u.pathname!=='')||!u.hostname)
  throw Error('Cloud API requires a bare HTTPS origin');
 return u.origin;
}
function assertCredentials({baseUrl,token,tenantId,deviceId}){
 const origin=endpoint(baseUrl);
 if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{40,256}$/.test(token))
  throw Error('Cloud API token is invalid');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(tenantId)||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(deviceId))
  throw Error('Invalid tenant/device identifier');
 return origin;
}
class CloudClient{
 constructor(config,{fetcher=globalThis.fetch}={}){
  this.origin=assertCredentials(config);
  this.token=config.token;this.tenantId=config.tenantId;this.deviceId=config.deviceId;
  this.deviceKey=config.deviceKey||'';
  if(typeof fetcher!=='function')throw Error('Missing HTTPS fetch implementation');
  this.fetcher=fetcher;
 }
 async request(method,body,suffix=''){
  if(!/^[A-Za-z0-9_-]{64}$/.test(this.deviceKey))
   throw Error('Enroll this device and enter its personal device key before syncing');
  if(!['','/history'].includes(suffix)&&
     !/^\/history\/[1-9][0-9]{0,12}$/.test(suffix))
   throw Error('Invalid sync route');
  const url=this.origin+'/v1/workspaces/'+encodeURIComponent(this.tenantId)+'/sync'+suffix;
  const response=await this.fetcher(url,{method,redirect:'error',
   headers:{Authorization:'Bearer '+this.token,'Accept':'application/json',
    'X-LHM-Device-ID':this.deviceId,'X-LHM-Device-Key':this.deviceKey,
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!response||typeof response.status!=='number')throw Error('Invalid Cloud API response');
  if(!response.ok){
   if(response.status===409)throw Error('Sync revision conflict. Pull again before retrying.');
   if(response.status===401||response.status===403)throw Error('Cloud permission denied');
   throw Error('Cloud request failed: HTTP '+response.status);
  }
  return response.json();
 }
 async fetchRevision(){
  const response=await this.request('GET');
  if(!response||!Number.isSafeInteger(response.revision)||response.revision<0||
     (response.envelope!==null&&typeof response.envelope!=='object'))
   throw Error('Invalid Cloud revision response');
  return response;
 }
 async pull(passphrase){
  const response=await this.fetchRevision();
  if(response.revision===0&&!response.envelope)
   return {revision:0,profiles:[],empty:true};
  if(!response.envelope)throw Error('Cloud encrypted envelope missing');
  const data=decryptMetadata(response.envelope,passphrase,this.tenantId);
  if(data.revision!==response.revision)throw Error('Cloud revision mismatch');
  return {revision:response.revision,profiles:data.profiles,empty:false};
 }
 async push(passphrase,profiles){
  const safe=portableProfiles(profiles);
  const head=await this.fetchRevision();
  const envelope=encryptMetadata({tenantId:this.tenantId,deviceId:this.deviceId,
   revision:head.revision+1,profiles:safe,passphrase});
  const saved=await this.request('PUT',{expectedRevision:head.revision,envelope});
  if(saved?.revision!==head.revision+1)
   throw Error('Cloud server did not confirm expected revision');
  return {revision:saved.revision,profileCount:safe.length};
 }
 async listHistory(){
  const value=await this.request('GET',null,'/history');
  if(!Array.isArray(value?.revisions)||value.revisions.length>26||
     value.revisions.some(x=>!Number.isSafeInteger(x.revision)||x.revision<1))
   throw Error('Invalid cloud history');
  return value.revisions;
 }
 async pullHistory(passphrase,revision){
  if(!Number.isSafeInteger(revision)||revision<1||revision>9999999999999)
   throw Error('Invalid history revision');
  const value=await this.request('GET',null,'/history/'+revision);
  const data=decryptMetadata(value.envelope,passphrase,this.tenantId);
  if(data.revision!==revision||value.revision!==revision)
   throw Error('Cloud history revision mismatch');
  return {revision,profiles:data.profiles};
 }
 async restoreHistory(passphrase,revision){
  // Restore is a NEW encrypted revision, never a server-side ciphertext replay:
  // AES-GCM associated data binds every encrypted payload to its revision.
  const historical=await this.pullHistory(passphrase,revision);
  const current=await this.fetchRevision();
  const envelope=encryptMetadata({tenantId:this.tenantId,deviceId:this.deviceId,
   revision:current.revision+1,profiles:historical.profiles,passphrase});
  const saved=await this.request('PUT',{expectedRevision:current.revision,envelope});
  return {revision:saved.revision,restoredFrom:revision,profiles:historical.profiles.length};
 }
}
// Team identity is verified on the server. Client role fields are never trusted.
CloudClient.prototype.teamRequest=async function(method,path,body){
 const target=this.origin+'/v1/workspaces/'+encodeURIComponent(this.tenantId)+path;
 const response=await this.fetcher(target,{method,redirect:'error',
  headers:{Authorization:'Bearer '+this.token,'Accept':'application/json',
   ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response?.ok){
  if(response?.status===401||response?.status===403)throw Error('Team permission denied');
  throw Error('Team API failed: HTTP '+(response?.status||'unknown'));
 }
 return response.json();
};
CloudClient.prototype.listMembers=async function(){
 const result=await this.teamRequest('GET','/members');
 if(!Array.isArray(result?.members)||result.members.length>10000)
  throw Error('Invalid member response');
 return result.members;
};
CloudClient.prototype.issueInvite=function({email,role,groups,ttlHours=24}){
 return this.teamRequest('POST','/invites',{email,role,groups,ttlHours});
};
CloudClient.prototype.redeemInvite=function(token){
 if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{40,100}$/.test(token))
  throw Error('Invalid one-time invite token');
 return this.teamRequest('POST','/invites/redeem',{token});
};
CloudClient.prototype.revokeMember=function(subjectId){
 if(typeof subjectId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(subjectId))
  throw Error('Invalid team member ID');
 return this.teamRequest('DELETE','/members/'+encodeURIComponent(subjectId));
};
CloudClient.prototype.listDevices=async function(){
 const value=await this.teamRequest('GET','/devices');
 if(!Array.isArray(value?.devices)||value.devices.length>10000)
  throw Error('Invalid device list');
 return value.devices;
};
CloudClient.prototype.enrollDevice=async function({subjectId,deviceId}){
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(subjectId)||!/^[-_a-zA-Z0-9]{1,80}$/.test(deviceId))
  throw Error('Invalid device enrollment');
 return this.teamRequest('POST','/devices',{subjectId,deviceId});
};
CloudClient.prototype.revokeDevice=function(deviceId){
 if(!/^[-_a-zA-Z0-9]{1,80}$/.test(deviceId))throw Error('Invalid device');
 return this.teamRequest('DELETE','/devices/'+encodeURIComponent(deviceId));
};
module.exports={CloudClient,endpoint,assertCredentials};
