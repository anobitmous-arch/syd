// Motor del modelo de Chris Creamer (World Cup 2026): entorno → localización → confirmación → gestión.
// Puro, sin DOM. Reutiliza perfil, sesiones y estadísticas del motor de Fabio.
import { nyParts, annotate as annotateBase, buildProfile, estimateDelta, stats } from '../fabioModel/engine.js';

export { stats };

export const DEFAULTS = {
  allowLong: true, allowShort: true, allowSide: false, structDays: 2, weekends: false,
  winStart: 570, winMin: 90, asia: false, maxHoldBars: 48,
  gexMode: 'auto', gexAdapt: true, dampR: 1.5,
  valueRef: 'ldn', vaPct: 70, legLen: 72, minLegAtr: 4, fibTop: 0.705, fibBot: 0.886, zoneOutside: true,
  needInternal: true, invalidBy: 'close',
  extFrac: 0.34, absMin: 0.10, absBull: true, wickMin: 0.25, wickProxy: 0.45, requireReal: false,
  confirmBars: 3, needRetest: true, needBubble: false, partMult: 0.5, partDays: 5,
  stopAt: 'retest', stopTicks: 2, tgt: 'swing', tgtR: 2, minRR: 1.2,
  reclaimBars: 6, failMode: 'be', trail: true, beAtR: 0,
  maxTrades: 2, maxConsecLoss: 2, riskPct: 0.25, costBps: 4.5, maxCostR: 0.5,
};

export const ASIA = [1200, 1380]; // 20:00-23:00 NY = apertura de Tokio

export function annotate(bars, cutoff) {
  annotateBase(bars, cutoff);
  for (const b of bars) if (b.nyMin === undefined) b.nyMin = nyParts(b.t * 1000).mins;
  return bars;
}

// Dónde está el delta dentro de la vela de 5m: suma de las velas de 1m que tocan el tercio inferior
// (vendedores en la mecha de abajo) y el superior. Si faltan velas de 1m, la vela queda sin "intra".
export function intraFlow(bar, kids, extFrac) {
  const rng = bar.h - bar.l;
  const out = { intra: false, intraReal: false, lowD: 0, lowV: 0, highD: 0, highV: 0, lowKidD: 0, highKidD: 0 };
  if (kids.length < 5 || !(rng > 0)) return out;
  out.intra = true;
  out.intraReal = kids.every((k) => k.hasReal);
  let kl = kids[0], kh = kids[0];
  for (const k of kids) {
    if (k.l < kl.l) kl = k;
    if (k.h > kh.h) kh = k;
    if (k.l <= bar.l + extFrac * rng) { out.lowD += k.d; out.lowV += k.v; }
    if (k.h >= bar.h - extFrac * rng) { out.highD += k.d; out.highV += k.v; }
  }
  out.lowKidD = kl.d; // el minuto que marcó el mínimo: ¿vendieron agresivamente ahí?
  out.highKidD = kh.d;
  return out;
}

// Delta real por minuto (grabado o en vivo) en las velas de 1m y de 5m; si falta algún minuto,
// estimado por la forma de la vela. big: bucket de 5m -> USD de órdenes grandes { buy, sell }.
export function attachFlow(bars5, bars1, realMin, covered, big, extFrac) {
  const kidsOf = new Map();
  for (const k of bars1) {
    const r = realMin.get(k.t);
    if (covered(k.t)) { k.d = r ? r.buy - r.sell : 0; k.hasReal = true; } else { k.d = estimateDelta(k); k.hasReal = false; }
    const t5 = Math.floor(k.t / 300) * 300;
    if (!kidsOf.has(t5)) kidsOf.set(t5, []);
    kidsOf.get(t5).push(k);
  }
  for (const b of bars5) {
    let full = true, d = 0;
    for (let m = b.t; m < b.t + 300; m += 60) {
      if (!covered(m)) { full = false; break; }
      const r = realMin.get(m);
      if (r) d += r.buy - r.sell;
    }
    const g = big.get(b.t);
    b.hasReal = full;
    b.d = full ? d : estimateDelta(b);
    b.bigBuy = full ? g?.buy || 0 : 0;
    b.bigSell = full ? g?.sell || 0 : 0;
    Object.assign(b, intraFlow(b, kidsOf.get(b.t) || [], extFrac));
  }
}

