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

test('old news day is labelled', () => {
  const m = morning({ news: { day: '2026-10-03', top: morning().news.top } });
  assert.match(M.newsHtml(m, 'UTC', '2026-10-05'), /del 3 oct/i);
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
