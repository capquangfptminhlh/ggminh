'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/ui/index.html');
const ui=read('src/ui/maintenance.js');
const preload=read('preload.js');
const main=read('main.js');
const sql=read('db/schema-agency-proposal.sql');
for(const id of [
 'agency-controls-title','agency-profile','agency-approval-type',
 'agency-approval-refresh','agency-approval-confirm','agency-approval-result',
 'agency-egress-ip','agency-network-entries','agency-network-check','agency-network-result'
])assert(html.includes('id="'+id+'"'),id+' missing in UI');
for(const method of ['agencyApprovalTypes','agencyApprovalStatus',
 'agencyApprovalRecord','agencyNetworkPreview']){
 assert(ui.includes('api.'+method),method+' missing in health UI');
 assert(preload.includes(method+':'),method+' missing in preload');
}
for(const channel of [
 'agency-approval-types','agency-approval-status',
 'agency-approval-record','agency-network-preview'
])assert(main.includes("ipcMain.handle('"+channel+"'"),channel+' missing in main');
assert(ui.includes('textContent')&&!ui.includes('innerHTML'), 'UI must use text-only results');
assert(main.includes("dialog.showMessageBox(mainWindow"),'Approvals require OS dialog confirmation');
assert(sql.includes('CREATE TABLE IF NOT EXISTS agency_profile_approvals'));
assert(sql.includes('CREATE TABLE IF NOT EXISTS agency_network_sessions'));
assert(sql.includes('CREATE TABLE IF NOT EXISTS agency_billing_provider_refs'));
assert(!/CREATE TABLE\s+payments\b/i.test(sql),'Never store credit card BIN in a payment table');
console.log('Agency operations Health UI, IPC confirmation, privacy-safe SQLite proposal assertions passed');
