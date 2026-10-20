'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Store=require('../src/db/store');
const {parseDelimited,inspectProfilesCsv,importProfilesCsv}=require('../src/ops/profileCsvImport');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-profile-import-'));
try{
  const store=new Store(dir);
  const csv='\uFEFFname,group,engine,startUrls,tags,notes,proxyType,proxyHost,proxyPort\r\n'+
    '"Agency, Main",Team A,chromium,"https://example.com/|https://example.org/","Client|Ads","hello, ""team""",direct,,\r\n'+
    'Browser B,Team B,firefox,https://example.net/,QA,"newline\nnote",http,proxy.example,8080\r\n';
  const summary=inspectProfilesCsv(store,csv);
  assert.strictEqual(summary.count,2);
  assert.strictEqual(summary.engines.gecko,1);
  assert.strictEqual(summary.configuredProxies,1);
  assert.strictEqual(store.getProfiles().length,0,'preview must have no side effects');
  const imported=importProfilesCsv(store,csv);
  assert.strictEqual(imported.count,2);
  const records=new Store(dir).getProfiles();
  assert.strictEqual(records.length,2);
  assert.strictEqual(records[0].name,'Agency, Main');
  assert.strictEqual(records[0].tags[1],'Ads');
  assert.deepStrictEqual(records[0].startUrls,['https://example.com/','https://example.org/']);
  assert.strictEqual(records[0].notes,'hello, "team"');
  assert.strictEqual(records[1].engine,'gecko');
  assert.strictEqual(records[1].proxy.host,'proxy.example');
  assert.strictEqual(records[1].notes,'newline\nnote');
  assert.strictEqual(records[0].fingerprint.mode,'native');
  assert(!fs.readFileSync(store.dbFile,'utf8').includes('password'));
  const tsv='name\tgroup\tengine\nTSV one\tSheet\tchromium';
  assert.strictEqual(inspectProfilesCsv(store,tsv).count,1);
  assert.strictEqual(inspectProfilesCsv(store,'name;group\nOne;Dept').count,1);
  const before=fs.readFileSync(store.dbFile,'utf8'),snapshot=store.getProfiles();
  for(const invalid of [
    'name,group\n"broken,Group',
    'name,name\none,two',
    'name,cookies\nTest,secret',
    'name,proxyType,proxyHost,proxyPort\nBroken,http,,8000',
    'name,startUrls\nBroken,file:///etc/passwd',
    'name,startUrls\nBroken,https://u:p@example.com',
    'name,engine\nBroken,unknown',
    'name,notes\nbad',
    'group\nNoName'
  ])assert.throws(()=>importProfilesCsv(store,invalid));
  assert.strictEqual(fs.readFileSync(store.dbFile,'utf8'),before);
  assert.deepStrictEqual(store.getProfiles(),snapshot);
  const realSave=store.saveData;
  store.saveData=()=>{throw Error('DISK_FULL_TEST')};
  assert.throws(()=>importProfilesCsv(store,'name,group\nDisk fail,Test'),/DISK_FULL_TEST/);
  assert.deepStrictEqual(store.getProfiles(),snapshot);
  store.saveData=realSave;
  assert.throws(()=>inspectProfilesCsv(store,'name\n'+Array.from({length:201},(_,i)=>'row '+i).join('\n')),/200/);
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/profileImport.js'),'utf8');
  for(const id of ['btn-import-profiles','profile-import-preview','profile-import-commit','profile-import-text'])
    assert(html.includes('id="'+id+'"'));
  assert(ui.includes('window.api.previewProfileCsv('));
  assert(ui.includes('window.api.importProfilesCsv('));
  console.log('v3.4 CSV parsing, mass import preview, validation, persistence rollback and UI passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
