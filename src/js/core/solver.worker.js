const DIM = 64, Q = 3329;
const mq = (a) => ((a % Q) + Q) % Q;
const toSigned = (v) => v > (Q >> 1) ? v - Q : v;
let _rngState = 0;
function seedRng(prices = []) {
  let h = 0x811c9dc5;
  for (let i = 0; i < prices.length; i += 1) {
    const p = Math.round(Number(prices[i] || 0) * 100);
    h ^= p & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (p >> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (p >> 16) & 0xff; h = Math.imul(h, 0x01000193);
  }
  _rngState = h >>> 0;
}
function rng() {
  _rngState |= 0;
  _rngState = (_rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function normalize(c) { return Int32Array.from(Array.from(c).slice(0, DIM).concat(Array(DIM).fill(0)).slice(0, DIM).map(mq)); }
function energy(c) { let e = 0; for (let i = 0; i < DIM; i += 1) { const v = toSigned(c[i]); e += v * v; } return e / DIM; }
function entropy(c) { const bins = new Array(16).fill(0); for (const v of c) bins[Math.abs(toSigned(v)) % 16] += 1; const n = c.length || 1; return -bins.reduce((h, x) => x ? h + (x / n) * Math.log2(x / n) : h, 0); }
function mutate(c, intensity) { const n = new Int32Array(c); const edits = Math.max(1, Math.round(4 * intensity)); for (let k = 0; k < edits; k += 1) { const i = Math.floor(rng() * DIM); n[i] = mq(n[i] + Math.round((rng() - 0.5) * 194 * intensity)); } return n; }
function evaluate(c, prices, tick) { const mean = prices.length ? prices.reduce((a, b) => a + Number(b || 0), 0) / prices.length : 1; let tracking = 0; for (let i = 0; i < DIM; i += 1) { const target = prices.length ? Math.round(((Number(prices[i % prices.length]) || mean) / mean) * 256) : 0; tracking += Math.abs((c[i] % 512) - (target % 512)); } return energy(c) * 0.82 + tracking * 0.18 - entropy(c) * 100 * ((tick % 30 === 0) ? 1.25 : 1); }

self.onmessage = (ev) => {
  const { id, state, prices = [], batch = 100, maxSt = 64, convTh = 0.01, tick = 0 } = ev.data || {};
  try {
    seedRng(prices);
    let bestState = normalize(state || []);
    let bestEnergy = evaluate(bestState, prices, tick);
    let conv = 0;
    const ensemble = [];
    const t0 = Date.now();
    const chunk = 25;
    for (let c = 0; c < batch; c += 1) {
      let candidate = new Int32Array(bestState);
      let e = bestEnergy;
      for (let step = 0; step < maxSt; step += 1) {
        const temp = Math.max(0.05, 1 - step / maxSt);
        const next = mutate(candidate, temp + 0.1);
        const ne = evaluate(next, prices, tick + step);
        if (ne < e || rng() < Math.exp((e - ne) / (10000 * temp))) { candidate = next; e = ne; }
      }
      if (e < bestEnergy) {
        const rel = Math.abs(bestEnergy - e) / Math.max(Math.abs(bestEnergy), 1);
        if (rel <= convTh) conv += 1;
        bestEnergy = e; bestState = candidate;
      }
      if (ensemble.length < 16) ensemble.push({ i: c, energy: e, entropy: entropy(candidate) });
      if ((c + 1) % chunk === 0) self.postMessage({ id, progress: Math.min(Math.round(((c + 1) / batch) * 100), 100) });
    }
    const elapsed = Math.max(Date.now() - t0, 1);
    self.postMessage({ id, result: { bestEnergy, bestState: Array.from(bestState), convRate: conv / Math.max(batch, 1), throughput: Math.round(batch / (elapsed / 1000)), ensemble } });
  } catch (err) {
    self.postMessage({ id, error: err.stack || String(err) });
  }
};
