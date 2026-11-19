'use strict';
// Tests for ratescale.js (preserved accumulation rate, mm/kyr, and its colour scale).
// Run: node --test tests/ratescale.test.js   (from the repo root)

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const RS = require(path.join(__dirname, '..', 'ratescale.js'));
const SS = require(path.join(__dirname, '..', 'seqstrat.js'));

// One DEFAULTS run, shared by the tests that need it (about 4 s).
let run;
before(() => { run = SS.simulate(Object.assign({}, SS.DEFAULTS)); });

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

describe('rateMmPerKyr', () => {
  test('converts thickness over duration to mm/kyr', () => {
    close(RS.rateMmPerKyr(0.001, 1000), 1);
    close(RS.rateMmPerKyr(0.05, 1000), 50);
    close(RS.rateMmPerKyr(0.02, 2000), 10);
  });
  test('zero, negative or missing inputs give 0', () => {
    assert.equal(RS.rateMmPerKyr(0, 1000), 0);
    assert.equal(RS.rateMmPerKyr(-0.01, 1000), 0);
    assert.equal(RS.rateMmPerKyr(0.01, 0), 0);
  });
});

describe('layerDurations', () => {
  test('differences of cumulative end times', () => {
    assert.deepEqual(Array.from(RS.layerDurations([1000, 2000, 3000])), [1000, 1000, 1000]);
    assert.deepEqual(Array.from(RS.layerDurations([500, 1500])), [500, 1000]);
  });
});

describe('layerLogRates on the DEFAULTS run', () => {
  test('matches thickness x 1000 / 1000 mm/kyr per cell (1-kyr layers)', () => {
    const r = run;
    const logRates = RS.layerLogRates(r);
    const d = RS.layerDurations(r.history.t);
    let nonEmpty = 0;
    for (let k = 0; k < r.nLayers; k++) {
      const th = r.thickness[k];
      for (let i = 0; i < th.length; i++) {
        const t = th[i];
        const lr = logRates[k][i];
        if (t > 0) {
          nonEmpty++;
          const expect = t * 1000 / ((r.history.t[k] - (k ? r.history.t[k - 1] : 0)) / 1000);
          const got = Math.pow(10, lr);
          assert.ok(Math.abs(got - expect) / expect < 1e-5,
            `layer ${k} column ${i}: expected ${expect}, got ${got}`);
          // the same duration as layerDurations
          assert.ok(Math.abs(d[k] - (r.history.t[k] - (k ? r.history.t[k - 1] : 0))) < 1e-9);
        } else {
          assert.ok(Number.isNaN(lr), `layer ${k} column ${i}: expected NaN, got ${lr}`);
        }
      }
    }
    assert.ok(nonEmpty >= 1000, `only ${nonEmpty} non-empty cells`);
  });

  test('is cached: a second call returns the same array object', () => {
    const a = RS.layerLogRates(run);
    const b = RS.layerLogRates(run);
    assert.equal(a, b);
  });

  // Over the section view (0-170 km) the notes measured a median of ~9 mm/kyr. The deep basin
  // floor beyond that holds a thin mud film at well under 1 mm/kyr, so it is left out here.
  test('median preserved rate over 0-170 km lies between 1 and 100 mm/kyr', () => {
    const logRates = RS.layerLogRates(run);
    const rates = [];
    for (const row of logRates) for (let i = 0; i < row.length; i++) {
      if (run.x[i] > 170000) break;
      if (!Number.isNaN(row[i])) rates.push(Math.pow(10, row[i]));
    }
    rates.sort((a, b) => a - b);
    const n = rates.length;
    const median = n % 2 ? rates[(n - 1) / 2] : (rates[n / 2 - 1] + rates[n / 2]) / 2;
    console.log(`median preserved rate (DEFAULTS, 0-170 km, per layer cell): ${median} mm/kyr over ${n} cells`);
    assert.ok(median >= 1 && median <= 100, `median ${median} mm/kyr outside 1-100`);
  });
});

describe('colour scale', () => {
  test('ratePos clamps and hits the edges', () => {
    assert.equal(RS.ratePos(0.1), 0);
    assert.equal(RS.ratePos(0.01), 0);
    assert.equal(RS.ratePos(0), 0);
    assert.equal(RS.ratePos(30000), 1);
    assert.equal(RS.ratePos(1e6), 1);
    RS.RATE_EDGES.forEach((edge, j) => {
      close(RS.ratePos(edge), j / 8, 1e-12);
    });
  });

  test('inside a band the position is log-linear', () => {
    close(RS.ratePos(Math.sqrt(10 * 100)), 2.5 / 8, 1e-12);
    close(RS.ratePos(Math.sqrt(1000 * 3000)), 5.5 / 8, 1e-12);
  });

  test('each band gets its own flat colour', () => {
    const cases = [
      [0.5, 0], [5, 1], [50, 2], [150, 3], [500, 4],
      [2000, 5], [5000, 6], [20000, 7], [1e6, 7], [0.01, 0],
    ];
    for (const [rate, band] of cases) {
      assert.deepEqual(RS.rateRGB(rate), RS.RATE_STOPS[band], `rate ${rate} should be band ${band}`);
    }
  });

  test('8 stops, 256-entry LUT whose ends match the first and last stop, at most 8 distinct colours', () => {
    assert.equal(RS.RATE_STOPS.length, 8);
    assert.equal(RS.LUT.length, 256);
    assert.deepEqual(RS.LUT[0], RS.RATE_STOPS[0]);
    assert.deepEqual(RS.LUT[255], RS.RATE_STOPS[7]);
    const distinct = new Set(RS.LUT.map((c) => c.join(',')));
    assert.ok(distinct.size <= 8, `LUT has ${distinct.size} distinct colours`);
  });

  test('bands get steadily lighter from slow to fast (relative luminance rises)', () => {
    const lum = RS.RATE_STOPS.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
    for (let i = 1; i < lum.length; i++) {
      assert.ok(lum[i] > lum[i - 1], `stop ${i} luminance ${lum[i]} not above ${lum[i - 1]}`);
    }
  });

  test('RATE_TICKS equals RATE_EDGES, and the edges strictly increase', () => {
    assert.deepEqual(RS.RATE_TICKS, RS.RATE_EDGES);
    for (let i = 1; i < RS.RATE_EDGES.length; i++) {
      assert.ok(RS.RATE_EDGES[i] > RS.RATE_EDGES[i - 1], `edge ${i} not above edge ${i - 1}`);
    }
  });
});

describe('fmtRate', () => {
  test('readable numbers', () => {
    assert.equal(RS.fmtRate(0.354), '0.35');
    assert.equal(RS.fmtRate(3.24), '3.2');
    assert.equal(RS.fmtRate(47.4), '47');
    assert.equal(RS.fmtRate(1234.4), '1234');
    assert.equal(RS.fmtRate(0), '0');
  });
});
