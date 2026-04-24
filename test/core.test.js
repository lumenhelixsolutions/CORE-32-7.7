import test from 'node:test';
import assert from 'node:assert/strict';
import { mq, toSigned, S64 } from '../src/js/core/math64.js';
import { octMul, clock840 } from '../src/js/core/rubic.js';

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
