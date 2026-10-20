'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const SAFE=new Set(['navigate','wait','wait_for','assert_text','if_exists','else','end_if','repeat','end_repeat']);
const INTERVALS=new Set([0,15,30,60,180,360,720,1440,10080]);
function safeFlow(flow){return !!flow?.steps?.length && flow.steps.every(x=>SAFE.has(x.type));}
class LocalScheduler {
  constructor(root,workflows,runner,{now=()=>Date.now()}={}){
    this.file=path.join(root,'automation-schedules.json');
    this.workflows=workflows;this.runner=runner;this.now=now;this.ticking=false;
    const saved=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):[];
    if(!Array.isArray(saved)||saved.length>100)throw Error('Tệp lịch chạy không hợp lệ');
    this.items=saved;
  }
  list(){return structuredClone(this.items);}
  persist(){
    const tmp=this.file+'.'+process.pid+'.tmp';
    try{
      fs.writeFileSync(tmp,JSON.stringify(this.items,null,2),{mode:0o600,flag:'wx'});
      fs.renameSync(tmp,this.file);
    }catch(e){try{fs.rmSync(tmp,{force:true});}catch(_){}throw e;}
  }
  create(value){
    if(!value||typeof value!=='object'||this.items.length>=100)throw Error('Dữ liệu lịch hoặc số lượng lịch không hợp lệ');
    const flow=this.workflows.get(value.workflowId);
    if(!safeFlow(flow))throw Error('Chỉ lập lịch quy trình chỉ đọc. Quy trình nhấn/điền/phê duyệt phải chạy thủ công.');
    const interval=Number(value.intervalMinutes);
    if(!Number.isInteger(interval)||!INTERVALS.has(interval))throw Error('Chu kỳ lịch không hợp lệ');
    const time=new Date(value.nextRunAt).getTime(),now=this.now();
    if(!Number.isFinite(time)||time<=now||time>now+365*86400000)
      throw Error('Ngày giờ phải trong tương lai, tối đa 365 ngày');
    const entry={id:'sc_'+crypto.randomUUID().replace(/-/g,'').slice(0,16),
      workflowId:flow.id,workflowName:flow.name,intervalMinutes:interval,
      nextRunAt:new Date(time).toISOString(),enabled:true,lastRunAt:null,
      lastStatus:'waiting',lastMessage:null};
    this.items.push(entry);
    try{this.persist();}catch(e){this.items.pop();throw e;}
    return structuredClone(entry);
  }
  setEnabled(id,enabled){
    const entry=this.items.find(x=>x.id===id);
    if(!entry||typeof enabled!=='boolean')throw Error('Lịch hoặc trạng thái không hợp lệ');
    if(enabled&&!safeFlow(this.workflows.get(entry.workflowId)))throw Error('Quy trình đã đổi hoặc không được phép chạy tự động');
    const previous={...entry};
    entry.enabled=enabled;
    if(enabled&&new Date(entry.nextRunAt).getTime()<this.now())
      entry.nextRunAt=new Date(this.now()+60000).toISOString();
    try{this.persist();}catch(e){Object.assign(entry,previous);throw e;}
    return structuredClone(entry);
  }
  remove(id){
    const original=this.items;
    this.items=original.filter(x=>x.id!==id);
    if(this.items.length===original.length)return false;
    try{this.persist();}catch(e){this.items=original;throw e;}
    return true;
  }
  async tick(){
    if(this.ticking)return {started:0};
    this.ticking=true;let started=0;
    try{
      const now=this.now();
      for(const entry of this.items){
        if(!entry.enabled||Date.parse(entry.nextRunAt)>now)continue;
        const flow=this.workflows.get(entry.workflowId);
        if(!safeFlow(flow)){
          entry.enabled=false;entry.lastStatus='blocked';
          entry.lastMessage='Quy trình không còn chỉ đọc hoặc đã bị xóa';
          this.persist();continue;
        }
        if(this.runner.task||this.runner.status().status==='running'){
          entry.lastStatus='waiting_for_idle';continue;
        }
        try{
          this.runner.run(flow.id);
          started++;entry.lastRunAt=new Date(now).toISOString();
          entry.lastStatus='started';entry.lastMessage='Đã bắt đầu; xem nhật ký Automation Studio';
          if(!entry.intervalMinutes)entry.enabled=false;
          else entry.nextRunAt=new Date(now+entry.intervalMinutes*60000).toISOString();
        }catch(e){
          entry.enabled=false;entry.lastStatus='blocked';
          entry.lastMessage='Không thể chạy: '+String(e.message).slice(0,100);
        }
        this.persist();break;
      }
      return {started};
    }finally{this.ticking=false;}
  }
}
module.exports={LocalScheduler,safeFlow,INTERVALS};
