'use strict';
// Tests for sealevel_record.js (Berends et al. 2021 global sea level, resampled to 1 kyr)
// and for driving the engine with it through seaLevelCurve.
// Run: node --test tests/sealevel.test.js   (from the repo root)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = require(path.join(__dirname, '..', 'sealevel_record.js'));
const SS = require(path.join(__dirname, '..', 'seqstrat.js'));

test('record covers 3599 ka to present at 1 kyr steps', () => {
  assert.equal(R.values.length, 3600);
  assert.equal(R.startKaAgo, 3599);
  assert.equal(R.stepKa, 1);
  assert.ok(R.values.every(Number.isFinite));
});

test('spot values match the source file (central estimate, m relative to present)', () => {
  assert.equal(R.at(0), -3.32);       // last row of the supplement
  assert.equal(R.at(20), -95.41);     // Last Glacial Maximum
  assert.equal(R.at(125), -10.57);    // last interglacial
  assert.equal(R.at(3599), 0.56);
});

test('at() interpolates linearly and clamps outside the record', () => {
  assert.ok(Math.abs(R.at(20.5) - (R.at(20) + R.at(21)) / 2) < 1e-9);
  assert.equal(R.at(-5), R.at(0));
  assert.equal(R.at(9999), R.at(3599));
});

test('record range is glacial-interglacial scale', () => {
  const lo = Math.min(...R.values), hi = Math.max(...R.values);
  assert.ok(lo < -100 && lo > -130, 'lowest ' + lo);
  assert.ok(hi > 5 && hi < 20, 'highest ' + hi);
});

test('engine run forced by the record conserves mass and follows the curve', () => {
  const p = Object.assign({}, SS.DEFAULTS, { duration: 140000 });
  const S0 = 140, base = R.at(S0), c = [];
  for (let t = 0; t <= p.duration + 1000; t += 1000) c.push([t, p.seaLevelStart + R.at(S0 - t / 1000) - base]);
  p.seaLevelCurve = c;
  const r = SS.simulate(p);
  assert.ok(r.massBalance.error < 1e-9, 'mass balance ' + r.massBalance.error);
  // eustasy at the end = start level + (present - 140 ka) change in the record
  assert.ok(Math.abs(SS.eustasy(p, p.duration) - (p.seaLevelStart + R.at(0) - base)) < 1e-9);
  assert.ok(r.surfaces.some(s => s.type === 'SB'), 'the glacial fall should cut a sequence boundary');
});
