'use strict';
// Explicit non-destructive SQLite preview. Never switches the live backend,
// renames db.json, deletes customer records, or silently runs at startup.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {resolveEngineType}=require('../engine/EngineFactory');
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function previewMigration(root,{sqlite=null}={}){
 if(typeof root!=='string'||!path.isAbsolute(root))
  throw Error('Use an absolute storage root');
 const source=path.join(root,'db.json'),target=path.join(root,'db-preview.sqlite');
 if(fs.existsSync(target))throw Error('Preview already exists; never overwrite');
 const stat=fs.lstatSync(source);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<10||stat.size>64*1024*1024)
  throw Error('Legacy JSON must be a regular file under 64 MB');
 const raw=fs.readFileSync(source),digest=sha(raw);
 let original;
 try{original=JSON.parse(raw.toString('utf8'));}
 catch(_){throw Error('Legacy JSON is corrupt; do not migrate');}
 if(!original||typeof original!=='object'||Array.isArray(original)||
    !Array.isArray(original.profiles)||original.profiles.length>10000||
    !original.settings||typeof original.settings!=='object'||
    Array.isArray(original.settings))throw Error('Invalid legacy JSON schema');
 const found=new Set();
 const rows=original.profiles.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||
     !ID.test(p.id||'')||found.has(p.id))throw Error('Duplicate/invalid profile ID');
  found.add(p.id);
  return {id:p.id,type:resolveEngineType(p,original.settings),json:JSON.stringify(p)};
 });
 const {DatabaseSync}=sqlite||require('node:sqlite');
 if(typeof DatabaseSync!=='function')throw Error('Node 22+ SQLite is unavailable');
 const scratch=target+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 let db;
 try{
  db=new DatabaseSync(scratch);
  db.exec([
   'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;',
   'CREATE TABLE source_meta (digest TEXT NOT NULL, bytes INTEGER NOT NULL,',
   'profile_count INTEGER NOT NULL, schema_version INTEGER NOT NULL);',
   'CREATE TABLE profiles (id TEXT PRIMARY KEY,',
   "engine_type TEXT NOT NULL CHECK(engine_type IN ('chromium','firefox','camoufox')),",
   'source_json TEXT NOT NULL);',
   'CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id=1),raw TEXT NOT NULL);',
   'BEGIN IMMEDIATE;'
  ].join(' '));
  db.prepare('INSERT INTO source_meta VALUES(?,?,?,1)').run(digest,raw.length,rows.length);
  db.prepare('INSERT INTO snapshot VALUES(1,?)').run(raw.toString('utf8'));
  const ins=db.prepare('INSERT INTO profiles VALUES(?,?,?)');
  for(const row of rows)ins.run(row.id,row.type,row.json);
  db.exec('COMMIT');
  const all=db.prepare('SELECT id,engine_type,source_json FROM profiles ORDER BY id').all();
  if(all.length!==rows.length||
    all.some(r=>!rows.some(p=>p.id===r.id&&p.type===r.engine_type&&p.json===r.source_json)))
   throw Error('SQLite profile parity mismatch');
  const snapshot=db.prepare('SELECT raw FROM snapshot WHERE id=1').get();
  if(sha(Buffer.from(snapshot?.raw||''))!==digest)
   throw Error('SQLite snapshot hash mismatch');
  if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')
   throw Error('SQLite integrity check failed');
  db.close();db=null;
  if(sha(fs.readFileSync(source))!==digest)
   throw Error('JSON changed during conversion; do not publish preview');
  fs.chmodSync(scratch,0o600);
  // Atomic no-overwrite creation on the same volume.
  fs.linkSync(scratch,target);
  return {target,source,sourceSha256:digest,profileCount:rows.length,
   originalPreserved:true,activeBackend:'json'};
 }finally{
  if(db){try{db.close();}catch(_){}}
  try{fs.rmSync(scratch,{force:true});}catch(_){}
 }
}
module.exports={previewMigration};
