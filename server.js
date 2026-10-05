const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5177;

app.use(express.json());
app.use(cookieParser());

// SYD API
const sydRouter = require('./syd/router');
app.use('/api/syd', sydRouter);

// Gastos — proxy IA
const accountingRouter = require('./accounting/router');
app.use('/accounting/api', accountingRouter);

// Prefer a local, deploy-friendly path (VPS): ./data/lecciones.json
// You can override with env var: LECCIONES_PATH=/abs/path/to/lecciones.json
// Dev fallback: the original CRA path (so it keeps working locally as before).
const DEFAULT_VPS_PATH = path.resolve(__dirname, 'data', 'lecciones.json');
const DEV_FALLBACK_PATH = path.resolve(
  __dirname,
  '..',
  'syd-trading-school-cra',
  'syd-trading-school',
  'src',
  'data',
  'lecciones.json'
);

const LECCIONES_PATH = process.env.LECCIONES_PATH
  ? path.resolve(process.env.LECCIONES_PATH)
  : (fs.existsSync(DEFAULT_VPS_PATH) ? DEFAULT_VPS_PATH : DEV_FALLBACK_PATH);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Optional: also expose the JSON as a simple static-like path.
// This matches the “put it in a data folder” mental model.
app.get('/data/lecciones.json', (req, res) => {
  fs.readFile(LECCIONES_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to read lecciones.json',
        path: LECCIONES_PATH,
        details: err.message
      });
    }
    res.type('application/json').send(data);
  });
});

app.get('/api/lecciones', (req, res) => {
  fs.readFile(LECCIONES_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to read lecciones.json',
        path: LECCIONES_PATH,
        details: err.message
      });
    }

    try {
      const parsed = JSON.parse(data);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: 'Invalid JSON in lecciones.json',
        path: LECCIONES_PATH,
        details: e.message
      });
    }
  });
});

// Bertrader: página privada con clave en el enlace. Va antes del estático a propósito:
// sus ficheros viven en ./private, fuera de ./public.
const { bertraderRouter } = require('./bertrader/guard');
app.use('/bertrader', bertraderRouter({
  key: process.env.BERTRADER_KEY || '',
  cookieSecret: process.env.BERTRADER_COOKIE_SECRET || '',
  pageDir: path.join(__dirname, 'private', 'bertrader'),
  dataDir: path.join(__dirname, 'data', 'bertrader'),
}));

// Fabio Model: order flow por minuto que graba hl_recorder (stack/bertrader/recorder),
// montado en ./flow. Se agrega al marco de la vela y se filtran las órdenes por tamaño.
const FLOW_DIR = process.env.FLOW_DIR || path.join(__dirname, 'flow');
const FLOW_COINS = new Set(['xyz:XYZ100', 'xyz:SP500', 'BTC', 'ETH', 'SOL', 'HYPE']);
app.get('/fabioModel/flow', (req, res) => {
  const coin = String(req.query.coin || '');
  const from = Number(req.query.from) || 0;
  const step = Number(req.query.step) === 300 ? 300 : 60;
  const min = Math.max(0, Number(req.query.min) || 0);
  if (!FLOW_COINS.has(coin)) return res.status(400).json({ error: 'coin' });
  const dir = path.join(FLOW_DIR, coin.replace(':', '_'));
  const fromDate = new Date(from * 1000).toISOString().slice(0, 10);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= fromDate).sort();
  } catch {
    return res.json([]);
  }
  const buckets = new Map();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; } // última línea a medio escribir
      if (r.t < from) continue;
      const t = Math.floor(r.t / step) * step;
      const b = buckets.get(t) || { t, b: 0, s: 0, m: [], o: [] };
      b.b += r.b; b.s += r.s; b.m.push(r.t);
      for (const o of r.o) if (o[1] >= min) b.o.push([r.t, ...o]);
      buckets.set(t, b);
    }
  }
  res.set('Cache-Control', 'no-store').json([...buckets.values()]);
});

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback para la admin de gastos
app.get('/accounting/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'accounting', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`bertcryptoSite running on http://localhost:${PORT}`);
  console.log(`Serving lecciones from: ${LECCIONES_PATH}`);
});
