'use strict';
const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = Router();

// GET /api/syd/campaigns/:id — misiones de una campaña
router.get('/campaigns/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const camp = await db.query('SELECT * FROM campaigns WHERE id=$1', [id]);
    if (!camp.rows.length) return res.status(404).json({ error: 'Campaña no encontrada' });

    const missions = await db.query(
      'SELECT * FROM missions WHERE campaign_id=$1 ORDER BY id',
      [id]
    );
    res.json({ ...camp.rows[0], missions: missions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/missions/:id — submissions de una misión
router.get('/missions/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const mission = await db.query('SELECT * FROM missions WHERE id=$1', [id]);
    if (!mission.rows.length) return res.status(404).json({ error: 'Misión no encontrada' });

    const subs = await db.query(
      'SELECT * FROM submissions WHERE mission_id=$1 ORDER BY id',
      [id]
    );
    res.json({ ...mission.rows[0], submissions: subs.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/progress — marcar submission como completada
router.post('/progress', requireAuth, async (req, res) => {
  const { mission_id, submission_id } = req.body;
  if (!mission_id || !submission_id)
    return res.status(400).json({ error: 'Faltan mission_id o submission_id' });

  try {
    // Evitar duplicados
    const exists = await db.query(
      `SELECT id FROM user_progress
       WHERE user_id=$1 AND submission_id=$2 AND status='completed'`,
      [req.user.id, submission_id]
    );
    if (exists.rows.length) return res.json({ ok: true, duplicate: true });

    // Obtener XP de la submission
    const subRes = await db.query('SELECT reward_xp FROM submissions WHERE id=$1', [submission_id]);
    const xp = subRes.rows[0]?.reward_xp || 0;

    await db.query(
      `INSERT INTO user_progress (user_id, mission_id, submission_id, status, start_time, end_time, reward_claimed)
       VALUES ($1, $2, $3, 'completed', NOW(), NOW(), TRUE)`,
      [req.user.id, mission_id, submission_id]
    );

    // Sumar XP y BertCoins al usuario (1:1)
    if (xp > 0) {
      await db.query(
        'UPDATE users SET xp = xp + $1, bertcoins = bertcoins + $2 WHERE id=$3',
        [xp, xp, req.user.id]
      );
      const progress = await db.query(
        `SELECT id FROM user_progress WHERE user_id=$1 AND submission_id=$2 AND status='completed' ORDER BY end_time DESC LIMIT 1`,
        [req.user.id, submission_id]
      );
      await db.query(
        `INSERT INTO bertcoin_transactions (user_id, amount, reason, ref_id)
         VALUES ($1, $2, 'submission_complete', $3)`,
        [req.user.id, xp, progress.rows[0]?.id || null]
      );
    }

    res.json({ ok: true, xp_earned: xp, coins_earned: xp });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/progress/next — siguiente lección no completada del polo del usuario
router.get('/progress/next', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await db.query('SELECT pole_id FROM users WHERE id=$1', [req.user.id]);
    if (!user?.pole_id) return res.json({ submission: null });

    const { rows } = await db.query(`
      SELECT s.id, s.name, s.description, s.content, s.tips, s.quiz_question, s.quiz_options, s.reward_xp,
             m.id AS mission_id, m.name AS mission_name, c.name AS campaign_name
      FROM submissions s
      JOIN missions m ON s.mission_id = m.id
      JOIN campaigns c ON m.campaign_id = c.id
      WHERE c.pole_id = $1
        AND s.id NOT IN (
          SELECT submission_id FROM user_progress WHERE user_id=$2 AND status='completed'
        )
      ORDER BY c.id, m.id, s.id
      LIMIT 1
    `, [user.pole_id, req.user.id]);

    res.json({ submission: rows[0] || null });
  } catch (err) {
    console.error('[syd] next lesson error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/progress/recent — últimas 3 misiones completadas
router.get('/progress/recent', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT up.submission_id, up.end_time, up.mission_id,
              s.name AS submission_name, s.reward_xp,
              m.name AS mission_name
       FROM user_progress up
       JOIN submissions s ON s.id = up.submission_id
       JOIN missions m ON m.id = up.mission_id
       WHERE up.user_id=$1 AND up.status='completed'
       ORDER BY up.end_time DESC
       LIMIT 3`,
      [req.user.id]
    );
    res.json({ recent: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/progress — progreso del usuario autenticado
router.get('/progress', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT up.*, s.name AS submission_name, m.name AS mission_name
       FROM user_progress up
       JOIN submissions s ON s.id = up.submission_id
       JOIN missions m ON m.id = up.mission_id
       WHERE up.user_id=$1 AND up.status='completed'
       ORDER BY up.end_time DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/wallet — saldo e historial de BertCoins
router.get('/wallet', requireAuth, async (req, res) => {
  try {
    const userRes = await db.query('SELECT bertcoins FROM users WHERE id=$1', [req.user.id]);
    const { rows } = await db.query(
      `SELECT amount, reason, ref_id, created_at
       FROM bertcoin_transactions
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    res.json({ bertcoins: userRes.rows[0]?.bertcoins || 0, transactions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
