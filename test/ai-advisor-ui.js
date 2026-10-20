'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'aiAdvisor.js'),'utf8');
const css=fs.readFileSync(path.join(root,'workspace.css'),'utf8');
for(const id of ['btn-ai-advisor','modal-ai-advisor','ai-advisor-key',
 'ai-advisor-save-key','ai-advisor-forget-key','ai-advisor-model',
 'ai-advisor-question','ai-advisor-share-stats','ai-advisor-ask',
 'ai-advisor-stop','ai-advisor-answer']){
 assert.strictEqual(html.split('id="'+id+'"').length,2,'Missing or repeated ID '+id);
}
assert(html.includes('<script src="aiAdvisor.js"></script>'));
assert(script.includes('window.api.aiAdvisorConfigure('));
assert(script.includes('window.api.aiAdvisorAsk('));
assert(script.includes('window.api.aiAdvisorStop('));
for(const id of ['ai-draft-profile','ai-draft-hosts','ai-draft-objective',
 'ai-draft-consent','ai-draft-generate','ai-draft-save','ai-draft-preview'])
 assert(html.includes('id="'+id+'"'));
assert(script.includes('window.api.aiAdvisorWorkflowDraft('));
assert(script.includes('window.api.studioSave(suggested)'));
assert(script.includes('answer.textContent=out.answer'),'AI must use safe plain text');
assert(css.includes('.lhm-ai-answer'));
console.log('AI Advisor UI controls, plain-text output and explicit stats checkbox passed');
