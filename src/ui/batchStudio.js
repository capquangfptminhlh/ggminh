'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const flowEl=el('studio-batch-flow'),panel=el('studio-batch-profiles');
 const result=el('studio-batch-results'),state=el('studio-batch-state');
 const run=el('studio-batch-run'),stop=el('studio-batch-stop');
 const selected=()=>[...panel.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
 let previewed=null,profileNames=new Map(),refreshing=false;
 function invalidate(){previewed=null;run.disabled=true;}
 flowEl.addEventListener('change',invalidate);
 el('studio-batch-error').addEventListener('change',invalidate);
 panel.addEventListener('change',invalidate);
 function row(left,right){
  const entry=document.createElement('div');entry.className='lhm-batch-result';
  const name=document.createElement('span');name.textContent=left;
  const detail=document.createElement('strong');detail.textContent=right;
  entry.append(name,detail);result.append(entry);
 }
 async function refreshLists(){
  if(refreshing)return;refreshing=true;
  try{
   const oldFlow=flowEl.value;
   const previous=new Set(selected());
   const [flows,profiles]=await Promise.all([
    window.api.studioList(),window.api.getProfiles()
   ]);
   flowEl.replaceChildren();
   flowEl.add(new Option('Chọn quy trình đã lưu',''));
   for(const flow of flows)flowEl.add(new Option(flow.name,flow.id));
   if([...flowEl.options].some(x=>x.value===oldFlow))flowEl.value=oldFlow;
   const valid=profiles.filter(x=>x.engine!=='gecko');
   profileNames=new Map(valid.map(p=>[p.id,p.name]));
   panel.replaceChildren();
   for(const p of valid){
    const label=document.createElement('label');
    const check=document.createElement('input');
    check.type='checkbox';check.value=p.id;check.checked=previous.has(p.id);
    const text=document.createElement('span');text.textContent=p.name;
    label.append(check,text);panel.append(label);
   }
   if(!valid.length)panel.textContent='Chưa có profile Chromium phù hợp.';
   invalidate();
  }finally{refreshing=false;}
 }
 async function preview(){
  const ids=selected(),id=flowEl.value,onError=el('studio-batch-error').value;
  invalidate();result.replaceChildren();
  try{
   if(!id)throw Error('Chọn quy trình đã lưu');
   const res=await window.api.studioBatchPreview(id,ids,onError);
   previewed={id,ids:[...ids],onError};
   state.textContent='Xem trước: '+res.profiles.length+' hồ sơ, '+
    res.steps+' bước · '+(res.needsApproval?'Có thao tác cần phê duyệt từng hồ sơ':'Chỉ kiểm tra hoặc chờ');
   for(const profile of res.profiles)row(profile.name,'Chờ chạy');
   run.disabled=false;
  }catch(error){state.textContent='Xem trước không hợp lệ: '+error.message;}
 }
 async function start(){
  const data=previewed;
  if(!data||data.id!==flowEl.value||data.onError!==el('studio-batch-error').value||
   data.ids.join('|')!==selected().join('|')){invalidate();return;}
  if(!confirm('Chạy quy trình này lần lượt trên '+data.ids.length+
   ' profile? Mỗi bước phê duyệt phải xác nhận riêng. Không chia sẻ cookie hay thông tin đăng nhập.'))return;
  run.disabled=true;
  try{
   await window.api.studioBatchRun(data.id,data.ids,data.onError);
   state.textContent='Hàng đợi đã bắt đầu. Theo dõi kết quả và nút Xác nhận tiếp tục ở dưới.';
   await refreshStatus();
  }catch(error){state.textContent='Không bắt đầu được: '+error.message;invalidate();}
 }
 async function refreshStatus(){
  const data=await window.api.studioBatchStatus();
  stop.disabled=!data.active;
  if(data.active)run.disabled=true;
  const current=data.batch;
  if(!current)return;
  const completed=current.tasks.filter(x=>x.status==='completed').length;
  const failures=current.tasks.filter(x=>x.status==='failed').length;
  const running=current.tasks.find(x=>x.status==='running');
  state.textContent='Hàng đợi '+current.status+
   ' · Hoàn thành '+completed+'/'+current.tasks.length+
   ' · Lỗi '+failures+
   (running?' · Đang chạy '+(profileNames.get(running.profileId)||running.profileId):'')+
   '. Mỗi yêu cầu phê duyệt hiển thị ở bảng trạng thái Studio phía dưới.';
  result.replaceChildren();
  for(const task of current.tasks){
   const name=profileNames.get(task.profileId)||task.profileId;
   row(name,task.status+(task.message?' · '+task.message:''));
  }
 }
 el('studio-batch-refresh').addEventListener('click',()=>refreshLists().catch(e=>{state.textContent=e.message;}));
 el('studio-batch-preview').addEventListener('click',preview);
 run.addEventListener('click',start);
 stop.addEventListener('click',async()=>{
  if(!confirm('Dừng hàng đợi và bỏ qua các profile chưa chạy?'))return;
  try{await window.api.studioBatchStop();await refreshStatus();}
  catch(error){state.textContent=error.message;}
 });
 // The Studio has a separate open listener and its own 800ms approval/status polling.
 el('btn-open-studio').addEventListener('click',()=>{
  refreshLists().then(refreshStatus).catch(error=>{state.textContent=error.message;});
 });
 setInterval(()=>{
  if(el('modal-studio').classList.contains('open'))
   refreshStatus().catch(error=>{state.textContent=error.message;});
 },1000);
});
