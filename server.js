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

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`bertcryptoSite running on http://localhost:${PORT}`);
  console.log(`Serving lecciones from: ${LECCIONES_PATH}`);
});
