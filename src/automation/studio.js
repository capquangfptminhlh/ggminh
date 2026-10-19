const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = new Set(['navigate','wait','click','fill','assert_text','approval']);
const DENIED = new Set(['ads.google.com','accounts.google.com','payments.google.com','myaccount.google.com','admin.google.com']);
const HOST = /^[a-z0-9.-]{1,253}$/i;
function checkUrl(value, hosts) {
  let url;
  try { url = new URL(value); } catch (_) { throw Error('URL không hợp lệ'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('Chỉ hỗ trợ URL HTTP/HTTPS không có mật khẩu');
  if (DENIED.has(url.hostname.toLowerCase())) throw Error('Trang Google Ads / đăng nhập chỉ thao tác thủ công hoặc dùng API chính thức');
  if (!hosts.includes(url.hostname.toLowerCase())) throw Error('Tên miền chưa được cho phép: ' + url.hostname);
  return url.toString();
}
function clean(data, existing) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Quy trình không hợp lệ');
  const name = String(data.name || '').trim();
  if (!name || name.length > 100) throw Error('Tên quy trình phải có từ 1 đến 100 ký tự');
  const profileId = String(data.profileId || '');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profileId)) throw Error('Hãy chọn một hồ sơ');
  const hosts = [...new Set(String(data.hosts || '').toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  if (!hosts.length || hosts.length > 12 || hosts.some(h => !HOST.test(h) || h.includes('..') || DENIED.has(h))) throw Error('Danh sách tên miền không hợp lệ');
  if (!Array.isArray(data.steps) || !data.steps.length || data.steps.length > 40) throw Error('Quy trình phải có 1–40 bước');
  const steps = data.steps.map((raw,i) => {
    if (!raw || !TYPES.has(raw.type)) throw Error('Bước ' + (i+1) + ' không hợp lệ');
    const step = {type:raw.type};
    if (step.type === 'navigate') step.url = checkUrl(String(raw.url || ''),hosts);
    if (['click','fill','assert_text'].includes(step.type)) {
      step.selector = String(raw.selector || '').trim();
      if (!step.selector || step.selector.length > 250) throw Error('CSS selector không hợp lệ ở bước '+(i+1));
    }
    if (step.type === 'fill') {
      step.value = String(raw.value || '');
      if (step.value.length > 500) throw Error('Giới hạn 500 ký tự');
      if (/password|passcode|otp|captcha|token/i.test(step.selector)) throw Error('Không tự điền mật khẩu, OTP, CAPTCHA');
    }
    if (step.type === 'assert_text') {
      step.text = String(raw.text || '').trim();
      if (!step.text || step.text.length > 150) throw Error('Nội dung kiểm tra không hợp lệ');
    }
    if (step.type === 'wait') {
      step.ms = Number(raw.ms);
      if (!Number.isInteger(step.ms) || step.ms < 100 || step.ms > 15000) throw Error('Thời gian chờ: 100–15000ms');
    }
    if (step.type === 'approval') step.label = String(raw.label || 'Xác nhận tiếp tục').slice(0,160);
    return step;
  });
  if (!steps.some(s => s.type === 'navigate')) throw Error('Cần bước mở URL');
  const risky = steps.findIndex(s => s.type === 'click' || s.type === 'fill');
  const approved = steps.findIndex(s => s.type === 'approval');
  if (risky >= 0 && (approved < 0 || approved > risky)) {
    throw Error('Phải đặt bước xác nhận thủ công trước khi nhấn hoặc điền biểu mẫu');
  }
  const now = new Date().toISOString();
  return {id:existing?.id || crypto.randomUUID(),name,profileId,hosts:hosts.join(', '),steps,createdAt:existing?.createdAt || now,updatedAt:now};
}

class WorkflowStore {
  constructor(root) {
    this.file = path.join(root,'automation-workflows.json');
    const value = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file,'utf8')) : [];
    if (!Array.isArray(value)) throw Error('Tệp quy trình bị lỗi');
    this.items = value;
  }
  list() { return structuredClone(this.items); }
  get(id) { const value=this.items.find(w=>w.id===id);return value && structuredClone(value); }
  save(input) {
    const old = input.id ? this.items.find(x=>x.id===input.id) : null;
    if (input.id && !old) throw Error('Quy trình không tồn tại');
    const result=clean(input,old);
    if (old) this.items[this.items.indexOf(old)]=result;else this.items.push(result);
    this.persist();
    return structuredClone(result);
  }
  delete(id) {
    const before=this.items.length;this.items=this.items.filter(w=>w.id!==id);
    if (before===this.items.length)return false;this.persist();return true;
  }
  persist() {
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(this.items,null,2),{mode:0o600});
    fs.renameSync(tmp,this.file);
  }
}

