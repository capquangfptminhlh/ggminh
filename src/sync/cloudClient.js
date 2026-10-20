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
  if(typeof fetcher!=='function')throw Error('Missing HTTPS fetch implementation');
  this.fetcher=fetcher;
 }
 async request(method,body){
  const url=this.origin+'/v1/workspaces/'+encodeURIComponent(this.tenantId)+'/sync';
  const response=await this.fetcher(url,{method,redirect:'error',
   headers:{Authorization:'Bearer '+this.token,'Accept':'application/json',
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
CloudClient.prototype.revokeMember=function(subjectId){
 if(typeof subjectId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(subjectId))
  throw Error('Invalid team member ID');
 return this.teamRequest('DELETE','/members/'+encodeURIComponent(subjectId));
};
module.exports={CloudClient,endpoint,assertCredentials};
