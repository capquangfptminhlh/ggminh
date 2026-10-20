'use strict';
const {clean}=require('../automation/studio');
function parseHosts(raw){
 if(typeof raw!=='string'||raw.length>300)throw Error('Invalid domain input');
 const hosts=[...new Set(raw.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
 if(!hosts.length||hosts.length>6||hosts.some(h=>!/^[a-z0-9.-]{1,100}$/.test(h)||h.includes('..')))
  throw Error('Provide 1-6 valid hostnames');
 return hosts;
}
function decodeDraft(answer){
 if(typeof answer!=='string')throw Error('Missing AI draft');
 let value;
 try{value=JSON.parse(answer.trim());}
 catch(_){throw Error('AI did not return valid JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.steps)||
    value.steps.length>12||value.steps.length<1)throw Error('AI draft must contain 1–12 steps');
 return value;
}
async function proposeWorkflow(advisor,store,{profileId,hosts,objective,consent}={}){
 if(consent!==true)throw Error('Confirm before sending the task and hosts to OpenRouter');
 const profile=store.getProfile(profileId);
 if(!profile)throw Error('Select an existing profile');
 if(profile.engine!=='chromium')throw Error('Studio requires a Chromium profile');
 if(typeof objective!=='string'||objective.trim().length<10||objective.length>450)
  throw Error('Describe the workflow goal in 10–450 characters');
 const allowed=parseHosts(hosts);
 const instructions=[
  'Create a JSON workflow draft. Output ONLY JSON object with fields name and steps.',
  'Do not include profileId or hosts fields. Maximum 8 steps.',
  'Step types: navigate {url}, wait {ms}, wait_for {selector,ms}, click {selector},',
  'fill {selector,value}, assert_text {selector,text}, approval {label}.',
  'First step MUST navigate to HTTPS page on an allowed hostname.',
  'Before ANY click/fill add approval {label} step.',
  'Never fill passwords, tokens, 2FA, CAPTCHA, or access login and ad management.',
  'User-approved hostnames: '+allowed.join(', '),
  'User goal: '+objective.trim()
 ].join('\n');
 if(instructions.length>2000)throw Error('AI brief too long');
 // Profile ID/name and saved browser state remain only on this computer.
 const answer=await advisor.ask({question:instructions,includeStatistics:false},[]);
 const candidate=decodeDraft(answer.answer);
 const safe=clean({name:candidate.name,profileId,hosts:allowed.join(', '),steps:candidate.steps});
 return {draft:{name:safe.name,profileId,hosts:safe.hosts,steps:safe.steps},
  model:answer.model,warnings:[
   'Chỉ là bản nháp; chưa lưu hoặc chạy.',
   'Hãy đọc kỹ các bước rồi bấm Lưu; chạy thủ công trong Automation Studio.',
   'Không dành cho trang đăng nhập, Google Ads hoặc thanh toán.'
  ]};
}
module.exports={proposeWorkflow,parseHosts,decodeDraft};
