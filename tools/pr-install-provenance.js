'use strict';
const fs = require('fs');
const SHA = /^[a-f0-9]{40}$/;
const RUN = /^[0-9]{6,18}$/;
function validate(value) {
  const {repository, headRepository, number, merge, base, head, parents,
    baselineSha, baselineAncestor, candidate, baseline} = value;
  if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
      headRepository !== repository || !Number.isSafeInteger(number) || number < 1 ||
      ![merge,base,head,baselineSha].every(s => SHA.test(s || '')) ||
      merge === base || merge === head || baselineSha === head ||
      !Array.isArray(parents) || parents.length !== 2 || parents[0] !== base || parents[1] !== head ||
      baselineAncestor !== true) throw Error('Invalid PR merge provenance');
  function checkRun(run) {
    if (!run || !RUN.test(String(run.id || '')) || run.status !== 'completed' ||
        run.conclusion !== 'success' || run.path !== '.github/workflows/windows-exe.yml' ||
        run.head_repository?.full_name !== repository) throw Error('Invalid build run');
  }
  checkRun(candidate); checkRun(baseline);
  if (candidate.id === baseline.id || candidate.event !== 'pull_request' ||
      candidate.head_sha !== head || baseline.head_sha !== baselineSha ||
      baseline.head_branch !== 'main' ||
      !Array.isArray(candidate.pull_requests) || !candidate.pull_requests.some(pr =>
        pr.number === number && pr.base?.sha === base && pr.head?.sha === head))
    throw Error('Build run does not match PR or baseline');
}
if (require.main === module) {
  try { validate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))); console.log('PR provenance verified'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {validate};
