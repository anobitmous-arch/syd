const test = require('node:test');
const assert = require('node:assert');
const R = require('../private/bertrader/render.js');

const NOW = Date.parse('2026-10-05T02:10:00Z');

function proposal(over = {}) {
  return {
    type: 'proposal', at: '2026-10-03T01:00:00Z', day: '2026-10-03', id: 7, coin: 'BTC', side: 'long',
    timeframe: '1d', entry: 100, stop: 95, target: 110, size_usd: 200, risk_usd: 10, mode: 'papel',
    demo: false, outcome: 'descartada', note: '', detail: '', result: null, would_have: null,
    closed_at: null, closed_day: null, ...over,
  };
}

function sample(over = {}) {
  return {
    schema: 1, generated_at: '2026-10-05T02:05:00Z', execution: 'paper', tz: 'Australia/Brisbane',
    today: '2026-10-05',
    panel: {
      session_done: false,
      capital: { base: 700, realized: 0, current: 700, floor: 500 },
      limits: { max_positions: 5, max_per_class: 2 }, by_class: {},
      pause_until: null, review_due: null, positions: [], pending: [],
      assets: [{ coin: 'BTC', asset_class: 'crypto', timeframes: ['1d', '4h'], state: 'sin_senal', price: 86345, price_at: '2026-10-05T01:30:00Z' }],
    },
    journal: [],
    conduct: {
      start_day: '2026-10-02', days_elapsed: 4, days_with_session: 0,
      weeks: [{ start: '2026-09-28', missed: 0, ok: null, days: [
        { day: '2026-09-28', state: 'antes' }, { day: '2026-09-29', state: 'antes' }, { day: '2026-09-30', state: 'antes' },
        { day: '2026-10-01', state: 'antes' }, { day: '2026-10-02', state: 'sesion' }, { day: '2026-10-03', state: 'sin_sesion' },
        { day: '2026-10-04', state: 'hoy' }] }],
      disconnections: [],
      proposals: { seguidas: 0, descartadas: 0, sin_decidir: 0, bloqueadas: 0 },
      out_of_rules: 0,
      counterfactual: { seguidas: { n: 0, net: 0 }, descartadas: { n: 0, net: 0 }, sin_decidir: { n: 0, net: 0 } },
    },
    ...over,
  };
}

const view = (data, hash, extra = {}) => R.render({ data, error: null, rules: null, hash, nowMs: NOW, ...extra });

test('route parses the fragment', () => {
  assert.deepStrictEqual(R.route(''), { view: 'panel' });
  assert.deepStrictEqual(R.route('#/'), { view: 'panel' });
  assert.deepStrictEqual(R.route('#/diario'), { view: 'diario' });
  assert.deepStrictEqual(R.route('#/activo/BTC'), { view: 'activo', coin: 'BTC' });
  assert.deepStrictEqual(R.route('#/activo/xyz%3AGOLD'), { view: 'activo', coin: 'xyz:GOLD' });
  assert.deepStrictEqual(R.route('#/lo-que-sea'), { view: 'panel' });
});

test('freshness warns after 15 minutes', () => {
  assert.deepStrictEqual(R.freshness('2026-10-05T02:05:00Z', NOW), { text: 'actualizado hace 5 min', stale: false });
  assert.strictEqual(R.freshness('2026-10-05T01:50:00Z', NOW).stale, true);
  assert.strictEqual(R.freshness('2026-10-05T00:05:00Z', NOW).text, 'actualizado hace 2 h 5 min');
  assert.deepStrictEqual(R.freshness('no-es-fecha', NOW), { text: 'sin hora de actualización', stale: true });
});

test('status shows the mode and the stale warning', () => {
  assert.match(R.renderStatus(sample(), NOW), /PAPEL/);
  assert.match(R.renderStatus(sample({ execution: 'live' }), NOW), /REAL/);
  assert.match(R.renderStatus(sample({ generated_at: '2026-10-05T01:00:00Z' }), NOW), /class="fresh stale"/);
});

test('an empty panel says so in every section', () => {
  const html = view(sample(), '#/');
  assert.match(html, /Sesión de hoy: pendiente/);
  assert.match(html, /Sin posiciones abiertas/);
  assert.match(html, /Nada que decidir ahora/);
  assert.match(html, /href="#\/activo\/BTC"/);
  assert.match(html, /Sin señal/);
  assert.ok(!/Noticias/.test(html), 'noticias no se pinta sin datos');
});

