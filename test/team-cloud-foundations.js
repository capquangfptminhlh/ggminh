'use strict';
const assert=require('assert');
const crypto=require('crypto');
const {authorize,requirePermission,TeamInvitations}=require('../src/team/policy');
const {portableProfiles,encryptMetadata,decryptMetadata,RevisionGuard}=
 require('../src/sync/encryptedMetadata');
(async()=>{
 const state={memberships:[
  {tenantId:'tenantA',subjectId:'ownerA',role:'owner',groups:['*'],status:'active'},
  {tenantId:'tenantA',subjectId:'operatorA',role:'operator',groups:['group1'],status:'active'},
  {tenantId:'tenantA',subjectId:'viewerA',role:'viewer',groups:['group1'],status:'active'},
  {tenantId:'tenantB',subjectId:'ownerB',role:'owner',groups:['*'],status:'active'}
 ],profiles:[
  {tenantId:'tenantA',id:'profile1',groupId:'group1'},
  {tenantId:'tenantA',id:'profile2',groupId:'group2'},
  {tenantId:'tenantB',id:'profile3',groupId:'group1'}
 ]};
 assert(authorize(state,{tenantId:'tenantA',subjectId:'ownerA',
  action:'profile:delete',profileId:'profile2'}));
 assert(authorize(state,{tenantId:'tenantA',subjectId:'operatorA',
  action:'profile:write',profileId:'profile1'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'operatorA',
  action:'profile:write',profileId:'profile2'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'operatorA',
  action:'profile:write',profileId:'profile3'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'operatorA',
  action:'profile:write'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'viewerA',
  action:'profile:delete',profileId:'profile1'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'ownerB',
  action:'profile:read',profileId:'profile1'}));
 assert(!authorize(state,{tenantId:'tenantB',subjectId:'ownerA',
  action:'profile:read',profileId:'profile3'}));
 assert.throws(()=>requirePermission(state,{tenantId:'tenantA',
  subjectId:'operatorA',action:'team:manage'}),/Access denied/);
 let now=Date.UTC(2026,9,21);
 const invites=new TeamInvitations(state,{now:()=>now});
 assert.throws(()=>invites.issue({tenantId:'tenantA',issuedBy:'operatorA',
  email:'new@example.com',role:'viewer',groups:['group1']}),/Access denied/);
 const invitation=invites.issue({tenantId:'tenantA',issuedBy:'ownerA',
  email:'New@Example.com',role:'viewer',groups:['group1'],ttlHours:1});
 assert(!Object.hasOwn(invitation,'digest'));
 assert(state.invites[0].digest!==invitation.token);
 assert(!JSON.stringify(state.audit).includes(invitation.token));
 assert.throws(()=>invites.accept({tenantId:'tenantA',token:invitation.token,
  subjectId:'newMember',verifiedEmail:'wrong@example.com'}),/mismatch/);
 const accepted=invites.accept({tenantId:'tenantA',token:invitation.token,
  subjectId:'newMember',verifiedEmail:'new@example.com'});
 assert.strictEqual(accepted.role,'viewer');
 assert(authorize(state,{tenantId:'tenantA',subjectId:'newMember',
  action:'profile:read',profileId:'profile1'}));
 assert(!authorize(state,{tenantId:'tenantA',subjectId:'newMember',
  action:'profile:read',profileId:'profile2'}));
 assert.throws(()=>invites.accept({tenantId:'tenantA',token:invitation.token,
  subjectId:'anotherUser',verifiedEmail:'new@example.com'}),/used/);
 const revoked=invites.issue({tenantId:'tenantA',issuedBy:'ownerA',
  email:'revoke@example.com',role:'operator',groups:['group1']});
 invites.revoke({tenantId:'tenantA',issuedBy:'ownerA',id:revoked.id});
 assert.throws(()=>invites.accept({tenantId:'tenantA',token:revoked.token,
  subjectId:'revokedUser',verifiedEmail:'revoke@example.com'}),/revoked/);
 const expired=invites.issue({tenantId:'tenantA',issuedBy:'ownerA',
  email:'expire@example.com',role:'viewer',groups:['group1'],ttlHours:1});
 now+=3600001;
 assert.throws(()=>invites.accept({tenantId:'tenantA',token:expired.token,
  subjectId:'expiredUser',verifiedEmail:'expire@example.com'}),/expired/);
 const demo=[{id:'pb_demo',name:'Demo',group:'Example',engine:'chromium',
  tags:['business'],cookie:'sensitive',proxy:{password:'secret'},
  startUrls:['https://example.com/?token=confidential'],notes:'private'}];
 const cleaned=portableProfiles(demo);
 for(const field of ['cookie','proxy','startUrls','notes'])
  assert(!Object.hasOwn(cleaned[0],field));
 const passphrase='a secure long passphrase 2026';
 const env=encryptMetadata({tenantId:'tenantA',deviceId:'device1',revision:1,
  passphrase,profiles:demo});
 const decrypted=decryptMetadata(env,passphrase,'tenantA');
 assert.deepStrictEqual(decrypted.profiles,cleaned);
 assert(!JSON.stringify(env).includes('sensitive'));
 assert(!JSON.stringify(env).includes('confidential'));
 assert.throws(()=>decryptMetadata(env,'totally different and long password','tenantA'));
 assert.throws(()=>decryptMetadata(env,passphrase,'tenantB'),/another tenant/);
 const modified={...env,revision:2};
 assert.throws(()=>decryptMetadata(modified,passphrase,'tenantA'));
 const corrupt={...env,ciphertext:Buffer.from('corrupted').toString('base64')};
 assert.throws(()=>decryptMetadata(corrupt,passphrase,'tenantA'));
 const revisions=new RevisionGuard();
 assert.deepStrictEqual(revisions.put(env,0),{revision:1});
 assert.throws(()=>revisions.put(env,0),/conflict/);
 const next=encryptMetadata({tenantId:'tenantA',deviceId:'device2',revision:2,
  passphrase,profiles:demo});
 revisions.put(next,1);
 assert.strictEqual(decryptMetadata(revisions.load('tenantA'),passphrase,'tenantA')
  .deviceId,'device2');
 console.log('Team RBAC tenant isolation, invite expiry/revocation, encrypted sync and revision conflict tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
