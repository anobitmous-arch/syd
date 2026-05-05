'use strict';
const { Router } = require('express');
const db = require('../db');

const router = Router();

function newsAuth(req, res, next) {
  const secret = process.env.SYD_NEWS_SECRET;
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// POST /api/syd/news — n8n publica las noticias del día
// Body: { items: [{ title, summary, url }] }
router.post('/', newsAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items[] requerido' });
  }
  try {
    await db.query(`DELETE FROM crypto_news WHERE created_at < NOW() - INTERVAL '7 days'`);
    for (const item of items) {
      await db.query(
        `INSERT INTO crypto_news (title, summary, url) VALUES ($1, $2, $3)`,
        [item.title, item.summary || null, item.url || null]
      );
    }
    res.json({ ok: true, inserted: items.length });
  } catch (err) {
    console.error('[syd] news post error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/news/latest — devuelve las últimas 5 noticias
router.get('/latest', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, summary, url, created_at
       FROM crypto_news
       ORDER BY created_at DESC
       LIMIT 5`
    );
    res.json({ news: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
