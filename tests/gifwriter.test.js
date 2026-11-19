'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPalette, indexFrame, encodeGif } = require('../gifwriter.js');

function rng(seed) {                               // mulberry32, deterministic
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tiny GIF decoder: returns { width, height, palette, frames: [Uint8Array of indices] }.
function decodeGif(b) {
  let p = 6;
  const width = b[p] | (b[p + 1] << 8), height = b[p + 2] | (b[p + 3] << 8);
  const flags = b[p + 4]; p += 7;
  const palette = b.subarray(p, p + 3 * (1 << ((flags & 7) + 1))); p += palette.length;
  const frames = [];
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) {                           // extension: skip its sub-blocks
      p += 2;
      while (b[p]) p += b[p] + 1;
      p++;
    } else if (b[p] === 0x2c) {
      p += 10;
      const minCode = b[p++];
      const parts = [];
      while (b[p]) { parts.push(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; }
      p++;
      frames.push(lzwDecode(Buffer.concat(parts), minCode, width * height));
    } else throw new Error('bad block 0x' + b[p].toString(16) + ' at ' + p);
  }
  return { width, height, palette, frames };
}

function lzwDecode(data, minCode, npix) {
  const clear = 1 << minCode, eoi = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096);
  const out = new Uint8Array(npix);
  let op = 0, size = minCode + 1, next = eoi + 1, prev = -1, buf = 0, nb = 0, dp = 0;
  const first = (c) => { while (c >= clear) c = prefix[c]; return c; };
  const write = (c) => {                           // expand a code, write in forward order
    const tmp = [];
    while (c >= clear) { tmp.push(suffix[c]); c = prefix[c]; }
    tmp.push(c);
    for (let i = tmp.length - 1; i >= 0; i--) out[op++] = tmp[i];
  };
  for (;;) {
    while (nb < size) {
      if (dp >= data.length) throw new Error('ran out of data without EOI');
      buf |= data[dp++] << nb; nb += 8;
    }
    const code = buf & ((1 << size) - 1); buf >>>= size; nb -= size;
    if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (code > next || (code === next && prev < 0)) throw new Error('bad code ' + code);
    if (code < next) write(code);
    else { write(prev); out[op++] = first(prev); }  // KwKwK case
    if (prev >= 0 && next < 4096) {
      prefix[next] = prev; suffix[next] = first(code < next ? code : prev); next++;
      if (next === (1 << size) && size < 12) size++;
    }
    prev = code;
  }
  assert.equal(op, npix, 'decoded pixel count');
  return out;
}

const grey = (n) => { const p = new Uint8Array(3 * n); for (let i = 0; i < n; i++) p.set([i, 255 - i, (i * 7) & 255], 3 * i); return p; };
const noise = (n, k, seed) => { const r = rng(seed), a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (r() * k) | 0; return a; };

// 2-frame 37x23 case with a 4-colour palette
const W = 37, H = 23;
const pal4 = Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
const twoFrames = [noise(W * H, 4, 1), noise(W * H, 4, 2)];

test('header, NETSCAPE block, trailer, size bytes', () => {
  const g = encodeGif({ width: W, height: H, palette: pal4, frames: twoFrames });
  assert.equal(Buffer.from(g.subarray(0, 6)).toString('latin1'), 'GIF89a');
  assert.ok(Buffer.from(g).includes('NETSCAPE2.0'));
  assert.equal(g[g.length - 1], 0x3b);
  assert.equal(g[6] | (g[7] << 8), W);
  assert.equal(g[8] | (g[9] << 8), H);
  assert.equal(g[10] & 0x80, 0x80);               // global colour table flag
});

test('round trip: 2 frames 37x23', () => {
  const d = decodeGif(encodeGif({ width: W, height: H, palette: pal4, frames: twoFrames }));
  assert.equal(d.frames.length, 2);
  twoFrames.forEach((f, i) => assert.deepEqual(d.frames[i], f));
  assert.deepEqual(d.palette, pal4);
});

