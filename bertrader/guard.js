// Acceso a /bertrader: clave en el enlace, cookie después. La página es privada y sin
// indexar; sin cookie válida todo responde 404, para no delatar que existe.
//
// Dos secretos distintos a propósito. La clave del enlace (`key`) viaja en la URL y acaba en
// el access log del proxy: solo sirve para dar de alta un dispositivo y se puede vaciar
// después. La cookie se firma con `cookieSecret`, que nunca sale del servidor.
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

// La cookie lleva un HMAC del secreto, nunca el secreto. Cambiar el secreto las invalida todas.
function cookieValue(cookieSecret) {
  return crypto.createHmac('sha256', String(cookieSecret)).update('bertrader-cookie-v1').digest('hex');
}

function bertraderRouter({ key, cookieSecret, pageDir, dataDir }) {
  const router = express.Router();
  const notFound = (res) => res.status(404).type('text/plain').send('Not found');
  const setCookie = (res) => res.cookie(COOKIE, cookieValue(cookieSecret), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/bertrader', maxAge: MAX_AGE_MS,
  });

  router.use((req, res, next) => {
    res.set({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    if (!cookieSecret) return notFound(res);
    if (Object.prototype.hasOwnProperty.call(req.query, 'k')) {
      const k = req.query.k;
      // Con la clave del enlace vacía el enlace está retirado: nadie se da de alta.
      if (!key || typeof k !== 'string' || !k || !safeEqual(k, key)) return notFound(res);
      setCookie(res);
      // Redirección relativa: detrás de Traefik el servidor no conoce su URL pública.
      return res.redirect(302, '/bertrader/');
    }
    const cookie = req.cookies && req.cookies[COOKIE];
    if (typeof cookie !== 'string' || !cookie || !safeEqual(cookie, cookieValue(cookieSecret))) return notFound(res);
    next();
  });

  const sendData = (file, type) => (req, res) => {
    fs.readFile(path.join(dataDir, file), 'utf8', (err, text) => {
      if (err) return res.status(503).json({ error: 'sin_datos' });
      res.type(type).send(text);
    });
  };

  // `cacheControl: false`: si no, `sendFile` pisa el `no-store` de arriba con `public, max-age=0`.
  router.get('/', (req, res) => {
    // Cada visita renueva los 90 días: quien la abre a diario no se queda fuera sin aviso.
    setCookie(res);
    res.sendFile(path.join(pageDir, 'index.html'), { cacheControl: false });
  });
  router.get('/data.json', sendData('data.json', 'application/json'));
  router.get('/manana.json', sendData('manana.json', 'application/json'));
  router.get('/reglas.md', sendData('reglas.md', 'text/plain; charset=utf-8'));
  router.use(express.static(pageDir, { index: false, cacheControl: false }));
  router.use((req, res) => notFound(res));
  return router;
}

module.exports = { bertraderRouter, cookieValue };
