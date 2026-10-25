'use strict';
// Gmail builds must NEVER query or download the existing Preview/stable
// update feed. A future Gmail-specific feed needs an independent signed
// manifest including product, channel and pinned publisher identity.
class DisabledGmailUpdateCenter{
 constructor(version){
  if(typeof version!=='string'||!version)throw Error('App version required');
  this.currentVersion=version;
  this.lastOffer=null;
  this.busy=false;
 }
 status(){
  return {
   configured:false,channel:'gmail-staging',currentVersion:this.currentVersion,
   status:'not-configured',lastCheck:null,canDownload:false,busy:false,
   note:'Kênh Gmail sử dụng bộ cài riêng. Cập nhật online chưa được bật để tránh cài nhầm bản Preview.'
  };
 }
 async check(){
  return {status:'not-configured',details:{reason:'gmail-dedicated-signed-feed-required'}};
 }
 async download(){
  throw Error('Bản Gmail cần manifest cập nhật riêng có chữ ký; không được tải bộ cài Preview.');
 }
}
module.exports={DisabledGmailUpdateCenter};
