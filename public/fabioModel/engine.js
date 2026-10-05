// Motor de los dos modelos de Fabio Valentini (AMT + order flow), versión navegador.
// Es la misma lógica que el Pine v6: perfil del día previo → estado → localización → agresión.
// Puro: sin DOM, para poder probarlo en Node.

const NY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

export function nyParts(ms) {
  const p = {};
  for (const { type, value } of NY_FMT.formatToParts(new Date(ms))) p[type] = value;
  return { dow: p.weekday, date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}

const isWeekdayDate = (date) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
};

// Sesiones en hora de Nueva York (minutos desde medianoche).
export const SESSIONS = { ny: [570, 960], ldn: [180, 570] };

// Añade a cada vela: día de perfil, ventana NY/Londres y día laborable. Solo toca velas nuevas.
export function annotate(bars, cutoff) {
  const shift = cutoff === 'ny18' ? 6 * 3600e3 : 0;
  for (const b of bars) {
    if (b.day) continue;
    const ny = nyParts(b.t * 1000);
    b.day = cutoff === 'ny18' ? nyParts(b.t * 1000 + shift).date : new Date(b.t * 1000).toISOString().slice(0, 10);
    b.weekday = WEEKDAYS.has(ny.dow);
    b.inNY = ny.mins >= SESSIONS.ny[0] && ny.mins < SESSIONS.ny[1];
    b.inLDN = ny.mins >= SESSIONS.ldn[0] && ny.mins < SESSIONS.ldn[1];
  }
  return bars;
}

// Delta estimado por la forma de la vela; se sustituye por el real cuando hay trades.
export const estimateDelta = (b) => (b.h > b.l ? (b.v * (b.c - b.o)) / (b.h - b.l) : 0);

// Perfil de volumen con delta por nivel. Reparte el volumen de cada vela por su rango.
export function buildProfile(bars, binSize, vaPct = 0.7) {
  if (!bars.length) return null;
  let kMin = Infinity, kMax = -Infinity, high = -Infinity, low = Infinity;
  for (const b of bars) {
    kMin = Math.min(kMin, Math.floor(b.l / binSize));
    kMax = Math.max(kMax, Math.floor(b.h / binSize));
    high = Math.max(high, b.h);
    low = Math.min(low, b.l);
  }
  const n = kMax - kMin + 1;
  const vols = new Float64Array(n), deltas = new Float64Array(n);
  let total = 0;
  for (const b of bars) {
    const lo = Math.floor(b.l / binSize), hi = Math.floor(b.h / binSize);
    const k = hi - lo + 1, v = b.v / k, d = b.d / k;
    for (let j = lo; j <= hi; j++) { vols[j - kMin] += v; deltas[j - kMin] += d; }
    total += b.v;
  }
  let pocIdx = 0;
  for (let i = 1; i < n; i++) if (vols[i] > vols[pocIdx]) pocIdx = i;
  let lo = pocIdx, hi = pocIdx, acc = vols[pocIdx];
  while (acc < total * vaPct && (lo > 0 || hi < n - 1)) {
    const up = hi < n - 1 ? vols[hi + 1] : -1;
    const dn = lo > 0 ? vols[lo - 1] : -1;
    if (up >= dn) acc += vols[++hi];
    else acc += vols[--lo];
  }
  return {
    binSize, kMin, vols, deltas, pocIdx, vaLo: lo, vaHi: hi, total, high, low,
    poc: (kMin + pocIdx + 0.5) * binSize,
    vah: (kMin + hi + 1) * binSize,
    val: (kMin + lo) * binSize,
  };
}

