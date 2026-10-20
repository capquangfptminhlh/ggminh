'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {ExtensionManager}=require('../src/extensions/manager');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ext-limit-'));
try{
 const data=path.join(root,'data'),source=path.join(root,'source');
 fs.mkdirSync(source);
 fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({
  manifest_version:3,name:'Template',version:'1.0.0'
 }));
 const store=new Store(data),p=store.saveProfile({name:'A',engine:'chromium'});
 const manager=new ExtensionManager(store,{isBusy:()=>false});
 const ids=[];
 for(let i=0;i<9;i++)ids.push(manager.install(source).id);
 for(let i=0;i<8;i++)manager.assign(ids[i],[p.id],true);
 const before=fs.readFileSync(store.dbFile,'utf8');
 assert.throws(()=>manager.assign(ids[8],[p.id],true),/eight/);
 assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),before);
 assert.strictEqual(manager.getEnabledPaths(p.id).length,8);
 const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 assert(main.includes('store.getProfile(profile.id) && launcher.isBusy(profile.id)'));
 console.log('v4.2 live profile edit guard and eight-extension assignment cap passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
