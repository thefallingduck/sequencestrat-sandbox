'use strict';
// Tests for the sediment-loading subsidence option (p.sedimentLoading) in seqstrat.js.
// Run: node --test tests/loading.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SS = require(path.join(__dirname, '..', 'seqstrat.js'));
const T = { timeout: 120000 };
const D = SS.DEFAULTS;
const RATIO = (D.rhoSediment - D.rhoWater) / (D.rhoMantle - D.rhoWater);

const memo = new Map();
function sim(over) {
  const full = Object.assign({}, D, { duration: 120000 }, over || {});
  const key = JSON.stringify(Object.keys(full).sort().map(k => [k, full[k]]));
  if (!memo.has(key)) memo.set(key, SS.simulate(full));
  return memo.get(key);
}
const sum = a => { let s = 0; for (const v of a) s += v; return s; };
const stored = r => { const t = new Float64Array(r.x.length); for (let i = 0; i < t.length; i++) t[i] = r.surface[i] - r.basement[i]; return t; };
const sameRun = (a, b) => a.thickness.every((L, k) => L.every((v, i) => v === b.thickness[k][i]))
  && a.basement.every((v, i) => v === b.basement[i]) && JSON.stringify(a.tracts) === JSON.stringify(b.tracts);

const AIRY = { sedimentLoading: true, elasticThickness: 0 };
const AIRY_NOW = { sedimentLoading: true, elasticThickness: 0, loadResponseTime: 0 };
const PLATE = { sedimentLoading: true, elasticThickness: 30000 };

describe('sediment loading: off by default', () => {
  test('is off in DEFAULTS and leaves no load subsidence', T, () => {
    assert.strictEqual(D.sedimentLoading, false);
    const r = sim({});
    assert.ok(r.loadSubsidence.every(v => v === 0), 'loadSubsidence not all zero with loading off');
  });

  test('its other settings do nothing while it is off', T, () => {
    const a = sim({}), b = sim({ elasticThickness: 40000, loadResponseTime: 0, rhoSediment: 2400 });
    assert.ok(sameRun(a, b), 'run changed although sedimentLoading is false');
  });
});

describe('sediment loading: local (Airy) isostasy', () => {
  test('with instant response, sinking matches the Airy prediction (0.47 m per m of sediment)', T, () => {
    const r = sim(AIRY_NOW);
    // The basement responds to the load at the start of each 1 kyr step, so it lags the final
    // load by one step of deposition (under 2% of a 120 kyr fill).
    const w = sum(r.loadSubsidence), pred = RATIO * sum(stored(r));
    assert.ok(Math.abs(w / pred - 1) < 0.02, `sum of sinking ${w.toFixed(1)} m vs Airy ${pred.toFixed(1)} m`);
  });

  test('simple fill (steady sea level, no wave erosion): every column matches Airy', T, () => {
    // Column by column, against the load the basement last responded to: everything except the
    // final layer. Exact where nothing was eroded in the final step, hence the simple fill.
    const r = sim(Object.assign({ seaLevelAmplitude: 0, ravinementDepth: 0, supplyVariability: 0 }, AIRY_NOW));
    const n = r.nLayers, th = stored(r);
    let good = 0, cols = 0;
    for (let i = 0; i < th.length; i++) {
      const prev = r.horizons[n - 2][i] - r.basement[i];
      if (prev < 5) continue;
      cols++;
      if (Math.abs(r.loadSubsidence[i] / (RATIO * prev) - 1) < 0.01) good++;
    }
    assert.ok(cols > 30 && good === cols, `${good} of ${cols} columns within 1% of Airy`);
  });

  test('with a 10 kyr response time the basement lags behind, but not far', T, () => {
    const r = sim(AIRY), f = sum(r.loadSubsidence) / (RATIO * sum(stored(r)));
    assert.ok(f > 0.8 && f < 1, `sinking is ${(f * 100).toFixed(1)}% of the Airy amount`);
  });

  test('sinks only where there is sediment, and never lifts the basement', T, () => {
    const r = sim(AIRY), th = stored(r);
    for (let i = 0; i < th.length; i++) {
      assert.ok(r.loadSubsidence[i] >= 0, `column ${i} lifted ${r.loadSubsidence[i]}`);
      if (th[i] === 0) assert.strictEqual(r.loadSubsidence[i], 0, `column ${i} sank with no sediment`);
    }
  });
});