// Perfiles de los días COMPLETOS de una serie: ni el primero (empieza a medias) ni el último
// (en curso). Fines de semana fuera salvo que se operen. Devuelve [[día, perfil]] en orden.
export function dayProfiles(bars, binSize, cfg) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= bars.length; i++) {
    if (i < bars.length && bars[i].day === bars[start].day) continue;
    const day = bars[start].day;
    if (start > 0 && i < bars.length && (cfg.weekends || isWeekdayDate(day))) {
      out.push([day, buildProfile(bars.slice(start, i), binSize, cfg.vaPct / 100)]);
    }
    start = i;
  }
  return out;
}

// Tamaño de nivel "redondo" para ~70 niveles en un día medio.
export function autoBinSize(bars) {
  const days = new Map();
  for (const b of bars) {
    const d = days.get(b.day) || { h: -Infinity, l: Infinity };
    d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l);
    days.set(b.day, d);
  }
  const ranges = [...days.values()].map((d) => d.h - d.l).filter((r) => r > 0).sort((a, b) => a - b);
  const median = ranges[Math.floor(ranges.length / 2)] || 1;
  const raw = median / 70;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

export function tickSize(bars) {
  let t = Infinity;
  for (let i = 1; i < bars.length; i++) {
    const d = Math.abs(bars[i].c - bars[i - 1].c);
    if (d > 1e-12) t = Math.min(t, d);
  }
  return Number.isFinite(t) ? t : 0.01;
}

export const DEFAULTS = {
  useM1: true, useM2: true, m2InNY: false, weekends: false,
  vaPct: 70, volLen: 30, volMult: 2.0, deltaMin: 0.30, bodyMin: 0.50,
  useReal: true, useCvd: false, cvdLen: 10,
  impLen: 20, retrFrac: 0.38, retestBins: 2,
  stopTicks: 2, beAtR: 1.0, m1Target: 'prevday', m1R: 3.0, minRR: 1.5,
  riskPct: 0.25, maxDayDD: 2.0, maxTrades: 6, costBps: 4.5, maxCostR: 0.5,
};

