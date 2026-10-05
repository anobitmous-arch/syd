import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  LineStyle, LineType, CrosshairMode,
} from './lightweight-charts.mjs';
import {
  annotate, simulate, buildProfile, dayProfiles, autoBinSize, tickSize, estimateDelta, nyParts, DEFAULTS, stats,
} from './engine.js';

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const HL_WS = 'wss://api.hyperliquid.xyz/ws';

const SYMBOLS = [
  // rec = orden mínima que guarda hl_recorder (FLOW en stack/bertrader/recorder/docker-compose.yml)
  { coin: 'xyz:XYZ100', label: 'Nasdaq 100 · XYZ100', bubble: 25000, rec: 5000, cutoff: 'ny18' },
  { coin: 'xyz:SP500', label: 'S&P 500 · SP500', bubble: 25000, rec: 5000, cutoff: 'ny18' },
  { coin: 'BTC', label: 'BTC', bubble: 250000, rec: 50000, cutoff: 'utc0' },
  { coin: 'ETH', label: 'ETH', bubble: 150000, rec: 30000, cutoff: 'utc0' },
  { coin: 'SOL', label: 'SOL', bubble: 50000, rec: 10000, cutoff: 'utc0' },
  { coin: 'HYPE', label: 'HYPE', bubble: 50000, rec: 10000, cutoff: 'utc0' },
];
const TFS = { '1m': 60, '5m': 300 };

// Ajustes editables: [clave, etiqueta, tipo, paso | opciones]
const FIELDS = [
  ['Modelos', [
    ['useM1', 'Modelo 1 · tendencia (NY)', 'bool'],
    ['useM2', 'Modelo 2 · reversión (Londres)', 'bool'],
    ['m2InNY', 'Modelo 2 también en NY', 'bool'],
    ['weekends', 'Operar fines de semana', 'bool'],
  ]],
  ['Perfil y agresión', [
    ['vaPct', 'Value Area %', 'num', 1],
    ['bubbleUsd', 'Burbuja real ≥ (USD)', 'num', 5000],
    ['useReal', 'Usar burbujas reales cuando haya', 'bool'],
    ['volMult', 'Proxy: volumen ≥ media ×', 'num', 0.1],
    ['volLen', 'Proxy: media de volumen (velas)', 'num', 1],
    ['deltaMin', 'Proxy: |delta|/volumen mín.', 'num', 0.05],
    ['bodyMin', 'Cuerpo/rango mín. (vela llena)', 'num', 0.05],
    ['useCvd', 'Exigir CVD a favor', 'bool'],
    ['cvdLen', 'Pendiente CVD (velas)', 'num', 1],
  ]],
  ['Localización', [
    ['impLen', 'M1: velas del origen del impulso', 'num', 1],
    ['retrFrac', 'M1: retroceso mín. del impulso', 'num', 0.01],
    ['retestBins', 'M2: tolerancia retest (niveles)', 'num', 1],
  ]],
  ['Gestión', [
    ['stopTicks', 'Stop: ticks tras la vela', 'num', 1],
    ['beAtR', 'Break-even a (R)', 'num', 0.25],
    ['m1Target', 'Objetivo M1', 'sel', [['prevday', 'Máx/mín día previo'], ['r', 'R fijo']]],
    ['m1R', 'R fijo M1 (y respaldo)', 'num', 0.5],
    ['minRR', 'R:R mínimo', 'num', 0.25],
    ['riskPct', 'Riesgo por operación %', 'num', 0.05],
    ['maxDayDD', 'Pérdida máx. diaria %', 'num', 0.25],
    ['maxTrades', 'Máx. operaciones/día', 'num', 1],
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
  sym: SYMBOLS.find((s) => s.coin === store.get('fm.sym')) || SYMBOLS[0],
  tf: store.get('fm.tf', '1m'),
  cfg: { ...DEFAULTS, bubbleUsd: null, ...store.get('fm.cfg', {}) },
  bars: [],
  histReal: new Map(), // inicio de vela -> volumen agresor { buy, sell } grabado
  liveReal: new Map(), // ídem, en vivo (nunca de minutos que ya trae el grabador)
  histMins: new Set(), // minutos que vienen completos del grabador
  histOrders: [], // órdenes grandes grabadas (ya filtradas por el umbral actual)
  liveOrders: [], // órdenes grandes en vivo (>= rec del mercado)
  wsSince: Infinity,
  binSize: 1,
  tick: 0.01,
  result: null,
  vpMode: store.get('fm.vp', 'visible'),
  showProxy: store.get('fm.proxy', true),
  loadId: 0,
};
const bubbleUsd = () => Math.max(S.cfg.bubbleUsd ?? S.sym.bubble, S.sym.rec);
const bubbles = () => S.histOrders.concat(S.liveOrders.filter((g) => g.usd >= bubbleUsd()));

// ───────── Gráfico
const fmtNY = (t) => {
  const p = nyParts(t * 1000);
  return { date: p.date.slice(5).replace('-', '/'), hm: `${String(Math.floor(p.mins / 60)).padStart(2, '0')}:${String(p.mins % 60).padStart(2, '0')}` };
};

const chartEl = $('#chart');
const chart = createChart(chartEl, {
  autoSize: true,
  layout: { background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, panes: { separatorColor: css('--border'), enableResize: true } },
  grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: css('--border') },
  timeScale: {
    borderColor: css('--border'), timeVisible: true, rightOffset: 8,
    tickMarkFormatter: (t, type) => (type <= 2 ? fmtNY(t).date : fmtNY(t).hm),
  },
  localization: { timeFormatter: (t) => { const f = fmtNY(t); return `${f.date} ${f.hm} NY`; } },
});

const sessSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'sess', priceLineVisible: false, lastValueVisible: false, base: 0 });
chart.priceScale('sess').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
const volSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'volume' } });
chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
const candles = chart.addSeries(CandlestickSeries, {
  upColor: css('--green'), downColor: css('--red'), borderVisible: false,
  wickUpColor: css('--green'), wickDownColor: css('--red'),
});
const lvl = (color, width, style, title) => chart.addSeries(LineSeries, {
  color, lineWidth: width, lineStyle: style, lineType: LineType.WithSteps, title,
  priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
});
const pocS = lvl(css('--orange'), 2, LineStyle.Solid, 'POC');
const vahS = lvl(css('--blue'), 1, LineStyle.Solid, 'VAH');
const valS = lvl(css('--blue'), 1, LineStyle.Solid, 'VAL');
const pHiS = lvl(css('--gray'), 1, LineStyle.Dashed, 'Máx prev');
const pLoS = lvl(css('--gray'), 1, LineStyle.Dashed, 'Mín prev');
const markers = createSeriesMarkers(candles, []);