describe('sediment loading: elastic plate (flexure)', () => {
  test('spreads the sinking: shallower under the depocentre, about the same total', T, () => {
    const a = sim(AIRY), p = sim(PLATE);
    const maxA = Math.max(...a.loadSubsidence), maxP = Math.max(...p.loadSubsidence);
    assert.ok(maxP < 0.8 * maxA, `plate max ${maxP.toFixed(1)} m not well below Airy max ${maxA.toFixed(1)} m`);
    const f = sum(p.loadSubsidence) / (RATIO * sum(stored(p)));
    assert.ok(f > 0.75 && f < 1.02, `plate sinking is ${(f * 100).toFixed(1)}% of the Airy amount`);
  });

  test('lifts a low bulge beyond the load', T, () => {
    const r = sim(PLATE), mn = Math.min(...r.loadSubsidence);
    const iMax = r.loadSubsidence.indexOf(Math.max(...r.loadSubsidence));
    const iMin = r.loadSubsidence.indexOf(mn);
    assert.ok(mn < -0.05, `no bulge (min ${mn} m)`);
    assert.ok(iMin > iMax, `bulge at ${iMin} km is not basinward of the deepest sinking at ${iMax} km`);
  });

  test('a stiffer plate spreads the load further', T, () => {
    const soft = sim({ sedimentLoading: true, elasticThickness: 5000 });
    const stiff = sim({ sedimentLoading: true, elasticThickness: 50000 });
    assert.ok(Math.max(...stiff.loadSubsidence) < Math.max(...soft.loadSubsidence));
  });
});

describe('sediment loading: conservation and stratigraphy', () => {
  for (const [name, P] of [['Airy', AIRY], ['elastic plate', PLATE], ['Airy, instant', AIRY_NOW]]) {
    test(`mass balance per fraction < 1e-9 (${name})`, T, () => {
      const r = sim(P);
      for (const f of r.massBalance.byFraction) assert.ok(Math.abs(f.error) < 1e-9, `error ${f.error}`);
      assert.strictEqual(r.erodedBelowActive, 0);
    });
  }

  test('adds accommodation: the shoreline ends further landward than without loading', T, () => {
    const off = sim({ duration: 240000 }), on = sim(Object.assign({ duration: 240000 }, AIRY));
    const a = off.history.shorelineX.at(-1), b = on.history.shorelineX.at(-1);
    assert.ok(b < a - 5000, `shoreline ${b / 1000} km with loading vs ${a / 1000} km without`);
  });

  test('relative sea-level rate at the shoreline includes the load sinking', T, () => {
    const off = sim({}), on = sim(AIRY);
    const n = on.history.rslRate.length;
    // late in the run the load term is a clear, positive addition to the rise
    const mOff = sum(off.history.rslRate.slice(n / 2)) / (n / 2), mOn = sum(on.history.rslRate.slice(n / 2)) / (n / 2);
    assert.ok(mOn > mOff, `mean RSL rate ${mOn} with loading not above ${mOff} without`);
  });

  test('still classifies falling-stage and transgressive tracts (default sea level)', T, () => {
    const types = new Set(sim(AIRY).tracts.map(t => t.type));
    for (const k of ['FSST', 'TST', 'HST']) assert.ok(types.has(k), `missing ${k}`);
  });

  test('reference preset with a stiff plate: five sequence boundaries, no extra time steps', { timeout: 120000 }, () => {
    const REF = { duration: 600000, seaLevelAmplitude: 15, seaLevelPeriod: 120000,
      seaLevelAmplitude2: 8, seaLevelPeriod2: 400000, seaLevelPhase2: Math.PI,
      seaLevelAmplitude3: 25, seaLevelPeriod3: 1200000, sedimentSupply: 20, subsidenceMax: 0.3 };
    const on = SS.simulate(Object.assign({}, D, REF, { sedimentLoading: true, elasticThickness: 50000 }));
    const off = SS.simulate(Object.assign({}, D, REF));
    for (const f of on.massBalance.byFraction) assert.ok(Math.abs(f.error) < 1e-9);
    assert.strictEqual(on.surfaces.filter(s => s.type === 'SB').length, 5);
    // run time is set by the number of diffusion steps; the load solve adds one pass per 1 kyr
    assert.ok(on.stepsTotal <= 1.1 * off.stepsTotal, `steps ${on.stepsTotal} vs ${off.stepsTotal}`);
  });
});
