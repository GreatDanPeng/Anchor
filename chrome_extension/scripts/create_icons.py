"""Generate placeholder Anchor icons using only stdlib (no Pillow required).

Run from chrome_extension/: python scripts/create_icons.py
Produces public/icons/icon{16,32,48,128}.png — simple blue squares with ⚓.
Replace with proper artwork before publishing to the Chrome Web Store.
"""
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)


def _png(size: int) -> bytes:
    """Create a minimal solid-color PNG (no text — stdlib only)."""
    # RGBA: blue square
    r, g, b, a = 37, 99, 235, 255  # Tailwind blue-600
    row = bytes([0] + [r, g, b, a] * size)  # filter byte + pixels
    raw = row * size
    compressed = zlib.compress(raw)

    def chunk(name: bytes, data: bytes) -> bytes:
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)  # RGB, not RGBA
    # Redo as RGBA (color type 6)
    ihdr = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])

    sig = b'\x89PNG\r\n\x1a\n'
    return (
        sig
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )


for sz in SIZES:
    path = os.path.join(OUT_DIR, f'icon{sz}.png')
    with open(path, 'wb') as f:
        f.write(_png(sz))
    print(f'Created {path}')

print('Done. Replace with proper artwork before publishing.')
