'use strict';
function openIsolationDb(indexedDb){
 return new Promise((resolve,reject)=>{
  const request=indexedDb.open('lhm_probe',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('kv');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('IndexedDB open failed'));
  request.onblocked=()=>reject(Error('IndexedDB open blocked'));
 });
}
function readIsolationValue(db){
 return new Promise((resolve,reject)=>{
  const request=db.transaction('kv').objectStore('kv').get('k');
  request.onsuccess=()=>resolve(request.result??null);
  request.onerror=()=>reject(request.error||Error('IndexedDB read failed'));
 });
}
function writeIsolationValue(db,value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('kv','readwrite');
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('IndexedDB write failed'));
  tx.onabort=()=>reject(tx.error||Error('IndexedDB write aborted'));
  tx.objectStore('kv').put(value,'k');
 });
}
module.exports={openIsolationDb,readIsolationValue,writeIsolationValue};