test('the panel shows alerts, positions and pending proposals', () => {
  const data = sample();
  data.panel.session_done = true;
  data.panel.pause_until = '2026-10-05';
  data.panel.review_due = { coin: 'SUI', net: -9.8 };
  data.panel.by_class = { crypto: 1 };
  data.panel.positions = [proposal({ outcome: 'seguida', note: 'ruptura con volumen' })];
  data.panel.pending = [proposal({ id: 9, coin: 'SUI', outcome: 'pendiente', expires_at: '2026-10-05T04:24:00Z' })];
  const html = view(data, '#/');
  assert.match(html, /Sesión de hoy: hecha/);
  assert.match(html, /Pausa por 3 pérdidas seguidas/);
  assert.match(html, /Hoy toca revisión escrita: SUI/);
  assert.match(html, /1\/5/);
  assert.match(html, /cripto 1\/2/);
  assert.match(html, /ruptura con volumen/);
  assert.match(html, /caduca en 2 h 14 min/);
  assert.match(html, /se decide en Telegram/);
});

test('notes are escaped', () => {
  const data = sample({ journal: [
    proposal({ outcome: 'seguida', note: '<script>alert(1)</script> "comillas"' }),
    { type: 'session', at: '2026-10-03T03:00:00Z', day: '2026-10-03', kind: 'estudio', note: '<img src=x onerror=alert(1)>' },
  ] });
  const html = view(data, '#/diario');
  assert.ok(!html.includes('<script>'), 'el motivo no se interpreta como HTML');
  assert.ok(!html.includes('<img'), 'la nota de sesión no se interpreta como HTML');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;comillas&quot;/);
});

test('the diary groups by day and shows results only when they exist', () => {
  const data = sample({ journal: [
    proposal({ id: 3, at: '2026-10-04T01:00:00Z', day: '2026-10-04', outcome: 'seguida', note: 'motivo', result: -9.87 }),
    proposal({ id: 2, outcome: 'descartada', would_have: 19.8 }),
    proposal({ id: 1, coin: 'SUI', outcome: 'sin_decidir', detail: 'tiempo' }),
    { type: 'manual_close', kind: 'manual_close', at: '2026-10-03T00:30:00Z', day: '2026-10-03', coin: 'BTC', note: 'me voy', mode: 'papel', demo: true },
  ] });
  const html = view(data, '#/diario');
  assert.strictEqual((html.match(/class="day-title"/g) || []).length, 2);
  assert.match(html, /Resultado: −9,87 \$/);
  assert.match(html, /Habría dado: \+19,80 \$/);
  assert.strictEqual((html.match(/Habría dado/g) || []).length, 1, 'sin cierre no hay "habría dado"');
  assert.match(html, /Sin decidir/);
  assert.match(html, /Cierre manual/);
  assert.match(html, /prueba/);
  assert.match(view(sample(), '#/diario'), /El diario está vacío/);
});

test('the asset view filters the diary by coin', () => {
  const data = sample({ journal: [proposal({ coin: 'BTC', note: 'solo btc', outcome: 'seguida' }), proposal({ coin: 'SUI', note: 'solo sui', outcome: 'seguida' })] });
  const html = view(data, '#/activo/BTC');
  assert.match(html, /solo btc/);
  assert.ok(!html.includes('solo sui'));
  assert.match(view(data, '#/activo/DOGE'), /no está entre los seguidos/);
  assert.match(view(sample(), '#/activo/BTC'), /Sin historial todavía/);
});

test('conduct shows the grid, the counts and the counterfactual', () => {
  const data = sample();
  data.conduct.days_with_session = 1;
  data.conduct.disconnections = [{ from: '2026-10-03', to: '2026-10-04', days: 2, after_loss: true }];
  data.conduct.proposals = { seguidas: 4, descartadas: 2, sin_decidir: 1, bloqueadas: 1 };
  data.conduct.counterfactual = { seguidas: { n: 2, net: 4.5 }, descartadas: { n: 1, net: 20 }, sin_decidir: { n: 0, net: 0 } };
  const html = view(data, '#/conducta');
  assert.match(html, /1 de 4/);
  assert.match(html, /day day-sesion/);
  assert.match(html, /day day-hoy/);
  assert.match(html, /tras pérdida/);
  assert.match(html, /\+4,50 \$/);
  assert.match(html, /\+20,00 \$/);
  assert.match(html, /la detección se activa con el paso a real/);
});

