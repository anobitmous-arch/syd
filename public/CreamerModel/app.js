import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  LineStyle, LineType, CrosshairMode,
} from '../fabioModel/lightweight-charts.mjs';
import { buildProfile, dayProfiles, autoBinSize, tickSize, estimateDelta, nyParts } from '../fabioModel/engine.js';
import { annotate, attachFlow, simulate, stats, DEFAULTS } from './engine.js';

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const HL_WS = 'wss://api.hyperliquid.xyz/ws';

// Mismos mercados y umbrales que Fabio Model. gex = subyacente de opciones para el GEX naive.
const SYMBOLS = [
  { coin: 'xyz:XYZ100', label: 'Nasdaq 100 · XYZ100', bubble: 25000, rec: 5000, cutoff: 'ny18', gex: 'QQQ' },
  { coin: 'xyz:SP500', label: 'S&P 500 · SP500', bubble: 25000, rec: 5000, cutoff: 'ny18', gex: 'SPY' },
  { coin: 'BTC', label: 'BTC', bubble: 250000, rec: 50000, cutoff: 'utc0' },
  { coin: 'ETH', label: 'ETH', bubble: 150000, rec: 30000, cutoff: 'utc0' },
  { coin: 'SOL', label: 'SOL', bubble: 50000, rec: 10000, cutoff: 'utc0' },
  { coin: 'HYPE', label: 'HYPE', bubble: 50000, rec: 10000, cutoff: 'utc0' },
];

// Preset de la pestaña de adaptabilidad: misma lógica, filtros menos estrictos.
const LAX = { structDays: 1, allowSide: true, zoneOutside: false, absBull: false, needInternal: false };

