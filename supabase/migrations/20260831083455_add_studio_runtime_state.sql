-- Transitional persistence bridge for the current synchronous StudioStore.
-- The game server is the only writer; clients never access this table directly.
CREATE TABLE IF NOT EXISTS public.studio_runtime_state (
  state_id TEXT PRIMARY KEY,
  state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.studio_runtime_state IS
  'Private SkyOffice runtime snapshot. Accessed only by the long-running game server.';

ALTER TABLE public.studio_runtime_state ENABLE ROW LEVEL SECURITY;

-- The current server connects through the Supabase Postgres connection string,
-- not the browser Data API. Keep the table inaccessible to public API roles.
REVOKE ALL ON TABLE public.studio_runtime_state FROM anon, authenticated;