function delay(ms, signal) {
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(Error('Đã dừng'));
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);
    function cancel(){clearTimeout(timer);reject(Error('Đã dừng'));}
    signal.addEventListener('abort',cancel,{once:true});
  });
}
const NAMES={navigate:'Mở trang',wait:'Chờ',click:'Nhấn',fill:'Nhập',assert_text:'Kiểm tra',approval:'Phê duyệt'};
class AutomationRunner {
  constructor(workflows, profiles, createBrowser) {
    this.workflows=workflows;this.profiles=profiles;this.createBrowser=createBrowser;
    this.task=null;this.state={status:'idle',step:-1,logs:[],needsApproval:false};
  }
  status(){return structuredClone(this.state);}
  log(message){this.state.logs.push({time:new Date().toISOString(),message});if(this.state.logs.length>80)this.state.logs.shift();}
  run(id) {
    if(this.task)throw Error('Đã có quy trình đang chạy');
    const flow=this.workflows.get(id);
    if(!flow)throw Error('Quy trình không tồn tại');
    const profile=this.profiles.getProfile(flow.profileId);
    if(!profile)throw Error('Hồ sơ đã bị xóa');
    if(profile.engine==='gecko')throw Error('Studio hiện chưa hỗ trợ Gecko; hãy chọn hồ sơ Chromium');
    const controller=new AbortController();
    const task={controller,browser:null,approve:null};
    this.task=task;
    this.state={status:'running',workflowId:id,workflowName:flow.name,step:-1,total:flow.steps.length,needsApproval:false,logs:[]};
    this.log('Bắt đầu: '+flow.name);
    this.execute(flow,task).then(
      ()=>{this.state.status='completed';this.log('Hoàn thành');},
      error=>{this.state.status=controller.signal.aborted?'stopped':'failed';this.log('Kết thúc: '+error.message);}
    ).finally(()=>{this.state.needsApproval=false;this.task=null;});
    return this.status();
  }
  async execute(flow,task){
    const hosts=flow.hosts.split(',').map(x=>x.trim());
    let browser;
    try {
      browser=await this.createBrowser(flow.profileId,hosts);
      task.browser=browser;
      for(let i=0;i<flow.steps.length;i++){
        if(task.controller.signal.aborted)throw Error('Đã dừng');
        this.state.step=i;
        const step=flow.steps[i];
        this.log('Bước '+(i+1)+': '+NAMES[step.type]);
        if(step.type==='navigate'){
          await browser.open(checkUrl(step.url,hosts));
          await this.guard(browser,hosts);
        }else if(step.type==='wait') await delay(step.ms,task.controller.signal);
        else if(step.type==='approval')await this.approval(step.label,task);
        else{
          await this.guard(browser,hosts);
          let js;
          const selector=JSON.stringify(step.selector);
          if(step.type==='click') js='(()=>{const el=document.querySelector('+selector+');if(!el)throw Error("Không tìm thấy phần tử");el.click();return true})()';
          if(step.type==='fill')js='(()=>{const el=document.querySelector('+selector+');if(!el||!("value" in el))throw Error("Không tìm thấy trường");el.focus();el.value='+JSON.stringify(step.value)+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()';
          if(step.type==='assert_text')js='(()=>{const el=document.querySelector('+selector+');return !!el&&(el.textContent||"").includes('+JSON.stringify(step.text)+')})()';
          const result=await browser.evaluate(js);
          if(result!==true)throw Error('Điều kiện chưa đạt');
        }
      }
    }finally{
      if(browser)browser.close();
    }
  }
  async guard(browser,hosts){
    const url=await browser.url();
    checkUrl(url,hosts);
  }
  async approval(label,task){
    this.state.needsApproval=true;this.state.approvalLabel=label;
    try{
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Chờ phê duyệt quá 5 phút')),300000);
        const cancel=()=>{clearTimeout(timeout);reject(Error('Đã dừng'));};
        task.controller.signal.addEventListener('abort',cancel,{once:true});
        task.approve=()=>{clearTimeout(timeout);task.controller.signal.removeEventListener('abort',cancel);resolve();};
      });
    }finally{this.state.needsApproval=false;this.state.approvalLabel=null;task.approve=null;}
  }
  approve(){
    if(!this.task?.approve)throw Error('Không có bước cần xác nhận');
    this.log('Đã phê duyệt thủ công');this.task.approve();return this.status();
  }
  stop(){
    if(this.task){
      this.task.controller.abort();
      if(this.task.browser)this.task.browser.close();
    }
    return this.status();
  }
}
module.exports={WorkflowStore,AutomationRunner,clean,checkUrl,delay};
