#!/usr/bin/env python3
"""Regenerate every LHM Ads Browser icon asset from build/icon.svg, then verify.

Pipeline: cairosvg renders the SVG source once at 1024 px; Pillow downscales
(LANCZOS) to each target size; the Windows .ico is assembled from the
pre-rendered per-size PNGs so every frame is a controlled downscale, not an
after-the-fact resize by the ICO writer.

Usage (any Python 3 with cairosvg + Pillow — `pip install cairosvg pillow`):
    python3 docs/agents/agent-r5/generate-icons.py

Outputs (paths relative to the repo root):
    build/icon.ico            multi-size Windows icon (16..256)
    build/icon.png            512 px master (electron-builder default name)
    build/icons/icon-<N>.png  one PNG per size, incl. 512 and 1024 masters

Verification runs automatically at the end and the script exits non-zero on
any failure: every PNG is re-opened and checked for exact dimensions, RGBA
mode, non-blank content and expected alpha coverage; the .ico is re-opened and
every embedded frame's size is listed and checked against the required set.
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SVG = ROOT / "build" / "icon.svg"
ICONS_DIR = ROOT / "build" / "icons"
ICO_PATH = ROOT / "build" / "icon.ico"
MASTER_PNG = ROOT / "build" / "icon.png"

ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
PNG_SIZES = ICO_SIZES + [512, 1024]


def main() -> int:
    try:
        import cairosvg
        from PIL import Image
    except ImportError as exc:
        print(f"missing dependency: {exc}. Run: pip install cairosvg pillow")
        return 2

    svg_bytes = SVG.read_bytes()
    master_png = cairosvg.svg2png(bytestring=svg_bytes, output_width=1024, output_height=1024)
    master = Image.open(io.BytesIO(master_png)).convert("RGBA")
    assert master.size == (1024, 1024), master.size

    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    frames = {}
    for size in PNG_SIZES:
        img = master if size == 1024 else master.resize((size, size), Image.LANCZOS)
        out = ICONS_DIR / f"icon-{size}.png"
        img.save(out)
        frames[size] = img
        print(f"png  {out.relative_to(ROOT)}  {size}x{size}")
    frames[512].save(MASTER_PNG)
    print(f"png  {MASTER_PNG.relative_to(ROOT)}  512x512 (electron-builder master)")

    # Assemble the .ico by hand from the per-size PNG byte streams
    # (PNG-compressed entries, valid for every size since Windows Vista).
    # Pillow's own ICO writer silently drops some appended sizes (observed:
    # 20 and 40), so the container is written explicitly here and verified
    # by reading it back below.
    import struct

    blobs = []
    for s in ICO_SIZES:
        buf = io.BytesIO()
        frames[s].save(buf, format="PNG")
        blobs.append(buf.getvalue())
    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    entries = b""
    for s, blob in zip(ICO_SIZES, blobs):
        entries += struct.pack(
            "<BBBBHHII",
            s % 256, s % 256,  # width, height (0 encodes 256)
            0, 0,              # palette colours, reserved
            1, 32,             # colour planes, bits per pixel
            len(blob), offset,
        )
        offset += len(blob)
    ICO_PATH.write_bytes(header + entries + b"".join(blobs))
    print(f"ico  {ICO_PATH.relative_to(ROOT)}  sizes {ICO_SIZES}")

    # ---- verification: read everything back --------------------------------
    failures = []

    def check(cond, msg):
        print(("  ok  " if cond else "FAIL  ") + msg)
        if not cond:
            failures.append(msg)

    for size in PNG_SIZES:
        p = ICONS_DIR / f"icon-{size}.png"
        with Image.open(p) as im:
            im.load()
            check(im.size == (size, size) and im.mode == "RGBA",
                  f"{p.name}: {im.size} {im.mode}")
            alpha = im.getchannel("A")
            lo, hi = alpha.getextrema()
            colors = len(im.getcolors(maxcolors=1 << 24) or [])
            # corners are transparent (rounded tile); centre is opaque artwork
            check(lo == 0 and hi == 255 and colors > 20,
                  f"{p.name}: alpha {lo}..{hi}, {colors} colours (non-blank)")

    with Image.open(ICO_PATH) as ico:
        found = sorted(s[0] for s in ico.ico.sizes())
        check(found == ICO_SIZES, f"icon.ico embedded sizes (Pillow): {found}")
    # Independent read-back: parse the ICO directory by hand and open each
    # embedded PNG blob, so frame sizes are proven from the file bytes, not
    # from any single library's frame-selection behaviour.
    import struct as _struct

    raw = ICO_PATH.read_bytes()
    reserved, kind, count = _struct.unpack_from("<HHH", raw, 0)
    check(reserved == 0 and kind == 1 and count == len(ICO_SIZES),
          f"icon.ico header: type {kind}, {count} entries")
    for i, size in enumerate(ICO_SIZES):
        w, h, _cc, _res, _planes, _bpp, nbytes, off = _struct.unpack_from(
            "<BBBBHHII", raw, 6 + 16 * i)
        declared = (w or 256, h or 256)
        with Image.open(io.BytesIO(raw[off:off + nbytes])) as frame:
            frame.load()
            check(declared == (size, size) and frame.size == (size, size),
                  f"icon.ico frame {size}: declared {declared}, PNG {frame.size}")

    if failures:
        print(f"\n{len(failures)} verification failure(s)")
        return 1
    print("\nall icon assets generated and verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
