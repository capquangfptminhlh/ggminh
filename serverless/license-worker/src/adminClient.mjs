// Browser-only module source served at /admin/app.js. No localStorage or
// cookies; explicit operator auth in this tab's memory only.
export const script=`'use strict';
(()=>{
 let bearer=null,customers=[],orders=[];
 const q=id=>document.getElementById(id);
 const feedback=(message,bad=false)=>{q('feedback').textContent=message;q('feedback').className=bad?'error':'ok';};
 const clean=()=>{q('licenseKey').value='';q('keybox').hidden=true;};
 async function api(action,fields={}){
  if(!bearer)throw Error('Chưa đăng nhập');
  let response;
  try{
   response=await fetch('/v1/admin/commerce',{method:'POST',redirect:'error',
    credentials:'omit',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
    body:JSON.stringify({action,...fields})});
  }catch(_){throw Error('Không thể kết nối máy chủ');}
  let body;
  try{body=await response.json();}catch(_){throw Error('Máy chủ trả dữ liệu không hợp lệ');}
  if(!response.ok){
   if(response.status===401){bearer=null;q('workspace').hidden=true;q('login').hidden=false;clean();}
   throw Error('API '+response.status+': '+(body.error||'Không thực hiện được'));
  }
  return body;
 }
 const td=(text,klass)=>{
  const cell=document.createElement('td');
  if(klass)cell.className=klass;
  cell.textContent=String(text??'—');return cell;
 };
 const btn=(title,callback)=>{
  const el=document.createElement('button');el.type='button';el.className='button light';el.textContent=title;
  el.addEventListener('click',async()=>{
   el.disabled=true;
   try{await callback();}catch(e){feedback(e.message,true);}finally{el.disabled=false;}
  });return el;
 };
 const price=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(n);
 const date=x=>x?new Date(x).toLocaleString('vi-VN'):'—';
 function render(){
  q('customerCount').textContent=customers.length;
  q('orderCount').textContent=orders.length;
  q('pendingCount').textContent=orders.filter(o=>o.state==='pending').length;
  q('paidCount').textContent=orders.filter(o=>o.state==='paid').length;
  const select=q('orderCustomer');const selected=select.value;select.replaceChildren();
  for(const c of customers){const option=document.createElement('option');option.value=c.id;option.textContent=c.name+' · '+c.email;select.append(option);}
  if(customers.some(c=>c.id===selected))select.value=selected;
  const body=q('orderRows');body.replaceChildren();
  for(const order of orders){
   const row=document.createElement('tr');
   const id=td(order.id);id.className='code';row.append(id);
   row.append(td(order.customerName),td(order.plan+' · '+(order.kind==='renew'?'Gia hạn':'Cấp mới')),
    td(price(order.amountVnd)));
   const state=document.createElement('td');const badge=document.createElement('span');
   badge.className='tag '+order.state;badge.textContent={pending:'Chờ thanh toán',paid:'Đã nhận tiền',fulfilled:'Đã cấp'}[order.state]||order.state;
   state.append(badge);if(order.paymentReference)state.append(document.createElement('div')).textContent=order.paymentReference;
   row.append(state,td(order.licenseId||'—','code'));
   const action=document.createElement('td');const div=document.createElement('div');div.className='actions';div.style.margin='0';
   if(order.state==='pending'){
    div.append(btn('Xác nhận đã nhận tiền',async()=>{
     const reference=window.prompt('Nhập MÃ GIAO DỊCH thực tế đã được đối soát tại ngân hàng:');
     if(reference===null)return;
     if(!/^[a-zA-Z0-9\\-_/.: ]{1,100}$/.test(reference.trim()))
      throw Error('Mã giao dịch không hợp lệ');
     const sure=window.confirm('Anh đã kiểm tra giao dịch thật và số tiền '+price(order.amountVnd)+' đã vào tài khoản?');
     if(!sure)return;
     await api('payment.confirm',{orderId:order.id,reference:reference.trim()});
     feedback('Đã ghi nhận thanh toán. Có thể cấp key.');
     await refresh();
    }));
   }else{
    if(order.state==='paid')div.append(btn('Cấp key',async()=>{
     const sure=window.confirm('Đơn hàng đã được xác nhận thanh toán. Ký key và cấp license ngay?');
     if(!sure)return;
     showKey(await api('license.issue',{orderId:order.id}));
     await refresh();
    }));
    if(order.state==='fulfilled')div.append(btn('Xem lại key',async()=>showKey(await api('license.key',{orderId:order.id}))));
   }
   action.append(div);row.append(action);body.append(row);
  }
 }
 function showKey(value){
  q('licenseKey').value=value.token;q('keybox').hidden=false;
  feedback('Key '+value.licenseId+' · hết hạn '+new Date(value.expiresAt).toLocaleDateString('vi-VN'));
  q('keybox').scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function refresh(){
  const [a,b]=await Promise.all([api('customers.list'),api('orders.list')]);
  customers=a.customers||[];orders=b.orders||[];render();
 }
 q('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  bearer=q('adminToken').value;
  q('adminToken').value='';
  try{
   await refresh();
   q('login').hidden=true;q('workspace').hidden=false;feedback('Đăng nhập thành công');
  }catch(e){bearer=null;feedback(e.message,true);window.alert('Không thể đăng nhập: '+e.message);}
 });
 q('logout').addEventListener('click',()=>{
  bearer=null;customers=[];orders=[];clean();
  q('workspace').hidden=true;q('login').hidden=false;
 });
 q('refresh').addEventListener('click',()=>refresh().then(()=>feedback('Đã cập nhật')).catch(e=>feedback(e.message,true)));
 q('customerForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
   const result=await api('customer.create',{name:q('customerName').value,email:q('customerEmail').value});
   q('customerForm').reset();await refresh();
   q('orderCustomer').value=result.customer.id;
   feedback('Đã thêm khách hàng '+result.customer.name);
  }catch(e){feedback(e.message,true);}
 });
 q('orderForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
   const payload={
    customerId:q('orderCustomer').value,kind:q('orderKind').value,
    priorLicenseId:q('priorLicense').value.trim(),installationId:q('installationId').value.trim(),
    plan:q('orderPlan').value,months:Number(q('orderMonths').value),
    amountVnd:Number(q('amountVnd').value),maxProfiles:Number(q('maxProfiles').value),
    features:q('featurePreset').value.split(',').sort()
   };
   const result=await api('order.create',payload);await refresh();
   feedback('Đã tạo đơn '+result.orderId+' — CHỜ chuyển khoản '+price(result.amountVnd)+'. Chưa cấp key.');
  }catch(e){feedback(e.message,true);}
 });
 q('copyKey').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(q('licenseKey').value);feedback('Đã sao chép key');}
  catch(_){q('licenseKey').select();feedback('Đã chọn key, nhấn Ctrl+C để sao chép');}
 });
 q('closeKey').addEventListener('click',clean);
})();
`;
export function adminScript(){
 return new Response(script,{status:200,headers:{
  'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
 }});
}
