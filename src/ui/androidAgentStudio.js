(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let session=null,working=false,version=0,deferredCancelId=null;
  function serial() {return $('android-control-serial').value;}
  function status(message,isError=false) {
    $('android-agent-status').textContent=String(message);
    $('android-agent-status').dataset.state=isError?'error':'normal';
  }
  function clearScreenshot() {
    const image=$('android-agent-screenshot');
    image.hidden=true;
    image.removeAttribute('src');
    $('android-agent-review').textContent=
      'Sau mỗi bước, đối chiếu ảnh để quyết định có duyệt bước tiếp không.';
  }
  function controls() {
    const ready=!!serial()&&!working;
    $('android-agent-offline').disabled=!ready || !!session;
    $('android-agent-propose').disabled=!ready || !!session;
    $('android-agent-next').disabled=!ready || !session ||
      session.done || !!session.error || session.serial!==serial();
    $('android-agent-cancel').disabled=!session || working;
    $('android-agent-goal').disabled=working || !!session;
    $('android-agent-consent').disabled=working || !!session;
  }
  function renderPlan(plan) {
    session=plan;
    const root=$('android-agent-plan');
    root.replaceChildren();
    if(!plan) {controls();return;}
    const heading=document.createElement('strong');
    const sourceLabel=plan.source==='openrouter-proposal'?'Đề xuất AI':
      plan.source==='inspector-guided'?'Nút đã chọn từ UI Inspector':'Mẫu không dùng AI';
    heading.textContent=sourceLabel+' · '+plan.total+' bước · '+plan.serial;
    root.append(heading);
    for(const [i,step] of plan.steps.entries()) {
      const item=document.createElement('div');
      item.className='lhm-android-agent-step';
      item.dataset.state=i<plan.index?'completed':
        i===plan.index?'current':'pending';
      const label=document.createElement('span');
      label.textContent='Bước '+(i+1)+' · '+step.action;
      const explanation=document.createElement('small');
      explanation.textContent=step.note +
        (step.action==='text'?' ('+step.args.characters+' ký tự, đã ẩn nội dung)':'');
      item.append(label,explanation);
      root.append(item);
    }
    controls();
  }

  async function setPlan(work) {
    if(working || session || !serial()) return false;
    const thisVersion=++version;
    working=true;controls();clearScreenshot();
    status('Đang kiểm tra và xây dựng kế hoạch…');
    try {
      const result=await work(serial());
      if(thisVersion!==version) {
        if(result?.id) await window.api.androidAgentCancel(result.id).catch(()=>{});
        return false;
      }
      renderPlan(result);
      status('Kế hoạch đã được khóa với thiết bị. Duyệt từng bước trong hộp thoại Windows.');
      return true;
    } catch(error) {
      if(thisVersion===version)status(error?.message||'Không tạo được kế hoạch.',true);
      return false;
    } finally {working=false;controls();}
  }

  async function next() {
    if(!session || working || serial()!==session.serial)return;
    working=true;controls();
    const currentId=session.id;
    const thisVersion=version;
    status('Đang chờ xác nhận cho bước '+(session.index+1)+'…');
    try {
      const result=await window.api.androidAgentNext(currentId);
      if(thisVersion!==version)return;
      if(result.state==='declined') {
        status('Anh đã hủy bước này. Kế hoạch chưa thực thi thêm.');
        return;
      }
      renderPlan(result);
      if(result.screenshot?.dataUrl?.startsWith('data:image/png;base64,')) {
        const image=$('android-agent-screenshot');
        image.src=result.screenshot.dataUrl;
        image.hidden=false;
        $('android-agent-review').textContent='Ảnh mới sau bước '+result.index+
          ' · '+result.screenshot.width+' × '+result.screenshot.height+
          ' px. Hãy kiểm tra nội dung trước khi duyệt bước tiếp theo.';
      } else if(result.verificationError) {
        clearScreenshot();
        $('android-agent-review').textContent='Không chụp được ảnh kiểm tra: '+
          result.verificationError+' · KHÔNG tự động chạy lại thao tác.';
      }
      status(result.state==='blocked'?'Dừng: kết quả thao tác không chắc chắn. Hãy hủy kế hoạch và kiểm tra Android.':
        result.done?'Đã hoàn tất các bước có phê duyệt. Kiểm tra ảnh màn hình cuối.':
          'Đã thực hiện 1 bước. Cần anh duyệt riêng bước tiếp theo.',
        result.state==='blocked');
    } catch(error) {
      if(thisVersion===version)status(error?.message||'Thao tác Android thất bại.',true);
    } finally {
      working=false;
      if(deferredCancelId===currentId) {
        deferredCancelId=null;
        await window.api.androidAgentCancel(currentId).catch(()=>{});
      }
      controls();
    }
  }

  async function cancel() {
    if(!session || working)return;
    const id=session.id;
    working=true;controls();
    try {
      await window.api.androidAgentCancel(id);
      session=null;renderPlan(null);clearScreenshot();
      status('Đã hủy kế hoạch. Không có bước nào được tự động chạy thêm.');
    } catch(error) {status(error?.message||'Không hủy được kế hoạch.',true);}
    finally {working=false;controls();}
  }
  function onDeviceChange() {
    // Do not switch execution to another serial merely because a dropdown
    // changed. The pending plan remains bound to its original device.
    clearScreenshot();
    if(session && session.serial!==serial())
      status('Kế hoạch được khóa với '+session.serial+
        '. Chọn lại thiết bị đó để tiếp tục hoặc hủy kế hoạch.',true);
    controls();
  }
  function close() {
    ++version;
    clearScreenshot();
    if(session) {
      const id=session.id;
      if(working) deferredCancelId=id;
      else window.api.androidAgentCancel(id).catch(()=>{});
      session=null;
    }
    renderPlan(null);
    $('android-agent-goal').value='';
    $('android-agent-consent').checked=false;
    status('Đã đóng phiên Android Agent. Không lưu ảnh màn hình.');
  }

  window.LHMAndroidAgentStudio={
    close,onDeviceChange,
    async fromInspector(target,scanId,index) {
      if(target!==serial() || working || session) return false;
      const ok=await setPlan(s=>window.api.androidAgentFromInspector(s,scanId,index));
      if(ok) {
        $('android-agent-goal').value='';
        $('android-agent-consent').checked=false;
        document.querySelector('#modal-android-manager .tab-btn[data-tab="android-tab-agent"]')?.click();
        $('android-agent-title').scrollIntoView({behavior:'smooth',block:'start'});
        $('android-agent-next').focus();
      }
      return ok;
    }
  };
  window.addEventListener('DOMContentLoaded',()=>{
    $('android-agent-offline').addEventListener('click',()=>setPlan(s=>
      window.api.androidAgentTemplate(s)));
    $('android-agent-propose').addEventListener('click',()=>{
      if(!$('android-agent-consent').checked) {
        status('Anh cần xác nhận gửi mô tả mục tiêu tới OpenRouter.',true);
        return;
      }
      setPlan(s=>window.api.androidAgentPropose(s,
        $('android-agent-goal').value,$('android-agent-consent').checked));
    });
    $('android-agent-next').addEventListener('click',next);
    $('android-agent-cancel').addEventListener('click',cancel);
    $('android-control-serial').addEventListener('change',onDeviceChange);
    controls();
  });
})();
