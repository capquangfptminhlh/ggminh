# Camoufox 156.0.1 (LHM Build) — Third-Party & Open-Source Notices

This package distributes a custom build of **Camoufox** (based on Mozilla Firefox `FIREFOX_156_0_1_RELEASE` and `daijro/camoufox` commit `7a4ac0d4dca2dfdeb277f521824a26efb0b6a7b6`), patched with LHM's localStorage flush patch (`zz-lhm-localstorage-flush.patch`) and bundled with 508 verified open-source fonts.

## 1. Mozilla Firefox & Camoufox (MPL-2.0)

- Executable and core Gecko/XUL binaries (`camoufox.exe`, `xul.dll`, `nss3.dll`, `freebl3.dll`, `softokn3.dll`, `lgpllibs.dll`, `gkcodecs.dll`, `mozglue.dll`, `mozavcodec.dll`, `mozavutil.dll`, `mozinference.dll`, `AccessibleMarshal.dll`, `InstallationDirLayout.dll`, `notificationserver.dll`, `nmhproxy.exe`, `plugin-container.exe`, `private_browsing.exe`, `desktop-launcher/desktop-launcher.exe`, `gmp-clearkey/0.1/clearkey.dll`) and `omni.ja` / `browser/omni.ja` are governed by the **Mozilla Public License Version 2.0** (`MPL-2.0.txt`).
- See `CAMOUFOX-MPL2-NOTICE.md` for exact source code locations, patches, build provenance, and corresponding source archive details.

## 2. Embedded Firefox Third-Party Notices

Full upstream third-party licenses shipped inside Firefox/Camoufox archives are extracted verbatim under `embedded-notices/`:
- `embedded-notices/omni.ja/chrome/toolkit/content/global/license.html` (Firefox `about:license`)
- `embedded-notices/browser_omni.ja/chrome/browser/content/browser/license.html`
- `embedded-notices/omni.ja/chrome/toolkit/content/mozapps/extensions/OpenH264-license.txt` (Cisco OpenH264 BSD-style notice)
- `embedded-notices/omni.ja/chrome/toolkit/res/normandy/vendor/LICENSE_THIRDPARTY`
- `embedded-notices/omni.ja/chrome/juggler/content/input/cursory/LICENSE` and `NOTICE`
- `embedded-notices/omni.ja/chrome/pdfjs/content/web/cmaps/LICENSE`
- `embedded-notices/omni.ja/chrome/pdfjs/content/web/standard_fonts/LICENSE_FOXIT` and `LICENSE_LIBERATION`
- **ANGLE** (`libEGL.dll`, `libGLESv2.dll`): Copyright (C) 2015 Google Inc. / The ANGLE Project Authors (see `license.html`).

## 3. Bundled Fonts (508 Verified Font Files)

All 192 unverified/unmatched fonts from upstream bundles were excluded. Each of the 508 retained font files under `fonts/` matches byte-for-byte with its upstream repository commit and license document recorded in `font-source-and-license-index.json` and stored in `verified-source-documents/`:
- `google/fonts` (332 files): SIL Open Font License 1.1 (`OFL.txt`) and Apache License 2.0 (`apache/robotoslab/LICENSE.txt`)
- `notofonts/noto-fonts` (87 files) & `notofonts/noto-cjk` (2 files): SIL Open Font License 1.1
- `be5invis/Iosevka` (54 files): SIL Open Font License 1.1 (`LICENSE.md`, blob `3efe1ab581a2756d4802386cabd38ee75f3ae26f`)
- `stipub/stixfonts` (29 files): SIL Open Font License 1.1 / STIX Font License 2010 (`STIX Font License 2010.pdf`)
- `googlefonts/tinos` (4 files): SIL Open Font License 1.1 (`OFL.txt`, blob `e91137c77e543b84502bc37822aadff61b2de4e8`)

Under SIL OFL 1.1, bundled fonts may not be sold by themselves and derivatives may not use Reserved Font Names. Copies of all 90 exact license blobs are shipped in `verified-source-documents/`.

## 4. Microsoft Runtime Components

The Windows build environment (`scripts/package.py`) includes Microsoft Visual C++ Runtime and Windows App SDK / DirectX runtime DLLs (`concrt140.dll`, `msvcp140*.dll`, `vccorlib140.dll`, `vcruntime140*.dll`, `Microsoft.WindowsAppRuntime*.dll`, `CoreMessagingXP.dll`, `Microsoft.InputStateManager.dll`, `Microsoft.Internal.FrameworkUdk.dll`, `Microsoft.UI.*.dll`, `dxcompiler.dll`, `marshal.dll`, `onnxruntime.dll`), listed with their exact SHA-256 digests in `binaries-inventory.json`.
