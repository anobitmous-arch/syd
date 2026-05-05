'use strict';
const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = Router();
const SYMBOLS = ['BTC', 'ETH', 'XRP', 'DOGE', 'BNB', 'SOL'];

async function getBinancePrice(symbol) {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
  if (!res.ok) throw new Error(`Binance error for ${symbol}: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.price);
}

// GET /api/syd/wish-trade/today — trades del día (uno por símbolo) + pendientes de ayer + saldo
router.get('/today', requireAuth, async (req, res) => {
  try {
    const [tradeRes, pendingRes, userRes] = await Promise.all([
      db.query(
        'SELECT * FROM wish_trades WHERE user_id=$1 AND trade_date=CURRENT_DATE ORDER BY created_at',
        [req.user.id]
      ),
      db.query(
        `SELECT * FROM wish_trades
         WHERE user_id=$1 AND trade_date=CURRENT_DATE-1 AND status='open'`,
        [req.user.id]
      ),
      db.query('SELECT bertcoins FROM users WHERE id=$1', [req.user.id]),
    ]);
    // Indexar trades de hoy por símbolo para fácil lookup en frontend
    const tradesBySymbol = {};
    for (const t of tradeRes.rows) tradesBySymbol[t.symbol] = t;

    res.json({
      trades:   tradesBySymbol,            // { BTC: {...}, ETH: {...}, ... }
      pending:  pendingRes.rows,           // trades de ayer sin liquidar
      bertcoins: userRes.rows[0]?.bertcoins || 0,
    });
  } catch (err) {
    console.error('[wish-trade] today error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/wish-trade/trade — colocar trade
router.post('/trade', requireAuth, async (req, res) => {
  const { symbol, direction, bet_amount } = req.body;

  if (!SYMBOLS.includes(symbol))
    return res.status(400).json({ error: 'Símbolo inválido' });
  if (!['LONG', 'SHORT'].includes(direction))
    return res.status(400).json({ error: 'Dirección inválida' });
  if (![1, 10, 100].includes(bet_amount))
    return res.status(400).json({ error: 'Apuesta debe ser 1, 10 o 100 BRT.' });

  // Ventana cerrada solo durante el settlement: 12:30:00 – 12:34:56 UTC
  const now = new Date();
  const utcSecs = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const SETTLE_BLOCK_START = 12 * 3600 + 30 * 60;      // 12:30:00
  const SETTLE_BLOCK_END   = 12 * 3600 + 34 * 60 + 56; // 12:34:56
  if (utcSecs >= SETTLE_BLOCK_START && utcSecs <= SETTLE_BLOCK_END)
    return res.status(400).json({ error: 'Ventana cerrada durante el settlement (12:30–12:34:57 UTC).' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Un trade por símbolo por día — dentro de la transacción con lock
    const existing = await client.query(
      'SELECT id FROM wish_trades WHERE user_id=$1 AND symbol=$2 AND trade_date=CURRENT_DATE',
      [req.user.id, symbol]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Ya tienes un trade en ${symbol} hoy.` });
    }

    // Verificar saldo con FOR UPDATE para evitar race conditions
    const userRow = await client.query(
      'SELECT bertcoins FROM users WHERE id=$1 FOR UPDATE',
      [req.user.id]
    );
    const balance = userRow.rows[0]?.bertcoins || 0;
    if (balance < bet_amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Saldo insuficiente (tienes ${balance} BRT).` });
    }

    // Obtener precio ANTES de modificar BD (si falla aquí, no hay cambios)
    const entry_price = await getBinancePrice(symbol);

    // Todo dentro de la transacción: descuento + transacción + trade
    await client.query(
      'UPDATE users SET bertcoins = bertcoins - $1 WHERE id=$2',
      [bet_amount, req.user.id]
    );
    await client.query(
      `INSERT INTO bertcoin_transactions (user_id, amount, reason)
       VALUES ($1, $2, 'wish_trade_entry')`,
      [req.user.id, -bet_amount]
    );
    const { rows } = await client.query(
      `INSERT INTO wish_trades (user_id, symbol, direction, bet_amount, entry_price, trade_date)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE) RETURNING *`,
      [req.user.id, symbol, direction, bet_amount, entry_price]
    );

    await client.query('COMMIT');
    res.json({ ok: true, trade: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[wish-trade] place error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// GET /api/syd/wish-trade/history — últimos 15 trades del usuario
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM wish_trades WHERE user_id=$1 ORDER BY trade_date DESC, created_at DESC LIMIT 15`,
      [req.user.id]
    );
    res.json({ trades: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/syd/wish-trade/settle — llamado por cron a las 12:34:56 UTC
router.post('/settle', async (req, res) => {
  const secret = process.env.SYD_NEWS_SECRET;
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'No autorizado' });

  try {
    // Obtener precios actuales
    const prices = {};
    for (const sym of SYMBOLS) {
      prices[sym] = await getBinancePrice(sym);
    }

    // Guardar snapshot
    for (const [sym, price] of Object.entries(prices)) {
      await db.query(
        `INSERT INTO wish_trade_snapshots (symbol, price, snapshot_date)
         VALUES ($1, $2, CURRENT_DATE)
         ON CONFLICT (symbol, snapshot_date) DO UPDATE SET price=$2, created_at=NOW()`,
        [sym, price]
      );
    }

    // Liquidar trades abiertos de ayer (colocados en la ventana 12:34:57–23:59:59)
    const { rows: openTrades } = await db.query(
      `SELECT * FROM wish_trades WHERE trade_date=CURRENT_DATE-1 AND status='open'`
    );

    let won = 0, lost = 0;
    for (const trade of openTrades) {
      const exitPrice = prices[trade.symbol];
      const entryPrice = parseFloat(trade.entry_price);
      const priceUp   = exitPrice > entryPrice;
      const priceDown = exitPrice < entryPrice;
      const isWon = (trade.direction === 'LONG' && priceUp) ||
                    (trade.direction === 'SHORT' && priceDown);
      const status = isWon ? 'won' : 'lost';
      const payout = isWon ? trade.bet_amount * 2 : 0;

      await db.query(
        `UPDATE wish_trades
         SET status=$1, exit_price=$2, payout=$3, settled_at=NOW()
         WHERE id=$4`,
        [status, exitPrice, payout, trade.id]
      );

      if (isWon) {
        await db.query(
          'UPDATE users SET bertcoins = bertcoins + $1 WHERE id=$2',
          [payout, trade.user_id]
        );
        await db.query(
          `INSERT INTO bertcoin_transactions (user_id, amount, reason, ref_id)
           VALUES ($1, $2, 'wish_trade_payout', $3)`,
          [trade.user_id, payout, trade.id]
        );
        won++;
      } else {
        lost++;
      }
    }

    res.json({ ok: true, settled: openTrades.length, won, lost, prices });
  } catch (err) {
    console.error('[wish-trade] settle error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
