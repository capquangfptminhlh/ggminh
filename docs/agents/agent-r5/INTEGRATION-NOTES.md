# Agent R5 (icon & branding) — INTEGRATION NOTES

Branch `agent-r5/icon-branding` from f280296. Scope: app icon only. No code,
no tests, and **no change to package.json in this branch** (proposal below).

## What was delivered

- `build/icon.svg` — original icon artwork, hand-authored vector source
  (browser window + profile silhouette on the product's dark + orange
  identity). This is the editable source of truth.
- `build/icon.ico` — Windows multi-size icon with exactly the required
  frames: 16, 20, 24, 32, 40, 48, 64, 128, 256 (PNG-compressed entries).
- `build/icon.png` — 512 px master (electron-builder's conventional name).
- `build/icons/icon-<N>.png` — per-size PNG masters: 16, 20, 24, 32, 40, 48,
  64, 128, 256, 512, 1024.
- `docs/agents/agent-r5/ICON-RATIONALE.md` — design rationale, incl. how the
  mark reads at 16 px.
- `docs/agents/agent-r5/generate-icons.py` — regeneration + verification
  script (`pip install cairosvg pillow`, then run it; exits non-zero on any
  failed check).

## Verification (all performed on the shipped files)

- Every PNG re-opened and checked: exact dimensions, RGBA, alpha range
  0–255 (transparent rounded corners, opaque artwork), non-blank colour
  counts at every size.
- The `.ico` was read back two independent ways: Pillow lists the embedded
  sizes as exactly [16, 20, 24, 32, 40, 48, 64, 128, 256]; and a manual
  parse of the ICO directory confirms each entry's declared size matches
  the dimensions of the PNG blob stored at its offset.
- Visual check of actual renders at 256, 48 and 16 px: motif and brand
  orange read correctly at all three; the 16 px frame keeps tile / orange
  band / light window / orange figure (see ICON-RATIONALE.md).
- Pipeline note: Pillow's own ICO writer silently dropped the 20 px and
  40 px frames when assembling via `append_images` (observed, reproduced),
  so the script writes the ICO container explicitly from the per-size PNG
  streams and proves the result by parsing it back.

## Proposal for the coordinator — package.json (NOT applied here)

package.json is a shared, coordinator-owned file and other Wave R agents
are active, so the one-line build-config change is proposed, not applied:

```diff
     "win": {
+      "icon": "build/icon.ico",
       "target": [
         {
           "target": "nsis",
```

- This is the only build change proposed. Nothing else in `build`, `nsis`
  or `files` needs to move: `build/` is electron-builder's conventional
  build-resources location and `build/icon.ico` is its default Windows
  icon path, so the explicit line documents intent and protects against a
  future default change rather than enabling something new.
- `build/icon.png` (512 px) is already in place under the conventional
  master name should a non-Windows target ever be added; no `.icns` was
  produced (Windows-only product).

## One check for integration time

Run one diagnostic build and confirm the packaged file listing does not
sweep `build/**` (source SVG, per-size PNGs) into the app payload via the
custom `files` glob — electron-builder treats `build/` as build resources,
not app content, but Wave 1 showed this `files` list has surprised us
before, so verify rather than assume. If it does get swept in, the fix is
a `!build/**` exclusion in the same coordinator commit that applies the
icon line above (the icon itself is consumed from build resources at
build time, before packaging).
