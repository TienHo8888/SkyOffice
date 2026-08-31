import http from 'http'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
import { RoomType } from '../types/Rooms'

// import socialRoutes from "@colyseus/social/express"

import { SkyOffice } from './rooms/SkyOffice'
import { WorldRoom } from './rooms/WorldRoom'
import { createStudioApi } from './studio/api'
import { studioStore } from './studio/store'
import { createSupabaseStatePersistenceFromEnv } from './studio/supabase-persistence'
import type { StudioStatePersistence } from './studio/supabase-persistence'

const port = Number(process.env.PORT || 2567)
const app = express()

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors(allowedOrigins.length ? {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    // Let Express complete the request without CORS headers. The browser will
    // reject the cross-origin response, while health checks and logs stay
    // readable instead of turning an origin mismatch into a server 500.
    return callback(null, false)
  },
} : undefined))
app.use(express.json())
app.use('/api', createStudioApi())
app.get('/healthz', (_req, res) => {
  const persistence = studioStore.getPersistenceStatus()
  res.status(persistence.ready && !persistence.error ? 200 : 503).json({
    ok: persistence.ready && !persistence.error,
    service: 'skyoffice-server',
    persistence,
    time: new Date().toISOString(),
  })
})

const server = http.createServer(app)
const gameServer = new Server({
  server,
})
let activePersistence: StudioStatePersistence | undefined
let shuttingDown = false

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, SkyOffice, {
  name: 'Public Lobby',
  description: 'For making friends and familiarizing yourself with the controls',
  password: null,
  autoDispose: false,
})
// Fishing is one authenticated public destination. The room's 100-client
// limit is a server-safety capacity, not an access rule or a four-player shard.
gameServer.define(RoomType.FISHING, WorldRoom, {
  worldId: 'FISHING',
  mapId: 'fishing_riverbend_v1',
}).filterBy(['worldId'])
// Home rooms are keyed by ownerId so guests share the owner's live layout.
gameServer.define(RoomType.HOME, WorldRoom, {
  worldId: 'HOME',
  mapId: 'home_room_v1',
}).filterBy(['ownerId'])

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/server/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

// register colyseus monitor AFTER registering your room handlers
app.use('/colyseus', monitor())

const clientDist = path.resolve(process.cwd(), 'client/dist')
app.use(express.static(clientDist))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/colyseus')) return next()
  res.sendFile(path.join(clientDist, 'index.html'), (error) => error && next())
})

async function start() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Production requires JWT_SECRET with at least 32 characters.')
    }
    if (!process.env.STUDIO_ADMIN_PASSWORD || process.env.STUDIO_ADMIN_PASSWORD.length < 16) {
      throw new Error('Production requires STUDIO_ADMIN_PASSWORD with at least 16 characters.')
    }
    if (!process.env.STUDIO_ADMIN_EMAIL || !process.env.STUDIO_ADMIN_EMAIL.includes('@')) {
      throw new Error('Production requires STUDIO_ADMIN_EMAIL.')
    }
    if (!process.env.STUDIO_ADMIN_USERNAME || !/^[a-z0-9][a-z0-9._-]{1,31}$/i.test(process.env.STUDIO_ADMIN_USERNAME)) {
      throw new Error('Production requires a valid STUDIO_ADMIN_USERNAME.')
    }
    if ((process.env.STUDIO_PERSISTENCE || 'local').trim().toLowerCase() !== 'supabase') {
      throw new Error('Production requires STUDIO_PERSISTENCE=supabase; local JSON persistence is disabled for public deployment.')
    }
  }

  activePersistence = createSupabaseStatePersistenceFromEnv()
  if (activePersistence) {
    await studioStore.hydrateFromSupabase(activePersistence)
    console.log('Studio state hydrated from Supabase.')
  }

  await gameServer.listen(port)
  console.log(`Listening on port ${port}`)
}

void start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}; shutting down SkyOffice cleanly.`)
  try {
    await gameServer.gracefullyShutdown(false)
    await studioStore.flushPersistence()
    await activePersistence?.close()
  } catch (error) {
    console.error('Graceful shutdown failed.', error)
    process.exitCode = 1
  }
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })
