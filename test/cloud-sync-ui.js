'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const fromRoot=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=fromRoot('src/ui/index.html');
const script=fromRoot('src/ui/cloudSync.js');
const preload=fromRoot('preload.js');
const main=fromRoot('main.js');
const pkg=require('../package.json');
for(const id of ['btn-cloud-sync','modal-cloud-sync','cloud-sync-url','cloud-sync-tenant',
 'cloud-sync-device','cloud-sync-token','cloud-sync-passphrase','cloud-sync-preview',
 'cloud-sync-push','cloud-sync-apply','cloud-sync-confirm','cloud-team-load',
 'cloud-team-invite','cloud-team-email','cloud-team-role','cloud-team-list',
 'cloud-team-result']){
 assert(html.includes('id="'+id+'"'),id+' missing from real desktop HTML');
}
assert(html.includes('<script src="cloudSync.js"></script>'));
for(const name of ['cloudSyncPreview','cloudSyncPush','cloudSyncApply',
 'cloudTeamMembers','cloudTeamInvite','cloudTeamRevoke']){
 assert(script.includes('window.api.'+name+'('),name+' UI not wired');
 assert(preload.includes(name+':'),name+' missing from preload');
}
for(const channel of ['cloud-sync-preview','cloud-sync-push','cloud-sync-apply',
 'cloud-team-members','cloud-team-invite','cloud-team-revoke']){
 assert(main.includes("ipcMain.handle('"+channel+"'"),channel+' IPC missing');
}
assert(script.includes("el('cloud-sync-token').value=''"));
assert(script.includes("el('cloud-sync-passphrase').value=''"));
assert(script.includes("el('cloud-team-result').textContent=''"));
assert(script.includes('textContent='),'No safe text rendering');
assert(pkg.build.files.includes('!tools/cloud-server.js'));
assert(pkg.build.files.includes('!src/sync/cloudService.js'));
console.log('Cloud/Team UI, main/preload IPC and server-exclusion smoke passed');
