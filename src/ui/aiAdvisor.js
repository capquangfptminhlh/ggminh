'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const modal=el('modal-ai-advisor');
 const keyField=el('ai-advisor-key'),modelField=el('ai-advisor-model');
 const keyStatus=el('ai-advisor-key-status'),status=el('ai-advisor-request-status');
 const answer=el('ai-advisor-answer'),question=el('ai-advisor-question');
 const send=el('ai-advisor-ask'),stop=el('ai-advisor-stop');
 async function refresh(){
  const state=await window.api.aiAdvisorStatus();
  modelField.value=state.model;
  keyStatus.textContent=state.configured?'API key đã lưu (được mã hóa)':'Chưa có API key';
  if(!state.encryptionAvailable)keyStatus.textContent='Mã hóa hệ điều hành chưa khả dụng';
  send.disabled=state.busy||!state.configured;
  stop.disabled=!state.busy;
 }
 el('btn-ai-advisor').addEventListener('click',async()=>{
  modal.classList.add('open');
  try{await refresh();}catch(e){keyStatus.textContent=e.message;}
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
});