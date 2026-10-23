'use strict';
/* Presentation-only 3D flip for the existing, signed, IPC-backed license UI.
 * This is not an account login or registration service.
 * No credentials, network requests, tokens or license state are created here. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root?.document)root.document.addEventListener('DOMContentLoaded',()=>api.init(root.document));
})(typeof window!=='undefined'?window:null,function(){
  const MODES=new Set(['status','activate']);
  function setMode(modal,mode,{focus=false}={}){
    if(!modal||!MODES.has(mode))throw Error('Unknown license UI mode');
    const front=modal.querySelector('#lhm-nm-license-status-face');
    const back=modal.querySelector('#lhm-nm-license-activate-face');
    if(!front||!back)throw Error('License flip faces missing');
    const activation=mode==='activate';
    modal.dataset.lhmLicenseMode=mode;
    front.inert=activation;
    back.inert=!activation;
    front.setAttribute('aria-hidden',String(activation));
    back.setAttribute('aria-hidden',String(!activation));
    if(focus){
      const next=modal.querySelector(activation?'#license-token':'#lhm-nm-license-next');
      next?.focus?.({preventScroll:true});
    }
    return mode;
  }
  function init(doc){
    const modal=doc.getElementById('modal-license-center');
    const next=doc.getElementById('lhm-nm-license-next');
    const back=doc.getElementById('lhm-nm-license-back');
    if(!modal||!next||!back)return false;
    setMode(modal,'status');
    next.addEventListener('click',()=>setMode(modal,'activate',{focus:true}));
    back.addEventListener('click',()=>setMode(modal,'status',{focus:true}));
    // Every fresh dialog open returns to the live license summary. The
    // existing licenseCenter.js remains the only actor performing IPC.
    doc.getElementById('btn-license-center')?.addEventListener('click',()=>{
      setMode(modal,'status');
    });
    doc.getElementById('license-center-close')?.addEventListener('click',()=>{
      setMode(modal,'status');
    });
    doc.getElementById('license-done')?.addEventListener('click',()=>{
      setMode(modal,'status');
    });
    return true;
  }
  return Object.freeze({setMode,init});
});
