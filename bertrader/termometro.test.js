const test = require('node:test');
const assert = require('node:assert');
const T = require('../private/bertrader/termometro.js');

const NOW = Date.parse('2026-10-05T02:10:00Z');
function coin(over = {}) {
  return {
    symbol: 'PENGU', state: 'caliente', since: '2026-10-04T23:00:00Z', score: 20, accounts: ['a', 'b', 'c'],
    is_new: false, trending_rank: 2, oi_chg_24h: 34.2, vol_ratio: 4.12, funding: 0.00006, px_chg_24h: 12.4,
    tweets: [{ account: 'lookonchain', ts: '2026-10-05T01:00:00Z', text: 'Whale <b>buys</b> $PENGU', url: 'https://x.com/lookonchain/status/1' }],
    ...over,
  };
}
function termo(over = {}) {
  return {
    schema: 1, kind: 'termometro', generated_at: '2026-10-05T02:00:00Z',
    sources: { x: { last_ok: '2026-10-05T01:00:00Z', stale: false }, trending: { last_ok: '2026-10-05T01:30:00Z', stale: false },
      hl: { last_ok: null, stale: true } },
    coins: [coin(), coin({ symbol: 'ZEC', state: 'euforia' }), coin({ symbol: 'LIT', state: 'temprana', is_new: true, trending_rank: null, accounts: ['a', 'b'] })],
    ...over,
  };
}

test('isValid and isFresh', () => {
  assert.ok(T.isValid(termo()));
  assert.ok(!T.isValid({ schema: 2, kind: 'termometro', coins: [] }));
  assert.ok(!T.isValid(null));
  assert.ok(T.isFresh(termo(), NOW));
  assert.ok(!T.isFresh(termo(), NOW + 61 * 60 * 1000));
  assert.ok(!T.isFresh(termo({ generated_at: '2026-10-05T03:00:00Z' }), NOW));
});

test('stale or missing shows the empty text', () => {
  assert.match(T.html(null, 'Australia/Perth', NOW), /Termómetro sin datos/);
  assert.match(T.html(termo(), 'Australia/Perth', NOW + 2 * 3600 * 1000), /Termómetro sin datos/);
});

test('groups by state in order with label', () => {
  const html = T.html(termo(), 'Australia/Perth', NOW);
  assert.match(html, /sin validar · solo información/);
  const i = (s) => html.indexOf(s);
  assert.ok(i('🔥 Calientes') < i('🌋 Euforia') && i('🌋 Euforia') < i('🌱 Tempranas'));
  assert.match(html, /3 cuentas · trending #2/);
  assert.match(html, /2 cuentas · nueva/);
});

test('row numbers in Spanish format and escaped tweets', () => {
  const row = T.rowHtml(coin(), 'Australia/Perth', NOW);
  assert.match(row, /OI \+34 % · vol ×4,1 · fund 0,0060 % · \+12 %/);
  assert.match(row, /hace 3 h/);
  assert.match(row, /Whale &lt;b&gt;buys&lt;\/b&gt;/);
  assert.match(row, /href="https:\/\/x\.com\/lookonchain\/status\/1"/);
  assert.match(row, /<details/);
});

test('non x.com links are not rendered as links', () => {
  const row = T.rowHtml(coin({ tweets: [{ account: 'a', ts: '2026-10-05T01:00:00Z', text: 't', url: 'javascript:alert(1)' }] }), 'UTC', NOW);
  assert.ok(!row.includes('javascript:'));
});

test('caps at 10 rows and says how many more', () => {
  const coins = Array.from({ length: 13 }, (_, k) => coin({ symbol: 'C' + k }));
  const html = T.html(termo({ coins }), 'UTC', NOW);
  assert.strictEqual((html.match(/<details/g) || []).length, 10);
  assert.match(html, /y 3 más/);
});

test('empty list and stale source in amber', () => {
  const html = T.html(termo({ coins: [] }), 'UTC', NOW);
  assert.match(html, /Nada caliente ahora mismo/);
  assert.match(html, /<span class="stale">HL sin datos<\/span>/);
});

test('missing numbers render as dash', () => {
  const row = T.rowHtml(coin({ oi_chg_24h: null, vol_ratio: null, funding: null, px_chg_24h: null }), 'UTC', NOW);
  assert.match(row, /OI — · vol — · fund — · —/);
});
