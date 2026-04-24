import { mq, toSigned, Q, rng, randInt, S64 } from './math64.js';

export const FANO_TRIPLES = [[1,2,3],[1,4,5],[1,7,6],[2,4,6],[2,5,7],[3,4,7],[3,6,5]];

function buildOctTables() {
  const idx = Array.from({ length: 8 }, () => Array(8).fill(0));
  const sign = Array.from({ length: 8 }, () => Array(8).fill(1));
  for (let i = 1; i < 8; i += 1) {
    idx[0][i] = i; idx[i][0] = i;
    sign[0][i] = 1; sign[i][0] = 1;
    idx[i][i] = 0; sign[i][i] = -1;
  }
  idx[0][0] = 0; sign[0][0] = 1;
  for (const [a, b, c] of FANO_TRIPLES) {
    const cyclic = [[a,b,c], [b,c,a], [c,a,b]];
    for (const [x, y, z] of cyclic) { idx[x][y] = z; sign[x][y] = 1; }
    const anti = [[b,a,c], [c,b,a], [a,c,b]];
    for (const [x, y, z] of anti) { idx[x][y] = z; sign[x][y] = -1; }
  }
  return { idx, sign };
}

const OCT_TABLES = buildOctTables();
export const OCT_IDX = OCT_TABLES.idx;
export const OCT_SIGN = OCT_TABLES.sign;
export const OCT_MUL = OCT_IDX;

export function octMul(a, b) {
  const r = new Int32Array(8);
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      const k = OCT_IDX[i][j];
      const sg = OCT_SIGN[i][j];
      r[k] = mq(r[k] + sg * ((a[i] * b[j]) % Q));
    }
  }
  return r;
}

export function octNorm(a) {
  let n = 0;
  for (let i = 0; i < 8; i += 1) {
    const v = toSigned(a[i]);
    n += v * v;
  }
  return n;
}

export const KNOWN_ZD_TRIPLES = [[3,10,6],[1,9,2],[2,12,4],[5,14,7],[4,11,3],[6,13,5],[7,15,1]];

export function sedFusion(s1, s2) {
  const a = Array.from(s1).slice(0, 16);
  const b = Array.from(s2).slice(0, 16);
  while (a.length < 16) a.push(0);
  while (b.length < 16) b.push(0);

  const diffs = a.map((v, i) => Math.abs(toSigned(mq(v - b[i]))));
  const mean = diffs.reduce((x, y) => x + y, 0) / diffs.length;
  const variance = diffs.reduce((x, y) => x + (y - mean) ** 2, 0) / diffs.length;
  const tightZeros = diffs.filter((d) => d <= 3).length / diffs.length;
  let structuralHits = 0;
  for (const [x, y, z] of KNOWN_ZD_TRIPLES) {
    const lhs = mq(a[x] * b[y] - a[y] * b[x]);
    if (Math.abs(toSigned(lhs - z)) < 8) structuralHits += 1;
  }
  const structural = structuralHits / KNOWN_ZD_TRIPLES.length;
  const absorption = Math.max(0, Math.min(1, (1 / (1 + variance / 4096)) * 0.45 + tightZeros * 0.35 + structural * 0.20));
  const method = structural > 0.35 ? 'structural' : tightZeros > 0.45 ? 'tight-zeros' : 'variance';
  return { fusion: absorption > 0.4, absorption, method, mean, variance, tightZeros, structural };
}

export const LADDER = {
  bottom: [4,7,10,13],
  top: [16,19,22,25],
  portals: {4:16, 7:19, 10:22, 13:25, 16:4, 19:7, 22:10, 25:13},
  collapse: {16:7, 25:7, 19:10, 22:4},
  rimNext: {4:7, 7:10, 10:13, 13:4, 16:19, 19:22, 22:25, 25:16}
};

let ladderState = { node: 4, orientation: 1, fusionCount: 0, sevenCrowdCount: 0, topSteps: 0 };

export function resetLadder(node = 4) {
  ladderState = { node, orientation: 1, fusionCount: 0, sevenCrowdCount: 0, topSteps: 0 };
  return { ...ladderState };
}

export function ladderStep(energy, vol = 0, forcing = 0) {
  const onTop = LADDER.top.includes(ladderState.node);
  const highEnergy = Number(energy) > 250000;
  const highVol = Number(vol) > 0.035;
  const force = Math.abs(Number(forcing)) > 0.55;
  let action = 'rim→';

  if (!onTop && (highEnergy || highVol || force)) {
    ladderState.node = LADDER.portals[ladderState.node];
    ladderState.topSteps = 0;
    action = 'portal↑';
  } else if (onTop && (highEnergy || ladderState.topSteps >= 2)) {
    ladderState.node = LADDER.collapse[ladderState.node];
    ladderState.orientation *= -1;
    action = 'collapse↓';
  } else {
    ladderState.node = LADDER.rimNext[ladderState.node];
    action = 'rim→';
  }

  if (ladderState.node === 7) ladderState.sevenCrowdCount += 1;
  if (LADDER.top.includes(ladderState.node)) ladderState.topSteps += 1;
  return { ...ladderState, action };
}

export function clock840(tick) {
  const t = ((tick % 840) + 840) % 840;
  const triality = t % 3;
  return {
    tick: t,
    e8Aligned: (t % 30) === 0,
    triality,
    phase: triality === 0 ? 'V' : triality === 1 ? 'S+' : 'S−',
    phaseNm: triality === 0 ? 'Vector' : triality === 1 ? 'Spinor+' : 'Spinor−',
    digitalRoot: [1, 4, 7][Math.floor(t / 3) % 3],
    isPhysical: triality === 2
  };
}

export function folEntropy(state) {
  const bins = new Array(16).fill(0);
  for (const v of state.c || state) bins[Math.abs(toSigned(v)) % bins.length] += 1;
  const n = bins.reduce((a, b) => a + b, 0) || 1;
  return -bins.reduce((h, c) => c ? h + (c / n) * Math.log2(c / n) : h, 0);
}

export function trialitySynergy(tick, state) {
  const c = clock840(tick);
  const entropy = folEntropy(state);
  return { ...c, entropy, synergy: (entropy / 4) * (c.e8Aligned ? 1.25 : 1) };
}

export function mutateState(state, intensity = 1) {
  const s = state instanceof S64 ? state.copy() : new S64(state.c || state);
  const edits = Math.max(1, Math.round(4 * intensity));
  for (let k = 0; k < edits; k += 1) {
    const i = randInt(s.c.length);
    const delta = Math.round((rng() - 0.5) * 2 * 97 * intensity);
    s.c[i] = mq(s.c[i] + delta);
  }
  return s;
}

export function kProbeHarness(state, probes = 8) {
  const base = state instanceof S64 ? state : new S64(state.c || state);
  const out = [];
  for (let i = 0; i < probes; i += 1) {
    const m = mutateState(base, 1 + i / probes);
    out.push({ probe: i, energy: m.energy(), entropy: folEntropy(m), ladder: ladderStep(m.energy()) });
  }
  return out;
}
