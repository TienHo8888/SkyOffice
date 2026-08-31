import { Pool } from 'pg'
import type { StudioDbState } from './seed'

export interface StudioStatePersistence {
  load(): Promise<unknown | null>
  save(state: StudioDbState): Promise<void>
  close(): Promise<void>
}

const DEFAULT_STATE_ID = 'skyoffice-production'

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function shouldUseTls(connectionString: string): boolean {
  if (process.env.SUPABASE_DB_SSL === 'false') return false
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString)
}

function describeDatabaseError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Supabase database request failed.'
}

/**
 * Durable bridge for the current synchronous StudioStore.
 *
 * The domain store is intentionally kept synchronous because Colyseus room
 * handlers call it from realtime callbacks. This adapter loads one canonical
 * JSONB snapshot during boot, then serializes snapshots through a write queue.
 * It is suitable for the current single-instance MVP deployment. A future
 * multi-instance deployment should move wallet/reward mutations to normalized
 * SQL transactions instead of sharing one state blob.
 */
export class SupabaseStatePersistence implements StudioStatePersistence {
  private readonly pool: Pool
  private readonly stateId: string

  constructor(connectionString: string, stateId = DEFAULT_STATE_ID) {
    this.stateId = stateId
    this.pool = new Pool({
      connectionString,
      max: envNumber('SUPABASE_DB_POOL_SIZE', 5, 1, 20),
      idleTimeoutMillis: envNumber('SUPABASE_DB_IDLE_TIMEOUT_MS', 10_000, 1_000, 120_000),
      connectionTimeoutMillis: envNumber('SUPABASE_DB_CONNECTION_TIMEOUT_MS', 10_000, 1_000, 60_000),
      ...(shouldUseTls(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
    })
  }

  async load(): Promise<unknown | null> {
    try {
      const result = await this.pool.query<{ state: unknown }>(
        'SELECT state FROM public.studio_runtime_state WHERE state_id = $1 LIMIT 1',
        [this.stateId],
      )
      return result.rows[0]?.state ?? null
    } catch (error) {
      throw new Error(`Unable to load Studio state from Supabase: ${describeDatabaseError(error)}`)
    }
  }

  async save(state: StudioDbState): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO public.studio_runtime_state (state_id, state, version, updated_at)
         VALUES ($1, $2::jsonb, 1, NOW())
         ON CONFLICT (state_id) DO UPDATE
         SET state = EXCLUDED.state,
             version = public.studio_runtime_state.version + 1,
             updated_at = NOW()`,
        [this.stateId, JSON.stringify(state)],
      )
    } catch (error) {
      throw new Error(`Unable to save Studio state to Supabase: ${describeDatabaseError(error)}`)
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

export function createSupabaseStatePersistenceFromEnv(): SupabaseStatePersistence | undefined {
  const mode = (process.env.STUDIO_PERSISTENCE || 'local').trim().toLowerCase()
  if (mode === 'local' || mode === '') return undefined
  if (mode !== 'supabase') throw new Error('STUDIO_PERSISTENCE must be either "local" or "supabase".')

  const connectionString = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
  if (!connectionString) {
    throw new Error('STUDIO_PERSISTENCE=supabase requires SUPABASE_DB_URL (or DATABASE_URL).')
  }

  const stateId = (process.env.STUDIO_STATE_ID || DEFAULT_STATE_ID).trim() || DEFAULT_STATE_ID
  return new SupabaseStatePersistence(connectionString, stateId)
}