const cvdS = chart.addSeries(LineSeries, { color: css('--violet'), lineWidth: 2, priceLineVisible: false, title: 'CVD' }, 1);
cvdS.createPriceLine({ price: 0, color: css('--muted'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
chart.panes()[0].setStretchFactor(0.76);
chart.panes()[1].setStretchFactor(0.24);

let posLines = [];

// ───────── Datos
async function fetchCandles(coin, tf) {
  const step = TFS[tf] * 1000, end = Date.now();
  const res = await fetch(HL_INFO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: tf, startTime: end - 5000 * step, endTime: end } }),
  });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  const arr = await res.json();
  return arr.map((k) => ({ t: k.t / 1000, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
}

// Perfiles del día previo. Hyperliquid solo guarda las últimas 5000 velas de 1m (~3,5 días): el
// viernes llega cortado al lunes. Los días salen de las velas de 5m (17 días) y, si un día está
// completo en 1m, se usa el de 1m. Así los niveles son los mismos en 1m y en 5m.
function buildDayProfiles() {
  const merged = new Map(dayProfiles(S.bars5, S.binSize, S.cfg));
  if (S.bars !== S.bars5) for (const [day, p] of dayProfiles(S.bars, S.binSize, S.cfg)) merged.set(day, p);
  S.profiles = [...merged].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  S.profilesDay = S.bars.at(-1)?.day;
}

// Order flow por minuto que graba hl_recorder, agregado al marco de la vela.
async function fetchFlow(coin, tf, from) {
  const q = new URLSearchParams({ coin, from: String(from), step: String(TFS[tf]), min: String(bubbleUsd()) });
  const res = await fetch(`/fabioModel/flow?${q}`);
  if (!res.ok) throw new Error(`flow ${res.status}`);
  return res.json();
}

async function loadFlow(id) {
  let rows = [];
  try { rows = await fetchFlow(S.sym.coin, S.tf, S.bars[0].t); } catch { /* sin grabación: solo en vivo */ }
  if (id !== S.loadId) return;
  S.histMins.clear();
  S.histOrders = [];
  S.histReal.clear();
  for (const r of rows) {
    S.histReal.set(r.t, { buy: r.b, sell: r.s });
    for (const m of r.m) S.histMins.add(m);
    for (const [, side, usd, px] of r.o) S.histOrders.push({ bucket: r.t, side, usd, px });
  }
}

// Una vela usa el delta real si todos sus minutos están cubiertos (grabados o en vivo desde que abriste).
const covered = (m) => S.histMins.has(m) || m * 1000 >= S.wsSince;

function applyReal(b, big) {
  const h = S.histReal.get(b.t), l = S.liveReal.get(b.t);
  const r = h || l ? { buy: (h?.buy || 0) + (l?.buy || 0), sell: (h?.sell || 0) + (l?.sell || 0) } : null;
  let full = !!r;
  for (let m = b.t; full && m < b.t + TFS[S.tf]; m += 60) full = covered(m);
  const g = big.get(b.t);
  if (full) {
    b.d = r.buy - r.sell; b.hasReal = true; b.bigBuy = g?.buy || 0; b.bigSell = g?.sell || 0;
  } else {
    b.d = estimateDelta(b); b.hasReal = false; b.bigBuy = 0; b.bigSell = 0;
  }
}

async function load() {
  const id = ++S.loadId;
  setStatus('cargando', 'Cargando velas…');
  closeWs();
  S.histReal.clear(); S.liveReal.clear(); S.histMins.clear(); S.histOrders = []; S.liveOrders = [];
  try {
    const [bars, bars5] = await Promise.all([
      fetchCandles(S.sym.coin, S.tf),
      S.tf === '5m' ? null : fetchCandles(S.sym.coin, '5m'),
    ]);
    if (id !== S.loadId) return;
    S.bars = bars;
    S.bars5 = bars5 || bars;
    annotate(S.bars, S.sym.cutoff);
    annotate(S.bars5, S.sym.cutoff);
    for (const b of S.bars5) b.d = estimateDelta(b);
    S.binSize = autoBinSize(S.bars5);
    S.tick = tickSize(S.bars);
    S.vpCache = null;
    await loadFlow(id);
    if (id !== S.loadId) return;
    recompute(true);
    chart.timeScale().setVisibleLogicalRange({ from: S.bars.length - (S.tf === '1m' ? 420 : 300), to: S.bars.length + 8 });
    openWs(id);
  } catch (e) {
    setStatus('error', `No se pudieron cargar las velas: ${e.message}`);
  }
}

// ───────── Tiempo real (velas + trades con lado agresor)
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
    ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'candle', coin: S.sym.coin, interval: S.tf } }));
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
  if (k.s !== S.sym.coin || k.i !== S.tf) return;
  const b = { t: k.t / 1000, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
  const last = S.bars.at(-1);
  if (!last || b.t < last.t) return;
  if (b.t === last.t) Object.assign(last, b);
  else { S.bars.push(b); annotate(S.bars, S.sym.cutoff); }
  schedule(b.t !== last.t);
}

