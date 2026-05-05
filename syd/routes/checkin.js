'use strict';
const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = Router();
const DAILY_XP = 10;
const DAILY_COINS = 10;
const COOLDOWN_HOURS = 24;

// GET /api/syd/daily-checkin — estado sin modificar nada
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, created_at FROM daily_checkins
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '${COOLDOWN_HOURS} hours'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ done: rows.length > 0, checked_at: rows[0]?.created_at || null });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/daily-checkin
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await db.query(
      `SELECT id, created_at FROM daily_checkins
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '${COOLDOWN_HOURS} hours'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (rows.length) {
      return res.json({ xp_earned: 0, already_done: true, checked_at: rows[0].created_at });
    }
    const inserted = await db.query(
      `INSERT INTO daily_checkins (user_id, checked_date) VALUES ($1, CURRENT_DATE) RETURNING id, created_at`,
      [userId]
    );
    const checkinId = inserted.rows[0].id;

    // Calcular streak
    const { rows: [uc] } = await db.query(
      'SELECT streak, last_checkin_date FROM users WHERE id=$1', [userId]
    );
    let newStreak = 1;
    if (uc.last_checkin_date) {
      const lastStr = new Date(uc.last_checkin_date).toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      if (lastStr === yStr) newStreak = (uc.streak || 0) + 1;
    }

    await db.query(
      `UPDATE users SET xp=xp+$1, bertcoins=bertcoins+$2, streak=$3, last_checkin_date=CURRENT_DATE WHERE id=$4`,
      [DAILY_XP, DAILY_COINS, newStreak, userId]
    );
    await db.query(
      `INSERT INTO bertcoin_transactions (user_id, amount, reason, ref_id)
       VALUES ($1, $2, 'daily_checkin', $3)`,
      [userId, DAILY_COINS, checkinId]
    );

    // Referral bonus: solo en el primer checkin (streak=1) si el usuario fue referido
    let referralBonus = false;
    if (newStreak === 1) {
      const { rows: [u] } = await db.query(
        'SELECT referred_by FROM users WHERE id=$1', [userId]
      );
      if (u?.referred_by) {
        // Verificar que el bonus no se haya dado ya
        const { rows: alreadyBonused } = await db.query(
          `SELECT id FROM bertcoin_transactions
           WHERE user_id=$1 AND reason='referral_bonus' LIMIT 1`,
          [userId]
        );
        if (!alreadyBonused.length) {
          const REFERRAL_BONUS = 50;
          // +50 BRT al nuevo usuario
          await db.query(
            'UPDATE users SET bertcoins=bertcoins+$1 WHERE id=$2',
            [REFERRAL_BONUS, userId]
          );
          await db.query(
            `INSERT INTO bertcoin_transactions (user_id, amount, reason, ref_id)
             VALUES ($1, $2, 'referral_bonus', $3)`,
            [userId, REFERRAL_BONUS, u.referred_by]
          );
          // +50 BRT al referrer
          await db.query(
            'UPDATE users SET bertcoins=bertcoins+$1 WHERE id=$2',
            [REFERRAL_BONUS, u.referred_by]
          );
          await db.query(
            `INSERT INTO bertcoin_transactions (user_id, amount, reason, ref_id)
             VALUES ($1, $2, 'referral_reward', $3)`,
            [u.referred_by, REFERRAL_BONUS, userId]
          );
          referralBonus = true;
        }
      }
    }

    res.json({ xp_earned: DAILY_XP, coins_earned: DAILY_COINS, streak: newStreak, already_done: false, checked_at: inserted.rows[0].created_at, referral_bonus: referralBonus });
  } catch (err) {
    console.error('[syd] checkin error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
