"""Verify candidate Iosevka bytes against a pinned official release in CI."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LICENSE_URL = 'https://raw.githubusercontent.com/be5invis/Iosevka/7c9b0bcffabedf834c421ab9b3958283c401afcb/LICENSE.md'
LICENSE_BLOB = '3efe1ab581a2756d4802386cabd38ee75f3ae26f'


def verify_entries(archive, rows):
    by_name = {}
    for info in archive.infolist():
        if not info.is_dir() and info.filename.lower().endswith('.ttf'):
            by_name.setdefault(PurePosixPath(info.filename).name, []).append(info)
    results = []
    for row in rows:
        matches = by_name.get(row['archive_basename'], [])
        result = {'candidate_path': row['candidate_path'], 'result': 'FAIL'}
        if len(matches) != 1:
            result['reason'] = 'missing or ambiguous archive basename'
        elif matches[0].file_size > 32 * 1024 * 1024:
            result['reason'] = 'font exceeds size limit'
        else:
            digest = hashlib.sha256()
            with archive.open(matches[0]) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            result['archive_path'] = matches[0].filename
            result['sha256'] = digest.hexdigest()
            result['result'] = 'PASS' if digest.hexdigest() == row['sha256'] else 'FAIL'
        results.append(result)
    return results


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('This verifier is restricted to GitHub Actions.')
    temp = Path(os.environ['RUNNER_TEMP']).resolve()
    archive_path = Path(sys.argv[1]).resolve(strict=True)
    if not archive_path.is_relative_to(temp) or not archive_path.is_file():
        raise SystemExit('Archive must be a file within RUNNER_TEMP.')
    fixture = json.loads((ROOT / 'test/fixtures/font-origin-iosevka-reference.json').read_text(encoding='utf-8'))
    rows = fixture['files']
    if (fixture['source_commit'] != '7c9b0bcffabedf834c421ab9b3958283c401afcb'
            or fixture['archive_sha256'] != 'e03a65db743025e85dd888e7f6c91db2a2b39a4eb158e837ba5def29f886d011'
            or fixture['archive_size'] != 153494971 or len(rows) != 54
            or len({row['candidate_path'] for row in rows}) != len(rows)):
        raise SystemExit('Invalid pinned reference fixture.')
    digest = hashlib.sha256()
    with archive_path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if archive_path.stat().st_size != fixture['archive_size'] or digest.hexdigest() != fixture['archive_sha256']:
        raise SystemExit('Release archive does not match the pinned SHA-256 and size.')
    with zipfile.ZipFile(archive_path) as archive:
        results = verify_entries(archive, rows)
    with urllib.request.urlopen(LICENSE_URL, timeout=30) as response:
        license_data = response.read(100_001)
    license_hash = hashlib.sha1(b'blob ' + str(len(license_data)).encode() + b'\0' + license_data).hexdigest()
    if len(license_data) > 100_000 or license_hash != LICENSE_BLOB:
        raise SystemExit('Upstream license blob does not match the pinned commit.')
    output = temp / 'lhm-font-origin-iosevka'
    output.mkdir(exist_ok=True)
    (output / 'LICENSE.md').write_bytes(license_data)
    report = {'candidate_payload': fixture['candidate_payload'], 'source_commit': fixture['source_commit'],
              'archive_sha256': digest.hexdigest(), 'license_git_blob': license_hash,
              'font_count': len(results), 'font_pass': sum(r['result'] == 'PASS' for r in results),
              'note': 'Byte matches and license text do not establish redistribution rights.', 'files': results}
    (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"Verified {report['font_pass']}/{report['font_count']} font files")
    if report['font_pass'] != report['font_count']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
