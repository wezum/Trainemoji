// make-icons.mjs — generates icon-192.png, icon-512.png, apple-touch-icon.png
// Pure Node (zlib only). Flat two-tone icon: orange shield on dark rounded square.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [251, 243, 228];   // #fbf3e4 cream
const FG = [34, 51, 92];      // #22335c navy shield
const R_IN  = 0.78;           // shield outline coverage
const R_OUT = 0.86;           // soft AA edge (ring shape between)

function cover(x, y, S) {
  // 1.0 inside shield, 0.0 outside, soft edge between R_IN..R_OUT
  const cx = S / 2, top = S * 0.24, bottom = S * 0.76;
  if (y < top || y > bottom) return 0;
  const halfW = S * 0.21;
  const t = (y - top) / (bottom - top);
  // width: constant until 55%, then taper to a point
  let w = t < 0.55 ? halfW : halfW * (1 - (t - 0.55) / 0.45);
  const dx = Math.abs(x - cx);
  return dx <= w * R_IN ? 1 : dx <= w * R_OUT ? 1 - (dx - w * R_IN) / (w * (R_OUT - R_IN)) : 0;
}

function roundBg(x, y, S) {
  const r = S * 0.22, m = S * 0.02;
  const ex = Math.max(Math.abs(x - S / 2) - (S / 2 - m - r), 0);
  const ey = Math.max(Math.abs(y - S / 2) - (S / 2 - m - r), 0);
  return 1 - clamp01((Math.hypot(ex, ey) - r + 0.5) / 1); // 1 inside, soft AA edge
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function render(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const bgA = roundBg(x + 0.5, y + 0.5, size);
      let [R, G, B, A] = [BG[0], BG[1], BG[2], Math.round(255 * bgA)];
      const sh = cover(x + 0.5, y + 0.5, size);
      if (sh > 0) {
        R = Math.round(FG[0] * sh + R * (1 - sh));
        G = Math.round(FG[1] * sh + G * (1 - sh));
        B = Math.round(FG[2] * sh + B * (1 - sh));
      }
      const i = 1 + x * 4;
      row[i] = R; row[i + 1] = G; row[i + 2] = B; row[i + 3] = A;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

// ---- PNG assembly ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(render(size))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(name, png(size));
  console.log("wrote", name, size + "x" + size);
}
