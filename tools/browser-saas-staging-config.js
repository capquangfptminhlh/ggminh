'use strict';
// Generates isolated SaaS staging config; the public path route must not replace the existing site.
const mode=process.argv[2],id=process.argv[3];
if(!['private','public'].includes(mode))throw Error('Mode must be private/public');
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))throw Error('Valid separate D1 UUID required');
const host='browser.lhmcrm.com';
// The customer-approved public hostname is shared with the existing site.
// Route ONLY /v2/* to the isolated staging Worker, never claim the hostname
// as a custom domain or overwrite the root/Preview site.
const route=mode==='public'?'\n[[routes]]\npattern = "'+host+'/v2/*"\nzone_name = "lhmcrm.com"\n':'';
const config=['# Generated staging-only config; never point at production!',
 'name = "lhm-browser-commerce-staging"',
 'main = "src/index.mjs"',
 'compatibility_date = "2026-10-24"',
 'workers_dev = false','preview_urls = false',route,
 '[[d1_databases]]','binding = "BROWSER_SAAS_DB"',
 'database_name = "lhm-browser-saas-staging"',
 'database_id = "'+id+'"',
 '[vars]','BROWSER_SAAS_STAGING = "enabled"',
 'BROWSER_GOOGLE_REDIRECT_URI = "https://'+host+'/v2/auth/google/callback"'].join('\n')+'\n';
process.stdout.write(config);
