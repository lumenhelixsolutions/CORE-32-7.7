import test from 'node:test';
import assert from 'node:assert/strict';
import { mq, toSigned, S64 } from '../src/js/core/math64.js';
import { octMul, clock840, resetLadder, kProbeHarness } from '../src/js/core/rubic.js';
import { stateFromPrices } from '../src/js/core/math64.js';
import { solveBatch } from '../src/js/core/solver.js';
import { predictDirection } from '../src/js/core/predictor.js';
import { backtestPredictions, scorePredictions } from '../src/js/core/validator.js';
import { syntheticOHLCV } from '../src/js/data/feed.js';

test('modular arithmetic normalizes negatives', () => {
  assert.equal(mq(-1), 3328);
  assert.equal(toSigned(3328), -1);
});

test('S64 always has 64 coordinates', () => {
  const s = new S64([1, 2, 3]);
  assert.equal(s.c.length, 64);
});

test('octonion basis multiplication follows Fano orientation', () => {
  const e1 = new Int32Array(8); e1[1] = 1;
  const e2 = new Int32Array(8); e2[2] = 1;
  assert.equal(octMul(e1, e2)[3], 1);
});

test('840 clock wraps correctly', () => {
  assert.equal(clock840(840).tick, 0);
  assert.equal(clock840(842).triality, 2);
});

// ── predictor tests ────────────────────────────────────────────────────────

test('predictDirection returns required fields', () => {
  const data = syntheticOHLCV(60, 100);
  const state = stateFromPrices(data.c);
  resetLadder(4);
  const probes = kProbeHarness(state, 4);
  const solve = solveBatch({ state: state.c, prices: data.c, batch: 20, maxSt: 8 });
  const pred = predictDirection({ solve, probes, state, tick: 50 });
  assert.ok(['up', 'down', 'neutral'].includes(pred.direction), 'direction must be one of up/down/neutral');
  assert.ok(pred.confidence >= 0 && pred.confidence <= 1, 'confidence in [0,1]');
  assert.ok(typeof pred.score === 'number', 'score is a number');
  assert.ok(pred.signals && typeof pred.signals === 'object', 'signals object present');
});

test('predictDirection with prevEnergy sets energyDeltaRaw', () => {
  const data = syntheticOHLCV(60, 100);
  const state = stateFromPrices(data.c);
  resetLadder(4);
  const probes = kProbeHarness(state, 4);
  const solve = solveBatch({ state: state.c, prices: data.c, batch: 20, maxSt: 8 });
  const pred = predictDirection({ solve, probes, state, tick: 50, prevEnergy: solve.bestEnergy * 1.2 });
  assert.ok(typeof pred.signals.energyDeltaRaw === 'number', 'energyDeltaRaw is a number');
});

// ── validator tests ────────────────────────────────────────────────────────

test('scorePredictions on empty array returns zero metrics', () => {
  const metrics = scorePredictions([]);
  assert.equal(metrics.accuracy, 0);
  assert.equal(metrics.total, 0);
  assert.equal(metrics.macroF1, 0);
});

test('scorePredictions computes accuracy correctly', () => {
  const results = [
    { prediction: 'up', actual: 'up', correct: true },
    { prediction: 'up', actual: 'down', correct: false },
    { prediction: 'down', actual: 'down', correct: true },
    { prediction: 'down', actual: 'up', correct: false },
  ];
  const metrics = scorePredictions(results);
  assert.equal(metrics.accuracy, 0.5);
  assert.equal(metrics.correct, 2);
  assert.equal(metrics.total, 4);
});

test('scorePredictions perDirection precision/recall for perfect up predictions', () => {
  const results = [
    { prediction: 'up', actual: 'up', correct: true },
    { prediction: 'up', actual: 'up', correct: true },
  ];
  const m = scorePredictions(results);
  assert.equal(m.perDirection.up.precision, 1);
  assert.equal(m.perDirection.up.recall, 1);
  assert.equal(m.perDirection.up.f1, 1);
});

test('backtestPredictions runs on synthetic data without throwing', () => {
  const data = syntheticOHLCV(80, 100);
  const { results, metrics } = backtestPredictions(data, { windowSize: 20, horizon: 3, batch: 10, maxSt: 8 });
  assert.ok(results.length > 0, 'should produce at least one result row');
  assert.ok(metrics.total === results.length, 'metrics.total matches results.length');
  assert.ok(metrics.accuracy >= 0 && metrics.accuracy <= 1, 'accuracy in [0,1]');
  for (const r of results) {
    assert.ok(['up', 'down', 'neutral'].includes(r.prediction), 'valid prediction direction');
    assert.ok(['up', 'down', 'neutral'].includes(r.actual), 'valid actual direction');
  }
});

test('backtestPredictions returns empty result when data is too short', () => {
  const data = syntheticOHLCV(10, 100);
  const { results } = backtestPredictions(data, { windowSize: 30, horizon: 5 });
  assert.equal(results.length, 0);
});

