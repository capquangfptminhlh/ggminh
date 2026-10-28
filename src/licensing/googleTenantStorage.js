'use strict';
/* Future commercial-main integration: isolated local workspaces by Google
 * customer UUID, not by mutable email text, browser fingerprint or device ID.
 * This pure helper NEVER migrates/copies existing legacy profiles.
 */
const fs=require('node:fs');
const path=require('node:path');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertNoLink(target){
 try{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isDirectory())
    throw Error('Unsafe Google tenant storage directory');
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
function googleTenantStorageRoot(baseDir,customerId,{create=false}={}){
 if(typeof baseDir!=='string'||!path.isAbsolute(baseDir))
  throw Error('Absolute application storage root required');
 if(customerId!==null&&!UUID.test(customerId||''))
  throw Error('Verified Google customer UUID required');
 if(typeof create!=='boolean')throw Error('Invalid storage option');
 const parent=path.resolve(baseDir,'google-v2-tenants');
 const suffix=customerId?customerId.toLowerCase():'_unpaired';
 const destination=path.resolve(parent,suffix);
 if(path.relative(parent,destination)!==suffix)
  throw Error('Invalid Google tenant path');
 assertNoLink(baseDir);
 assertNoLink(parent);
 assertNoLink(destination);
 if(create){
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  assertNoLink(parent);assertNoLink(destination);
 }
 return destination;
}
module.exports={googleTenantStorageRoot};