function onTrades(list) {
  const step = TFS[S.tf];
  const groups = new Map();
  for (const t of list) {
    if (t.coin !== S.sym.coin) continue;
    // Minutos que ya trae el grabador: no contarlos dos veces.
    if (S.histMins.has(Math.floor(t.time / 60000) * 60)) continue;
    const bucket = Math.floor(t.time / 1000 / step) * step;
    let r = S.liveReal.get(bucket);
    if (!r) { r = { buy: 0, sell: 0 }; S.liveReal.set(bucket, r); }
    const sz = +t.sz;
    if (t.side === 'B') r.buy += sz; else r.sell += sz;
    // Una orden agresiva que barre varios niveles llega troceada con el mismo hash.
    const key = `${t.hash}|${t.side}`;
    const g = groups.get(key) || { bucket, side: t.side, usd: 0, px: +t.px };
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
function recompute(full) {
  const bars = S.bars;
  if (!bars.length) return;
  const big = new Map();
  for (const g of bubbles()) {
    const e = big.get(g.bucket) || { buy: 0, sell: 0 };
    if (g.side === 'B') e.buy += g.usd; else e.sell += g.usd;
    big.set(g.bucket, e);
  }
  for (const b of bars) applyReal(b, big);
  if (full || S.profilesDay !== bars.at(-1).day) buildDayProfiles();
  const res = simulate(bars, S.cfg, S.binSize, S.tick, bars.length - 1, S.profiles);
  S.result = res;
  if (full) S.vpCache = null;

  const green = css('--green'), red = css('--red');
  candles.setData(bars.map(({ t, o, h, l, c }) => ({ time: t, open: o, high: h, low: l, close: c })));
  volSeries.setData(bars.map((b) => ({ time: b.t, value: b.v, color: (b.d >= 0 ? green : red) + '66' })));
  const tradable = (b) => S.cfg.weekends || b.weekday;
  sessSeries.setData(bars.map((b) => ({
    time: b.t, value: 1,
    color: tradable(b) && b.inNY ? css('--sess-ny') : tradable(b) && b.inLDN ? css('--sess-ldn') : 'transparent',
  })));
  const line = (key) => res.levels.map((l) => (l.gap ? { time: l.t } : { time: l.t, value: l[key] }));
  pocS.setData(line('poc')); vahS.setData(line('vah')); valS.setData(line('val'));
  pHiS.setData(line('high')); pLoS.setData(line('low'));
  cvdS.setData(res.cvd.map((p) => ({ time: p.t, value: p.v })));

  setMarkers(res);
  setPositionLines(res.pos);
  renderPanels(res);
  vpDirty = true;
}

function setMarkers(res) {
  const ms = [];
  if (S.showProxy) {
    for (const t of res.aggBuy) ms.push({ time: t, position: 'belowBar', shape: 'circle', color: css('--green') + '99', size: 0.6 });
    for (const t of res.aggSell) ms.push({ time: t, position: 'aboveBar', shape: 'circle', color: css('--red') + '99', size: 0.6 });
  }
  const minT = S.bars[0].t, maxT = S.bars.at(-1).t;
  for (const g of bubbles()) {
    if (g.bucket < minT || g.bucket > maxT) continue;
    const size = Math.min(3, 0.8 + Math.log2(g.usd / bubbleUsd()));
    ms.push({ time: g.bucket, position: 'atPriceMiddle', price: g.px, shape: 'circle', color: g.side === 'B' ? css('--green') : css('--red'), size });
  }
  for (const tr of res.trades) {
    const long = tr.side === 'L';
    ms.push({ time: tr.entryT, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: css('--yellow'), text: `M${tr.model} ${long ? 'L' : 'S'}` });
    ms.push({ time: tr.exitT, position: long ? 'aboveBar' : 'belowBar', shape: 'square', color: tr.r > 0 ? css('--green') : css('--red'), text: `${tr.r > 0 ? '+' : ''}${tr.r.toFixed(1)}R` });
  }
  if (res.pos && !res.pos.pending) {
    const long = res.pos.side === 'L';
    ms.push({ time: res.pos.entryT, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: css('--yellow'), text: `M${res.pos.model} ${long ? 'L' : 'S'} (abierta)` });
  }
  ms.sort((a, b) => a.time - b.time);
  markers.setMarkers(ms);
}

function setPositionLines(pos) {
  for (const l of posLines) candles.removePriceLine(l);
  posLines = [];
  if (!pos) return;
  posLines.push(candles.createPriceLine({ price: pos.stop, color: css('--red'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: pos.be ? 'BE' : 'Stop' }));
  posLines.push(candles.createPriceLine({ price: pos.tp, color: css('--green'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Objetivo' }));
  if (!pos.pending) posLines.push(candles.createPriceLine({ price: pos.entry, color: css('--yellow'), lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'Entrada' }));
}

// ───────── Perfil de volumen sobre el gráfico (rango visible / día actual / día previo)
const vpCanvas = $('#vp');
let vpDirty = true, vpSig = '';

function vpProfile() {
  const bars = S.bars;
  if (!bars.length) return null;
  if (S.vpMode === 'prev') return S.result?.prev || null;
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
  // Rango visible: niveles adaptados al zoom (~90 filas).
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
  const sig = `${size.width}x${size.height}|${dpr}|${top}|${p && candles.priceToCoordinate((p.kMin + p.vols.length) * p.binSize)}|${S.vpCache?.key}|${S.vpMode}`;
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
    const inVA = i >= p.vaLo && i <= p.vaHi;
    const alpha = inVA ? 'aa' : '44';
    const buy = Math.max(0, Math.min(1, (p.vols[i] + p.deltas[i]) / (2 * p.vols[i] || 1)));
    const x0 = size.width - w;
    if (i === p.pocIdx) {
      ctx.fillStyle = orange + 'cc';
      ctx.fillRect(x0, yTop, w, h);
      continue;
    }
    ctx.fillStyle = green + alpha;
    ctx.fillRect(x0, yTop, w * buy, h);
    ctx.fillStyle = red + alpha;
    ctx.fillRect(x0 + w * buy, yTop, w * (1 - buy), h);
  }
}

(function loop() { try { drawVP(); } catch { /* el gráfico aún no tiene tamaño */ } requestAnimationFrame(loop); })();
chart.timeScale().subscribeVisibleLogicalRangeChange(() => { vpDirty = true; });

// ───────── Paneles
const fmtPx = (x) => (x == null || Number.isNaN(x) ? '—' : x.toLocaleString('es-ES', { maximumFractionDigits: S.tick < 1 ? 2 : 1 }));
const fmtUsd = (x) => `${(x / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })}k $`;

function renderPanels(res) {
  const last = S.bars.at(-1);
  const prev = res.prev;
  $('#lg-sym').textContent = S.sym.label;
  $('#lg-px').textContent = fmtPx(last.c);
  $('#lg-poc').textContent = fmtPx(prev?.poc);
  $('#lg-vah').textContent = fmtPx(prev?.vah);
  $('#lg-val').textContent = fmtPx(prev?.val);
  $('#lg-cvd').textContent = res.cvd.length ? Math.round(res.cvd.at(-1).v).toLocaleString('es-ES') : '—';

  const st = res.state || {};
  $('#st-win').textContent = st.win ? `Sesión ${st.win}` : 'Fuera de ventana';
  $('#st-win').dataset.on = st.win ? '1' : '0';
  $('#st-m1').textContent = S.cfg.useM1 ? st.m1 : 'Desactivado';
  $('#st-m2').textContent = S.cfg.useM2 ? st.m2 : 'Desactivado';
  let pos = 'Sin posición.';
  if (res.pos) {
    const p = res.pos, long = p.side === 'L';
    pos = p.pending
      ? `Señal M${p.model} ${long ? 'larga' : 'corta'}: entra a la apertura de la próxima vela · stop ${fmtPx(p.stop)} · objetivo ${fmtPx(p.tp)}`
      : `M${p.model} ${long ? 'larga' : 'corta'} desde ${fmtPx(p.entry)} · stop ${fmtPx(p.stop)}${p.be ? ' (BE)' : ''} · objetivo ${fmtPx(p.tp)}`;
  }
  $('#st-pos').textContent = pos;

  const real = S.bars.filter((b) => b.hasReal);
  $('#st-flow').textContent = real.length
    ? `Order flow real desde ${fmtNY(real[0].t).date} ${fmtNY(real[0].t).hm} NY (${real.length} de ${S.bars.length} velas) · ${bubbles().length} burbujas ≥ ${fmtUsd(bubbleUsd())}`
    : `Sin order flow grabado para este tramo: delta estimado hasta la próxima vela completa · burbujas ≥ ${fmtUsd(bubbleUsd())}`;

  const all = stats(res.trades);
  const by = (m) => stats(res.trades.filter((t) => t.model === m));
  const row = (name, s) => `<tr><th>${name}</th><td>${s.n}</td><td>${s.n ? `${Math.round(s.win * 100)} %` : '—'}</td>`
    + `<td class="${s.total > 0 ? 'pos' : s.total < 0 ? 'neg' : ''}">${s.n ? `${s.total > 0 ? '+' : ''}${s.total.toFixed(2)} R` : '—'}</td>`
    + `<td>${s.n ? (Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞') : '—'}</td><td>${s.n ? `${s.dd.toFixed(2)} R` : '—'}</td></tr>`;
  $('#stats tbody').innerHTML = row('Total', all) + row('Modelo 1', by(1)) + row('Modelo 2', by(2));
  const days = new Set(S.bars.map((b) => b.day)).size;
  $('#stats-note').textContent = `${days} días de historia (${S.bars.length} velas de ${S.tf}). En % de cuenta: ${all.n ? `${(all.total * S.cfg.riskPct).toFixed(2)} %` : '—'} con ${S.cfg.riskPct} % por operación. Costes incluidos.`;

  $('#trades').hidden = !res.trades.length;
  $('#trades-empty').hidden = !!res.trades.length;
  $('#trades tbody').innerHTML = res.trades.slice().reverse().slice(0, 40).map((t) => {
    const f = fmtNY(t.entryT);
    return `<tr><td>${f.date} ${f.hm}</td><td>M${t.model}</td><td>${t.side === 'L' ? 'Largo' : 'Corto'}</td>`
      + `<td>${fmtPx(t.entry)}</td><td>${fmtPx(t.stop0)}</td><td>${fmtPx(t.tp)}</td><td>${fmtPx(t.exitPx)}</td>`
      + `<td>${t.reason}</td><td class="${t.r > 0 ? 'pos' : 'neg'}">${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}</td></tr>`;
  }).join('');
}

function setStatus(kind, text) {
  $('#status').dataset.kind = kind;
  $('#status-text').textContent = text;
}

// ───────── Controles
function buildControls() {
  const symSel = $('#sym');
  symSel.innerHTML = SYMBOLS.map((s) => `<option value="${s.coin}">${s.label}</option>`).join('');
  symSel.value = S.sym.coin;
  symSel.onchange = () => {
    S.sym = SYMBOLS.find((s) => s.coin === symSel.value);
    S.cfg.bubbleUsd = null;
    store.set('fm.sym', S.sym.coin);
    store.set('fm.cfg', S.cfg);
    buildSettings();
    load();
  };
  for (const btn of document.querySelectorAll('[data-tf]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.tf === S.tf));
    btn.onclick = () => {
      S.tf = btn.dataset.tf; store.set('fm.tf', S.tf);
      document.querySelectorAll('[data-tf]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      load();
    };
  }
  for (const btn of document.querySelectorAll('[data-vp]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.vp === S.vpMode));
    btn.onclick = () => {
      S.vpMode = btn.dataset.vp; store.set('fm.vp', S.vpMode); S.vpCache = null; vpDirty = true;
      document.querySelectorAll('[data-vp]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    };
  }
  const proxy = $('#proxy');
  proxy.checked = S.showProxy;
  proxy.onchange = () => { S.showProxy = proxy.checked; store.set('fm.proxy', S.showProxy); recompute(false); };
  $('#reset').onclick = () => { S.cfg = { ...DEFAULTS, bubbleUsd: null }; store.set('fm.cfg', S.cfg); buildSettings(); recompute(true); };
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
        store.set('fm.cfg', S.cfg);
        if (key === 'bubbleUsd') reloadFlow();
        else recompute(true);
      };
      fs.appendChild(wrap);
    }
    root.appendChild(fs);
  }
}

// Nuevo umbral de burbuja: se vuelven a pedir las órdenes grabadas ya filtradas; lo vivo se conserva.
async function reloadFlow() {
  await loadFlow(S.loadId);
  recompute(true);
}

buildControls();
buildSettings();
load();
