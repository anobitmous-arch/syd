-- WishTrade migration
-- Run: docker exec -i syd_postgres psql -U syd_user -d syd_campus < syd-wishtrade-migration.sql

CREATE TABLE IF NOT EXISTS wish_trade_snapshots (
  id            SERIAL PRIMARY KEY,
  symbol        VARCHAR(10) NOT NULL,
  price         NUMERIC(20,8) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, snapshot_date)
);

CREATE TABLE IF NOT EXISTS wish_trades (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       VARCHAR(10) NOT NULL,
  direction    VARCHAR(5) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  bet_amount   INT NOT NULL CHECK (bet_amount >= 5),
  entry_price  NUMERIC(20,8) NOT NULL,
  trade_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status       VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  exit_price   NUMERIC(20,8),
  payout       INT DEFAULT 0,
  settled_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_wt_user     ON wish_trades(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_wt_open     ON wish_trades(trade_date, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_wts_date    ON wish_trade_snapshots(snapshot_date);