// Simula los dos modelos vela a vela. Solo las velas < closedCount generan señales/salidas
// (la vela en formación no repinta). Entradas a la apertura de la vela siguiente, como en Pine.
// profiles: [[día, perfil]] de días completos (ver dayProfiles); el "día previo" de cada día es el
// último perfil con fecha anterior.
export function simulate(bars, cfg, binSize, tick, closedCount = bars.length, profiles = dayProfiles(bars, binSize, cfg)) {
  const out = { trades: [], levels: [], cvd: [], aggBuy: [], aggSell: [], pos: null, state: null };
  const stopBuf = cfg.stopTicks * tick;
  const tol = cfg.retestBins * binSize;
  const maxDayR = cfg.maxDayDD / cfg.riskPct;

  let prev = null, curDay = null, cvd = 0, dayR = 0, dayTrades = 0, pi = 0;
  let volSum = 0;
  const cvdDay = [];
  let pos = null;
  const st = {};
  const resetStates = () => Object.assign(st, {
    m1UpOn: false, m1UpStart: NaN, m1UpExt: NaN, m1UpPull: false,
    m1DnOn: false, m1DnStart: NaN, m1DnExt: NaN, m1DnPull: false,
    m2DnExc: false, m2DnLow: NaN, m2DnBack: false, m2DnPull: false,
    m2UpExc: false, m2UpHigh: NaN, m2UpBack: false, m2UpPull: false,
  });
  resetStates();

  const closeTrade = (b, px, reason) => {
    const dir = pos.side === 'L' ? 1 : -1;
    const cost = (2 * cfg.costBps / 1e4) * pos.entry / pos.risk;
    const r = (dir * (px - pos.entry)) / pos.risk - cost;
    out.trades.push({ ...pos, exitT: b.t, exitPx: px, reason, r });
    dayR += r;
    dayTrades++;
    pos = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const closed = i < closedCount;

    if (b.day !== curDay) {
      // Día previo = último día completo anterior (sin fines de semana, el lunes mira el viernes).
      while (pi < profiles.length && profiles[pi][0] < b.day) prev = profiles[pi++][1];
      curDay = b.day; cvd = 0; dayR = 0; dayTrades = 0; cvdDay.length = 0;
      resetStates();
      out.levels.push({ t: b.t, gap: true });
    } else {
      out.levels.push(prev ? { t: b.t, poc: prev.poc, vah: prev.vah, val: prev.val, high: prev.high, low: prev.low } : { t: b.t, gap: true });
    }

    volSum += b.v;
    if (i >= cfg.volLen) volSum -= bars[i - cfg.volLen].v;
    const volAvg = i >= cfg.volLen - 1 ? volSum / cfg.volLen : NaN;

    cvd += b.d;
    cvdDay.push(cvd);
    out.cvd.push({ t: b.t, v: cvd });

    const tradable = cfg.weekends || b.weekday;
    const inNY = tradable && b.inNY;
    const inLDN = tradable && b.inLDN;
    const m2Win = inLDN || (cfg.m2InNY && inNY);

    const rng = b.h - b.l;
    const full = rng > 0 && Math.abs(b.c - b.o) / rng >= cfg.bodyMin;
    const dr = b.v > 0 ? b.d / b.v : 0;
    let aggBuy, aggSell;
    if (cfg.useReal && b.hasReal) {
      aggBuy = b.bigBuy > 0 && full && b.c > b.o && dr > 0;
      aggSell = b.bigSell > 0 && full && b.c < b.o && dr < 0;
    } else {
      const big = volAvg > 0 && b.v >= volAvg * cfg.volMult;
      aggBuy = big && full && b.c > b.o && dr >= cfg.deltaMin;
      aggSell = big && full && b.c < b.o && dr <= -cfg.deltaMin;
    }
    if (closed && aggBuy) out.aggBuy.push(b.t);
    if (closed && aggSell) out.aggSell.push(b.t);
    const back = cvdDay.length > cfg.cvdLen ? cvdDay[cvdDay.length - 1 - cfg.cvdLen] : null;
    const cvdUp = !cfg.useCvd || back === null || cvd > back;
    const cvdDn = !cfg.useCvd || back === null || cvd < back;

    if (!closed) continue;

    // ── Gestión de la posición abierta en esta vela
    if (pos) {
      if (pos.pending) {
        pos.pending = false;
        pos.entry = b.o; pos.entryT = b.t;
        pos.risk = Math.abs(pos.entry - pos.stop);
        const invalid = pos.risk <= 0
          || (pos.side === 'L' ? b.o <= pos.stop || b.o >= pos.tp : b.o >= pos.stop || b.o <= pos.tp);
        if (invalid) pos = null;
        else pos.stop0 = pos.stop;
      }
      if (pos) {
        const winOk = pos.model === 1 ? inNY : m2Win;
        if (!winOk) closeTrade(b, b.o, 'fin ventana');
        else if (pos.side === 'L') {
          if (b.l <= pos.stop) closeTrade(b, Math.min(pos.stop, b.o), pos.be ? 'BE' : 'SL');
          else if (b.h >= pos.tp) closeTrade(b, Math.max(pos.tp, b.o), 'TP');
          else if (!pos.be && b.h >= pos.entry + cfg.beAtR * pos.risk) { pos.stop = Math.max(pos.stop, pos.entry); pos.be = true; }
        } else {
          if (b.h >= pos.stop) closeTrade(b, Math.max(pos.stop, b.o), pos.be ? 'BE' : 'SL');
          else if (b.l <= pos.tp) closeTrade(b, Math.min(pos.tp, b.o), 'TP');
          else if (!pos.be && b.l <= pos.entry - cfg.beAtR * pos.risk) { pos.stop = Math.min(pos.stop, pos.entry); pos.be = true; }
        }
      }
    }

    if (!prev) continue;

    // ── Modelo 1 · tendencia: ruptura del VA previo → retroceso del impulso → agresión
    let m1Long = false, m1Short = false;
    if (inNY) {
      const from = Math.max(0, i - cfg.impLen + 1);
      if (st.m1UpOn && b.c < prev.vah) st.m1UpOn = false;
      else if (!st.m1UpOn && b.c > prev.vah) {
        let lo = Infinity;
        for (let j = from; j <= i; j++) lo = Math.min(lo, bars[j].l);
        Object.assign(st, { m1UpOn: true, m1UpStart: lo, m1UpExt: b.h, m1UpPull: false });
      } else if (st.m1UpOn) {
        if (!st.m1UpPull) {
          st.m1UpExt = Math.max(st.m1UpExt, b.h);
          st.m1UpPull = b.l <= st.m1UpExt - cfg.retrFrac * (st.m1UpExt - st.m1UpStart);
        } else if (aggBuy && cvdUp) { m1Long = true; st.m1UpOn = false; }
      }
      if (st.m1DnOn && b.c > prev.val) st.m1DnOn = false;
      else if (!st.m1DnOn && b.c < prev.val) {
        let hi = -Infinity;
        for (let j = from; j <= i; j++) hi = Math.max(hi, bars[j].h);
        Object.assign(st, { m1DnOn: true, m1DnStart: hi, m1DnExt: b.l, m1DnPull: false });
      } else if (st.m1DnOn) {
        if (!st.m1DnPull) {
          st.m1DnExt = Math.min(st.m1DnExt, b.l);
          st.m1DnPull = b.h >= st.m1DnExt + cfg.retrFrac * (st.m1DnStart - st.m1DnExt);
        } else if (aggSell && cvdDn) { m1Short = true; st.m1DnOn = false; }
      }
    }

    // ── Modelo 2 · reversión: sale del VA, falla, vuelve, retest → agresión → POC
    let m2Long = false, m2Short = false;
    if (m2Win) {
      if (b.l < prev.val && (Number.isNaN(st.m2DnLow) || b.l < st.m2DnLow)) {
        Object.assign(st, { m2DnExc: true, m2DnLow: b.l, m2DnBack: false, m2DnPull: false });
      } else if (st.m2DnBack && !st.m2DnPull && b.l <= prev.val + tol) st.m2DnPull = true;
      else if (st.m2DnExc && !st.m2DnBack && b.c > prev.val) st.m2DnBack = true;
      if (st.m2DnPull && aggBuy && cvdUp && b.c > prev.val && b.c < prev.poc) {
        m2Long = true;
        Object.assign(st, { m2DnExc: false, m2DnLow: NaN, m2DnBack: false, m2DnPull: false });
      }
      if (b.h > prev.vah && (Number.isNaN(st.m2UpHigh) || b.h > st.m2UpHigh)) {
        Object.assign(st, { m2UpExc: true, m2UpHigh: b.h, m2UpBack: false, m2UpPull: false });
      } else if (st.m2UpBack && !st.m2UpPull && b.h >= prev.vah - tol) st.m2UpPull = true;
      else if (st.m2UpExc && !st.m2UpBack && b.c < prev.vah) st.m2UpBack = true;
      if (st.m2UpPull && aggSell && cvdDn && b.c < prev.vah && b.c > prev.poc) {
        m2Short = true;
        Object.assign(st, { m2UpExc: false, m2UpHigh: NaN, m2UpBack: false, m2UpPull: false });
      }
    } else {
      Object.assign(st, { m2DnExc: false, m2DnLow: NaN, m2DnBack: false, m2DnPull: false, m2UpExc: false, m2UpHigh: NaN, m2UpBack: false, m2UpPull: false });
    }

    // ── Entradas (a la apertura de la vela siguiente)
    const canTrade = !pos && dayTrades < cfg.maxTrades && dayR > -maxDayR;
    if (!canTrade) continue;
    let sig = null;
    if (cfg.useM1 && m1Long) {
      const sl = b.l - stopBuf, r = b.c - sl;
      const tp = cfg.m1Target === 'prevday' && prev.high - b.c >= cfg.minRR * r ? prev.high : b.c + cfg.m1R * r;
      sig = { side: 'L', model: 1, stop: sl, tp };
    } else if (cfg.useM1 && m1Short) {
      const sl = b.h + stopBuf, r = sl - b.c;
      const tp = cfg.m1Target === 'prevday' && b.c - prev.low >= cfg.minRR * r ? prev.low : b.c - cfg.m1R * r;
      sig = { side: 'S', model: 1, stop: sl, tp };
    } else if (cfg.useM2 && m2Long) {
      const sl = b.l - stopBuf;
      if (prev.poc - b.c >= cfg.minRR * (b.c - sl)) sig = { side: 'L', model: 2, stop: sl, tp: prev.poc };
    } else if (cfg.useM2 && m2Short) {
      const sl = b.h + stopBuf;
      if (b.c - prev.poc >= cfg.minRR * (sl - b.c)) sig = { side: 'S', model: 2, stop: sl, tp: prev.poc };
    }
    // Stop tan corto que la comisión se come la operación → fuera.
    if (sig && (2 * cfg.costBps / 1e4) * b.c / Math.abs(b.c - sig.stop) > cfg.maxCostR) sig = null;
    if (sig) pos = { ...sig, pending: true, signalT: b.t, be: false };
  }

  out.pos = pos;
  out.prev = prev;
  out.state = describeState(st, prev, bars[Math.min(closedCount, bars.length) - 1], cfg);
  return out;
}

