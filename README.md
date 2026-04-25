# CORE32 Research Repository

C.O.R.E./R.U.B.I.C. is a deterministic 64-dimensional modular state engine with a Numobius ladder transition layer, an 840-clock phase synchronizer, a Web Worker solver, and optional market/synthetic data ingestion.

## Status

This repository is a clean engineering extraction. It replaces placeholder sections with working baseline implementations so the project can run, test, benchmark, and evolve.

## Quick Start

```bash
npm install
npm test
npm run core:test
npm run bench
npm run dev
```

Open the Vite dev URL and run the dashboard. Synthetic data is enabled by default to avoid CORS/network issues.

## Repository Layout

```text
src/js/core/      deterministic math, octonion tables, ladder, solver
src/js/data/      Yahoo/synthetic feed ingestion and OHLCV transforms
src/js/app/       pipeline orchestration and worker bridge
src/js/ui/        browser dashboard
scripts/          CLI tests, benchmark, simulator
test/             node:test suite
docs/             architecture and research notes
```

## Claim Discipline

This repository distinguishes observed metrics from interpretation:

- Observed: deterministic state energy, entropy, solver convergence, ladder node transitions, feed aggregation behavior.
- Interpretation: triality, forcing, irreducibility, fusion, Numobius symbolic/topological readings.

The code should not be described as a cryptosystem without a separate theorem-proof and security-analysis treatment.
