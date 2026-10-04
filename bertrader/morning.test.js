const test = require('node:test');
const assert = require('node:assert');
const M = require('../private/bertrader/morning.js');

const NOW = Date.parse('2026-10-05T02:10:00Z');
function morning(over = {}) {
  return {
    schema: 1, kind: 'manana', generated_at: '2026-10-05T02:00:00Z', tz: 'Australia/Brisbane',
    radar: {
      price: 85000, change_24h: 1.2,
      weekly: { bmsb_low: 70100, bmsb_high: 73900, ema50: 69000, vs_bmsb_pct: 15.02, vs_ema50_pct: 23.19, state: 'encima' },
      structure: { last_high: { price: 86200, date: '2026-09-28', rising: true }, last_low: { price: 74000, date: '2026-09-07', rising: true } },
      levels: [
        { key: '80k', label: '80k', price: 80000, distance_pct: 6.25, armed: true, last_alert_at: null, last_alert_px: null },
        { key: 'bmsb', label: 'BMSB semanal', price: 73900, distance_pct: 15.02, armed: true, last_alert_at: '2026-09-02T10:15:00Z', last_alert_px: 73800 },
      ],
    },
    assets: [
      { coin: 'BTC', group: 'carril', name: 'Bitcoin', error: null, price: 85000, change_24h: 1.2, change_7d: -2.5, near_signal: 'largo',
        candles: [[1, 1, 2, 0.5, 1.5]], ema50: [1.2], indicators: {}, jaime: null, news: [] },
      { coin: 'ZEC', group: 'radar', name: 'Zcash', error: 'sin_datos', price: null, change_24h: null, change_7d: null,
        near_signal: null, candles: [], ema50: [], indicators: null, jaime: null, news: [] },
    ],
    news: { day: '2026-10-05', top: [{ title: 'Fed <b>holds</b>', url: 'https://x/1', source: 'Reuters', published_at: '2026-10-05T01:00:00Z', topic: 'geopolitics', score: 9, day: '2026-10-05' }] },
    ...over,
  };
}

test('freshness: 45 minutes and unknown schema', () => {
  assert.ok(M.isFresh(morning(), NOW));
  assert.ok(!M.isFresh(morning({ generated_at: '2026-10-05T01:20:00Z' }), NOW));
  assert.ok(!M.isFresh(morning({ schema: 2 }), NOW));
  assert.ok(!M.isFresh(null, NOW));
});

test('radar shows price, band state, structure, levels and last alert', () => {
  const html = M.radarHtml(morning(), 'Australia/Brisbane');
  assert.match(html, /85\.000/);
  assert.match(html, /BMSB/);
  assert.match(html, /encima/);
  assert.match(html, /80k/);
  assert.match(html, /\+6,25 %/);
  assert.match(html, /máximo creciente/i);
  assert.match(html, /último aviso/i);
});

test('radar without data says so', () => {
  assert.match(M.radarHtml(morning({ radar: null }), 'UTC'), /sin datos/i);
});

test('market lists lane and radar assets with changes and near-signal mark', () => {
  const html = M.marketHtml(morning());
  assert.match(html, /BTC/);
  assert.match(html, /−2,50 %/);
  assert.match(html, /a una condición/i);
  assert.match(html, /ZEC/);
  assert.match(html, /sin datos/i);
  assert.match(html, /href="#\/activo\/BTC"/);
});

