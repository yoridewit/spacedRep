#!/usr/bin/env python3
"""Genereert de PNG-iconen voor de PWA (geen externe dependencies).

Gebruik: python3 tools/make-icons.py
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
SS = 3  # supersampling voor gladde randen

BG_TOP = (214, 127, 72)     # accent-500
BG_BOTTOM = (178, 98, 45)   # accent-600
CARD_BACK = (235, 221, 197) # surface
CARD_FRONT = (249, 244, 237) # neutral-100
INK = (140, 73, 26)         # accent-700


def rounded_rect_coverage(x, y, rect, radius):
    left, top, right, bottom = rect
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    if left <= x <= right and top <= y <= bottom:
        dx, dy = x - cx, y - cy
        return 1.0 if dx * dx + dy * dy <= radius * radius else 0.0
    return 0.0


def blend(base, layer, alpha):
    return tuple(round(b + (l - b) * alpha) for b, l in zip(base, layer))


def render(size: int) -> bytes:
    s = size * SS
    rows = []
    unit = s / 100.0

    # Kaarten: achterste iets naar links/boven, voorste groter.
    back = (18 * unit, 22 * unit, 74 * unit, 66 * unit)
    front = (26 * unit, 34 * unit, 82 * unit, 78 * unit)
    bar1 = (36 * unit, 46 * unit, 72 * unit, 51 * unit)
    bar2 = (36 * unit, 57 * unit, 62 * unit, 62 * unit)
    r_card = 7 * unit
    r_bar = 2.5 * unit

    for py in range(s):
        row = bytearray()
        y = py + 0.5
        t = py / max(1, s - 1)
        bg = tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM))
        for px in range(s):
            x = px + 0.5
            color = bg
            if rounded_rect_coverage(x, y, back, r_card):
                color = CARD_BACK
            if rounded_rect_coverage(x, y, front, r_card):
                color = CARD_FRONT
                if rounded_rect_coverage(x, y, bar1, r_bar) or rounded_rect_coverage(x, y, bar2, r_bar):
                    color = INK
            row += bytes(color)
        rows.append(bytes(row))

    # Downsamplen naar de doelgrootte (box filter).
    out = bytearray()
    for y in range(size):
        out.append(0)  # filter type 0
        for x in range(size):
            r = g = b = 0
            for dy in range(SS):
                src = rows[y * SS + dy]
                for dx in range(SS):
                    i = ((x * SS) + dx) * 3
                    r += src[i]
                    g += src[i + 1]
                    b += src[i + 2]
            n = SS * SS
            out += bytes((r // n, g // n, b // n))
    return bytes(out)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> None:
    raw = render(size)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"{path.relative_to(path.parent.parent)}  {len(png) // 1024} kB")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        write_png(OUT / name, size)


if __name__ == "__main__":
    main()
