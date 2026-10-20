'use strict';

// Safe support export. No URLs, profile names, proxy hosts/IPs, credentials,
// cookie/session data, browser paths, OS machine IDs or raw diagnostic details.
const STATUS=new Set(['ready','warning','error','planned']);
const KEYS=['profiles','active','proxies','workflows','errors','warnings',
 'authenticatedProfiles','unmatchedCredentials'];
function buildSupportReport(readiness,{version='unknown',platform='unknown',arch='unknown'}={}) {
  if(!readiness || !Array.isArray(readiness.items) || !readiness.counts)
    throw Error('Invalid readiness report');
  const counts={};
  for(const key of KEYS){
    const num=readiness.counts[key];
    counts[key]=Number.isInteger(num) && num>=0 ? Math.min(100000,num) : 0;
  }
  return {
    format:'LHM-SUPPORT-REPORT-1',createdAt:new Date().toISOString(),
    appVersion:String(version).slice(0,24),
    environment:{platform:String(platform).slice(0,24),arch:String(arch).slice(0,24)},
    counts,
    checks:readiness.items.map(item=>({
      code:String(item.key).slice(0,36),
      status:STATUS.has(item.status)?item.status:'unknown'
    })),
    limitations:'Report contains local counts and check statuses only. No Google risk score, cookies, sessions, identity or secrets are collected.'
  };
}
module.exports={buildSupportReport};