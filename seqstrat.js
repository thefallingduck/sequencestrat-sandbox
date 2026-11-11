/*
 * seqstrat.js — a small 2D (dip-section) clastic stratigraphic forward model
 * for teaching sequence stratigraphy. Inspired by sedflux (Hutton & Syvitski 2008)
 * but deliberately simple: depth-dependent nonlinear diffusion of a single
 * sediment volume, with grain size assigned from depositional environment.
 *
 * Works in the browser (window.SeqStrat) and in Node (module.exports).
 *
 * Units: x in m, z in m, time in years, flux in m^2/yr (per unit width).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeqStrat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    // domain
    length: 300000,          // m (long enough that the far edge rarely matters)
    dx: 1000,                // m
    initialShoreline: 40000, // m, where sea level meets the basement at t=0
    topElevation: null,      // m, basement at x=0; derived from initialShoreline when null
    basementSlope: 0.0005,   // m/m, initial basement gradient
    // time
    duration: 240000,        // yr
    recordInterval: 1000,    // yr, one stratigraphic layer per interval
    // eustasy: E(t) = seaLevelStart + seaLevelTrend*t + sum of three sine cycles
    //   short cycle  (3rd-order-like):  seaLevelAmplitude/Period/Phase
    //   medium cycle (2nd-order-like):  seaLevelAmplitude2/Period2/Phase2
    //   long cycle   (1st-order-like):  seaLevelAmplitude3/Period3/Phase3
    // (timescales are compressed relative to real cycle orders, for teaching)
    seaLevelStart: 50,       // m
    seaLevelTrend: 0,        // m/kyr
    seaLevelAmplitude: 10,   // m
    seaLevelPeriod: 120000,  // yr
    seaLevelPhase: 0,        // radians
    seaLevelAmplitude2: 0,   // m
    seaLevelPeriod2: 400000, // yr
    seaLevelPhase2: 0,       // radians
    seaLevelAmplitude3: 0,   // m
    seaLevelPeriod3: 1200000,// yr
    seaLevelPhase3: 0,       // radians
    seaLevelCurve: null,     // optional [[t_yr, z_m], ...] overrides the sine
    // tectonic subsidence: linear tilt seaward of a hinge
    subsidenceMax: 0.1,      // m/kyr at subsidenceRefX (rate keeps increasing linearly beyond)
    subsidenceRefX: 150000,  // m, where the rate equals subsidenceMax
    hingeX: 30000,           // m, no subsidence landward of this
    // sediment supply and transport
    sedimentSupply: 15,      // m^2/yr entering at x=0
    supplyVariability: 0.6,  // 0..1, layer-to-layer flood pulses (makes interbedding)
    kFluvial: 80000,         // m^2/yr, subaerial (coastal plain) diffusivity
    fallIncision: 2,         // x kFluvial while relative sea level falls (valley-confined rivers cut down)
    fallRateRef: 0.15,       // m/kyr RSL fall at which fallIncision reaches full strength
    incisionMemory: 15000,   // yr, how long valley confinement persists after the fall slows
    kMarine: 40000,          // m^2/yr, diffusivity at the shoreline
    kDeep: 300,              // m^2/yr, background deep-water diffusivity
    waveBaseDepth: 8,        // m, e-folding depth of marine diffusivity
    // wave ravinement ("wave-base razor"): within the shoreface (from the shoreline out to
    // where depth reaches ravinementDepth along shorefaceGradient) marine transport relaxes
    // the bed toward the equilibrium shoreface profile instead of toward flat. A drowned,
    // gentle coastal plain is too shallow for that profile and is cut down; at stillstand the
    // shoreface sits at equilibrium and transport is neutral. The zone moves with the shoreline.
    ravinementDepth: 10,     // m, fair-weather wave base (0 turns wave erosion off)
    shorefaceGradient: 0.003,// m/m, equilibrium shoreface gradient
    // grain size: three fractions (sand, silt, clay) are transported separately. Each bed
    // stores how much of each it contains, erosion removes grains in proportion to what is at
    // the bed surface, and eroded grains keep their size wherever they are redeposited.
    fractionPhi: [3, 6, 9],          // phi of sand, silt, clay
    supplySand: 0.3,                 // fraction of supply that is sand
    supplySilt: 0.35,                // fraction that is silt (clay is the rest)
    floodSandiness: 0.2,             // flood pulses shift the supply toward sand by this much
    fluvialMobility: [1, 1.15, 1.3], // x kFluvial for each fraction (fines move more easily)
    marineDepthScale: [4, 8, 8],     // m, how far offshore each fraction is carried (e-folding depth)
    deepMobility: [0, 150, 300],     // m^2/yr, background deep-water transport of each fraction
    compRefresh: 1,                  // steps between bed-composition updates (1 = every step; larger is faster but noisier)
    compUpwind: 1,                   // 1 = grains come from the upstream cell (stable); 0.5 = centred (oscillates)
    activeLayer: 0.3                 // m, bed-surface mixing depth (at most the top 3 layers) that sets what can move
  };

  function eustasy(p, t) {
    if (p.seaLevelCurve && p.seaLevelCurve.length > 1) {
      const c = p.seaLevelCurve;
      if (t <= c[0][0]) return c[0][1];
      for (let j = 1; j < c.length; j++) {
        if (t <= c[j][0]) {
          const f = (t - c[j - 1][0]) / (c[j][0] - c[j - 1][0]);
          return c[j - 1][1] + f * (c[j][1] - c[j - 1][1]);
        }
      }
      return c[c.length - 1][1];
    }
    const cyc = (A, P, ph) => (A && P > 0) ? A * Math.sin(2 * Math.PI * t / P + (ph || 0)) : 0;
    return p.seaLevelStart + p.seaLevelTrend * t / 1000 +
      cyc(p.seaLevelAmplitude, p.seaLevelPeriod, p.seaLevelPhase) +
      cyc(p.seaLevelAmplitude2, p.seaLevelPeriod2, p.seaLevelPhase2) +
      cyc(p.seaLevelAmplitude3, p.seaLevelPeriod3, p.seaLevelPhase3);
  }

  function subsidenceRate(p, x) { // m/yr, positive = down
    if (x <= p.hingeX) return 0;
    const ref = p.subsidenceRefX != null ? p.subsidenceRefX : p.length;
    const f = (x - p.hingeX) / Math.max(1, ref - p.hingeX);
    return f * p.subsidenceMax / 1000;
  }

  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function shorelineIndex(h, sl) {
    for (let i = 0; i < h.length; i++) if (h[i] < sl) return i;
    return h.length - 1;
  }

  function shorelineX(h, sl, x, dx) {
    const si = shorelineIndex(h, sl);
    if (si === h.length - 1 && h[si] >= sl) return x[si] + 0.5 * dx; // no sea left in the profile
    if (si === 0) return 0;
    if (h[si - 1] <= h[si]) return x[si];
    const f = Math.min(1, Math.max(0, (h[si - 1] - sl) / (h[si - 1] - h[si])));
    return x[si - 1] + f * dx;
  }

  function simulate(userParams, onProgress) {
    const p = Object.assign({}, DEFAULTS, userParams || {});
    const N = Math.round(p.length / p.dx);
    // basement top: from an explicit initial shoreline unless topElevation is given
    const top = (p.topElevation != null) ? p.topElevation
      : eustasy(p, 0) + p.basementSlope * (p.initialShoreline != null ? p.initialShoreline : 40000);
    const dx = p.length / N;
    const x = new Float64Array(N);
    const base = new Float64Array(N);   // basement elevation
    const h = new Float64Array(N);      // surface elevation
    const sub = new Float64Array(N);    // subsidence rate m/yr
    for (let i = 0; i < N; i++) {
      x[i] = (i + 0.5) * dx;
      base[i] = top - p.basementSlope * x[i];
      h[i] = base[i];
      sub[i] = subsidenceRate(p, x[i]);
    }

    const nRec = Math.max(1, Math.round(p.duration / p.recordInterval));
    const recDt = p.duration / nRec;
    const NF = 3;
    const phiJ = p.fractionPhi;
    const thickJ = [];          // thickJ[k][j][i]: thickness of fraction j in layer k
    const colJ = [new Float64Array(N), new Float64Array(N), new Float64Array(N)]; // column totals
    const topK = new Int32Array(N).fill(-1); // highest non-empty layer per column

    const Kj = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
    const qj = [new Float64Array(N + 1), new Float64Array(N + 1), new Float64Array(N + 1)];
    const Fs = [new Float64Array(N), new Float64Array(N), new Float64Array(N)]; // surface composition
    const scale = new Float64Array(N);
    const eroded = new Float64Array(N); // cumulative erosion per column
    let stepsTotal = 0;
    let boostState = 1;
    const paleoSurface = [];
    const waveCut = [];      // waveCut[k][i]: wave erosion during layer k (m)
    const cutBottom = [];    // cutBottom[k][i]: thinnest sediment column reached by wave cutting in layer k
    const massInJ = [0, 0, 0], massOutJ = [0, 0, 0];
    let massIn = 0, massOut = 0;

    const hist = { t: [], eustasy: [], shorelineX: [], shorelineZ: [], rslRate: [] };
    let t = 0;
    const mobF = p.fluvialMobility, dsc = p.marineDepthScale, kdp = p.deepMobility;
    const kMarineMax = p.kMarine + Math.max(kdp[0], kdp[1], kdp[2]);
    // fast path when depth scales are integer fractions of the clay scale
    const r0 = dsc[2] / dsc[0], r1 = dsc[2] / dsc[1];
    const pw = (Number.isInteger(r0) && Number.isInteger(r1)) ? [r0, r1] : null;

    // composition of the top `activeLayer` metres of a column
    function surfaceComp(i, k) {
      let need = p.activeLayer, a0 = 0, a1 = 0, a2 = 0;
      let used = 0;
      for (let kk = topK[i]; kk >= 0 && need > 1e-12 && used < 3; kk--) {
        const L = thickJ[kk];
        const tot = L[0][i] + L[1][i] + L[2][i];
        if (tot <= 0) continue;
        used++;
        const f = Math.min(1, need / tot);
        a0 += f * L[0][i]; a1 += f * L[1][i]; a2 += f * L[2][i];
        need -= f * tot;
      }
      const s = a0 + a1 + a2;
      if (s > 0) { Fs[0][i] = a0 / s; Fs[1][i] = a1 / s; Fs[2][i] = a2 / s; }
      else { Fs[0][i] = 0; Fs[1][i] = 0; Fs[2][i] = 0; }
    }
    function erodeJ(i, j, a, k) { // remove `a` of fraction j from the top of column i
      let rem = a;
      for (let kk = topK[i]; kk >= 0 && rem > 1e-14; kk--) {
        const L = thickJ[kk][j];
        if (L[i] <= 0) continue;
        const take = Math.min(L[i], rem);
        L[i] -= take; rem -= take;
        if (L[i] < 1e-14) L[i] = 0;
      }
      colJ[j][i] = Math.max(0, colJ[j][i] - (a - rem));
      while (topK[i] >= 0) {
        const L = thickJ[topK[i]];
        if (L[0][i] + L[1][i] + L[2][i] > 1e-12) break;
        topK[i]--;
      }
      return a - rem;
    }

    for (let k = 0; k < nRec; k++) {
      const layer = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
      thickJ.push(layer);
      const WC = new Float64Array(N), CB = new Float64Array(N).fill(Infinity);
      waveCut.push(WC); cutBottom.push(CB);
      // flood pulse for this interval: more sediment, and sandier
      const pulse = p.supplyVariability * (2 * hash(k, 9173) - 1);
      const supply = p.sedimentSupply * (1 + pulse);
      let fs = Math.min(0.95, Math.max(0, p.supplySand + p.floodSandiness * pulse));
      let fsi = Math.max(0, p.supplySilt), fc = Math.max(0, 1 - p.supplySand - p.supplySilt);
      const rest = (fsi + fc) > 0 ? (1 - fs) / (fsi + fc) : 0;
      const supJ = [supply * fs, supply * fsi * rest, supply * fc * rest];
      // fall-stage incision: rivers erode harder while relative sea level falls at the shoreline
      const xsNow = x[shorelineIndex(h, eustasy(p, t))];
      const fallRate = -((eustasy(p, t + recDt) - eustasy(p, t)) / recDt + subsidenceRate(p, xsNow)) * 1000;
      const target = 1 + (Math.max(1, p.fallIncision) - 1) * Math.min(1, Math.max(0, fallRate / p.fallRateRef));
      boostState = target >= boostState ? target
        : target + (boostState - target) * Math.exp(-recDt / Math.max(1, p.incisionMemory));
      const boost = boostState;
      const kMax = Math.max(p.kFluvial * boost * Math.max(mobF[0], mobF[1], mobF[2]), kMarineMax);
      const stepsPerRec = Math.max(1, Math.ceil(recDt / (0.48 * dx * dx / kMax)));
      const dt = recDt / stepsPerRec;
      stepsTotal += stepsPerRec;
      for (let s = 0; s < stepsPerRec; s++) {
        const sl = eustasy(p, t + 0.5 * dt);
        const refreshComp = (s % Math.max(1, p.compRefresh || 4)) === 0; // bed composition changes slowly
        for (let i = 0; i < N; i++) {
          const wd = sl - h[i];
          if (wd <= 0) {
            const kf = p.kFluvial * boost;
            Kj[0][i] = kf * mobF[0]; Kj[1][i] = kf * mobF[1]; Kj[2][i] = kf * mobF[2];
          } else if (pw) {
            // one exponential per cell; the other fractions by integer powers
            const b = Math.exp(-wd / dsc[2]);
            let e1 = 1; for (let m = 0; m < pw[1]; m++) e1 *= b;
            let e0 = 1; for (let m = 0; m < pw[0]; m++) e0 *= b;
            Kj[0][i] = p.kMarine * e0 + kdp[0]; Kj[1][i] = p.kMarine * e1 + kdp[1]; Kj[2][i] = p.kMarine * b + kdp[2];
          } else {
            for (let j = 0; j < NF; j++) Kj[j][i] = p.kMarine * Math.exp(-wd / dsc[j]) + kdp[j];
          }
          if (topK[i] < 0) { Fs[0][i] = 0; Fs[1][i] = 0; Fs[2][i] = 0; }
          else if (refreshComp || (Fs[0][i] + Fs[1][i] + Fs[2][i]) === 0) surfaceComp(i, k);
        }
        // shoreface zone for wave ravinement
        const waves = p.ravinementDepth > 0;
        const G = Math.max(1e-5, p.shorefaceGradient);
        let xs = 0, sfW = 0;
        if (waves) { xs = shorelineX(h, sl, x, dx); sfW = p.ravinementDepth / G; }
        for (let f = 1; f < N; f++) {
          let slope = (h[f] - h[f - 1]) / dx;
          if (waves) {
            const y = f * dx - xs;
            if (y > 0 && y < sfW && h[f - 1] < sl) slope += G; // relax toward equilibrium profile
          }
          const donor = slope < 0 ? f - 1 : f; // upwind cell supplies the grains
          const other = donor === f ? f - 1 : f;
          const wU = p.compUpwind != null ? p.compUpwind : 1; // 1 = fully upwind, 0.5 = centred
          for (let j = 0; j < NF; j++) {
            const F = wU * Fs[j][donor] + (1 - wU) * Fs[j][other];
            qj[j][f] = -0.5 * (Kj[j][f - 1] + Kj[j][f]) * slope * F;
          }
        }
        for (let j = 0; j < NF; j++) {
          const q = qj[j];
          q[0] = supJ[j];
          q[N] = Math.max(0, q[N - 1]); // open far edge
          // limit outgoing flux of each fraction to what the column holds
          for (let i = 0; i < N; i++) {
            const out = Math.max(q[i + 1], 0) + Math.max(-q[i], 0);
            const need = out * dt / dx, avail = colJ[j][i];
            scale[i] = need > avail ? (avail > 0 ? avail / need : 0) : 1;
          }
          for (let f = 1; f < N; f++) q[f] *= q[f] > 0 ? scale[f - 1] : scale[f];
          q[N] *= scale[N - 1];
          massInJ[j] += q[0] * dt; massOutJ[j] += q[N] * dt;
        }
        for (let i = 0; i < N; i++) {
          let net = 0;
          for (let j = 0; j < NF; j++) {
            const d = -(qj[j][i + 1] - qj[j][i]) * dt / dx;
            if (d > 0) {
              layer[j][i] += d; colJ[j][i] += d; topK[i] = k; net += d;
            } else if (d < 0) {
              net -= erodeJ(i, j, -d, k);
            }
          }
          h[i] += net;
          if (net < 0) {
            eroded[i] -= net;
            const y = x[i] - xs;
            if (waves && y > 0 && y < sfW && h[i] < sl) {
              WC[i] -= net;
              CB[i] = Math.min(CB[i], h[i] - base[i]);
            }
          }
        }
        // subsidence lowers basement and surface together
        for (let i = 0; i < N; i++) { const d = sub[i] * dt; base[i] -= d; h[i] -= d; }
        t += dt;
      }
      const sl = eustasy(p, t);
      const xsl = shorelineX(h, sl, x, dx);
      hist.t.push(t);
      hist.eustasy.push(sl);
      hist.shorelineX.push(xsl);
      hist.shorelineZ.push(sl);
      paleoSurface.push(Float32Array.from(h)); // surface as it was at this time
      if (onProgress && k % 20 === 0) onProgress(k / nRec);
    }
    massIn = massInJ[0] + massInJ[1] + massInJ[2];
    massOut = massOutJ[0] + massOutJ[1] + massOutJ[2];

    // layer thickness and mean grain size from the fractions
    // residues below 1e-12 m left by erosion round-off count as empty (keeps thickness, phi
    // and sandFraction consistent; the dropped volume is ~1e-14 of the total)
    const thick = thickJ.map(L => { const T = new Float64Array(N); for (let i = 0; i < N; i++) { const s = L[0][i] + L[1][i] + L[2][i]; T[i] = s > 1e-12 ? s : 0; } return T; });
    const phi = thickJ.map((L, k) => {
      const out = new Float32Array(N), T = thick[k];
      for (let i = 0; i < N; i++) out[i] = T[i] > 1e-12 ? (L[0][i] * phiJ[0] + L[1][i] * phiJ[1] + L[2][i] * phiJ[2]) / T[i] : NaN;
      return out;
    });
    const sandFraction = thickJ.map((L, k) => {
      const out = new Float32Array(N), T = thick[k];
      for (let i = 0; i < N; i++) out[i] = T[i] > 1e-12 ? L[0][i] / T[i] : NaN;
      return out;
    });
    const thickF = thick.map(T => Float32Array.from(T));

    // horizons: horizon[k][i] = elevation of top of layer k (present-day geometry)
    const horizons = [];
    const cum = Float64Array.from(base);
    for (let k = 0; k < nRec; k++) {
      for (let i = 0; i < N; i++) cum[i] += thick[k][i];
      horizons.push(Float32Array.from(cum));
    }

    // relative sea level rate at the shoreline (eustasy + subsidence), m/kyr
    for (let k = 0; k < nRec; k++) {
      const t0 = k === 0 ? 0 : hist.t[k - 1], t1 = hist.t[k];
      const de = (eustasy(p, t1) - eustasy(p, t0)) / (t1 - t0) * 1000;
      hist.rslRate.push(de + subsidenceRate(p, hist.shorelineX[k]) * 1000);
    }

    const seq = interpret(p, hist, horizons, x, dx, base, { waveCut, cutBottom, surface: h });
    let massStored = 0;
    for (let i = 0; i < N; i++) massStored += (h[i] - base[i]) * dx;

    return {
      params: p, x: Float32Array.from(x), dx, nLayers: nRec,
      basement: Float32Array.from(base), surface: Float32Array.from(h),
      seaLevel: eustasy(p, p.duration),
      thickness: thickF, phi, sandFraction, horizons, paleoSurface, subsidence: Float32Array.from(sub),
      history: hist,
      tracts: seq.tracts, surfaces: seq.surfaces, tractByLayer: seq.tractByLayer,
      massBalance: { massIn, massOut, massStored, error: (massStored + massOut - massIn) / Math.max(1, massIn),
        byFraction: [0, 1, 2].map(j => { let st = 0; for (let i = 0; i < N; i++) st += colJ[j][i] * dx;
          return { massIn: massInJ[j], massOut: massOutJ[j], massStored: st, error: (st + massOutJ[j] - massInJ[j]) / Math.max(1, massInJ[j]) }; }) },
      exportedFraction: massIn > 0 ? massOut / massIn : 0,
      // share of stored sediment in the outermost 10% of the basin (edge-effect warning)
      edgeFraction: (() => { let e = 0, a = 0; for (let i = 0; i < N; i++) { const th = h[i] - base[i]; a += th; if (x[i] >= 0.9 * p.length) e += th; } return a > 0 ? e / a : 0; })(),
      eroded: Float32Array.from(eroded), stepsTotal
    };
  }

  /*
   * Sequence-stratigraphic interpretation from relative sea level and shoreline
   * trajectory (Hunt & Tucker / Catuneanu-style four systems tracts):
   *   RSL falling                                  -> FSST (forced regression)
   *   RSL rising, shoreline landward                -> TST (transgression)
   *   RSL rising, shoreline seaward, after FSST     -> LST (lowstand normal regression)
   *   RSL rising, shoreline seaward, after TST      -> HST (highstand normal regression)
   * Bounding surfaces:
   *   onset of fall -> BSFR; end of fall -> SB (subaerial unconformity + correlative
   *   conformity); max regression -> TS (transgressive surface); max transgression -> MFS.
   */
  function interpret(p, hist, horizons, x, dx, base, wave) {
    const n = hist.t.length;
    // smooth shoreline position to suppress cell-scale jitter
    const w = Math.max(2, Math.round(5000 / p.recordInterval));
    const xs = hist.shorelineX.map((_, k) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, k - w); j <= Math.min(n - 1, k + w); j++) { s += hist.shorelineX[j]; c++; }
      return s / c;
    });
    const raw = [];
    for (let k = 0; k < n; k++) {
      const dxs = xs[Math.min(n - 1, k + 1)] - xs[Math.max(0, k - 1)];
      if (hist.rslRate[k] < 0) raw.push('FSST');
      else raw.push(dxs < -0.05 * dx ? 'T' : 'R');
    }
    // remove very short runs (hysteresis)
    const minRun = Math.max(2, Math.round(3000 / p.recordInterval));
    const cls = raw.slice();
    let i = 0;
    while (i < n) {
      let j = i; while (j < n && cls[j] === cls[i]) j++;
      if (j - i < minRun && i > 0) for (let m = i; m < j; m++) cls[m] = cls[i - 1];
      i = j;
    }
    // name regressive tracts by context
    const tract = [];
    let prev = null;
    for (let k = 0; k < n; k++) {
      let c = cls[k];
      if (c === 'T') c = 'TST';
      else if (c === 'R') c = (prev === 'FSST' || prev === 'LST') ? 'LST' : 'HST';
      tract.push(c); prev = c;
    }

    // tract intervals
    const tracts = [];
    let s0 = 0;
    for (let k = 1; k <= n; k++) {
      if (k === n || tract[k] !== tract[s0]) {
        tracts.push({ type: tract[s0], startLayer: s0, endLayer: k - 1,
          startTime: s0 === 0 ? 0 : hist.t[s0 - 1], endTime: hist.t[k - 1] });
        s0 = k;
      }
    }

    // surfaces at transitions; horizon index = last layer of the earlier tract
    const surfaces = [];
    const N = x.length;
    function addSurface(type, kLast, seawardOnly) {
      const z = new Float32Array(N);
      const xsl = hist.shorelineX[Math.max(0, kLast)];
      const hz = kLast >= 0 ? horizons[kLast] : null;
      for (let ii = 0; ii < N; ii++) {
        z[ii] = (!hz || (seawardOnly && x[ii] < xsl - 2 * dx)) ? NaN : hz[ii];
      }
      surfaces.push({ type, layer: kLast, time: kLast >= 0 ? hist.t[kLast] : 0, shorelineX: xsl, z });
    }
    for (let m = 1; m < tracts.length; m++) {
      const a = tracts[m - 1].type, b = tracts[m].type, k = tracts[m - 1].endLayer;
      if (b === 'FSST') addSurface('BSFR', k, true);
      if (a === 'FSST') addSurface('SB', k, false);
      if (b === 'TST' && a !== 'TST') addSurface('TS', k, true);
      if (a === 'TST' && b !== 'TST') addSurface('MFS', k, false);
    }

    // wave ravinement surface (WRS): diachronous base of wave cutting during each
    // transgression, drawn where waves removed at least minCut of sediment
    if (wave && p.ravinementDepth > 0) {
      const minCut = 0.3;
      for (const tr of tracts) {
        if (tr.type !== 'TST') continue;
        const z = new Float32Array(N).fill(NaN);
        let any = false;
        for (let ii = 0; ii < N; ii++) {
          let tot = 0, kl = -1;
          for (let kk = tr.startLayer; kk <= tr.endLayer; kk++) {
            const c = wave.waveCut[kk][ii];
            if (c > 0) { tot += c; kl = kk; }
          }
          if (tot >= minCut && isFinite(wave.cutBottom[kl][ii])) {
            z[ii] = Math.min(base[ii] + wave.cutBottom[kl][ii], wave.surface[ii]);
            any = true;
          }
        }
        if (any) surfaces.push({ type: 'WRS', layer: tr.endLayer, time: tr.startTime,
          endTime: tr.endTime, shorelineX: hist.shorelineX[tr.startLayer], z });
      }
    }

    // label anchor for each tract: column of max thickness, mid-height
    for (const tr of tracts) {
      let best = -1, bi = 0;
      const below = tr.startLayer > 0 ? horizons[tr.startLayer - 1] : null;
      const top = horizons[tr.endLayer];
      for (let ii = 0; ii < N; ii++) {
        const b0 = below ? below[ii] : base[ii];
        const th = top[ii] - b0;
        if (th > best) { best = th; bi = ii; }
      }
      tr.maxThickness = best;
      tr.labelX = x[bi];
      tr.labelZ = top[bi] - best / 2;
    }
    return { tracts, surfaces, tractByLayer: tract };
  }
  return { DEFAULTS, simulate, eustasy, subsidenceRate };
});
