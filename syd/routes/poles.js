'use strict';
const { Router } = require('express');
const db = require('../db');

const router = Router();

// GET /api/syd/poles — todos los polos con sus avatares visibles
router.get('/', async (req, res) => {
  try {
    const poles = await db.query('SELECT * FROM poles ORDER BY id');
    const avatars = await db.query(
      'SELECT * FROM avatars WHERE is_vip=FALSE ORDER BY pole_id, is_visible DESC, id'
    );

    const result = poles.rows.map(pole => ({
      ...pole,
      avatars: avatars.rows.filter(a => a.pole_id === pole.id),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/syd/poles/:id — un polo con sus campañas
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const poleRes = await db.query('SELECT * FROM poles WHERE id=$1', [id]);
    if (!poleRes.rows.length) return res.status(404).json({ error: 'Polo no encontrado' });

    const campaignsRes = await db.query(
      'SELECT * FROM campaigns WHERE pole_id=$1 ORDER BY id',
      [id]
    );
    res.json({ ...poleRes.rows[0], campaigns: campaignsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
