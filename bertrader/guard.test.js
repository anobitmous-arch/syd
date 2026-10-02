const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { bertraderRouter, cookieValue } = require('./guard');

const KEY = 'a'.repeat(64);
const SECRET = 'c'.repeat(64);

function start(t, { key = KEY, cookieSecret = SECRET, withData = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-guard-'));
  const pageDir = path.join(dir, 'page');
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(pageDir);
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(pageDir, 'index.html'), '<h1>bertrader</h1>');
  fs.writeFileSync(path.join(pageDir, 'app.js'), '// app');
  if (withData) {
    fs.writeFileSync(path.join(dataDir, 'data.json'), '{"schema":1}');
    fs.writeFileSync(path.join(dataDir, 'reglas.md'), '# Reglas');
  }
  const app = express();
  app.use(cookieParser());
  app.use('/bertrader', bertraderRouter({ key, cookieSecret, pageDir, dataDir }));
  app.get('/', (req, res) => res.send('home'));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

const get = (url, cookie) => fetch(url, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const session = (secret = SECRET) => `bt_session=${cookieValue(secret)}`;

test('without a key or a cookie everything is 404', async (t) => {
  const base = await start(t);
  for (const p of ['/bertrader', '/bertrader/', '/bertrader/data.json', '/bertrader/reglas.md', '/bertrader/app.js']) {
    const res = await get(base + p);
    assert.strictEqual(res.status, 404, p);
    assert.strictEqual(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
  assert.strictEqual((await get(base + '/')).status, 200);
});

test('a wrong key is 404 and sets no cookie', async (t) => {
  const base = await start(t);
  const res = await get(base + '/bertrader?k=' + 'b'.repeat(64));
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers.get('set-cookie'), null);
});

test('the right key sets the cookie and redirects to a clean URL', async (t) => {
  const base = await start(t);
  const res = await get(base + '/bertrader?k=' + KEY);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/bertrader/');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^bt_session=[0-9a-f]{64};/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/bertrader/i);
  assert.match(cookie, /Max-Age=7776000/i);
  assert.ok(!cookie.includes(KEY) && !cookie.includes(SECRET), 'la cookie no lleva la clave ni el secreto');
  assert.strictEqual(cookie.split(';')[0], session());
});

test('a valid cookie serves the page, its files and the data', async (t) => {
  const base = await start(t);
  const page = await get(base + '/bertrader/', session());
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /bertrader/);
  assert.strictEqual(page.headers.get('cache-control'), 'no-store');
  assert.strictEqual(page.headers.get('referrer-policy'), 'no-referrer');
  assert.strictEqual((await get(base + '/bertrader/app.js', session())).status, 200);
  const data = await get(base + '/bertrader/data.json', session());
  assert.strictEqual(data.status, 200);
  assert.deepStrictEqual(await data.json(), { schema: 1 });
  const rules = await get(base + '/bertrader/reglas.md', session());
  assert.strictEqual(await rules.text(), '# Reglas');
  assert.strictEqual((await get(base + '/bertrader/nope.js', session())).status, 404);
});

test('a tampered cookie is 404', async (t) => {
  const base = await start(t);
  assert.strictEqual((await get(base + '/bertrader/', 'bt_session=' + '0'.repeat(64))).status, 404);
  assert.strictEqual((await get(base + '/bertrader/', 'bt_session=')).status, 404);
  assert.strictEqual((await get(base + '/bertrader/', session('otro-secreto'))).status, 404);
  assert.strictEqual((await get(base + '/bertrader/', session(KEY))).status, 404, 'la clave del enlace no firma cookies');
});

test('repeated or empty k never opens the door', async (t) => {
  const base = await start(t);
  assert.strictEqual((await get(`${base}/bertrader?k=${KEY}&k=${KEY}`)).status, 404);
  assert.strictEqual((await get(base + '/bertrader?k=')).status, 404);
});

test('an empty cookie secret disables the whole route', async (t) => {
  const base = await start(t, { cookieSecret: '' });
  assert.strictEqual((await get(base + '/bertrader?k=' + KEY)).status, 404);
  assert.strictEqual((await get(base + '/bertrader/', session(''))).status, 404);
});

// La clave del enlace queda en el access log del proxy. Por eso es solo de alta: una vez dados
// de alta los dispositivos se vacía, y las cookies (firmadas con otro secreto) siguen valiendo.
test('retiring the link key closes the link but keeps enrolled devices in', async (t) => {
  const base = await start(t, { key: '' });
  assert.strictEqual((await get(base + '/bertrader?k=' + KEY)).status, 404);
  assert.strictEqual((await get(base + '/bertrader?k=')).status, 404);
  assert.strictEqual((await get(base + '/bertrader/', session())).status, 200);
  assert.strictEqual((await get(base + '/bertrader/data.json', session())).status, 200);
});

test('opening the page renews the cookie, the data requests do not', async (t) => {
  const base = await start(t);
  const page = await get(base + '/bertrader/', session());
  const renewed = page.headers.get('set-cookie');
  assert.strictEqual(renewed.split(';')[0], session());
  assert.match(renewed, /Max-Age=7776000/i);
  assert.match(renewed, /HttpOnly/i);
  assert.strictEqual((await get(base + '/bertrader/data.json', session())).headers.get('set-cookie'), null);
});

test('missing data answers 503 instead of a blank page', async (t) => {
  const base = await start(t, { withData: false });
  const res = await get(base + '/bertrader/data.json', session());
  assert.strictEqual(res.status, 503);
  assert.deepStrictEqual(await res.json(), { error: 'sin_datos' });
  assert.strictEqual((await get(base + '/bertrader/reglas.md', session())).status, 503);
});
