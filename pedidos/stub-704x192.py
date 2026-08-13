# PNG 704x192 RGBA con alfa, sin dependencias: zlib + struct
import zlib, struct

W, H = 704, 192
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

raw = bytearray()
for y in range(H):
    raw.append(0)                      # filtro None
    for x in range(W):
        # franja opaca arriba y abajo, resto transparente: imita el logo real
        borde = y < 6 or y >= H - 6
        if borde:
            raw += bytes((14, 42, 71, 255))
        else:
            raw += bytes((14, 42, 71, 255 if 40 < x < 300 and 60 < y < 130 else 0))

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
       + chunk(b'IEND', b''))
open('stub-704x192.png', 'wb').write(png)
print('escrito', len(png), 'bytes')
