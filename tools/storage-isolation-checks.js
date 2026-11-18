'use strict';

function evaluateIsolationChecks({steps,simultaneous,concurrentA,concurrentB,
 concurrentExitCodes,concurrentStopped,restoreExcludesSessions}){
 const byLabel=label=>steps.find(step=>step.step===label);
 const empty=r=>!!r&&!r.err&&!r.cookie&&!r.cookieHeader&&r.localStorage===null&&r.indexedDB===null&&r.cacheStorage===null;
 const onlyA=r=>!!r&&!r.err&&/lhm_js=A/.test(r.cookie)&&!/=B/.test(r.cookie)&&/lhm_http=A/.test(r.cookieHeader)&&
  !/=B/.test(r.cookieHeader)&&r.localStorage==='A'&&r.indexedDB==='A'&&r.cacheStorage==='A';
 const onlyB=r=>!!r&&!r.err&&/lhm_js=B/.test(r.cookie)&&!/=A/.test(r.cookie)&&/lhm_http=B/.test(r.cookieHeader)&&
  !/=A/.test(r.cookieHeader)&&r.localStorage==='B'&&r.indexedDB==='B'&&r.cacheStorage==='B';
 const aWrite=byLabel('A writes'),bRead=byLabel('B reads (must be empty)'),
  aRestart=byLabel('A reads after restart (must be A)'),bWrite=byLabel('B writes'),
  aAfterB=byLabel('A reads after B wrote (must be A only)');
 const requiredLabels=['A writes','B reads (must be empty)','A reads after restart (must be A)',
  'B writes','A reads after B wrote (must be A only)','A after concurrent stop','B after concurrent stop',
  'restored A starts without session','restored B starts without session'];
 const completeSteps=steps.length===requiredLabels.length&&
  requiredLabels.every(label=>steps.filter(step=>step.step===label).length===1);
 return {
  profileBSeesNothingOfA:empty(bRead),
  profileAPersistsAcrossRestart:onlyA(aRestart),
  profileANotPollutedByB:onlyA(aAfterB),
  profileBWroteOwnValues:!!bWrite&&bWrite.localStorage==='B',
  concurrentProcessesActive:!!simultaneous,
  concurrentASeesOnlyA:onlyA(concurrentA),
  concurrentBSeesOnlyB:onlyB(concurrentB),
  concurrentProcessesStopped:!!concurrentStopped,
  concurrentProcessesExitedCleanly:concurrentExitCodes.A===0&&concurrentExitCodes.B===0,
  concurrentDataPersistsAfterRestart:onlyA(byLabel('A after concurrent stop'))&&onlyB(byLabel('B after concurrent stop')),
  restoredProfilesHaveNoSession:restoreExcludesSessions===true&&empty(byLabel('restored A starts without session'))&&
   empty(byLabel('restored B starts without session')),
  httpCacheNotSharedWithB:!!aWrite&&!!bRead&&aWrite.httpCacheNetworkFetches===1&&bRead.httpCacheNetworkFetches===1,
  httpCachePersistsForA:!!aRestart&&aRestart.httpCacheNetworkFetches===0,
  stopIsGraceful:completeSteps&&steps.every(s=>s.exit&&s.exit.code===0&&s.stopToExitMs<8000)
 };
}
function processDiagnostics(launcher,id){
 const proc=launcher.activeProcesses.get(id)?.process;
 return {tracked:!!proc,busy:launcher.isBusy(id),
  dialogBlocked:typeof proc?.dialogBlocked==='boolean'?proc.dialogBlocked:null,
  jobComplete:typeof proc?.jobComplete==='boolean'?proc.jobComplete:null,
  exitCode:Number.isInteger(proc?.exitCode)?proc.exitCode:null,signaled:!!proc?.signalCode};
}
module.exports={evaluateIsolationChecks,processDiagnostics};
