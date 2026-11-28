#!/usr/bin/env python3
"""Unit tests for filter-clean508.py: filtering, hash pinning, notice extraction, tamper refusal."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILTER_SCRIPT = HERE / 'filter-clean508.py'


def build_fixture_notices(root: Path) -> dict[str, str]:
    notices_dir = root / 'notices'
    vsd = notices_dir / 'verified-source-documents'
    vsd.mkdir(parents=True, exist_ok=True)
    (notices_dir / 'MPL-2.0.txt').write_text('MPL 2.0 TEST', encoding='utf-8')
    (notices_dir / 'THIRD-PARTY-NOTICES.md').write_text('# Notices', encoding='utf-8')
    (notices_dir / 'CAMOUFOX-MPL2-NOTICE.template.md').write_text(
        'commit={{CAMOUFOX_COMMIT}} pin={{PAYLOAD_PIN}} files={{TOTAL_FILES}}',
        encoding='utf-8',
    )
    (vsd / 'sample.txt').write_text('SIL OFL 1.1', encoding='utf-8')

    font_good = b'GOOD-FONT-BYTES'
    font_sha = hashlib.sha256(font_good).hexdigest()
    (notices_dir / 'font-source-and-license-index.json').write_text(
        json.dumps({
            'schema': 'lhm.font-source-license-index.v1',
            'font_count': 1,
            'fonts': [{
                'candidate_path': 'fonts/GoodFont.ttf',
                'sha256': font_sha,
                'source_repo': 'google/fonts',
                'source_commit': 'abc',
                'source_path': 'ofl/good/GoodFont.ttf',
                'licenses': [{'source_path': 'ofl/good/OFL.txt', 'git_blob_sha1': '1'*40, 'local_path': 'verified-source-documents/sample.txt'}],
            }],
        }),
        encoding='utf-8',
    )
    return {'font_sha': font_sha}


def build_omni_ja(path: Path, entries: dict[str, bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as zf:
        for name, data in entries.items():
            zf.writestr(name, data)


def build_input_zip(root: Path, *, font_bytes: bytes = b'GOOD-FONT-BYTES', include_unverified: bool = True) -> Path:
    omni = root / 'omni.ja'
    bomni = root / 'browser_omni.ja'
    build_omni_ja(omni, {
        'chrome/toolkit/content/global/license.html': b'<html>Mozilla License</html>',
        'chrome/toolkit/content/mozapps/extensions/OpenH264-license.txt': b'OpenH264 BSD',
    })
    build_omni_ja(bomni, {
        'chrome/browser/content/browser/license.html': b'<html>Browser License</html>',
    })
    in_zip = root / 'input.zip'
    with zipfile.ZipFile(in_zip, 'w') as zf:
        zf.writestr('camoufox.exe', b'MZ' + b'\x00' * 32)
        zf.writestr('xul.dll', b'XUL')
        zf.write(omni, 'omni.ja')
        zf.write(bomni, 'browser/omni.ja')
        zf.writestr('fonts/GoodFont.ttf', font_bytes)
        if include_unverified:
            zf.writestr('fonts/Unverified192.ttf', b'DROP-ME')
    return in_zip


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        build_fixture_notices(root)
        in_zip = build_input_zip(root)
        meta = root / 'meta.json'
        meta.write_text(json.dumps({'camoufox_commit': '7a4ac0d', 'payload_pin': 'deadbeef'*8}), encoding='utf-8')

        out_zip = root / 'out.zip'
        out_tree = root / 'tree'
        lic_out = root / 'lic'
        res = subprocess.run([
            sys.executable, str(FILTER_SCRIPT),
            '--input-zip', str(in_zip),
            '--notices-dir', str(root / 'notices'),
            '--out-zip', str(out_zip),
            '--out-tree', str(out_tree),
            '--licenses-out', str(lic_out),
            '--meta-json', str(meta),
        ], capture_output=True, text=True)
        assert res.returncode == 0, res.stderr
        summary = json.loads(res.stdout)
        assert summary['coreFiles'] == 4, summary
        assert summary['fontFiles'] == 1, summary
        assert summary['totalFiles'] == 5, summary
        assert summary['embeddedNoticesCount'] == 3, summary
        assert (out_tree / 'fonts' / 'GoodFont.ttf').is_file()
        assert not (out_tree / 'fonts' / 'Unverified192.ttf').exists()
        assert (lic_out / 'MPL-2.0.txt').is_file()
        assert (lic_out / 'THIRD-PARTY-NOTICES.md').is_file()
        notice_txt = (lic_out / 'CAMOUFOX-MPL2-NOTICE.md').read_text(encoding='utf-8')
        assert 'commit=7a4ac0d' in notice_txt and 'files=5' in notice_txt
        assert (lic_out / 'binaries-inventory.json').is_file()
        assert (lic_out / 'embedded-notices' / 'index.json').is_file()

        # Tampered font hash must fail closed
        bad_zip = build_input_zip(root / 'bad', font_bytes=b'TAMPERED')
        (root / 'bad').mkdir(exist_ok=True)
        res_bad = subprocess.run([
            sys.executable, str(FILTER_SCRIPT),
            '--input-zip', str(bad_zip),
            '--notices-dir', str(root / 'notices'),
            '--out-zip', str(root / 'bad_out.zip'),
            '--out-tree', str(root / 'bad_tree'),
            '--licenses-out', str(root / 'bad_lic'),
        ], capture_output=True, text=True)
        assert res_bad.returncode != 0 and 'Font SHA-256 mismatch' in res_bad.stderr, res_bad.stderr

        # Missing verified font must fail closed
        miss_dir = root / 'miss'
        miss_dir.mkdir()
        miss_zip = miss_dir / 'missing.zip'
        with zipfile.ZipFile(miss_zip, 'w') as zf:
            zf.writestr('camoufox.exe', b'MZ')
        res_miss = subprocess.run([
            sys.executable, str(FILTER_SCRIPT),
            '--input-zip', str(miss_zip),
            '--notices-dir', str(root / 'notices'),
            '--out-zip', str(root / 'miss_out.zip'),
            '--out-tree', str(root / 'miss_tree'),
            '--licenses-out', str(root / 'miss_lic'),
        ], capture_output=True, text=True)
        assert res_miss.returncode != 0 and 'Missing 1 verified font' in res_miss.stderr, res_miss.stderr

        print('filter-clean508 tests passed (filtering, notices, binaries inventory, tamper + missing refusals)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
