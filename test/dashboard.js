const assert = require('assert');
const { buildDashboardSummary } = require('../src/ops/dashboard');

const model = buildDashboardSummary({
  profiles:[
    {id:'a',name:'Alpha',group:'Ads',engine:'chromium',fingerprint:{mode:'native'}},
    {id:'b',name:'Beta',group:'Ads',engine:'chromium',fingerprint:{mode:'experimental'}},
    {id:'c',name:'Gamma',group:'Social',engine:'gecko'}
  ],
  active:[{profileId:'a'},{profileId:'c'},{profileId:'unknown'}],
  healthReports:[
    {profileId:'a',status:'ready',issues:[]},
    {profileId:'b',status:'warning',issues:[{level:'warning',message:'UA cũ'}]},
    {profileId:'c',status:'error',issues:[{level:'error',message:'Thiếu Firefox'}]}
  ],
  proxies:[{id:'p1',check:{verified:true}},{id:'p2',check:null}],
  workflows:[{id:'one'},{id:'two'}],
  automation:{status:'running',workflowName:'Demo Test'},
  behavior:{activities10m:7,alerts:[{code:'a1'}],recentEvents:[
    {action:'profile_open',at:1725000000000,profileId:'a',source:'manual'},
    {action:'unsupported',at:0,profileId:'b',source:'unknown'}
  ]}
});
assert.deepStrictEqual(model.profiles,{
  total:3,active:2,native:2,experimental:1,errors:1,warnings:1
});
assert.deepStrictEqual(model.proxies,{total:2,checked:1,verified:1});
assert.strictEqual(model.automation.running,true);
assert.strictEqual(model.automation.total,2);
assert.strictEqual(model.groups[0].total,2);
assert.strictEqual(model.groups[0].active,1);
assert.strictEqual(model.warnings.length,2);
assert.strictEqual(model.activity.recentEvents[1].action,'unknown');
assert.strictEqual(model.activity.recentEvents[1].source,'manual');
assert(!JSON.stringify(model).includes('99.9%'));
const blank=buildDashboardSummary();
assert.strictEqual(blank.profiles.total,0);
assert.strictEqual(blank.automation.state,'idle');
assert.strictEqual(blank.proxies.verified,0);
assert.strictEqual(blank.activity.alertCount,0);
console.log('Dashboard truthful live-data projection tests passed');
