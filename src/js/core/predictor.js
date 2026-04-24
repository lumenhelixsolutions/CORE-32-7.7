import { clock840, LADDER } from './rubic.js';

/**
 * Derives a directional prediction (up / down / neutral) from the outputs of a
 * single pipeline run.  Five independent signals are weighted and combined into
 * a scalar score; the sign and magnitude determine direction and confidence.
 *
 * @param {object} opts
 * @param {object} opts.solve      - result of solveBatch()
 * @param {Array}  opts.probes     - result of kProbeHarness()
 * @param {object} opts.state      - S64 state (or toJSON() array)
 * @param {number} [opts.tick]     - current tick for 840-clock lookup
 * @param {number|null} [opts.prevEnergy] - bestEnergy from the preceding window
 * @returns {{ direction: string, confidence: number, score: number, signals: object }}
 */
export function predictDirection({ solve, probes, state, tick = 0, prevEnergy = null } = {}) {
  const signals = {};

  // ── Signal 1: energy delta between consecutive windows ─────────────────────
  // Falling energy = the solver is converging on a more-ordered state → bullish.
  if (prevEnergy !== null && prevEnergy !== undefined) {
    const relDelta = (solve.bestEnergy - prevEnergy) / Math.max(Math.abs(prevEnergy), 1e-9);
    signals.energyDelta = relDelta < -0.05 ? 1 : relDelta > 0.05 ? -1 : 0;
    signals.energyDeltaRaw = relDelta;
  } else {
    signals.energyDelta = 0;
    signals.energyDeltaRaw = 0;
  }

  // ── Signal 2: convergence rate ────────────────────────────────────────────
  // High convRate → the solver found stable improvements → more confident / up.
  // Very low convRate → volatile landscape → bearish lean.
  signals.convergence = solve.convRate > 0.12 ? 1 : solve.convRate < 0.02 ? -1 : 0;
  signals.convRate = solve.convRate;

  // ── Signal 3: Numobius ladder position (last probe) ───────────────────────
  // portal↑ = upward momentum; collapse↓ = reversal; bottom rim = building; top rim = overhead.
  const lastProbe = probes[probes.length - 1] || {};
  const ladderAction = lastProbe.ladder?.action || 'rim→';
  const ladderNode = lastProbe.ladder?.node ?? 4;
  if (ladderAction === 'portal↑') {
    signals.ladder = 1;
  } else if (ladderAction === 'collapse↓') {
    signals.ladder = -1;
  } else if (LADDER.bottom.includes(ladderNode)) {
    signals.ladder = 0.5;
  } else {
    signals.ladder = -0.5;
  }
  signals.ladderNode = ladderNode;
  signals.ladderAction = ladderAction;

  // ── Signal 4: 840-clock triality ─────────────────────────────────────────
  // Spinor+ (triality 1) → up; Spinor− (triality 2) → down; Vector → neutral.
  // E8-aligned ticks amplify whichever signal is active.
  const clockTick = Number.isFinite(tick) ? tick : 0;
  const clk = clock840(clockTick);
  const triSign = clk.triality === 1 ? 1 : clk.triality === 2 ? -1 : 0;
  signals.triality = clk.e8Aligned ? triSign * 1.5 : triSign;
  signals.phase = clk.phase;
  signals.e8Aligned = clk.e8Aligned;

  // ── Signal 5: ensemble energy spread ────────────────────────────────────
  // Low coefficient-of-variation → stable ensemble → bullish; high → noisy → bearish.
  const energies = solve.ensemble.map((e) => e.energy);
  if (energies.length > 1) {
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((a, b) => a + (b - mean) ** 2, 0) / energies.length;
    const cv = Math.sqrt(variance) / Math.max(Math.abs(mean), 1);
    signals.ensembleStability = cv < 0.1 ? 1 : cv > 0.3 ? -1 : 0;
    signals.ensembleCV = cv;
  } else {
    signals.ensembleStability = 0;
    signals.ensembleCV = 0;
  }

  // ── Weighted combination ─────────────────────────────────────────────────
  const WEIGHTS = {
    energyDelta: 2.0,
    convergence: 1.5,
    ladder: 1.5,
    triality: 1.0,
    ensembleStability: 1.0,
  };
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let score = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    score += (signals[key] || 0) * w;
  }
  score /= totalWeight;

  const direction = score > 0.15 ? 'up' : score < -0.15 ? 'down' : 'neutral';
  const confidence = Math.min(1, Math.abs(score) / 0.5);

  return { direction, confidence, score, signals };
}