test('round trip: 64x48 noise, 256 colours', () => {
  const f = noise(64 * 48, 256, 3);
  const d = decodeGif(encodeGif({ width: 64, height: 48, palette: grey(256), frames: [f] }));
  assert.deepEqual(d.frames[0], f);
});

test('round trip: 256x256 noise forces table resets', () => {
  const f = noise(256 * 256, 256, 4);
  const d = decodeGif(encodeGif({ width: 256, height: 256, palette: grey(256), frames: [f, f] }));
  assert.deepEqual(d.frames[0], f);
  assert.deepEqual(d.frames[1], f);
});

test('round trip: 200x150 long runs', () => {
  const f = new Uint8Array(200 * 150).fill(2);
  for (let i = 0; i < f.length; i += 997) f[i] = 1;     // sparse specks
  f.fill(3, 10000, 20000);
  const d = decodeGif(encodeGif({ width: 200, height: 150, palette: pal4, frames: [f, new Uint8Array(f.length)] }));
  assert.deepEqual(d.frames[0], f);
  assert.deepEqual(d.frames[1], new Uint8Array(f.length));
});

test('round trip: assorted palette sizes and tiny images', () => {
  for (const n of [2, 8, 16, 32, 64, 128]) {
    for (const [w, h] of [[1, 1], [3, 5], [90, 41]]) {
      const f = noise(w * h, n, n + w);
      const d = decodeGif(encodeGif({ width: w, height: h, palette: grey(n), frames: [f] }));
      assert.deepEqual(d.frames[0], f, `n=${n} ${w}x${h}`);
    }
  }
});

test('buildPalette: <=256 distinct colours kept exactly, indexFrame round trips', () => {
  const r = rng(5), a = new Uint8ClampedArray(4 * 5000), want = new Set();
  const cols = Array.from({ length: 200 }, () => [(r() * 256) | 0, (r() * 256) | 0, (r() * 256) | 0]);
  for (let i = 0; i < 5000; i++) { const c = cols[(r() * 200) | 0]; a.set([...c, 255], 4 * i); want.add(c.join()); }
  const pal = buildPalette([a]);
  assert.equal(pal.length, 3 * 256);
  const have = new Set();
  for (let i = 0; i < pal.length; i += 3) have.add([pal[i], pal[i + 1], pal[i + 2]].join());
  for (const c of want) assert.ok(have.has(c), 'missing ' + c);
  const idx = indexFrame(a, pal);
  for (let i = 0; i < 5000; i++) assert.deepEqual([...pal.subarray(3 * idx[i], 3 * idx[i] + 3)], [...a.subarray(4 * i, 4 * i + 3)]);
});

test('buildPalette: 2000-colour gradient keeps 3 flat colours exactly', () => {
  const n = 10000, a = new Uint8ClampedArray(4 * n);
  const flats = [[250, 10, 10], [210, 250, 30], [255, 255, 255]];
  for (let i = 0; i < n; i++) {
    let c;
    if (i < 3000) c = flats[(i / 1000) | 0];
    else { const g = (i - 3000) % 2000; c = [g % 200, ((g / 200) | 0) * 20, (g * 3) % 256]; }
    a.set([...c, 255], 4 * i);
  }
  const pal = buildPalette([a]);
  assert.ok(pal.length / 3 <= 256);
  const have = new Set();
  for (let i = 0; i < pal.length; i += 3) have.add([pal[i], pal[i + 1], pal[i + 2]].join());
  for (const f of flats) assert.ok(have.has(f.join()), 'flat colour lost ' + f);
  const idx = indexFrame(a, pal);                  // flats map back exactly
  for (let i = 0; i < 3000; i++) assert.deepEqual([...pal.subarray(3 * idx[i], 3 * idx[i] + 3)], flats[(i / 1000) | 0]);
});
