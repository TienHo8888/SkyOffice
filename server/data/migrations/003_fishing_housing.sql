-- Fishing inventory and Home-world access/layout contract.
-- The local runtime is still file-backed (StudioDbState). This migration is
-- the PostgreSQL shape for the same canonical server-side data.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'FRIENDS',
  ADD COLUMN IF NOT EXISTS wall_style_id TEXT NOT NULL DEFAULT 'starter_wallpaper',
  ADD COLUMN IF NOT EXISTS floor_style_id TEXT NOT NULL DEFAULT 'wooden_floor';

CREATE TABLE IF NOT EXISTS player_inventory (
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  receipt_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_transactions_user_created_idx
  ON inventory_transactions (user_id, created_at);
