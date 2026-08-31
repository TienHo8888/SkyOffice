-- PostgreSQL-compatible schema contract for the Studio OS persistence adapter.
-- The local MVP uses the file-backed adapter in server/studio/store.ts so it can
-- run without Docker. This migration is the hand-off contract for PostgreSQL.
CREATE TABLE IF NOT EXISTS studios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_progressions (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  game_xp INTEGER NOT NULL DEFAULT 0,
  game_level INTEGER NOT NULL DEFAULT 1,
  coin_balance INTEGER NOT NULL DEFAULT 1000,
  daily_claim_date DATE,
  free_reward_date DATE,
  free_rounds_rewarded_today INTEGER NOT NULL DEFAULT 0,
  game_xp_date DATE,
  game_xp_earned_today INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_quest_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  quest_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, quest_id, period_key)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cosmetic_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  slot TEXT NOT NULL,
  rarity TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  unlock_level INTEGER,
  starter BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS owned_cosmetics (
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
  source TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_loadouts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  avatar_key TEXT NOT NULL DEFAULT 'adam',
  outfit_id TEXT,
  nameplate_id TEXT,
  title_id TEXT,
  border_id TEXT,
  emote_id TEXT
);

CREATE TABLE IF NOT EXISTS properties (
  owner_id TEXT PRIMARY KEY REFERENCES users(id),
  template_id TEXT NOT NULL DEFAULT 'room_template_v1',
  layout_version INTEGER NOT NULL DEFAULT 1,
  visit_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_furniture (
  owner_id TEXT NOT NULL REFERENCES properties(owner_id),
  item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  rotation INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, item_id)
);

CREATE TABLE IF NOT EXISTS property_visits (
  owner_id TEXT NOT NULL REFERENCES properties(owner_id),
  viewer_id TEXT NOT NULL REFERENCES users(id),
  visit_date DATE NOT NULL,
  PRIMARY KEY (owner_id, viewer_id, visit_date)
);

CREATE TABLE IF NOT EXISTS property_likes (
  owner_id TEXT NOT NULL REFERENCES properties(owner_id),
  viewer_id TEXT NOT NULL REFERENCES users(id),
  like_date DATE NOT NULL,
  PRIMARY KEY (owner_id, viewer_id, like_date)
);

CREATE TABLE IF NOT EXISTS property_gifts (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES cosmetic_catalog(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_rounds (
  round_id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  game_id TEXT NOT NULL,
  winner_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_reward_claims (
  idempotency_key TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  coin_delta INTEGER NOT NULL DEFAULT 0,
  game_xp_delta INTEGER NOT NULL DEFAULT 0,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_members (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL,
  sprint_boss_id TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sprint_id TEXT REFERENCES sprints(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee_id TEXT REFERENCES users(id),
  quest_xp INTEGER NOT NULL DEFAULT 100,
  studio_xp_reward INTEGER NOT NULL DEFAULT 50,
  boss_damage INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
  quest_type TEXT NOT NULL,
  xp_reward INTEGER NOT NULL,
  studio_xp_reward INTEGER NOT NULL,
  boss_damage INTEGER NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sprint_bosses (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL UNIQUE REFERENCES sprints(id),
  name TEXT NOT NULL,
  max_hp INTEGER NOT NULL,
  current_hp INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_resources (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