test('rules keep their numbers after nested bullets', () => {
  const md = '# Reglas\n\n1. **Capital.** 700 $\n7. **Tras perder.**\n   - Tras una pérdida: sesión\n8. **Sesión.** Un día `natural`\n';
  const html = view(sample(), '#/reglas', { rules: md });
  assert.match(html, /<li value="1"><strong>Capital\.<\/strong> 700 \$<\/li>/);
  assert.match(html, /<li value="8"><strong>Sesión\.<\/strong> Un día <code>natural<\/code><\/li>/);
  assert.match(html, /<ul><li>Tras una pérdida: sesión<\/li><\/ul>/);
  assert.match(view(sample(), '#/reglas', { rules: '' }), /No se han podido cargar las reglas/);
});

test('unknown schema is announced instead of drawing half the data', () => {
  assert.match(view(sample({ schema: 2 }), '#/'), /versión de datos que esta página no conoce/);
});

test('expired cookie message', () => {
  assert.match(R.render({ data: null, error: 'http_404', rules: null, hash: '', nowMs: NOW }), /Abre de nuevo el enlace con clave/);
  assert.match(R.render({ data: null, error: 'sin_datos', rules: null, hash: '', nowMs: NOW }), /Todavía no hay datos/);
  assert.match(R.render({ data: null, error: null, rules: null, hash: '', nowMs: NOW }), /Cargando/);
  // Con datos ya cargados, un fallo posterior avisa pero no borra lo que se ve.
  const html = R.render({ data: sample(), error: 'http_404', rules: null, hash: '#/', nowMs: NOW });
  assert.match(html, /Abre de nuevo el enlace con clave/);
  assert.match(html, /Sin posiciones abiertas/);
});

test('an undecided proposal says why it expired', () => {
  const data = sample({ journal: [
    proposal({ id: 3, outcome: 'sin_decidir', detail: 'tiempo' }),
    proposal({ id: 2, coin: 'SUI', outcome: 'sin_decidir', detail: 'precio' }),
    proposal({ id: 1, coin: 'TAO', outcome: 'sin_decidir', detail: 'la estrategia cerró antes de decidir' }),
  ] });
  const html = view(data, '#/diario');
  assert.match(html, /Caducó por tiempo/);
  assert.match(html, /Caducó: el precio se alejó de la entrada/);
  assert.match(html, /la estrategia cerró antes de decidir/);
});

test('unexpected data never leaves a blank page', () => {
  const noPanel = sample();
  delete noPanel.panel;
  assert.match(view(noPanel, '#/'), /No se han podido pintar los datos/);
  const noFrames = sample();
  noFrames.panel.assets[0].timeframes = null;
  assert.match(view(noFrames, '#/'), /No se han podido pintar los datos/);
  assert.deepStrictEqual(R.route('#/activo/%E0%A4%A'), { view: 'panel' });
});

test('coming back to the tab reloads the data', async () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '../private/bertrader/app.js'), 'utf8');
  const listeners = {};
  const fetched = [];
  const els = { view: { innerHTML: '' }, status: { innerHTML: '' }, nav: { innerHTML: '' } };
  const document = {
    visibilityState: 'visible',
    getElementById: (id) => els[id],
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  const window = { BTRender: R, addEventListener() {}, scrollTo() {} };
  const fetch = async (url) => {
    fetched.push(url);
    return { ok: true, status: 200, json: async () => sample(), text: async () => '# Reglas' };
  };
  vm.runInNewContext(src, { window, document, location: { hash: '#/' }, fetch, setInterval: () => 0, Date, Promise });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const loads = () => fetched.filter((url) => url.endsWith('data.json')).length;
  await settle();
  assert.strictEqual(loads(), 1);
  assert.match(els.view.innerHTML, /Sin posiciones abiertas/);
  document.visibilityState = 'hidden';
  listeners.visibilitychange();
  await settle();
  assert.strictEqual(loads(), 1, 'al esconderse no recarga');
  document.visibilityState = 'visible';
  listeners.visibilitychange();
  await settle();
  assert.strictEqual(loads(), 2, 'al volver a primer plano recarga');
});

test('the mode and the freshness stay visible while scrolling', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '../private/bertrader');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  assert.match(html, /<div class="bar">[\s\S]*id="status"[\s\S]*id="nav"[\s\S]*<\/div>\s*<main/);
  assert.match(css, /\.bar \{[^}]*position: sticky/);
});
