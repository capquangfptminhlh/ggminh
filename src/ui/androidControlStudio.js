(() => {
  'use strict';

  // No AI service calls or persistent screenshot storage. Every action comes
  // directly from a visible user control within Android Device Center.
  const $ = id => document.getElementById(id);
  let selected='',shot=null,working=false,online=new Set(),bootedEmulators=new Set(),shotVersion=0;

  function note(message,error=false) {
    $('android-control-feedback').textContent=String(message || '');
    $('android-control-feedback').dataset.state=error?'error':'normal';
  }
  function selectionReady() { return !!selected && online.has(selected); }
  function toggleControls() {
    const ready=selectionReady() && !working;
    $('android-chrome-url').disabled=!ready || !bootedEmulators.has(selected);
    $('android-chrome-navigate').disabled=!ready || !bootedEmulators.has(selected);
    for(const id of ['android-control-capture','android-control-apk','android-control-back',
      'android-control-home','android-control-up','android-control-down',
      'android-control-send-text','android-control-text']) {
      $(id).disabled=!ready;
    }
  }
  function clearShot() {
    ++shotVersion;
    shot=null;
    const image=$('android-control-image');
    image.removeAttribute('src');
    image.hidden=true;
    $('android-control-placeholder').hidden=false;
    $('android-control-shot-info').textContent='';
  }
  function setSelected(serial) {
    if(serial && !online.has(serial))return;
    if(selected!==serial) clearShot();
    selected=serial || '';
    $('android-control-serial').value=selected;
    toggleControls();
    window.LHMAndroidAgentStudio?.onDeviceChange();
    window.LHMAndroidUIInspector?.onDeviceChange();
  }

  function render(state) {
    bootedEmulators=new Set((state?.fleet?.running || [])
      .filter(device=>device.bootCompleted===true && /^emulator-\d{4,5}$/.test(device.serial))
      .map(device=>device.serial));
    online=new Set((state?.devices || [])
      .filter(device=>device.status==='device').map(device=>device.serial));
    const select=$('android-control-serial');
    const previous=selected;
    select.replaceChildren();
    if (!online.size) {
      const option=document.createElement('option');
      option.value='';
      option.textContent='Chưa có thiết bị ADB đã cấp quyền';
      select.append(option);
      selected='';
      clearShot();
    } else {
      for(const device of state.devices.filter(d=>d.status==='device')) {
        const option=document.createElement('option');
        option.value=device.serial;
        option.textContent=(device.model || device.serial) + ' · ' + device.serial;
        select.append(option);
      }
      selected=online.has(previous)?previous:[...online][0];
      select.value=selected;
      if(previous && !online.has(previous))clearShot();
    }
    select.disabled=!online.size || working;
    toggleControls();
    window.LHMAndroidAgentStudio?.onDeviceChange();
    window.LHMAndroidUIInspector?.onDeviceChange();
  }

  async function perform(label, operation) {
    if(working || !selectionReady()) return;
    working=true;
    toggleControls();
    $('android-control-serial').disabled=true;
    note('Đang thực hiện: '+label+'…');
    try {
      const result=await operation(selected);
      note(result?.state==='cancelled'?'Đã hủy.':
        result?.state==='intent-sent-unverified'
          ? 'Đã gửi yêu cầu mở website. Kiểm tra Chrome trên màn hình Android để xác nhận tải trang.'
          : label+' thành công.');
      return result;
    } catch(error) {
      note(error?.message || 'ADB không thực hiện được thao tác.',true);
      return null;
    } finally {
      working=false;
      $('android-control-serial').disabled=!online.size;
      toggleControls();
    }
  }

  function screenshot() {
    const requestVersion=shotVersion;
    return perform('Chụp màn hình',async serial=>{
      const result=await window.api.androidControlScreenshot(serial);
      // Prevent capture results arriving after dialog close/device switch from
      // recreating screenshots that the user already cleared.
      if(serial!==selected || requestVersion!==shotVersion)return result;
      if(typeof result.dataUrl!=='string' || !result.dataUrl.startsWith('data:image/png;base64,'))
        throw Error('Định dạng màn hình không hợp lệ');
      shot={serial,width:result.width,height:result.height};
      $('android-control-image').src=result.dataUrl;
      $('android-control-image').hidden=false;
      $('android-control-placeholder').hidden=true;
      $('android-control-shot-info').textContent=
        result.width+' × '+result.height+' px · Chạm ảnh để điều khiển';
      return result;
    });
  }

  function gesture(direction) {
    if(!shot || shot.serial!==selected) {
      note('Chụp màn hình thiết bị trước khi vuốt.',true);
      return;
    }
    const x=Math.round(shot.width/2);
    const upper=Math.round(shot.height*.25), lower=Math.round(shot.height*.75);
    return perform('Vuốt '+(direction==='up'?'lên':'xuống'),serial=>
      window.api.androidControlAction(serial,'swipe',{
        x1:x,y1:direction==='up'?lower:upper,x2:x,
        y2:direction==='up'?upper:lower,durationMs:350
      }));
  }

  function onImageTap(event) {
    if(!shot || !selectionReady())return;
    const rect=$('android-control-image').getBoundingClientRect();
    if(rect.width<=0 || rect.height<=0)return;
    const x=Math.max(0,Math.min(shot.width-1,
      Math.round((event.clientX-rect.left)/rect.width*shot.width)));
    const y=Math.max(0,Math.min(shot.height-1,
      Math.round((event.clientY-rect.top)/rect.height*shot.height)));
    perform('Chạm '+x+','+y,serial=>
      window.api.androidControlAction(serial,'tap',{x,y}));
  }

  function clear() {
    clearShot();
    $('android-chrome-url').value='';
    $('android-control-text').value='';
    note('');
  }

  window.LHMAndroidControlStudio={
    render, clear,
    select(serial) {
      if(!online.has(serial)){
        note('Thiết bị chưa được ADB cấp quyền hoặc đã mất kết nối.',true);
        return;
      }
      setSelected(serial);
      $('android-control-panel').scrollIntoView({behavior:'smooth',block:'start'});
      $('android-control-capture').focus();
    }
  };
  window.addEventListener('DOMContentLoaded',()=>{
    $('android-control-serial').addEventListener('change',event=>setSelected(event.target.value));
    $('android-control-capture').addEventListener('click',screenshot);
    $('android-chrome-navigate').addEventListener('click',async()=>{
      if(!selectionReady() || !bootedEmulators.has(selected) || working)return;
      const address=$('android-chrome-url').value;
      if(!address || !address.startsWith('https://') || address.length>1024){
        note('Nhập địa chỉ HTTPS hợp lệ; tối đa 1024 ký tự.',true);
        return;
      }
      const result=await perform('Mở trang web',serial=>
        window.api.androidChromeNavigate(serial,address));
      if(result?.state==='intent-sent-unverified')clearShot();
    });
    $('android-control-image').addEventListener('click',onImageTap);
    $('android-control-back').addEventListener('click',()=>perform('Quay lại',s=>
      window.api.androidControlAction(s,'key',{key:'BACK'})));
    $('android-control-home').addEventListener('click',()=>perform('Màn hình chính',s=>
      window.api.androidControlAction(s,'key',{key:'HOME'})));
    $('android-control-up').addEventListener('click',()=>gesture('up'));
    $('android-control-down').addEventListener('click',()=>gesture('down'));
    $('android-control-send-text').addEventListener('click',()=>{
      const value=$('android-control-text').value;
      if(!value.trim() || value.length>120 || !/^[A-Za-z0-9 .,!?@_\-]+$/.test(value)){
        note('Chỉ nhập tối đa 120 ký tự Latin cơ bản, không dùng mật khẩu.',true);
        return;
      }
      perform('Gõ chữ',s=>window.api.androidControlAction(s,'text',{text:value}));
    });
    $('android-control-apk').addEventListener('click',()=>perform('Cài APK',s=>
      window.api.androidControlInstallApk(s)));
    toggleControls();
  });
})();
