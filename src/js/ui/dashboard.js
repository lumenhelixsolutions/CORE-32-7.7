import { runCorePipeline, runWorkerPipeline, runValidationPipeline } from '../app/controller.js';

const $ = (id) => document.getElementById(id);

// ── helpers ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dirTag(dir) {
  const cls = dir === 'up' ? 'tag-up' : dir === 'down' ? 'tag-down' : 'tag-neu';
  return `<span class="tag ${cls}">${dir}</span>`;
}

function pct(v) {
  return (Number(v) * 100).toFixed(1) + '%';
}

// ── pipeline card ──────────────────────────────────────────────────────────

function mountPipelineCard() {
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
        onProgress: (p) => { progress.value = 40 + Math.round(p * 0.6); },
      });
      output.textContent = JSON.stringify({ ...result, workerResult }, null, 2);
    } catch (e) {
      output.textContent = e.stack || String(e);
    }
  });
}

// ── validator card ─────────────────────────────────────────────────────────

function renderValidatorMetrics(metrics) {
  const { accuracy, correct, total, perDirection, macroF1 } = metrics;
  return `
    <div class="metrics-grid">
      <div class="metric-box"><div class="val">${pct(accuracy)}</div><div class="lbl">Accuracy</div></div>
      <div class="metric-box"><div class="val">${correct}/${total}</div><div class="lbl">Correct / Total</div></div>
      <div class="metric-box"><div class="val">${pct(macroF1)}</div><div class="lbl">Macro F1</div></div>
      <div class="metric-box"><div class="val">${pct(perDirection.up.f1)}</div><div class="lbl">F1 ↑ up</div></div>
      <div class="metric-box"><div class="val">${pct(perDirection.down.f1)}</div><div class="lbl">F1 ↓ down</div></div>
      <div class="metric-box"><div class="val">${pct(perDirection.neutral.f1)}</div><div class="lbl">F1 – neutral</div></div>
    </div>`;
}

function renderDirectionTable(perDirection) {
  const rows = ['up', 'down', 'neutral'].map((dir) => {
    const d = perDirection[dir];
    return `<tr>
      <td>${dirTag(dir)}</td>
      <td>${d.tp}</td>
      <td>${d.predicted}</td>
      <td>${d.actual}</td>
      <td>${pct(d.precision)}</td>
      <td>${pct(d.recall)}</td>
      <td>${pct(d.f1)}</td>
    </tr>`;
  }).join('');
  return `
    <h3 style="margin:16px 0 8px;font-size:.9rem;color:#aaa">Per-direction metrics</h3>
    <table class="dir-table">
      <thead><tr><th>Direction</th><th>TP</th><th>Predicted</th><th>Actual</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRecentTable(results, maxRows = 25) {
  const recent = results.slice(-maxRows).reverse();
  const rows = recent.map((r) => {
    const chg = (r.actualChange * 100).toFixed(2);
    const conf = (r.confidence * 100).toFixed(0);
    const ok = r.correct ? '<span class="tag tag-ok">✓</span>' : '<span class="tag tag-err">✗</span>';
    return `<tr>
      <td>${r.index}</td>
      <td>${dirTag(r.prediction)}</td>
      <td>${dirTag(r.actual)}</td>
      <td>${chg}%</td>
      <td>${conf}%</td>
      <td>${ok}</td>
    </tr>`;
  }).join('');
  return `
    <h3 style="margin:16px 0 8px;font-size:.9rem;color:#aaa">Recent predictions (last ${recent.length})</h3>
    <table>
      <thead><tr><th>Window</th><th>Predicted</th><th>Actual</th><th>Price Δ</th><th>Confidence</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function mountValidatorCard() {
  const runBtn = $('val-run');
  const sym = $('val-symbol');
  const synthetic = $('val-synthetic');
  const windowInput = $('val-window');
  const horizonInput = $('val-horizon');
  const thresholdInput = $('val-threshold');
  const progress = $('val-progress');
  const metricsEl = $('val-metrics');
  const tablesEl = $('val-tables');

  runBtn.addEventListener('click', async () => {
    metricsEl.innerHTML = '<p style="color:#888">Running backtest…</p>';
    tablesEl.innerHTML = '';
    progress.value = 0;
    runBtn.disabled = true;

    try {
      const result = await runValidationPipeline({
        symbol: sym.value || 'BTC',
        useSynthetic: synthetic.checked,
        windowSize: Math.max(10, parseInt(windowInput.value, 10) || 30),
        horizon: Math.max(1, parseInt(horizonInput.value, 10) || 5),
        priceThreshold: (parseFloat(thresholdInput.value) ?? 0.5) / 100,
        onProgress: (p) => { progress.value = p; },
      });

      progress.value = 100;
      metricsEl.innerHTML = renderValidatorMetrics(result.metrics);
      tablesEl.innerHTML = renderDirectionTable(result.metrics.perDirection) +
        renderRecentTable(result.results);
    } catch (e) {
      metricsEl.innerHTML = `<pre style="color:#ef5350">${escHtml(e.stack || String(e))}</pre>`;
    } finally {
      runBtn.disabled = false;
    }
  });
}

// ── entry point ────────────────────────────────────────────────────────────

export function mountDashboard() {
  mountPipelineCard();
  mountValidatorCard();
}
