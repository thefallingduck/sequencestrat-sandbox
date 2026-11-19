'use strict';
// Independent test suite for seqstrat.js (three-fraction grain model). Uses only node:test and node:assert.
// Run: node --test /home/claude/seqstrat/engine.test.js
//
// Every simulate() call goes through one memo keyed by the full merged parameter set, so each
// distinct configuration runs once per process. Expensive runs are computed lazily inside tests
// so the per-test timeout applies to them.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SS = require(path.join(__dirname, '..', 'seqstrat.js'));

const SHORT = 120000;   // duration used for most tests
const FULL = 240000;    // default duration
const LONG = 600000;    // duration of the reference preset
const T = { timeout: 120000 }; // generous per-test timeout (ms)

const memo = new Map();
function sim(over) {
  const full = Object.assign({}, SS.DEFAULTS, over || {});
  const key = JSON.stringify(Object.keys(full).sort().map(k => [k, full[k]]));
  if (!memo.has(key)) memo.set(key, SS.simulate(full));
  return memo.get(key);
}
function run(params) { return sim(Object.assign({ duration: SHORT }, params)); }
function full() { return sim({}); }   // engine defaults, 240 kyr

// Presets from the teaching app, all on top of engine defaults.
const PRESET = {
  forced: { seaLevelAmplitude: 20, seaLevelPeriod: 160000, duration: FULL, sedimentSupply: 15 },
  lst: { sedimentSupply: 15, subsidenceMax: 0.3, seaLevelPeriod: 200000, seaLevelAmplitude: 25 },
  trans: { seaLevelTrend: 0.25, seaLevelAmplitude: 4, sedimentSupply: 6 },
  normal: { seaLevelAmplitude: 3, seaLevelPeriod: 200000, seaLevelTrend: 0.1, sedimentSupply: 30, subsidenceMax: 0.05 },
  tilt: { seaLevelAmplitude: 0, seaLevelTrend: 0, subsidenceMax: 0.3, hingeX: 40000 },
  reference: {
    duration: LONG, seaLevelAmplitude: 15, seaLevelPeriod: 120000,
    seaLevelAmplitude2: 8, seaLevelPeriod2: 400000, seaLevelPhase2: Math.PI,
    seaLevelAmplitude3: 25, seaLevelPeriod3: 1200000, sedimentSupply: 20, subsidenceMax: 0.3,
  },
};

describe('1. mass conservation', () => {
  const cases = [
    ['defaults', {}],
    ['high supply (35)', { sedimentSupply: 35 }],
    ['zero eustatic amplitude', { seaLevelAmplitude: 0 }],
    ['subsidence 0.4', { subsidenceMax: 0.4 }],
  ];
  for (const [name, params] of cases) {
    test(`massBalance.error < 1e-9: ${name}`, T, () => {
      const r = run(params);
      assert.ok(Number.isFinite(r.massBalance.error), 'error is finite');
      assert.ok(Math.abs(r.massBalance.error) < 1e-9,
        `|error| = ${Math.abs(r.massBalance.error)} (massIn=${r.massBalance.massIn}, stored=${r.massBalance.massStored})`);
    });
  }
});

describe('1b. per-fraction mass conservation', () => {
  const cases = [
    ['defaults', () => run({})],
    ['reference preset', () => sim(PRESET.reference)],
  ];
  const labels = ['sand', 'silt', 'clay'];
  for (const [name, get] of cases) {
    for (let j = 0; j < 3; j++) {
      test(`byFraction[${j}] (${labels[j]}) error < 1e-9: ${name}`, T, () => {
        const f = get().massBalance.byFraction[j];
        assert.ok(Number.isFinite(f.error), 'error is finite');
        assert.ok(Math.abs(f.error) < 1e-9,
          `|error| = ${Math.abs(f.error)} (massIn=${f.massIn}, stored=${f.massStored})`);
      });
    }
  }
});