const FIELDS = [
  ['1 · Entorno', [
    ['allowLong', 'Largos (valor al alza)', 'bool'],
    ['allowShort', 'Cortos (valor a la baja)', 'bool'],
    ['structDays', 'Días de valor migrando (POC y VA)', 'num', 1],
    ['allowSide', 'Operar también en valor lateral', 'bool'],
    ['gexMode', 'Régimen gamma', 'sel', [['auto', 'Auto (GEX del QQQ/SPY)'], ['pos', 'Forzar positiva'], ['neg', 'Forzar negativa'], ['off', 'Ignorar']]],
    ['gexAdapt', 'Gamma positiva → objetivo corto', 'bool'],
    ['dampR', 'Objetivo en gamma positiva (R)', 'num', 0.25],
    ['weekends', 'Operar fines de semana', 'bool'],
  ]],
  ['2 · Localización', [
    ['valueRef', 'Valor de referencia', 'sel', [['ldn', 'Londres (3:00-9:30 NY)'], ['on', 'Overnight (Asia + Londres)'], ['prev', 'Día previo']]],
    ['vaPct', 'Value Area %', 'num', 1],
    ['legLen', 'Tramo swing: velas hacia atrás', 'num', 6],
    ['minLegAtr', 'Tramo mínimo (× ATR 5m)', 'num', 0.5],
    ['fibTop', 'Fibo inicio zona', 'num', 0.005],
    ['fibBot', 'Fibo invalidación', 'num', 0.005],
    ['zoneOutside', 'Zona entera fuera del valor', 'bool'],
    ['needInternal', 'Exigir estructura interna (swing)', 'bool'],
    ['invalidBy', 'Invalida al pasar el 0,886', 'sel', [['close', 'Cierre de vela'], ['wick', 'Mecha']]],
  ]],
  ['3 · Confirmación', [
    ['absBull', 'Vela de absorción cierra a favor', 'bool'],
    ['wickMin', 'Mecha mín. de absorción (×rango)', 'num', 0.05],
    ['absMin', '|delta| en la mecha / volumen mín.', 'num', 0.02],
    ['extFrac', 'Tamaño del extremo (×rango)', 'num', 0.02],
    ['confirmBars', 'Velas para el segundo intento', 'num', 1],
    ['needRetest', 'Exigir que vuelvan a vender/comprar', 'bool'],
    ['needBubble', 'Exigir burbuja a favor en el giro', 'bool'],
    ['bubbleUsd', 'Burbuja real ≥ (USD)', 'num', 5000],
    ['partMult', 'Participación ≥ mediana ×', 'num', 0.05],
    ['requireReal', 'Solo con order flow (sin proxy)', 'bool'],
    ['wickProxy', 'Proxy sin 1m: mecha mín.', 'num', 0.05],
  ]],
  ['4 · Gestión y disciplina', [
    ['winStart', 'Ventana desde (min NY, 570 = 9:30)', 'num', 15],
    ['winMin', 'Duración ventana (min)', 'num', 15],
    ['asia', 'Ventana Asia (20:00-23:00 NY)', 'bool'],
    ['stopAt', 'Stop bajo', 'sel', [['retest', 'El segundo fallo'], ['abs', 'La vela de absorción']]],
    ['stopTicks', 'Stop: ticks extra', 'num', 1],
    ['tgt', 'Objetivo', 'sel', [['swing', 'Swing del tramo'], ['poc', 'POC del valor'], ['r', 'R fijo']]],
    ['tgtR', 'R fijo', 'num', 0.25],
    ['minRR', 'R:R mínimo', 'num', 0.1],
    ['reclaimBars', 'Velas para reclamar el valor', 'num', 1],
    ['failMode', 'Si no reclama', 'sel', [['be', 'Stop a break-even'], ['cut', 'Cortar'], ['off', 'Nada']]],
    ['trail', 'Trail tras la agresión', 'bool'],
    ['beAtR', 'Break-even a (R, 0 = no)', 'num', 0.25],
    ['maxHoldBars', 'Máx. velas en posición', 'num', 6],
    ['maxTrades', 'Máx. operaciones/día', 'num', 1],
    ['maxConsecLoss', 'Parar tras N pérdidas seguidas', 'num', 1],
    ['riskPct', 'Riesgo por operación %', 'num', 0.05],
    ['costBps', 'Coste por lado (pb)', 'num', 0.5],
    ['maxCostR', 'Coste máx. por operación (R)', 'num', 0.05],
  ]],
];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const $ = (s) => document.querySelector(s);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const S = {
  sym: SYMBOLS.find((s) => s.coin === store.get('cm.sym')) || SYMBOLS[0],
  cfg: { ...DEFAULTS, bubbleUsd: null, ...store.get('cm.cfg', {}) },
  bars: [], bars1: [],
  histReal: new Map(), liveReal: new Map(), histMins: new Set(), // minuto -> { buy, sell }
  histOrders: [], liveOrders: [],
  wsSince: Infinity,
  gex: null,
  binSize: 1, tick: 0.01, result: null,
  vpMode: store.get('cm.vp', 'visible'),
  showBubbles: store.get('cm.bubbles', true),
  showGex: store.get('cm.gexLines', true),
  loadId: 0,
};
const bubbleUsd = () => Math.max(S.cfg.bubbleUsd ?? S.sym.bubble, S.sym.rec);
const bubbles = () => S.histOrders.concat(S.liveOrders.filter((g) => g.usd >= bubbleUsd()));

// ───────── Gráfico
const hm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const fmtNY = (t) => { const p = nyParts(t * 1000); return { date: p.date.slice(5).replace('-', '/'), hm: hm(p.mins) }; };

