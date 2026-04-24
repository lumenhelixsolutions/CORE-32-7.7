import { S64, seedRng, rng, mq, stateFromPrices } from './math64.js';
import { mutateState, folEntropy, trialitySynergy } from './rubic.js';

export function evaluateState(state, prices = [], tick = 0) {
  const s = state instanceof S64 ? state : new S64(state.c || state);
  const priceMean = prices.length ? prices.reduce((a, b) => a + Number(b || 0), 0) / prices.length : 1;
  let tracking = 0;
  for (let i = 0; i < s.c.length; i += 1) {
    const target = prices.length ? Math.round(((Number(prices[i % prices.length]) || priceMean) / priceMean) * 256) : 0;
    tracking += Math.abs((s.c[i] % 512) - (target % 512));
  }
  const entropy = folEntropy(s);
  const synergy = trialitySynergy(tick, s).synergy;
  return s.energy() * 0.82 + tracking * 0.18 - synergy * 100;
}

export function solveBatch({ state, prices = [], batch = 100, maxSt = 64, convTh = 0.01, tick = 0 } = {}) {
  seedRng(prices);
  let bestState = state ? new S64(state) : stateFromPrices(prices);
  let bestEnergy = evaluateState(bestState, prices, tick);
  const ensemble = [];
  let conv = 0;
  for (let i = 0; i < batch; i += 1) {
    let candidate = bestState.copy();
    let energy = bestEnergy;
    for (let step = 0; step < maxSt; step += 1) {
      const temp = Math.max(0.05, 1 - step / maxSt);
      const next = mutateState(candidate, temp + 0.1);
      for (let k = 0; k < next.c.length; k += 8) next.c[k] = mq(next.c[k] + Math.round((rng() - 0.5) * 31));
      const e = evaluateState(next, prices, tick + step);
      if (e < energy || rng() < Math.exp((energy - e) / (10000 * temp))) {
        candidate = next;
        energy = e;
      }
    }
    if (energy < bestEnergy) {
      const rel = Math.abs(bestEnergy - energy) / Math.max(Math.abs(bestEnergy), 1);
      if (rel <= convTh) conv += 1;
      bestEnergy = energy;
      bestState = candidate;
    }
    if (ensemble.length < 16) ensemble.push({ i, energy, entropy: folEntropy(candidate) });
  }
  return { bestEnergy, bestState: bestState.toJSON(), convRate: conv / Math.max(batch, 1), ensemble };
}
