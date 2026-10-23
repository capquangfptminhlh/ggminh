'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectOne, inspectLandingUrls, buildUtmUrl, isLocalAddress, MAX_URLS } =
  require('../src/ads/landingGuard');

function has(report,code){return report.findings.some(x=>x.code===code);}
const good=inspectLandingUrls('https://shop.example.com/p?utm_source=google&utm_medium=cpc&utm_campaign=sale_10');
assert.equal(good.checked,1);
assert.equal(good.blocked,0);
assert.equal(good.items[0].status,'ready');
assert.equal(good.networkRequests,0);
assert.equal(good.conversionTrackingVerified,false);
assert.equal(good.items[0].httpChecked,false);

const missing=inspectOne('https://shop.example.com/?utm_source=google&utm_medium=cpc',1);
assert.equal(missing.status,'review');
assert(has(missing,'utm_incomplete'));
const noUtm=inspectOne('https://shop.example.com/',1);
assert.equal(noUtm.status,'ready');
assert(has(noUtm,'utm_optional'), 'Auto-tagging without manual UTM is legitimate');
const duplicate=inspectOne('https://shop.example.com/?UTM_source=google&utm_source=meta&utm_campaign=x&utm_medium=cpc',1);
assert(has(duplicate,'duplicate_tracking'));
const invalid=inspectLandingUrls('ftp://shop.example.com\nhttps://user:password@example.com/\nhttps://127.0.0.1/private');
assert.equal(invalid.blocked,3);
assert(has(invalid.items[0],'protocol_unsupported'));
assert(has(invalid.items[1],'url_credentials'));
assert(has(invalid.items[2],'non_public_destination'));
assert(has(inspectOne('http://example.com/',1),'unencrypted_destination'));
assert(has(inspectOne('https://shop.example.com/?utm_medium=%20',1),'utm_value_invalid'));
for (const host of ['localhost','a.localhost','10.0.0.1','192.168.1.1','[::1]','test.internal'])
  assert(isLocalAddress(host),'Should flag local/internal destination: '+host);
assert.equal(isLocalAddress('8.8.8.8'),false);

const sensitive='https://shop.example.com/private-customer-123?email=jane%40example.com&access_token=sk-secret_1234567890123';
const privateReport=inspectLandingUrls(sensitive);
assert.equal(privateReport.blocked,1);
const serialized=JSON.stringify(privateReport);
for(const value of ['private-customer-123','jane%40example.com','jane@example.com','sk-secret_1234567890123'])
  assert(!serialized.includes(value),'Inspection report accidentally echoed sensitive input');
assert(has(privateReport.items[0],'sensitive_query_key'));

assert.throws(()=>inspectLandingUrls(''),/1–20 URL/);
assert.throws(()=>inspectLandingUrls(Array.from({length:MAX_URLS+1},()=> 'https://example.com').join('\n')),/tối đa 20/);
assert.throws(()=>inspectLandingUrls('a'.repeat(32001)),/32.000/);
const many=inspectLandingUrls(Array.from({length:MAX_URLS},()=> 'https://example.com').join('\n'));
assert.equal(many.checked,MAX_URLS);

const built=buildUtmUrl('https://shop.example.com/buy?ref=campaign&utm_source=old&utm_medium=old&utm_campaign=old#faq', {
  utm_source:'google',utm_medium:'cpc',utm_campaign:'october_2026',utm_content:'banner_a'
});
const url=new URL(built.url);
assert.equal(url.searchParams.get('ref'),'campaign');
assert.equal(url.searchParams.get('utm_source'),'google');
assert.equal(url.searchParams.get('utm_medium'),'cpc');
assert.equal(url.searchParams.get('utm_campaign'),'october_2026');
assert.equal(url.searchParams.get('utm_content'),'banner_a');
assert.equal(url.hash,'#faq');
assert.equal(url.searchParams.getAll('utm_source').length,1);
assert.equal(built.status,'ready');
assert.throws(()=>buildUtmUrl('https://localhost/p',{utm_source:'google',utm_medium:'cpc',utm_campaign:'x'}),/công khai/);
assert.throws(()=>buildUtmUrl('https://shop.example.com/?email=jane@example.com',{
 utm_source:'google',utm_medium:'cpc',utm_campaign:'x'
}),/nhạy cảm/);
assert.throws(()=>buildUtmUrl('https://shop.example.com/',{
 utm_source:'google',utm_medium:'cpc',utm_campaign:''
}),/Cần đủ/);

const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/ui/adsLaunchGuard.js'),'utf8');
assert(main.includes("ipcMain.handle('ads-landing-inspect'"));
assert(main.includes("ipcMain.handle('ads-utm-build'"));
assert(preload.includes('inspectAdsLandingUrls'));
assert(preload.includes('buildAdsUtmUrl'));
for(const id of ['btn-ads-launch-guard','modal-ads-launch-guard','ads-guard-inspect','ads-guard-results','ads-guard-build','ads-guard-output'])
  assert(html.includes('id="'+id+'"'),'Missing Ads Launch Guard UI: '+id);
assert(html.includes('src="adsLaunchGuard.js"'));
assert(html.includes('href="adsLaunchGuard.css"'));
assert(ui.includes('container.replaceChildren'));
assert(ui.includes('textContent'));
assert(!ui.includes('innerHTML'),'Do not build HTML from advertiser input');
console.log('Ads Launch Guard: offline URL/UTM checks, redaction, optional tagging, safe builder and UI wiring passed');
