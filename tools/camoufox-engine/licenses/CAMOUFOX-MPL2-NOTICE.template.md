# Camoufox 156.0.1 (LHM Clean-508 Build) — MPL-2.0 Source & Distribution Notice

This distribution contains **Camoufox 156.0.1** compiled for Windows x86_64 in Executable Form from Covered Software governed by the **Mozilla Public License Version 2.0** (`MPL-2.0.txt`).

## Corresponding Source Code Form (MPL-2.0 §3.1, §3.2, §3.6)

The exact Source Code Form compiled to produce these binaries is preserved and verifiable via cryptographic digests from the exact build run:

- **Upstream Mozilla Firefox Source:** `FIREFOX_156_0_1_RELEASE` (`firefox-156.0.1.source.tar.xz`)
  - Archive SHA-256: `{{FIREFOX_TARBALL_SHA256}}`
  - Upstream URL: `https://archive.mozilla.org/pub/firefox/releases/156.0.1/source/firefox-156.0.1.source.tar.xz`
- **Upstream Camoufox Patches & Additions:** `https://github.com/daijro/camoufox`
  - Exact Commit: `{{CAMOUFOX_COMMIT}}` (`{{CAMOUFOX_TAG}}`)
- **LHM Repository & Patch:** `https://github.com/capquangfptminhlh/ggminh`
  - Repository Commit: `{{LHM_COMMIT}}`
  - Patch (`zz-lhm-localstorage-flush.patch`) SHA-256: `{{LHM_PATCH_SHA256}}`
- **Exact Prepared Build Source Tree Archive (compiled by CI):**
  - Artifact: `camoufox-156.0.1-prepared-source.tar.zst`
  - Archive SHA-256: `{{PREPARED_SOURCE_SHA256}}`
  - Modified files included in `source/`:
    - `dom/localstorage/ActorsParent.cpp` SHA-256: `{{ACTORS_PARENT_SHA256}}`
    - `modules/libpref/init/StaticPrefList.yaml` SHA-256: `{{STATIC_PREF_SHA256}}`
- **CI Build Provenance:**
  - Workflow Run: `{{BUILD_RUN_URL}}`

## Built Engine Package Digests

- **Filtered Package:** `{{OUT_ZIP_NAME}}`
- **Archive Bytes:** `{{ARCHIVE_BYTES}}`
- **Archive SHA-256:** `{{ARCHIVE_SHA256}}`
- **Pinned Manifest Payload SHA-256:** `{{PAYLOAD_PIN}}`
- **camoufox.exe SHA-256:** `{{CAMOUFOX_EXE_SHA256}}`
- **File Count:** `{{TOTAL_FILES}}` (`{{CORE_FILES}}` core files + `{{FONT_FILES}}` verified fonts)

## Exhibit A — Source Code Form License Notice

> This Source Code Form is subject to the terms of the Mozilla Public
> License, v. 2.0. If a copy of the MPL was not distributed with this
> file, You can obtain one at http://mozilla.org/MPL/2.0/.

Recipients of this Executable Form may obtain the complete Corresponding Source Code Form (including the prepared build source archive `camoufox-156.0.1-prepared-source.tar.zst`, Camoufox commit `{{CAMOUFOX_COMMIT}}`, and LHM patch `zz-lhm-localstorage-flush.patch`) from the public repository `https://github.com/capquangfptminhlh/ggminh` and the CI build artifacts listed above at no charge beyond distribution cost.
