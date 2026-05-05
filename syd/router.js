'use strict';
const { Router } = require('express');
const usersRouter = require('./routes/users');
const polesRouter = require('./routes/poles');
const missionsRouter = require('./routes/missions');
const communityRouter = require('./routes/community');
const checkinRouter = require('./routes/checkin');
const newsRouter = require('./routes/news');
const wishTradeRouter = require('./routes/wishtrade');
const adminRouter = require('./routes/admin');

const router = Router();

router.use('/admin', adminRouter);
router.use('/auth', usersRouter);
router.use('/poles', polesRouter);
router.use('/community', communityRouter);
router.use('/daily-checkin', checkinRouter);
router.use('/news', newsRouter);
router.use('/wish-trade', wishTradeRouter);
router.use('/', missionsRouter);

router.get('/health', (req, res) => res.json({ ok: true, service: 'syd' }));

module.exports = router;
