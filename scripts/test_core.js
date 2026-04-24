import assert from 'node:assert/strict';
import { S64, seedRng, rng, stateFromPrices } from '../src/js/core/math64.js';
import { octMul, clock840, sedFusion, resetLadder, ladderStep } from '../src/js/core/rubic.js';

seedRng([1,2,3]);
const a = rng();
seedRng([1,2,3]);
assert.equal(a, rng(), 'PRNG must be deterministic');

const e1 = new Int32Array(8); e1[1] = 1;
const e2 = new Int32Array(8); e2[2] = 1;
const product = octMul(e1, e2);
assert.equal(product[3], 1, 'Fano triple e1*e2=e3 expected');

const s = stateFromPrices([100, 101, 99, 105, 104]);
assert.equal(s.c.length, 64);
assert.ok(new S64(s.c).energy() >= 0);

assert.equal(clock840(841).tick, 1);
const fusion = sedFusion(new Array(16).fill(1), new Array(16).fill(1));
assert.ok(fusion.absorption >= 0 && fusion.absorption <= 1);

resetLadder(4);
const step = ladderStep(999999, 0.1, 0.9);
assert.equal(step.action, 'portal↑');

console.log('CORE smoke tests passed.');
