import { syntheticOHLCV } from '../src/js/data/feed.js';
import { stateFromPrices } from '../src/js/core/math64.js';
import { kProbeHarness } from '../src/js/core/rubic.js';

const data = syntheticOHLCV(64, 100);
const state = stateFromPrices(data.c);
console.log(JSON.stringify({ data: { points: data.c.length, first: data.c[0], last: data.c.at(-1) }, probes: kProbeHarness(state, 5) }, null, 2));
