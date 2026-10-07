// Creamer Model: GEX "naive" del QQQ y el SPY con la cadena de opciones retrasada de CBOE (gratis).
// GEX por strike = gamma · OI · 100 · spot² · 1 % (calls +, puts −). Muro de calls / puts = strike con
// más GEX de cada lado; flip = precio donde el GEX total recalculado cambia de signo.
// Se refresca cada 15 min y se guarda una foto por día (la última antes de la apertura de NY),
// para que el backtest sepa el régimen de cada sesión a partir de ahora.
const fs = require('fs');
const path = require('path');

const SYMBOLS = ['QQQ', 'SPY'];
const REFRESH_MS = 15 * 60e3;
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function nyNow(ms = Date.now()) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}

// QQQ261006C00500000 → { exp: '2026-10-06', call: true, strike: 500 }
function parseOption(sym) {
  const m = /^[A-Z]+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym);
  return m && { exp: `20${m[1]}-${m[2]}-${m[3]}`, call: m[4] === 'C', strike: Number(m[5]) / 1000 };
}

const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
const bsGamma = (S, K, T, iv) => {
  const sd = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (0.04 + 0.5 * iv * iv) * T) / sd;
  return phi(d1) / (S * sd);
};

function summarize(data, nowMs = Date.now()) {
  const spot = data.current_price;
  const today = nyNow(nowMs).date;
  const byStrike = new Map();
  const legs = []; // para el flip: [strike, T, iv, ±OI]
  for (const o of data.options) {
    const p = parseOption(o.option);
    if (!p || p.exp < today || !(o.open_interest > 0)) continue;
    if (o.gamma > 0) {
      const g = o.gamma * o.open_interest * 100 * spot * spot * 0.01;
      const e = byStrike.get(p.strike) || { call: 0, put: 0 };
      if (p.call) e.call += g; else e.put += g;
      byStrike.set(p.strike, e);
    }
    // Vence a las 16:00 NY (~20:00 UTC); mínimo 1 h.
    const T = Math.max(3600e3, Date.parse(`${p.exp}T20:00:00Z`) - nowMs) / (365 * 864e5);
    if (o.iv > 0.01 && o.iv < 5) legs.push([p.strike, T, o.iv, p.call ? o.open_interest : -o.open_interest]);
  }
  let total = 0, callWall = null, putWall = null, cMax = 0, pMax = 0;
  for (const [k, e] of byStrike) {
    total += e.call - e.put;
    if (e.call > cMax) { cMax = e.call; callWall = k; }
    if (e.put > pMax) { pMax = e.put; putWall = k; }
  }
  // Flip (gamma cero): se recalcula el GEX total con Black-Scholes moviendo el spot ±10 % y se busca
  // el cruce de signo más cercano al spot actual.
  const gexAt = (S) => legs.reduce((acc, [K, T, iv, oi]) => acc + bsGamma(S, K, T, iv) * oi * 100 * S * S * 0.01, 0);
  let flip = null, prevS = null, prevG = null;
  for (let i = -40; i <= 40; i++) {
    const S = spot * (1 + i * 0.0025), g = gexAt(S);
    if (prevG !== null && Math.sign(g) !== Math.sign(prevG)) {
      const x = prevS + (S - prevS) * (prevG / (prevG - g));
      if (flip === null || Math.abs(x - spot) < Math.abs(flip - spot)) flip = x;
    }
    prevS = S; prevG = g;
  }
  const regime = gexAt(spot) >= 0 ? 'pos' : 'neg';
  return { spot, total: Math.round(total), callWall, putWall, flip: flip && Math.round(flip * 100) / 100, regime, quoteTime: data.last_trade_time };
}

function createGex(dir) {
  const latest = new Map();
  const file = (sym) => path.join(dir, `${sym}.json`);
  const readHist = (sym) => { try { return JSON.parse(fs.readFileSync(file(sym), 'utf8')); } catch { return {}; } };

  async function refresh(sym) {
    const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`cboe ${res.status}`);
    const { data } = await res.json();
    const now = nyNow();
    const s = { ...summarize(data), asOf: Date.now() };
    latest.set(sym, s);
    // Foto del día: la última antes de las 9:30 NY (la que se ve antes de abrir) o la primera si no la hay.
    const hist = readHist(sym);
    if (!hist[now.date] || now.mins < 570) {
      hist[now.date] = { regime: s.regime, total: s.total, callWall: s.callWall, putWall: s.putWall, flip: s.flip, spot: s.spot };
      try { fs.writeFileSync(file(sym), JSON.stringify(hist)); } catch (e) { console.error('gex: no se pudo guardar', e.message); }
    }
  }

  const tick = () => SYMBOLS.forEach((s) => refresh(s).catch((e) => console.error(`gex ${s}:`, e.message)));
  tick();
  setInterval(tick, REFRESH_MS).unref();

  return (req, res) => {
    const sym = String(req.query.sym || '');
    if (!SYMBOLS.includes(sym)) return res.status(400).json({ error: 'sym' });
    res.set('Cache-Control', 'no-store').json({ latest: latest.get(sym) || null, history: readHist(sym) });
  };
}

module.exports = { createGex, summarize };
