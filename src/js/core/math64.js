export const DIM = 64;
export const Q = 3329;
export const MX = 16;

export const mq = (a) => ((a % Q) + Q) % Q;
export const aq = (a, b) => mq(a + b);
export const sq = (a, b) => mq(a - b);

export function toSigned(v) {
  const h = Q >> 1;
  return v > h ? v - Q : v;
}

let _rngState = 0;

export function seedRng(prices = []) {
  let h = 0x811c9dc5;
  for (let i = 0; i < prices.length; i += 1) {
    const p = Math.round(Number(prices[i] || 0) * 100);
    h ^= p & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (p >> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (p >> 16) & 0xff; h = Math.imul(h, 0x01000193);
  }
  _rngState = h >>> 0;
  return _rngState;
}

export function setRngSeed(seed) {
  _rngState = Number(seed || 0) >>> 0;
}

export function rng() {
  _rngState |= 0;
  _rngState = (_rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(n) {
  return Math.floor(rng() * n);
}

export class S64 {
  constructor(c) {
    this.c = new Int32Array(DIM);
    if (c) for (let i = 0; i < Math.min(c.length, DIM); i += 1) this.c[i] = mq(c[i]);
  }

  copy() {
    return new S64(this.c);
  }

  normalize() {
    for (let i = 0; i < DIM; i += 1) this.c[i] = mq(this.c[i]);
    return this;
  }

  energy() {
    let e = 0;
    for (let i = 0; i < DIM; i += 1) {
      const v = toSigned(this.c[i]);
      e += v * v;
    }
    return e / DIM;
  }

  toJSON() {
    return Array.from(this.c);
  }
}

export function stateFromPrices(prices = []) {
  const s = new S64();
  if (!prices.length) return s;
  const first = Number(prices[0]) || 1;
  for (let i = 0; i < DIM; i += 1) {
    const p = Number(prices[i % prices.length]) || first;
    const prev = Number(prices[(i + prices.length - 1) % prices.length]) || first;
    const drift = Math.round(((p - prev) / Math.max(Math.abs(prev), 1e-9)) * 100000);
    s.c[i] = mq(drift + i * MX);
  }
  return s;
}
