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
  var RATE_MIN = 0.1, RATE_MAX = 1000;              // mm/kyr, ends of the log colour scale
  var LOG_MIN = Math.log10(RATE_MIN), LOG_SPAN = Math.log10(RATE_MAX) - LOG_MIN;
  /* one colour per decade (0.1, 1, 10, 100, 1000 mm/kyr): single-hue purple, dark = slow
     (condensed) to pale = fast. Different hue from the sand-content scale; both ends stay
     distinct from the light and the dark plot backgrounds. */
  var RATE_STOPS = ['#4a2163', '#6d3c8e', '#8e60af', '#ad88c8', '#ccb2e0']
    .map(function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); });
  var RATE_TICKS = [0.1, 1, 10, 100, 1000];

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
  /* position 0..1 on the colour scale for a log10 rate (clamped at the ends) */
  function logRatePos(lr) { return Math.max(0, Math.min(1, (lr - LOG_MIN) / LOG_SPAN)); }
  function ratePos(rate) { return rate > 0 ? logRatePos(Math.log10(rate)) : 0; }

  var LUT = [];
  for (var q = 0; q <= 255; q++) {
    var f = q / 255 * (RATE_STOPS.length - 1), j = Math.min(RATE_STOPS.length - 2, Math.floor(f)), u = f - j;
    LUT.push(RATE_STOPS[j].map(function (v, m) { return Math.round(v + (RATE_STOPS[j + 1][m] - v) * u); }));
  }
  function logRateIdx(lr) { return Math.round(logRatePos(lr) * 255); }
  function rateRGB(rate) { return LUT[Math.round(ratePos(rate) * 255)]; }
  function rateColor(rate) { var c = rateRGB(rate); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  /* readable number: 0.35, 3.2, 47, 1200 */
  function fmtRate(rate) {
    if (!(rate > 0)) return '0';
    if (rate >= 100) return String(Math.round(rate));
    return String(+rate.toPrecision(2));
  }
  return { RATE_MIN: RATE_MIN, RATE_MAX: RATE_MAX, RATE_STOPS: RATE_STOPS, RATE_TICKS: RATE_TICKS, LUT: LUT,
    rateMmPerKyr: rateMmPerKyr, layerDurations: layerDurations, layerLogRates: layerLogRates,
    logRatePos: logRatePos, ratePos: ratePos, logRateIdx: logRateIdx,
    rateRGB: rateRGB, rateColor: rateColor, fmtRate: fmtRate };
});