const chart = createChart($('#chart'), {
  autoSize: true,
  layout: { background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, panes: { separatorColor: css('--border'), enableResize: true } },
  grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: css('--border') },
  timeScale: { borderColor: css('--border'), timeVisible: true, rightOffset: 8, tickMarkFormatter: (t, type) => (type <= 2 ? fmtNY(t).date : fmtNY(t).hm) },
  localization: { timeFormatter: (t) => { const f = fmtNY(t); return `${f.date} ${f.hm} NY`; } },
});
const sessSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'sess', priceLineVisible: false, lastValueVisible: false, base: 0 });
chart.priceScale('sess').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
const volSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'volume' } });
chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
const candles = chart.addSeries(CandlestickSeries, {
  upColor: css('--green'), downColor: css('--red'), borderVisible: false, wickUpColor: css('--green'), wickDownColor: css('--red'),
});
// Sin etiqueta en el eje: el último valor puede ser de la ventana de ayer (el de hoy va en la leyenda).
const lvl = (color, width, style) => chart.addSeries(LineSeries, {
  color, lineWidth: width, lineStyle: style, lineType: LineType.Simple,
  priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
});
const pocS = lvl(css('--orange'), 2, LineStyle.Solid);
const vahS = lvl(css('--blue'), 1, LineStyle.Solid);
const valS = lvl(css('--blue'), 1, LineStyle.Solid);
const zTopS = lvl(css('--yellow'), 1, LineStyle.Dashed);
const zMidS = lvl(css('--yellow'), 1, LineStyle.Dotted);
const zBotS = lvl(css('--yellow'), 2, LineStyle.Solid);
const markers = createSeriesMarkers(candles, []);
const cvdS = chart.addSeries(LineSeries, { color: css('--violet'), lineWidth: 2, priceLineVisible: false, title: 'CVD' }, 1);
cvdS.createPriceLine({ price: 0, color: css('--muted'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
chart.panes()[0].setStretchFactor(0.76);
chart.panes()[1].setStretchFactor(0.24);
let posLines = [], gexLines = [];

// ───────── Datos
async function fetchCandles(coin, tf) {
  const step = (tf === '1m' ? 60 : 300) * 1000, end = Date.now();
  const res = await fetch(HL_INFO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: tf, startTime: end - 5000 * step, endTime: end } }),
  });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  return (await res.json()).map((k) => ({ t: k.t / 1000, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
}

// Order flow por minuto que graba hl_recorder (el mismo endpoint que usa Fabio Model).
async function loadFlow(id) {
  let rows = [];
  try {
    const q = new URLSearchParams({ coin: S.sym.coin, from: String(S.bars1[0]?.t ?? S.bars[0].t), step: '60', min: String(bubbleUsd()) });
    const res = await fetch(`/fabioModel/flow?${q}`);
    if (res.ok) rows = await res.json();
  } catch { /* sin grabación: solo en vivo */ }
  if (id !== S.loadId) return;
  S.histReal.clear(); S.histMins.clear(); S.histOrders = [];
  for (const r of rows) {
    S.histReal.set(r.t, { buy: r.b, sell: r.s });
    for (const m of r.m) S.histMins.add(m);
    for (const [, side, usd, px] of r.o) S.histOrders.push({ bucket: Math.floor(r.t / 300) * 300, side, usd, px });
  }
}

async function loadGex() {
  if (!S.sym.gex) { S.gex = null; return; }
  try {
    const res = await fetch(`/CreamerModel/gex?sym=${S.sym.gex}`);
    S.gex = res.ok ? await res.json() : null;
  } catch { S.gex = null; }
}

// La hora de la cotización de CBOE viene en hora de NY sin zona: se pasa a epoch probando -4 h / -5 h.
function nyLocalToEpoch(s) {
  for (const off of [4, 5]) {
    const t = Date.parse(`${s}Z`) + off * 3600e3;
    const p = nyParts(t);
    if (`${p.date}T${hm(p.mins)}` === s.slice(0, 16)) return t / 1000;
  }
  return null;
}

// Precio del subyacente → precio del perp: ratio con la vela del perp a la hora de la cotización.
function gexRatio() {
  const g = S.gex?.latest;
  if (!g || !S.bars.length) return null;
  const qt = g.quoteTime && nyLocalToEpoch(g.quoteTime);
  let bar = S.bars.at(-1);
  if (qt) for (let i = S.bars.length - 1; i >= 0; i--) if (S.bars[i].t <= qt) { bar = S.bars[i]; break; }
  return bar.c / g.spot;
}

async function load() {
  const id = ++S.loadId;
  setStatus('cargando', 'Cargando velas…');
  closeWs();
  S.histReal.clear(); S.liveReal.clear(); S.histMins.clear(); S.histOrders = []; S.liveOrders = [];
  try {
    const [bars, bars1] = await Promise.all([fetchCandles(S.sym.coin, '5m'), fetchCandles(S.sym.coin, '1m'), loadGex()]);
    if (id !== S.loadId) return;
    S.bars = annotate(bars, S.sym.cutoff);
    S.bars1 = annotate(bars1, S.sym.cutoff);
    for (const b of S.bars) b.d = estimateDelta(b);
    S.binSize = autoBinSize(S.bars);
    S.tick = tickSize(S.bars);
    S.vpCache = null;
    await loadFlow(id);
    if (id !== S.loadId) return;
    recompute(true);
    chart.timeScale().setVisibleLogicalRange({ from: S.bars.length - 300, to: S.bars.length + 8 });
    openWs(id);
  } catch (e) {
    setStatus('error', `No se pudieron cargar las velas: ${e.message}`);
  }
}
setInterval(async () => { await loadGex(); recompute(false); }, 15 * 60e3);

// ───────── Tiempo real
let ws = null, pingTimer = null;
function closeWs() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  clearInterval(pingTimer);
  S.wsSince = Infinity;
}
function openWs(id) {
  ws = new WebSocket(HL_WS);
  ws.onopen = () => {
    S.wsSince = Date.now();
    for (const interval of ['5m', '1m']) ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'candle', coin: S.sym.coin, interval } }));
    ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin: S.sym.coin } }));
    pingTimer = setInterval(() => ws && ws.readyState === 1 && ws.send(JSON.stringify({ method: 'ping' })), 45000);
    setStatus('live', 'En vivo');
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.channel === 'candle') onCandle(m.data);
    else if (m.channel === 'trades') onTrades(m.data);
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    S.wsSince = Infinity;
    setStatus('error', 'Conexión perdida, reintentando…');
    setTimeout(() => { if (id === S.loadId) load(); }, 4000);
  };
}

