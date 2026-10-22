# Bundled Chromium engine staging directory

This directory intentionally contains NO browser executable and NO hidden
fingerprint modification binaries. Release maintainers must obtain an
appropriately licensed, supported Chromium distribution, inspect the
upstream source and binary provenance, and sign its complete file manifest
outside this repository before packaging. Never download third-party
executables or put private signing keys in source control.

Only release-signed engine resources are trusted by the application's
bundled mode. Until a valid signed manifest and browser files are present,
the selector reports "not available" and bundled launch fails closed.
The regular Chrome/Edge system mode remains the default.

See docs/BUNDLED_ENGINE_RELEASE.md.
