import { runCorePipeline, runWorkerPipeline } from '../app/controller.js';

const $ = (id) => document.getElementById(id);

export function mountDashboard() {
  const run = $('run');
  const sym = $('symbol');
  const synthetic = $('synthetic');
  const output = $('output');
  const progress = $('progress');

  run.addEventListener('click', async () => {
    output.textContent = 'Running CORE pipeline...';
    progress.value = 0;
    try {
      const result = await runCorePipeline({ symbol: sym.value || 'BTC', days: 90, useSynthetic: synthetic.checked });
      progress.value = 40;
      const workerResult = await runWorkerPipeline({
        state: result.state,
        prices: result.solve.ensemble.map((x) => x.energy),
        batch: 100,
        maxSt: 48,
        onProgress: (p) => { progress.value = 40 + Math.round(p * 0.6); }
      });
      output.textContent = JSON.stringify({ ...result, workerResult }, null, 2);
    } catch (e) {
      output.textContent = e.stack || String(e);
    }
  });
}
