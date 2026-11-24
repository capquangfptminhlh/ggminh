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

def source_url(commit, source_path):
    p = PurePosixPath(source_path)
    if (not re.fullmatch(r'[0-9a-f]{40}', commit) or p.is_absolute() or
        not p.parts or p.parts[0] not in {'ofl', 'apache', 'ufl'} or
        any(part in {'..', '.'} for part in p.parts) or '\\' in source_path or
        '://' in source_path):
        raise ValueError('Invalid official source path')
    return 'https://raw.githubusercontent.com/google/fonts/' + commit + '/' + urllib.parse.quote(source_path, safe='/')

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

def fetch_verified(record, commit):
    url = source_url(commit, record['source_path'])
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

def fetch_license(entry, commit, output):
    url = source_url(commit, entry['path'])
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
    fixture = json.loads(Path('test/fixtures/font-origin-reference.json').read_text(encoding='utf8'))
    commit = fixture['source_commit']
    files = fixture['files']
    if len(files) != 336 or len({r['candidate_path'] for r in files}) != len(files):
        raise SystemExit('Unexpected or duplicate reference records')
    out = Path(os.environ['RUNNER_TEMP']) / 'lhm-font-origin-evidence'
    out.mkdir(exist_ok=False)
    licenses = {}
    for row in files:
        for entry in row['licenses']:
            previous = licenses.setdefault(entry['path'], entry)
            if previous['git_blob_sha1'] != entry['git_blob_sha1']:
                raise SystemExit('Conflicting license blob reference')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda row: fetch_verified(row, commit), files))
    # Different paths can refer to an identical blob; write those serially so
    # two workers never race on the same evidence filename.
    license_results = [fetch_license(row, commit, out) for row in licenses.values()]
    report = {'schema':'lhm.font-origin-verified.v1', 'source_commit':commit,
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