test('news titles are escaped and open in a new tab', () => {
  const html = M.newsHtml(morning(), 'UTC');
  assert.ok(!html.includes('<b>holds'));
  assert.match(html, /Fed &lt;b&gt;holds/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.strictEqual(M.newsHtml(morning({ news: { day: null, top: [] } }), 'UTC'), '');
});

test('news older than yesterday are labelled; yesterday is not', () => {
  const m = morning({ news: { day: '2026-10-03', top: morning().news.top } });
  assert.match(M.newsHtml(m, 'UTC', '2026-10-05'), /del 3 oct/i);
  const y = morning({ news: { day: '2026-10-04', top: morning().news.top } });
  assert.ok(!/\(del /.test(M.newsHtml(y, 'UTC', '2026-10-05')));
});

test('market data age line in radar and asset detail', () => {
  assert.match(M.radarHtml(morning(), 'UTC', NOW), /Datos de mercado de hace 10 min/);
  const m = morning();
  m.assets[0] = { ...m.assets[0], candles: candles(5), ema50: Array(5).fill(1), indicators: { ema50: 1 } };
  assert.match(M.assetMorningHtml(m, 'BTC', 'UTC', NOW), /Datos de mercado de hace 10 min/);
});

test('Jaime count is coerced to a number', () => {
  const m = morning();
  m.assets[0] = { ...m.assets[0], candles: candles(5), ema50: Array(5).fill(1), indicators: { ema50: 1 },
    jaime: { long: { count: '<img src=x>', conditions: [{ label: 'a', ok: true }] } } };
  const html = M.assetMorningHtml(m, 'BTC', 'UTC');
  assert.ok(!html.includes('<img'));
  assert.match(html, /0 de 4 para largo/);
});

test('news links only open http(s) URLs', () => {
  const bad = { ...morning().news.top[0], url: 'javascript:alert(1)' };
  const html = M.newsHtml(morning({ news: { day: '2026-10-05', top: [bad] } }), 'UTC');
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /Fed/);
});

test('an invalid tz falls back to UTC instead of throwing', () => {
  const html = M.radarHtml(morning(), 'No/Such_Zone');
  assert.match(html, /último aviso 2 sept, 10:15/);
  assert.match(M.newsHtml(morning(), 'No/Such_Zone'), /Reuters · 5 oct, 01:00/);
});

test('a generated_at in the future is not fresh', () => {
  assert.ok(M.isFresh(morning({ generated_at: '2026-10-05T02:10:30Z' }), NOW));
  assert.ok(!M.isFresh(morning({ generated_at: '2026-10-05T02:12:00Z' }), NOW));
  assert.ok(!M.isFresh(morning({ generated_at: 'nope' }), NOW));
  assert.ok(M.isValid(morning({ generated_at: '2026-10-05T00:00:00Z' })));
  assert.ok(!M.isValid(morning({ kind: 'otro' })));
});

function candles(n) {
  return Array.from({ length: n }, (_, i) => [i * 86400000, 100 + i, 102 + i, 99 + i, 101 + i]);
}

test('chart draws one candle per day and the EMA line', () => {
  const svg = M.chartSvg(candles(90), Array.from({ length: 90 }, (_, i) => (i < 49 ? null : 100 + i)));
  assert.match(svg, /^<svg/);
  assert.strictEqual((svg.match(/class="c /g) || []).length, 90);
  assert.match(svg, /<polyline class="ema"/);
  assert.strictEqual(M.chartSvg([], []), '');
});

test('chart with a flat series does not divide by zero', () => {
  const flat = Array.from({ length: 5 }, (_, i) => [i, 10, 10, 10, 10]);
  assert.ok(!M.chartSvg(flat, [10, 10, 10, 10, 10]).includes('NaN'));
});

test('asset detail shows indicators, Jaime checklist and news', () => {
  const m = morning();
  m.assets[0] = { ...m.assets[0], candles: candles(90), ema50: Array(90).fill(150),
    indicators: { close: 190, ema50: 150, ema200: 120, vs_ema50_pct: 26.67, vs_ema200_pct: 58.33, rsi14: 71.2,
      stoch_k: 18.5, atr_pct: 2.1, stop_long: 185.2, stop_short: 194.8, vol_ratio: 1.35 },
    jaime: { long: { count: 3, conditions: [
      { key: 'tendencia', label: 'Cierre por encima de la EMA50', ok: true },
      { key: 'estocastico_extremo', label: 'El estocástico tocó la sobreventa (30) en las últimas 6 velas', ok: true },
      { key: 'giro', label: 'El estocástico gira al alza', ok: false },
      { key: 'volumen', label: 'Volumen por encima de 1.2× su media', ok: true }] },
      short: { count: 0, conditions: [] } },
    news: [{ title: 'Bitcoin <i>ETF</i>', url: 'https://x/2', source: 'CoinDesk', published_at: null, topic: 'crypto', score: 5, day: '2026-10-04' }] };
  const html = M.assetMorningHtml(m, 'BTC', 'UTC');
  assert.match(html, /<svg/);
  assert.match(html, /RSI 14/);
  assert.match(html, /71,2/);
  assert.match(html, /ATR/);
  assert.match(html, /3 de 4 para largo/);
  assert.match(html, /✅/);
  assert.match(html, /⬜/);
  assert.match(html, /Bitcoin &lt;i&gt;ETF/);
});

test('asset detail without market data says so; radar altcoins have no checklist', () => {
  const m = morning();
  assert.match(M.assetMorningHtml(m, 'ZEC', 'UTC'), /sin datos de mercado/i);
  assert.match(M.assetMorningHtml(m, 'DOGE', 'UTC'), /sin datos de mercado/i);
  assert.match(M.assetMorningHtml(null, 'BTC', 'UTC'), /sin datos de mercado/i);
});