describe('2. geometry', () => {
  test('horizons are non-decreasing upward', T, () => {
    const r = run({}); const N = r.x.length;
    for (let k = 1; k < r.horizons.length; k++) {
      for (let i = 0; i < N; i++) {
        assert.ok(r.horizons[k][i] >= r.horizons[k - 1][i] - 1e-6,
          `layer ${k}, col ${i}: ${r.horizons[k][i]} < ${r.horizons[k - 1][i]}`);
      }
    }
  });

  test('lowest horizon is at or above basement', T, () => {
    const r = run({}); const N = r.x.length;
    for (let i = 0; i < N; i++) {
      assert.ok(r.horizons[0][i] >= r.basement[i] - 1e-6,
        `col ${i}: horizon0 ${r.horizons[0][i]} < basement ${r.basement[i]}`);
    }
  });

  test('last horizon equals present surface within 1e-6', T, () => {
    const r = run({}); const N = r.x.length;
    const last = r.horizons[r.horizons.length - 1];
    for (let i = 0; i < N; i++) {
      assert.ok(Math.abs(last[i] - r.surface[i]) <= 1e-6,
        `col ${i}: horizon ${last[i]} vs surface ${r.surface[i]}`);
    }
  });

  test('thickness is non-negative everywhere', T, () => {
    const r = run({}); const N = r.x.length;
    for (let k = 0; k < r.thickness.length; k++) {
      for (let i = 0; i < N; i++) {
        assert.ok(r.thickness[k][i] >= 0, `layer ${k}, col ${i}: ${r.thickness[k][i]}`);
      }
    }
  });

  // Replaces the old 'phi in [2.5, 9.2]' test: phi is now the thickness-weighted mean of the
  // three fraction phi values, so it must lie in [min, max] of fractionPhi = [3, 9].
  // Known engine issue: ~1500 cells with thickness of order 1e-14 m have phi NaN (the engine
  // treats totals below 1e-12 as empty for phi, but thickness is kept for any positive value).
  test('phi in [min, max] of fractionPhi wherever thickness > 0', T, () => {
    const r = run({}); const N = r.x.length;
    const lo = Math.min(...r.params.fractionPhi), hi = Math.max(...r.params.fractionPhi);
    let checked = 0;
    for (let k = 0; k < r.phi.length; k++) {
      for (let i = 0; i < N; i++) {
        if (r.thickness[k][i] > 0) {
          const v = r.phi[k][i];
          assert.ok(Number.isFinite(v), `layer ${k}, col ${i}: phi not finite (${v}), thickness ${r.thickness[k][i]}`);
          assert.ok(v >= lo && v <= hi, `layer ${k}, col ${i}: phi ${v} outside [${lo}, ${hi}]`);
          checked++;
        }
      }
    }
    assert.ok(checked > 0, 'some layers had thickness > 0');
  });
});

describe('3. no sediment without supply', () => {
  test('sedimentSupply 0 leaves surface equal to basement', T, () => {
    const r = run({ sedimentSupply: 0 });
    for (let i = 0; i < r.x.length; i++) {
      assert.ok(Math.abs(r.surface[i] - r.basement[i]) <= 1e-9,
        `col ${i}: surface ${r.surface[i]} basement ${r.basement[i]}`);
    }
  });
});

describe('4. physics sanity', () => {
  test('(a) rising sea level with no oscillation moves shoreline landward', T, () => {
    const r = run({ seaLevelAmplitude: 0, seaLevelTrend: 0.3, sedimentSupply: 3 });
    const xs = r.history.shorelineX;
    const first = xs[0], last = xs[xs.length - 1];
    assert.ok(last < first, `final shoreline ${last} not landward of first ${first}`);
  });

  test('(b) constant sea level, no subsidence, high supply: shoreline moves seaward', T, () => {
    const r = run({ seaLevelAmplitude: 0, seaLevelTrend: 0, subsidenceMax: 0, sedimentSupply: 30 });
    const xs = r.history.shorelineX;
    const first = xs[0], last = xs[xs.length - 1];
    assert.ok(last > first, `final shoreline ${last} not seaward of first ${first}`);
  });

  test('(c) doubling supply roughly doubles stored sediment (ratio 1.9 to 2.1)', T, () => {
    const a = run({ sedimentSupply: 15 });
    const b = run({ sedimentSupply: 30 });
    const ratio = b.massBalance.massStored / a.massBalance.massStored;
    assert.ok(ratio >= 1.9 && ratio <= 2.1, `ratio = ${ratio}`);
  });
});

describe('5. interpretation (defaults, duration 240 kyr)', () => {
  test('tract sequence follows the cyclic rules', T, () => {
    const tracts = full().tracts;
    for (let m = 1; m < tracts.length; m++) {
      const a = tracts[m - 1].type, b = tracts[m].type;
      assert.notStrictEqual(a + '>' + b, 'FSST>HST', 'FSST directly followed by HST');
      assert.notStrictEqual(a + '>' + b, 'TST>LST', 'TST directly followed by LST');
      if (b === 'LST') {
        assert.strictEqual(a, 'FSST', `LST follows ${a} at tract ${m}`);
      }
    }
  });

  test('every FSST is preceded by a BSFR surface at its start time', T, () => {
    const { tracts, surfaces } = full();
    for (let m = 0; m < tracts.length; m++) {
      if (tracts[m].type !== 'FSST') continue;
      assert.ok(m > 0, 'FSST is the first tract (no preceding BSFR possible)');
      const s = surfaces.find(q => q.type === 'BSFR' && Math.abs(q.time - tracts[m].startTime) < 1e-6);
      assert.ok(s, `no BSFR at start time ${tracts[m].startTime} for FSST tract ${m}`);
    }
  });

  test('every FSST is followed by an SB surface at its end time', T, () => {
    const { tracts, surfaces } = full();
    for (let m = 0; m < tracts.length - 1; m++) {
      if (tracts[m].type !== 'FSST') continue;
      const s = surfaces.find(q => q.type === 'SB' && Math.abs(q.time - tracts[m].endTime) < 1e-6);
      assert.ok(s, `no SB at end time ${tracts[m].endTime} for FSST tract ${m}`);
    }
  });

  test('at least 2 SB surfaces with defaults', T, () => {
    const n = full().surfaces.filter(s => s.type === 'SB').length;
    assert.ok(n >= 2, `found ${n} SB surfaces`);
  });
});

