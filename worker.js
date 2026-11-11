// Runs the model off the main thread so the page stays responsive during long runs.
importScripts('seqstrat.js');
self.onmessage = (e) => {
  const { id, params } = e.data;
  try {
    const t0 = Date.now();
    const r = self.SeqStrat.simulate(params, (f) => self.postMessage({ id, progress: f }));
    self.postMessage({ id, result: r, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
