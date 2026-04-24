import { performance } from 'node:perf_hooks';
import { syntheticOHLCV } from '../src/js/data/feed.js';
import { stateFromPrices } from '../src/js/core/math64.js';
import { solveBatch } from '../src/js/core/solver.js';

const data = syntheticOHLCV(360, 100);
const state = stateFromPrices(data.c);
const t0 = performance.now();
const result = solveBatch({ state: state.c, prices: data.c, batch: 200, maxSt: 64 });
const elapsed = performance.now() - t0;
console.log(JSON.stringify({ elapsedMs: Math.round(elapsed), bestEnergy: result.bestEnergy, convRate: result.convRate, ensemble: result.ensemble.length }, null, 2));