describe('6. no eustasy and no subsidence gives no lowstand or sequence boundary', () => {
  test('zero amplitude, zero trend, zero subsidence: no FSST and no SB', T, () => {
    const r = run({ seaLevelAmplitude: 0, seaLevelTrend: 0, subsidenceMax: 0 });
    const types = r.tracts.map(t => t.type);
    assert.ok(!types.includes('FSST'), `tracts: ${types.join(',')}`);
    assert.strictEqual(r.surfaces.filter(s => s.type === 'SB').length, 0, 'SB surfaces present');
  });
});

describe('7. determinism', () => {
  test('two runs with identical params give identical surfaces', T, () => {
    const a = run({});
    // fresh, uncached run so the comparison is between two independent simulations
    const b = SS.simulate({ duration: SHORT });
    assert.strictEqual(a.surfaces.length, b.surfaces.length);
    for (let s = 0; s < a.surfaces.length; s++) {
      assert.strictEqual(a.surfaces[s].type, b.surfaces[s].type);
      assert.strictEqual(a.surfaces[s].time, b.surfaces[s].time);
      assert.deepStrictEqual(a.surfaces[s].z, b.surfaces[s].z);
    }
    assert.deepStrictEqual(a.surface, b.surface);
  });
});

// ---------------------------------------------------------------------------
// Fall-stage incision, paleo-surfaces, sub-grid shoreline and four-tract ordering
// ---------------------------------------------------------------------------

describe('8. mass conservation with fall-stage incision', () => {
  for (const fi of [1, 2, 4]) {
    test(`massBalance.error < 1e-9 with fallIncision ${fi}`, T, () => {
      const r = sim({ fallIncision: fi });
      assert.ok(Number.isFinite(r.massBalance.error), 'error is finite');
      assert.ok(Math.abs(r.massBalance.error) < 1e-9,
        `|error| = ${Math.abs(r.massBalance.error)} (massIn=${r.massBalance.massIn}, stored=${r.massBalance.massStored})`);
    });
  }
});

describe('9. paleoSurface', () => {
  test('one paleo-surface per layer', T, () => {
    const r = sim({ fallIncision: 2 });
    assert.strictEqual(r.paleoSurface.length, r.nLayers);
  });

  test('last paleo-surface equals present surface within 1e-4', T, () => {
    const r = sim({ fallIncision: 2 });
    const last = r.paleoSurface[r.paleoSurface.length - 1];
    assert.strictEqual(last.length, r.surface.length);
    for (let i = 0; i < r.surface.length; i++) {
      assert.ok(Math.abs(last[i] - r.surface[i]) <= 1e-4,
        `col ${i}: paleo ${last[i]} vs surface ${r.surface[i]}`);
    }
  });

  test('every paleo-surface value is finite', T, () => {
    const r = sim({ fallIncision: 2 });
    for (let k = 0; k < r.paleoSurface.length; k++) {
      for (let i = 0; i < r.paleoSurface[k].length; i++) {
        assert.ok(Number.isFinite(r.paleoSurface[k][i]), `layer ${k}, col ${i}: ${r.paleoSurface[k][i]}`);
      }
    }
  });
});

describe('10. fall-stage incision lowers the land surface more with fallIncision 2 than 1', () => {
  // Mean net land lowering over 20-50 km during the first FSST:
  // lowering = -(paleoSurface[end] - paleoSurface[start-1] + subsidence * dt)
  function firstFsstLowering(r) {
    const f = r.tracts.find(t => t.type === 'FSST');
    assert.ok(f, 'run has an FSST');
    assert.ok(f.startLayer > 0, 'first FSST has a preceding layer');
    const dt = f.endTime - f.startTime;
    const pre = r.paleoSurface[f.startLayer - 1], post = r.paleoSurface[f.endLayer];
    let sum = 0, n = 0;
    for (let i = 0; i < r.x.length; i++) {
      if (r.x[i] < 20000 || r.x[i] > 50000) continue;
      sum += -((post[i] - pre[i]) + r.subsidence[i] * dt);
      n++;
    }
    assert.ok(n > 0, 'some columns lie in 20-50 km');
    return sum / n;
  }

  test('mean lowering with fallIncision 2 exceeds fallIncision 1 by at least 1.5 m', T, () => {
    const lo1 = firstFsstLowering(sim({ fallIncision: 1 }));
    const lo2 = firstFsstLowering(sim({ fallIncision: 2 }));
    assert.ok(lo2 - lo1 >= 1.5,
      `mean lowering fi=1: ${lo1.toFixed(2)} m, fi=2: ${lo2.toFixed(2)} m, difference ${(lo2 - lo1).toFixed(2)} m`);
  });
});

describe('11. fallIncision 1 reproduces the no-incision tract behaviour', () => {
  test('an LST exists with defaults when fallIncision is 1', T, () => {
    const r = sim({ fallIncision: 1 });
    const types = r.tracts.map(t => t.type);
    assert.ok(types.includes('LST'), `tracts: ${types.join(',')}`);
  });
});

describe('12. sub-grid shoreline', () => {
  test('at least one shoreline position is not a cell center (within 1e-6)', T, () => {
    const r = run({});
    const xs = Array.from(r.history.shorelineX);
    const centers = Array.from(r.x);
    let offCenter = 0;
    for (const v of xs) {
      let best = Infinity;
      for (const c of centers) best = Math.min(best, Math.abs(v - c));
      if (best > 1e-6) offCenter++;
    }
    assert.ok(offCenter > 0, `all ${xs.length} shoreline values sit on cell centers`);
  });

  test('all shoreline positions lie within [0, length]', T, () => {
    const r = run({});
    const xs = r.history.shorelineX;
    for (let k = 0; k < xs.length; k++) {
      assert.ok(Number.isFinite(xs[k]), `layer ${k}: ${xs[k]}`);
      assert.ok(xs[k] >= 0 && xs[k] <= r.params.length,
        `layer ${k}: ${xs[k]} outside [0, ${r.params.length}]`);
    }
  });
});

