# Sequence Stratigraphy Sandbox: notes for next time

Written 2026-11-10, end of the first build session. Revisit before GY306 W prep (summer 2027).

## Where things stand

- **Live site (GitHub Pages):** https://thefallingduck.github.io/sequencestrat-sandbox/ (repo `thefallingduck/sequencestrat-sandbox`; `main` deploys automatically). The older Claude artifact copy (https://claude.ai/artifact/UiaHbz4FnXXgPoT1x3FteG) is retired.
- **Lab handout + instructor key (Claude doc):** https://claude.ai/artifact/D86yhdDydqVQsKP8R1Hhrj ("GY 306 W Sequence Stratigraphy Sandbox Lab"; tabs: Student handout, Instructor key).
- **Model (`seqstrat.js`):** 2D dip section, 300 km basin with open far edge, 1 km cells, 1 kyr layers.
  - Sand/silt/clay transported separately (grain-size memory); diffusion fast on coastal plain and shoreface, decaying with depth.
  - Eustasy = trend + three sine cycles (short/medium/long, time-compressed "orders"); subsidence = tilt seaward of a hinge, rate set at 150 km.
  - Fall-stage river incision (default 2×), wave ravinement toward an equilibrium shoreface profile (wave base 10 m), explicit initial shoreline.
  - Systems tracts and SB/BSFR/TS/MFS/WRS picked automatically from relative sea level at the shoreline and shoreline trajectory (four-tract scheme).
- **Interface:** sand-content colouring with along-bedding smoothing (inverse-distance² in column × layer space, 1 layer = 4 columns), two pseudo-wells (datum = top of basement), Wheeler diagram (preserved record only), sea-level/shoreline chart, exercise mode (hides surfaces, tract labels, tract hover and well tract strip), presets incl. "Reference: five sequences" and "Lowstand wedge". Model runs in a Web Worker; Run button (sliders do not auto-run).
- **Tests:** `npm test` (83 tests, ~2 min, all passing at 2026-11-10). Browser smoke test: `python3 tests/ui_smoke.py` (9 checks; needs Python Playwright + Chrome).

## Open issue: Wheeler diagram is too continuous

Textbook Wheeler diagrams show discrete "slugs" of sediment separated by lacunae. Ours shows continuous diagonal ribbons.

**What I measured (default run, 0–170 km, 3 kyr steps):**

| Preserved accumulation rate | Share of diagram cells |
| --- | --- |
| Nothing preserved | 41% |
| < 0.2 mm/kyr | ~8% |
| 0.2–3 mm/kyr | ~14% |
| 3–30 mm/kyr | ~15% |
| > 30 mm/kyr | ~22% |

Median of non-zero cells ≈ 9 mm/kyr. The distribution is one broad continuous hump (0.1 to 1,000 mm/kyr) with no natural break, so a cutoff alone does not create slugs. Cutoff renders at 0.2, 3, 10, 30 mm/kyr: higher cutoffs leave the depocentre, but as a continuous ribbon that tracks the shoreline.

Current setting: a 3 kyr step is a gap if < 0.2 mm/kyr is preserved (`MIN_RATE_DEFAULT` in `wheeler.js`; `opts.minRate` overrides).

**Why it is continuous (model, not display):**
1. Diffusion delivers a little sediment everywhere every step: almost no true pauses within a systems tract.
2. Sine-wave sea level moves the shoreline smoothly; it never jumps or stalls abruptly.
3. No autogenic switching (delta-lobe or channel avulsion), which in real basins turns deposition on and off at a given place.

## Directions: make it look more like textbook Wheeler diagrams

Do these roughly in order; check each against the acceptance tests below before moving on.

1. **Display first (cheap).**
   - Add a Wheeler "cutoff" slider (0.2 to 30 mm/kyr, default ~10) and make the legend text read the current value (it is hard-coded to 0.2 now).
   - Option to colour preserved cells by systems tract instead of sand content (the common textbook style); hide in exercise mode.
   - Option for coarser time steps (e.g. 10 kyr) so short flickers merge.

2. **Step the shoreline: stepped sea-level curves.**
   - Add a "curve shape" control for the short cycle: sine (current), sawtooth (slow rise, rapid fall: glacio-eustatic style), and staircase (stillstand, then a quick fall or rise).
   - Implementation idea: replace `sin(θ)` with a shaped periodic function `f(θ)` in `eustasy()`; keep amplitude/period/phase. A staircase can be a smoothed step: `A * tanh(k * sin(θ)) / tanh(k)` with `k` = sharpness (k → 0 gives a sine, k ≈ 5 gives near-steps).
   - Expected effect: stillstands build discrete wedges; quick falls downstep the shoreline (detached FSST bodies); quick rises leave starved gaps.

3. **Step the shoreline: autogenic lobe switching.**
   - In 2D, a proxy for lobe avulsion: every N kyr (random, mean ~10–30 kyr) switch the river's delivery between "on this section" and "mostly off this section" (supply × 0.1–0.2), so the section alternates between active progradation and starvation/ravinement.
   - Make it a "Lobe switching" slider (off by default) with its own seed so runs are repeatable.
   - Expected effect: discrete sand bodies (parasequence-like) and real hiatuses in the Wheeler diagram even under smooth sea level.

4. **Reduce "a little everywhere" deposition.**
   - Threshold transport: let marine diffusion act only where the bed slope or wave stress exceeds a critical value, or make the deep-water background transport (`deepMobility`) zero below a minimum water depth gradient.
   - Gravity-flow bypass: during falls/lowstands, route a share of sand down the slope to the toe as discrete lobes (also fixes the missing basin-floor sand).

5. **Re-tune presets** after any model change (re-use `presets/` scripts; criteria are written in the scripts and in the conversation summary below).

### Acceptance tests to add

- **Slug metric:** per column, count the number of separate preserved time intervals in the Wheeler diagram (runs of preserved steps separated by ≥ 1 gap step). Target: median ≥ 3 per column across the shelf for the reference preset, versus ~1–2 now.
- **Gap fraction** stays sensible (30–60% of cells).
- Mass balance per fraction < 1e-9; existing 83 engine tests still pass; presets still meet their geometric criteria (LST ≤ 5% updip, five SBs in the reference, etc.).
- Run time stays ≲ 5 s default, ≲ 15 s reference.

## Other follow-ups noted during the build

- **Instructor key needs updating:** Part 3 gap times in the key were computed with the old cutoff (1 cm per step). With the 0.2 mm/kyr cutoff, gaps ≥ 6 kyr are:
  - Well A (90.5 km): 63–87, 99–117, 174–198 ka.
  - Well B (120.5 km): 156–162, 216–231 ka (shorter gaps around 192–195 ka).
  Gap times shift by several kyr if a well is 1 km off.
- Valleys vs interfluves cannot be separated in 2D; post-fall coastal-plain sheet is partly removed by ravinement but not everywhere.
- Ravinement lag and condensed sections are thinner than one 1 kyr layer, so they are averaged away.
- Time scrubber (show the section at any past time): the engine already stores `paleoSurface[k]`; needs the UI.
- Vertical exaggeration (~500×) should be labelled on the section.
- LSTs in some settings are near-stillstands (shoreline barely moves); classification can be borderline.
- Student feedback from Part 4 of the lab should drive the priority list.

## Files

See `README.md` and `CLAUDE.md` in the repo root.
