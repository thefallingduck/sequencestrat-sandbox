/* Minimal animated-GIF (GIF89a) encoder for "Export GIF" in the animation panel.
   Written for this project from the GIF89a specification; no third-party code, no dependencies.
   UMD: window.GifWriter in the browser, module.exports in Node (tests/gifwriter.test.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GifWriter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Palette -------------------------------------------------------------
  // Count exact RGB colours over all frames (alpha ignored).
  function countColours(frames) {
    const counts = new Map();
    let total = 0;
    for (const a of frames) {
      for (let i = 0; i + 3 < a.length; i += 4) {
        const k = (a[i] << 16) | (a[i + 1] << 8) | a[i + 2];
        counts.set(k, (counts.get(k) || 0) + 1);
        total++;
      }
    }
    return { counts, total };
  }

  // Weighted median cut on [{r,g,b,c}] items into `target` boxes; returns mean colours.
  function medianCut(items, target) {
    const boxes = [items];
    const weight = (b) => b.reduce((s, x) => s + x.c, 0);
    while (boxes.length < target) {
      let bi = -1, bw = -1;                       // split the heaviest splittable box
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].length < 2) continue;
        const w = weight(boxes[i]);
        if (w > bw) { bw = w; bi = i; }
      }
      if (bi < 0) break;
      const box = boxes[bi];
      let lo = [255, 255, 255], hi = [0, 0, 0];
      for (const x of box) {
        const v = [x.r, x.g, x.b];
        for (let c = 0; c < 3; c++) { if (v[c] < lo[c]) lo[c] = v[c]; if (v[c] > hi[c]) hi[c] = v[c]; }
      }
      const ch = ['r', 'g', 'b'][[0, 1, 2].sort((p, q) => (hi[q] - lo[q]) - (hi[p] - lo[p]) || p - q)[0]];
      box.sort((p, q) => p[ch] - q[ch] || p.k - q.k);
      let acc = 0, cut = 1;                       // cut at the weighted median, >=1 item per side
      for (let i = 0; i < box.length - 1; i++) { acc += box[i].c; cut = i + 1; if (acc * 2 >= bw) break; }
      boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
    }
    return boxes.map((box) => {
      let w = 0, r = 0, g = 0, b = 0;
      for (const x of box) { w += x.c; r += x.r * x.c; g += x.g * x.c; b += x.b * x.c; }
      return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    });
  }

  // rgbaArrays: array of RGBA arrays. Returns Uint8Array RGB palette, 2^k entries (2..256).
  function buildPalette(rgbaArrays, maxColors) {
    maxColors = Math.max(2, Math.min(256, maxColors || 256));
    const { counts, total } = countColours(rgbaArrays);
    const entries = [];
    for (const [k, c] of counts) entries.push({ k, c, r: k >> 16, g: (k >> 8) & 255, b: k & 255 });
    let colours;
    if (entries.length <= maxColors) {
      colours = entries.map((e) => [e.r, e.g, e.b]);
    } else {
      // Keep common (>=0.5% of pixels) colours exactly; median-cut the rest into the free slots.
      entries.sort((p, q) => q.c - p.c || p.k - q.k);
      let nExact = 0;
      while (nExact < maxColors - 1 && entries[nExact].c >= total * 0.005) nExact++;
      colours = entries.slice(0, nExact).map((e) => [e.r, e.g, e.b]);
      colours = colours.concat(medianCut(entries.slice(nExact), maxColors - nExact));
    }
    let n = 2;
    while (n < colours.length) n <<= 1;
    const pal = new Uint8Array(3 * n);              // unused entries stay black
    colours.forEach((c, i) => pal.set(c, 3 * i));
    return pal;
  }

  // ---- Indexing ------------------------------------------------------------
  // Nearest palette entry (squared RGB distance) for every pixel; lookups cached by packed RGB.
  function indexFrame(rgba, palette) {
    const n = palette.length / 3, out = new Uint8Array(rgba.length >> 2), cache = new Map();
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const k = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      let idx = cache.get(k);
      if (idx === undefined) {
        let best = Infinity;
        idx = 0;
        for (let j = 0; j < n; j++) {
          const dr = rgba[i] - palette[3 * j], dg = rgba[i + 1] - palette[3 * j + 1], db = rgba[i + 2] - palette[3 * j + 2];
          const d = dr * dr + dg * dg + db * db;
          if (d < best) { best = d; idx = j; if (d === 0) break; }
        }
        cache.set(k, idx);
      }
      out[p] = idx;
    }
    return out;
  }

  // ---- LZW -----------------------------------------------------------------
  // Dictionary: key = prefixCode*256+byte -> code. A generation stamp makes resets O(1).
  const dictCode = new Int32Array(4096 * 256), dictGen = new Int32Array(4096 * 256);
  let gen = 0;

  function lzwEncode(pixels, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    const out = new Uint8Array(Math.ceil(pixels.length * 1.6) + 64);
    let op = 0, buf = 0, nbits = 0, size = minCode + 1, next = eoi + 1;
    const emit = (code) => {                      // pack LSB-first
      buf |= code << nbits; nbits += size;
      while (nbits >= 8) { out[op++] = buf & 255; buf >>>= 8; nbits -= 8; }
    };
    const grow = () => { if (next > (1 << size) && size < 12) size++; };
    gen++;
    emit(clear);
    let prefix = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const px = pixels[i], key = (prefix << 8) | px;
      if (dictGen[key] === gen) { prefix = dictCode[key]; continue; }
      emit(prefix);
      if (next < 4096) {
        dictGen[key] = gen; dictCode[key] = next++;
        grow();
      } else {                                    // table full: clear and start over
        emit(clear); gen++; next = eoi + 1; size = minCode + 1;
      }
      prefix = px;
    }
    emit(prefix);
    if (next < 4096) { next++; grow(); }          // decoder adds one more entry here; keep code size in step
    emit(eoi);
    if (nbits > 0) out[op++] = buf & 255;
    return out.subarray(0, op);
  }

  // ---- File ----------------------------------------------------------------
  function encodeGif(opts) {
    const width = opts.width, height = opts.height, frames = opts.frames;
    const delayMs = opts.delayMs === undefined ? 120 : opts.delayMs;
    const loop = opts.loop === undefined ? 0 : opts.loop;
    let pal = opts.palette, n = pal.length / 3;
    let pow = 2, bits = 1;
    while (pow < n) { pow <<= 1; bits++; }
    if (pow !== n) { const p = new Uint8Array(3 * pow); p.set(pal); pal = p; n = pow; }
    const minCode = Math.max(2, bits);
    const cs = (ms) => Math.max(0, Math.min(65535, Math.round(ms / 10)));   // ms -> 1/100 s
    const delay = cs(delayMs), lastDelay = opts.lastDelayMs === undefined ? delay : cs(opts.lastDelayMs);
    const chunks = [];
    const bytes = (...b) => chunks.push(Uint8Array.from(b));
    const str = (s) => chunks.push(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    const w16 = (v) => [v & 255, (v >> 8) & 255];

    str('GIF89a');
    bytes(...w16(width), ...w16(height), 0x80 | (7 << 4) | (bits - 1), 0, 0);   // global table present
    chunks.push(pal);
    bytes(0x21, 0xff, 11); str('NETSCAPE2.0'); bytes(3, 1, ...w16(loop), 0);   // loop count
    frames.forEach((f, fi) => {
      const d = fi === frames.length - 1 ? lastDelay : delay;   // optional longer hold on the last frame
      bytes(0x21, 0xf9, 4, 1 << 2, ...w16(d), 0, 0);    // disposal 1, no transparency
      bytes(0x2c, 0, 0, 0, 0, ...w16(width), ...w16(height), 0);   // full frame, no local table
      bytes(minCode);
      const data = lzwEncode(f, minCode);
      for (let p = 0; p < data.length; p += 255) {
        const part = data.subarray(p, Math.min(p + 255, data.length));
        bytes(part.length); chunks.push(part);
      }
      bytes(0);                                   // end of image data
    });
    bytes(0x3b);
    let len = 0;
    for (const c of chunks) len += c.length;
    const file = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) { file.set(c, o); o += c.length; }
    return file;
  }

  return { buildPalette, indexFrame, encodeGif };
});
