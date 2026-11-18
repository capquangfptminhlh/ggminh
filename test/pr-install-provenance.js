'use strict';
const assert = require('assert');
const { validate } = require('../tools/pr-install-provenance');
const sha = n => String(n).repeat(40);
const repo = 'owner/repo';
const run = (id, event, head, branch) => ({id, event, head_sha: head,
  head_branch: branch, status: 'completed', conclusion: 'success',
  path: '.github/workflows/windows-exe.yml', head_repository: {full_name: repo}});
const candidate = run(123456, 'pull_request', sha(3), 'integration/test');
candidate.pull_requests = [{number: 130, base: {sha: sha(2)}, head: {sha: sha(3)}}];
const baseline = run(123457, 'push', sha(1), 'main');
const input = {repository: repo, headRepository: repo, number: 130, merge: sha(4),
  base: sha(2), head: sha(3), parents: [sha(2), sha(3)], baselineSha: sha(1),
  baselineAncestor: true, candidate, baseline};
assert.doesNotThrow(() => validate(input));
for (const changed of [
 {headRepository:'other/repo'}, {parents:[sha(3),sha(2)]}, {parents:[sha(2)]},
 {merge:sha(3)}, {baselineAncestor:false}, {baselineSha:sha(3)},
 {candidate:{...candidate,head_sha:sha(4)}},
 {candidate:{...candidate,event:'push'}},
 {candidate:{...candidate,pull_requests:[{number:130,base:{sha:sha(1)},head:{sha:sha(3)}}]}},
 {baseline:{...baseline,head_branch:'other'}},
 {baseline:{...baseline,conclusion:'failure'}},
 {candidate:{...candidate,head_repository:{full_name:'other/repo'}}}
]) assert.throws(() => validate({...input,...changed}));
console.log('PR install provenance checks passed');
