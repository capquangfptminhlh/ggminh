'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

const ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL='openai/gpt-4o-mini';
const MAX_PROMPT=2000;
function checkModel(value){
 if(typeof value!=='string'||value.length<3||value.length>100||
   !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(value))
  throw Error('Model ID không hợp lệ (dạng provider/model)');
 return value;
}
function safeStats(profiles){
 if(!Array.isArray(profiles))throw Error('Invalid profile list');
 const stats={total:profiles.length,chromium:0,firefox:0,direct:0,proxy:0,groups:0};
 const groups=new Set();
 for(const profile of profiles){
  if(profile.engine==='gecko')stats.firefox++;else stats.chromium++;
  if(profile.proxy?.type && profile.proxy.type!=='direct')stats.proxy++;
  else stats.direct++;
  if(typeof profile.group==='string')groups.add(profile.group);
 }
 stats.groups=groups.size;
 return stats;
}
function parseAnswer(value){
 const content=value?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw Error('OpenRouter did not return text');
 return content.slice(0,12000);
}
class AIAdvisor{
 constructor(storage,codec,{fetcher=fetch,clock=()=>Date.now()}={}){
  if(!codec||typeof codec.isEncryptionAvailable!=='function'||
     typeof codec.encryptString!=='function'||typeof codec.decryptString!=='function')
   throw Error('OS encryption codec unavailable');
  this.file=path.join(storage,'ai-advisor.enc.json');
  this.codec=codec;this.fetcher=fetcher;this.clock=clock;
  this.lastRequest=0;this.count=0;this.running=null;
  if(fs.existsSync(this.file)){
   const value=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(value.version!==1||!value.model||!value.secret||
      typeof value.secret!=='string'||!/^[A-Za-z0-9+/]+=*$/.test(value.secret))
    throw Error('Encrypted AI configuration is invalid');
   checkModel(value.model);
   this.settings=value;
  }else this.settings={version:1,model:DEFAULT_MODEL,secret:null};
 }
 ready(){
  return this.codec.isEncryptionAvailable()===true;
 }
 status(){
  return {configured:!!this.settings.secret,model:this.settings.model,
   encryptionAvailable:this.ready(),requestsThisSession:this.count,busy:!!this.running};
 }
 write(next){
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  const temp=this.file+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(temp,JSON.stringify(next),{encoding:'utf8',mode:0o600,flag:'wx'});
   fs.renameSync(temp,this.file);
  }catch(error){
   try{fs.rmSync(temp,{force:true});}catch(_){}
   throw error;
  }
  this.settings=next;
 }
 configure({model,key}={}){
  if(!this.ready())throw Error('Windows OS encryption is unavailable; cannot save an API key');
  const selected=checkModel(model||this.settings.model);
  const next={...this.settings,model:selected};
  if(key!==undefined){
   if(typeof key!=='string'||key.length<20||key.length>300||
      /[\s\r\n\0]/.test(key))throw Error('OpenRouter API key không hợp lệ');
   const encrypted=this.codec.encryptString(key);
   if(!Buffer.isBuffer(encrypted)||encrypted.length<1)
    throw Error('OS encryption returned an invalid record');
   next.secret=encrypted.toString('base64');
  }
  this.write(next);
  return this.status();
 }
 clear(){
  if(this.running)this.running.abort();
  this.write({version:1,model:this.settings.model,secret:null});
  return this.status();
 }
 abort(){
  if(!this.running)return {stopped:false};
  this.running.abort();return {stopped:true};
 }
 async ask(input,profiles=[]){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid AI question');
  const prompt=input.question;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>MAX_PROMPT||
    /[\0-\x08\x0b\x0c\x0e-\x1f]/.test(prompt))
   throw Error('Câu hỏi cần 1–2000 ký tự');
  if(typeof input.includeStatistics!=='boolean')
   throw Error('The statistics opt-in must be explicit');
  if(!this.settings.secret)throw Error('Chưa cấu hình OpenRouter API key');
  if(!this.ready())throw Error('Windows encryption is unavailable');
  if(this.running)throw Error('Đang có một yêu cầu AI hoạt động');
  if(this.count>=20)throw Error('Giới hạn 20 lượt hỏi mỗi phiên ứng dụng');
  const now=this.clock();
  if(this.lastRequest && now-this.lastRequest<7000)
   throw Error('Tối thiểu 7 giây giữa hai lần gọi AI');
  this.lastRequest=now;
  this.count++;
  const controller=new AbortController();
  this.running=controller;
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const token=this.codec.decryptString(Buffer.from(this.settings.secret,'base64'));
   if(typeof token!=='string'||token.length<20)throw Error('Invalid decrypted API key');
   const statistics=input.includeStatistics ? safeStats(profiles) : null;
   const systemMessage=[
    'Bạn là trợ lý vận hành LHM Ads Browser.',
    'Chỉ tư vấn về quản lý hồ sơ, bảo vệ dữ liệu, kiểm thử, proxy và workflow hợp lệ.',
    'Không giả vờ đã chạy lệnh, không cung cấp kỹ thuật vượt qua phát hiện/chống gian lận.',
    'Không yêu cầu mật khẩu, API key, cookie, token, OTP hoặc dữ liệu cá nhân.',
    'Nếu đề xuất thay đổi, giải thích rõ thao tác thủ công và rủi ro.'
   ].join(' ');
   const question=prompt.trim()+(statistics?
    '\n\nSố liệu tổng hợp do người dùng cho phép chia sẻ: '+JSON.stringify(statistics):'');
   const res=await this.fetcher(ENDPOINT,{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({
     model:this.settings.model,stream:false,temperature:0.2,max_completion_tokens:700,
     messages:[{role:'system',content:systemMessage},{role:'user',content:question}]
    }),
    redirect:'error',signal:controller.signal
   });
   if(!res?.ok)throw Error('OpenRouter returned HTTP '+res?.status);
   const declaredLength=Number(res.headers?.get?.('content-length')||0);
   if(declaredLength>128*1024)throw Error('AI response was too large');
   const data=await res.json();
   return {model:this.settings.model,answer:parseAnswer(data),usage:{
    promptTokens:Math.max(0,Number(data.usage?.prompt_tokens)||0),
    completionTokens:Math.max(0,Number(data.usage?.completion_tokens)||0)
   },sentStatistics:!!statistics};
  }catch(error){
   if(controller.signal.aborted)throw Error('AI request was stopped or timed out');
   throw error;
  }finally{
   clearTimeout(timer);this.running=null;
  }
 }
}
module.exports={AIAdvisor,checkModel,safeStats,parseAnswer,ENDPOINT};
