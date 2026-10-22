'use strict';
/**
 * Constitution 19.3: ICE candidates must be classified by type and
 * address kind — "any WebRTC address that differs from the proxy
 * address is a leaked real IP" is a forbidden simplification.
 *
 * Covered expectations:
 *  - mDNS-masked host candidates (*.local) are masked, not a leak and
 *    not proof of cleanliness;
 *  - private / loopback / link-local host candidates are local
 *    observations, not public exposure;
 *  - a relay candidate's public address belongs to the TURN server and
 *    is not counted as unexpected egress;
 *  - a PUBLIC srflx/prflx/host address different from the expected
 *    egress IS an unexpected public exposure observation;
 *  - unparseable candidates are 'unverified', never silently clean;
 *  - IPv6 candidates are classified (loopback/link-local/ULA/public);
 *  - inspectContext() reports the classification and still cannot
 *    certify DNS (dns stays NOT_TESTED).
 *
 * Unit level with mocked contexts — no real STUN server is contacted.
 */
const assert=require('assert');
const {classifyIceCandidate,classifyIceCandidates,
 unexpectedPublicCandidates,inspectContext}=require(
 '../src/engine/NetworkSafetyCheck');

const cand=(addr,type,proto='udp')=>
 `candidate:842163049 1 ${proto} 1677729535 ${addr} 51234 typ ${type} generation 0`;

function kinds(){
 assert.strictEqual(classifyIceCandidate(cand('192.168.1.20','host'))
  .addressKind,'private');
 assert.strictEqual(classifyIceCandidate(cand('127.0.0.1','host'))
  .addressKind,'loopback');
 assert.strictEqual(classifyIceCandidate(cand('169.254.4.5','host'))
  .addressKind,'link-local');
 const mdns=classifyIceCandidate(
  cand('a1b2c3d4-1111-2222-3333-444455556666.local','host'));
 assert.strictEqual(mdns.type,'host');
 assert.strictEqual(mdns.addressKind,'mdns');
 assert.strictEqual(classifyIceCandidate(cand('203.0.113.9','srflx'))
  .addressKind,'documentation');
 assert.strictEqual(classifyIceCandidate(cand('8.8.8.8','srflx'))
  .addressKind,'public');
 assert.strictEqual(classifyIceCandidate(cand('8.8.4.4','relay'))
  .addressKind,'public');
 assert.strictEqual(classifyIceCandidate(cand('::1','host'))
  .addressKind,'loopback');
 assert.strictEqual(classifyIceCandidate(cand('fe80::1','host'))
  .addressKind,'link-local');
 assert.strictEqual(classifyIceCandidate(cand('fd00::9','host'))
  .addressKind,'private');
 assert.strictEqual(classifyIceCandidate(cand('2001:4860:4860::8888','srflx'))
  .addressKind,'public');
 const junk=classifyIceCandidate('not a candidate');
 assert.strictEqual(junk.valid,false);
 assert.strictEqual(junk.addressKind,'unverified');
 assert.strictEqual(classifyIceCandidate(null).addressKind,'unverified');
}

function unexpected(){
 const expected='198.51.100.10'; // documentation range on purpose
 const list=classifyIceCandidates([
  cand('192.168.1.20','host'),          // local only
  cand('abcd-1234.local','host'),      // mDNS masked
  cand('8.8.4.4','relay'),             // TURN server address: by design
  cand(expected,'srflx')]);            // reflexive == expected egress
 assert.deepStrictEqual(unexpectedPublicCandidates(list,expected),[]);
 const exposed=classifyIceCandidates([
  cand('192.168.1.20','host'),
  cand('8.8.8.8','srflx')]);           // public reflexive != egress
 const flagged=unexpectedPublicCandidates(exposed,'203.0.113.1');
 assert.strictEqual(flagged.length,1);
 assert.strictEqual(flagged[0].type,'srflx');
 assert.strictEqual(flagged[0].address,'8.8.8.8');
 const hostPublic=classifyIceCandidates([cand('8.8.8.8','host')]);
 assert.strictEqual(
  unexpectedPublicCandidates(hostPublic,'203.0.113.1').length,1);
}

async function contextReport(){
 let closed=0;
 const ctx={newPage:async()=>({goto:async()=>{},close:async()=>{closed++;},
  evaluate:async()=>[
   cand('192.168.1.20','host'),
   cand('abcd-1234.local','host'),
   cand('8.8.4.4','relay'),
   cand('203.0.113.1','srflx')]})};
 const report=await inspectContext(ctx,
  {stunServer:'stun:lab.example:3478',expectedEgressIPv4:'203.0.113.1'});
 assert.strictEqual(report.result,'INCONCLUSIVE');
 assert.strictEqual(report.dns,'NOT_TESTED');
 assert.strictEqual(report.candidateCount,4);
 assert.strictEqual(report.unexpectedPublicCandidates.length,0);
 assert.strictEqual(report.candidates[1].addressKind,'mdns');
 assert.strictEqual(closed,1);
}

(async()=>{
 kinds();
 unexpected();
 await contextReport();
 console.log('ICE classification passed: host/srflx/prflx/relay, mDNS, '+
  'private/loopback/link-local, IPv6 kinds, unverified bucket, and '+
  'inspectContext reporting (mocked; no real STUN contacted)');
})().catch(e=>{console.error(e);process.exitCode=1;});
