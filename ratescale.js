/* Preserved accumulation rate and its colour scale, shared by index.html and wheeler.js.
   UMD: window.RateScale in the browser, module.exports in Node (for tests).

   Rate = preserved thickness of a record layer / time that layer spans, in mm/kyr
   (1 mm/kyr = 1 m/Myr). It is the PRESERVED rate: where later erosion removed part of a
   layer, the rate is lower than the rate at which it was first deposited. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RateScale = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* Split log scale in 8 colour bands, each the same width on the legend:
       whole decades for slow rates (where most of the TIME record sits: <1, 1-10, 10-100)
       and half decades for fast rates (where most of the section VOLUME sits:
       100-300, 300-1k, 1k-3k, 3k-10k, >=10k mm/kyr).
     Colours run from dark violet (slow, condensed) through magenta and red to pale apricot
     (fast). Different from the sand-content scale; both ends stay distinct from the light
     and dark plot backgrounds. */
  var RATE_EDGES = [0.1, 1, 10, 100, 300, 1000, 3000, 10000, 30000];   // band edges, mm/kyr
  var RATE_MIN = RATE_EDGES[0], RATE_MAX = RATE_EDGES[RATE_EDGES.length - 1];
  var LOG_EDGES = RATE_EDGES.map(function (v) { return Math.log10(v); });
  var NB = RATE_EDGES.length - 1;                                        // 8 bands
  var RATE_STOPS = ['#3c2766', '#632474', '#902275', '#bb2567', '#da4149', '#e9693a', '#f59145', '#f9b879']
    .map(function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); });
  var RATE_TICKS = RATE_EDGES.slice();
  /* thickness in metres over a duration in years -> mm/kyr; 0 when nothing is preserved */
  function rateMmPerKyr(thicknessM, durationYr) {
    if (!(thicknessM > 0) || !(durationYr > 0)) return 0;
    return thicknessM * 1e6 / durationYr;          // (m * 1000 mm/m) / (yr / 1000 yr/kyr)
  }
  /* time spanned by each record layer, from the layer end times history.t (years) */
  function layerDurations(t) {
    var d = new Float64Array(t.length);
    for (var k = 0; k < t.length; k++) d[k] = k ? t[k] - t[k - 1] : t[0];
    return d;
  }
  /* log10(preserved rate) for every layer cell of a run: logRates[k][i]; NaN where the layer
     left nothing at column i. Log values so that smoothing averages in log space. */
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function layerLogRates(r) {
    if (cache && cache.has(r)) return cache.get(r);
    var d = layerDurations(r.history.t), out = [];
    for (var k = 0; k < r.nLayers; k++) {
      var th = r.thickness[k], row = new Float32Array(th.length);
      for (var i = 0; i < th.length; i++) {
        var v = rateMmPerKyr(th[i], d[k]);
        row[i] = v > 0 ? Math.log10(v) : NaN;
      }
      out.push(row);
    }
    if (cache) cache.set(r, out);
    return out;
  }
  /* position 0..1 along the legend for a log10 rate: band j covers [j/NB, (j+1)/NB], log-linear
     inside the band; clamped at the ends */
  function logRatePos(lr) {
    if (!(lr > LOG_EDGES[0])) return 0;
    if (lr >= LOG_EDGES[NB]) return 1;
    var j = 0; while (j < NB - 1 && lr >= LOG_EDGES[j + 1]) j++;
    return (j + (lr - LOG_EDGES[j]) / (LOG_EDGES[j + 1] - LOG_EDGES[j])) / NB;
  }
  function ratePos(rate) { return rate > 0 ? logRatePos(Math.log10(rate)) : 0; }
  /* band 0..NB-1 for a position: one flat colour per band */
  function bandOf(pos) { return Math.min(NB - 1, Math.floor(pos * NB)); }

  var LUT = [];                                  // 256 entries, flat within each band
  for (var q = 0; q <= 255; q++) LUT.push(RATE_STOPS[bandOf(q / 255)]);
  function logRateIdx(lr) { return Math.round(logRatePos(lr) * 255); }
  function rateRGB(rate) { return RATE_STOPS[bandOf(ratePos(rate))]; }
  function rateColor(rate) { var c = rateRGB(rate); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  /* readable number: 0.35, 3.2, 47, 1200 */
  function fmtRate(rate) {
    if (!(rate > 0)) return '0';
    if (rate >= 100) return String(Math.round(rate));
    return String(+rate.toPrecision(2));
  }
  return { RATE_MIN: RATE_MIN, RATE_MAX: RATE_MAX, RATE_EDGES: RATE_EDGES, RATE_STOPS: RATE_STOPS, RATE_TICKS: RATE_TICKS, LUT: LUT,
    bandOf: bandOf,
    rateMmPerKyr: rateMmPerKyr, layerDurations: layerDurations, layerLogRates: layerLogRates,
    logRatePos: logRatePos, ratePos: ratePos, logRateIdx: logRateIdx,
    rateRGB: rateRGB, rateColor: rateColor, fmtRate: fmtRate };
});
