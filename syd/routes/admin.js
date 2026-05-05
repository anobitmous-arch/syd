'use strict';
const { Router } = require('express');
const db = require('../db');

const router = Router();
const ADMIN_TOKEN = process.env.SYD_NEWS_SECRET; // reutilizamos el secret de noticias

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// GET /api/syd/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, dau, trades, checkins, lessons, topUsers, recentRegistrations] = await Promise.all([
      db.query('SELECT COUNT(*) AS total FROM users'),
      db.query(`SELECT COUNT(DISTINCT user_id) AS dau FROM daily_checkins WHERE created_at > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE status='won') AS won, COUNT(*) FILTER(WHERE status='lost') AS lost, COUNT(*) FILTER(WHERE status='open') AS open FROM wish_trades`),
      db.query('SELECT COUNT(*) AS total FROM daily_checkins'),
      db.query(`SELECT COUNT(*) AS total FROM user_progress WHERE status='completed'`),
      db.query(`SELECT u.username, u.xp, u.bertcoins, u.streak, u.pole_id, u.created_at::date AS joined
                FROM users u ORDER BY u.xp DESC LIMIT 10`),
      db.query(`SELECT username, email, created_at::date AS joined FROM users ORDER BY created_at DESC LIMIT 5`),
    ]);

    res.json({
      users: parseInt(users.rows[0].total),
      dau_24h: parseInt(dau.rows[0].dau),
      trades: {
        total: parseInt(trades.rows[0].total),
        won: parseInt(trades.rows[0].won),
        lost: parseInt(trades.rows[0].lost),
        open: parseInt(trades.rows[0].open),
      },
      total_checkins: parseInt(checkins.rows[0].total),
      total_lessons: parseInt(lessons.rows[0].total),
      top_users: topUsers.rows,
      recent_registrations: recentRegistrations.rows,
    });
  } catch (err) {
    console.error('[syd] admin stats error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
