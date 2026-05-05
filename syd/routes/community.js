'use strict';
const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = Router();

// GET /api/syd/community/:pole_id — posts del polo con autor y conteo de comentarios
router.get('/:pole_id', async (req, res) => {
  const pole_id = parseInt(req.params.pole_id);
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.content, p.created_at,
              u.username, u.avatar_id,
              a.name AS avatar_name,
              u.pole_id AS author_pole_id,
              COUNT(c.id)::int AS comment_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN avatars a ON a.id = u.avatar_id
       LEFT JOIN comments c ON c.post_id = p.id
       WHERE p.pole_id = $1
       GROUP BY p.id, u.username, u.avatar_id, a.name, u.pole_id
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [pole_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/community — crear post (requiere auth)
router.post('/', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'El post no puede estar vacío' });
  if (content.length > 1000) return res.status(400).json({ error: 'Máximo 1000 caracteres' });

  try {
    const userRes = await db.query('SELECT pole_id FROM users WHERE id=$1', [req.user.id]);
    const pole_id = userRes.rows[0]?.pole_id;
    if (!pole_id) return res.status(400).json({ error: 'Necesitas seleccionar un polo primero' });

    const { rows } = await db.query(
      `INSERT INTO posts (user_id, pole_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [req.user.id, pole_id, content.trim()]
    );
    res.status(201).json({ post: { ...rows[0], username: req.user.username, comment_count: 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/community/post/:id — post con comentarios
router.get('/post/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const postRes = await db.query(
      `SELECT p.*, u.username, a.name AS avatar_name, u.pole_id AS author_pole_id
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN avatars a ON a.id = u.avatar_id
       WHERE p.id = $1`,
      [id]
    );
    if (!postRes.rows.length) return res.status(404).json({ error: 'Post no encontrado' });

    const commentsRes = await db.query(
      `SELECT c.id, c.content, c.created_at,
              u.username, a.name AS avatar_name, u.pole_id AS author_pole_id
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN avatars a ON a.id = u.avatar_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );
    res.json({ post: postRes.rows[0], comments: commentsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/community/post/:id/comment — añadir comentario
router.post('/post/:id/comment', requireAuth, async (req, res) => {
  const post_id = parseInt(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  if (content.length > 500) return res.status(400).json({ error: 'Máximo 500 caracteres' });

  try {
    const { rows } = await db.query(
      `INSERT INTO comments (post_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [post_id, req.user.id, content.trim()]
    );
    res.status(201).json({ comment: { ...rows[0], username: req.user.username } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
