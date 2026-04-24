# Architecture

## Layers

1. `math64.js`: finite modular arithmetic over `Q = 3329`, deterministic PRNG, and `S64` state container.
2. `rubic.js`: octonion multiplication, sedenion-fusion metric, Numobius ladder, 840-clock, entropy/probe harness.
3. `solver.js` / `solver.worker.js`: deterministic annealing-style state optimization.
4. `feed.js`: ticker normalization, Yahoo chart retrieval, CORS proxy fallback, OHLCV parsing, aggregation, synthetic generator.
5. `controller.js`: full pipeline runner.
6. `dashboard.js`: browser UI.

## Data Flow

```text
OHLCV prices -> S64 state -> probe harness -> solver -> metrics/report
```

## Reversibility Note

The current solver is deterministic under a fixed price series seed, but it is not a fully reversible audit-packet implementation. Add an audit-packet schema before making rollback claims.
