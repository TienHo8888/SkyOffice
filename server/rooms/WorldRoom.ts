import { Client, Room, ServerError } from 'colyseus'
import { randomInt } from 'crypto'
import { ChatMessage, Player } from './schema/OfficeState'
import { WorldState } from './schema/WorldState'
import { Message } from '../../types/Messages'
import {
  FISHING_BITE_DELAY_MAX_MS,
  FISHING_BITE_DELAY_MIN_MS,
  FISHING_COOLDOWN_MS,
  FISHING_DAILY_LIMIT,
  FISHING_MAP_ID,
  FISHING_REEL_WINDOW_MAX_MS,
  FISHING_REEL_WINDOW_MIN_MS,
  FishingCatchReceipt,
  getFishingSpawnPoint,
  getFishingSpot,
  isFishingPositionWalkable,
} from '../../types/Fishing'
import type { FishingCastState } from '../../types/Fishing'
import type { WorldId, WorldRoomOptions } from '../../types/IWorldState'
import { HOME_MAP_ID } from '../../types/Housing'
import { StudioRole } from '../../types/Studio'
import { isCharacterConfig } from '../../types/Avatar'
import { SocialEmoteEvent, SocialEmotePayload } from '../../types/Social'
import { verifySessionToken } from '../studio/auth'
import { markOffline, markOnline, updatePresence } from '../studio/presence'
import { DomainError, studioStore } from '../studio/store'
import { worldRoomRegistry } from './world-room-registry'

const WORLD_BOUNDS: Record<WorldId, { minX: number; maxX: number; minY: number; maxY: number }> = {
  FISHING: { minX: 48, maxX: 1488, minY: 48, maxY: 976 },
  HOME: { minX: 64, maxX: 960, minY: 64, maxY: 640 },
}
const MOVEMENT_TOLERANCE_PX = 72
const MOVEMENT_SPEED_PX_PER_SECOND = 260
const CHAT_HISTORY_LIMIT = 100
const CHAT_MESSAGE_MAX_LENGTH = 180
const CHAT_COOLDOWN_MS = 500
const SOCIAL_EMOTE_COOLDOWN_MS = 650
const FISHING_REQUEST_ID_PATTERN = /^[-a-zA-Z0-9_:]{8,120}$/

type WorldJoinOptions = Partial<WorldRoomOptions> & {
  token?: string
  ownerId?: string
  worldId?: WorldId
  mapId?: string
}

interface ActiveFishingAttempt {
  requestId: string
  spotId: string
  userId: string
  state: 'WAITING' | 'BITE'
  biteAt: number
  expiresAt: number
  windowMs: number
  timers: NodeJS.Timeout[]
}

export class WorldRoom extends Room<WorldState> {
  private worldId: WorldId = 'FISHING'
  private ownerId = ''
  private mapId = FISHING_MAP_ID
  private studioId = ''
  private unregisterHome?: () => void
  private roomDataTimers = new Map<string, NodeJS.Timeout>()
  private lastAcceptedMovement = new Map<string, { x: number; y: number; acceptedAt: number }>()
  private lastChatAt = new Map<string, number>()
  private lastEmoteAt = new Map<string, number>()
  private fishingLastCatchAt = new Map<string, number>()
  private fishingReceipts = new Map<string, FishingCatchReceipt>()
  private fishingAttempts = new Map<string, ActiveFishingAttempt>()
  private fishingEventSequence = 0

