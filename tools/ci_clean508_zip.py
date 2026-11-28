"""Reconstruct the pinned test archive from the verified tree on the CI runner."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import zipfile


def reconstruct(root, output, rows):
    root = Path(root).resolve(strict=True)
    output = Path(output)
    if output.exists() or not root.is_dir():
        raise ValueError('Invalid input tree or output already exists')
    seen = set()
    for row in rows:
        name = row['path']
        p = PurePosixPath(name)
        if not name or p.is_absolute() or '..' in p.parts or '\\' in name or name in seen:
            raise ValueError('Unsafe or duplicate archive path')
        seen.add(name)
        source = root.joinpath(*p.parts)
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root):
            raise ValueError('Missing or unsafe source file')
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for row in rows:
            info = zipfile.ZipInfo(row['path'], tuple(row['date_time']))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            info.external_attr = row['external_attr']
            with root.joinpath(*PurePosixPath(row['path']).parts).open('rb') as source, archive.open(info, 'w') as target:
                shutil.copyfileobj(source, target, 1024 * 1024)


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Disposable CI runner required')
    temp = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    root, output = (Path(arg).resolve() for arg in sys.argv[1:])
    if not root.is_relative_to(temp) or not output.is_relative_to(temp):
        raise SystemExit('Paths must be within RUNNER_TEMP')
    fixture = Path(__file__).resolve().parents[1] / 'test/fixtures/clean508-zip-layout.json'
    rows = json.loads(fixture.read_text(encoding='utf8'))
    if len(rows) != 574:
        raise SystemExit('Unexpected entry count')
    reconstruct(root, output, rows)
    digest = hashlib.file_digest(output.open('rb'), 'sha256').hexdigest()
    if output.stat().st_size != 435717570 or digest != '53bbbadd0d166f0835d2be5fbcb88a22bef854f9f57cd4fe5389bf17039526d6':
        raise SystemExit('Reconstructed archive does not match pinned bytes')
    print('Pinned ZIP reconstructed and verified:', digest)


if __name__ == '__main__':
    main()
