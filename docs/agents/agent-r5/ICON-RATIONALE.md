# LHM Ads Browser — app icon rationale (Agent R5)

## The mark

A browser window holding a single profile silhouette, on a dark rounded tile:

- **Tile** — deep charcoal gradient (`#26282E → #141519`), the product's dark UI
  surface, in the standard rounded-square app-tile shape.
- **Window** — off-white body (`#F5F6F8`) with an orange title bar
  (`#FF8A1E → #F96A00`, the product's orange accent) and a small white URL pill:
  unmistakably "a browser", in the product's two identity colours.
- **Figure** — one bold orange head-and-shoulders silhouette centred in the
  window: a *profile*. The product's unit of work is the profile — one profile,
  one browser, isolated from the others — so the icon shows exactly one person
  in exactly one window rather than a grid of windows or a generic globe.

## Why it is drawn this way

- **One idea only.** At taskbar/DPI sizes an icon has room for a single concept.
  "Browser + profile" is the whole product in one glyph; every element that
  does not serve it (window-control dots, tabs, text) was left out.
- **No text.** "LHM" lettering would be mush below 48 px and dates the mark;
  the shape and the orange carry the identity instead.
- **Vector-clean and reproducible.** Five primitive shapes and two linear
  gradients, authored by hand in `build/icon.svg`. No competitor marks, no
  stock art, no traced imagery — the geometry and palette are original to
  this project. The owner can edit the SVG and regenerate everything with
  `generate-icons.py` (cairosvg + Pillow).

## How it reads at 16 px (verified on the shipped file)

The design was iterated against real 16 px renders: the first draft's window
occupied 59% of the tile and the figure nearly vanished, so the window was
enlarged to 69% and the silhouette scaled up before shipping. In the final
16 px frame what survives is, in order of salience:

1. the dark tile silhouette against the desktop/taskbar;
2. the orange title band (≈3 px) — the brand colour is the first thing seen;
3. the light window block beneath it;
4. the orange figure reduced to a head-dot over a shoulders-block — still
   recognisably a person in a window, not an abstract blob.

What intentionally drops out at 16 px: the URL pill, the corner radii, and
both gradients (they read as flat orange / flat charcoal). Nothing essential
depends on them — they only enrich the 48 px-and-up renderings, where the
pill restores the "address bar" reading and the full silhouette is crisp.

## Assets

| File | Purpose |
|---|---|
| `build/icon.svg` | editable source of truth |
| `build/icon.ico` | Windows icon, frames 16/20/24/32/40/48/64/128/256 (PNG-compressed) |
| `build/icon.png` | 512 px master (electron-builder's conventional name) |
| `build/icons/icon-<N>.png` | per-size PNGs 16…1024 for docs, store pages, future targets |

A macOS `.icns` was deliberately not produced: the build configuration
targets Windows NSIS only. If a macOS target is ever added, `icon-1024.png`
is the master to convert from.
