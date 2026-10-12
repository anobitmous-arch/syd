// Diario de operaciones en papel de las sesiones en vivo (Fabio / Creamer). Vive detrás del
// guard de /bertrader: sin la cookie de un dispositivo dado de alta, todo responde 404.
// Un fichero JSON por diario; se reescribe entero con rename atómico (son pocas decenas).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const MODELS = new Set(['M1', 'M2', 'Creamer', 'Otro']);
const COINS = new Set(['xyz:XYZ100', 'xyz:SP500', 'BTC', 'ETH', 'SOL', 'HYPE']);
const EXIT_REASONS = new Set(['TP', 'SL', 'manual']);
const RISK_USD = 10;
const COST_BPS = 4.5;
const TEXT_MAX = 600;

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const text = (x) => (typeof x === 'string' ? x.trim().slice(0, TEXT_MAX) : '');

// R neto con la misma comisión que el motor (4,5 pb por lado): comparable con el backtest.
function rMultiple(t, exitPx) {
  const dir = t.side === 'L' ? 1 : -1;
  const risk = Math.abs(t.entry - t.stop);
  const cost = (2 * t.costBps / 1e4) * t.entry / risk;
  return dir * (exitPx - t.entry) / risk - cost;
}

function validateNew(b) {
  const t = {
    coin: b.coin, model: b.model, side: b.side,
    entry: num(b.entry), stop: num(b.stop), tp: num(b.tp), entryT: num(b.entryT),
    estado: text(b.estado), localizacion: text(b.localizacion), agresion: text(b.agresion),
  };
  if (!COINS.has(t.coin)) return ['coin'];
  if (!MODELS.has(t.model)) return ['model'];
  if (t.side !== 'L' && t.side !== 'S') return ['side'];
  if (!(t.entry > 0) || !(t.stop > 0) || !(t.tp > 0) || !(t.entryT > 0)) return ['precios'];
  const long = t.side === 'L';
  if (long ? !(t.stop < t.entry && t.tp > t.entry) : !(t.stop > t.entry && t.tp < t.entry)) return ['stop_objetivo'];
  if (!t.estado || !t.localizacion || !t.agresion) return ['motivo'];
  return [null, t];
}

function journalRouter({ dir, now = () => Date.now() }) {
  const router = express.Router();
  const file = path.join(dir, 'paper.json');
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  };
  const write = (list) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
    fs.renameSync(tmp, file);
  };

  router.use(express.json({ limit: '16kb' }));

  router.get('/', (req, res) => res.json(read()));

  router.post('/', (req, res) => {
    const [err, t] = validateNew(req.body || {});
    if (err) return res.status(400).json({ error: err });
    const risk = Math.abs(t.entry - t.stop);
    const trade = {
      id: crypto.randomUUID(), ...t,
      riskUsd: RISK_USD, qty: RISK_USD / risk, costBps: COST_BPS,
      exitT: null, exitPx: null, exitReason: null, r: null, followed: null, note: '',
      createdAt: new Date(now()).toISOString(),
    };
    const list = read();
    list.push(trade);
    write(list);
    res.status(201).json(trade);
  });

  // Cierre (exitPx + exitT + exitReason) y/o revisión (followed, note). Un cierre no se reescribe.
  router.patch('/:id', (req, res) => {
    const list = read();
    const t = list.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'no_existe' });
    const b = req.body || {};
    if (b.exitPx !== undefined) {
      if (t.exitT) return res.status(409).json({ error: 'ya_cerrada' });
      const px = num(b.exitPx), at = num(b.exitT);
      if (!(px > 0) || !(at >= t.entryT) || !EXIT_REASONS.has(b.exitReason)) return res.status(400).json({ error: 'cierre' });
      Object.assign(t, { exitPx: px, exitT: at, exitReason: b.exitReason, r: rMultiple(t, px) });
    }
    if (b.followed !== undefined) {
      if (b.followed !== true && b.followed !== false && b.followed !== null) return res.status(400).json({ error: 'followed' });
      t.followed = b.followed;
    }
    if (b.note !== undefined) t.note = text(b.note);
    write(list);
    res.json(t);
  });

  router.delete('/:id', (req, res) => {
    const list = read();
    const i = list.findIndex((x) => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'no_existe' });
    // Solo se borra lo abierto (una entrada metida por error). Lo cerrado es historia.
    if (list[i].exitT) return res.status(409).json({ error: 'ya_cerrada' });
    list.splice(i, 1);
    write(list);
    res.status(204).end();
  });

  return router;
}

module.exports = { journalRouter, rMultiple, validateNew };