  onCreate(options: WorldJoinOptions = {}) {
    this.worldId = options.worldId === 'HOME' ? 'HOME' : 'FISHING'
    this.ownerId = this.worldId === 'HOME' ? String(options.ownerId || '') : ''
    this.mapId = this.worldId === 'HOME' ? HOME_MAP_ID : FISHING_MAP_ID
    const session = this.sessionFromOptions(options)
    const user = session ? studioStore.getUserById(session.userId) : undefined
    this.studioId = user?.studioId || ''
    if (this.worldId === 'HOME' && !this.ownerId) throw new ServerError(400, 'A Home owner is required.')

    this.maxClients = this.worldId === 'FISHING' ? 100 : 12
    this.autoDispose = this.worldId === 'FISHING' ? false : true
    if (this.worldId === 'FISHING') this.installFishingCapacityPolicy()
    this.setState(new WorldState())
    this.state.worldId = this.worldId
    this.state.ownerId = this.ownerId
    this.state.mapId = this.mapId
    this.syncHomeLayout()
    this.setMetadata({ worldId: this.worldId, ownerId: this.ownerId || undefined, mapId: this.mapId, maxClients: this.maxClients })
    if (this.worldId === 'HOME') this.unregisterHome = worldRoomRegistry.registerHome(this.ownerId, (snapshot) => this.applyHomeLayout(snapshot))

    this.onMessage(Message.UPDATE_PLAYER, (client, message: { x: number; y: number; anim: string }) => this.handlePlayerMovement(client, message))
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => this.handlePlayerName(client, message))
    this.onMessage(Message.UPDATE_PLAYER_CHARACTER_CONFIG, (client, message: { characterConfig?: unknown; revision?: number }) => this.handleCharacterConfig(client, message))
    this.onMessage(Message.UPDATE_PLAYER_NAMEPLATE, (client) => this.handleNameplate(client))
    this.onMessage(Message.READY_TO_CONNECT, (client) => { const player = this.state.players.get(client.sessionId); if (player) player.readyToConnect = true })
    this.onMessage(Message.VIDEO_CONNECTED, (client) => { const player = this.state.players.get(client.sessionId); if (player) player.videoConnected = true })
    this.onMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => this.handleDisconnectStream(client, message))
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => this.handleChat(client, message))
    this.onMessage(Message.SOCIAL_EMOTE, (client, message: SocialEmotePayload) => this.handleSocialEmote(client, message || {} as SocialEmotePayload))
    this.onMessage(Message.FISHING_CAST_REQUEST, (client, message: { spotId: string; requestId: string }) => this.handleFishingCast(client, message))
    this.onMessage(Message.FISHING_CATCH_REQUEST, (client, message: { spotId: string; requestId: string }) => this.handleFishingCatch(client, message))
  }

  async onAuth(_client: Client, options: WorldJoinOptions = {}) {
    const session = this.sessionFromOptions(options)
    const user = session ? studioStore.getUserById(session.userId) : undefined
    if (!session || !user || user.studioId !== session.studioId) throw new ServerError(401, 'A valid studio session is required.')
    if (this.worldId === 'HOME' && options.ownerId && String(options.ownerId) !== this.ownerId) throw new ServerError(409, 'This Home room belongs to another owner.')
    return true
  }

  onJoin(client: Client, options: WorldJoinOptions = {}) {
    const session = this.sessionFromOptions(options)
    const user = session ? studioStore.getUserById(session.userId) : undefined
    if (!session || !user || user.studioId !== session.studioId) throw new ServerError(401, 'A valid studio session is required.')
    if (!this.studioId) this.studioId = user.studioId
    if (user.studioId !== this.studioId) throw new ServerError(403, 'This world is not available to this studio.')
    if (this.worldId === 'HOME') {
      if (String(options.ownerId || this.ownerId) !== this.ownerId) throw new ServerError(409, 'This Home room belongs to another owner.')
      if (!studioStore.canEnterProperty(this.studioId, this.ownerId, user.id)) throw new ServerError(403, 'You do not have access to this Home.')
      if (user.id !== this.ownerId) studioStore.getProperty(this.studioId, this.ownerId, user.id)
    }

    const player = new Player()
    player.userId = user.id
    player.name = user.displayName
    player.role = user.role as StudioRole
    player.anim = `${user.avatarKey || 'adam'}_idle_down`
    const loadout = studioStore.getSocialLoadout(user.studioId, user.id)
    player.nameplateId = loadout.nameplateId || 'nameplate-basic'
    player.titleId = loadout.titleId || ''
    player.characterConfigJson = user.characterConfig ? JSON.stringify(user.characterConfig) : ''
    player.avatarRevision = Math.max(1, user.avatarRevision || 1)
    const spawnIndex = this.state.players.size
    const spawn = this.spawnPoint(spawnIndex)
    player.x = spawn.x
    player.y = spawn.y
    player.currentRoom = this.worldId
    this.state.players.set(client.sessionId, player)
    this.lastAcceptedMovement.set(client.sessionId, { x: player.x, y: player.y, acceptedAt: Date.now() })
    this.markPlayerPresence(player, client.sessionId)

    const roomDataTimer = setTimeout(() => {
      this.roomDataTimers.delete(client.sessionId)
      if (!this.state.players.has(client.sessionId)) return
      try {
        client.send(Message.SEND_ROOM_DATA, { id: this.roomId, name: this.worldId === 'FISHING' ? 'Fishing · Riverbend' : `${user.displayName}'s Home`, description: this.worldId === 'FISHING' ? 'A public fishing destination for everyone.' : 'A private player home.', worldId: this.worldId, ownerId: this.ownerId, mapId: this.mapId })
      } catch { /* the client may have left before the deferred message */ }
    }, 0)
    this.roomDataTimers.set(client.sessionId, roomDataTimer)
  }

  onLeave(client: Client) {
    const timer = this.roomDataTimers.get(client.sessionId)
    if (timer) clearTimeout(timer)
    this.roomDataTimers.delete(client.sessionId)
    const player = this.state.players.get(client.sessionId)
    if (player) markOffline(player.userId, client.sessionId)
    this.state.players.delete(client.sessionId)
    this.lastAcceptedMovement.delete(client.sessionId)
    this.lastChatAt.delete(client.sessionId)
    this.lastEmoteAt.delete(client.sessionId)
    this.clearFishingAttempt(client.sessionId)
  }

  onDispose() {
    this.unregisterHome?.()
    this.unregisterHome = undefined
    this.state?.players.forEach((player, sessionId) => markOffline(player.userId, sessionId))
    this.roomDataTimers.forEach((timer) => clearTimeout(timer))
    this.roomDataTimers.clear()
    this.lastAcceptedMovement.clear()
    this.lastChatAt.clear()
    this.lastEmoteAt.clear()
    this.fishingLastCatchAt.clear()
    this.fishingReceipts.clear()
    this.fishingAttempts.forEach((attempt) => attempt.timers.forEach((timer) => clearTimeout(timer)))
    this.fishingAttempts.clear()
  }

  applyHomeLayout(snapshot: { ownerId: string; layoutVersion: number; furniture: unknown[]; styles: unknown; visibility: string; updatedAt: string }) {
    if (this.worldId !== 'HOME' || snapshot.ownerId !== this.ownerId) return
    this.state.layoutVersion = snapshot.layoutVersion
    this.state.layoutJson = JSON.stringify({ furniture: snapshot.furniture, styles: snapshot.styles, visibility: snapshot.visibility, updatedAt: snapshot.updatedAt })
    this.broadcast(Message.HOME_LAYOUT_UPDATED, snapshot)
  }

  private syncHomeLayout() {
    if (this.worldId !== 'HOME' || !this.studioId) return
    try {
      const property = studioStore.getProperty(this.studioId, this.ownerId)
      this.state.layoutVersion = property.layoutVersion
      this.state.layoutJson = JSON.stringify(property)
    } catch { /* the first authenticated join will report a useful error */ }
  }

  private sessionFromOptions(options: WorldJoinOptions) {
    return typeof options.token === 'string' ? verifySessionToken(options.token) : null
  }

  /**
   * Colyseus' stock joinOrCreate flow creates a second room when the first
   * room is locked by maxClients. Fishing V1 is intentionally one logical
   * public world, so keep its listing unlocked and reject reservations at the
   * capacity boundary instead. This preserves joinOrCreate on the client,
   * while making a full world return SeatReservationError rather than opening
   * an implicit shard. The implementation mirrors Room._reserveSeat from the
   * pinned 0.14 runtime and is isolated to the Fishing room type.
   */
  private installFishingCapacityPolicy() {
    const room = this as unknown as {
      _reserveSeat: (sessionId: string, joinOptions?: unknown, seconds?: number, allowReconnection?: boolean) => Promise<boolean>
      reservedSeats: Record<string, unknown>
      reservedSeatTimeouts: Record<string, NodeJS.Timeout>
    }
    room._reserveSeat = async (sessionId, joinOptions = true, seconds = this.seatReservationTime, allowReconnection = false) => {
      if (!allowReconnection && (this.clients.length + Object.keys(room.reservedSeats).length) >= this.maxClients) return false
      room.reservedSeats[sessionId] = joinOptions
      if (!allowReconnection) {
        try {
          await this.listing.updateOne({ $inc: { clients: 1 } })
        } catch {
          delete room.reservedSeats[sessionId]
          return false
        }
        room.reservedSeatTimeouts[sessionId] = setTimeout(async () => {
          delete room.reservedSeats[sessionId]
          delete room.reservedSeatTimeouts[sessionId]
          try { await this.listing.updateOne({ $inc: { clients: -1 } }) } catch { /* stale reservation cleanup is best effort */ }
        }, seconds * 1000)
        this.resetAutoDisposeTimeout(seconds)
      }
      return true
    }
  }

  private spawnPoint(index: number) {
    if (this.worldId === 'HOME') return { x: 480 + (index % 4) * 36, y: 360 + Math.floor(index / 4) * 36 }
    return getFishingSpawnPoint(index)
  }

  private handlePlayerMovement(client: Client, message: { x: number; y: number; anim: string }) {
    const player = this.state.players.get(client.sessionId)
    const bounds = WORLD_BOUNDS[this.worldId]
    const x = Number(message?.x)
    const y = Number(message?.y)
    if (!player || !Number.isFinite(x) || !Number.isFinite(y) || x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY || (this.worldId === 'FISHING' && !isFishingPositionWalkable(x, y))) {
      this.sendMovementCorrection(client, player)
      return
    }
    const now = Date.now()
    const previous = this.lastAcceptedMovement.get(client.sessionId) || { x: player.x, y: player.y, acceptedAt: now }
    const elapsedSeconds = Math.max(0.075, (now - previous.acceptedAt) / 1000)
    const maxDistance = Math.min(280, MOVEMENT_TOLERANCE_PX + MOVEMENT_SPEED_PX_PER_SECOND * elapsedSeconds)
    if (Math.hypot(x - previous.x, y - previous.y) > maxDistance) {
      this.sendMovementCorrection(client, player)
      return
    }
    this.lastAcceptedMovement.set(client.sessionId, { x, y, acceptedAt: now })
    player.x = x
    player.y = y
    if (typeof message?.anim === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(message.anim)) player.anim = message.anim
    player.currentRoom = this.worldId
    updatePresence(player.userId, { x, y, currentRoom: this.worldId }, client.sessionId)
  }

  private handlePlayerName(client: Client, message: { name: string }) {
    const player = this.state.players.get(client.sessionId)
    if (!player) return
    const name = String(message?.name || '').trim().slice(0, 24)
    if (!name) return
    player.name = name
    updatePresence(player.userId, { displayName: name }, client.sessionId)
  }

  private handleCharacterConfig(client: Client, message: { characterConfig?: unknown; revision?: number }) {
    const player = this.state.players.get(client.sessionId)
    if (!player || !isCharacterConfig(message?.characterConfig)) return
    player.characterConfigJson = JSON.stringify(message.characterConfig)
    if (Number.isFinite(message.revision) && Number(message.revision) >= player.avatarRevision) player.avatarRevision = Math.floor(Number(message.revision))
  }

  private handleNameplate(client: Client) {
    const player = this.state.players.get(client.sessionId)
    if (!player) return
    const user = studioStore.getUserById(player.userId)
    if (!user) return
    const loadout = studioStore.getSocialLoadout(user.studioId, user.id)
    player.nameplateId = loadout.nameplateId || 'nameplate-basic'
    player.titleId = loadout.titleId || ''
  }

  private handleDisconnectStream(client: Client, message: { clientId: string }) {
    if (!message?.clientId) return
    this.clients.forEach((candidate) => {
      if (candidate.sessionId === message.clientId) candidate.send(Message.DISCONNECT_STREAM, client.sessionId)
    })
  }

  private handleChat(client: Client, message: { content: string }) {
    const player = this.state.players.get(client.sessionId)
    if (!player) return
    const now = Date.now()
    if (now - (this.lastChatAt.get(client.sessionId) || 0) < CHAT_COOLDOWN_MS) return
    const content = String(message?.content || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MESSAGE_MAX_LENGTH)
    if (!content) return
    this.lastChatAt.set(client.sessionId, now)
    const chat = new ChatMessage()
    chat.author = player.name
    chat.createdAt = now
    chat.content = content
    this.state.chatMessages.push(chat)
    if (this.state.chatMessages.length > CHAT_HISTORY_LIMIT) this.state.chatMessages.splice(0, this.state.chatMessages.length - CHAT_HISTORY_LIMIT)
    this.broadcast(Message.ADD_CHAT_MESSAGE, { clientId: client.sessionId, content }, { except: client })
  }

  private handleSocialEmote(client: Client, message: SocialEmotePayload) {
    const player = this.state.players.get(client.sessionId)
    const actionId = String(message?.actionId || '')
    const emoteId = String(message?.emoteId || '').toUpperCase()
    if (!player || !/^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) || !new Set(['WAVE', 'HEART', 'CLAP', 'COFFEE', 'GG', 'THINK']).has(emoteId)) return
    const now = Date.now()
    if (now - (this.lastEmoteAt.get(client.sessionId) || 0) < SOCIAL_EMOTE_COOLDOWN_MS) return
    this.lastEmoteAt.set(client.sessionId, now)
    const payload: SocialEmoteEvent = { actionId, emoteId, userId: player.userId, sessionId: client.sessionId, displayName: player.name }
    this.broadcast(Message.SOCIAL_EMOTE, payload)
  }

  private handleFishingCast(client: Client, message: { spotId: string; requestId: string }) {
    if (this.worldId !== 'FISHING') return this.sendFishingError(client, 'WORLD_INVALID', 'Bạn không ở Fishing world.', message?.requestId)
    const player = this.state.players.get(client.sessionId)
    const requestId = String(message?.requestId || '')
    if (!player || !FISHING_REQUEST_ID_PATTERN.test(requestId)) return this.sendFishingError(client, 'FISHING_REQUEST_INVALID', 'Fishing request is invalid.', requestId)
    const user = studioStore.getUserById(player.userId)
    if (!user) return this.sendFishingError(client, 'UNAUTHORIZED', 'Session is no longer valid.', requestId)
    const utcDate = new Date().toISOString().slice(0, 10)
    const receiptKey = `${user.id}:${utcDate}:${requestId}`
    const existing = this.fishingReceipts.get(receiptKey) || studioStore.getFishingCatchReceipt(user.studioId, user.id, requestId, utcDate)
    if (existing) {
      this.fishingReceipts.set(receiptKey, existing)
      return client.send(Message.FISHING_CATCH_RESULT, { ...existing, duplicate: true })
    }
    const spotId = String(message?.spotId || '')
    const spot = getFishingSpot(spotId)
    if (!spot) return this.sendFishingError(client, 'FISHING_REQUEST_INVALID', 'Fishing spot is invalid.', requestId)
    if (Math.hypot(player.x - spot.x, player.y - spot.y) > spot.interactionRadius) return this.sendFishingError(client, 'FISHING_LOCATION_REQUIRED', 'Bạn cần đứng gần fishing spot.', requestId)

    const active = this.fishingAttempts.get(client.sessionId)
    if (active) {
      if (active.requestId !== requestId) return this.sendFishingError(client, 'FISHING_BUSY', 'Bạn đang có một dây câu ở dưới nước.', requestId)
      const remainingWindow = Math.max(0, active.expiresAt - Date.now())
      return this.sendFishingState(client, {
        requestId,
        spotId,
        state: active.state === 'BITE' ? 'BITE' : 'CASTED',
        sequence: ++this.fishingEventSequence,
        windowMs: active.state === 'BITE' ? remainingWindow : undefined,
      })
    }
    if (studioStore.getFishingDailyCount(user.studioId, user.id, utcDate) >= FISHING_DAILY_LIMIT) {
      return this.sendFishingError(client, 'FISHING_DAILY_LIMIT', `Hôm nay bạn đã câu đủ ${FISHING_DAILY_LIMIT} con.`, requestId)
    }

    const biteDelay = randomInt(FISHING_BITE_DELAY_MIN_MS, FISHING_BITE_DELAY_MAX_MS + 1)
    const windowMs = randomInt(FISHING_REEL_WINDOW_MIN_MS, FISHING_REEL_WINDOW_MAX_MS + 1)
    const attempt: ActiveFishingAttempt = {
      requestId,
      spotId,
      userId: user.id,
      state: 'WAITING',
      biteAt: 0,
      expiresAt: 0,
      windowMs,
      timers: [],
    }
    this.fishingAttempts.set(client.sessionId, attempt)
    this.sendFishingState(client, { requestId, spotId, state: 'CASTED', sequence: ++this.fishingEventSequence })

    // False nibbles are deliberately private. They make the wait less
    // predictable without leaking another player's attempt timing.
    const nibbleCount = randomInt(0, 3)
    for (let index = 0; index < nibbleCount; index += 1) {
      const baseDelay = Math.floor(biteDelay * ((index + 1) / (nibbleCount + 1)))
      const nibbleDelay = Math.max(550, baseDelay - randomInt(0, 180))
      if (biteDelay - nibbleDelay < 300) continue
      const nibbleTimer = setTimeout(() => {
        if (this.fishingAttempts.get(client.sessionId) !== attempt || attempt.state !== 'WAITING') return
        this.sendFishingState(client, { requestId, spotId, state: 'NIBBLE', sequence: ++this.fishingEventSequence })
      }, nibbleDelay)
      attempt.timers.push(nibbleTimer)
    }

    const biteTimer = setTimeout(() => {
      if (this.fishingAttempts.get(client.sessionId) !== attempt) return
      attempt.state = 'BITE'
      attempt.biteAt = Date.now()
      attempt.expiresAt = attempt.biteAt + attempt.windowMs
      this.sendFishingState(client, { requestId, spotId, state: 'BITE', sequence: ++this.fishingEventSequence, windowMs: attempt.windowMs })
      const expireTimer = setTimeout(() => {
        if (this.fishingAttempts.get(client.sessionId) !== attempt || attempt.state !== 'BITE') return
        this.sendFishingState(client, { requestId, spotId, state: 'MISSED', sequence: ++this.fishingEventSequence, reason: 'TIMEOUT' })
        this.clearFishingAttempt(client.sessionId)
      }, attempt.windowMs)
      attempt.timers.push(expireTimer)
    }, biteDelay)
    attempt.timers.push(biteTimer)
  }

  private handleFishingCatch(client: Client, message: { spotId: string; requestId: string }) {
    if (this.worldId !== 'FISHING') return this.sendFishingError(client, 'WORLD_INVALID', 'Bạn không ở Fishing world.', message?.requestId)
    const player = this.state.players.get(client.sessionId)
    const requestId = String(message?.requestId || '')
    if (!player || !FISHING_REQUEST_ID_PATTERN.test(requestId)) return this.sendFishingError(client, 'FISHING_REQUEST_INVALID', 'Fishing request is invalid.', requestId)
    const user = studioStore.getUserById(player.userId)
    if (!user) return this.sendFishingError(client, 'UNAUTHORIZED', 'Session is no longer valid.', requestId)
    const utcDate = new Date().toISOString().slice(0, 10)
    const receiptKey = `${user.id}:${utcDate}:${requestId}`
    const existing = this.fishingReceipts.get(receiptKey) || studioStore.getFishingCatchReceipt(user.studioId, user.id, requestId, utcDate)
    if (existing) {
      this.fishingReceipts.set(receiptKey, existing)
      return client.send(Message.FISHING_CATCH_RESULT, { ...existing, duplicate: true })
    }
    const spotId = String(message?.spotId || '')
    const spot = getFishingSpot(spotId)
    if (!spot) return this.sendFishingError(client, 'FISHING_REQUEST_INVALID', 'Fishing spot is invalid.', requestId)
    if (Math.hypot(player.x - spot.x, player.y - spot.y) > spot.interactionRadius) return this.sendFishingError(client, 'FISHING_LOCATION_REQUIRED', 'Bạn cần đứng gần fishing spot.', requestId)

    const attempt = this.fishingAttempts.get(client.sessionId)
    if (!attempt || attempt.requestId !== requestId || attempt.spotId !== spotId || attempt.userId !== user.id) {
      return this.sendFishingError(client, 'FISHING_NO_ACTIVE_CAST', 'Bạn cần thả câu trước khi giật cần.', requestId)
    }
    const now = Date.now()
    if (attempt.state !== 'BITE') {
      this.sendFishingState(client, { requestId, spotId, state: 'MISSED', sequence: ++this.fishingEventSequence, reason: 'TOO_EARLY' })
      this.clearFishingAttempt(client.sessionId)
      return
    }
    if (now > attempt.expiresAt) {
      this.sendFishingState(client, { requestId, spotId, state: 'MISSED', sequence: ++this.fishingEventSequence, reason: 'TOO_LATE' })
      this.clearFishingAttempt(client.sessionId)
      return
    }
    if (now - (this.fishingLastCatchAt.get(user.id) || 0) < FISHING_COOLDOWN_MS) {
      this.clearFishingAttempt(client.sessionId)
      return this.sendFishingError(client, 'FISHING_COOLDOWN', 'Bạn đang câu quá nhanh.', requestId)
    }
    this.clearFishingAttempt(client.sessionId)
    this.fishingLastCatchAt.set(user.id, now)
    try {
      const receipt = studioStore.claimFishingCatch({ userId: user.id, studioId: user.studioId, requestId, utcDate })
      this.fishingReceipts.set(receiptKey, receipt)
      client.send(Message.FISHING_CATCH_RESULT, receipt)
    } catch (error) {
      if (error instanceof DomainError) return this.sendFishingError(client, error.code, error.message, requestId)
      return this.sendFishingError(client, 'FISHING_FAILED', 'Không thể hoàn tất lượt câu cá.', requestId)
    }
  }

  private clearFishingAttempt(sessionId: string) {
    const attempt = this.fishingAttempts.get(sessionId)
    if (!attempt) return
    attempt.timers.forEach((timer) => clearTimeout(timer))
    this.fishingAttempts.delete(sessionId)
  }

  private sendFishingState(client: Client, payload: FishingCastState) {
    try { client.send(Message.FISHING_CAST_STATE, payload) } catch { /* client may have disconnected */ }
  }

  private sendFishingError(client: Client, code: string, message: string, requestId?: string) {
    try { client.send(Message.FISHING_CATCH_ERROR, { code, message, requestId }) } catch { /* client may have disconnected */ }
  }

  private sendMovementCorrection(client: Client, player?: Player) {
    try { client.send(Message.PLAYER_MOVEMENT_CORRECTION, { code: 'MOVEMENT_REJECTED', message: 'Vị trí nhân vật không hợp lệ.', x: player?.x, y: player?.y, anim: player?.anim, currentRoom: player?.currentRoom }) } catch { /* client may have left */ }
  }

  private markPlayerPresence(player: Player, sessionId: string) {
    return markOnline({ userId: player.userId, displayName: player.name, role: player.role, x: player.x, y: player.y, currentRoom: player.currentRoom, sessionId })
  }
}
