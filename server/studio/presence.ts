import { Presence, StudioRole } from '../../types/Studio'

interface ActivePresenceSession {
  presence: Presence
  updatedAt: number
}

// The public snapshot remains keyed by userId for compatibility with the
// existing Studio API. Internally we retain one record per connection so a
// second browser tab cannot be marked offline when the first tab disconnects.
const connectedMembers = new Map<string, Presence>()
const activeSessions = new Map<string, ActivePresenceSession>()

type PresenceInput = {
  userId: string
  displayName: string
  role: StudioRole
  x: number
  y: number
  currentRoom: string
  sessionId?: string
  status?: 'ONLINE' | 'AWAY' | 'BUSY' | 'IN_ACTIVITY'
  activity?: string
  partyId?: string
}

function latestSessionForUser(userId: string): ActivePresenceSession | undefined {
  let latest: ActivePresenceSession | undefined
  activeSessions.forEach((candidate) => {
    if (candidate.presence.userId !== userId) return
    if (!latest || candidate.updatedAt >= latest.updatedAt) latest = candidate
  })
  return latest
}

function publishLatest(userId: string): Presence | undefined {
  const latest = latestSessionForUser(userId)
  if (latest) {
    connectedMembers.set(userId, { ...latest.presence, online: true })
    return connectedMembers.get(userId)
  }
  return connectedMembers.get(userId)
}

export function markOnline(input: PresenceInput): Presence {
  const sessionId = input.sessionId || input.userId
  const presence: Presence = {
    userId: input.userId,
    displayName: input.displayName,
    role: input.role,
    currentRoom: input.currentRoom,
    online: true,
    x: input.x,
    y: input.y,
    sessionId,
    status: input.status || 'ONLINE',
    activity: input.activity,
    partyId: input.partyId,
    lastSeenAt: new Date().toISOString(),
  }
  activeSessions.set(sessionId, { presence, updatedAt: Date.now() })
  connectedMembers.set(input.userId, presence)
  return presence
}

export function updatePresence(
  userId: string,
  patch: Partial<Pick<Presence, 'x' | 'y' | 'currentRoom' | 'displayName' | 'role' | 'status' | 'activity' | 'partyId'>>,
  sessionId?: string,
): Presence | undefined {
  const targetSessionId = sessionId || [...activeSessions.entries()].find(([, value]) => value.presence.userId === userId)?.[0]
  if (!targetSessionId) {
    const current = connectedMembers.get(userId)
    if (!current) return undefined
    const next = { ...current, ...patch, online: true, lastSeenAt: new Date().toISOString() }
    connectedMembers.set(userId, next)
    return next
  }
  const currentSession = activeSessions.get(targetSessionId)
  if (!currentSession || currentSession.presence.userId !== userId) return undefined
  const next = { ...currentSession.presence, ...patch, online: true, lastSeenAt: new Date().toISOString() }
  activeSessions.set(targetSessionId, { presence: next, updatedAt: Date.now() })
  return publishLatest(userId)
}

export function markOffline(userId: string, sessionId?: string): Presence | undefined {
  if (sessionId) {
    const session = activeSessions.get(sessionId)
    if (session?.presence.userId === userId) activeSessions.delete(sessionId)
  } else {
    ;[...activeSessions.entries()].forEach(([key, value]) => {
      if (value.presence.userId === userId) activeSessions.delete(key)
    })
  }

  const active = publishLatest(userId)
  if (active && [...activeSessions.values()].some((session) => session.presence.userId === userId)) return active

  const current = connectedMembers.get(userId)
  if (!current) return undefined
  const next: Presence = { ...current, online: false, status: undefined, activity: undefined, partyId: undefined, lastSeenAt: new Date().toISOString() }
  connectedMembers.set(userId, next)
  return next
}

export function getPresence(): Map<string, Presence> {
  return connectedMembers
}

export function resetPresence() {
  connectedMembers.clear()
  activeSessions.clear()
}