// Estructura de valor de los días previos: POC (y VA) subiendo = valor al alza.
function structureOf(hist, n) {
  if (hist.length < n + 1) return 'side';
  const last = hist.slice(-(n + 1));
  let up = true, dn = true;
  for (let k = 1; k < last.length; k++) {
    const a = last[k - 1], b = last[k];
    up &&= b.poc > a.poc && b.val > a.val;
    dn &&= b.poc < a.poc && b.vah < a.vah;
  }
  return up ? 'up' : dn ? 'down' : 'side';
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// ctx: { binSize, tick, closedCount, profiles: [[día, perfil]], gex: { día: {regime,...} } }
export function simulate(bars, cfg, ctx) {
  const { binSize, tick, profiles, gex = {} } = ctx;
  const closedCount = ctx.closedCount ?? bars.length;
  const out = { trades: [], value: [], zone: [], absMarks: [], cvd: [], pos: null, state: null, days: new Map() };
  const stopBuf = cfg.stopTicks * tick;

  let curDay = null, pi = 0, cvd = 0;
  const hist = []; // perfiles de días completos ya vistos
  let day = null; // estado del día
  let pos = null;
  const winVols = new Map(); // día -> volúmenes de las velas en ventana
  let atr = NaN;

  const closeTrade = (b, px, reason) => {
    const dir = pos.side === 'L' ? 1 : -1;
    const cost = (2 * cfg.costBps / 1e4) * pos.entry / pos.risk;
    const r = (dir * (px - pos.entry)) / pos.risk - cost;
    out.trades.push({ ...pos, exitT: b.t, exitPx: px, reason, r });
    day.trades++;
    day.consec = r < 0 ? day.consec + 1 : 0;
    pos = null;
  };

  const inWindow = (b) => {
    if (!(cfg.weekends || b.weekday)) return null;
    if (b.nyMin >= cfg.winStart && b.nyMin < cfg.winStart + cfg.winMin) return 'NY';
    if (cfg.asia && b.nyMin >= ASIA[0] && b.nyMin < ASIA[1]) return 'Asia';
    return null;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const closed = i < closedCount;

    if (b.day !== curDay) {
      while (pi < profiles.length && profiles[pi][0] < b.day) hist.push(profiles[pi++][1]);
      curDay = b.day;
      cvd = 0;
      const g = cfg.gexMode === 'auto' ? gex[b.day]?.regime || null : cfg.gexMode === 'off' ? null : cfg.gexMode;
      day = {
        start: i, prev: hist.at(-1) || null, struct: structureOf(hist, cfg.structDays), regime: g, gexInfo: gex[b.day] || null,
        on: null, trades: 0, consec: 0, absL: null, absS: null, deadL: null, deadS: null,
      };
      out.days.set(b.day, day);
      if (pos && pos.window === 'NY') closeTrade(b, b.o, 'fin sesión');
    }

    // ATR(14) de 5m para el tamaño mínimo del tramo.
    const tr = i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l;
    atr = Number.isNaN(atr) ? tr : atr + (tr - atr) / 14;

    cvd += b.d;
    out.cvd.push({ t: b.t, v: cvd });

    const win = inWindow(b);
    // Valor de referencia: el overnight (Asia + Londres, hasta la apertura), solo Londres (3:00-9:30 NY) o el día previo.
    if (win === 'NY' && !day.on && cfg.valueRef !== 'prev' && i > day.start) {
      let s0 = day.start;
      if (cfg.valueRef === 'ldn') while (s0 < i && bars[s0].nyMin >= 960) s0++; // salta la tarde/Asia: desde las 3:00 NY
      if (cfg.valueRef === 'ldn') while (s0 < i && bars[s0].nyMin < 180) s0++;
      if (s0 < i) day.on = buildProfile(bars.slice(s0, i), binSize, cfg.vaPct / 100);
    }
    const ref = win === 'Asia' || cfg.valueRef === 'prev' ? day.prev : day.on || null;
    out.value.push(ref && (win || pos) ? { t: b.t, poc: ref.poc, vah: ref.vah, val: ref.val } : { t: b.t, gap: true });

    // Participación: volumen frente a la mediana de la ventana de los últimos días.
    if (win && closed) {
      if (!winVols.has(b.day)) winVols.set(b.day, []);
      winVols.get(b.day).push(b.v);
    }
    const pastVols = [...winVols.entries()].filter(([d]) => d < b.day).slice(-cfg.partDays).flatMap(([, v]) => v);
    const base = pastVols.length >= 12 ? median(pastVols) : NaN;
    const partOk = (x) => Number.isNaN(base) || x.v >= cfg.partMult * base;

    // ── Gestión de la posición
    if (closed && pos) {
      if (pos.pending) {
        pos.pending = false;
        pos.entry = b.o; pos.entryT = b.t; pos.entryI = i;
        pos.risk = Math.abs(pos.entry - pos.stop);
        const bad = pos.risk <= 0 || (pos.side === 'L' ? b.o <= pos.stop || b.o >= pos.tp : b.o >= pos.stop || b.o <= pos.tp);
        if (bad) pos = null;
        else { pos.stop0 = pos.stop; pos.ext = b.o; pos.reclaimed = pos.side === 'L' ? pos.edge <= pos.entry || pos.edge >= pos.tp : pos.edge >= pos.entry || pos.edge <= pos.tp; }
      }
      if (pos) {
        const held = i - pos.entryI;
        const L = pos.side === 'L';
        const exitReason = () => (pos.trailed ? 'trail' : pos.be ? 'BE' : 'SL');
        if ((pos.window === 'NY' && b.nyMin >= 960) || held >= cfg.maxHoldBars) closeTrade(b, b.o, 'fin tiempo');
        else if (L && b.l <= pos.stop) closeTrade(b, Math.min(pos.stop, b.o), exitReason());
        else if (!L && b.h >= pos.stop) closeTrade(b, Math.max(pos.stop, b.o), exitReason());
        else if (L && b.h >= pos.tp) closeTrade(b, Math.max(pos.tp, b.o), 'TP');
        else if (!L && b.l <= pos.tp) closeTrade(b, Math.min(pos.tp, b.o), 'TP');
        else {
          // Primer control: los compradores tienen que volver a meter el precio en el valor.
          if (!pos.reclaimed && (L ? b.c > pos.edge : b.c < pos.edge)) pos.reclaimed = true;
          if (!pos.reclaimed && !pos.checked && held + 1 >= cfg.reclaimBars) {
            pos.checked = true;
            if (cfg.failMode === 'cut') { closeTrade(b, b.c, 'no reclama VA'); }
            else if (cfg.failMode === 'be') { pos.stop = L ? Math.max(pos.stop, pos.entry) : Math.min(pos.stop, pos.entry); pos.be = true; }
          }
          if (pos && cfg.beAtR > 0 && !pos.be && (L ? b.h >= pos.entry + cfg.beAtR * pos.risk : b.l <= pos.entry - cfg.beAtR * pos.risk)) {
            pos.stop = pos.entry; pos.be = true;
          }
          // Trail detrás de la agresión que sí da resultado (vela a favor, delta a favor, nuevo extremo).
          if (pos && cfg.trail && pos.reclaimed) {
            if (L && b.c > b.o && b.d > 0 && b.h > pos.ext && b.l - stopBuf > pos.stop) { pos.stop = b.l - stopBuf; pos.trailed = true; }
            if (!L && b.c < b.o && b.d < 0 && b.l < pos.ext && b.h + stopBuf < pos.stop) { pos.stop = b.h + stopBuf; pos.trailed = true; }
          }
          if (pos) pos.ext = L ? Math.max(pos.ext, b.h) : Math.min(pos.ext, b.l);
        }
      }
    }

    // ── Localización: tramo swing → zona de descuento / premium (fibo 0,705-0,886)
    const from = Math.max(0, i - cfg.legLen);
    let ih = from, il = from;
    for (let k = from; k <= i; k++) { if (bars[k].h >= bars[ih].h) ih = k; if (bars[k].l <= bars[il].l) il = k; }
    let legL = null, legS = null;
    {
      let lo = from;
      for (let k = from; k <= ih; k++) if (bars[k].l <= bars[lo].l) lo = k;
      const H = bars[ih].h, Lw = bars[lo].l, size = H - Lw;
      if (lo < ih && size >= cfg.minLegAtr * atr) {
        legL = { H, L: Lw, ih, il: lo, top: H - cfg.fibTop * size, mid: H - 0.788 * size, bot: H - cfg.fibBot * size };
      }
      let hi = from;
      for (let k = from; k <= il; k++) if (bars[k].h >= bars[hi].h) hi = k;
      const H2 = bars[hi].h, L2 = bars[il].l, size2 = H2 - L2;
      if (hi < il && size2 >= cfg.minLegAtr * atr) {
        legS = { H: H2, L: L2, ih: hi, il, top: L2 + cfg.fibBot * size2, mid: L2 + 0.788 * size2, bot: L2 + cfg.fibTop * size2 };
      }
    }
    const longEnv = cfg.allowLong && (day.struct === 'up' || (cfg.allowSide && day.struct === 'side'));
    const shortEnv = cfg.allowShort && (day.struct === 'down' || (cfg.allowSide && day.struct === 'side'));
    const zoneOkL = legL && (!cfg.zoneOutside || !ref || legL.top <= ref.val);
    const zoneOkS = legS && (!cfg.zoneOutside || !ref || legS.bot >= ref.vah);
    const showL = win && longEnv && zoneOkL && day.deadL !== legL.ih;
    const showS = win && shortEnv && zoneOkS && day.deadS !== legS.il;
    const z = showL ? legL : showS ? legS : null;
    out.zone.push(z ? { t: b.t, top: z.top, mid: z.mid, bot: z.bot } : { t: b.t, gap: true });

    if (!closed) continue;

    // Invalidación: el retroceso pasa del 0,886 → ese tramo ya no vale.
    if (legL && (cfg.invalidBy === 'close' ? b.c < legL.bot : b.l < legL.bot)) { day.deadL = legL.ih; day.absL = null; }
    if (legS && (cfg.invalidBy === 'close' ? b.c > legS.top : b.h > legS.top)) { day.deadS = legS.il; day.absS = null; }

    const internal = (leg, side) => {
      if (!cfg.needInternal) return true;
      const a = side === 'L' ? leg.ih : leg.il;
      for (let j = a + 2; j <= i - 2; j++) {
        const x = bars[j];
        const piv = side === 'L'
          ? x.h > bars[j - 1].h && x.h > bars[j - 2].h && x.h >= bars[j + 1].h && x.h >= bars[j + 2].h
          : x.l < bars[j - 1].l && x.l < bars[j - 2].l && x.l <= bars[j + 1].l && x.l <= bars[j + 2].l;
        if (piv) return true;
      }
      return false;
    };

    const rng = b.h - b.l;
    const canTrade = !pos && win && day.trades < cfg.maxTrades && day.consec < cfg.maxConsecLoss;
    let sig = null;

    // ── Confirmación larga: absorción de vendedores en descuento → fallan más arriba → giro alcista
    if (longEnv && zoneOkL && day.deadL !== legL.ih && rng > 0) {
      if (day.absL && (b.l <= day.absL.low || i - day.absL.i > cfg.confirmBars || day.absL.leg !== legL.ih)) day.absL = null;
      const wick = (Math.min(b.o, b.c) - b.l) / rng;
      if (day.absL) {
        const flip = b.l > day.absL.low + tick && b.l < b.o && b.c > b.o && (b.c - b.l) / rng >= 0.5 && b.d > 0
          && (!cfg.needRetest || !b.intra || b.lowKidD < 0) && (!cfg.needBubble || b.bigBuy > 0) && partOk(b);
        if (flip && canTrade) {
          const sl = (cfg.stopAt === 'abs' ? day.absL.low : b.l) - stopBuf;
          sig = { side: 'L', stop: sl, abs: day.absL, real: b.intraReal && day.absL.real };
          day.absL = null;
        }
      } else if (win && (cfg.absBull ? b.c > b.o : (b.c - b.l) / rng >= 0.4) && wick >= cfg.wickMin && b.l <= legL.top && (cfg.invalidBy === 'close' || b.l >= legL.bot) && partOk(b) && internal(legL, 'L')) {
        const flowOk = b.intra ? b.lowD < 0 && b.lowV > 0 && -b.lowD / b.lowV >= cfg.absMin : !cfg.requireReal && wick >= cfg.wickProxy;
        if (flowOk) {
          day.absL = { i, t: b.t, low: b.l, leg: legL.ih, real: b.intraReal };
          out.absMarks.push({ t: b.t, side: 'L' });
        }
      }
    }
    // ── Confirmación corta (espejo): absorción de compradores en premium → fallan más abajo → giro bajista
    if (!sig && shortEnv && zoneOkS && day.deadS !== legS.il && rng > 0) {
      if (day.absS && (b.h >= day.absS.high || i - day.absS.i > cfg.confirmBars || day.absS.leg !== legS.il)) day.absS = null;
      const wick = (b.h - Math.max(b.o, b.c)) / rng;
      if (day.absS) {
        const flip = b.h < day.absS.high - tick && b.h > b.o && b.c < b.o && (b.h - b.c) / rng >= 0.5 && b.d < 0
          && (!cfg.needRetest || !b.intra || b.highKidD > 0) && (!cfg.needBubble || b.bigSell > 0) && partOk(b);
        if (flip && canTrade) {
          const sl = (cfg.stopAt === 'abs' ? day.absS.high : b.h) + stopBuf;
          sig = { side: 'S', stop: sl, abs: day.absS, real: b.intraReal && day.absS.real };
          day.absS = null;
        }
      } else if (win && (cfg.absBull ? b.c < b.o : (b.h - b.c) / rng >= 0.4) && wick >= cfg.wickMin && b.h >= legS.bot && (cfg.invalidBy === 'close' || b.h <= legS.top) && partOk(b) && internal(legS, 'S')) {
        const flowOk = b.intra ? b.highD > 0 && b.highV > 0 && b.highD / b.highV >= cfg.absMin : !cfg.requireReal && wick >= cfg.wickProxy;
        if (flowOk) {
          day.absS = { i, t: b.t, high: b.h, leg: legS.il, real: b.intraReal };
          out.absMarks.push({ t: b.t, side: 'S' });
        }
      }
    }

    if (!sig) continue;
    // ── Objetivo: el swing (máximo/mínimo del tramo), el POC del valor o R fijo
    const L = sig.side === 'L', leg = L ? legL : legS, r = Math.abs(b.c - sig.stop);
    let tp = L ? leg.H : leg.L;
    if (cfg.tgt === 'poc' && ref && (L ? ref.poc > b.c : ref.poc < b.c)) tp = ref.poc;
    if (cfg.tgt === 'r') tp = b.c + (L ? 1 : -1) * cfg.tgtR * r;
    // Gamma positiva amortigua: no se pide el swing entero.
    if (cfg.gexAdapt && day.regime === 'pos') tp = L ? Math.min(tp, b.c + cfg.dampR * r) : Math.max(tp, b.c - cfg.dampR * r);
    if (Math.abs(tp - b.c) < cfg.minRR * r) continue;
    if ((2 * cfg.costBps / 1e4) * b.c / r > cfg.maxCostR) continue;
    pos = {
      ...sig, tp, pending: true, signalT: b.t, absT: sig.abs.t, model: 1, window: win,
      edge: ref ? (L ? ref.val : ref.vah) : b.c, be: false, trailed: false, regime: day.regime, struct: day.struct,
    };
  }

  out.pos = pos;
  out.day = day;
  // Antes de la apertura: el valor de referencia provisional, para preparar el día.
  if (day && !day.on && cfg.valueRef !== 'prev') {
    let s0 = day.start;
    const end = Math.min(closedCount, bars.length);
    if (cfg.valueRef === 'ldn') { while (s0 < end && bars[s0].nyMin >= 960) s0++; while (s0 < end && bars[s0].nyMin < 180) s0++; }
    if (s0 < end) day.onPreview = buildProfile(bars.slice(s0, end), binSize, cfg.vaPct / 100);
  }
  out.state = describe(bars[Math.min(closedCount, bars.length) - 1], day, cfg, out);
  return out;
}

function describe(b, day, cfg, out) {
  if (!b || !day) return null;
  const win = (cfg.weekends || b.weekday) && ((b.nyMin >= cfg.winStart && b.nyMin < cfg.winStart + cfg.winMin) ? 'NY' : cfg.asia && b.nyMin >= ASIA[0] && b.nyMin < ASIA[1] ? 'Asia' : null);
  const struct = { up: 'Valor al alza → solo largos en descuento', down: 'Valor a la baja → solo cortos en premium', side: 'Valor lateral / mixto' + (cfg.allowSide ? ' → ambos lados' : ' → no se opera') }[day.struct];
  const reg = day.regime === 'pos' ? 'Gamma positiva: amortigua, rupturas que fallan, objetivos cortos'
    : day.regime === 'neg' ? 'Gamma negativa: amplifica, movimientos más rápidos y largos' : 'Gamma sin dato para este mercado/día';
  let conf = 'Esperando que el precio llegue a la zona.';
  if (day.absL) conf = 'Absorción de vendedores vista: esperando que vuelvan a vender y fallen más arriba.';
  else if (day.absS) conf = 'Absorción de compradores vista: esperando que vuelvan a comprar y fallen más abajo.';
  else if (day.trades >= cfg.maxTrades) conf = `Máximo de ${cfg.maxTrades} operaciones hoy: cerrado.`;
  else if (day.consec >= cfg.maxConsecLoss) conf = `${cfg.maxConsecLoss} pérdidas seguidas: cerrado por hoy.`;
  const z = out.zone.at(-1);
  const loc = z && !z.gap ? `Zona 0,705-0,886: ${z.bot.toFixed(2)} – ${z.top.toFixed(2)}` : 'Sin tramo válido o la zona cae dentro del valor.';
  return { win, struct, reg, loc, conf, trades: day.trades };
}
