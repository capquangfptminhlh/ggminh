'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const modal=el('modal-ai-advisor');
 const keyField=el('ai-advisor-key'),modelField=el('ai-advisor-model');
 const keyStatus=el('ai-advisor-key-status'),status=el('ai-advisor-request-status');
 const answer=el('ai-advisor-answer'),question=el('ai-advisor-question');
 const send=el('ai-advisor-ask'),stop=el('ai-advisor-stop');
 const budgetInput=el('ai-advisor-monthly-budget'),budgetStatus=el('ai-advisor-budget-status');
 async function refresh(){
  const state=await window.api.aiAdvisorStatus();
  modelField.value=state.model;
  keyStatus.textContent=state.configured?'API key đã lưu (được mã hóa)':'Chưa có API key';
  if(!state.encryptionAvailable)keyStatus.textContent='Mã hóa hệ điều hành chưa khả dụng';
  send.disabled=state.busy||!state.configured;
  stop.disabled=!state.busy;
  const budget=state.budget;
  if(budget?.available){
   budgetInput.value=String(budget.limit);
   budgetStatus.textContent='Tháng '+budget.month+': '+budget.attempts+
    ' lượt gọi ('+budget.successes+' trả lời thành công)'+
    (budget.limit ? ' / '+budget.limit+' lượt · còn '+budget.remaining : ' · không đặt hạn mức')+
    ' · '+(budget.promptTokens+budget.completionTokens)+' token được báo cáo'+
    (budget.unreportedUsage ? ' · '+budget.unreportedUsage+' lượt thiếu số liệu token' : '');
  }else{
   budgetStatus.textContent=budget?.error || 'Chưa tải được sổ sử dụng AI.';
  }
 }
 async function refreshDraftProfiles(){
  const select=el('ai-draft-profile');
  const prior=select.value;
  const profiles=await window.api.getProfiles();
  select.replaceChildren(new Option('Chọn profile Chromium',''));
  for(const p of profiles.filter(p=>p.engine!=='gecko'))
   select.add(new Option(p.name,p.id));
  if([...select.options].some(o=>o.value===prior))select.value=prior;
 }
 el('btn-ai-advisor').addEventListener('click',async()=>{
  modal.classList.add('open');
  try{await Promise.all([refresh(),refreshDraftProfiles()]);}
  catch(e){keyStatus.textContent=e.message;}
 });
 for(const id of ['ai-advisor-close','ai-advisor-done'])
  el(id).addEventListener('click',()=>modal.classList.remove('open'));
 el('ai-advisor-save-key').addEventListener('click',async()=>{
  const button=el('ai-advisor-save-key');button.disabled=true;
  try{
   const input={model:modelField.value.trim()};
   if(keyField.value)input.key=keyField.value;
   await window.api.aiAdvisorConfigure(input);
   keyField.value='';await refresh();
   status.textContent='Đã lưu. Khóa API không hiển thị lại.';
  }catch(e){status.textContent='Không lưu được: '+e.message;}
  finally{keyField.value='';button.disabled=false;}
 });
 el('ai-advisor-forget-key').addEventListener('click',async()=>{
  if(!confirm('Xóa API key OpenRouter được lưu trong phần mềm?'))return;
  try{
   await window.api.aiAdvisorForgetKey();
   keyField.value='';answer.textContent='Khóa đã xóa. Nội dung hội thoại không được lưu trên máy.';
   await refresh();
  }catch(e){status.textContent=e.message;}
 });
 el('ai-advisor-save-budget').addEventListener('click',async()=>{
  const limit=Number(budgetInput.value);
  if(budgetInput.value.trim()===''||!Number.isInteger(limit)||limit<0||limit>1000){
   budgetStatus.textContent='Hạn mức phải từ 0 đến 1000 yêu cầu/tháng.';
   return;
  }
  const button=el('ai-advisor-save-budget');button.disabled=true;
  try{
   await window.api.aiAdvisorSetBudget(limit);
   await refresh();
  }catch(error){budgetStatus.textContent='Không cập nhật hạn mức: '+error.message;}
  finally{button.disabled=false;}
 });
 send.addEventListener('click',async()=>{
  const prompt=question.value.trim();
  if(!prompt){status.textContent='Hãy nhập câu hỏi trước khi gửi.';return;}
  send.disabled=true;stop.disabled=false;
  status.textContent='Đang yêu cầu model...';
  try{
   const out=await window.api.aiAdvisorAsk({
    question:prompt,
    includeStatistics:el('ai-advisor-share-stats').checked===true
   });
   // Never render remote model text as HTML.
   answer.textContent=out.answer;
   status.textContent='Model '+out.model+' · '+out.usage.completionTokens+
     ' output tokens · '+(out.sentStatistics?'có gửi số liệu tổng hợp':'không gửi số liệu profile');
  }catch(e){status.textContent='Yêu cầu thất bại: '+e.message;}
  finally{
   try{await refresh();}
   catch(_){send.disabled=false;stop.disabled=true;}
  }
 });
 stop.addEventListener('click',async()=>{
  try{
   await window.api.aiAdvisorStop();
   status.textContent='Đã gửi yêu cầu dừng.';
  }catch(e){status.textContent=e.message;}
 });
 let suggested=null;
 const preview=el('ai-draft-preview'),generate=el('ai-draft-generate');
 const save=el('ai-draft-save');
 for(const id of ['ai-draft-profile','ai-draft-hosts','ai-draft-objective']){
  el(id).addEventListener('input',()=>{
   suggested=null;save.disabled=true;
   preview.textContent='Thông tin đã thay đổi; cần tạo lại bản nháp.';
  });
 }
 generate.addEventListener('click',async()=>{
  suggested=null;save.disabled=true;
  if(!el('ai-draft-consent').checked){
   preview.textContent='Bạn cần xác nhận chia sẻ mô tả và tên miền cho OpenRouter.';
   return;
  }
  generate.disabled=true;preview.textContent='Đang tạo và kiểm tra bản nháp...';
  try{
   const result=await window.api.aiAdvisorWorkflowDraft({
    profileId:el('ai-draft-profile').value,
    hosts:el('ai-draft-hosts').value,
    objective:el('ai-draft-objective').value,
    consent:true
   });
   suggested=result.draft;
   preview.textContent=JSON.stringify(suggested,null,2)+
    '\n\n'+result.warnings.join('\n');
   save.disabled=false;
  }catch(e){preview.textContent='Không tạo được bản nháp hợp lệ: '+e.message;}
  finally{generate.disabled=false;await refresh().catch(()=>{});}
 });
 save.addEventListener('click',async()=>{
  if(!suggested)return;
  if(!confirm('Đã kiểm tra tên miền và các bước? Lưu bản nháp vào Automation Studio (không chạy)?'))return;
  save.disabled=true;
  try{
   await window.api.studioSave(suggested);
   suggested=null;
   preview.textContent='Đã lưu vào Automation Studio. Chỉ chạy khi bạn chủ động yêu cầu.';
  }catch(e){preview.textContent='Không lưu được: '+e.message;save.disabled=false;}
 });
});