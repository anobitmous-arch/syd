-- BertCoin migration
-- Run: docker exec -i syd_postgres psql -U syd_user -d syd_db < syd-bertcoin-migration.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS bertcoins INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS bertcoin_transactions (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INT NOT NULL,
  reason     VARCHAR(64) NOT NULL,   -- 'daily_checkin' | 'submission_complete'
  ref_id     INT,                    -- checkin id or submission id
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_tx_user ON bertcoin_transactions(user_id, created_at DESC);
