const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { bertraderRouter, cookieValue } = require('./guard');
const { rMultiple } = require('./journal');

const SECRET = 'c'.repeat(64);
const COOKIE = `bt_session=${cookieValue(SECRET)}`;

function start(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-journal-'));
  const pageDir = path.join(dir, 'page');
  fs.mkdirSync(pageDir);
  fs.writeFileSync(path.join(pageDir, 'index.html'), '<h1>x</h1>');
  const app = express();
  app.use(cookieParser());
  app.use('/bertrader', bertraderRouter({ key: '', cookieSecret: SECRET, pageDir, dataDir: dir, journalDir: path.join(dir, 'journal') }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
      resolve({ base: `http://127.0.0.1:${server.address().port}/bertrader/journal`, dir });
    });
  });
}

const call = (url, method = 'GET', body, cookie = COOKIE) => fetch(url, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const LONG = {
  coin: 'xyz:XYZ100', model: 'M2', side: 'L', entry: 30000, stop: 29950, tp: 30150, entryT: 1760000000,
  estado: 'balance, sale por debajo del VAL', localizacion: 'retest del VAL', agresion: 'burbuja compradora 60k',
};

test('sin cookie el diario no existe (404)', async (t) => {
  const { base } = await start(t);
  assert.strictEqual((await call(base, 'GET', null, null)).status, 404);
  assert.strictEqual((await call(base, 'POST', LONG, null)).status, 404);
});

test('crea, cierra y revisa una operación; el R lleva la comisión', async (t) => {
  const { base, dir } = await start(t);
  const created = await (await call(base, 'POST', LONG)).json();
  assert.strictEqual(created.qty, 10 / 50);
  assert.strictEqual(created.exitT, null);
  const closed = await (await call(`${base}/${created.id}`, 'PATCH', { exitPx: 30150, exitT: 1760000600, exitReason: 'TP' })).json();
  const cost = (2 * 4.5 / 1e4) * 30000 / 50;
  assert.ok(Math.abs(closed.r - (3 - cost)) < 1e-9);
  assert.strictEqual((await call(`${base}/${created.id}`, 'PATCH', { exitPx: 1, exitT: 1760000700, exitReason: 'SL' })).status, 409);
  const reviewed = await (await call(`${base}/${created.id}`, 'PATCH', { followed: true, note: 'bien' })).json();
  assert.strictEqual(reviewed.followed, true);
  assert.strictEqual(reviewed.r, closed.r);
  const list = await (await call(base)).json();
  assert.strictEqual(list.length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'journal', 'paper.json')));
});

test('rechaza stop u objetivo al lado equivocado y el motivo incompleto', async (t) => {
  const { base } = await start(t);
  assert.strictEqual((await call(base, 'POST', { ...LONG, stop: 30010 })).status, 400);
  assert.strictEqual((await call(base, 'POST', { ...LONG, side: 'S' })).status, 400);
  assert.strictEqual((await call(base, 'POST', { ...LONG, agresion: '  ' })).status, 400);
  assert.strictEqual((await call(base, 'POST', { ...LONG, model: 'X' })).status, 400);
});

test('solo se borra una operación abierta', async (t) => {
  const { base } = await start(t);
  const a = await (await call(base, 'POST', LONG)).json();
  const b = await (await call(base, 'POST', LONG)).json();
  await call(`${base}/${b.id}`, 'PATCH', { exitPx: 29950, exitT: 1760000100, exitReason: 'SL' });
  assert.strictEqual((await call(`${base}/${a.id}`, 'DELETE')).status, 204);
  assert.strictEqual((await call(`${base}/${b.id}`, 'DELETE')).status, 409);
});

test('rMultiple en corto', () => {
  const t = { side: 'S', entry: 100, stop: 101, costBps: 0 };
  assert.strictEqual(rMultiple(t, 98), 2);
  assert.strictEqual(rMultiple(t, 101), -1);
});
