// Acceso a /bertrader: clave en el enlace, cookie después. La página es privada y sin
// indexar; sin cookie válida todo responde 404, para no delatar que existe.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const COOKIE = 'bt_session';
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Comparación en tiempo constante. Se comparan los hash para que la longitud no importe.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// La cookie lleva un HMAC de la clave, nunca la clave. Cambiar la clave las invalida todas.
function cookieValue(key) {
  return crypto.createHmac('sha256', String(key)).update('bertrader-cookie-v1').digest('hex');
}

function bertraderRouter({ key, pageDir, dataDir }) {
  const router = express.Router();
  const notFound = (res) => res.status(404).type('text/plain').send('Not found');

  router.use((req, res, next) => {
    res.set({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    if (!key) return notFound(res);
    if (Object.prototype.hasOwnProperty.call(req.query, 'k')) {
      const k = req.query.k;
      if (typeof k !== 'string' || !k || !safeEqual(k, key)) return notFound(res);
      res.cookie(COOKIE, cookieValue(key), {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/bertrader', maxAge: MAX_AGE_MS,
      });
      // Redirección relativa: detrás de Traefik el servidor no conoce su URL pública.
      return res.redirect(302, '/bertrader/');
    }
    const cookie = req.cookies && req.cookies[COOKIE];
    if (typeof cookie !== 'string' || !cookie || !safeEqual(cookie, cookieValue(key))) return notFound(res);
    next();
  });

  const sendData = (file, type) => (req, res) => {
    fs.readFile(path.join(dataDir, file), 'utf8', (err, text) => {
      if (err) return res.status(503).json({ error: 'sin_datos' });
      res.type(type).send(text);
    });
  };

  // `cacheControl: false`: si no, `sendFile` pisa el `no-store` de arriba con `public, max-age=0`.
  router.get('/', (req, res) => res.sendFile(path.join(pageDir, 'index.html'), { cacheControl: false }));
  router.get('/data.json', sendData('data.json', 'application/json'));
  router.get('/reglas.md', sendData('reglas.md', 'text/plain; charset=utf-8'));
  router.use(express.static(pageDir, { index: false, cacheControl: false }));
  router.use((req, res) => notFound(res));
  return router;
}

module.exports = { bertraderRouter, cookieValue };
