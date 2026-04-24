const CRYPTO_ALIASES = {
  BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', ADA: 'ADA-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD'
};

const CHINA_TICKERS = new Set(['9988.HK', '0700.HK', 'BABA', 'JD', 'NIO', 'LI', 'XPEV', 'BIDU', 'PDD']);

export const _dataCache = {};
export let _lastSourceUsed = '';

export function isCrypto(sym) {
  if (!sym) return false;
  const u = sym.toUpperCase();
  return u.includes('-USD') || Object.keys(CRYPTO_ALIASES).includes(u);
}

export function normTicker(sym) {
  if (!sym) return sym;
  const u = sym.toUpperCase().trim();
  return CRYPTO_ALIASES[u] || u;
}

export function isChineseTicker(sym) {
  const u = normTicker(sym);
  return CHINA_TICKERS.has(u) || u.endsWith('.HK') || u.endsWith('.SS') || u.endsWith('.SZ');
}

export function resolveFeedSpec(sym, days) {
  const crypto = isCrypto(sym);
  if (crypto) {
    if (days <= 60) return { range: days <= 10 ? '1mo' : '3mo', interval: '60m', aggregateHours: 4, label: '4h' };
    return { range: '1y', interval: '1d', aggregateHours: 1, label: '1d' };
  }
  if (days <= 5) return { range: '5d', interval: '5m', aggregateHours: 1, label: '5m' };
  if (days <= 30) return { range: '1mo', interval: '60m', aggregateHours: 1, label: '1h' };
  return { range: '1y', interval: '1d', aggregateHours: 1, label: '1d' };
}

const DATA_SOURCES = [
  {
    name: 'Yahoo v8 Direct',
    fn: async (ns, spec) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ns)}?range=${spec.range}&interval=${spec.interval}&includePrePost=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  },
  {
    name: 'Yahoo v8 Proxy (allorigins)',
    fn: async (ns, spec) => {
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ns)}?range=${spec.range}&interval=${spec.interval}&includePrePost=false`;
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      return res.json();
    }
  },
  {
    name: 'Yahoo v8 Proxy (corsproxy)',
    fn: async (ns, spec) => {
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ns)}?range=${spec.range}&interval=${spec.interval}&includePrePost=false`;
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(yUrl)}`);
      if (!res.ok) throw new Error(`CorsProxy HTTP ${res.status}`);
      return res.json();
    }
  }
];

export async function fetchData(sym, days = 90) {
  const ns = normTicker(sym);
  const spec = resolveFeedSpec(ns, days);
  const cacheKey = [ns, days, spec.range, spec.interval, spec.aggregateHours || 1].join('_');
  if (_dataCache[cacheKey] && Date.now() - _dataCache[cacheKey]._ts < 120000) return _dataCache[cacheKey];

  let json = null;
  let sourceName = '';
  for (const src of DATA_SOURCES) {
    try {
      json = await Promise.race([src.fn(ns, spec), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      if (json?.chart?.result?.[0]?.timestamp) { sourceName = src.name; break; }
    } catch (e) {
      console.warn(`[${src.name}] failed for ${ns}:`, e.message);
    }
  }
  if (!json) return _dataCache[cacheKey] || null;
  _lastSourceUsed = sourceName;

  const rawData = parseYahooJson(json, ns, spec);
  let finalData = aggregateOHLCV(rawData, spec.aggregateHours || 1);
  finalData = trimDataToDays(finalData, days);
  if (!finalData.c || finalData.c.length < 5) throw new Error(`Insufficient data for ${ns}`);
  finalData._ts = Date.now();
  finalData._source = sourceName;
  finalData._spec = spec;
  _dataCache[cacheKey] = finalData;
  return finalData;
}

export async function fetchQuote(sym) {
  const ns = normTicker(sym);
  const data = await fetchData(ns, 5);
  if (!data?.c?.length) return null;
  const i = data.c.length - 1;
  return { symbol: ns, price: data.c[i], time: data.t[i], source: data._source };
}

export function parseYahooJson(json, ns = '', spec = {}) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Malformed Yahoo chart payload');
  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const out = { symbol: ns, interval: spec.label || spec.interval, t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = Number((adj && adj[i]) ?? q.close?.[i]);
    if (!Number.isFinite(close)) continue;
    out.t.push(timestamps[i] * 1000);
    out.o.push(Number(q.open?.[i] ?? close));
    out.h.push(Number(q.high?.[i] ?? close));
    out.l.push(Number(q.low?.[i] ?? close));
    out.c.push(close);
    out.v.push(Number(q.volume?.[i] ?? 0));
  }
  return out;
}

export function aggregateOHLCV(data, bucketHours = 1) {
  if (bucketHours <= 1) return data;
  const bucketMs = bucketHours * 3600 * 1000;
  const buckets = new Map();
  for (let i = 0; i < data.t.length; i += 1) {
    const key = Math.floor(data.t[i] / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, { t: key, o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i], v: data.v[i] });
    const b = buckets.get(key);
    b.h = Math.max(b.h, data.h[i]);
    b.l = Math.min(b.l, data.l[i]);
    b.c = data.c[i];
    b.v += data.v[i];
  }
  const rows = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  return { ...data, t: rows.map(r => r.t), o: rows.map(r => r.o), h: rows.map(r => r.h), l: rows.map(r => r.l), c: rows.map(r => r.c), v: rows.map(r => r.v) };
}

export function trimDataToDays(data, days) {
  const cutoff = Date.now() - days * 86400000;
  const keep = data.t.map((t, i) => [t, i]).filter(([t]) => t >= cutoff).map(([, i]) => i);
  if (keep.length < 5) return data;
  return { ...data, t: keep.map(i => data.t[i]), o: keep.map(i => data.o[i]), h: keep.map(i => data.h[i]), l: keep.map(i => data.l[i]), c: keep.map(i => data.c[i]), v: keep.map(i => data.v[i]) };
}

export function syntheticOHLCV(points = 180, start = 100) {
  const t = [], o = [], h = [], l = [], c = [], v = [];
  let price = start;
  const now = Date.now() - points * 3600000;
  for (let i = 0; i < points; i += 1) {
    const open = price;
    price = Math.max(1, price + Math.sin(i / 9) * 0.8 + Math.cos(i / 17) * 0.5 + (Math.random() - 0.5));
    t.push(now + i * 3600000); o.push(open); c.push(price); h.push(Math.max(open, price) + 0.35); l.push(Math.min(open, price) - 0.35); v.push(1000 + Math.round(Math.abs(Math.sin(i)) * 500));
  }
  return { symbol: 'SYNTH', interval: '1h', t, o, h, l, c, v, _source: 'synthetic' };
}
