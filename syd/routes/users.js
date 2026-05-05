'use strict';
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = Router();

// POST /api/syd/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password, ref_code } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const exists = await db.query(
      'SELECT id FROM users WHERE username=$1 OR email=$2',
      [username, email]
    );
    if (exists.rows.length)
      return res.status(409).json({ error: 'Usuario o email ya registrado' });

    // Resolve referrer if ref_code provided
    let referredBy = null;
    if (ref_code) {
      const { rows: refRows } = await db.query(
        'SELECT id FROM users WHERE ref_code=$1',
        [ref_code.toUpperCase()]
      );
      if (refRows.length) referredBy = refRows[0].id;
    }

    const hash = await bcrypt.hash(password, 10);
    const newRefCode = username.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3) +
      Math.random().toString(36).substring(2, 5).toUpperCase();
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash, referred_by, ref_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, xp, level, bertcoins, pole_id, avatar_id, ref_code`,
      [username, email, hash, referredBy, newRefCode]
    );
    const user = rows[0];
    setAuthCookie(res, { id: user.id, username: user.username });
    res.status(201).json({ user });
  } catch (err) {
    console.error('[syd] register error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.xp, u.level, u.bertcoins, u.streak,
              u.pole_id, u.avatar_id, u.ref_code,
              p.name AS pole_name, a.name AS avatar_name
       FROM users u
       LEFT JOIN poles p ON p.id = u.pole_id
       LEFT JOIN avatars a ON a.id = u.avatar_id
       WHERE u.email = $1`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciales inválidas' });

    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);

    const { password_hash, ...safe } = user;
    setAuthCookie(res, { id: user.id, username: user.username });
    res.json({ user: safe });
  } catch (err) {
    console.error('[syd] login error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/syd/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.email, u.xp, u.level, u.bertcoins, u.streak,
              u.pole_id, u.avatar_id, u.ref_code,
              p.name AS pole_name, a.name AS avatar_name
       FROM users u
       LEFT JOIN poles p ON p.id = u.pole_id
       LEFT JOIN avatars a ON a.id = u.avatar_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/auth/select — asignar polo + avatar tras el questionnaire
router.post('/select', requireAuth, async (req, res) => {
  const { pole_id, avatar_id } = req.body;
  if (!pole_id || !avatar_id)
    return res.status(400).json({ error: 'Falta pole_id o avatar_id' });

  try {
    // Validar que el avatar pertenece al polo y está disponible
    const { rows } = await db.query(
      `SELECT id FROM avatars
       WHERE id=$1 AND pole_id=$2 AND is_vip=FALSE`,
      [avatar_id, pole_id]
    );
    if (!rows.length)
      return res.status(400).json({ error: 'Avatar inválido para ese polo' });

    await db.query(
      'UPDATE users SET pole_id=$1, avatar_id=$2 WHERE id=$3',
      [pole_id, avatar_id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/auth/forgot — solicitar reset de contraseña
router.post('/forgot', async (req, res) => {
  const { email } = req.body;
  // Siempre responde OK para no revelar qué emails existen
  res.json({ ok: true, message: 'Si el email existe, recibirás el enlace de recuperación.' });
  if (!email) return;

  try {
    const { rows } = await db.query('SELECT id, username FROM users WHERE email=$1', [email]);
    if (!rows.length) return;

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token) VALUES ($1, $2)`,
      [user.id, token]
    );

    const resetUrl = `https://bertcrypto.com/syd/reset.html?token=${token}`;
    // Log para que el admin pueda enviar manualmente hasta que email esté configurado
    console.log(`[syd] PASSWORD RESET REQUEST — user: ${user.username} (${email}) — url: ${resetUrl}`);
  } catch (err) {
    console.error('[syd] forgot error:', err.message);
  }
});

// POST /api/syd/auth/reset — ejecutar reset de contraseña
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6)
    return res.status(400).json({ error: 'Token y contraseña (mín. 6 chars) requeridos' });

  try {
    const { rows } = await db.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token=$1`,
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Token inválido' });
    const t = rows[0];
    if (t.used_at) return res.status(400).json({ error: 'Este enlace ya fue usado' });
    if (new Date(t.expires_at) < new Date()) return res.status(400).json({ error: 'El enlace ha caducado (1h)' });

    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, t.user_id]);
    await db.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [t.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[syd] reset error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/auth/referrals — ref_code del usuario + contador de referidos
router.get('/referrals', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await db.query(
      'SELECT ref_code FROM users WHERE id=$1',
      [req.user.id]
    );
    const { rows: [count] } = await db.query(
      'SELECT COUNT(*) AS total FROM users WHERE referred_by=$1',
      [req.user.id]
    );
    res.json({ ref_code: user?.ref_code || null, count: parseInt(count.total) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