function describeState(st, prev, b, cfg) {
  if (!b) return null;
  const tradable = cfg.weekends || b.weekday;
  const win = tradable && b.inNY ? 'NY' : tradable && b.inLDN ? 'Londres' : null;
  if (!prev) return { win, m1: 'Sin perfil del día previo todavía.', m2: '—' };
  let m1 = 'Precio dentro del valor previo: en balance, el Modelo 1 no opera.';
  if (st.m1UpOn) m1 = st.m1UpPull ? 'Fuera de balance ↑ y retroceso hecho: esperando agresión compradora.' : `Fuera de balance ↑: esperando retroceso del ${Math.round(cfg.retrFrac * 100)} % del impulso.`;
  else if (st.m1DnOn) m1 = st.m1DnPull ? 'Fuera de balance ↓ y retroceso hecho: esperando agresión vendedora.' : `Fuera de balance ↓: esperando retroceso del ${Math.round(cfg.retrFrac * 100)} % del impulso.`;
  else if (b.c > prev.vah) m1 = 'Por encima del VAH previo (se arma dentro de la sesión de NY).';
  else if (b.c < prev.val) m1 = 'Por debajo del VAL previo (se arma dentro de la sesión de NY).';
  let m2 = 'Sin excursión fuera del valor previo.';
  if (st.m2DnExc) m2 = st.m2DnPull ? 'Barrió el VAL, volvió y retesteó: esperando agresión compradora → POC.' : st.m2DnBack ? 'Barrió el VAL y volvió dentro: esperando retest (segundo impulso).' : 'Por debajo del VAL: esperando que vuelva dentro.';
  else if (st.m2UpExc) m2 = st.m2UpPull ? 'Barrió el VAH, volvió y retesteó: esperando agresión vendedora → POC.' : st.m2UpBack ? 'Barrió el VAH y volvió dentro: esperando retest (segundo impulso).' : 'Por encima del VAH: esperando que vuelva dentro.';
  return { win, m1, m2 };
}

export function stats(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const wins = trades.filter((t) => t.r > 0);
  const gp = wins.reduce((s, t) => s + t.r, 0);
  const gl = -trades.filter((t) => t.r <= 0).reduce((s, t) => s + t.r, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return { n, win: wins.length / n, total: eq, avg: eq / n, pf: gl > 0 ? gp / gl : Infinity, dd };
}
