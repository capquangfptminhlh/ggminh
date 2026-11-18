'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const handlers={},elements={};
function element(){return {children:[],classList:{add(){},remove(){}},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},addEventListener(type,fn){this[type]=fn},disabled:false}}
for(const id of ['modal-profile-trash','trash-profile-list','trash-profile-count','btn-trash-profiles','trash-dialog-expired','trash-dialog-close','trash-dialog-done','trash-dialog-refresh'])elements[id]=element();
let records=[{id:'pb_test',name:'Test',group:'Default',expiresAt:new Date(Date.now()+86400000).toISOString()}],notice='';
const context={window:{addEventListener:(type,fn)=>{handlers[type]=fn},api:{
 listTrashedProfiles:async()=>records,purgeTrashedProfile:async()=>{records=[];return {removed:true,cleanupPending:true}}
}},document:{getElementById:id=>elements[id],createElement:()=>element()},
 prompt:()=> 'XOA',alert:text=>{notice=text},loadProfiles:async()=>{},Date,Math};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/ui/profileTrash.js'),'utf8'),context);
(async()=>{
 handlers.DOMContentLoaded();await elements['btn-trash-profiles'].click();
 const row=elements['trash-profile-list'].children[0],actions=row.children[1],purge=actions.children[1];
 await purge.click();
 assert.match(notice,/chưa.*xóa|chờ.*dọn/i,'User must be warned when deletion remains pending');
 console.log('Trash UI reports pending permanent cleanup PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
