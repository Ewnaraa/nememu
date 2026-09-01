"""
Nememu icon set.

Two drawings, not one scaled drawing. Above 32 px the mark is the egg sitting on
a dark tile, which is what gives it presence next to other app icons. At and
below 32 px that tile eats the artwork: the egg drops to ~11 px and the N to a
smudge. The small sizes therefore drop the tile, let the egg run to the edges
and use a heavier N — the standard trick, and the only reason the 16 px entry is
readable at all.
"""
import cairosvg, os, struct, io
from PIL import Image

OUT = "/tmp/brand/out"
os.makedirs(OUT, exist_ok=True)

DEFS = '''
<defs>
  <linearGradient id="gold" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#f9e7b2"/><stop offset="0.33" stop-color="#dcb864"/>
    <stop offset="0.65" stop-color="#c49a45"/><stop offset="1" stop-color="#8c6b2a"/>
  </linearGradient>
  <linearGradient id="tile" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="#232432"/><stop offset="0.6" stop-color="#14151e"/><stop offset="1" stop-color="#0b0c12"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/>
    <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="eggLight" cx="0.34" cy="0.24" r="0.75">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
</defs>'''

INK = "#14151e"

def egg_path(cx, cy, w, h):
    """Dofus egg: pointed at the top, heavy at the bottom."""
    hw, top, bot = w / 2, cy - h / 2, cy + h / 2
    shoulder = top + h * 0.65
    return (f"M{cx},{top} "
            f"C{cx+hw*0.47},{top} {cx+hw},{top+h*0.36} {cx+hw},{shoulder} "
            f"C{cx+hw},{bot-h*0.155} {cx+hw*0.55},{bot} {cx},{bot} "
            f"C{cx-hw*0.55},{bot} {cx-hw},{bot-h*0.155} {cx-hw},{shoulder} "
            f"C{cx-hw},{top+h*0.36} {cx-hw*0.47},{top} {cx},{top} Z")

def N_path(lx, rx, top, bot, w, lean=12, blade=0):
    l = f"M{lx},{bot} L{lx+lean},{top} L{lx+w+lean},{top} L{lx+w},{bot} Z"
    r = f"M{rx-w},{bot} L{rx-w+lean},{top} L{rx+lean},{top} L{rx},{bot} Z"
    d = f"M{lx+lean},{top} L{lx+w+lean},{top} L{rx},{bot+blade} L{rx-w},{bot} Z"
    return f"{d} {l} {r}"

def svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
            f'width="1024" height="1024">{DEFS}{body}</svg>')

def large(with_tile=True):
    e = egg_path(512, 524, 664, 846)
    n = N_path(lx=336, rx=690, top=350, bot=782, w=90, lean=12)
    b = ""
    if with_tile:
        r = '<rect x="30" y="30" width="964" height="964" rx="226"'
        b += f'{r} fill="url(#tile)"/>{r} fill="url(#sheen)"/>'
    b += (f'<path d="{e}" fill="url(#gold)"/>'
          f'<path d="{e}" fill="url(#eggLight)"/>'
          f'<path d="{e}" fill="none" stroke="rgba(88,64,18,0.42)" stroke-width="10"/>'
          f'<path d="{n}" fill="{INK}"/>')
    if with_tile:
        b += ('<rect x="30" y="30" width="964" height="964" rx="226" fill="none" '
              'stroke="rgba(212,175,90,0.30)" stroke-width="12"/>')
    return svg(b)

def small():
    """No tile, egg to the edges, heavier N: the 16-24 px drawing."""
    e = egg_path(512, 520, 872, 980)
    n = N_path(lx=290, rx=740, top=280, bot=790, w=126, lean=0)
    return svg(f'<path d="{e}" fill="url(#gold)"/>'
               f'<path d="{e}" fill="none" stroke="rgba(88,64,18,0.5)" stroke-width="16"/>'
               f'<path d="{n}" fill="{INK}"/>')

SVG_LARGE, SVG_SMALL, SVG_MARK = large(True), small(), large(False)
for name, s in (("icon-large", SVG_LARGE), ("icon-small", SVG_SMALL), ("mark", SVG_MARK)):
    open(f"{OUT}/{name}.svg", "w").write(s)

def render(s, px):
    return Image.open(io.BytesIO(
        cairosvg.svg2png(bytestring=s.encode(), output_width=px, output_height=px))).convert("RGBA")

# The cut-over: 48 px still carries the tile, 32 px no longer can.
SIZES = [16, 20, 24, 32, 48, 64, 128, 256]
frames = {s: render(SVG_SMALL if s <= 32 else SVG_LARGE, s) for s in SIZES}
for s in (512, 1024):
    frames[s] = render(SVG_LARGE, s)

frames[1024].save(f"{OUT}/icon.png")
render(SVG_MARK, 512).save(f"{OUT}/logo.png")
for s in SIZES:
    frames[s].save(f"{OUT}/preview-{s}.png")

# ------------------------------------------------------------------- .ico
def bmp_entry(im):
    """32-bit BGRA, bottom-up, with the 1bpp AND mask Windows still expects."""
    w, h = im.size
    px = im.load()
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))
    row = ((w + 31) // 32) * 4
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        bits = bytearray(row)
        for x in range(w):
            if px[x, y][3] == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mask += bits
    hdr = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0)
    return hdr + bytes(xor) + bytes(mask)

def png_entry(im):
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()

blobs = [(s, bmp_entry(frames[s]) if s <= 64 else png_entry(frames[s])) for s in SIZES]
off = 6 + 16 * len(blobs)
ico = struct.pack("<HHH", 0, 1, len(blobs))
for s, data in blobs:
    ico += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), off)
    off += len(data)
ico += b"".join(d for _, d in blobs)
open(f"{OUT}/icon.ico", "wb").write(ico)

# ------------------------------------------------------------------ .icns
ICNS = {"ic07": 128, "ic08": 256, "ic09": 512, "ic10": 1024,
        "ic11": 32, "ic12": 64, "ic13": 256, "ic14": 512}
chunks = b""
for code, px in ICNS.items():
    data = png_entry(frames[px] if px in frames else render(SVG_LARGE, px))
    chunks += code.encode() + struct.pack(">I", len(data) + 8) + data
open(f"{OUT}/icon.icns", "wb").write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)

for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(f"{OUT}/{f}"))
