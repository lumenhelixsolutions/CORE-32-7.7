import { fetchData, syntheticOHLCV } from '../data/feed.js';
import { stateFromPrices } from '../core/math64.js';
import { solveBatch } from '../core/solver.js';
import { kProbeHarness, resetLadder } from '../core/rubic.js';

export async function runCorePipeline({ symbol = 'BTC', days = 90, useSynthetic = false } = {}) {
  const data = useSynthetic ? syntheticOHLCV(240, 100) : await fetchData(symbol, days);
  if (!data) throw new Error(`No data returned for ${symbol}`);
  const state = stateFromPrices(data.c);
  resetLadder(4);
  const probes = kProbeHarness(state, 8);
  const solve = solveBatch({ state: state.c, prices: data.c, batch: 80, maxSt: 32, tick: data.c.length });
  return { symbol: data.symbol || symbol, source: data._source, points: data.c.length, state: state.toJSON(), probes, solve };
}

export function runWorkerPipeline({ state, prices, batch = 100, maxSt = 64, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../core/solver.worker.js', import.meta.url), { type: 'module' });
    const id = crypto.randomUUID?.() || String(Date.now());
    worker.onmessage = (ev) => {
      if (ev.data?.id !== id) return;
      if (ev.data.progress != null) onProgress(ev.data.progress);
      if (ev.data.error) { worker.terminate(); reject(new Error(ev.data.error)); }
      if (ev.data.result) { worker.terminate(); resolve(ev.data.result); }
    };
    worker.onerror = (err) => { worker.terminate(); reject(err); };
    worker.postMessage({ id, state, prices, batch, maxSt });
  });
}
