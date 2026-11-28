#!/usr/bin/env python3
"""Filter a built Camoufox Windows ZIP to the 508 verified fonts and bundle notices.

Validates every retained font against clean508's SHA-256 allowlist, drops all
unverified fonts, extracts embedded license notices from omni.ja / browser/omni.ja,
records EXE/DLL digests, renders the MPL-2.0 distribution notice, and creates
a deterministic ZIP ready for pinned-hash consumption.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import shutil
import sys
import zipfile
from pathlib import Path

FIXED_ZIP_TIME = (2026, 11, 28, 0, 0, 0)
EMBEDDED_NOTICE_PATTERNS = (
    'chrome/toolkit/content/global/license.html',
    'chrome/browser/content/browser/license.html',
    'chrome/toolkit/content/mozapps/extensions/OpenH264-license.txt',
    'chrome/toolkit/res/normandy/vendor/LICENSE_THIRDPARTY',
    'chrome/juggler/content/input/cursory/LICENSE',
    'chrome/juggler/content/input/cursory/NOTICE',
    'chrome/pdfjs/content/web/cmaps/LICENSE',
    'chrome/pdfjs/content/web/standard_fonts/LICENSE_FOXIT',
    'chrome/pdfjs/content/web/standard_fonts/LICENSE_LIBERATION',
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_rel_path(raw: str) -> str:
    if not raw or raw.startswith('/') or '\\' in raw or ':' in raw:
        raise ValueError(f'Unsafe ZIP entry path: {raw!r}')
    parts = raw.split('/')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError(f'Traversal or empty segment in ZIP entry: {raw!r}')
    return posixpath.normpath(raw)


def load_font_allowlist(index_path: Path) -> dict[str, str]:
    doc = json.loads(index_path.read_text(encoding='utf-8'))
    fonts = doc.get('fonts')
    if not isinstance(fonts, list) or not fonts:
        raise ValueError('Invalid font index: missing fonts list')
    allow: dict[str, str] = {}
    for entry in fonts:
        rel = safe_rel_path(entry['candidate_path'])
        digest = str(entry['sha256']).lower()
        if len(digest) != 64:
            raise ValueError(f'Invalid sha256 for {rel}')
        if rel in allow:
            raise ValueError(f'Duplicate font entry in allowlist: {rel}')
        allow[rel] = digest
    return allow


def filter_and_extract(input_zip: Path, allow: dict[str, str], out_tree: Path) -> tuple[int, int]:
    if out_tree.exists():
        shutil.rmtree(out_tree)
    out_tree.mkdir(parents=True, exist_ok=True)
    core_count = 0
    matched_fonts: set[str] = set()
    seen_entries: set[str] = set()

    with zipfile.ZipFile(input_zip, 'r') as zf:
        for info in zf.infolist():
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise ValueError(f'Symbolic link not allowed in ZIP: {info.filename}')
            if info.is_dir():
                continue
            rel = safe_rel_path(info.filename)
            if rel.lower() in seen_entries:
                raise ValueError(f'Duplicate case-insensitive ZIP entry: {rel}')
            seen_entries.add(rel.lower())

            data = zf.read(info)
            if rel.startswith('fonts/'):
                expected_sha = allow.get(rel)
                if expected_sha is None:
                    continue
                actual_sha = sha256_bytes(data)
                if actual_sha != expected_sha:
                    raise ValueError(
                        f'Font SHA-256 mismatch for {rel}: expected {expected_sha}, got {actual_sha}'
                    )
                matched_fonts.add(rel)
            else:
                core_count += 1

            dest = out_tree.joinpath(*rel.split('/'))
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)

    missing = sorted(set(allow.keys()) - matched_fonts)
    if missing:
        raise ValueError(f'Missing {len(missing)} verified font(s) from built ZIP: {missing[:5]}')
    return core_count, len(matched_fonts)


def write_deterministic_zip(out_tree: Path, out_zip: Path) -> tuple[int, str]:
    out_zip.parent.mkdir(parents=True, exist_ok=True)
    rel_files = sorted(
        p.relative_to(out_tree).as_posix()
        for p in out_tree.rglob('*')
        if p.is_file()
    )
    with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel in rel_files:
            src = out_tree.joinpath(*rel.split('/'))
            zi = zipfile.ZipInfo(rel, date_time=FIXED_ZIP_TIME)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (0o755 if rel.endswith(('.exe', '.dll')) else 0o644) << 16
            zf.writestr(zi, src.read_bytes())
    zip_bytes = out_zip.stat().st_size
    zip_sha = hashlib.sha256(out_zip.read_bytes()).hexdigest()
    return zip_bytes, zip_sha


def collect_embedded_notices(out_tree: Path, licenses_out: Path) -> list[dict]:
    embedded_root = licenses_out / 'embedded-notices'
    if embedded_root.exists():
        shutil.rmtree(embedded_root)
    embedded_root.mkdir(parents=True, exist_ok=True)

    records = []
    for archive_rel, label in (('omni.ja', 'omni.ja'), ('browser/omni.ja', 'browser_omni.ja')):
        ja_path = out_tree.joinpath(*archive_rel.split('/'))
        if not ja_path.is_file():
            raise FileNotFoundError(f'Missing expected archive in engine tree: {archive_rel}')
        with zipfile.ZipFile(ja_path, 'r') as zf:
            names = set(zf.namelist())
            for pattern in EMBEDDED_NOTICE_PATTERNS:
                if pattern not in names:
                    continue
                data = zf.read(pattern)
                target = embedded_root.joinpath(label, *pattern.split('/'))
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                records.append({
                    'archive': archive_rel,
                    'entry': pattern,
                    'size': len(data),
                    'sha256': sha256_bytes(data),
                    'local_path': f'embedded-notices/{label}/{pattern}',
                })
    (embedded_root / 'index.json').write_text(
        json.dumps({'entries': records}, indent=2) + '\n', encoding='utf-8'
    )
    return records


def collect_binary_inventory(out_tree: Path, licenses_out: Path) -> str:
    entries = []
    camoufox_exe_sha = ''
    for p in sorted(out_tree.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(out_tree).as_posix()
        if not rel.lower().endswith(('.exe', '.dll')):
            continue
        digest = sha256_bytes(p.read_bytes())
        if rel == 'camoufox.exe':
            camoufox_exe_sha = digest
        entries.append({'path': rel, 'bytes': p.stat().st_size, 'sha256': digest})
    if not camoufox_exe_sha:
        raise FileNotFoundError('camoufox.exe not found in filtered engine tree')
    (licenses_out / 'binaries-inventory.json').write_text(
        json.dumps({'count': len(entries), 'binaries': entries}, indent=2) + '\n',
        encoding='utf-8',
    )
    return camoufox_exe_sha


def copy_license_bundle(notices_dir: Path, licenses_out: Path, replacements: dict[str, str]) -> None:
    shutil.copy2(notices_dir / 'MPL-2.0.txt', licenses_out / 'MPL-2.0.txt')
    shutil.copy2(notices_dir / 'THIRD-PARTY-NOTICES.md', licenses_out / 'THIRD-PARTY-NOTICES.md')
    shutil.copy2(
        notices_dir / 'font-source-and-license-index.json',
        licenses_out / 'font-source-and-license-index.json',
    )
    vsd_dst = licenses_out / 'verified-source-documents'
    if vsd_dst.exists():
        shutil.rmtree(vsd_dst)
    shutil.copytree(notices_dir / 'verified-source-documents', vsd_dst)

    tpl = (notices_dir / 'CAMOUFOX-MPL2-NOTICE.template.md').read_text(encoding='utf-8')
    for k, v in replacements.items():
        tpl = tpl.replace('{{' + k + '}}', v)
    (licenses_out / 'CAMOUFOX-MPL2-NOTICE.md').write_text(tpl, encoding='utf-8')


def main() -> int:
    parser = argparse.ArgumentParser(description='Filter Camoufox ZIP to clean 508 fonts + bundle notices')
    parser.add_argument('--input-zip', required=True, type=Path)
    parser.add_argument('--notices-dir', required=True, type=Path)
    parser.add_argument('--out-zip', required=True, type=Path)
    parser.add_argument('--out-tree', required=True, type=Path)
    parser.add_argument('--licenses-out', required=True, type=Path)
    parser.add_argument('--meta-json', required=False, type=Path)
    args = parser.parse_args()

    allow = load_font_allowlist(args.notices_dir / 'font-source-and-license-index.json')
    core_count, font_count = filter_and_extract(args.input_zip, allow, args.out_tree)
    zip_bytes, zip_sha = write_deterministic_zip(args.out_tree, args.out_zip)

    args.licenses_out.mkdir(parents=True, exist_ok=True)
    embedded = collect_embedded_notices(args.out_tree, args.licenses_out)
    camoufox_exe_sha = collect_binary_inventory(args.out_tree, args.licenses_out)

    meta = {}
    if args.meta_json and args.meta_json.is_file():
        meta = json.loads(args.meta_json.read_text(encoding='utf-8'))

    replacements = {
        'FIREFOX_TARBALL_SHA256': meta.get('firefox_tarball_sha256', 'UNSPECIFIED'),
        'CAMOUFOX_COMMIT': meta.get('camoufox_commit', 'UNSPECIFIED'),
        'CAMOUFOX_TAG': meta.get('camoufox_tag', 'UNSPECIFIED'),
        'LHM_COMMIT': meta.get('lhm_commit', 'UNSPECIFIED'),
        'LHM_PATCH_SHA256': meta.get('lhm_patch_sha256', 'UNSPECIFIED'),
        'PREPARED_SOURCE_SHA256': meta.get('prepared_source_sha256', 'UNSPECIFIED'),
        'ACTORS_PARENT_SHA256': meta.get('actors_parent_sha256', 'UNSPECIFIED'),
        'STATIC_PREF_SHA256': meta.get('static_pref_sha256', 'UNSPECIFIED'),
        'BUILD_RUN_URL': meta.get('build_run_url', 'UNSPECIFIED'),
        'OUT_ZIP_NAME': args.out_zip.name,
        'ARCHIVE_BYTES': str(zip_bytes),
        'ARCHIVE_SHA256': zip_sha,
        'PAYLOAD_PIN': meta.get('payload_pin', 'PENDING_MANIFEST_GENERATION'),
        'CAMOUFOX_EXE_SHA256': camoufox_exe_sha,
        'TOTAL_FILES': str(core_count + font_count),
        'CORE_FILES': str(core_count),
        'FONT_FILES': str(font_count),
    }
    copy_license_bundle(args.notices_dir, args.licenses_out, replacements)

    summary = {
        'coreFiles': core_count,
        'fontFiles': font_count,
        'totalFiles': core_count + font_count,
        'archiveBytes': zip_bytes,
        'archiveSha256': zip_sha,
        'camoufoxExeSha256': camoufox_exe_sha,
        'embeddedNoticesCount': len(embedded),
    }
    print(json.dumps(summary))
    return 0


if __name__ == '__main__':
    sys.exit(main())
