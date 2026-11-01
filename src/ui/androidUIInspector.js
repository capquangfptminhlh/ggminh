(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const STALE_MS=15000;
  let snapshot=null,working=false,version=0;

  function serial() {return $('android-control-serial').value;}
  function status(message,error=false) {
    $('android-inspector-status').textContent=String(message||'');
    $('android-inspector-status').dataset.state=error?'error':'normal';
  }
  function clear({keepServerToken=false}={}) {
    version++;
    const old=snapshot;
    snapshot=null;
    if(old?.scanId && !keepServerToken) {
      window.api.androidUiInvalidate(old.scanId).catch(()=>{});
    }
    $('android-inspector-nodes').replaceChildren();
    $('android-inspector-scan').disabled=!serial();
  }
  function onDeviceChange() {
    if(snapshot && snapshot.serial!==serial()) {
      clear();
      status('Đã đổi máy. Quét lại giao diện thiết bị mới.');
    }
    $('android-inspector-scan').disabled=!serial()||working;
  }

  function makeButton(text,run) {
    const b=document.createElement('button');
    b.type='button';b.className='btn btn-secondary';
    b.textContent=text;b.addEventListener('click',run);
    return b;
  }

  function render(data) {
    const box=$('android-inspector-nodes');
    box.replaceChildren();
    if(!data.elements.length) {
      const p=document.createElement('p');
      p.textContent='Không tìm thấy nút có thể chạm qua UIAutomator ở màn hình này.';
      box.append(p);return;
    }
    for(const node of data.elements) {
      const entry=document.createElement('div');
      entry.className='lhm-android-inspector-item';
      const text=document.createElement('div');
      const heading=document.createElement('strong');
      heading.textContent='#'+node.index+' · '+node.type;
      const position=document.createElement('small');
      position.textContent='Tâm ('+node.bounds.x+', '+node.bounds.y+
        ') · '+node.bounds.width+'×'+node.bounds.height+' px';
      text.append(heading,position);
      const button=makeButton('Chạm',async()=>{
        if(working)return;
        if(!snapshot||snapshot.serial!==serial()||
           Date.now()-snapshot.capturedAt>STALE_MS) {
          clear();
          status('Kết quả đã cũ hoặc không thuộc máy hiện tại. Quét lại trước khi chạm.',true);
          return;
        }
        const target=serial();
        working=true;$('android-inspector-scan').disabled=true;
        button.disabled=true;
        status('Đang chạm nút #'+node.index+' trên '+target+'…');
        try {
          const result=await window.api.androidUiTapTarget(target,snapshot.scanId,node.index);
          status(result.state==='cancelled'?'Đã hủy thao tác.':'Đã chạm nút đã xác minh. Quét lại để thao tác tiếp.');
        } catch(error) {
          status(error?.message||'ADB không thực hiện được thao tác.',true);
        } finally {
          working=false;
          clear(); // Never repeat a stale point or keep post-action hierarchy.
        }
      });
      const agent=makeButton('Agent',async()=>{
        if(working)return;
        if(!snapshot || snapshot.serial!==serial() ||
           Date.now()-snapshot.capturedAt>STALE_MS) {
          clear();
          status('Mục tiêu đã cũ. Quét lại Android trước khi tạo kế hoạch.',true);
          return;
        }
        working=true;
        const scanId=snapshot.scanId,target=serial();
        try {
          const ok=await window.LHMAndroidAgentStudio?.fromInspector(target,scanId,node.index);
          if(ok) {
            // Ownership transferred to the approval-gated Agent session. The
            // server token must survive until its one approved use or expiry.
            clear({keepServerToken:true});
            status('Đã chuyển nút #'+node.index+' vào Agent. Duyệt từng bước bên dưới.');
          } else status('Agent đang có kế hoạch khác. Hủy kế hoạch đó trước.',true);
        } catch(error) {
          status(error?.message||'Không tạo được kế hoạch từ nút đã quét.',true);
        } finally {
          working=false;
          $('android-inspector-scan').disabled=!serial();
        }
      });
      const actions=document.createElement('div');
      actions.className='lhm-android-inspector-actions';
      actions.append(button,agent);
      entry.append(text,actions);
      box.append(entry);
    }
  }

  async function scan() {
    if(working||!serial()) return;
    const target=serial(),currentVersion=++version;
    snapshot=null;
    $('android-inspector-nodes').replaceChildren();
    working=true;
    $('android-inspector-scan').disabled=true;
    status('Đang đọc UI hierarchy tại máy, không gửi nội dung đến AI…');
    try {
      const result=await window.api.androidUiInspect(target);
      if(currentVersion!==version || target!==serial() ||
         !$('modal-android-manager').classList.contains('open'))return;
      if(!result||result.privacy!=='geometry-only'||
         result.serial!==target||!Array.isArray(result.elements)) {
        throw new Error('Kết quả quét không hợp lệ');
      }
      // Trust local IPC only for a bounded, sanitized tree.
      if(typeof result.scanId!=='string')throw Error('Thiếu mã phiên quét an toàn');
      snapshot={
        serial:target,scanId:result.scanId,capturedAt:Date.now(),
        elements:result.elements
      };
      render(result);
      status('Phát hiện '+result.actionableCount+' nút có thể chạm từ '+
        result.totalNodes+' thành phần. '+(result.truncated?'Chỉ hiển thị 120 nút đầu. ':'')+
        'Không hiển thị chữ hoặc mật khẩu. Tọa độ có hiệu lực tối đa 15 giây.');
    }catch(error) {
      if(currentVersion===version)status(error?.message||'Không quét được UI Android.',true);
    }finally {
      working=false;
      $('android-inspector-scan').disabled=!serial();
    }
  }

  window.LHMAndroidUIInspector={clear,onDeviceChange};
  window.addEventListener('DOMContentLoaded',()=>{
    $('android-inspector-scan').addEventListener('click',scan);
    $('android-inspector-scan').disabled=true;
  });
})();
