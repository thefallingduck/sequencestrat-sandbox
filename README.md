# Sequence Stratigraphy Sandbox

A browser-based 2D model for teaching clastic sequence stratigraphy (GY 306 W, University of South Alabama).

**Live site:** https://thefallingduck.github.io/sequencestrat-sandbox/

Everything runs in the browser; there is no server code. Students adjust sea level, subsidence and sediment supply, run the model and interpret the dip section, pseudo-wells and Wheeler diagram.

- `index.html`, `seqstrat.js`, `worker.js`, `wheeler.js`: the site
- `tests/`: engine tests (`npm test`) and a browser smoke test (`python3 tests/ui_smoke.py`)
- `tools/presets/`: scripts used to tune the presets
- `docs/NOTES_next_steps.md`: plans for future versions
- `CLAUDE.md`: instructions for Claude Code sessions working on this repo

This is a simplified teaching model inspired by sedflux (Hutton & Syvitski, 2008), not sedflux itself.
