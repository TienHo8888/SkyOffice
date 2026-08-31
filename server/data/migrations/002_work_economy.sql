-- Work-Life economy contract.
-- The current runtime persists StudioDbState as JSON. This migration is the
-- relational contract kept alongside the JSON backfill so a future SQL store
-- can use the same ids and unique constraints without changing the domain.

CREATE TABLE IF NOT EXISTS work_profiles (
  user_id TEXT PRIMARY KEY,
  current_career_id TEXT,
  tutorial_completed INTEGER NOT NULL DEFAULT 0,
  work_streak INTEGER NOT NULL DEFAULT 0,
  last_worked_date TEXT,
  last_salary_claim_date TEXT,
  last_career_change_at TEXT
);

CREATE TABLE IF NOT EXISTS work_career_progress (
  user_id TEXT NOT NULL,
  career_id TEXT NOT NULL,
  career_xp INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'INTERN',
  certification_rank TEXT,
  last_worked_at TEXT,
  PRIMARY KEY (user_id, career_id)
);

CREATE TABLE IF NOT EXISTS work_daily_stats (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  paid_jobs INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  career_xp_earned INTEGER NOT NULL DEFAULT 0,
  job_counts_json TEXT NOT NULL DEFAULT '{}',
  salary_claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS work_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  career_id TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  grade TEXT,
  coin_delta INTEGER NOT NULL DEFAULT 0,
  career_xp_delta INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  receipt_json TEXT
);

CREATE TABLE IF NOT EXISTS work_reward_claims (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_id TEXT,
  receipt_json TEXT NOT NULL,
  granted_at TEXT NOT NULL
);