describe('13. four-tract ordering with defaults', () => {
  test('an FSST is never directly followed by an HST', T, () => {
    const r = full();
    for (let m = 1; m < r.tracts.length; m++) {
      const a = r.tracts[m - 1].type, b = r.tracts[m].type;
      assert.ok(!(a === 'FSST' && b === 'HST'), `FSST followed by HST at tract ${m}`);
    }
  });

  test('every FSST is followed by an SB surface at its end time', T, () => {
    const r = full();
    for (let m = 0; m < r.tracts.length - 1; m++) {
      if (r.tracts[m].type !== 'FSST') continue;
      const s = r.surfaces.find(q => q.type === 'SB' && Math.abs(q.time - r.tracts[m].endTime) < 1e-6);
      assert.ok(s, `no SB at end time ${r.tracts[m].endTime} for FSST tract ${m}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Wave ravinement, shoreface relaxation, shoreline bounds
// ---------------------------------------------------------------------------

// Largest net land lowering (m) reached during any tract of the given type.
// For each tract: d = paleoSurface[k][i] - paleoSurface[k0][i] + subsidence[i]*(t[k]-t[k0]),
// k0 = startLayer-1 (min 0); lowering = -min(d) over layers k in the tract and columns i.
function maxLoweringDuringTracts(r, type) {
  let best = 0, found = false;
  for (const tr of r.tracts) {
    if (tr.type !== type) continue;
    found = true;
    const k0 = Math.max(0, tr.startLayer - 1);
    let mostNeg = 0;
    for (let k = tr.startLayer; k <= tr.endLayer; k++) {
      const dt = r.history.t[k] - r.history.t[k0];
      for (let i = 0; i < r.x.length; i++) {
        const d = r.paleoSurface[k][i] - r.paleoSurface[k0][i] + r.subsidence[i] * dt;
        if (d < mostNeg) mostNeg = d;
      }
    }
    best = Math.max(best, -mostNeg);
  }
  assert.ok(found, `run has at least one ${type} tract`);
  return best;
}

describe('14. ravinement mass conservation', () => {
  // ravinementDepth 0 switches wave erosion off, so shorefaceGradient has no effect there;
  // one rd = 0 case stands in for the gradient variants.
  const cases = [
    ['ravinementDepth 0', { ravinementDepth: 0 }],
    ['ravinementDepth 5', { ravinementDepth: 5 }],
    ['ravinementDepth 10 (default)', {}],
    ['ravinementDepth 20', { ravinementDepth: 20 }],
    ['ravinementDepth 10, shorefaceGradient 0.001', { shorefaceGradient: 0.001 }],
    ['ravinementDepth 10, shorefaceGradient 0.01', { shorefaceGradient: 0.01 }],
  ];
  for (const [name, params] of cases) {
    test(`massBalance.error < 1e-9 with ${name}`, T, () => {
      const r = sim(params);
      assert.ok(Number.isFinite(r.massBalance.error), 'error is finite');
      assert.ok(Math.abs(r.massBalance.error) < 1e-9,
        `|error| = ${Math.abs(r.massBalance.error)} (massIn=${r.massBalance.massIn}, stored=${r.massBalance.massStored})`);
    });
  }
});

describe('15. waves cut during transgressions', () => {
  test('max TST lowering with defaults exceeds ravinementDepth 0 by at least 3 m', T, () => {
    const on = maxLoweringDuringTracts(full(), 'TST');
    const off = maxLoweringDuringTracts(sim({ ravinementDepth: 0 }), 'TST');
    assert.ok(on - off >= 3, `TST lowering defaults ${on.toFixed(2)} m, ravinementDepth 0 ${off.toFixed(2)} m, difference ${(on - off).toFixed(2)} m`);
  });
});

describe('16. wave cut scales with wave base', () => {
  test('TST max lowering with ravinementDepth 5 is smaller than with ravinementDepth 10', T, () => {
    const d5 = maxLoweringDuringTracts(sim({ ravinementDepth: 5 }), 'TST');
    const d10 = maxLoweringDuringTracts(full(), 'TST');
    assert.ok(d5 < d10, `ravinementDepth 5: ${d5.toFixed(2)} m, ravinementDepth 10: ${d10.toFixed(2)} m`);
  });
});

describe('17. waves erode little during highstands', () => {
  test('max HST lowering with defaults is less than 2 m', T, () => {
    const hst = maxLoweringDuringTracts(full(), 'HST');
    assert.ok(hst < 2, `HST lowering ${hst.toFixed(2)} m`);
  });
});

describe('18. wave ravinement surfaces', () => {
  test('defaults give at least one WRS with >= 20 finite z values', T, () => {
    const wrs = full().surfaces.filter(s => s.type === 'WRS');
    assert.ok(wrs.length > 0, 'no WRS surfaces');
    const counts = wrs.map(s => Array.from(s.z).filter(Number.isFinite).length);
    assert.ok(counts.some(c => c >= 20), `finite z counts per WRS: ${counts.join(',')}`);
  });

  test('every finite WRS z lies between basement and present surface', T, () => {
    const r = full();
    let checked = 0;
    for (const s of r.surfaces.filter(q => q.type === 'WRS')) {
      for (let i = 0; i < s.z.length; i++) {
        const v = s.z[i];
        if (!Number.isFinite(v)) continue;
        checked++;
        assert.ok(v <= r.surface[i] + 1e-4, `WRS col ${i}: z ${v} above surface ${r.surface[i]}`);
        assert.ok(v >= r.basement[i] - 1e-4, `WRS col ${i}: z ${v} below basement ${r.basement[i]}`);
      }
    }
    assert.ok(checked > 0, 'some WRS z values are finite');
  });

  test('every finite WRS z lies at or below the top of its own TST deposits', T, () => {
    // a WRS removed by later erosion must not be drawn inside younger strata
    const r = full();
    let checked = 0;
    for (const s of r.surfaces.filter(q => q.type === 'WRS')) {
      const top = r.horizons[s.layer];
      for (let i = 0; i < s.z.length; i++) {
        const v = s.z[i];
        if (!Number.isFinite(v)) continue;
        checked++;
        assert.ok(v <= top[i] + 1e-3, `WRS col ${i}: z ${v} above top of its TST ${top[i]}`);
      }
    }
    assert.ok(checked > 0, 'some WRS z values are finite');
  });

  test('ravinementDepth 0 gives no WRS surfaces', T, () => {
    const r = sim({ ravinementDepth: 0 });
    assert.strictEqual(r.surfaces.filter(s => s.type === 'WRS').length, 0);
  });
});

describe('19. shoreline stays within the model domain when the basin fills', () => {
  test('every history.shorelineX lies within [0, length]', T, () => {
    const r = sim({ duration: FULL, seaLevelAmplitude: 0, seaLevelTrend: 0, subsidenceMax: 0, sedimentSupply: 30 });
    const L = r.params.length;
    for (let k = 0; k < r.history.shorelineX.length; k++) {
      const v = r.history.shorelineX[k];
      assert.ok(Number.isFinite(v), `layer ${k}: ${v}`);
      assert.ok(v >= 0 && v <= L, `layer ${k}: ${v} outside [0, ${L}]`);
    }
  });
});

describe('20. sand reaches beyond 40 km', () => {
  // Replaces the old 'phi <= 2.7 lag seaward of 40 km' test. Phi can no longer be <= 2.7
  // (the finest-grained fraction is 3 phi); the equivalent is sand carried past 40 km.
  test('some layer at x > 40 km with thickness > 0.01 m has sandFraction >= 0.5', T, () => {
    const r = full();
    let found = 0;
    for (let k = 0; k < r.sandFraction.length; k++) {
      for (let i = 0; i < r.x.length; i++) {
        if (r.x[i] > 40000 && r.thickness[k][i] > 0.01 && r.sandFraction[k][i] >= 0.5) found++;
      }
    }
    assert.ok(found > 0, 'no sand-dominated layer seaward of 40 km');
  });
});

// ---------------------------------------------------------------------------
// Eustasy with three cycles, initial shoreline, subsidence, edge fraction,
// mass balance with all cycles, and sequence count vs cycle period
// ---------------------------------------------------------------------------

function withParams(over) { return Object.assign({}, SS.DEFAULTS, over); }

describe('21. eustasy sums the trend and three sine cycles', () => {
  const P = withParams({
    seaLevelStart: 50, seaLevelTrend: 0.5,
    seaLevelAmplitude: 10, seaLevelPeriod: 120000, seaLevelPhase: 0,
    seaLevelAmplitude2: 8, seaLevelPeriod2: 400000, seaLevelPhase2: 0.5,
    seaLevelAmplitude3: 10, seaLevelPeriod3: 1200000, seaLevelPhase3: 1.0,
  });
  const handFormula = (t) => 50 + 0.5 * t / 1000
    + 10 * Math.sin(2 * Math.PI * t / 120000 + 0)
    + 8 * Math.sin(2 * Math.PI * t / 400000 + 0.5)
    + 10 * Math.sin(2 * Math.PI * t / 1200000 + 1.0);

  test('t=0 equals hand value 62.250114 m (start + 8 sin 0.5 + 10 sin 1)', () => {
    const v = SS.eustasy(P, 0);
    assert.ok(Math.abs(v - 62.250114157) < 1e-6, `eustasy(0) = ${v}`);
  });

  for (const t of [30000, 90000, 250000, 600000]) {
    test(`matches the hand formula at t=${t}`, () => {
      const v = SS.eustasy(P, t), e = handFormula(t);
      assert.ok(Math.abs(v - e) < 1e-9, `eustasy(${t}) = ${v}, hand = ${e}`);
    });
  }

  test('zero amplitude in cycles 2 and 3 reproduces the single-cycle formula exactly', () => {
    const one = withParams({
      seaLevelStart: 50, seaLevelTrend: 0.5,
      seaLevelAmplitude: 10, seaLevelPeriod: 120000, seaLevelPhase: 0.3,
      seaLevelAmplitude2: 0, seaLevelAmplitude3: 0,
    });
    for (const t of [0, 17000, 45000, 123456, 240000]) {
      const single = 50 + 0.5 * t / 1000 + 10 * Math.sin(2 * Math.PI * t / 120000 + 0.3);
      assert.strictEqual(SS.eustasy(one, t), single, `t=${t}`);
    }
  });
});

describe('22. initialShoreline sets the basement top when topElevation is null', () => {
  const slope = SS.DEFAULTS.basementSlope;
  for (const xi of [20000, 60000]) {
    test(`basement[0] = eustasy(0) + slope*initialShoreline - slope*x[0] for ${xi} m`, T, () => {
      const r = sim({ duration: SHORT, initialShoreline: xi });
      const top = SS.eustasy(r.params, 0) + slope * xi;
      const expected = top - slope * r.x[0];
      assert.ok(Math.abs(r.basement[0] - expected) <= 1e-6,
        `basement[0] = ${r.basement[0]}, expected ${expected}`);
    });
    test(`history.shorelineX[0] within 5 km of ${xi} m`, T, () => {
      const v = sim({ duration: SHORT, initialShoreline: xi }).history.shorelineX[0];
      assert.ok(Math.abs(v - xi) <= 5000, `shorelineX[0] = ${v}, initialShoreline = ${xi}`);
    });
  }
});

describe('23. explicit topElevation overrides initialShoreline', () => {
  test('basement[0] follows topElevation 60 m, not the 80 m implied by initialShoreline 60 km', T, () => {
    const r = run({ topElevation: 60, initialShoreline: 60000 });
    const expected = 60 - SS.DEFAULTS.basementSlope * r.x[0];
    assert.ok(Math.abs(r.basement[0] - expected) <= 1e-6,
      `basement[0] = ${r.basement[0]}, expected ${expected}`);
  });
});

describe('24. subsidenceRate', () => {
  const p = withParams({});
  const ratePerYr = p.subsidenceMax / 1000;

  test('equals subsidenceMax/1000 at subsidenceRefX (150 km)', () => {
    assert.ok(Math.abs(SS.subsidenceRate(p, 150000) - ratePerYr) < 1e-15,
      `rate(150 km) = ${SS.subsidenceRate(p, 150000)}, expected ${ratePerYr}`);
  });

  test('is zero at and landward of hingeX', () => {
    for (const x of [0, 15000, p.hingeX]) {
      assert.strictEqual(SS.subsidenceRate(p, x), 0, `rate(${x}) != 0`);
    }
  });

  test('keeps rising linearly beyond 150 km (300 km rate is 2.25 times the 150 km rate)', () => {
    const r150 = SS.subsidenceRate(p, 150000), r300 = SS.subsidenceRate(p, 300000);
    assert.ok(r300 > r150, `rate(300 km) ${r300} not above rate(150 km) ${r150}`);
    // (300-30)/(150-30) = 2.25
    assert.ok(Math.abs(r300 / r150 - 2.25) < 1e-9, `ratio = ${r300 / r150}`);
  });
});

describe('25. edgeFraction with defaults', () => {
  test('lies between 0 and 1', T, () => {
    const r = full();
    assert.ok(Number.isFinite(r.edgeFraction), `edgeFraction = ${r.edgeFraction}`);
    assert.ok(r.edgeFraction >= 0 && r.edgeFraction <= 1, `edgeFraction = ${r.edgeFraction}`);
  });

  test('is below 0.05 with defaults', T, () => {
    const r = full();
    assert.ok(r.edgeFraction < 0.05, `edgeFraction = ${r.edgeFraction}`);
  });
});

describe('26. mass conservation with all three cycles and with a falling trend', () => {
  test('massBalance.error < 1e-9 with cycles 10/120 kyr, 8/400 kyr, 10/1200 kyr', T, () => {
    const r = run({
      seaLevelAmplitude: 10, seaLevelPeriod: 120000,
      seaLevelAmplitude2: 8, seaLevelPeriod2: 400000,
      seaLevelAmplitude3: 10, seaLevelPeriod3: 1200000,
    });
    assert.ok(Math.abs(r.massBalance.error) < 1e-9,
      `|error| = ${Math.abs(r.massBalance.error)} (massIn=${r.massBalance.massIn}, stored=${r.massBalance.massStored})`);
  });

  test('massBalance.error < 1e-9 with seaLevelTrend -0.2 m/kyr', T, () => {
    const r = run({ seaLevelTrend: -0.2 });
    assert.ok(Math.abs(r.massBalance.error) < 1e-9,
      `|error| = ${Math.abs(r.massBalance.error)} (massIn=${r.massBalance.massIn}, stored=${r.massBalance.massStored})`);
  });
});

describe('27. shorter sea-level period gives more sequence boundaries', () => {
  test('SB count with seaLevelPeriod 60 kyr exceeds count with 120 kyr (duration 240 kyr)', T, () => {
    const slow = full(); // default period 120 kyr
    const fast = sim({ seaLevelPeriod: 60000 });
    const nSlow = slow.surfaces.filter(s => s.type === 'SB').length;
    const nFast = fast.surfaces.filter(s => s.type === 'SB').length;
    assert.ok(nFast > nSlow, `SB count: 60 kyr period ${nFast}, 120 kyr period ${nSlow}`);
  });
});

// ---------------------------------------------------------------------------
// Grain-size fractions: memory, offshore fining, basin retention, deep erosion
// ---------------------------------------------------------------------------

describe('28. grain-size memory', () => {
  test('supplySand 0 and floodSandiness 0: no layer has sandFraction > 1e-9', T, () => {
    const r = run({ supplySand: 0, floodSandiness: 0 });
    let max = 0;
    for (let k = 0; k < r.sandFraction.length; k++) {
      for (let i = 0; i < r.x.length; i++) {
        const s = r.sandFraction[k][i];
        if (Number.isFinite(s)) max = Math.max(max, s);
      }
    }
    assert.ok(max <= 1e-9, `max sandFraction ${max}`);
  });

  test('supplySand 1, supplySilt 0, floodSandiness 0: every non-empty layer has sandFraction > 0.999', T, () => {
    const r = run({ supplySand: 1, supplySilt: 0, floodSandiness: 0 });
    let n = 0;
    const bad = [];
    for (let k = 0; k < r.sandFraction.length; k++) {
      for (let i = 0; i < r.x.length; i++) {
        const s = r.sandFraction[k][i];
        if (!Number.isFinite(s)) continue; // NaN marks an empty layer
        n++;
        if (!(s > 0.999)) bad.push(`layer ${k}, col ${i}: ${s}`);
      }
    }
    assert.ok(n > 0, 'some non-empty layers');
    assert.strictEqual(bad.length, 0, `${bad.length} layers below 0.999, first: ${bad[0]}`);
  });
});

// Thickness-weighted sand share of preserved beds deposited at water depth in [lo, hi) m,
// where depth = eustasy[k] - paleoSurface[k][i] at the end of layer k.
function sandShareByDepth(r, lo, hi) {
  let th = 0, sand = 0;
  for (let k = 0; k < r.sandFraction.length; k++) {
    for (let i = 0; i < r.x.length; i++) {
      const t = r.thickness[k][i], s = r.sandFraction[k][i];
      if (!(t > 0) || !Number.isFinite(s)) continue;
      const d = r.history.eustasy[k] - r.paleoSurface[k][i];
      if (d >= lo && d < hi) { th += t; sand += t * s; }
    }
  }
  return { thickness: th, share: th > 0 ? sand / th : NaN };
}

describe('29. offshore fining from transport (defaults, 240 kyr)', () => {
  test('sand share deposited in 0-5 m water depth exceeds 30%', T, () => {
    const s = sandShareByDepth(full(), 0, 5);
    assert.ok(s.thickness > 0, 'some beds deposited in 0-5 m');
    assert.ok(s.share > 0.30, `sand share 0-5 m = ${(s.share * 100).toFixed(1)}%`);
  });

  test('sand share deposited below 40 m water depth is below 5%', T, () => {
    const s = sandShareByDepth(full(), 40, Infinity);
    assert.ok(s.thickness > 0, 'some beds deposited below 40 m');
    assert.ok(s.share < 0.05, `sand share >40 m = ${(s.share * 100).toFixed(2)}%`);
  });

  test('sand share in 0-15 m exceeds sand share in 15-40 m', T, () => {
    const shallow = sandShareByDepth(full(), 0, 15);
    const mid = sandShareByDepth(full(), 15, 40);
    assert.ok(shallow.share > mid.share,
      `0-15 m ${(shallow.share * 100).toFixed(1)}%, 15-40 m ${(mid.share * 100).toFixed(1)}%`);
  });
});

describe('30. fines stay in the basin', () => {
  test('thickness at x = 160 km (index 159) is below 10% of the maximum column thickness', T, () => {
    const r = full();
    let maxCol = 0;
    for (let i = 0; i < r.x.length; i++) maxCol = Math.max(maxCol, r.surface[i] - r.basement[i]);
    const th = r.surface[159] - r.basement[159];
    assert.ok(th < 0.1 * maxCol,
      `thickness at x=${r.x[159]} m is ${th.toFixed(3)} m, max column ${maxCol.toFixed(3)} m, ratio ${(th / maxCol).toFixed(4)}`);
  });
});

describe('31. little deep-water erosion (defaults, 240 kyr)', () => {
  test('events of more than 0.05 m net lowering in water deeper than 12 m number fewer than 100', T, () => {
    const r = full();
    let events = 0;
    for (let k = 1; k < r.nLayers; k++) {
      const dt = r.history.t[k] - r.history.t[k - 1];
      for (let i = 0; i < r.x.length; i++) {
        const d = r.paleoSurface[k][i] - r.paleoSurface[k - 1][i] + r.subsidence[i] * dt;
        const depth = r.history.eustasy[k] - r.paleoSurface[k][i];
        if (d < -0.05 && depth > 12) events++;
      }
    }
    assert.ok(events < 100, `deep-water erosion events: ${events}`);
  });
});

// ---------------------------------------------------------------------------
// Preset behaviour (engine defaults plus the preset parameters)
// ---------------------------------------------------------------------------

describe('32. preset behaviour', () => {
  test('forced regression: contains FSST and at least one SB', T, () => {
    const r = sim(PRESET.forced);
    const types = r.tracts.map(t => t.type);
    assert.ok(types.includes('FSST'), `tracts: ${types.join(',')}`);
    assert.ok(r.surfaces.some(s => s.type === 'SB'), 'no SB surface');
  });

  test('lowstand: an LST lasts >= 4 kyr; LST volume landward of shoreline - 5 km is <= 5%; FSST directly followed by LST', T, () => {
    const r = sim(PRESET.lst);
    const N = r.x.length, dx = r.dx;
    const lsts = r.tracts.map((t, m) => ({ t, m })).filter(o => o.t.type === 'LST');
    assert.ok(lsts.length > 0, 'no LST tracts');
    const durations = lsts.map(o => o.t.endTime - o.t.startTime);
    assert.ok(durations.some(d => d >= 4000), `LST durations (yr): ${durations.join(',')}`);
    for (const { t } of lsts) {
      const xsl = r.history.shorelineX[t.startLayer] - 5000;
      let vol = 0, landward = 0;
      for (let k = t.startLayer; k <= t.endLayer; k++) {
        for (let i = 0; i < N; i++) {
          const v = r.thickness[k][i] * dx;
          vol += v;
          if (r.x[i] < xsl) landward += v;
        }
      }
      const frac = vol > 0 ? landward / vol : 0;
      assert.ok(frac <= 0.05, `LST at ${t.startTime}-${t.endTime} yr: ${(frac * 100).toFixed(1)}% landward of ${xsl} m`);
    }
    const order = r.tracts.map(t => t.type);
    let found = false;
    for (let m = 0; m + 1 < order.length; m++) if (order[m] === 'FSST' && order[m + 1] === 'LST') found = true;
    assert.ok(found, `tract order: ${order.join(',')}`);
  });

  test('transgressive: TST layers are more than 50% of all layers', T, () => {
    const r = sim(PRESET.trans);
    const tst = r.tractByLayer.filter(t => t === 'TST').length;
    const share = tst / r.tractByLayer.length;
    assert.ok(share > 0.5, `TST layers ${tst} of ${r.tractByLayer.length} (${(share * 100).toFixed(1)}%)`);
  });

  test('normal regression: no FSST; shoreline ends seaward of its start', T, () => {
    const r = sim(PRESET.normal);
    const types = r.tracts.map(t => t.type);
    assert.ok(!types.includes('FSST'), `tracts: ${types.join(',')}`);
    const xs = r.history.shorelineX;
    assert.ok(xs[xs.length - 1] > xs[0], `last shoreline ${xs[xs.length - 1]} not seaward of first ${xs[0]}`);
  });

  test('tilt only: no FSST and no SB', T, () => {
    const r = sim(PRESET.tilt);
    const types = r.tracts.map(t => t.type);
    assert.ok(!types.includes('FSST'), `tracts: ${types.join(',')}`);
    assert.strictEqual(r.surfaces.filter(s => s.type === 'SB').length, 0, 'SB surfaces present');
  });

  test('reference (600 kyr): exactly 5 SB; eustasy at SB times rises then falls; edgeFraction < 0.02', T, () => {
    const r = sim(PRESET.reference);
    const sbs = r.surfaces.filter(s => s.type === 'SB');
    assert.strictEqual(sbs.length, 5, `SB count ${sbs.length}`);
    const eus = sbs.map(s => SS.eustasy(r.params, s.time));
    let m = 0;
    for (let j = 1; j < eus.length; j++) if (eus[j] > eus[m]) m = j;
    assert.ok(m >= 1 && m <= 3, `eustasy at SB times (m): ${eus.map(v => v.toFixed(2)).join(', ')}; max at index ${m}`);
    for (let j = 0; j < m; j++) assert.ok(eus[j] < eus[j + 1], `not rising before max at SB ${j + 1}`);
    for (let j = m; j + 1 < eus.length; j++) assert.ok(eus[j] > eus[j + 1], `not falling after max at SB ${j + 1}`);
    assert.ok(r.edgeFraction < 0.02, `edgeFraction = ${r.edgeFraction}`);
  });
});

describe('portable maths: identical runs in every JavaScript engine', () => {
  test('the engine calls no engine-dependent Math functions', () => {
    // Math.exp, sin, cos, pow, log... differ in the last bits between engines (Node vs Chrome),
    // which the model amplifies into visibly different runs. Use pexp/psin instead.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'seqstrat.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const bad = src.match(/Math\.(exp|expm1|log|log10|log2|log1p|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b|\*\*/g);
    assert.equal(bad, null, `non-portable calls: ${bad && bad.join(', ')}`);
  });

  test('pexp and psin match Math.exp and Math.sin closely', () => {
    const { pexp, psin } = SS.portableMath;
    assert.equal(pexp(0), 1);
    assert.equal(psin(0), 0);
    let s = 12345, e1 = 0, e2 = 0;
    for (let i = 0; i < 100000; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      const u = s / 4294967296, x = -700 + 1400 * u, y = -2000 + 4000 * u;
      e1 = Math.max(e1, Math.abs(pexp(x) - Math.exp(x)) / Math.exp(x));
      e2 = Math.max(e2, Math.abs(psin(y) - Math.sin(y)));
    }
    assert.ok(e1 < 1e-15, `pexp max relative error ${e1}`);
    assert.ok(e2 < 1e-15, `psin max absolute error ${e2}`);
  });
});
