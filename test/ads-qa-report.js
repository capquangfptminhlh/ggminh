'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {CHECKS,normalizeChecks,buildCampaignQaReport}=require('../src/ads/campaignQaReport');

const now=()=>Date.parse('2026-10-23T10:00:00.000Z');
const url='https://example.com/customer-id/12345?utm_source=google&utm_medium=cpc&utm_campaign=launch&email=customer%40private.test&access_token=sk-supersecret_value1234567#owner';
const base=buildCampaignQaReport({urls:'https://example.com/shop?utm_source=google&utm_medium=cpc&utm_campaign=launch',checks:{}},now);
assert.equal(base.report.schema,'lhm.ads.qa.v1');
assert.equal(base.report.generatedAt,'2026-10-23T10:00:00.000Z');
assert.equal(base.report.decision,'REQUIRES_REVIEW');
assert.equal(base.report.summary.userNotChecked,CHECKS.length);
assert.equal(base.report.summary.offlineUrls,1);
assert.equal(base.report.summary.urlBlocked,0);
assert(base.report.destinations.every(item=>item.origin==='https://example.com'));
assert(base.report.destinations.every(item=>item.httpChecked===false&&item.liveTrackingChecked===false));
assert.equal(base.report.assertions.externalRequestsPerformed,0);
assert.equal(base.report.assertions.providerAccountApprovalVerified,false);
assert.equal(base.report.assertions.conversionVerifiedBySoftware,false);
assert(base.report.manualChecks.every(x=>x.evidence==='user_attestation_only'));
assert(!base.text.includes('utm_campaign=launch'), 'Do not echo query values');
assert.equal(base.report.integrity.algorithm,'SHA-256');
const decoded=JSON.parse(base.text);
const {integrity,...unsigned}=decoded;
assert.equal(integrity.bodySha256,crypto.createHash('sha256').update(JSON.stringify(unsigned),'utf8').digest('hex'));
assert.equal(integrity.bodySha256.length,64);

const privateReport=buildCampaignQaReport({urls:url,checks:{}},now);
const serialized=privateReport.text;
assert.equal(privateReport.report.summary.urlBlocked,1);
assert.equal(privateReport.report.decision,'NEEDS_CORRECTION');
for(const secret of ['customer-id','12345','customer%40private.test','customer@private.test','sk-supersecret_value1234567','utm_medium=cpc'])
  assert(!serialized.includes(secret),'Sensitive URL segment/value echoed in exported report: '+secret);
assert(serialized.includes('sensitive_query_key'));
assert(!serialized.includes('httpChecked": true'));

const selections=Object.fromEntries(CHECKS.map(x=>[x.id,'confirmed']));
const approved=buildCampaignQaReport({urls:'https://example.com/shop',checks:selections},now);
assert.equal(approved.report.summary.userConfirmed,CHECKS.length);
assert.equal(approved.report.decision,'LOCAL_QA_RECORDED');
assert.equal(approved.report.assertions.conversionVerifiedBySoftware,false,
  'User attestation must never become verified-by-software');
assert(approved.report.disclaimer.includes('người lập báo cáo tự xác nhận'));
const blocked=buildCampaignQaReport({urls:'https://example.com/shop',checks:{
  conversion_event:'needs-work'}},now);
assert.equal(blocked.report.decision,'NEEDS_CORRECTION');
const exempt=buildCampaignQaReport({urls:'https://example.com/shop',checks:{
  ga4_or_meta_pixel:'not-applicable'}},now);
assert.equal(exempt.report.summary.userNotApplicable,1);
assert.equal(exempt.report.summary.userNotChecked,CHECKS.length-1);
assert.notEqual(exempt.report.decision,'LOCAL_QA_RECORDED');
const allNotApplicable=buildCampaignQaReport({urls:'https://example.com/shop',checks:
  Object.fromEntries(CHECKS.map(x=>[x.id,'not-applicable']))},now);
assert.equal(allNotApplicable.report.decision,'REQUIRES_REVIEW',
  'No user-confirmed QA cannot be represented as reviewed');
const duplicate=normalizeChecks(selections);
assert.equal(duplicate.length,CHECKS.length);
assert.throws(()=>normalizeChecks(null),/checklist/);
assert.throws(()=>normalizeChecks({other:'confirmed'}),/không xác định/);
assert.throws(()=>normalizeChecks({budget_and_schedule:'verified-by-lhm'}),/Checklist chỉ nhận/);
assert.throws(()=>buildCampaignQaReport({urls:'',checks:selections},now),/1–20 URL/);
assert.throws(()=>buildCampaignQaReport({urls:'https://example.com',checks:[]},now),/checklist/);
assert.notEqual(approved.report.integrity.bodySha256,base.report.integrity.bodySha256);

const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/ui/adsLaunchGuard.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/adsLaunchGuard.css'),'utf8');
assert(main.includes("ipcMain.handle('ads-qa-export'"));
assert(main.includes("ipcMain.handle('ads-qa-preview'"));
assert(main.includes("ipcMain.handle('ads-qa-checklist'"));
assert(main.includes('dialog.showSaveDialog(mainWindow'));
assert(main.includes('buildCampaignQaReport(input)'));
assert(preload.includes('exportAdsQa'));
assert(preload.includes('previewAdsQa'));
assert(preload.includes('adsQaChecklist'));
for(const id of ['ads-qa-checklist','ads-qa-preview','ads-qa-export','ads-qa-status'])
  assert(html.includes('id="'+id+'"'),'Missing campaign QA UI control: '+id);
assert(ui.includes("api.exportAdsQa(qaPayload())"));
assert(ui.includes("api.previewAdsQa(qaPayload())"));
assert(ui.includes('textContent'));
assert(!ui.includes('innerHTML'),'Never render advertiser text as arbitrary HTML');
assert(css.includes('.lhm-ads-qa-checklist'));
console.log('Ads campaign QA dossier: offline evidence, provenance, export wiring, checksum, report privacy and manual checks PASS');
