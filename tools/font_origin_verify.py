#!/usr/bin/env python3
"""CI-only: verify pinned font references and collect matching license blobs."""
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

def source_url(commit, source_path, repo='google/fonts'):
    p = PurePosixPath(source_path)
    allowed = {'google/fonts':{'ofl','apache','ufl'},
               'notofonts/noto-fonts':{'archive','hinted','unhinted','LICENSE'},
               'notofonts/noto-cjk':{'Sans','Serif'}}
    if (not re.fullmatch(r'[0-9a-f]{40}', commit) or p.is_absolute() or
        repo not in allowed or not p.parts or p.parts[0] not in allowed[repo] or
        any(part in {'..', '.'} for part in p.parts) or '\\' in source_path or
        '://' in source_path):
        raise ValueError('Invalid official source path')
    return 'https://raw.githubusercontent.com/' + repo + '/' + commit + '/' + urllib.parse.quote(source_path, safe='/')

def verify_stream(stream, record):
    size = record['bytes']
    sha256 = hashlib.sha256()
    blob = hashlib.sha1(b'blob ' + str(size).encode('ascii') + b'\0')
    total = 0
    while chunk := stream.read(1024 * 1024):
        total += len(chunk)
        if total > size:
            return False
        sha256.update(chunk)
        blob.update(chunk)
    return total == size and sha256.hexdigest() == record['sha256'] and blob.hexdigest() == record['git_blob_sha1']

def fetch_verified(record, commit, repo):
    url = source_url(commit, record['source_path'], repo)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'LHM-font-provenance-review/1.0'})
            with urllib.request.urlopen(req, timeout=60) as response:
                if urllib.parse.urlparse(response.geturl()).hostname != 'raw.githubusercontent.com':
                    raise ValueError('Unexpected source redirect')
                if not verify_stream(response, record):
                    raise ValueError('Content mismatch')
            return {'candidate_path':record['candidate_path'], 'source_path':record['source_path'],
                    'sha256':record['sha256'], 'result':'PASS'}
        except Exception as exc:
            if attempt == 2:
                return {'candidate_path':record['candidate_path'], 'source_path':record['source_path'],
                        'result':'FAIL', 'error':type(exc).__name__}
            time.sleep(attempt + 1)

def fetch_license(entry, commit, repo, output):
    url = source_url(commit, entry['path'], repo)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'LHM-font-provenance-review/1.0'})
            with urllib.request.urlopen(req, timeout=60) as response:
                if urllib.parse.urlparse(response.geturl()).hostname != 'raw.githubusercontent.com':
                    raise ValueError('Unexpected source redirect')
                data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise ValueError('License exceeds limit')
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()
            if blob != entry['git_blob_sha1']:
                raise ValueError('License blob mismatch')
            path = output / 'licenses' / (blob + '.txt')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return {'source_path':entry['path'], 'git_blob_sha1':blob,
                    'sha256':hashlib.sha256(data).hexdigest(), 'result':'PASS'}
        except Exception as exc:
            if attempt == 2:
                return {'source_path':entry['path'], 'result':'FAIL', 'error':type(exc).__name__}
            time.sleep(attempt + 1)

def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Disposable GitHub runner only')
    kind = sys.argv[1] if len(sys.argv)==2 else 'google'
    fixtures = {'google':('test/fixtures/font-origin-reference.json',336,'lhm-font-origin-evidence','google/fonts','06bfe0d62a98375cb09c942fa18e68bd32cff057'),
                'noto-fonts':('test/fixtures/font-origin-noto-fonts-reference.json',38,'lhm-font-origin-noto-fonts','notofonts/noto-fonts','ffebf8c1ee449e544955a7e813c54f9b73848eac'),
                'noto-cjk':('test/fixtures/font-origin-noto-cjk-reference.json',2,'lhm-font-origin-noto-cjk','notofonts/noto-cjk','f8d157532fbfaeda587e826d4cd5b21a49186f7c'),
                'noto-2018':('test/fixtures/font-origin-noto-2018-reference.json',47,'lhm-font-origin-noto-2018','notofonts/noto-fonts','dbfc8a1858732279842454cac5da2ea1ff691a24'),
                'noto-2020':('test/fixtures/font-origin-noto-2020-reference.json',2,'lhm-font-origin-noto-2020','notofonts/noto-fonts','20bc5918912503bc1537a407a694738c33c048aa')}
    if kind not in fixtures:
        raise SystemExit('Unsupported source fixture')
    fixture_path, expected_count, output_name, expected_repo, expected_commit = fixtures[kind]
    fixture = json.loads(Path(fixture_path).read_text(encoding='utf8'))
    commit = fixture['source_commit']
    repo = fixture.get('source_repo','google/fonts')
    if repo != expected_repo or commit != expected_commit or fixture.get('candidate_payload') != '0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d':
        raise SystemExit('Source identity does not match expected pins')
    files = fixture['files']
    if len(files) != expected_count or len({r['candidate_path'] for r in files}) != len(files):
        raise SystemExit('Unexpected or duplicate reference records')
    out = Path(os.environ['RUNNER_TEMP']) / output_name
    out.mkdir(exist_ok=False)
    licenses = {}
    for row in files:
        for entry in row['licenses']:
            previous = licenses.setdefault(entry['path'], entry)
            if previous['git_blob_sha1'] != entry['git_blob_sha1']:
                raise SystemExit('Conflicting license blob reference')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda row: fetch_verified(row, commit, repo), files))
    # Different paths can refer to an identical blob; write those serially so
    # two workers never race on the same evidence filename.
    license_results = [fetch_license(row, commit, repo, out) for row in licenses.values()]
    report = {'schema':'lhm.font-origin-verified.v1', 'source_repo':repo, 'source_commit':commit,
              'candidate_payload':fixture['candidate_payload'], 'font_count':len(results),
              'font_pass':sum(r['result']=='PASS' for r in results),
              'license_count':len(license_results), 'license_pass':sum(r['result']=='PASS' for r in license_results),
              'limitations':'Exact bytes in pinned upstream repository only; no legal or distribution approval.',
              'fonts':results, 'licenses':license_results}
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k:report[k] for k in ('font_count','font_pass','license_count','license_pass')}))
    if report['font_pass'] != report['font_count'] or report['license_pass'] != report['license_count']:
        raise SystemExit('Some upstream files could not be verified')

if __name__ == '__main__':
    main()
