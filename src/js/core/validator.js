import { stateFromPrices } from './math64.js';
import { solveBatch } from './solver.js';
import { kProbeHarness, resetLadder } from './rubic.js';
import { predictDirection } from './predictor.js';

const DIRECTIONS = ['up', 'down', 'neutral'];

/**
 * Run a rolling-window backtest over a full OHLCV dataset.
 *
 * For each window [i-windowSize .. i], the pipeline is run and a directional
 * prediction is generated for `horizon` candles ahead.  The actual price move
 * is then compared to determine correctness.
 *
 * @param {object} ohlcv             - OHLCV object with at least a `c` (close) array
 * @param {object} [opts]
 * @param {number} [opts.windowSize=30]      - look-back length (candles)
 * @param {number} [opts.horizon=5]          - forward look (candles)
 * @param {number} [opts.batch=30]           - solveBatch batch size
 * @param {number} [opts.maxSt=16]           - solveBatch inner steps
 * @param {number} [opts.priceThreshold=0.005] - min relative move to call up/down
 * @param {Function} [opts.onProgress]       - (pct: number) => void  0-100
 * @returns {{ results: Array, metrics: object }}
 */
export function backtestPredictions(ohlcv, {
  windowSize = 30,
  horizon = 5,
  batch = 30,
  maxSt = 16,
  priceThreshold = 0.005,
  onProgress = null,
} = {}) {
  const prices = ohlcv.c;
  if (!prices || prices.length < windowSize + horizon + 1) {
    return { results: [], metrics: scorePredictions([]) };
  }

  const results = [];
  let prevEnergy = null;
  const total = prices.length - windowSize - horizon;

  for (let i = windowSize; i <= prices.length - horizon; i += 1) {
    const window = prices.slice(i - windowSize, i);
    const state = stateFromPrices(window);
    resetLadder(4);
    const probes = kProbeHarness(state, 4);
    const solve = solveBatch({ state: state.c, prices: window, batch, maxSt, tick: i });

    const prediction = predictDirection({ solve, probes, state, tick: i, prevEnergy });

    const priceNow = prices[i - 1];
    const priceFuture = prices[i + horizon - 1];
    const actualChange = (priceFuture - priceNow) / Math.max(Math.abs(priceNow), 1e-9);
    const actual = actualChange > priceThreshold ? 'up' : actualChange < -priceThreshold ? 'down' : 'neutral';

    results.push({
      index: i,
      prediction: prediction.direction,
      confidence: prediction.confidence,
      score: prediction.score,
      actual,
      actualChange,
      correct: prediction.direction === actual,
      signals: prediction.signals,
    });

    prevEnergy = solve.bestEnergy;

    if (onProgress) {
      const done = i - windowSize + 1;
      onProgress(Math.round((done / total) * 100));
    }
  }

  return { results, metrics: scorePredictions(results) };
}

/**
 * Compute accuracy, per-direction precision / recall / F1 and a confusion
 * matrix from an array of backtest result rows.
 *
 * @param {Array} results - array of { prediction, actual, correct } objects
 * @returns {object}
 */
export function scorePredictions(results) {
  const total = results.length;
  if (!total) {
    const empty = Object.fromEntries(
      DIRECTIONS.map((d) => [d, { tp: 0, predicted: 0, actual: 0, precision: 0, recall: 0, f1: 0 }])
    );
    return { accuracy: 0, correct: 0, total: 0, perDirection: empty, confusion: {}, macroF1: 0 };
  }

  const correct = results.filter((r) => r.correct).length;
  const accuracy = correct / total;

  const perDirection = {};
  for (const dir of DIRECTIONS) {
    const tp = results.filter((r) => r.prediction === dir && r.actual === dir).length;
    const predicted = results.filter((r) => r.prediction === dir).length;
    const actualCount = results.filter((r) => r.actual === dir).length;
    const precision = predicted ? tp / predicted : 0;
    const recall = actualCount ? tp / actualCount : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perDirection[dir] = { tp, predicted, actual: actualCount, precision, recall, f1 };
  }

  const confusion = {};
  for (const p of DIRECTIONS) {
    confusion[p] = {};
    for (const a of DIRECTIONS) {
      confusion[p][a] = results.filter((r) => r.prediction === p && r.actual === a).length;
    }
  }

  const macroF1 = DIRECTIONS.reduce((s, d) => s + perDirection[d].f1, 0) / DIRECTIONS.length;

  return { accuracy, correct, total, perDirection, confusion, macroF1 };
}
