'use strict';
/**
 * Generate Wrangler config from the committed, reviewable template.
 * bootstrap: creates a PRIVATE Worker without Custom Domain, cron or preview.
 * production: keeps the approved hostname and cron.
 * Never reads or writes signing keys, license tokens or Cloudflare credentials.
 */
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const TEMPLATE=path.join(__dirname,'../serverless/license-worker/wrangler.toml.example');
const OUTPUT=path.join(__dirname,'../serverless/license-worker/wrangler.toml');
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ROUTE='[[routes]]\npattern = "browser.lhmcrm.com"\ncustom_domain = true';
const TRIGGER='[triggers]\ncrons = ["*/15 * * * *"]';
function build({mode='production',databaseId,template}={}){
  if(!['bootstrap','production'].includes(mode))throw Error('Invalid config mode');
  if(typeof databaseId!=='string'||!UUID.test(databaseId))throw Error('LHM_D1_DATABASE_ID must be a real D1 UUID');
  const original=String(template??fs.readFileSync(TEMPLATE,'utf8')).replace(/\r\n/g,'\n');
  assert(original.includes('database_id = "REPLACE_WITH_D1_DATABASE_UUID"'),'Unexpected D1 template');
  assert(original.includes('workers_dev = false'),'Worker must not expose workers.dev');
  assert(original.includes(ROUTE),'Unexpected hostname routing template');
  assert(original.includes(TRIGGER),'Unexpected scheduled jobs template');
  let output=original.replace('REPLACE_WITH_D1_DATABASE_UUID',databaseId);
  assert(original.includes('preview_urls = false'),'Worker must not expose versioned Preview URLs');
  if(mode==='bootstrap'){
    output=output.replace(ROUTE,'').replace(TRIGGER,'');
    assert(!output.includes('[[routes]]')&&!output.includes('[triggers]'),'Bootstrap must not expose public route or cron');
  }else{
    assert(output.includes(ROUTE)&&output.includes(TRIGGER),'Production routing or cron missing');
  }
  assert(output.includes('preview_urls = false')&&output.includes('workers_dev = false'));
  return output;
}
function main(){
  const mode=process.argv[2];
  const databaseId=process.env.LHM_D1_DATABASE_ID;
  const output=build({mode,databaseId});
  fs.writeFileSync(OUTPUT,output,{mode:0o600});
  console.log('Wrangler configuration prepared: '+mode+'; private fields not printed');
}
if(require.main===module){
  try{main();}catch(e){console.error('Cloudflare config blocked:',e.message);process.exitCode=1;}
}
module.exports={build,UUID,ROUTE,TRIGGER};
