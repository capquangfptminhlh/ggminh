'use strict';
const path=require('path');
const {previewMigration}=require('../src/db/sqliteMigrationPreview');
if(require.main===module){
 try{
  const base=process.argv[2];
  if(!base||!path.isAbsolute(base)||process.argv[3]!=='--confirm-preview')
   throw Error('Usage: node tools/preview-sqlite-migration.js ABSOLUTE_DATA_DIRECTORY --confirm-preview');
  const result=previewMigration(base);
  console.log(JSON.stringify(result,null,2));
  console.log('READ-ONLY MIGRATION PREVIEW: db.json was not changed; application still uses JSON.');
 }catch(error){
  console.error('SQLite preview refused:',error.message);process.exitCode=1;
 }
}
