'use strict';

// AI proposes an allowlisted plan; a human authorizes each step in Electron.
// No unattended ADB automation. Screenshots never go to a remote model.
const crypto = require('node:crypto');
const {validateAction} = require('./androidControl');

const MAX_STEPS=6;
const TTL_MS=10*60*1000;
const ALLOWED=new Set(['capture','key','tap','swipe','text']);
const SAFE_SERIAL=/^[A-Za-z0-9._:-]{1,128}$/;

function validatePlan(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) ||
     !Array.isArray(raw.steps) || raw.steps.length<1 || raw.steps.length>MAX_STEPS)
    throw new Error('Android plan must have 1–6 steps');
  const steps=raw.steps.map((input,index)=>{
    if(!input || typeof input!=='object' || Array.isArray(input) ||
       typeof input.action!=='string' || !ALLOWED.has(input.action))
      throw new Error('Unsupported Android plan action at step '+(index+1));
    const action=input.action;
    const args=action==='capture' ? {} : input.args;
    if(action!=='capture') validateAction(action,args);
    if(action==='capture' && input.args!==undefined &&
       (typeof input.args!=='object' || Array.isArray(input.args) ||
        Object.keys(input.args).length!==0))
      throw new Error('Capture step cannot contain command arguments');
    if(input.note!==undefined && (typeof input.note!=='string' ||
       input.note.length>120 || /[\x00-\x1f]/.test(input.note)))
      throw new Error('Invalid Android step description');
    return {action,args,note:input.note || (
      action==='capture'?'Chụp ảnh kiểm tra màn hình':'Thao tác '+action)};
  });
  if(steps.at(-1).action!=='capture')
    throw new Error('Last Android plan step must be capture');
  return {steps};
}

function parseModelPlan(value) {
  if(typeof value!=='string' || value.length>10000)
    throw new Error('Invalid AI plan response');
  let parsed;
  try {parsed=JSON.parse(value.trim());}
  catch(_){throw new Error('AI did not return a strict JSON Android plan');}
  return validatePlan(parsed);
}

function redactedStep(step) {
  const {action,args,note}=step;
  return {
    action,note,
    args:action==='text'?{characters:args.text.length}:
      action==='capture'?{}:{...args}
  };
}

class AndroidAgentWorkflow {
  constructor(control,advisor,options={}) {
    this.control=control;
    this.advisor=advisor;
    this.clock=options.clock||(()=>Date.now());
    this.idFactory=options.idFactory||(()=>crypto.randomUUID());
    this.sessions=new Map();
  }
  _clean() {
    for(const [id,s] of this.sessions) {
      if(this.clock()-s.createdAt>TTL_MS && !s.busy) this.sessions.delete(id);
    }
  }
  _create(serial,plan,source) {
    this._clean();
    if(typeof serial!=='string' || !SAFE_SERIAL.test(serial))
      throw new Error('Invalid Android serial');
    if([...this.sessions.values()].some(s=>s.serial===serial && !s.done))
      throw new Error('Cancel the existing Android plan for this device first');
    const validated=validatePlan(plan);
    const id=this.idFactory();
    this.sessions.set(id,{
      id,serial,source,steps:validated.steps,index:0,busy:false,
      createdAt:this.clock(),done:false,error:null
    });
    return this.preview(id);
  }
  async template(serial) {
    await this.control.authorized(serial);
    return this._create(serial,{steps:[
      {action:'key',args:{key:'HOME'},note:'Về màn hình chính Android'},
      {action:'capture',note:'Chụp màn hình để kiểm tra'}
    ]},'offline-template');
  }
  async propose(serial,goal,consent) {
    if(consent!==true)
      throw new Error('User must explicitly consent to send the goal to OpenRouter');
    if(typeof goal!=='string' || goal.trim().length<5 || goal.length>300 ||
       /[\x00-\x1f]/.test(goal))
      throw new Error('Goal must contain 5–300 printable characters');
    await this.control.authorized(serial);
    if(this.advisor.status().configured!==true)
      throw new Error('Configure the OpenRouter API key in AI Advisor first');
    const question=[
      'Đề xuất kế hoạch thao tác cho Android LHM, KHÔNG thực thi. ',
      'KHÔNG có ảnh màn hình, không giả định UI hoặc bịa tọa độ. ',
      'Chỉ trả JSON dạng {"steps":[{"action":"key","args":{"key":"HOME"},"note":"..."},',
      '{"action":"capture","note":"Kiểm tra màn hình"}]}. ',
      'Tối đa 6 bước, bước cuối bắt buộc capture. ',
      'Chỉ dùng capture, key (HOME/BACK), tap, swipe, text. ',
      'Nếu không biết tọa độ thì không chọn tap/swipe. ',
      'Không gửi tin nhắn, đăng bài, thanh toán, xóa hoặc thao tác tài khoản. ',
      'Nếu thiếu bối cảnh hãy đề xuất HOME rồi capture. ',
      'Không mật khẩu, OTP, token. Không Markdown. ',
      'Mỗi bước có note tiếng Việt ngắn. ',
      'Yêu cầu người dùng (chỉ mô tả, không có dữ liệu thiết bị): ',
      goal.trim()
    ].join('');
    const reply=await this.advisor.ask({question,includeStatistics:false},[]);
    const plan=parseModelPlan(reply.answer);
    return {...this._create(serial,plan,'openrouter-proposal'),model:reply.model};
  }
  _session(id) {
    this._clean();
    if(typeof id!=='string' || !this.sessions.has(id))
      throw new Error('Android workflow not found or expired');
    const s=this.sessions.get(id);
    if(this.clock()-s.createdAt>TTL_MS) throw new Error('Android workflow expired');
    return s;
  }
  preview(id) {
    const s=this._session(id);
    return {
      id:s.id,serial:s.serial,source:s.source,index:s.index,
      total:s.steps.length,done:s.done,error:s.error,
      steps:s.steps.map(redactedStep),
      next:s.done?null:redactedStep(s.steps[s.index])
    };
  }
  async next(id) {
    const s=this._session(id);
    if(s.busy) throw new Error('Android workflow step already running');
    if(s.done || s.error)
      throw new Error('Android workflow completed or blocked; create another plan');
    s.busy=true;
    const step=s.steps[s.index];
    try {
      await this.control.authorized(s.serial);
      if(step.action!=='capture') {
        try {await this.control.execute(s.serial,step.action,step.args);}
        catch(error) {
          // ADB can time out after acting. Never retry a non-idempotent step.
          s.error='Action failed or uncertain: '+String(error.message).slice(0,130);
          return {...this.preview(id),state:'blocked',screenshot:null};
        }
      }
      s.index++;
      s.done=s.index>=s.steps.length;
      let screenshot=null,verificationError=null;
      try {screenshot=await this.control.screenshot(s.serial);}
      catch(error){verificationError=String(error.message).slice(0,160);}
      return {...this.preview(id),state:s.done?'completed':'review',
        executed:redactedStep(step),screenshot,verificationError};
    } finally {s.busy=false;}
  }
  cancel(id) {
    const s=this._session(id);
    if(s.busy) throw new Error('A step is running; cancel after it completes');
    this.sessions.delete(id);
    return {id,state:'cancelled'};
  }
}

module.exports={AndroidAgentWorkflow,validatePlan,parseModelPlan,redactedStep};
