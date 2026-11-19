# Sequence Stratigraphy Sandbox: notes for Claude Code

This is a browser-based teaching model for GY 306 W Sedimentology & Stratigraphy (University of South Alabama). Students use the live site at https://thefallingduck.github.io/sequencestrat-sandbox/ to build dip sections, pseudo-wells and Wheeler diagrams. The owner is the course instructor (a geologist, not a full-time developer). Explain geological consequences of a change in plain terms. Ask before changing anything students see.

## How it is deployed

- GitHub Pages serves the repo root of `main`. Anything merged into `main` goes live within a minute or two.
- **Never push straight to `main`.** Work on a branch, run the tests, open a pull request and describe what changes for students.
- There is no build step and no server. The page is plain HTML and JavaScript and must keep working when opened from GitHub Pages. No bundlers, frameworks or npm runtime dependencies.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole interface: controls, presets, section raster, pseudo-wells, sea-level chart, exercise mode |
| `seqstrat.js` | Model engine (UMD: `window.SeqStrat` in the browser, `module.exports` in Node). Exports `DEFAULTS`, `simulate`, `eustasy`, `subsidenceRate`. `snapshotFrames` (off by default) records snapshots for the animation without changing the run |
| `worker.js` | Web Worker that runs `simulate` off the main thread. `index.html` falls back to running on the page if workers are blocked |
| `wheeler.js` | Wheeler diagram drawing and hover (`drawWheeler`, `wheelerHitTest`, `wheelerClassify`) |
| `ratescale.js` | Preserved accumulation rate (mm/kyr) and its log colour scale (UMD: `window.RateScale` / `module.exports`), used by "Colour by: Accumulation rate" |
| `gifwriter.js` | Small animated-GIF encoder written for this project (no third-party code), used by "Export GIF" in the animation panel |
| `tests/engine.test.js` | Node test suite for the engine (92 tests) |
| `tests/ratescale.test.js` | Node tests for the rate calculation and colour scale (13 tests) |
| `tests/gifwriter.test.js` | Node tests for the GIF encoder, including an LZW round trip (8 tests) |
| `tests/ui_smoke.py` | Playwright browser smoke test (15 checks) |
| `tools/presets/` | Parameter-search scripts used to tune the presets |
| `docs/NOTES_next_steps.md` | The instructor's plan for future work. Read it before starting larger changes |

## The model in brief

- 2D dip section, 300 km long, 1 km cells. One record layer per 1,000 years.
- Depth-dependent nonlinear diffusion with explicit time steps (CFL limited).
- Sand, silt and clay are moved separately using the bed-surface composition (active layer 0.3 m). Eroded grains keep their size.
- Fall-stage river incision boosts fluvial diffusivity while relative sea level falls. Wave ravinement adds an equilibrium shoreface slope in the shoreface zone.
- Eustasy is a start level plus a trend plus three sine cycles. Subsidence is a tilt seaward of a hinge, with the rate given at 150 km.
- The far edge is open. Mass balance is tracked per fraction.
- Systems tracts (FSST, LST, TST, HST) and surfaces (BSFR, SB, TS, MFS, WRS) are classified automatically. This uses relative sea level at the shoreline and the shoreline trajectory.

## Things that must stay true

Treat these as requirements. If a change breaks one, stop and tell the instructor instead of loosening the test.

- Mass balance per grain fraction stays below 1e-9 (relative).
- The presets keep their teaching meaning. "Reference: five sequences" has five sequence boundaries. "Lowstand wedge" keeps the LST basinward, with at most about 5% of it updip. "Transgression" retrogrades. "Normal regression" progrades without a sequence boundary.
- Exercise mode hides every interpretation: surfaces, tract labels, the tract hover readout and the well tract strip.
- The Wheeler diagram shows only preserved sediment. A 3 kyr step counts as a gap below 0.2 mm/kyr preserved (`MIN_RATE_DEFAULT` in `wheeler.js`).
- Run time stays at about 5 s or less for the default run, and about 15 s or less for the reference preset, on an ordinary laptop.
- Colours use the muted sand-content scale (`SAND_STOPS` in `index.html`). The section and the Wheeler diagram must use the same scale.
- Sliders do not start a run. Only the Run button, presets and reset do.

## How to test

```bash
npm test                     # engine tests, about 2 minutes
python3 tests/ui_smoke.py    # browser smoke test; needs `pip install playwright` and `playwright install chromium`
```

- Run `npm test` before every pull request.
- Run the smoke test whenever `index.html`, `worker.js` or `wheeler.js` changes. It saves screenshots to `tests/shots/`; look at them.
- GitHub Actions runs `npm test` on every pull request (`.github/workflows/tests.yml`).
- Do not delete or weaken an existing test to make a change pass. Ask first.

## Working style the instructor wants

- Delegate simple, well-specified subtasks to lighter models where practical, then verify the result yourself.
- Prove that it works: run the tests and look at the rendered page before saying a change is done.
- Keep model changes and presentation changes in separate pull requests when possible.
- Write user-facing text (labels, help text, the "How the model works" panel) in plain language for undergraduates. Use the four-tract scheme terms (FSST, LST, TST, HST) consistently.
- While GY 306 W is running, only bug fixes go to `main`, so the site matches the lab handout. Model changes wait for a break, unless the instructor says otherwise. Each term's version is tagged (for example `fall-2026`).