function onCandle(k) {
  if (k.s !== S.sym.coin) return;
  const list = k.i === '5m' ? S.bars : k.i === '1m' ? S.bars1 : null;
  if (!list) return;
  const b = { t: k.t / 1000, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
  const last = list.at(-1);
  if (!last || b.t < last.t) return;
  if (b.t === last.t) Object.assign(last, b);
  else { list.push(b); annotate(list, S.sym.cutoff); }
  schedule(k.i === '5m' && b.t !== last.t);
}

function onTrades(list) {
  const groups = new Map();
  for (const t of list) {
    if (t.coin !== S.sym.coin) continue;
    const minute = Math.floor(t.time / 60000) * 60;
    if (S.histMins.has(minute)) continue; // ya viene del grabador
    let r = S.liveReal.get(minute);
    if (!r) { r = { buy: 0, sell: 0 }; S.liveReal.set(minute, r); }
    const sz = +t.sz;
    if (t.side === 'B') r.buy += sz; else r.sell += sz;
    // Una orden que barre varios niveles llega troceada con el mismo hash.
    const key = `${t.hash}|${t.side}`;
    const g = groups.get(key) || { bucket: Math.floor(minute / 300) * 300, side: t.side, usd: 0, px: +t.px };
    g.usd += sz * +t.px;
    groups.set(key, g);
  }
  for (const g of groups.values()) if (g.usd >= S.sym.rec) S.liveOrders.push(g);
  schedule(false);
}

let pending = null, pendingNewBar = false;
function schedule(newBar) {
  pendingNewBar ||= newBar;
  if (pending) return;
  pending = setTimeout(() => { pending = null; const nb = pendingNewBar; pendingNewBar = false; recompute(nb); }, 400);
}

// ───────── Cálculo + pintado
const covered = (m) => S.histMins.has(m) || m * 1000 >= S.wsSince;
const realMin = { get: (m) => S.histReal.get(m) || S.liveReal.get(m) };

function recompute(full) {
  const bars = S.bars;
  if (!bars.length) return;
  const big = new Map();
  for (const g of bubbles()) {
    const e = big.get(g.bucket) || { buy: 0, sell: 0 };
    if (g.side === 'B') e.buy += g.usd; else e.sell += g.usd;
    big.set(g.bucket, e);
  }
  attachFlow(bars, S.bars1, realMin, covered, big, S.cfg.extFrac);
  if (full || S.profilesDay !== bars.at(-1).day) {
    S.profiles = dayProfiles(bars, S.binSize, { weekends: S.cfg.weekends, vaPct: S.cfg.vaPct });
    S.profilesDay = bars.at(-1).day;
  }
  const res = simulate(bars, S.cfg, { binSize: S.binSize, tick: S.tick, closedCount: bars.length - 1, profiles: S.profiles, gex: S.gex?.history || {} });
  S.result = res;
  if (full) S.vpCache = null;

  const green = css('--green'), red = css('--red');
  candles.setData(bars.map(({ t, o, h, l, c }) => ({ time: t, open: o, high: h, low: l, close: c })));
  volSeries.setData(bars.map((b) => ({ time: b.t, value: b.v, color: (b.d >= 0 ? green : red) + '66' })));
  const inWin = (b) => (S.cfg.weekends || b.weekday) && ((b.nyMin >= S.cfg.winStart && b.nyMin < S.cfg.winStart + S.cfg.winMin) || (S.cfg.asia && b.nyMin >= 1200 && b.nyMin < 1380));
  sessSeries.setData(bars.map((b) => ({ time: b.t, value: 1, color: inWin(b) ? css('--sess-ny') : 'transparent' })));
  // Lightweight Charts une los huecos: en ellos se repite el último valor en transparente, y también
  // es transparente el primer punto tras el hueco, para que no se dibuje el salto.
  const line = (arr, key) => {
    let last = null, afterGap = true;
    return arr.flatMap((l) => {
      if (l.gap) { afterGap = true; return last === null ? [{ time: l.t }] : [{ time: l.t, value: last, color: 'transparent' }]; }
      last = l[key];
      const p = afterGap ? { time: l.t, value: last, color: 'transparent' } : { time: l.t, value: last };
      afterGap = false;
      return [p];
    });
  };
  pocS.setData(line(res.value, 'poc')); vahS.setData(line(res.value, 'vah')); valS.setData(line(res.value, 'val'));
  zTopS.setData(line(res.zone, 'top')); zMidS.setData(line(res.zone, 'mid')); zBotS.setData(line(res.zone, 'bot'));
  cvdS.setData(res.cvd.map((p) => ({ time: p.t, value: p.v })));

  setMarkers(res);
  setPositionLines(res.pos);
  setGexLines();
  renderPanels(res);
  vpDirty = true;
}

function setMarkers(res) {
  const ms = [];
  const minT = S.bars[0].t, maxT = S.bars.at(-1).t;
  for (const g of S.showBubbles ? bubbles() : []) {
    if (g.bucket < minT || g.bucket > maxT) continue;
    const size = Math.min(3, 0.8 + Math.log2(g.usd / bubbleUsd()));
    ms.push({ time: g.bucket, position: 'atPriceMiddle', price: g.px, shape: 'circle', color: (g.side === 'B' ? css('--green') : css('--red')) + 'bb', size });
  }
  for (const a of res.absMarks) {
    ms.push({ time: a.t, position: a.side === 'L' ? 'belowBar' : 'aboveBar', shape: 'square', color: css('--violet'), size: 0.7, text: 'abs' });
  }
  for (const tr of res.trades) {
    const long = tr.side === 'L';
    ms.push({ time: tr.entryT, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: css('--yellow'), text: long ? 'L' : 'S' });
    ms.push({ time: tr.exitT, position: long ? 'aboveBar' : 'belowBar', shape: 'square', color: tr.r > 0 ? css('--green') : css('--red'), text: `${tr.r > 0 ? '+' : ''}${tr.r.toFixed(1)}R` });
  }
  if (res.pos && !res.pos.pending) {
    const long = res.pos.side === 'L';
    ms.push({ time: res.pos.entryT, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: css('--yellow'), text: `${long ? 'L' : 'S'} (abierta)` });
  }
  ms.sort((a, b) => a.time - b.time);
  markers.setMarkers(ms);
}

function setPositionLines(pos) {
  for (const l of posLines) candles.removePriceLine(l);
  posLines = [];
  if (!pos) return;
  posLines.push(candles.createPriceLine({ price: pos.stop, color: css('--red'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: pos.be ? 'BE' : pos.trailed ? 'Trail' : 'Stop' }));
  posLines.push(candles.createPriceLine({ price: pos.tp, color: css('--green'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Objetivo' }));
  if (!pos.pending) posLines.push(candles.createPriceLine({ price: pos.entry, color: css('--yellow'), lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'Entrada' }));
}

function setGexLines() {
  for (const l of gexLines) candles.removePriceLine(l);
  gexLines = [];
  const g = S.gex?.latest, k = gexRatio();
  if (!S.showGex || !g || !k) return;
  const add = (px, color, title, style) => px && gexLines.push(candles.createPriceLine({ price: px * k, color, lineWidth: 1, lineStyle: style, title, axisLabelVisible: true }));
  add(g.callWall, css('--green'), 'Call wall', LineStyle.LargeDashed);
  add(g.putWall, css('--red'), 'Put wall', LineStyle.LargeDashed);
  add(g.flip, css('--gray'), 'Gamma flip', LineStyle.SparseDotted);
}

// ───────── Perfil de volumen (rango visible / día actual / valor de referencia)
const vpCanvas = $('#vp');
let vpDirty = true, vpSig = '';

function vpProfile() {
  const bars = S.bars;
  if (!bars.length) return null;
  if (S.vpMode === 'ref') {
    const d = S.result?.day;
    return (S.cfg.valueRef === 'prev' ? d?.prev : d?.on || d?.onPreview) || null;
  }
  let from, to;
  if (S.vpMode === 'day') {
    const day = bars.at(-1).day;
    to = bars.length - 1; from = to;
    while (from > 0 && bars[from - 1].day === day) from--;
  } else {
    const r = chart.timeScale().getVisibleLogicalRange();
    if (!r) return null;
    from = Math.max(0, Math.floor(r.from)); to = Math.min(bars.length - 1, Math.ceil(r.to));
  }
  if (to < from) return null;
  const key = `${S.vpMode}|${from}|${to}|${bars.length}|${bars.at(-1).v}`;
  if (S.vpCache?.key === key) return S.vpCache.p;
  const slice = bars.slice(from, to + 1);
  let hi = -Infinity, lo = Infinity;
  for (const b of slice) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); }
  const bin = S.vpMode === 'visible' ? Math.max(S.binSize / 4, (hi - lo) / 90) : S.binSize;
  const p = buildProfile(slice, bin, S.cfg.vaPct / 100);
  S.vpCache = { key, p };
  return p;
}

function drawVP() {
  const p = vpProfile();
  const size = chart.paneSize(0);
  const dpr = window.devicePixelRatio || 1;
  const top = p ? candles.priceToCoordinate(p.kMin * p.binSize) : null;
  const sig = `${size.width}x${size.height}|${dpr}|${top}|${p && candles.priceToCoordinate((p.kMin + p.vols.length) * p.binSize)}|${S.vpCache?.key}|${S.vpMode}|${p?.total}`;
  if (!vpDirty && sig === vpSig) return;
  vpDirty = false; vpSig = sig;
  vpCanvas.style.width = `${size.width}px`;
  vpCanvas.style.height = `${size.height}px`;
  vpCanvas.width = Math.round(size.width * dpr);
  vpCanvas.height = Math.round(size.height * dpr);
  const ctx = vpCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  if (!p) return;
  const maxW = Math.min(220, size.width * 0.24);
  let vmax = 0;
  for (const v of p.vols) vmax = Math.max(vmax, v);
  if (!vmax) return;
  const green = css('--green'), red = css('--red'), orange = css('--orange');
  for (let i = 0; i < p.vols.length; i++) {
    const yTop = candles.priceToCoordinate((p.kMin + i + 1) * p.binSize);
    const yBot = candles.priceToCoordinate((p.kMin + i) * p.binSize);
    if (yTop === null || yBot === null) continue;
    const h = Math.max(1, yBot - yTop - 0.5);
    const w = (p.vols[i] / vmax) * maxW;
    const alpha = i >= p.vaLo && i <= p.vaHi ? 'aa' : '44';
    const buy = Math.max(0, Math.min(1, (p.vols[i] + p.deltas[i]) / (2 * p.vols[i] || 1)));
    const x0 = size.width - w;
    if (i === p.pocIdx) { ctx.fillStyle = orange + 'cc'; ctx.fillRect(x0, yTop, w, h); continue; }
    ctx.fillStyle = green + alpha; ctx.fillRect(x0, yTop, w * buy, h);
    ctx.fillStyle = red + alpha; ctx.fillRect(x0 + w * buy, yTop, w * (1 - buy), h);
  }
}
(function loop() { try { drawVP(); } catch { /* el gráfico aún no tiene tamaño */ } requestAnimationFrame(loop); })();
chart.timeScale().subscribeVisibleLogicalRangeChange(() => { vpDirty = true; });

// ───────── Paneles
const fmtPx = (x) => (x == null || Number.isNaN(x) ? '—' : x.toLocaleString('es-ES', { maximumFractionDigits: S.tick < 1 ? 2 : 1 }));
const fmtUsd = (x) => `${(x / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })}k $`;
const REG = { pos: 'positiva', neg: 'negativa' };

function renderPanels(res) {
  const last = S.bars.at(-1);
  const d = res.day;
  const ref = S.cfg.valueRef === 'prev' ? d?.prev : d?.on || d?.onPreview;
  $('#lg-sym').textContent = S.sym.label;
  $('#lg-px').textContent = fmtPx(last.c);
  $('#lg-poc').textContent = fmtPx(ref?.poc);
  $('#lg-vah').textContent = fmtPx(ref?.vah);
  $('#lg-val').textContent = fmtPx(ref?.val);
  $('#lg-cvd').textContent = res.cvd.length ? Math.round(res.cvd.at(-1).v).toLocaleString('es-ES') : '—';
  $('#lg-ref').textContent = { ldn: 'Londres', on: 'Overnight', prev: 'Día previo' }[S.cfg.valueRef];

  const st = res.state || {};
  const winTxt = `${hm(S.cfg.winStart)}-${hm(S.cfg.winStart + S.cfg.winMin)} NY`;
  $('#st-win').textContent = st.win ? `Ventana ${st.win} abierta · ${st.trades}/${S.cfg.maxTrades} ops hoy` : `Fuera de ventana (${winTxt})`;
  $('#st-win').dataset.on = st.win ? '1' : '0';
  $('#st-env').textContent = st.struct || '—';
  const g = S.gex?.latest, k = gexRatio();
  $('#st-gex').textContent = S.sym.gex
    ? g ? `${st.reg}. ${S.sym.gex} ${g.spot} · flip ${g.flip ?? '—'} · call wall ${g.callWall} · put wall ${g.putWall}${k ? ` (en ${S.sym.coin.replace('xyz:', '')}: flip ${fmtPx(g.flip * k)}, call ${fmtPx(g.callWall * k)}, put ${fmtPx(g.putWall * k)})` : ''}` : 'GEX no disponible ahora mismo.'
    : `${st.reg}. Sin opciones líquidas gratis para ${S.sym.label}: régimen manual en Ajustes.`;
  $('#st-loc').textContent = st.loc || '—';
  $('#st-conf').textContent = st.conf || '—';
  let pos = 'Sin posición.';
  if (res.pos) {
    const p = res.pos, long = p.side === 'L';
    pos = p.pending
      ? `Señal ${long ? 'larga' : 'corta'}: entra a la apertura de la próxima vela · stop ${fmtPx(p.stop)} · objetivo ${fmtPx(p.tp)}`
      : `${long ? 'Larga' : 'Corta'} desde ${fmtPx(p.entry)} · stop ${fmtPx(p.stop)}${p.be ? ' (BE)' : p.trailed ? ' (trail)' : ''} · objetivo ${fmtPx(p.tp)} · ${p.reclaimed ? 'valor reclamado' : `pendiente de reclamar ${fmtPx(p.edge)}`}`;
  }
  $('#st-pos').textContent = pos;

  const real = S.bars.filter((b) => b.hasReal);
  const intra = S.bars.filter((b) => b.intra);
  $('#st-flow').textContent = `Delta dentro de la vela (velas de 1m) desde ${intra.length ? `${fmtNY(intra[0].t).date} ${fmtNY(intra[0].t).hm}` : '—'} NY · `
    + (real.length ? `order flow real desde ${fmtNY(real[0].t).date} ${fmtNY(real[0].t).hm} NY` : 'sin order flow grabado en este tramo')
    + ` · burbujas ≥ ${fmtUsd(bubbleUsd())}`;

  const all = stats(res.trades);
  const row = (name, s) => `<tr><th>${name}</th><td>${s.n}</td><td>${s.n ? `${Math.round(s.win * 100)} %` : '—'}</td>`
    + `<td class="${s.total > 0 ? 'pos' : s.total < 0 ? 'neg' : ''}">${s.n ? `${s.total > 0 ? '+' : ''}${s.total.toFixed(2)} R` : '—'}</td>`
    + `<td>${s.n ? (Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞') : '—'}</td><td>${s.n ? `${s.dd.toFixed(2)} R` : '—'}</td></tr>`;
  $('#stats tbody').innerHTML = row('Total', all) + row('Largos', stats(res.trades.filter((t) => t.side === 'L')))
    + row('Cortos', stats(res.trades.filter((t) => t.side === 'S')))
    + row('Con flujo real', stats(res.trades.filter((t) => t.real)));
  const days = new Set(S.bars.map((b) => b.day)).size;
  $('#stats-note').textContent = `${days} días de historia (${S.bars.length} velas de 5m) · ${res.absMarks.length} absorciones en zona. Referencia de Chris: 60-65 % de acierto, PF ~1,8, 1,5-2 R. En % de cuenta: ${all.n ? `${(all.total * S.cfg.riskPct).toFixed(2)} %` : '—'} con ${S.cfg.riskPct} % por operación. Costes incluidos.`;

  $('#trades').hidden = !res.trades.length;
  $('#trades-empty').hidden = !!res.trades.length;
  $('#trades tbody').innerHTML = res.trades.slice().reverse().slice(0, 40).map((t) => {
    const f = fmtNY(t.entryT);
    return `<tr><td>${f.date} ${f.hm}</td><td>${t.side === 'L' ? 'Largo' : 'Corto'}</td>`
      + `<td>${fmtPx(t.entry)}</td><td>${fmtPx(t.stop0)}</td><td>${fmtPx(t.tp)}</td><td>${fmtPx(t.exitPx)}</td>`
      + `<td>${t.reason}</td><td>${t.real ? 'real' : 'estimado'}</td><td>${REG[t.regime] || '—'}</td>`
      + `<td class="${t.r > 0 ? 'pos' : 'neg'}">${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}</td></tr>`;
  }).join('');
}

function setStatus(kind, text) {
  $('#status').dataset.kind = kind;
  $('#status-text').textContent = text;
}

// ───────── Controles
function saveCfg() { store.set('cm.cfg', S.cfg); }

function buildControls() {
  const symSel = $('#sym');
  symSel.innerHTML = SYMBOLS.map((s) => `<option value="${s.coin}">${s.label}</option>`).join('');
  symSel.value = S.sym.coin;
  symSel.onchange = () => {
    S.sym = SYMBOLS.find((s) => s.coin === symSel.value);
    S.cfg.bubbleUsd = null;
    store.set('cm.sym', S.sym.coin);
    saveCfg();
    buildSettings();
    load();
  };
  for (const btn of document.querySelectorAll('[data-vp]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.vp === S.vpMode));
    btn.onclick = () => {
      S.vpMode = btn.dataset.vp; store.set('cm.vp', S.vpMode); S.vpCache = null; vpDirty = true;
      document.querySelectorAll('[data-vp]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    };
  }
  const bub = $('#bubbles');
  bub.checked = S.showBubbles;
  bub.onchange = () => { S.showBubbles = bub.checked; store.set('cm.bubbles', S.showBubbles); recompute(false); };
  const gx = $('#gexlines');
  gx.checked = S.showGex;
  gx.onchange = () => { S.showGex = gx.checked; store.set('cm.gexLines', S.showGex); setGexLines(); };
  const applyPreset = (cfg) => { S.cfg = cfg; saveCfg(); buildSettings(); recompute(true); };
  $('#reset').onclick = () => applyPreset({ ...DEFAULTS, bubbleUsd: null });
  $('#preset-strict').onclick = () => applyPreset({ ...DEFAULTS, bubbleUsd: S.cfg.bubbleUsd });
  $('#preset-lax').onclick = () => applyPreset({ ...DEFAULTS, ...LAX, bubbleUsd: S.cfg.bubbleUsd });
}

function buildSettings() {
  const root = $('#settings-grid');
  root.innerHTML = '';
  for (const [group, fields] of FIELDS) {
    const fs = document.createElement('fieldset');
    fs.innerHTML = `<legend>${group}</legend>`;
    for (const [key, label, type, extra] of fields) {
      const id = `cfg-${key}`;
      const val = key === 'bubbleUsd' ? bubbleUsd() : S.cfg[key];
      const wrap = document.createElement('label');
      wrap.className = type === 'bool' ? 'f f-bool' : 'f';
      wrap.htmlFor = id;
      if (type === 'bool') wrap.innerHTML = `<input type="checkbox" id="${id}" ${val ? 'checked' : ''}><span>${label}</span>`;
      else if (type === 'sel') wrap.innerHTML = `<span>${label}</span><select id="${id}">${extra.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      else wrap.innerHTML = `<span>${label}</span><input type="number" id="${id}" step="${extra}" value="${val}">`;
      const input = wrap.querySelector('input,select');
      input.onchange = () => {
        S.cfg[key] = type === 'bool' ? input.checked : type === 'sel' ? input.value : Number(input.value);
        saveCfg();
        if (key === 'bubbleUsd') loadFlow(S.loadId).then(() => recompute(true));
        else recompute(true);
      };
      fs.appendChild(wrap);
    }
    root.appendChild(fs);
  }
}

buildControls();
buildSettings();
load();
