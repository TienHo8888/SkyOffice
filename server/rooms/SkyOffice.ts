import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Chess, Move } from 'chess.js'
import {
  Player,
  OfficeState,
  Computer,
  Whiteboard,
  TagGameParticipant,
  MiniGameParticipant,
  MiniGameItem,
  MiniGameCell,
  CasinoSeat,
  CasinoTableState,
} from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'
import { hashPassword, verifyPassword, verifySessionToken } from '../studio/auth'
import { markOffline, markOnline, updatePresence } from '../studio/presence'
import { studioEvents, StudioEventPayload } from '../studio/events'
import { DomainError, studioStore } from '../studio/store'
import { getRoomForPosition } from '../../types/StudioWorld'
import { StudioRole } from '../../types/Studio'
import { isCharacterConfig } from '../../types/Avatar'
import { MINI_GAME_CARD_RULES, MINI_GAME_MODES, MiniGameActionPayload, MiniGameEventPayload, MiniGameMode, SOCIAL_MVP_GAME_MODES } from '../../types/MiniGame'
import { SocialEmoteEvent, SocialEmotePayload, SocialGameId, SocialPartyActionPayload, SocialPartyError, SocialPartyInvite, SocialPartyMember, SocialPartyState } from '../../types/Social'
import { socialEconomy, socialGameRewards } from '../studio/config'
import { recordSocialMetric } from '../studio/metrics'
import { CASINO_GAME_MODES, CASINO_RULES, CasinoActionPayload, CasinoEventPayload, CasinoGameMode, CasinoPhase, PVP_TABLE_CATALOG, PvpTableSnapshot } from '../../types/Casino'
import {
  bauCuaProfit,
  createShoe,
  dealBaccarat,
  gameDisplayName,
  isCasinoMode,
  scoreBlackjack,
  shuffleCards,
  sicBoProfit,
} from '../studio/casino-rules'
import { TexasHoldemState } from '../../types/TexasHoldem'
import { COMBAT_WEAPONS, CombatActionPayload, CombatEventPayload, CombatWeapon } from '../../types/Combat'
import { TienLenActionPayload, TienLenGameState } from '../../types/TienLen'
import { RpsActionPayload, RpsChallengeState, RpsMove, RpsPrivateState } from '../../types/Rps'
import { GameChatChannel, GameChatClientPayload, GameChatMessage, GameChatServerPayload } from '../../types/GameChat'
import { WorkActionPayload, WorkCancelPayload, WorkCertificationResult, WorkJobId, WorkReward, WorkStartPayload, WorkSubmitPayload, WorkCareerId, WorkRankId } from '../../types/Work'
import {
  TEXAS_BOT_THINK_MAX_MS,
  TEXAS_BOT_THINK_MIN_MS,
  TEXAS_BUY_IN,
  TEXAS_HUMAN_TURN_MS,
  applyTexasAction,
  createTexasHoldemGame,
  createTexasHoldemGameFromPlayers,
  foldTexasPlayer,
  foldTexasHumanAndRunOut,
  publicTexasState,
  runTexasBots,
} from '../studio/texas-holdem'
import { TienLenRuleError, addTienLenPlayer, createTienLenGame, playTienLen, passTienLen, privateTienLenState, publicTienLenState, runTienLenBots, startTienLenGame } from '../studio/tien-len'
import { workEconomy, workJobDefinition, workJobDefinitions, workNextRank, workRankIndex, workRankDefinitions, workStationDefinitions } from '../studio/work-config'
import { createWorkChallenge, WorkChallengeInternal, WorkScoreResult, validateWorkAction } from '../studio/work-rules'
import { randomUUID } from 'crypto'

const TAG_GAME_COUNTDOWN_MS = 3_000
const TAG_GAME_DURATION_MS = 60_000
const TAG_GAME_RESULT_MS = 8_000
const TAG_GAME_TAG_DISTANCE = 34
const TAG_GAME_TAG_COOLDOWN_MS = 900
const TAG_GAME_ADMIN_ROLES: StudioRole[] = ['OWNER', 'ADMIN']
const MINI_GAME_COUNTDOWN_MS = 3_000
const MINI_GAME_DURATION_MS = 45_000
const MINI_GAME_RESULT_MS = 8_000
const MINI_GAME_ACTION_COOLDOWN_MS = 700
const MINI_GAME_TAG_DISTANCE = 42
const MINI_GAME_THROW_DISTANCE = 170
const MINI_GAME_PALETTE = ['RED', 'BLUE', 'GREEN', 'YELLOW']
const MVP_MINI_GAME_MODES = new Set<MiniGameMode>([...SOCIAL_MVP_GAME_MODES, 'BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'LUCKY_DRAW'])
const MINI_GAME_THROWABLES: Record<string, string> = {
  STONE: 'đá xốp',
  SLIPPER: 'dép tổ ong',
  WATER_GUN: 'súng nước',
  FOAM_BAT: 'búa xốp',
  PILLOW: 'gối bay',
}
const CASINO_BETTING_MS = 12_000
const CASINO_DEALING_MS = 2_200
const CASINO_PLAYER_TURN_MS = 12_000
const CASINO_SHAKING_MS = 3_200
const CASINO_REVEAL_MS = 2_400
const CASINO_RESULT_MS = 6_000
const TIEN_LEN_BOT_THINKING_MS = 1_350
const RPS_INTERACTION_DISTANCE = 96
const RPS_MIN_WAGER = 10
const RPS_MAX_WAGER = 500
const RPS_CHALLENGE_TTL_MS = 30_000
const RPS_RESULT_TTL_MS = 12_000
const TEXAS_MULTIPLAYER_START_DELAY_MS = 5_000
const TEXAS_MULTIPLAYER_NEXT_HAND_DELAY_MS = 5_000
const GAME_CHAT_HISTORY_LIMIT = 60
const GAME_CHAT_MESSAGE_MAX_LENGTH = 180
const GAME_CHAT_COOLDOWN_MS = 500
const GAME_CHAT_CHANNELS = new Set<GameChatChannel>([
  ...CASINO_GAME_MODES,
  ...MINI_GAME_MODES.map((mode) => mode.id),
  'TAG',
  'RPS',
])
const WORLD_BOUNDS = { minX: 0, maxX: 2048, minY: 0, maxY: 896 }
const MOVEMENT_TOLERANCE_PX = 72
const MOVEMENT_SPEED_PX_PER_SECOND = 260
const SOCIAL_EMOTE_COOLDOWN_MS = 650

interface ActiveWorkSession {
  client: Client
  sessionId: string
  clientSessionId: string
  userId: string
  studioId: string
  mode: 'JOB' | 'CERTIFICATION'
  jobId: WorkJobId
  careerId?: WorkCareerId
  targetRank?: WorkRankId
  stationId: string
  challenge: WorkChallengeInternal
  actions: Array<{ actionId: string; stepId: string; optionId: string; receivedAt: number }>
  actionIds: Set<string>
  startedAt: number
  endsAt: number
  timer: NodeJS.Timeout
}

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  private password: string | null = null
  private studioEventHandlers: Array<{ event: string; handler: (payload: StudioEventPayload) => void }> = []
  private tagGameStartTimer?: NodeJS.Timeout
  private tagGameEndTimer?: NodeJS.Timeout
  private tagGameResetTimer?: NodeJS.Timeout
  private lastTagAt = 0
  private tagGameBlockedSessionId = ''
  private miniGameStartTimer?: NodeJS.Timeout
  private miniGameEndTimer?: NodeJS.Timeout
  private miniGameResetTimer?: NodeJS.Timeout
  private miniGameTickTimer?: NodeJS.Timeout
  private miniGameLastActionAt = new Map<string, number>()
  private miniGameRolls = new Map<string, number>()
  private miniGameBets = new Map<string, number>()
  private casinoTimers = new Map<CasinoGameMode, NodeJS.Timeout>()
  private casinoDecks = new Map<CasinoGameMode, string[]>()
  private texasGames = new Map<string, TexasHoldemState>()
  private texasMultiplayerGames = new Map<string, TexasHoldemState>()
  private texasMultiplayerHostSessionIds = new Map<string, string>()
  private texasMultiplayerStartTimers = new Map<string, NodeJS.Timeout>()
  private texasMultiplayerStartAt = new Map<string, number>()
  private texasMultiplayerNextHandTimers = new Map<string, NodeJS.Timeout>()
  private texasMultiplayerNextHandAt = new Map<string, number>()
  private texasTurnTimers = new Map<string, NodeJS.Timeout>()
  private tienLenGames = new Map<string, TienLenGameState>()
  private tienLenLobbies = new Map<string, TienLenGameState>()
  private tienLenBotTimers = new Map<string, NodeJS.Timeout>()
  private tienLenActionIds = new Map<string, string[]>()
  private combatLastActionAt = new Map<string, number>()
  private combatActionIds = new Map<string, string[]>()
  private rpsChallenges = new Map<string, RpsChallengeState>()
  private rpsActionIds = new Map<string, string[]>()
  private rpsCleanupTimers = new Map<string, NodeJS.Timeout>()
  private gameChatMessages = new Map<GameChatChannel, GameChatMessage[]>()
  private gameChatLastSentAt = new Map<string, number>()
  private activeWorkSessions = new Map<string, ActiveWorkSession>()
  private lastAcceptedMovement = new Map<string, { x: number; y: number; acceptedAt: number }>()
  private socialEmoteLastAt = new Map<string, number>()
  private parties = new Map<string, SocialPartyState>()
  private partyByUserId = new Map<string, string>()
  private partyInvites = new Map<string, { invite: SocialPartyInvite; targetUserId: string }>()
  private partyActionIds = new Map<string, string[]>()
  private activeMiniGamePartyId = ''
  private roomDataTimers = new Map<string, NodeJS.Timeout>()

  async onCreate(options: IRoomData) {
    const { name, description, password, autoDispose } = options
    this.name = name
    this.description = description
    this.autoDispose = autoDispose

    let hasPassword = false
    if (password) {
      this.password = hashPassword(password)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.setState(new OfficeState())
    this.initializeCasinoTables()

    for (const eventName of ['TASK_COMPLETED', 'BOSS_DAMAGED', 'BOSS_DEFEATED', 'STUDIO_XP_CHANGED', 'STUDIO_LEVEL_UP']) {
      const handler = (payload: StudioEventPayload) => {
        this.broadcast(Message.STUDIO_EVENT, payload)
      }
      studioEvents.on(eventName, handler)
      this.studioEventHandlers.push({ event: eventName, handler })
    }

    // HARD-CODED: Add 5 computers in a room
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    // HARD-CODED: Add 3 whiteboards in a room
    for (let i = 0; i < 3; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    // when a player connect to a computer, add to the computer connectedUser array
    this.onMessage(Message.CONNECT_TO_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerAddUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player disconnect from a computer, remove from the computer connectedUser array
    this.onMessage(Message.DISCONNECT_FROM_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerRemoveUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player stop sharing screen
    this.onMessage(Message.STOP_SCREEN_SHARE, (client, message: { computerId: string }) => {
      const computer = this.state.computers.get(message.computerId)
      computer.connectedUser.forEach((id) => {
        this.clients.forEach((cli) => {
          if (cli.sessionId === id && cli.sessionId !== client.sessionId) {
            cli.send(Message.STOP_SCREEN_SHARE, client.sessionId)
          }
        })
      })
    })

    // when a player connect to a whiteboard, add to the whiteboard connectedUser array
    this.onMessage(Message.CONNECT_TO_WHITEBOARD, (client, message: { whiteboardId: string }) => {
      this.dispatcher.dispatch(new WhiteboardAddUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    // when a player disconnect from a whiteboard, remove from the whiteboard connectedUser array
    this.onMessage(
      Message.DISCONNECT_FROM_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), {
          client,
          whiteboardId: message.whiteboardId,
        })
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateCommand
    this.onMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        if (!this.acceptPlayerMovement(client, message)) return
        this.dispatcher.dispatch(new PlayerUpdateCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
        const player = this.state.players.get(client.sessionId)
        if (player) {
          const nextRoom = getRoomForPosition(player.x, player.y).id
          const roomChanged = player.currentRoom !== nextRoom
          player.currentRoom = nextRoom
          const livePresence = this.markPlayerPresence(player, client.sessionId)
          if (roomChanged) {
            this.broadcast(Message.PLAYER_ROOM_CHANGED, { sessionId: client.sessionId, userId: livePresence.userId, displayName: livePresence.displayName, currentRoom: nextRoom })
          }
          this.checkTagGameCollision()
          this.checkMiniGameMovement(client.sessionId)
        }
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
      const player = this.state.players.get(client.sessionId)
      if (player) this.markPlayerPresence(player, client.sessionId)
    })

    this.onMessage(Message.UPDATE_PLAYER_CHARACTER_CONFIG, (client, message: { characterConfig?: unknown; revision?: number }) => {
      const player = this.state.players.get(client.sessionId)
      if (!player || !isCharacterConfig(message?.characterConfig)) return
      // The profile endpoint is the source of persistence. This message only
      // refreshes the live schema so every connected player sees the new layers.
      player.characterConfigJson = JSON.stringify(message.characterConfig)
      if (Number.isFinite(message.revision) && Number(message.revision) >= player.avatarRevision) player.avatarRevision = Math.floor(Number(message.revision))
    })

    this.onMessage(Message.UPDATE_PLAYER_NAMEPLATE, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      const user = studioStore.getUserById(player.userId)
      if (!user) return
      const loadout = studioStore.getSocialLoadout(user.studioId, user.id)
      player.nameplateId = loadout.nameplateId || 'nameplate-basic'
      player.titleId = loadout.titleId || ''
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.videoConnected = true
    })

    // when a player disconnect a stream, broadcast the signal to the other player connected to the stream
    this.onMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => {
      this.clients.forEach((cli) => {
        if (cli.sessionId === message.clientId) {
          cli.send(Message.DISCONNECT_STREAM, client.sessionId)
        }
      })
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    this.onMessage(Message.GAME_CHAT, (client, payload: GameChatClientPayload) => {
      const channel = payload?.channel
      if (!channel || !GAME_CHAT_CHANNELS.has(channel)) return
      if (payload.action === 'LOAD') {
        const response: GameChatServerPayload = { action: 'HISTORY', channel, messages: [...(this.gameChatMessages.get(channel) || [])] }
        client.send(Message.GAME_CHAT, response)
        return
      }
      if (payload.action !== 'SEND') return
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      const now = Date.now()
      const cooldownKey = `${client.sessionId}:${channel}`
      if (now - (this.gameChatLastSentAt.get(cooldownKey) || 0) < GAME_CHAT_COOLDOWN_MS) {
        const response: GameChatServerPayload = { action: 'ERROR', channel, message: 'Bạn đang gửi tin nhắn quá nhanh.' }
        client.send(Message.GAME_CHAT, response)
        return
      }
      const content = String(payload.content || '').replace(/\s+/g, ' ').trim().slice(0, GAME_CHAT_MESSAGE_MAX_LENGTH)
      if (!content) return
      this.gameChatLastSentAt.set(cooldownKey, now)
      const message: GameChatMessage = {
        id: `${channel}:${now}:${client.sessionId}`,
        channel,
        sessionId: client.sessionId,
        author: player.name || 'Player',
        content,
        createdAt: now,
      }
      const history = this.gameChatMessages.get(channel) || []
      history.push(message)
      if (history.length > GAME_CHAT_HISTORY_LIMIT) history.splice(0, history.length - GAME_CHAT_HISTORY_LIMIT)
      this.gameChatMessages.set(channel, history)
      const response: GameChatServerPayload = { action: 'MESSAGE', channel, message }
      this.broadcast(Message.GAME_CHAT, response)
    })

    this.onMessage(Message.START_TAG_GAME, (client) => {
      this.startTagGame(client)
    })

    this.onMessage(Message.START_MINI_GAME, (client, message: { mode: MiniGameMode; partyId?: string }) => {
      this.startMiniGame(client, message?.mode, message?.partyId)
    })

    this.onMessage(Message.SOCIAL_EMOTE, (client, message: SocialEmotePayload) => {
      this.handleSocialEmote(client, message || ({} as SocialEmotePayload))
    })

    this.onMessage(Message.PARTY_ACTION, (client, message: SocialPartyActionPayload) => {
      this.handlePartyAction(client, message || ({} as SocialPartyActionPayload))
    })

    this.onMessage(Message.MINI_GAME_ACTION, (client, message: MiniGameActionPayload) => {
      this.handleMiniGameAction(client, message || {})
    })

    this.onMessage(Message.MINI_GAME_CHEER, (client) => {
      this.handleMiniGameCheer(client)
    })

    this.onMessage(Message.CASINO_ACTION, (client, message: CasinoActionPayload) => {
      this.handleCasinoAction(client, message || {})
    })

    this.onMessage(Message.COMBAT_ACTION, (client, message: CombatActionPayload) => {
      this.handleCombatAction(client, message || {})
    })

    this.onMessage(Message.TIEN_LEN_ACTION, (client, message: TienLenActionPayload) => {
      this.handleTienLenAction(client, message || {})
    })

    this.onMessage(Message.RPS_ACTION, (client, message: RpsActionPayload) => {
      this.handleRpsAction(client, message || {})
    })

    this.onMessage(Message.WORK_START, (client, message: WorkStartPayload) => {
      this.startWorkSession(client, message || { actionId: '' })
    })

    this.onMessage(Message.WORK_ACTION, (client, message: WorkActionPayload) => {
      this.handleWorkAction(client, message || ({} as WorkActionPayload))
    })

    this.onMessage(Message.WORK_SUBMIT, (client, message: WorkSubmitPayload) => {
      this.finishWorkSession(client, message?.sessionId, false)
    })

    this.onMessage(Message.WORK_CANCEL, (client, message: WorkCancelPayload) => {
      this.finishWorkSession(client, message?.sessionId, true)
    })
  }

  async onAuth(client: Client, options: { password: string | null; token?: string }) {
    if (this.password) {
      const validPassword = verifyPassword(options.password || '', this.password)
      if (!validPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    const session = typeof options?.token === 'string' ? verifySessionToken(options.token) : null
    const user = session ? studioStore.getUserById(session.userId) : undefined
    if (!session || !user || user.studioId !== session.studioId) throw new ServerError(401, 'A valid studio session is required.')
    return true
  }

  onJoin(client: Client, options: any) {
    const session = typeof options?.token === 'string' ? verifySessionToken(options.token) : null
    const user = session ? studioStore.getUserById(session.userId) : undefined
    if (!session || !user || user.studioId !== session.studioId) throw new ServerError(401, 'A valid studio session is required.')
    const player = new Player()
    player.userId = user.id
    player.name = user.displayName
    player.role = user.role as StudioRole
    player.anim = `${user.avatarKey || 'adam'}_idle_down`
    const loadout = studioStore.getSocialLoadout(user.studioId, user.id)
    player.nameplateId = loadout.nameplateId || 'nameplate-basic'
    player.titleId = loadout.titleId || ''
    player.characterConfigJson = user.characterConfig ? JSON.stringify(user.characterConfig) : ''
    player.currentRoom = getRoomForPosition(player.x, player.y).id
    this.state.players.set(client.sessionId, player)
    player.avatarRevision = Math.max(1, user.avatarRevision || 1)
    this.markPlayerPresence(player, client.sessionId)
    const now = Date.now()
    this.partyInvites.forEach((record, inviteId) => {
      if (new Date(record.invite.expiresAt).getTime() <= now || !this.parties.has(record.invite.partyId)) {
        this.partyInvites.delete(inviteId)
        return
      }
      if (record.targetUserId === user.id) client.send(Message.PARTY_INVITE, record.invite)
    })
    const existingParty = this.partyForUser(user.id)
    if (existingParty) {
      // A second tab/reconnect keeps the membership owned by the user, but
      // still needs a direct snapshot because broadcastParty() resolves one
      // client per user. Without this, the new tab would render an empty
      // party until another party action happens.
      this.refreshPartyMembers(existingParty)
      client.send(Message.PARTY_STATE, existingParty)
    }
    // The client can only register room-message handlers after joinOrCreate()
    // resolves. Deferring this non-state payload by one event-loop tick keeps
    // the room metadata from racing that setup and avoids dropping it on a
    // cold join.
    const roomDataTimer = setTimeout(() => {
      this.roomDataTimers.delete(client.sessionId)
      if (!this.state.players.has(client.sessionId)) return
      try {
        client.send(Message.SEND_ROOM_DATA, {
          id: this.roomId,
          name: this.name,
          description: this.description,
        })
      } catch { /* client may have left before the deferred payload */ }
    }, 0)
    this.roomDataTimers.set(client.sessionId, roomDataTimer)
  }

  onLeave(client: Client, consented: boolean) {
    const roomDataTimer = this.roomDataTimers.get(client.sessionId)
    if (roomDataTimer) {
      clearTimeout(roomDataTimer)
      this.roomDataTimers.delete(client.sessionId)
    }
    const player = this.state.players.get(client.sessionId)
    if (player) markOffline(player.userId, client.sessionId)
    const attendee = this.state.tagGame.attendees.get(client.sessionId)
    if (attendee) {
      attendee.connected = false
      if (this.state.tagGame.taggerSessionId === client.sessionId) {
        this.assignNextTaggerOrFinish()
      } else if (this.activeTagGameAttendeeCount() < 2) {
        this.finishTagGame()
      }
    }
    // Remove the attendee before updating party membership. If the player
    // leaves a party-owned activity, the activity must either reassign/keep
    // running with the remaining members or settle immediately when it drops
    // below its minimum player count.
    this.handleMiniGameLeave(client.sessionId)
    if (player) this.handlePartyLeave(player.userId, client.sessionId)
    this.handleTienLenLeave(client.sessionId)
    this.handleRpsLeave(client.sessionId)
    this.handleCasinoLeave(client.sessionId)
    this.handleWorkLeave(client.sessionId)
    this.lastAcceptedMovement.delete(client.sessionId)
    this.socialEmoteLastAt.delete(client.sessionId)
    this.partyActionIds.delete(client.sessionId)
    this.combatActionIds.delete(client.sessionId)
    COMBAT_WEAPONS.forEach((weapon) => this.combatLastActionAt.delete(`${client.sessionId}:${weapon.id}`))
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
    this.state.computers.forEach((computer) => {
      if (computer.connectedUser.has(client.sessionId)) {
        computer.connectedUser.delete(client.sessionId)
      }
    })
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboard.connectedUser.has(client.sessionId)) {
        whiteboard.connectedUser.delete(client.sessionId)
      }
    })
  }

  private handleCasinoLeave(sessionId: string) {
    const pokerTable = this.state.casinoTables.get('POKER')
    const pokerSeat = pokerTable?.seats.get(sessionId)
    if (pokerTable && pokerSeat) {
      if (pokerSeat.pokerMode === 'MULTIPLAYER' || pokerSeat.pokerMode === 'MULTIPLAYER_WAITING') this.cashOutTexasMultiplayer(sessionId, pokerTable, true)
      else this.cashOutCasinoTexas(sessionId, pokerTable, true)
    }
    const chessTable = this.state.casinoTables.get('CHESS')
    const seat = chessTable?.seats.get(sessionId)
    if (!chessTable || !seat) return
    if (['PLAYING', 'CHECK'].includes(seat.status)) {
      const user = studioStore.getUserById(seat.userId)
      seat.status = 'LOSS'
      seat.result = 'Rời bàn · xử thua ván đang chơi'
      seat.payout = 0
      seat.net = -seat.stake
      seat.turn = 'RESULT'
      if (user) studioStore.settleCasinoPayout(user.studioId, user.id, 'CHESS', seat.matchId, 'abandoned', 0, { result: seat.result, moves: seat.moveCount, stake: seat.stake })
      this.appendCasinoHistory(chessTable, 'L')
      this.emitCasinoEvent('PLAYER_LOSS', 'CHESS', `${seat.displayName}: rời bàn, xử thua ván đang chơi.`, sessionId, 'DEALER WIN', undefined, 0)
    }
    chessTable.seats.delete(sessionId)
    this.recalculateCasinoChessStats(chessTable)
  }

  private handleCombatAction(client: Client, message: CombatActionPayload) {
    const weapon = message.weapon
    const definition = COMBAT_WEAPONS.find((candidate) => candidate.id === weapon)
    const attacker = this.state.players.get(client.sessionId)
    if (!definition || !attacker) {
      client.send(Message.COMBAT_ERROR, { message: 'Vật phẩm không hợp lệ.' })
      return
    }
    const actionId = typeof message.actionId === 'string' && /^[a-zA-Z0-9:_-]{8,120}$/.test(message.actionId) ? message.actionId : `${client.sessionId}:${Date.now()}`
    const processed = this.combatActionIds.get(client.sessionId) || []
    if (processed.includes(actionId)) return
    const now = Date.now()
    const cooldownKey = `${client.sessionId}:${weapon}`
    if (now - (this.combatLastActionAt.get(cooldownKey) || 0) < definition.cooldownMs) return
    const rawX = Number(message.directionX)
    const rawY = Number(message.directionY)
    const magnitude = Math.hypot(rawX, rawY)
    if (!Number.isFinite(magnitude) || magnitude < 0.5) {
      client.send(Message.COMBAT_ERROR, { message: 'Không xác định được hướng sử dụng vật phẩm.' })
      return
    }
    const directionX = rawX / magnitude
    const directionY = rawY / magnitude
    const hitWidth = weapon === 'BAT' ? 45 : weapon === 'WATER_GUN' ? 23 : 29
    let target: { sessionId: string; player: Player; projection: number } | undefined
    this.state.players.forEach((candidate, sessionId) => {
      if (sessionId === client.sessionId || !candidate.online || candidate.currentRoom !== attacker.currentRoom) return
      const deltaX = candidate.x - attacker.x
      const deltaY = candidate.y - attacker.y
      const projection = deltaX * directionX + deltaY * directionY
      if (projection <= 0 || projection > definition.range) return
      const perpendicular = Math.abs(deltaX * directionY - deltaY * directionX)
      if (perpendicular > hitWidth) return
      if (!target || projection < target.projection) target = { sessionId, player: candidate, projection }
    })
    this.combatLastActionAt.set(cooldownKey, now)
    processed.push(actionId)
    this.combatActionIds.set(client.sessionId, processed.slice(-60))
    const targetX = target?.player.x ?? attacker.x + directionX * definition.range
    const targetY = target?.player.y ?? attacker.y + directionY * definition.range
    const verbs: Record<CombatWeapon, string> = {
      WATER_GUN: 'bắn súng nước',
      BAT: 'vung gậy xốp',
      STONE: 'ném đá xốp',
      SLIPPER: 'ném dép tổ ong',
    }
    const messageText = target
      ? `${attacker.name} ${verbs[weapon!]} trúng ${target.player.name}!`
      : `${attacker.name} ${verbs[weapon!]} nhưng trượt.`
    const payload: CombatEventPayload = {
      eventId: `combat-${now}-${client.sessionId}`,
      attackerSessionId: client.sessionId,
      targetSessionId: target?.sessionId,
      weapon: weapon!,
      originX: attacker.x,
      originY: attacker.y - 8,
      targetX,
      targetY: targetY - 8,
      directionX,
      directionY,
      hit: Boolean(target),
      message: messageText,
      createdAt: now,
    }
    this.broadcast(Message.COMBAT_EVENT, payload)
  }

  private handleRpsAction(client: Client, message: RpsActionPayload) {
    const actionId = typeof message.actionId === 'string' && /^[a-zA-Z0-9:_-]{8,120}$/.test(message.actionId) ? message.actionId : ''
    if (actionId && this.isDuplicateRpsAction(client.sessionId, actionId)) return

    const player = this.state.players.get(client.sessionId)
    if (!player) {
      this.sendRpsError(client, 'Không tìm thấy nhân vật trong thế giới.')
      return
    }

    try {
      if (message.action === 'CREATE') {
        const targetSessionId = message.targetSessionId || ''
        const target = this.state.players.get(targetSessionId)
        const user = studioStore.getUserById(player.userId)
        const targetUser = target ? studioStore.getUserById(target.userId) : undefined
        if (!target || targetSessionId === client.sessionId || !targetUser || !user || target.userId === player.userId) {
          this.sendRpsError(client, 'Người chơi này không thể nhận lời thách đấu.')
          return
        }
        if (!this.isRpsPlayerNear(player, target)) {
          this.sendRpsError(client, 'Hãy đứng gần người chơi cần thách đấu.')
          return
        }
        if (user.studioId !== targetUser.studioId) {
          this.sendRpsError(client, 'Chỉ có thể thách đấu người chơi trong cùng studio.')
          return
        }
        if (this.findActiveRpsChallenge(client.sessionId) || this.findActiveRpsChallenge(targetSessionId)) {
          this.sendRpsError(client, 'Một trong hai người đang có challenge Oản Tù Xì khác.')
          return
        }
        const wager = Number(message.wager)
        if (!Number.isInteger(wager) || wager < RPS_MIN_WAGER || wager > RPS_MAX_WAGER) {
          this.sendRpsError(client, `Mức cược phải từ ${RPS_MIN_WAGER} đến ${RPS_MAX_WAGER} Coin.`)
          return
        }
        if (this.rpsPlayerBalance(player) < wager) {
          this.sendRpsError(client, 'Bạn không đủ Coin cho mức cược này.')
          return
        }
        const challenge: RpsChallengeState = {
          id: `rps-${Date.now()}-${client.sessionId}`,
          status: 'PENDING',
          challengerSessionId: client.sessionId,
          challengerName: player.name,
          challengedSessionId: targetSessionId,
          challengedName: target.name,
          wager,
          challengerReady: false,
          challengedReady: false,
          createdAt: Date.now(),
        }
        this.rpsChallenges.set(challenge.id, challenge)
        this.syncRpsChallenge(challenge)
        this.scheduleRpsCleanup(challenge.id, RPS_CHALLENGE_TTL_MS)
        return
      }

      const challenge = message.challengeId ? this.rpsChallenges.get(message.challengeId) : undefined
      if (!challenge) {
        this.sendRpsError(client, 'Challenge Oản Tù Xì không còn tồn tại.')
        return
      }
      if (client.sessionId !== challenge.challengerSessionId && client.sessionId !== challenge.challengedSessionId) {
        this.sendRpsError(client, 'Bạn không thuộc challenge này.')
        return
      }

      if (message.action === 'ACCEPT') {
        const challenger = this.state.players.get(challenge.challengerSessionId)
        const challenged = this.state.players.get(challenge.challengedSessionId)
        if (client.sessionId !== challenge.challengedSessionId || challenge.status !== 'PENDING') {
          this.sendRpsError(client, 'Challenge này không còn chờ đồng ý.')
          return
        }
        if (!challenger || !challenged || !this.isRpsPlayerNear(challenger, challenged)) {
          this.cancelRpsChallenge(challenge, 'Hai người cần đứng gần nhau để bắt đầu.')
          return
        }
        if (this.rpsPlayerBalance(challenger) < challenge.wager || this.rpsPlayerBalance(challenged) < challenge.wager) {
          this.cancelRpsChallenge(challenge, 'Một trong hai người không đủ Coin để vào trận.')
          return
        }
        const challengerUser = studioStore.getUserById(challenger.userId)
        const challengedUser = studioStore.getUserById(challenged.userId)
        if (!challengerUser || !challengedUser || challengerUser.studioId !== challengedUser.studioId) {
          this.cancelRpsChallenge(challenge, 'Hai người không còn cùng studio.')
          return
        }
        studioStore.placeCasinoWager(challengerUser.studioId, challengerUser.id, 'RPS', challenge.id, 'challenger', challenge.wager, { variant: 'ROCK_PAPER_SCISSORS', opponent: challenged.name })
        studioStore.placeCasinoWager(challengedUser.studioId, challengedUser.id, 'RPS', challenge.id, 'challenged', challenge.wager, { variant: 'ROCK_PAPER_SCISSORS', opponent: challenger.name })
        challenge.status = 'READY'
        challenge.resultText = 'Cả hai đã vào trận · chọn Búa, Kéo hoặc Bao.'
        this.syncRpsChallenge(challenge)
        this.scheduleRpsCleanup(challenge.id, RPS_CHALLENGE_TTL_MS)
        return
      }

      if (message.action === 'DECLINE') {
        if (client.sessionId !== challenge.challengedSessionId || challenge.status !== 'PENDING') {
          this.sendRpsError(client, 'Lời mời này không còn chờ từ chối.')
          return
        }
        challenge.status = 'DECLINED'
        challenge.resultText = `${challenge.challengedName} đã từ chối lời thách đấu.`
        this.syncRpsChallenge(challenge)
        this.scheduleRpsCleanup(challenge.id, RPS_RESULT_TTL_MS)
        return
      }

      if (message.action === 'SELECT_MOVE') {
        if (challenge.status !== 'READY' || !this.isRpsMove(message.move)) {
          this.sendRpsError(client, 'Hãy chọn một nước đi hợp lệ trong trận.')
          return
        }
        if (client.sessionId === challenge.challengerSessionId) {
          challenge.challengerMove = message.move
          challenge.challengerReady = false
        } else {
          challenge.challengedMove = message.move
          challenge.challengedReady = false
        }
        this.syncRpsChallenge(challenge)
        return
      }

      if (message.action === 'READY') {
        if (challenge.status !== 'READY') {
          this.sendRpsError(client, 'Trận chưa vào lượt chọn.')
          return
        }
        if (client.sessionId === challenge.challengerSessionId) {
          if (!challenge.challengerMove) {
            this.sendRpsError(client, 'Chọn Búa, Kéo hoặc Bao trước khi Ready.')
            return
          }
          challenge.challengerReady = true
        } else {
          if (!challenge.challengedMove) {
            this.sendRpsError(client, 'Chọn Búa, Kéo hoặc Bao trước khi Ready.')
            return
          }
          challenge.challengedReady = true
        }
        if (challenge.challengerReady && challenge.challengedReady) this.resolveRpsChallenge(challenge)
        else this.syncRpsChallenge(challenge)
        return
      }

      if (message.action === 'CANCEL') {
        if (challenge.status === 'PENDING' || challenge.status === 'READY') {
          const cancelerName = client.sessionId === challenge.challengerSessionId ? challenge.challengerName : challenge.challengedName
          this.cancelRpsChallenge(challenge, `${cancelerName} đã hủy challenge.`)
        }
        return
      }

      this.sendRpsError(client, 'Action Oản Tù Xì không hợp lệ.')
    } catch (error) {
      this.sendRpsError(client, error instanceof DomainError ? error.message : 'Không thể xử lý challenge Oản Tù Xì.')
    }
  }

  private isDuplicateRpsAction(sessionId: string, actionId: string) {
    const actions = this.rpsActionIds.get(sessionId) || []
    if (actions.includes(actionId)) return true
    actions.push(actionId)
    this.rpsActionIds.set(sessionId, actions.slice(-40))
    return false
  }

  private isRpsMove(move?: string): move is RpsMove {
    return move === 'ROCK' || move === 'PAPER' || move === 'SCISSORS'
  }

  private isRpsPlayerNear(source: Player, target: Player) {
    return source.online && target.online && source.currentRoom === target.currentRoom && Math.hypot(target.x - source.x, target.y - source.y) <= RPS_INTERACTION_DISTANCE
  }

  private rpsPlayerBalance(player: Player) {
    const user = studioStore.getUserById(player.userId)
    if (!user) return 0
    return studioStore.getSocialSnapshot(user.studioId, user.id).progression.coinBalance
  }

  private findActiveRpsChallenge(sessionId: string) {
    return [...this.rpsChallenges.values()].find((challenge) => (challenge.status === 'PENDING' || challenge.status === 'READY') && (challenge.challengerSessionId === sessionId || challenge.challengedSessionId === sessionId))
  }

  private syncRpsChallenge(challenge: RpsChallengeState) {
    const recipients: Array<{ sessionId: string; role: 'CHALLENGER' | 'CHALLENGED' }> = [
      { sessionId: challenge.challengerSessionId, role: 'CHALLENGER' },
      { sessionId: challenge.challengedSessionId, role: 'CHALLENGED' },
    ]
    recipients.forEach(({ sessionId, role }) => {
      const client = this.clients.find((candidate) => candidate.sessionId === sessionId)
      if (client) client.send(Message.RPS_STATE, this.privateRpsState(challenge, sessionId, role))
    })
  }

  private privateRpsState(challenge: RpsChallengeState, sessionId: string, role: 'CHALLENGER' | 'CHALLENGED'): RpsPrivateState {
    const isChallenger = role === 'CHALLENGER'
    const resolved = challenge.status === 'RESOLVED'
    return {
      challengeId: challenge.id,
      status: challenge.status,
      role,
      opponentSessionId: isChallenger ? challenge.challengedSessionId : challenge.challengerSessionId,
      opponentName: isChallenger ? challenge.challengedName : challenge.challengerName,
      wager: challenge.wager,
      myMove: isChallenger ? challenge.challengerMove : challenge.challengedMove,
      opponentMove: resolved ? (isChallenger ? challenge.challengedMove : challenge.challengerMove) : undefined,
      myReady: isChallenger ? challenge.challengerReady : challenge.challengedReady,
      opponentReady: isChallenger ? challenge.challengedReady : challenge.challengerReady,
      winnerSessionId: challenge.winnerSessionId,
      resultText: challenge.resultText,
      createdAt: challenge.createdAt,
    }
  }

  private resolveRpsChallenge(challenge: RpsChallengeState) {
    if (challenge.status !== 'READY' || !challenge.challengerMove || !challenge.challengedMove) return
    const challengerWins = challenge.challengerMove === 'ROCK' && challenge.challengedMove === 'SCISSORS'
      || challenge.challengerMove === 'PAPER' && challenge.challengedMove === 'ROCK'
      || challenge.challengerMove === 'SCISSORS' && challenge.challengedMove === 'PAPER'
    const tied = challenge.challengerMove === challenge.challengedMove
    const winnerSessionId = tied ? undefined : challengerWins ? challenge.challengerSessionId : challenge.challengedSessionId
    const winnerName = tied ? '' : challengerWins ? challenge.challengerName : challenge.challengedName
    const challenger = this.state.players.get(challenge.challengerSessionId)
    const challenged = this.state.players.get(challenge.challengedSessionId)
    const challengerUser = challenger ? studioStore.getUserById(challenger.userId) : undefined
    const challengedUser = challenged ? studioStore.getUserById(challenged.userId) : undefined
    if (!challengerUser || !challengedUser || challengerUser.studioId !== challengedUser.studioId) {
      this.cancelRpsChallenge(challenge, 'Không thể kết toán Coin cho trận này.')
      return
    }
    const challengerPayout = tied ? challenge.wager : winnerSessionId === challenge.challengerSessionId ? challenge.wager * 2 : 0
    const challengedPayout = tied ? challenge.wager : winnerSessionId === challenge.challengedSessionId ? challenge.wager * 2 : 0
    const metadata = { variant: 'ROCK_PAPER_SCISSORS' as const, opponent: challenge.challengedName, result: tied ? 'TIE' : winnerSessionId === challenge.challengerSessionId ? 'WIN' : 'LOSS' }
    const challengerReward = studioStore.settleCasinoPayout(challengerUser.studioId, challengerUser.id, 'RPS', challenge.id, 'challenger', challengerPayout, metadata)
    const challengedReward = studioStore.settleCasinoPayout(challengedUser.studioId, challengedUser.id, 'RPS', challenge.id, 'challenged', challengedPayout, { ...metadata, opponent: challenge.challengerName, result: tied ? 'TIE' : winnerSessionId === challenge.challengedSessionId ? 'WIN' : 'LOSS' })
    this.sendSocialReward(challenge.challengerSessionId, challengerReward)
    this.sendSocialReward(challenge.challengedSessionId, challengedReward)
    challenge.status = 'RESOLVED'
    challenge.winnerSessionId = winnerSessionId
    challenge.resultText = tied
      ? `Hòa ván · mỗi người nhận lại ${challenge.wager} Coin.`
      : `${winnerName} thắng · nhận ${challenge.wager * 2} Coin.`
    this.syncRpsChallenge(challenge)
    this.scheduleRpsCleanup(challenge.id, RPS_RESULT_TTL_MS)
  }

  private cancelRpsChallenge(challenge: RpsChallengeState, resultText: string) {
    challenge.status = 'CANCELLED'
    challenge.resultText = resultText
    this.syncRpsChallenge(challenge)
    this.scheduleRpsCleanup(challenge.id, RPS_RESULT_TTL_MS)
  }

  private scheduleRpsCleanup(challengeId: string, delay: number) {
    const existing = this.rpsCleanupTimers.get(challengeId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.rpsCleanupTimers.delete(challengeId)
      const challenge = this.rpsChallenges.get(challengeId)
      if (!challenge) return
      if (challenge.status === 'PENDING' || challenge.status === 'READY') {
        challenge.status = 'CANCELLED'
        challenge.resultText = 'Challenge đã hết thời gian chờ.'
        this.syncRpsChallenge(challenge)
        this.scheduleRpsCleanup(challengeId, RPS_RESULT_TTL_MS)
        return
      }
      this.rpsChallenges.delete(challengeId)
    }, delay)
    this.rpsCleanupTimers.set(challengeId, timer)
  }

  private handleRpsLeave(sessionId: string) {
    this.rpsChallenges.forEach((challenge) => {
      if (challenge.challengerSessionId !== sessionId && challenge.challengedSessionId !== sessionId) return
      if (challenge.status === 'PENDING' || challenge.status === 'READY') {
        const playerName = challenge.challengerSessionId === sessionId ? challenge.challengerName : challenge.challengedName
        this.cancelRpsChallenge(challenge, `${playerName} đã rời thế giới.`)
      } else {
        this.scheduleRpsCleanup(challenge.id, 1)
      }
    })
  }

  private sendRpsError(client: Client, message: string) {
    client.send(Message.RPS_ERROR, { message })
  }

  private sendWorkError(client: Client, code: string, message: string) {
    try { client.send(Message.WORK_ERROR, { code, message }) } catch { /* client may have disconnected during settlement */ }
  }

  private sendMovementCorrection(client: Client, code: string, message: string, player?: Player) {
    try {
      client.send(Message.PLAYER_MOVEMENT_CORRECTION, {
        code,
        message,
        x: player?.x,
        y: player?.y,
        anim: player?.anim,
        currentRoom: player?.currentRoom,
      })
    } catch { /* client may have disconnected before the correction arrived */ }
  }

  private acceptPlayerMovement(client: Client, message: { x: number; y: number; anim: string }) {
    const player = this.state.players.get(client.sessionId)
    const x = Number(message?.x)
    const y = Number(message?.y)
    if (!player || !Number.isFinite(x) || !Number.isFinite(y) || x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || y < WORLD_BOUNDS.minY || y > WORLD_BOUNDS.maxY) {
      this.sendMovementCorrection(client, 'MOVEMENT_REJECTED', 'Vị trí nhân vật không hợp lệ.', player)
      return false
    }

    const now = Date.now()
    const previous = this.lastAcceptedMovement.get(client.sessionId) || { x: player.x, y: player.y, acceptedAt: now }
    const elapsedSeconds = Math.max(0.075, (now - previous.acceptedAt) / 1000)
    const maxDistance = Math.min(280, MOVEMENT_TOLERANCE_PX + MOVEMENT_SPEED_PX_PER_SECOND * elapsedSeconds)
    if (Math.hypot(x - previous.x, y - previous.y) > maxDistance) {
      this.sendMovementCorrection(client, 'MOVEMENT_REJECTED', 'Chuyển động vượt quá giới hạn; vị trí đã được đồng bộ lại.', player)
      return false
    }
    this.lastAcceptedMovement.set(client.sessionId, { x, y, acceptedAt: now })
    return true
  }

  private handleSocialEmote(client: Client, message: SocialEmotePayload) {
    const player = this.state.players.get(client.sessionId)
    const actionId = String(message?.actionId || '')
    const emoteId = String(message?.emoteId || '').toUpperCase()
    const allowedEmotes = new Set(['WAVE', 'HEART', 'CLAP', 'COFFEE', 'GG', 'THINK'])
    if (!player || !/^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) || !allowedEmotes.has(emoteId)) return
    const now = Date.now()
    if (now - (this.socialEmoteLastAt.get(client.sessionId) || 0) < SOCIAL_EMOTE_COOLDOWN_MS) return
    this.socialEmoteLastAt.set(client.sessionId, now)
    const payload: SocialEmoteEvent = { actionId, emoteId, userId: player.userId, sessionId: client.sessionId, displayName: player.name }
    this.broadcast(Message.SOCIAL_EMOTE, payload)
  }

  private partyForUser(userId: string) {
    const partyId = this.partyByUserId.get(userId)
    if (!partyId) return undefined
    const party = this.parties.get(partyId)
    if (!party) this.partyByUserId.delete(userId)
    return party
  }

  private markPlayerPresence(player: Player, sessionId: string) {
    const party = this.partyForUser(player.userId)
    return markOnline({
      userId: player.userId,
      displayName: player.name,
      role: player.role,
      x: player.x,
      y: player.y,
      currentRoom: player.currentRoom,
      sessionId,
      status: party?.status === 'IN_ACTIVITY' ? 'IN_ACTIVITY' : 'ONLINE',
      activity: party?.activity?.type,
      partyId: party?.partyId,
    })
  }

  private clientForUser(userId: string) {
    let found: Client | undefined
    this.state.players.forEach((player, sessionId) => {
      if (found || player.userId !== userId) return
      this.clients.forEach((client) => { if (!found && client.sessionId === sessionId) found = client })
    })
    return found
  }

  private playerForUser(userId: string) {
    let found: Player | undefined
    this.state.players.forEach((player) => { if (!found && player.userId === userId) found = player })
    return found
  }

  private partyMember(userId: string, party: SocialPartyState) {
    return party.members.find((member) => member.userId === userId)
  }

  private createPartyMember(userId: string, status: SocialPartyMember['status'], joinedAt = new Date().toISOString()): SocialPartyMember | undefined {
    const user = studioStore.getUserById(userId)
    if (!user) return undefined
    return { userId, displayName: user.displayName, avatar: studioStore.getAvatarSnapshot(user.studioId, userId), status, joinedAt }
  }

  private refreshPartyMembers(party: SocialPartyState) {
    party.members = party.members.map((member) => {
      const user = studioStore.getUserById(member.userId)
      if (!user) return member
      return { ...member, displayName: user.displayName, avatar: studioStore.getAvatarSnapshot(user.studioId, user.id) }
    })
  }

  private syncPartyPresence(party: SocialPartyState) {
    party.members.forEach((member) => {
      const player = this.playerForUser(member.userId)
      const client = this.clientForUser(member.userId)
      if (!player || !client) return
      updatePresence(member.userId, {
        partyId: party.partyId,
        status: party.status === 'IN_ACTIVITY' ? 'IN_ACTIVITY' : 'ONLINE',
        activity: party.activity?.type,
        x: player.x,
        y: player.y,
        currentRoom: player.currentRoom,
        displayName: player.name,
        role: player.role,
      }, client.sessionId)
    })
  }

  private sendPartyError(client: Client, requestId: string | undefined, code: string, message: string) {
    const payload: SocialPartyError = { requestId, code, message }
    try { client.send(Message.PARTY_ERROR, payload) } catch { /* client may have disconnected */ }
  }

  private broadcastParty(party: SocialPartyState) {
    this.refreshPartyMembers(party)
    this.syncPartyPresence(party)
    party.members.forEach((member) => this.clientForUser(member.userId)?.send(Message.PARTY_STATE, party))
  }

  private broadcastPartyEvent(party: SocialPartyState, payload: Record<string, unknown>) {
    party.members.forEach((member) => this.clientForUser(member.userId)?.send(Message.PARTY_EVENT, payload))
  }

  private removePartyMember(party: SocialPartyState, userId: string, reason: string, notify = true) {
    const removed = party.members.find((member) => member.userId === userId)
    if (!removed) return
    const targetClient = this.clientForUser(userId)
    if (this.activeMiniGamePartyId === party.partyId && targetClient) this.handleMiniGameLeave(targetClient.sessionId)
    party.members = party.members.filter((member) => member.userId !== userId)
    this.partyByUserId.delete(userId)
    targetClient?.send(Message.PARTY_STATE, null)
    if (!party.members.length) {
      party.status = 'DISBANDED'
      this.parties.delete(party.partyId)
      this.partyInvites.forEach((record, inviteId) => {
        if (record.invite.partyId === party.partyId) this.partyInvites.delete(inviteId)
      })
      if (notify) targetClient?.send(Message.PARTY_EVENT, { type: 'DISBANDED', reason })
      return
    }
    if (party.leaderId === userId) party.leaderId = party.members[0].userId
    party.version += 1
    if (notify) this.broadcastPartyEvent(party, { type: 'MEMBER_LEFT', userId, reason })
    this.broadcastParty(party)
  }

  private handlePartyAction(client: Client, message: SocialPartyActionPayload) {
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    const requestId = String(message?.requestId || '')
    const action = message?.action
    if (!player || !user || !/^[a-zA-Z0-9:_-]{8,120}$/.test(requestId)) {
      this.sendPartyError(client, requestId, 'PARTY_REQUEST_INVALID', 'Yêu cầu party không hợp lệ.')
      return
    }
    const processed = this.partyActionIds.get(client.sessionId) || []
    if (processed.includes(requestId)) return
    processed.push(requestId)
    this.partyActionIds.set(client.sessionId, processed.slice(-80))

    if (action === 'CREATE') {
      const existing = this.partyForUser(user.id)
      if (existing) { client.send(Message.PARTY_STATE, existing); return }
      const member = this.createPartyMember(user.id, 'JOINED')
      if (!member) return
      const party: SocialPartyState = { partyId: `party-${randomUUID().slice(0, 12)}`, leaderId: user.id, members: [member], status: 'OPEN', version: 1 }
      this.parties.set(party.partyId, party)
      this.partyByUserId.set(user.id, party.partyId)
      this.broadcastParty(party)
      return
    }

    if (action === 'INVITE') {
      const party = this.partyForUser(user.id)
      if (!party || !this.partyMember(user.id, party)) { this.sendPartyError(client, requestId, 'PARTY_REQUIRED', 'Hãy tạo hoặc tham gia party trước.'); return }
      if (party.status !== 'OPEN' || party.members.length >= 4) { this.sendPartyError(client, requestId, 'PARTY_CLOSED', 'Party đã đầy hoặc đang ở trong activity.'); return }
      const targetPlayer = message.targetSessionId ? this.state.players.get(message.targetSessionId) : message.targetUserId ? this.playerForUser(message.targetUserId) : undefined
      const targetUserId = targetPlayer?.userId || message.targetUserId || ''
      const targetUser = targetUserId ? studioStore.getUserById(targetUserId) : undefined
      if (!targetUser || targetUserId === user.id || targetUser.studioId !== user.studioId) { this.sendPartyError(client, requestId, 'PARTY_TARGET_INVALID', 'Không tìm thấy người chơi để mời.'); return }
      if (this.partyForUser(targetUserId)) { this.sendPartyError(client, requestId, 'PARTY_TARGET_BUSY', 'Người chơi này đã ở trong một party.'); return }
      if (studioStore.isBlocked(user.studioId, user.id, targetUserId)) { this.sendPartyError(client, requestId, 'SOCIAL_BLOCKED', 'Không thể mời người chơi này.'); return }
      const invite: SocialPartyInvite = { inviteId: `invite-${randomUUID().slice(0, 12)}`, partyId: party.partyId, inviterId: user.id, inviterName: user.displayName, inviterAvatar: studioStore.getAvatarSnapshot(user.studioId, user.id), expiresAt: new Date(Date.now() + 60_000).toISOString() }
      this.partyInvites.set(invite.inviteId, { invite, targetUserId })
      studioStore.createSocialNotification(user.studioId, targetUserId, 'PARTY_INVITE', user.id, { inviteId: invite.inviteId, partyId: party.partyId })
      const targetClient = this.clientForUser(targetUserId)
      if (targetClient) targetClient.send(Message.PARTY_INVITE, invite)
      this.broadcastPartyEvent(party, { type: 'INVITE_SENT', targetUserId, inviteId: invite.inviteId })
      return
    }

    if (action === 'ACCEPT' || action === 'DECLINE') {
      const inviteRecord = message.inviteId ? this.partyInvites.get(message.inviteId) : undefined
      if (!inviteRecord || inviteRecord.targetUserId !== user.id) { this.sendPartyError(client, requestId, 'PARTY_INVITE_NOT_FOUND', 'Lời mời party không còn hiệu lực.'); return }
      this.partyInvites.delete(message.inviteId as string)
      if (action === 'DECLINE') {
        client.send(Message.PARTY_EVENT, { type: 'INVITE_DECLINED', inviteId: inviteRecord.invite.inviteId })
        return
      }
      if (new Date(inviteRecord.invite.expiresAt).getTime() <= Date.now()) { this.sendPartyError(client, requestId, 'PARTY_INVITE_EXPIRED', 'Lời mời party đã hết hạn.'); return }
      if (this.partyForUser(user.id)) { this.sendPartyError(client, requestId, 'PARTY_ALREADY_JOINED', 'Bạn đã ở trong một party.'); return }
      const party = this.parties.get(inviteRecord.invite.partyId)
      if (!party || party.status !== 'OPEN' || party.members.length >= 4) { this.sendPartyError(client, requestId, 'PARTY_CLOSED', 'Party đã đóng hoặc đủ 4 người.'); return }
      if (studioStore.isBlocked(user.studioId, user.id, inviteRecord.invite.inviterId)) { this.sendPartyError(client, requestId, 'SOCIAL_BLOCKED', 'Không thể tham gia party này.'); return }
      const member = this.createPartyMember(user.id, 'JOINED')
      if (!member) return
      party.members.push(member)
      party.version += 1
      this.partyByUserId.set(user.id, party.partyId)
      this.broadcastPartyEvent(party, { type: 'MEMBER_JOINED', userId: user.id, displayName: user.displayName })
      this.broadcastParty(party)
      return
    }

    const party = this.partyForUser(user.id)
    if (!party || (message.partyId && message.partyId !== party.partyId)) { this.sendPartyError(client, requestId, 'PARTY_NOT_FOUND', 'Party không còn tồn tại.'); return }
    const member = this.partyMember(user.id, party)
    if (!member) { this.sendPartyError(client, requestId, 'PARTY_MEMBER_NOT_FOUND', 'Bạn không ở trong party này.'); return }

    if (action === 'LEAVE') {
      this.removePartyMember(party, user.id, 'left')
      return
    }

    if (action === 'KICK') {
      if (party.status !== 'OPEN') { this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_ACTIVE', 'Không thể kick trong lúc party đang hoạt động.'); return }
      if (party.leaderId !== user.id) { this.sendPartyError(client, requestId, 'PARTY_LEADER_REQUIRED', 'Chỉ party leader mới có thể kick thành viên.'); return }
      const targetUserId = message.targetUserId || this.state.players.get(message.targetSessionId || '')?.userId || ''
      if (!targetUserId || targetUserId === user.id || !this.partyMember(targetUserId, party)) { this.sendPartyError(client, requestId, 'PARTY_TARGET_INVALID', 'Thành viên cần kick không hợp lệ.'); return }
      this.removePartyMember(party, targetUserId, 'kicked')
      return
    }

    if (action === 'READY') {
      if (party.status !== 'OPEN') { this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_ACTIVE', 'Không thể đổi Ready trong lúc party đang hoạt động.'); return }
      member.status = member.status === 'READY' ? 'JOINED' : 'READY'
      party.version += 1
      this.broadcastParty(party)
      return
    }

    if (action === 'ACTIVITY_REQUEST') {
      if (party.leaderId !== user.id) { this.sendPartyError(client, requestId, 'PARTY_LEADER_REQUIRED', 'Chỉ party leader mới có thể mở activity cho party.'); return }
      if (party.status !== 'OPEN') { this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_ACTIVE', 'Party đang ở trong một activity khác.'); return }
      if (message.activityType === 'SOCIAL_GAME') {
        if (message.mode !== 'PAINT_TILES' && message.mode !== 'TREASURE_HUNT') { this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_UNAVAILABLE', 'Party MVP hiện hỗ trợ Paint Tiles và Treasure Hunt.'); return }
        this.startMiniGame(client, message.mode, party.partyId)
        return
      }
      if (!message.activityType) { this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_INVALID', 'Activity type không hợp lệ.'); return }
      this.sendPartyError(client, requestId, 'PARTY_ACTIVITY_UNAVAILABLE', 'Party hiện chỉ hỗ trợ game chung; hãy đi bộ tới điểm chơi rồi nhấn E.')
      return
    }

    this.sendPartyError(client, requestId, 'PARTY_ACTION_UNSUPPORTED', 'Party action chưa được hỗ trợ.')
  }

  private handlePartyLeave(userId: string, sessionId: string) {
    const hasAnotherSession = [...this.state.players.entries()].some(([candidateSessionId, player]) => candidateSessionId !== sessionId && player.userId === userId)
    if (hasAnotherSession) return
    const party = this.partyForUser(userId)
    if (party) this.removePartyMember(party, userId, 'disconnected')
  }

  private workStation(stationId: string) {
    return workStationDefinitions.find((station) => station.id === stationId)
  }

  private playerNearWorkStation(player: Player, stationId: string): boolean {
    const station = this.workStation(stationId)
    return Boolean(station && player.currentRoom === station.roomId && Math.hypot(player.x - station.x, player.y - station.y) <= station.interactionRadius)
  }

  private playerNearAnyWorkStation(player: Player, stationIds: string[]): boolean {
    return stationIds.some((stationId) => this.playerNearWorkStation(player, stationId))
  }

  private startWorkSession(client: Client, message: WorkStartPayload) {
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!player || !user) {
      this.sendWorkError(client, 'WORK_NOT_READY', 'Work session chưa sẵn sàng.')
      return
    }
    if (!message?.actionId || String(message.actionId).length > 120) {
      this.sendWorkError(client, 'INVALID_WORK_ACTION', 'Work action id không hợp lệ.')
      return
    }
    if (this.activeWorkSessions.has(client.sessionId) || [...this.activeWorkSessions.values()].some((session) => session.userId === user.id)) {
      this.sendWorkError(client, 'WORK_SESSION_ACTIVE', 'Bạn đang có một work session khác.')
      return
    }

    const mode = message.mode || 'JOB'
    if (mode !== 'JOB' && mode !== 'CERTIFICATION') {
      this.sendWorkError(client, 'INVALID_WORK_MODE', 'Work mode không hợp lệ.')
      return
    }
    const snapshot = studioStore.getWorkSnapshot(user.studioId, user.id)
    let job = message.jobId ? workJobDefinition(message.jobId) : undefined
    let careerId: WorkCareerId | undefined
    let targetRank: WorkRankId | undefined
    let challengeRank: WorkRankId = 'INTERN'
    let stationId = message.stationId || job?.stationId || 'JOB_BOARD'

    if (mode === 'CERTIFICATION') {
      careerId = message.careerId || snapshot.progression.currentCareerId
      targetRank = message.targetRank
      const careerProgress = careerId ? snapshot.progression.careers.find((entry) => entry.careerId === careerId) : undefined
      challengeRank = careerProgress?.rank || 'INTERN'
      const nextRank = careerProgress ? workNextRank(careerProgress.rank) : undefined
      const targetDefinition = targetRank ? workRankDefinitions.find((rank) => rank.id === targetRank) : undefined
      if (!careerId || snapshot.progression.currentCareerId !== careerId || !targetRank || nextRank !== targetRank || !targetDefinition || !careerProgress || careerProgress.careerXp < targetDefinition.careerXpRequired) {
        this.sendWorkError(client, 'CERTIFICATION_NOT_READY', 'Career chưa đủ điều kiện để thi promotion.')
        return
      }
      stationId = 'CAREER_CENTER'
      job = workJobDefinitions.find((candidate) => candidate.careerIds.includes(careerId!)) || workJobDefinitions[0]
    } else {
      if (!job) {
        this.sendWorkError(client, 'INVALID_WORK_JOB', 'Work job không tồn tại.')
        return
      }
      careerId = message.careerId || (job.careerIds.length === 0 ? snapshot.progression.currentCareerId : undefined)
      if (job.careerIds.length === 0 && message.careerId && message.careerId !== snapshot.progression.currentCareerId) {
        this.sendWorkError(client, 'CAREER_JOB_LOCKED', 'Career trong work session không khớp career hiện tại.')
        return
      }
      if (job.careerIds.length > 0 && (!careerId || snapshot.progression.currentCareerId !== careerId || !job.careerIds.includes(careerId))) {
        this.sendWorkError(client, 'CAREER_JOB_LOCKED', 'Job này không thuộc career hiện tại.')
        return
      }
      const activeProgress = careerId ? snapshot.progression.careers.find((entry) => entry.careerId === careerId) : undefined
      const rank = activeProgress?.rank || 'INTERN'
      challengeRank = rank
      if (workRankIndex(rank) < workRankIndex(job.minRank)) {
        this.sendWorkError(client, 'WORK_RANK_REQUIRED', `Cần rank ${workRankDefinitions.find((entry) => entry.id === job!.minRank)?.name || job.minRank}.`)
        return
      }
      const jobCount = snapshot.daily.jobCounts[job.id] || 0
      if (jobCount >= job.dailyLimit) {
        this.sendWorkError(client, 'WORK_JOB_DAILY_LIMIT', 'Job này đã đủ lượt trong hôm nay.')
        return
      }
      stationId = job.stationId
    }

    // Work is intentionally location-independent. Stations remain map
    // metadata/wayfinding only; they must never block a valid job or exam.

    if (snapshot.daily.sessionCount >= workEconomy.workSessionsPerDay) {
      this.sendWorkError(client, 'WORK_SESSION_DAILY_LIMIT', 'Bạn đã dùng hết số work session hôm nay.')
      return
    }

    if (!studioStore.beginWorkSession(user.id)) {
      this.sendWorkError(client, 'WORK_SESSION_ACTIVE', 'Bạn đang có một work session khác.')
      return
    }

    const sessionId = `work-${user.id}-${Date.now()}-${randomUUID().slice(0, 8)}`
    const challenge = createWorkChallenge(job, sessionId, mode, careerId, targetRank, challengeRank)
    const startedAt = Date.now()
    const endsAt = startedAt + challenge.publicChallenge.durationSeconds * 1000
    const timer = setTimeout(() => this.finishWorkSession(client, sessionId, false, true), challenge.publicChallenge.durationSeconds * 1000 + 150)
    const session: ActiveWorkSession = { client, sessionId, clientSessionId: client.sessionId, userId: user.id, studioId: user.studioId, mode, jobId: job.id, careerId, targetRank, stationId, challenge, actions: [], actionIds: new Set<string>(), startedAt, endsAt, timer }
    this.activeWorkSessions.set(client.sessionId, session)
    try { client.send(Message.WORK_SESSION_STARTED, { sessionId, challenge: { ...challenge.publicChallenge, challengeSeed: sessionId }, startedAt, endsAt }) } catch {
      this.activeWorkSessions.delete(client.sessionId)
      studioStore.endWorkSession(user.id)
      return
    }
    this.broadcast(Message.WORK_ACTIVITY, { userId: user.id, displayName: user.displayName, careerId, stationId, message: `${user.displayName} is working at ${this.workStation(stationId)?.label || 'a workstation'}.` })
  }

  private handleWorkAction(client: Client, message: WorkActionPayload) {
    const session = this.activeWorkSessions.get(client.sessionId)
    if (!session || session.sessionId !== message?.sessionId) {
      this.sendWorkError(client, 'WORK_SESSION_NOT_FOUND', 'Work session không tồn tại hoặc đã kết thúc.')
      return
    }
    if (Date.now() >= session.endsAt) {
      this.finishWorkSession(client, session.sessionId, false, true)
      return
    }
    const actionId = String(message.actionId || '')
    const stepId = String(message.payload?.stepId || '')
    const optionId = String(message.payload?.optionId || '')
    if (!actionId || actionId.length > 120 || session.actionIds.has(actionId)) return
    if (message.actionType !== 'SELECT_OPTION' || !validateWorkAction(session.challenge, stepId, optionId)) {
      this.sendWorkError(client, 'INVALID_WORK_ACTION', 'Lựa chọn work không hợp lệ.')
      return
    }
    session.actionIds.add(actionId)
    session.actions.push({ actionId, stepId, optionId, receivedAt: Date.now() })
    client.send(Message.WORK_STATE, { sessionId: session.sessionId, answeredSteps: new Set(session.actions.map((action) => action.stepId)).size, totalSteps: session.challenge.publicChallenge.steps.length, endsAt: session.endsAt })
  }

  private finishWorkSession(client: Client, sessionId?: string, abandoned = false, expired = false) {
    const session = this.activeWorkSessions.get(client.sessionId)
    if (!session || !sessionId || session.sessionId !== sessionId) return
    clearTimeout(session.timer)
    this.activeWorkSessions.delete(client.sessionId)
    const elapsedMs = Math.max(0, Math.min(session.endsAt - session.startedAt, Date.now() - session.startedAt))
    try {
      const user = studioStore.getUserById(session.userId)
      if (!user) return
      if (session.mode === 'CERTIFICATION' && session.careerId && session.targetRank) {
        const result = studioStore.completeWorkCertification(session.studioId, session.userId, { sessionId: session.sessionId, careerId: session.careerId, targetRank: session.targetRank, challenge: session.challenge, actions: session.actions, elapsedMs })
        client.send(Message.WORK_RESULT, result)
      } else {
        const reward = studioStore.settleWorkJob(session.studioId, session.userId, { sessionId: session.sessionId, jobId: session.jobId, careerId: session.careerId, challenge: session.challenge, actions: session.actions, elapsedMs, startedAt: new Date(session.startedAt).toISOString(), abandoned: abandoned || expired, expired })
        client.send(Message.WORK_RESULT, reward)
      }
    } catch (error) {
      if (error instanceof DomainError) this.sendWorkError(client, error.code, error.message)
      else this.sendWorkError(client, 'WORK_SETTLEMENT_FAILED', 'Không thể settle work session.')
    } finally {
      studioStore.endWorkSession(session.userId)
    }
  }

  private handleWorkLeave(clientSessionId: string) {
    const session = this.activeWorkSessions.get(clientSessionId)
    if (session) this.finishWorkSession(session.client, session.sessionId, true)
  }

  onDispose() {
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboardRoomIds.has(whiteboard.roomId)) whiteboardRoomIds.delete(whiteboard.roomId)
    })

    console.log('room', this.roomId, 'disposing...')
    this.studioEventHandlers.forEach(({ event, handler }) => studioEvents.off(event, handler))
    this.clearTagGameTimers()
    this.clearMiniGameTimers()
    this.clearCasinoTimers()
    this.clearTexasTurnTimers()
    this.clearTexasMultiplayerStartTimers()
    this.clearTexasMultiplayerNextHandTimers()
    this.texasMultiplayerGames.clear()
    this.texasMultiplayerHostSessionIds.clear()
    this.clearTienLenBotTimers()
    this.tienLenGames.clear()
    this.tienLenLobbies.clear()
    this.tienLenActionIds.clear()
    this.combatLastActionAt.clear()
    this.combatActionIds.clear()
    this.rpsCleanupTimers.forEach((timer) => clearTimeout(timer))
    this.rpsCleanupTimers.clear()
    this.rpsChallenges.clear()
    this.rpsActionIds.clear()
    this.activeWorkSessions.forEach((session) => {
      clearTimeout(session.timer)
      studioStore.endWorkSession(session.userId)
    })
    this.activeWorkSessions.clear()
    this.parties.clear()
    this.partyByUserId.clear()
    this.partyInvites.clear()
    this.partyActionIds.clear()
    this.roomDataTimers.forEach((timer) => clearTimeout(timer))
    this.roomDataTimers.clear()
    this.activeMiniGamePartyId = ''
    this.dispatcher.stop()
  }

  private initializeCasinoTables() {
    CASINO_GAME_MODES.forEach((mode) => {
      const table = new CasinoTableState()
      table.mode = mode
      table.dealerName = mode === 'BAU_CUA' ? 'CÔ BA · AI' : mode === 'SICBO' ? 'MASTER DICE · AI' : mode === 'CHESS' ? 'GRANDMASTER NOVA · AI' : mode === 'POKER' ? 'NOAH · TABLE HOST' : mode === 'TIEN_LEN' ? 'BÀN DÂN GIAN · 4 GHẾ' : 'DEALER MIKA · AI'
      this.state.casinoTables.set(mode, table)
      if (mode === 'CHESS' || mode === 'POKER' || mode === 'TIEN_LEN') {
        table.roundId = mode === 'CHESS' ? 'chess-arena-live' : mode === 'POKER' ? 'texas-holdem-live' : 'tien-len-live'
        table.phase = 'PLAYER_TURN'
        table.phaseStartedAt = Date.now()
        table.phaseEndsAt = 0
        table.statusText = mode === 'CHESS' ? 'PLAY VS DEALER AI · Bàn luôn sẵn sàng' : mode === 'POKER' ? 'NO-LIMIT TEXAS HOLD’EM · 5/10 · 3 BOT' : 'TIẾN LÊN MIỀN NAM · BOT hoặc BÀN CHỜ NGƯỜI'
        if (mode === 'POKER' || mode === 'TIEN_LEN') this.syncPvpLobby(table)
      } else this.startCasinoRound(mode)
    })
  }

  private clearCasinoTimers() {
    this.casinoTimers.forEach((timer) => clearTimeout(timer))
    this.casinoTimers.clear()
  }

  private setCasinoTimer(mode: CasinoGameMode, callback: () => void, delay: number) {
    const current = this.casinoTimers.get(mode)
    if (current) clearTimeout(current)
    this.casinoTimers.set(mode, setTimeout(callback, delay))
  }

  private setCasinoPhase(table: CasinoTableState, phase: CasinoPhase, duration: number, statusText: string) {
    const now = Date.now()
    table.phase = phase
    table.phaseStartedAt = now
    table.phaseEndsAt = now + duration
    table.statusText = statusText
  }

  private startCasinoRound(mode: CasinoGameMode) {
    const table = this.state.casinoTables.get(mode)
    if (!table) return
    table.roundNumber += 1
    table.roundId = `${mode.toLowerCase()}-live-${Date.now()}-${table.roundNumber}`
    table.outcome = ''
    table.playerCards = ''
    table.bankerCards = ''
    table.dealerCards = ''
    table.communityCards = ''
    table.dice = ''
    table.playerTotal = 0
    table.bankerTotal = 0
    table.dealerTotal = 0
    table.resultDetail = ''
    table.totalWagered = 0
    table.activePlayers = 0
    table.seats.clear()
    if (mode === 'BACCARAT' || mode === 'BLACKJACK') this.prepareCasinoDeck(mode)
    table.shoeRemaining = this.casinoDecks.get(mode)?.length || 0
    this.setCasinoPhase(table, 'BETTING', CASINO_BETTING_MS, 'PLACE YOUR BETS · Chọn chip và đặt cược')
    this.emitCasinoEvent('ROUND_OPEN', mode, `Bàn ${gameDisplayName(mode)} mở cược ván #${table.roundNumber}.`)
    this.setCasinoTimer(mode, () => this.closeCasinoBetting(mode), CASINO_BETTING_MS)
  }

  private closeCasinoBetting(mode: CasinoGameMode) {
    const table = this.state.casinoTables.get(mode)
    if (!table || table.phase !== 'BETTING') return
    this.setCasinoPhase(table, 'BETTING_CLOSED', 650, 'NO MORE BETS · Dealer đã khóa bàn')
    this.emitCasinoEvent('BETTING_CLOSED', mode, 'Không nhận thêm cược. Dealer bắt đầu ván.')
    this.setCasinoTimer(mode, () => {
      if (mode === 'BACCARAT') this.dealCasinoBaccarat(table)
      else if (mode === 'BLACKJACK') this.dealCasinoBlackjack(table)
      else if (mode === 'SICBO') this.shakeCasinoSicBo(table)
      else if (mode === 'BAU_CUA') this.shakeCasinoBauCua(table)
      else if (mode === 'DICE_DUEL') this.shakeCasinoDiceDuel(table)
      else this.spinCasinoLuckyDraw(table)
    }, 650)
  }

  private prepareCasinoDeck(mode: CasinoGameMode) {
    const current = this.casinoDecks.get(mode)
    if (!current || current.length < 80) this.casinoDecks.set(mode, shuffleCards(createShoe(6)))
  }

  private drawCasinoCard(mode: CasinoGameMode): string {
    this.prepareCasinoDeck(mode)
    const deck = this.casinoDecks.get(mode)!
    return deck.pop()!
  }

  private casinoWagers(seat: CasinoSeat): Record<string, number> {
    try {
      const parsed = JSON.parse(seat.wagersJson || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_error) {
      return {}
    }
  }

  private handleCasinoAction(client: Client, message: CasinoActionPayload) {
    const mode = message.mode
    if (!mode || !isCasinoMode(mode)) {
      this.sendCasinoError(client, 'Bàn casino không hợp lệ.')
      return
    }
    const player = this.state.players.get(client.sessionId)
    const table = this.state.casinoTables.get(mode)
    if (!player || !table || !this.isCardRoomLocation(player.currentRoom)) {
      this.sendCasinoError(client, 'Bạn cần đứng trong Play Lounge, Arcade Hall hoặc VIP Games.')
      return
    }
    try {
      if (mode === 'CHESS') this.handleCasinoChessAction(client, table, message)
      else if (mode === 'POKER') this.handleCasinoTexasAction(client, table, message)
      else if (mode === 'TIEN_LEN') this.handleTienLenAction(client, message as TienLenActionPayload)
      else if (message.action === 'BET') this.placeCasinoBet(client, table, message.choice || '', Number(message.amount), message.actionId || '', message.seatIndex)
      else if (mode === 'BLACKJACK') this.handleCasinoBlackjackAction(client, table, message.action || '', message.actionId || '')
      else this.sendCasinoError(client, 'Action này không dùng được ở phase hiện tại.')
    } catch (error) {
      this.sendCasinoError(client, error instanceof DomainError ? error.message : 'Không thể xử lý action casino.')
    }
  }

  private handleTienLenAction(client: Client, message: TienLenActionPayload) {
    const player = this.state.players.get(client.sessionId)
    const table = this.state.casinoTables.get('TIEN_LEN')
    if (!player || !table || !this.isCardRoomLocation(player.currentRoom)) {
      this.sendTienLenError(client, 'Hãy tới Play Lounge, Arcade Hall hoặc VIP Games để vào bàn Tiến Lên.')
      return
    }
    const actionId = message.actionId || ''
    if (actionId && this.isDuplicateTienLenAction(client.sessionId, actionId)) return
    try {
      if (message.action === 'PLAY_BOT') {
        const existing = this.tienLenGames.get(client.sessionId)
        if (existing && existing.status !== 'COMPLETE') throw new TienLenRuleError('Bạn đang có một ván Tiến Lên đang chơi.')
        const game = createTienLenGame(`tien-len-bot-${client.sessionId}-${Date.now()}`, 'BOT', [
          { id: client.sessionId, name: player.name },
          { id: `BOT_NOVA_${client.sessionId}`, name: 'Nova · Bot', isBot: true },
          { id: `BOT_RIVER_${client.sessionId}`, name: 'River · Bot', isBot: true },
          { id: `BOT_ACE_${client.sessionId}`, name: 'Ace · Bot', isBot: true },
        ])
        startTienLenGame(game)
        this.tienLenGames.set(client.sessionId, game)
        this.syncTienLenTable(table, game)
        this.scheduleTienLenBots(table, game)
        return
      }

      if (message.action === 'JOIN_TABLE') {
        if (this.tienLenGames.has(client.sessionId)) throw new TienLenRuleError('Hãy rời ván bot hiện tại trước khi vào bàn chờ.')
        const currentLobby = [...this.tienLenLobbies.entries()].find(([, candidate]) => candidate.players.some((seated) => seated.id === client.sessionId))
        if (currentLobby && currentLobby[1].status !== 'COMPLETE') {
          this.syncTienLenTable(table, currentLobby[1], currentLobby[0])
          return
        }
        if (currentLobby) this.handleTienLenLeave(client.sessionId)
        const requestedTableId = message.tableId || PVP_TABLE_CATALOG.TIEN_LEN[0].id
        const requestedConfig = PVP_TABLE_CATALOG.TIEN_LEN.find((candidate) => candidate.id === requestedTableId)
        if (!requestedConfig) throw new TienLenRuleError('Bàn Tiến Lên không tồn tại.')
        const targetConfig = [requestedConfig, ...PVP_TABLE_CATALOG.TIEN_LEN.filter((candidate) => candidate.buyIn === requestedConfig.buyIn && candidate.id !== requestedConfig.id)].find((candidate) => {
          const candidateLobby = this.tienLenLobbies.get(candidate.id)
          return !candidateLobby || candidateLobby.status === 'COMPLETE' || (candidateLobby.status === 'WAITING' && candidateLobby.players.length < candidate.maxPlayers)
        })
        if (!targetConfig) throw new TienLenRuleError(`Các bàn mức ${requestedConfig.stakesLabel} đang đầy. Hãy chọn mức cược khác.`)
        const tableId = targetConfig.id
        let lobby = this.tienLenLobbies.get(tableId)
        if (!lobby || lobby.status === 'COMPLETE') {
          lobby = createTienLenGame(`tien-len-${tableId}-${Date.now()}`, 'LOBBY', [])
          this.tienLenLobbies.set(tableId, lobby)
        }
        const user = studioStore.getUserById(player.userId)
        if (!user) throw new TienLenRuleError('Không tìm thấy tài khoản người chơi.')
        if (targetConfig.buyIn > 0) {
          const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : `TIEN_LEN_JOIN:${tableId}:${client.sessionId}:${Date.now()}`
          const reward = studioStore.placeCasinoWager(user.studioId, user.id, 'TIEN_LEN', lobby.gameId, safeActionId, targetConfig.buyIn, { variant: 'TIEN_LEN_PVP', tableId, roomCode: targetConfig.roomCode, buyIn: targetConfig.buyIn })
          this.sendSocialReward(client.sessionId, reward)
          if (reward.duplicate) return
        }
        addTienLenPlayer(lobby, { id: client.sessionId, name: player.name })
        const seat = new CasinoSeat()
        seat.userId = player.userId
        seat.displayName = player.name
        seat.status = 'WAITING'
        seat.stake = targetConfig.buyIn
        seat.net = -targetConfig.buyIn
        seat.matchId = lobby.gameId
        seat.pokerMode = 'TIEN_LEN_WAITING'
        seat.pvpTableId = tableId
        table.seats.set(client.sessionId, seat)
        if (tableId !== requestedTableId) lobby.notice = `Bàn #${requestedConfig.roomCode} đã đầy hoặc đang chơi · tự chuyển sang bàn #${targetConfig.roomCode}.`
        this.syncTienLenTable(table, lobby, tableId)
        return
      }

      if (message.action === 'START_LOBBY') {
        const tableId = message.tableId || [...this.tienLenLobbies.entries()].find(([, lobby]) => lobby.players.some((candidate) => candidate.id === client.sessionId))?.[0] || PVP_TABLE_CATALOG.TIEN_LEN[0].id
        const game = this.tienLenLobbies.get(tableId)
        if (!game || !game.players.some((candidate) => candidate.id === client.sessionId)) throw new TienLenRuleError('Bạn chưa ngồi vào bàn chờ.')
        if (game.hostId !== client.sessionId) throw new TienLenRuleError('Chỉ chủ bàn mới có thể bắt đầu.')
        startTienLenGame(game)
        this.syncTienLenTable(table, game, tableId)
        return
      }

      if (message.action === 'LEAVE_TABLE') {
        this.handleTienLenLeave(client.sessionId)
        return
      }

      const lobby = [...this.tienLenLobbies.values()].find((candidate) => candidate.players.some((player) => player.id === client.sessionId))
      const game = this.tienLenGames.get(client.sessionId) || lobby
      if (!game) throw new TienLenRuleError('Bạn chưa chọn chế độ chơi Tiến Lên.')
      if (message.action === 'PLAY') playTienLen(game, client.sessionId, message.cards || [])
      else if (message.action === 'PASS') passTienLen(game, client.sessionId)
      else throw new TienLenRuleError('Action Tiến Lên không hợp lệ.')
      const tableId = [...this.tienLenLobbies.entries()].find(([, candidate]) => candidate === game)?.[0]
      if (game.mode === 'LOBBY' && game.status === 'COMPLETE') this.settleTienLenLobby(table, game)
      this.syncTienLenTable(table, game, tableId)
      this.scheduleTienLenBots(table, game)
    } catch (error) {
      this.sendTienLenError(client, error instanceof TienLenRuleError ? error.message : 'Không thể xử lý nước Tiến Lên.')
    }
  }

  private isDuplicateTienLenAction(sessionId: string, actionId: string) {
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(actionId)) return false
    const actions = this.tienLenActionIds.get(sessionId) || []
    if (actions.includes(actionId)) return true
    actions.push(actionId)
    this.tienLenActionIds.set(sessionId, actions.slice(-32))
    return false
  }

  private syncTienLenTable(table: CasinoTableState, game: TienLenGameState, tableId?: string) {
    const config = tableId ? PVP_TABLE_CATALOG.TIEN_LEN.find((candidate) => candidate.id === tableId) : undefined
    table.phase = 'PLAYER_TURN'
    table.roundId = game.gameId
    table.roundNumber = game.handNumber
    table.phaseStartedAt = Date.now()
    table.phaseEndsAt = 0
    table.activePlayers = game.players.length
    table.totalWagered = config ? config.buyIn * game.players.length : 0
    table.shoeRemaining = 0
    table.statusText = game.status === 'WAITING'
      ? `${config ? `BÀN #${config.roomCode} · ${config.stakesLabel}` : 'BÀN CHỜ NGƯỜI'} · ${game.players.length}/4 ghế · bắt đầu từ 2 người`
      : game.status === 'COMPLETE' ? `KẾT THÚC · ${game.result || 'Chờ ván mới'}` : `${game.mode === 'BOT' ? 'CHƠI VỚI 3 BOT' : 'BÀN NGƯỜI CHƠI'} · lượt ${game.players.find((player) => player.seat === game.currentSeat)?.name || '—'}`
    table.tienLenPublicJson = JSON.stringify(publicTienLenState(game))
    this.syncPvpLobby(table)
    game.players.forEach((player) => {
      const target = this.clients.find((candidate) => candidate.sessionId === player.id)
      if (target) target.send(Message.TIEN_LEN_PRIVATE_STATE, privateTienLenState(game, player.id))
    })
  }

  private resetTienLenTableToLobby(table: CasinoTableState) {
    table.phase = 'PLAYER_TURN'
    table.roundId = 'tien-len-live'
    table.roundNumber = 0
    table.phaseStartedAt = Date.now()
    table.phaseEndsAt = 0
    table.statusText = 'TIẾN LÊN MIỀN NAM · CHỌN BÀN ĐỂ VÀO CHƠI'
    table.outcome = ''
    table.playerCards = ''
    table.bankerCards = ''
    table.dealerCards = ''
    table.communityCards = ''
    table.dice = ''
    table.resultDetail = ''
    table.totalWagered = 0
    table.activePlayers = 0
    table.shoeRemaining = 0
    table.tienLenPublicJson = ''
    this.syncPvpLobby(table)
  }

  private settleTienLenLobby(table: CasinoTableState, game: TienLenGameState) {
    const pot = game.players.reduce((total, player) => total + (table.seats.get(player.id)?.stake || 0), 0)
    game.players.forEach((player) => {
      const seat = table.seats.get(player.id)
      if (!seat || seat.status === 'SETTLED') return
      const payout = game.winnerIds.includes(player.id) ? pot : 0
      seat.payout = payout
      seat.net = payout - seat.stake
      seat.status = 'SETTLED'
      seat.result = game.winnerIds.includes(player.id) ? `Về nhất · nhận pot ${pot} Coin` : 'Thua ván'
      seat.win = game.winnerIds.includes(player.id)
      const user = studioStore.getUserById(seat.userId)
      if (user && seat.stake > 0) {
        const reward = studioStore.settleCasinoPayout(user.studioId, user.id, 'TIEN_LEN', seat.matchId, 'final', payout, { variant: 'TIEN_LEN_PVP', tableId: seat.pvpTableId, buyIn: seat.stake, pot })
        if (this.state.players.has(player.id)) this.sendSocialReward(player.id, reward)
      }
    })
    if (pot > 0) this.emitCasinoEvent('TIEN_LEN_PAYOUT', 'TIEN_LEN', `${game.players.find((player) => game.winnerIds.includes(player.id))?.name || 'Người thắng'} nhận pot ${pot} Coin.`, game.winnerIds[0], 'COMPLETE', undefined, pot)
  }

  private refundTienLenSeat(table: CasinoTableState, sessionId: string, reason: string) {
    const seat = table.seats.get(sessionId)
    if (!seat) return
    if (seat.status !== 'SETTLED' && seat.stake > 0) {
      const user = studioStore.getUserById(seat.userId)
      if (user) {
        const reward = studioStore.settleCasinoPayout(user.studioId, user.id, 'TIEN_LEN', seat.matchId, 'refund', seat.stake, { variant: 'TIEN_LEN_PVP', tableId: seat.pvpTableId, reason })
        if (this.state.players.has(sessionId)) this.sendSocialReward(sessionId, reward)
      }
    }
    table.seats.delete(sessionId)
  }

  private handleTienLenLeave(sessionId: string) {
    const table = this.state.casinoTables.get('TIEN_LEN')
    const personal = this.tienLenGames.get(sessionId)
    if (personal) {
      this.clearTienLenBotTimer(personal.gameId)
      this.tienLenGames.delete(sessionId)
      if (table && table.roundId === personal.gameId) this.resetTienLenTableToLobby(table)
    }
    this.tienLenLobbies.forEach((lobby, tableId) => {
      const index = lobby.players.findIndex((player) => player.id === sessionId)
      if (index < 0) return
      if (lobby.status === 'PLAYING') {
        const departedName = lobby.players[index].name
        if (table) lobby.players.forEach((candidate) => this.refundTienLenSeat(table, candidate.id, 'TABLE_ABORTED'))
        const replacement = createTienLenGame(`tien-len-${tableId}-${Date.now()}`, 'LOBBY', [])
        replacement.notice = `${departedName} rời bàn · bàn đã mở lại cho người chơi mới.`
        this.tienLenLobbies.set(tableId, replacement)
        if (table) this.syncTienLenTable(table, replacement, tableId)
      } else {
        if (table) this.refundTienLenSeat(table, sessionId, lobby.status === 'COMPLETE' ? 'RESULT_CLOSED' : 'LEFT_WAITING_ROOM')
        lobby.players.splice(index, 1)
        lobby.players.forEach((player, seat) => { player.seat = seat })
        if (lobby.hostId === sessionId) lobby.hostId = lobby.players[0]?.id || ''
        if (table) this.syncTienLenTable(table, lobby, tableId)
      }
    })
  }

  private sendTienLenError(client: Client, message: string) {
    client.send(Message.TIEN_LEN_ERROR, { message })
  }

  private scheduleTienLenBots(table: CasinoTableState, game: TienLenGameState) {
    if (game.mode !== 'BOT' || game.status !== 'PLAYING') return
    const current = game.players.find((player) => player.seat === game.currentSeat)
    if (!current?.isBot || this.tienLenBotTimers.has(game.gameId)) return
    const timer = setTimeout(() => {
      this.tienLenBotTimers.delete(game.gameId)
      if (game.status !== 'PLAYING') return
      const acting = game.players.find((player) => player.seat === game.currentSeat)
      if (!acting?.isBot) return
      try {
        runTienLenBots(game, 1)
        this.syncTienLenTable(table, game)
        this.scheduleTienLenBots(table, game)
      } catch (error) {
        game.notice = error instanceof TienLenRuleError ? error.message : 'Bot không thể tiếp tục ván chơi.'
        this.syncTienLenTable(table, game)
      }
    }, TIEN_LEN_BOT_THINKING_MS + Math.floor(Math.random() * 850))
    this.tienLenBotTimers.set(game.gameId, timer)
  }

  private clearTienLenBotTimer(gameId: string) {
    const timer = this.tienLenBotTimers.get(gameId)
    if (timer) clearTimeout(timer)
    this.tienLenBotTimers.delete(gameId)
  }

  private clearTienLenBotTimers() {
    this.tienLenBotTimers.forEach((timer) => clearTimeout(timer))
    this.tienLenBotTimers.clear()
  }

  private validCasinoChoice(mode: CasinoGameMode, choice: string) {
    if (mode === 'BACCARAT') return ['PLAYER', 'BANKER', 'TIE'].includes(choice)
    if (mode === 'BLACKJACK') return choice === 'MAIN'
    if (mode === 'CHESS') return choice === 'MAIN'
    if (mode === 'DICE_DUEL') return choice === 'MAIN'
    if (mode === 'LUCKY_DRAW') return choice === 'DRAW'
    if (mode === 'BAU_CUA') return (CASINO_RULES.BAU_CUA.choices as readonly string[]).includes(choice)
    if (['SMALL', 'BIG', 'ODD', 'EVEN', 'ANY_TRIPLE'].includes(choice)) return true
    const match = choice.match(/^(SINGLE|DOUBLE|TRIPLE|TOTAL)_(\d+)$/)
    if (!match) return false
    const value = Number(match[2])
    return match[1] === 'TOTAL' ? value >= 4 && value <= 17 : value >= 1 && value <= 6
  }

  private placeCasinoBet(client: Client, table: CasinoTableState, choice: string, amount: number, actionId: string, requestedSeatIndex?: number) {
    if (table.phase !== 'BETTING') throw new DomainError('CASINO_BETTING_CLOSED', 'Dealer đã khóa cược cho ván này.', 409)
    if (![5, 10, 25, 50, 100, 500].includes(amount) || amount < CASINO_RULES[table.mode].minBet || !this.validCasinoChoice(table.mode, choice)) throw new DomainError('CASINO_BET_INVALID', 'Chip hoặc cửa cược không hợp lệ.')
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!player || !user) throw new DomainError('CASINO_PLAYER_INVALID', 'Không tìm thấy người chơi.')
    let seat = table.seats.get(client.sessionId)
    if (table.mode === 'BLACKJACK') {
      if (requestedSeatIndex !== undefined && (!Number.isInteger(requestedSeatIndex) || requestedSeatIndex < 0 || requestedSeatIndex >= CASINO_RULES.BLACKJACK.seats)) {
        throw new DomainError('BLACKJACK_SPOT_INVALID', 'Tụ Blackjack không hợp lệ.')
      }
      if (seat) {
        if (requestedSeatIndex !== undefined && seat.seatIndex !== requestedSeatIndex) {
          throw new DomainError('BLACKJACK_SPOT_LOCKED', `Bạn đã vào tụ ${seat.seatIndex + 1} rồi.`, 409)
        }
      } else {
        const occupied = new Set([...table.seats.values()].filter((candidate) => candidate.stake > 0).map((candidate) => candidate.seatIndex))
        const targetSeatIndex = requestedSeatIndex ?? [0, 1, 2, 3].find((index) => !occupied.has(index))
        if (targetSeatIndex === undefined) throw new DomainError('BLACKJACK_TABLE_FULL', 'Bàn Blackjack đã đủ 4 tụ cược.', 409)
        if (occupied.has(targetSeatIndex)) throw new DomainError('BLACKJACK_SPOT_TAKEN', `Tụ ${targetSeatIndex + 1} đã có người cược.`, 409)
        seat = new CasinoSeat()
        seat.seatIndex = targetSeatIndex
        seat.userId = player.userId
        seat.displayName = player.name
        seat.status = 'BETTING'
        table.seats.set(client.sessionId, seat)
      }
    }
    if (!seat) {
      seat = new CasinoSeat()
      seat.userId = player.userId
      seat.displayName = player.name
      seat.status = 'BETTING'
      table.seats.set(client.sessionId, seat)
    }
    const maxBet = CASINO_RULES[table.mode].maxBet
    if (seat.stake + amount > maxBet) throw new DomainError('CASINO_LIMIT', `Giới hạn mỗi ván là ${maxBet.toLocaleString()} Coin.`, 409)
    const wagers = this.casinoWagers(seat)
    const wagerIndex = Object.values(wagers).reduce((sum, value) => sum + value, 0) + seat.stake + amount
    const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : `${choice}:${wagerIndex}`
    const reward = studioStore.placeCasinoWager(user.studioId, user.id, table.mode, table.roundId, safeActionId, amount, { choice, tableRound: table.roundNumber })
    this.sendSocialReward(client.sessionId, reward)
    if (reward.duplicate) return
    wagers[choice] = (wagers[choice] || 0) + amount
    seat.wagersJson = JSON.stringify(wagers)
    seat.stake += amount
    seat.net = -seat.stake
    seat.result = ''
    table.totalWagered += amount
    table.activePlayers = [...table.seats.values()].filter((candidate) => candidate.stake > 0).length
    const betLabel = table.mode === 'BLACKJACK' ? `tụ ${seat.seatIndex + 1}` : choice
    this.emitCasinoEvent('BET_ACCEPTED', table.mode, `${player.name} đặt ${amount} Coin vào ${betLabel}.`, client.sessionId, undefined, amount)
  }

  private sendCasinoError(client: Client, message: string) {
    client.send(Message.CASINO_ERROR, { message })
  }

  private emitCasinoEvent(type: string, mode: CasinoGameMode, message: string, sessionId?: string, outcome?: string, amount?: number, payout?: number) {
    const table = this.state.casinoTables.get(mode)
    const payload: CasinoEventPayload = { type, mode, roundId: table?.roundId || '', message, sessionId, outcome, amount, payout }
    this.broadcast(Message.CASINO_EVENT, payload)
  }

  private appendCasinoHistory(table: CasinoTableState, value: string) {
    const history = table.history ? table.history.split('|').filter(Boolean) : []
    history.unshift(value)
    table.history = history.slice(0, 12).join('|')
  }

  private settleCasinoSeat(table: CasinoTableState, sessionId: string, seat: CasinoSeat, payout: number, result: string, win: boolean) {
    const player = this.state.players.get(sessionId)
    const user = studioStore.getUserById(seat.userId)
    seat.payout = Math.max(0, Math.floor(payout))
    seat.net = seat.payout - seat.stake
    seat.result = result
    seat.status = 'SETTLED'
    seat.win = win
    if (!user) return
    const reward = studioStore.settleCasinoPayout(user.studioId, user.id, table.mode, table.roundId, 'final', seat.payout, { result, stake: seat.stake, net: seat.net })
    if (player) this.sendSocialReward(sessionId, reward)
    this.emitCasinoEvent(win ? 'PLAYER_WIN' : seat.net === 0 ? 'PLAYER_PUSH' : 'PLAYER_LOSS', table.mode, `${seat.displayName}: ${result} (${seat.net >= 0 ? '+' : ''}${seat.net} Coin)`, sessionId, table.outcome, undefined, seat.payout)
  }

  private handleCasinoTexasAction(client: Client, table: CasinoTableState, message: CasinoActionPayload) {
    const action = (message.action || '').toUpperCase()
    if (action === 'JOIN_TABLE') {
      this.joinTexasMultiplayerTable(client, table, message.tableId || message.choice || PVP_TABLE_CATALOG.POKER[0].id, message.actionId || '')
      return
    }
    if (action === 'START_TABLE') {
      this.startTexasMultiplayerTable(client, table, message.tableId || message.choice || undefined)
      return
    }
    if (action === 'LEAVE_TABLE') {
      this.cashOutTexasMultiplayer(client.sessionId, table)
      return
    }
    if (action === 'PLAY_BOT' || action === 'BET' || action === 'PLAY' || action === 'SIT_DOWN') {
      this.startCasinoTexasSession(client, table, Number(message.amount || TEXAS_BUY_IN), message.actionId || '')
      return
    }
    if (action === 'CASH_OUT') {
      const existing = table.seats.get(client.sessionId)
      if (existing?.pokerMode === 'MULTIPLAYER' || existing?.pokerMode === 'MULTIPLAYER_WAITING') this.cashOutTexasMultiplayer(client.sessionId, table)
      else this.cashOutCasinoTexas(client.sessionId, table)
      return
    }
    const seat = table.seats.get(client.sessionId)
    if (seat?.pokerMode === 'MULTIPLAYER') {
      this.handleTexasMultiplayerAction(client, table, message)
      return
    }
    const game = this.texasGames.get(client.sessionId)
    if (!seat || !game) throw new DomainError('TEXAS_SESSION_MISSING', 'Hãy ngồi vào bàn và mua 100 Coin chip trước.', 409)
    if (this.expireTexasTurnIfNeeded(client.sessionId, table, seat, game)) return
    if (action === 'NEXT_HAND') {
      if (!game.complete) throw new DomainError('TEXAS_HAND_ACTIVE', 'Ván hiện tại chưa kết thúc.', 409)
      const humanStack = game.players.find((candidate) => candidate.id === 'HUMAN')?.stack || 0
      if (humanStack <= 0) throw new DomainError('TEXAS_REBUY_REQUIRED', 'Bạn đã hết chip. Cash out rồi mua lại 100 Coin để chơi tiếp.', 409)
      seat.moveCount += 1
      const next = createTexasHoldemGame(`${seat.matchId}:hand-${seat.moveCount + 1}`, seat.displayName, (game.dealerSeat + 1) % 4, Math.random, humanStack)
      this.texasGames.set(client.sessionId, next)
      this.armTexasTurn(client.sessionId, table, seat, next)
      this.emitCasinoEvent('TEXAS_HAND_STARTED', 'POKER', `${seat.displayName} bắt đầu hand mới · button chuyển ghế.`, client.sessionId, next.street)
      return
    }
    if (!['CHECK', 'CALL', 'RAISE', 'ALL_IN', 'FOLD'].includes(action)) throw new DomainError('TEXAS_ACTION_INVALID', 'Action Texas Hold’em không hợp lệ.')
    const actionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(message.actionId || '') ? message.actionId! : `${game.handId}:${game.actionLog.length}:${action}`
    if (game.processedActionIds.includes(actionId)) return
    try {
      applyTexasAction(game, 'HUMAN', { action: action as 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'FOLD', amount: message.amount })
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_PLAYER_TURN') throw new DomainError('TEXAS_NOT_YOUR_TURN', 'Chưa tới lượt của bạn.', 409)
      if (code === 'RAISE_BELOW_MINIMUM') throw new DomainError('TEXAS_RAISE_SMALL', 'Mức raise chưa đạt tối thiểu.', 409)
      throw new DomainError('TEXAS_ACTION_REJECTED', 'Action không hợp lệ với trạng thái hand hiện tại.', 409)
    }
    game.processedActionIds.push(actionId)
    game.processedActionIds = game.processedActionIds.slice(-80)
    this.armTexasTurn(client.sessionId, table, seat, game)
    this.emitCasinoEvent(game.complete ? 'TEXAS_HAND_COMPLETE' : 'TEXAS_ACTION', 'POKER', game.complete ? game.result : `${seat.displayName}: ${action}`, client.sessionId, game.street)
  }

  private startCasinoTexasSession(client: Client, table: CasinoTableState, amount: number, actionId: string) {
    if (table.seats.has(client.sessionId)) throw new DomainError('TEXAS_SESSION_ACTIVE', 'Bạn đã ngồi ở bàn. Hãy Cash out trước khi mua lại.', 409)
    if (amount !== TEXAS_BUY_IN) throw new DomainError('TEXAS_BUY_IN_INVALID', `Mức buy-in cố định là ${TEXAS_BUY_IN} Coin.`)
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!player || !user) throw new DomainError('TEXAS_PLAYER_INVALID', 'Không tìm thấy người chơi.')
    table.roundNumber += 1
    const matchId = `texas-${client.sessionId}-${Date.now()}-${table.roundNumber}`
    const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : `BUY_IN:${table.roundNumber}`
    const reward = studioStore.placeCasinoWager(user.studioId, user.id, 'POKER', matchId, safeActionId, amount, { variant: 'NO_LIMIT_TEXAS', blinds: '5/10', opponents: 3 })
    this.sendSocialReward(client.sessionId, reward)
    if (reward.duplicate) return
    const seat = new CasinoSeat()
    seat.userId = player.userId
    seat.displayName = player.name
    seat.wagersJson = JSON.stringify({ BUY_IN: amount })
    seat.stake = amount
    seat.net = -amount
    seat.matchId = matchId
    seat.pokerMode = 'BOT'
    seat.moveCount = 0
    table.seats.set(client.sessionId, seat)
    const game = createTexasHoldemGame(`${matchId}:hand-1`, player.name)
    this.texasGames.set(client.sessionId, game)
    this.armTexasTurn(client.sessionId, table, seat, game)
    this.emitCasinoEvent('TEXAS_SESSION_STARTED', 'POKER', `${player.name} buy-in ${amount} Coin · ngồi cùng Nova, River và Ace.`, client.sessionId, game.street, amount)
  }

  private joinTexasMultiplayerTable(client: Client, table: CasinoTableState, tableId: string, actionId: string) {
    const config = PVP_TABLE_CATALOG.POKER.find((candidate) => candidate.id === tableId)
    if (!config) throw new DomainError('TEXAS_TABLE_INVALID', 'Bàn Poker không tồn tại hoặc đã đóng.', 409)
    if (this.texasGames.has(client.sessionId)) throw new DomainError('TEXAS_MODE_ACTIVE', 'Bạn đang chơi với bot. Hãy Cash out trước khi vào bàn người thật.', 409)
    const existing = table.seats.get(client.sessionId)
    if (existing) {
      if (existing.pokerMode === 'MULTIPLAYER_WAITING' && existing.pvpTableId === tableId) {
        this.syncTexasMultiplayerLobby(table, tableId)
        this.scheduleTexasMultiplayerStart(table, tableId)
        return
      }
      throw new DomainError('TEXAS_SESSION_ACTIVE', 'Bạn đã ở trong một bàn Poker khác.', 409)
    }
    if (this.texasMultiplayerGames.has(tableId)) throw new DomainError('TEXAS_TABLE_IN_HAND', 'Bàn đang chơi. Hãy chọn bàn khác hoặc chờ hand kết thúc.', 409)
    const waitingSeats = [...table.seats.values()].filter((seat) => seat.pokerMode === 'MULTIPLAYER_WAITING' && seat.pvpTableId === tableId)
    if (waitingSeats.length >= config.maxPlayers) throw new DomainError('TEXAS_TABLE_FULL', 'Bàn Poker đã đủ 4 người.', 409)
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!player || !user) throw new DomainError('TEXAS_PLAYER_INVALID', 'Không tìm thấy người chơi.')
    const firstSeat = waitingSeats[0]
    const matchId = firstSeat?.matchId || `texas-${tableId}-${Date.now()}-${table.roundNumber + 1}`
    if (!firstSeat) table.roundNumber += 1
    const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : `JOIN:${tableId}:${client.sessionId}:${Date.now()}`
    const reward = studioStore.placeCasinoWager(user.studioId, user.id, 'POKER', matchId, safeActionId, config.buyIn, { variant: 'NO_LIMIT_TEXAS_MULTIPLAYER', tableId, blinds: config.stakesLabel, opponents: Math.max(1, waitingSeats.length) })
    this.sendSocialReward(client.sessionId, reward)
    if (reward.duplicate) return
    const seat = new CasinoSeat()
    seat.userId = player.userId
    seat.displayName = player.name
    seat.wagersJson = JSON.stringify({ BUY_IN: config.buyIn })
    seat.status = 'WAITING'
    seat.stake = config.buyIn
    seat.net = -config.buyIn
    seat.matchId = matchId
    seat.pokerMode = 'MULTIPLAYER_WAITING'
    seat.pvpTableId = tableId
    table.seats.set(client.sessionId, seat)
    this.syncTexasMultiplayerLobby(table, tableId)
    this.scheduleTexasMultiplayerStart(table, tableId)
    this.emitCasinoEvent('TEXAS_TABLE_JOINED', 'POKER', `${player.name} vào ${config.name} · ${waitingSeats.length + 1}/${config.maxPlayers} ghế.`, client.sessionId, 'WAITING')
  }

  private startTexasMultiplayerTable(client: Client, table: CasinoTableState, requestedTableId?: string) {
    const playerSeat = table.seats.get(client.sessionId)
    const tableId = requestedTableId || playerSeat?.pvpTableId || PVP_TABLE_CATALOG.POKER[0].id
    this.startTexasMultiplayerTableForSession(table, tableId, client.sessionId)
  }

  private startTexasMultiplayerTableForSession(table: CasinoTableState, tableId: string, requesterSessionId: string) {
    this.clearTexasMultiplayerStart(tableId)
    const activeGame = this.texasMultiplayerGames.get(tableId)
    if (activeGame) throw new DomainError('TEXAS_TABLE_IN_HAND', 'Bàn đang có hand đang chơi.', 409)
    const waiting = [...table.seats.entries()].filter(([, seat]) => seat.pokerMode === 'MULTIPLAYER_WAITING' && seat.pvpTableId === tableId)
    if (!waiting.some(([sessionId]) => sessionId === requesterSessionId)) throw new DomainError('TEXAS_NOT_SEATED', 'Bạn chưa ngồi vào bàn chờ.')
    const hostSessionId = this.texasMultiplayerHostSessionIds.get(tableId) || waiting[0]?.[0] || ''
    if (hostSessionId && hostSessionId !== requesterSessionId) throw new DomainError('TEXAS_NOT_HOST', 'Chỉ chủ bàn mới có thể bắt đầu.')
    if (waiting.length < 2) throw new DomainError('TEXAS_NEEDS_PLAYERS', 'Cần ít nhất 2 người để bắt đầu Poker.')
    const definitions = waiting.map(([sessionId, seat]) => ({ id: sessionId, name: seat.displayName, isBot: false, stack: TEXAS_BUY_IN }))
    const matchId = waiting[0][1].matchId
    const game = createTexasHoldemGameFromPlayers(`${matchId}:hand-1`, definitions, 0, Math.random, 'MULTIPLAYER')
    this.texasMultiplayerGames.set(tableId, game)
    this.texasMultiplayerHostSessionIds.set(tableId, requesterSessionId)
    waiting.forEach(([, seat]) => {
      seat.pokerMode = 'MULTIPLAYER'
      seat.status = 'PLAYING'
      seat.moveCount = 0
      seat.pokerStateJson = ''
    })
    this.syncTexasMultiplayerGame(table, game, tableId)
    this.armTexasMultiplayerTurn(table, game, tableId)
    this.emitCasinoEvent('TEXAS_TABLE_STARTED', 'POKER', `Bàn ${tableId} bắt đầu · ${waiting.length} người chơi thật · blind 5/10.`, requesterSessionId, game.street)
  }

  private handleTexasMultiplayerAction(client: Client, table: CasinoTableState, message: CasinoActionPayload) {
    const seat = table.seats.get(client.sessionId)
    const tableId = seat?.pvpTableId || message.tableId || message.choice || PVP_TABLE_CATALOG.POKER[0].id
    const game = this.texasMultiplayerGames.get(tableId)
    if (!game || !seat || seat.pokerMode !== 'MULTIPLAYER') throw new DomainError('TEXAS_SESSION_MISSING', 'Bàn Poker chưa bắt đầu hand.', 409)
    if (this.expireTexasMultiplayerTurnIfNeeded(table, game, tableId)) return
    const action = (message.action || '').toUpperCase()
    if (action === 'NEXT_HAND') throw new DomainError('TEXAS_MULTIPLAYER_NEXT_HAND', 'Bàn người thật sẽ mở hand mới sau khi mọi người Cash out.', 409)
    if (!['CHECK', 'CALL', 'RAISE', 'ALL_IN', 'FOLD'].includes(action)) throw new DomainError('TEXAS_ACTION_INVALID', 'Action Texas Hold’em không hợp lệ.')
    const actionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(message.actionId || '') ? message.actionId! : `${game.handId}:${client.sessionId}:${game.actionLog.length}:${action}`
    if (game.processedActionIds.includes(actionId)) return
    try {
      applyTexasAction(game, client.sessionId, { action: action as 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'FOLD', amount: message.amount })
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_PLAYER_TURN') throw new DomainError('TEXAS_NOT_YOUR_TURN', 'Chưa tới lượt của bạn.', 409)
      if (code === 'RAISE_BELOW_MINIMUM') throw new DomainError('TEXAS_RAISE_SMALL', 'Mức raise chưa đạt tối thiểu.', 409)
      throw new DomainError('TEXAS_ACTION_REJECTED', 'Action không hợp lệ với trạng thái hand hiện tại.', 409)
    }
    game.processedActionIds.push(actionId)
    game.processedActionIds = game.processedActionIds.slice(-120)
    this.armTexasMultiplayerTurn(table, game, tableId)
    this.emitCasinoEvent(game.complete ? 'TEXAS_HAND_COMPLETE' : 'TEXAS_ACTION', 'POKER', game.complete ? game.result : `${seat.displayName}: ${action}`, client.sessionId, game.street)
  }

  private syncPvpLobby(table: CasinoTableState) {
    const mode = table.mode === 'POKER' ? 'POKER' : table.mode === 'TIEN_LEN' ? 'TIEN_LEN' : undefined
    if (!mode) return
    const snapshots: PvpTableSnapshot[] = PVP_TABLE_CATALOG[mode].map((config) => {
      if (mode === 'POKER') {
        const seats = [...table.seats.values()].filter((seat) => ['MULTIPLAYER', 'MULTIPLAYER_WAITING'].includes(seat.pokerMode) && seat.pvpTableId === config.id)
        const game = this.texasMultiplayerGames.get(config.id)
        const count = game?.players.length || seats.length
        const waiting = seats.find((seat) => seat.pokerMode === 'MULTIPLAYER_WAITING')
        return { ...config, playerCount: count, status: game ? 'RUNNING' : count >= config.maxPlayers ? 'FULL' : count ? 'WAITING' : 'OPEN', pot: game?.pot || 0, roundId: game?.handId || waiting?.matchId || '', hostName: waiting?.displayName } as PvpTableSnapshot
      }
      const lobby = this.tienLenLobbies.get(config.id)
      const players = lobby?.players || []
      const count = players.length
      return { ...config, playerCount: count, status: lobby?.status === 'PLAYING' ? 'RUNNING' : count >= config.maxPlayers ? 'FULL' : count ? 'WAITING' : 'OPEN', pot: config.buyIn * count, roundId: lobby?.gameId || '', hostName: lobby?.players[0]?.name } as PvpTableSnapshot
    })
    table.pvpLobbyJson = JSON.stringify(snapshots)
  }

  private syncTexasMultiplayerLobby(table: CasinoTableState, tableId = PVP_TABLE_CATALOG.POKER[0].id) {
    const seats = [...table.seats.values()].filter((seat) => seat.pokerMode === 'MULTIPLAYER_WAITING' && seat.pvpTableId === tableId)
    const host = seats[0]
    const hostSessionId = host ? [...table.seats.entries()].find(([, seat]) => seat === host)?.[0] || '' : ''
    if (hostSessionId) this.texasMultiplayerHostSessionIds.set(tableId, hostSessionId)
    else this.texasMultiplayerHostSessionIds.delete(tableId)
    table.phase = 'PLAYER_TURN'
    table.phaseStartedAt = Date.now()
    const startAt = seats.length >= 2 ? this.texasMultiplayerStartAt.get(tableId) || 0 : 0
    table.phaseEndsAt = startAt
    table.statusText = startAt
      ? `BÀN ${tableId.toUpperCase()} · TỰ ĐỘNG BẮT ĐẦU SAU 5S · ${seats.length}/${CASINO_RULES.POKER.seats} GHẾ`
      : `BÀN ${tableId.toUpperCase()} · CHỜ NGƯỜI · ${seats.length}/${CASINO_RULES.POKER.seats} GHẾ`
    table.activePlayers = seats.length
    table.totalWagered = seats.reduce((total, seat) => total + seat.stake, 0)
    table.outcome = 'WAITING'
    table.resultDetail = host ? `Chủ bàn: ${host.displayName}` : 'Chưa có người chơi'
    table.roundId = host?.matchId || table.roundId
    this.syncPvpLobby(table)
  }

  private scheduleTexasMultiplayerStart(table: CasinoTableState, tableId: string) {
    const waiting = [...table.seats.values()].filter((seat) => seat.pokerMode === 'MULTIPLAYER_WAITING' && seat.pvpTableId === tableId)
    if (this.texasMultiplayerGames.has(tableId)) return
    if (waiting.length < 2) {
      this.clearTexasMultiplayerStart(tableId)
      this.syncTexasMultiplayerLobby(table, tableId)
      return
    }
    if (this.texasMultiplayerStartTimers.has(tableId)) {
      this.syncTexasMultiplayerLobby(table, tableId)
      return
    }
    const startAt = Date.now() + TEXAS_MULTIPLAYER_START_DELAY_MS
    this.texasMultiplayerStartAt.set(tableId, startAt)
    this.syncTexasMultiplayerLobby(table, tableId)
    const timer = setTimeout(() => {
      this.texasMultiplayerStartTimers.delete(tableId)
      this.texasMultiplayerStartAt.delete(tableId)
      const currentWaiting = [...table.seats.entries()].filter(([, seat]) => seat.pokerMode === 'MULTIPLAYER_WAITING' && seat.pvpTableId === tableId)
      if (this.texasMultiplayerGames.has(tableId) || currentWaiting.length < 2) {
        this.syncTexasMultiplayerLobby(table, tableId)
        return
      }
      const hostSessionId = this.texasMultiplayerHostSessionIds.get(tableId) || currentWaiting[0]?.[0]
      if (!hostSessionId) {
        this.syncTexasMultiplayerLobby(table, tableId)
        return
      }
      try {
        this.startTexasMultiplayerTableForSession(table, tableId, hostSessionId)
      } catch (error) {
        this.syncTexasMultiplayerLobby(table, tableId)
        console.warn('Unable to auto-start Texas table', error)
      }
    }, TEXAS_MULTIPLAYER_START_DELAY_MS)
    this.texasMultiplayerStartTimers.set(tableId, timer)
  }

  private syncTexasMultiplayerGame(table: CasinoTableState, game: TexasHoldemState, tableId = PVP_TABLE_CATALOG.POKER[0].id) {
    const publicState = publicTexasState(game, '')
    table.phase = 'PLAYER_TURN'
    table.phaseStartedAt = game.turnStartedAt || Date.now()
    table.phaseEndsAt = game.turnEndsAt
    table.roundId = game.handId
    table.activePlayers = [...table.seats.values()].filter((seat) => seat.pokerMode === 'MULTIPLAYER' && seat.pvpTableId === tableId).length
    table.totalWagered = [...table.seats.values()].filter((seat) => seat.pokerMode === 'MULTIPLAYER' && seat.pvpTableId === tableId).reduce((total, seat) => total + seat.stake, 0)
    table.outcome = game.complete ? game.result : game.street
    table.resultDetail = game.complete ? game.result : `${game.players.find((player) => player.seat === game.actingSeat)?.name || '—'} · ${game.street} · pot ${game.pot}`
    table.history = game.actionLog.slice(0, 12).join('|')
    table.statusText = game.complete ? `KẾT THÚC HAND · ${game.result}` : `NO-LIMIT TEXAS HOLD’EM · ${tableId} · 5/10`
    game.players.forEach((player) => {
      const seat = table.seats.get(player.id)
      if (!seat) return
      seat.pokerStateJson = JSON.stringify(publicState)
      seat.cards = ''
      seat.status = game.complete ? (game.winners.includes(player.id) ? 'WIN' : player.folded ? 'FOLDED' : 'LOSS') : player.seat === game.actingSeat ? 'YOUR_TURN' : 'PLAYING'
      seat.result = game.complete ? game.result : player.lastAction || 'Đang chơi'
      seat.payout = player.stack
      seat.net = player.stack - seat.stake
      seat.folded = player.folded
      seat.acted = player.acted
      seat.win = game.winners.includes(player.id)
      seat.turn = player.seat === game.actingSeat ? 'HUMAN' : game.complete ? 'RESULT' : 'WAITING'
      const target = this.clients.find((candidate) => candidate.sessionId === player.id)
      if (target) target.send(Message.TEXAS_PRIVATE_STATE, publicTexasState(game, player.id))
    })
    this.syncPvpLobby(table)
  }

  private expireTexasMultiplayerTurnIfNeeded(table: CasinoTableState, game: TexasHoldemState, tableId: string) {
    if (game.complete || !game.turnEndsAt || Date.now() < game.turnEndsAt) return false
    this.resolveTexasMultiplayerTurn(table, game, tableId)
    return true
  }

  private armTexasMultiplayerTurn(table: CasinoTableState, game: TexasHoldemState, tableId = PVP_TABLE_CATALOG.POKER[0].id) {
    this.clearTexasTurnTimer(tableId)
    if (game.complete) {
      game.turnStatus = 'COMPLETE'
      game.turnStartedAt = 0
      game.turnEndsAt = 0
      game.turnTimeLimitMs = 0
      game.botThinkingUntil = 0
      this.syncTexasMultiplayerGame(table, game, tableId)
      this.scheduleTexasMultiplayerNextHand(table, game, tableId)
      return
    }
    const acting = game.players.find((player) => player.seat === game.actingSeat)
    if (!acting) {
      game.turnStatus = 'WAITING'
      game.turnStartedAt = 0
      game.turnEndsAt = 0
      game.turnTimeLimitMs = 0
      game.botThinkingUntil = 0
      this.syncTexasMultiplayerGame(table, game, tableId)
      return
    }
    const now = Date.now()
    game.turnStatus = 'HUMAN_TURN'
    game.turnStartedAt = now
    game.turnEndsAt = now + TEXAS_HUMAN_TURN_MS
    game.turnTimeLimitMs = TEXAS_HUMAN_TURN_MS
    game.botThinkingUntil = 0
    this.syncTexasMultiplayerGame(table, game, tableId)
    this.texasTurnTimers.set(tableId, setTimeout(() => this.resolveTexasMultiplayerTurn(table, game, tableId), TEXAS_HUMAN_TURN_MS))
  }

  private scheduleTexasMultiplayerNextHand(table: CasinoTableState, game: TexasHoldemState, tableId: string) {
    if (!game.complete || this.texasMultiplayerGames.get(tableId) !== game) return
    const continuing = game.players.filter((player) => player.stack > 0 && table.seats.get(player.id)?.pokerMode === 'MULTIPLAYER')
    if (continuing.length < 2) {
      this.clearTexasMultiplayerNextHand(tableId)
      table.phaseEndsAt = 0
      table.statusText = 'HAND KẾT THÚC · CẦN ÍT NHẤT 2 NGƯỜI CÒN CHIP'
      table.resultDetail = `${game.result} · Cash out hoặc chờ người chơi đủ điều kiện.`
      return
    }
    if (this.texasMultiplayerNextHandTimers.has(tableId)) {
      table.phaseEndsAt = this.texasMultiplayerNextHandAt.get(tableId) || 0
      return
    }
    const nextHandAt = Date.now() + TEXAS_MULTIPLAYER_NEXT_HAND_DELAY_MS
    this.texasMultiplayerNextHandAt.set(tableId, nextHandAt)
    table.phaseEndsAt = nextHandAt
    table.statusText = 'KẾT QUẢ HAND · HAND MỚI TỰ ĐỘNG SAU 5S'
    table.resultDetail = `${game.result} · Giữ nguyên stack, dealer chuyển ghế.`
    const timer = setTimeout(() => {
      this.texasMultiplayerNextHandTimers.delete(tableId)
      this.texasMultiplayerNextHandAt.delete(tableId)
      if (this.texasMultiplayerGames.get(tableId) !== game || !game.complete) return
      const fundedPlayers = game.players
        .filter((player) => player.stack > 0 && table.seats.get(player.id)?.pokerMode === 'MULTIPLAYER')
        .sort((left, right) => left.seat - right.seat)
      if (fundedPlayers.length < 2) {
        this.syncTexasMultiplayerGame(table, game, tableId)
        table.phaseEndsAt = 0
        table.statusText = 'HAND KẾT THÚC · CẦN ÍT NHẤT 2 NGƯỜI CÒN CHIP'
        return
      }
      game.players
        .filter((player) => player.stack <= 0 && table.seats.get(player.id)?.pokerMode === 'MULTIPLAYER')
        .forEach((player) => this.cashOutTexasMultiplayer(player.id, table))
      const handNumber = Number(game.handId.match(/:hand-(\d+)$/)?.[1] || 1) + 1
      const previousDealerIndex = game.players.findIndex((player) => player.seat === game.dealerSeat)
      const nextDealer = [...game.players.slice(previousDealerIndex + 1), ...game.players.slice(0, previousDealerIndex + 1)]
        .find((player) => fundedPlayers.some((candidate) => candidate.id === player.id))
      const dealerSeat = Math.max(0, fundedPlayers.findIndex((player) => player.id === nextDealer?.id))
      const definitions = fundedPlayers.map((player) => ({ id: player.id, name: player.name, isBot: false, stack: player.stack }))
      const matchId = table.seats.get(fundedPlayers[0].id)?.matchId || game.handId.replace(/:hand-\d+$/, '')
      const nextGame = createTexasHoldemGameFromPlayers(`${matchId}:hand-${handNumber}`, definitions, dealerSeat, Math.random, 'MULTIPLAYER')
      this.texasMultiplayerGames.set(tableId, nextGame)
      fundedPlayers.forEach((player) => {
        const seat = table.seats.get(player.id)
        if (!seat) return
        seat.status = 'PLAYING'
        seat.moveCount = handNumber - 1
        seat.pokerStateJson = ''
      })
      this.armTexasMultiplayerTurn(table, nextGame, tableId)
      this.emitCasinoEvent('TEXAS_HAND_STARTED', 'POKER', `Hand ${handNumber} tự động bắt đầu · dealer đã chuyển ghế.`, fundedPlayers[0].id, nextGame.street)
    }, TEXAS_MULTIPLAYER_NEXT_HAND_DELAY_MS)
    this.texasMultiplayerNextHandTimers.set(tableId, timer)
  }

  private resolveTexasMultiplayerTurn(table: CasinoTableState, game: TexasHoldemState, tableId = PVP_TABLE_CATALOG.POKER[0].id) {
    if (this.texasMultiplayerGames.get(tableId) !== game) return
    this.clearTexasTurnTimer(tableId)
    if (game.complete || game.turnEndsAt > Date.now()) {
      this.armTexasMultiplayerTurn(table, game, tableId)
      return
    }
    const acting = game.players.find((player) => player.seat === game.actingSeat)
    if (acting) {
      try {
        foldTexasPlayer(game, acting.id)
        this.emitCasinoEvent('TEXAS_AUTO_FOLD', 'POKER', `${acting.name} hết giờ · tự động Fold.`, acting.id, game.street)
      } catch (_error) {
        // A street/all-in transition may invalidate the stale timer callback.
      }
    }
    this.armTexasMultiplayerTurn(table, game, tableId)
  }

  private cashOutTexasMultiplayer(sessionId: string, table: CasinoTableState, leaving = false) {
    const seat = table.seats.get(sessionId)
    if (!seat || !['MULTIPLAYER', 'MULTIPLAYER_WAITING'].includes(seat.pokerMode)) return
    const tableId = seat.pvpTableId || PVP_TABLE_CATALOG.POKER[0].id
    const game = this.texasMultiplayerGames.get(tableId)
    if (seat.pokerMode === 'MULTIPLAYER' && game && !game.complete) {
      foldTexasPlayer(game, sessionId)
      this.armTexasMultiplayerTurn(table, game, tableId)
    }
    const playerState = game?.players.find((player) => player.id === sessionId)
    const payout = playerState?.stack ?? seat.stake
    const user = studioStore.getUserById(seat.userId)
    if (user) {
      const reward = studioStore.settleCasinoPayout(user.studioId, user.id, 'POKER', seat.matchId, 'cashout', payout, { variant: 'NO_LIMIT_TEXAS_MULTIPLAYER', tableId, buyIn: seat.stake, cashOut: payout, abandoned: leaving })
      if (!leaving && this.state.players.has(sessionId)) this.sendSocialReward(sessionId, reward)
    }
    this.appendCasinoHistory(table, payout > seat.stake ? 'W' : payout === seat.stake ? 'P' : 'L')
    this.emitCasinoEvent('TEXAS_CASH_OUT', 'POKER', `${seat.displayName} cash out ${payout} Coin (${payout - seat.stake >= 0 ? '+' : ''}${payout - seat.stake}).`, sessionId, 'CASH_OUT', undefined, payout)
    table.seats.delete(sessionId)
    if (this.texasMultiplayerHostSessionIds.get(tableId) === sessionId) this.texasMultiplayerHostSessionIds.delete(tableId)
    const remaining = [...table.seats.values()].some((candidate) => ['MULTIPLAYER', 'MULTIPLAYER_WAITING'].includes(candidate.pokerMode) && candidate.pvpTableId === tableId)
    if (game && !game.complete && remaining) {
      this.syncTexasMultiplayerGame(table, game, tableId)
      this.armTexasMultiplayerTurn(table, game, tableId)
    } else if (!game || !remaining) {
      this.clearTexasTurnTimer(tableId)
      this.clearTexasMultiplayerNextHand(tableId)
      this.texasMultiplayerGames.delete(tableId)
      this.texasMultiplayerHostSessionIds.delete(tableId)
      this.syncTexasMultiplayerLobby(table, tableId)
    } else {
      this.syncTexasMultiplayerGame(table, game, tableId)
      this.clearTexasMultiplayerNextHand(tableId)
      this.scheduleTexasMultiplayerNextHand(table, game, tableId)
    }
    this.scheduleTexasMultiplayerStart(table, tableId)
    this.syncPvpLobby(table)
  }

  private clearTexasTurnTimer(sessionId: string) {
    const timer = this.texasTurnTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.texasTurnTimers.delete(sessionId)
  }

  private clearTexasTurnTimers() {
    this.texasTurnTimers.forEach((timer) => clearTimeout(timer))
    this.texasTurnTimers.clear()
  }

  private clearTexasMultiplayerStart(tableId: string) {
    const timer = this.texasMultiplayerStartTimers.get(tableId)
    if (timer) clearTimeout(timer)
    this.texasMultiplayerStartTimers.delete(tableId)
    this.texasMultiplayerStartAt.delete(tableId)
  }

  private clearTexasMultiplayerStartTimers() {
    this.texasMultiplayerStartTimers.forEach((timer) => clearTimeout(timer))
    this.texasMultiplayerStartTimers.clear()
    this.texasMultiplayerStartAt.clear()
  }

  private clearTexasMultiplayerNextHand(tableId: string) {
    const timer = this.texasMultiplayerNextHandTimers.get(tableId)
    if (timer) clearTimeout(timer)
    this.texasMultiplayerNextHandTimers.delete(tableId)
    this.texasMultiplayerNextHandAt.delete(tableId)
  }

  private clearTexasMultiplayerNextHandTimers() {
    this.texasMultiplayerNextHandTimers.forEach((timer) => clearTimeout(timer))
    this.texasMultiplayerNextHandTimers.clear()
    this.texasMultiplayerNextHandAt.clear()
  }

  private expireTexasTurnIfNeeded(sessionId: string, table: CasinoTableState, seat: CasinoSeat, game: TexasHoldemState) {
    if (game.complete || !game.turnEndsAt || Date.now() < game.turnEndsAt) return false
    this.resolveTexasTurn(sessionId, table, seat, game)
    return true
  }

  private armTexasTurn(sessionId: string, table: CasinoTableState, seat: CasinoSeat, game: TexasHoldemState) {
    this.clearTexasTurnTimer(sessionId)
    if (game.complete) {
      game.turnStatus = 'COMPLETE'
      game.turnStartedAt = 0
      game.turnEndsAt = 0
      game.turnTimeLimitMs = 0
      game.botThinkingUntil = 0
      this.syncCasinoTexasSeat(sessionId, table, seat, game)
      return
    }
    const acting = game.players.find((player) => player.seat === game.actingSeat)
    if (!acting) {
      game.turnStatus = 'WAITING'
      game.turnStartedAt = 0
      game.turnEndsAt = 0
      game.turnTimeLimitMs = 0
      game.botThinkingUntil = 0
      this.syncCasinoTexasSeat(sessionId, table, seat, game)
      return
    }
    const now = Date.now()
    const duration = acting.isBot
      ? TEXAS_BOT_THINK_MIN_MS + Math.floor(Math.random() * (TEXAS_BOT_THINK_MAX_MS - TEXAS_BOT_THINK_MIN_MS + 1))
      : TEXAS_HUMAN_TURN_MS
    game.turnStatus = acting.isBot ? 'BOT_THINKING' : 'HUMAN_TURN'
    game.turnStartedAt = now
    game.turnEndsAt = now + duration
    game.turnTimeLimitMs = duration
    game.botThinkingUntil = acting.isBot ? game.turnEndsAt : 0
    this.syncCasinoTexasSeat(sessionId, table, seat, game)
    const timer = setTimeout(() => this.resolveTexasTurn(sessionId, table, seat, game), duration)
    this.texasTurnTimers.set(sessionId, timer)
  }

  private resolveTexasTurn(sessionId: string, table: CasinoTableState, seat: CasinoSeat, game: TexasHoldemState) {
    if (this.texasGames.get(sessionId) !== game || table.seats.get(sessionId) !== seat) return
    this.clearTexasTurnTimer(sessionId)
    if (game.complete) {
      this.armTexasTurn(sessionId, table, seat, game)
      return
    }
    if (game.turnEndsAt > Date.now()) {
      this.armTexasTurn(sessionId, table, seat, game)
      return
    }
    const acting = game.players.find((player) => player.seat === game.actingSeat)
    if (!acting) {
      this.armTexasTurn(sessionId, table, seat, game)
      return
    }
    try {
      if (acting.isBot) {
        runTexasBots(game, Math.random, 1)
        this.emitCasinoEvent('TEXAS_BOT_ACTION', 'POKER', `${acting.name} đã suy nghĩ xong · ${game.actionLog[0] || 'đã hành động'}`, sessionId, game.street)
      } else {
        applyTexasAction(game, 'HUMAN', { action: 'FOLD' })
        this.emitCasinoEvent('TEXAS_AUTO_FOLD', 'POKER', `${acting.name} hết giờ · tự động Fold.`, sessionId, game.street)
      }
    } catch (_error) {
      // The game state can only change here through the room's own timer. If a
      // hand has already settled, the next sync below is still authoritative.
    }
    if (this.texasGames.get(sessionId) === game && table.seats.get(sessionId) === seat) this.armTexasTurn(sessionId, table, seat, game)
  }

  private syncCasinoTexasSeat(sessionId: string, table: CasinoTableState, seat: CasinoSeat, game: TexasHoldemState) {
    const human = game.players.find((candidate) => candidate.id === 'HUMAN')!
    seat.pokerStateJson = JSON.stringify(publicTexasState(game))
    seat.cards = human.cards.join(',')
    seat.status = game.complete ? (game.winners.includes('HUMAN') ? 'WIN' : human.folded ? 'FOLDED' : 'LOSS') : human.seat === game.actingSeat ? 'YOUR_TURN' : 'BOT_TURN'
    seat.result = game.complete ? game.result : human.lastAction || 'Đang chơi'
    seat.payout = human.stack
    seat.net = human.stack - seat.stake
    seat.folded = human.folded
    seat.acted = game.complete
    seat.win = game.winners.includes('HUMAN')
    seat.turn = human.seat === game.actingSeat ? 'HUMAN' : game.complete ? 'RESULT' : 'BOT'
    table.activePlayers = table.seats.size
    table.totalWagered = [...table.seats.values()].reduce((total, candidate) => total + candidate.stake, 0)
    table.outcome = game.complete ? game.result : game.street
    table.resultDetail = game.complete ? game.result : `${seat.displayName} · ${game.street} · pot ${game.pot}`
    table.history = game.actionLog.slice(0, 12).join('|')
    table.statusText = 'NO-LIMIT TEXAS HOLD’EM · 5/10 · 3 BOT'
    table.roundId = game.handId
  }

  private cashOutCasinoTexas(sessionId: string, table: CasinoTableState, leaving = false) {
    const seat = table.seats.get(sessionId)
    const game = this.texasGames.get(sessionId)
    if (!seat || !game) return
    this.clearTexasTurnTimer(sessionId)
    if (!game.complete) foldTexasHumanAndRunOut(game)
    const humanStack = game.players.find((candidate) => candidate.id === 'HUMAN')?.stack || 0
    const user = studioStore.getUserById(seat.userId)
    if (user) {
      const reward = studioStore.settleCasinoPayout(user.studioId, user.id, 'POKER', seat.matchId, 'cashout', humanStack, { variant: 'NO_LIMIT_TEXAS', hands: seat.moveCount + 1, buyIn: seat.stake, cashOut: humanStack, abandoned: leaving })
      if (!leaving && this.state.players.has(sessionId)) this.sendSocialReward(sessionId, reward)
    }
    this.appendCasinoHistory(table, humanStack > seat.stake ? 'W' : humanStack === seat.stake ? 'P' : 'L')
    this.emitCasinoEvent('TEXAS_CASH_OUT', 'POKER', `${seat.displayName} cash out ${humanStack} Coin (${humanStack - seat.stake >= 0 ? '+' : ''}${humanStack - seat.stake}).`, sessionId, 'CASH_OUT', undefined, humanStack)
    this.texasGames.delete(sessionId)
    table.seats.delete(sessionId)
    table.activePlayers = table.seats.size
    table.totalWagered = [...table.seats.values()].reduce((total, candidate) => total + candidate.stake, 0)
  }

  private handleCasinoChessAction(client: Client, table: CasinoTableState, message: CasinoActionPayload) {
    if (message.action === 'BET' || message.action === 'PLAY') {
      this.startCasinoChessMatch(client, table, Number(message.amount), message.actionId || '')
      return
    }
    if (message.action === 'MOVE') {
      this.handleCasinoChessMove(client, table, message.move || '', message.promotion || 'q')
      return
    }
    throw new DomainError('CHESS_ACTION_INVALID', 'Action cờ vua không hợp lệ.')
  }

  private startCasinoChessMatch(client: Client, table: CasinoTableState, amount: number, actionId: string) {
    const existing = table.seats.get(client.sessionId)
    if (existing && ['PLAYING', 'CHECK'].includes(existing.status)) throw new DomainError('CHESS_MATCH_ACTIVE', 'Bạn đang có một ván cờ chưa kết thúc.', 409)
    if (amount !== CASINO_RULES.CHESS.minBet) throw new DomainError('CHESS_BET_INVALID', `Mỗi ván cờ có phí vào bàn ${CASINO_RULES.CHESS.minBet} Coin.`)
    const player = this.state.players.get(client.sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!player || !user) throw new DomainError('CHESS_PLAYER_INVALID', 'Không tìm thấy người chơi.')
    table.roundNumber += 1
    const matchId = `chess-${client.sessionId}-${Date.now()}-${table.roundNumber}`
    const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : `PLAY:${table.roundNumber}`
    const reward = studioStore.placeCasinoWager(user.studioId, user.id, 'CHESS', matchId, safeActionId, amount, { opponent: 'DEALER_AI', color: 'WHITE' })
    this.sendSocialReward(client.sessionId, reward)
    if (reward.duplicate) return

    const chess = new Chess()
    const seat = existing || new CasinoSeat()
    seat.userId = player.userId
    seat.displayName = player.name
    seat.wagersJson = JSON.stringify({ MAIN: amount })
    seat.cards = ''
    seat.status = 'PLAYING'
    seat.result = 'Bạn cầm quân Trắng · tới lượt bạn'
    seat.stake = amount
    seat.payout = 0
    seat.net = -amount
    seat.acted = false
    seat.win = false
    seat.board = chess.fen()
    seat.lastMove = ''
    seat.turn = 'WHITE'
    seat.moveCount = 0
    seat.matchId = matchId
    table.seats.set(client.sessionId, seat)
    this.recalculateCasinoChessStats(table)
    table.outcome = ''
    table.resultDetail = `${player.name} bắt đầu ván mới với Dealer AI.`
    this.emitCasinoEvent('CHESS_MATCH_STARTED', 'CHESS', `${player.name} cầm quân Trắng. Dealer AI cầm quân Đen.`, client.sessionId, 'WHITE', amount)
  }

  private handleCasinoChessMove(client: Client, table: CasinoTableState, moveText: string, promotionText: string) {
    const seat = table.seats.get(client.sessionId)
    if (!seat || !['PLAYING', 'CHECK'].includes(seat.status) || !seat.board) throw new DomainError('CHESS_MATCH_MISSING', 'Hãy bắt đầu một ván mới trước khi đi quân.', 409)
    if (seat.turn !== 'WHITE') throw new DomainError('CHESS_NOT_YOUR_TURN', 'Dealer AI đang suy nghĩ.', 409)
    const normalizedMove = moveText.trim().toLowerCase()
    if (!/^[a-h][1-8][a-h][1-8]$/.test(normalizedMove)) throw new DomainError('CHESS_MOVE_INVALID', 'Nước đi không hợp lệ.')
    const promotion = /^[qrbn]$/i.test(promotionText) ? promotionText.toLowerCase() : 'q'
    const chess = new Chess(seat.board)
    let playerMove: Move
    try {
      playerMove = chess.move({ from: normalizedMove.slice(0, 2), to: normalizedMove.slice(2, 4), promotion })
    } catch (_error) {
      throw new DomainError('CHESS_MOVE_ILLEGAL', 'Nước đi này không hợp lệ theo luật cờ vua.', 409)
    }
    seat.lastMove = `${playerMove.from}${playerMove.to}${playerMove.promotion || ''}`
    seat.moveCount += 1
    seat.board = chess.fen()
    seat.turn = 'BLACK'
    if (chess.isGameOver()) {
      this.settleCasinoChessMatch(client.sessionId, table, seat, chess, 'PLAYER')
      return
    }

    const dealerMove = this.chooseCasinoChessMove(chess)
    if (!dealerMove) {
      this.settleCasinoChessMatch(client.sessionId, table, seat, chess, 'PLAYER')
      return
    }
    chess.move({ from: dealerMove.from, to: dealerMove.to, promotion: dealerMove.promotion || 'q' })
    seat.lastMove = `${dealerMove.from}${dealerMove.to}${dealerMove.promotion || ''}`
    seat.moveCount += 1
    seat.board = chess.fen()
    seat.turn = 'WHITE'
    seat.status = chess.isCheck() ? 'CHECK' : 'PLAYING'
    seat.result = chess.isCheck() ? `Dealer ${dealerMove.san} · Vua Trắng đang bị chiếu` : `Dealer đi ${dealerMove.san} · tới lượt bạn`
    if (chess.isGameOver()) this.settleCasinoChessMatch(client.sessionId, table, seat, chess, 'DEALER')
    else this.emitCasinoEvent('CHESS_MOVE', 'CHESS', `Dealer AI đáp ${dealerMove.san}.`, client.sessionId, seat.status)
  }

  private chooseCasinoChessMove(chess: Chess): Move | undefined {
    const moves = chess.moves({ verbose: true })
    if (!moves.length) return undefined
    const pieceValue: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 }
    const materialScore = (position: Chess) => position.board().flat().reduce((score, piece) => {
      if (!piece) return score
      return score + (piece.color === 'b' ? 1 : -1) * pieceValue[piece.type]
    }, 0)
    let bestScore = Number.NEGATIVE_INFINITY
    let bestMoves: Move[] = []
    moves.forEach((candidate) => {
      const next = new Chess(chess.fen())
      next.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion || 'q' })
      let score = materialScore(next)
      if (next.isCheckmate()) score += 1_000_000
      else if (next.isCheck()) score += 35
      if (['d4', 'e4', 'd5', 'e5'].includes(candidate.to)) score += 12
      if (!next.isGameOver()) {
        const replies = next.moves({ verbose: true })
        let worstReply = Number.POSITIVE_INFINITY
        replies.forEach((reply) => {
          const replyPosition = new Chess(next.fen())
          replyPosition.move({ from: reply.from, to: reply.to, promotion: reply.promotion || 'q' })
          const replyScore = replyPosition.isCheckmate() ? -1_000_000 : materialScore(replyPosition)
          worstReply = Math.min(worstReply, replyScore)
        })
        if (Number.isFinite(worstReply)) score = score * 0.35 + worstReply * 0.65
      }
      if (score > bestScore) {
        bestScore = score
        bestMoves = [candidate]
      } else if (score === bestScore) bestMoves.push(candidate)
    })
    return bestMoves[Math.floor(Math.random() * bestMoves.length)]
  }

  private settleCasinoChessMatch(sessionId: string, table: CasinoTableState, seat: CasinoSeat, chess: Chess, lastActor: 'PLAYER' | 'DEALER') {
    const user = studioStore.getUserById(seat.userId)
    const checkmate = chess.isCheckmate()
    const playerWon = checkmate && lastActor === 'PLAYER'
    const dealerWon = checkmate && lastActor === 'DEALER'
    const payout = playerWon ? CASINO_RULES.CHESS.winPayout : dealerWon ? 0 : CASINO_RULES.CHESS.drawPayout
    const result = playerWon ? 'CHECKMATE · Bạn thắng Dealer AI' : dealerWon ? 'CHECKMATE · Dealer AI thắng' : chess.isStalemate() ? 'STALEMATE · Hòa, hoàn phí' : chess.isInsufficientMaterial() ? 'THIẾU QUÂN · Hòa, hoàn phí' : 'DRAW · Hòa, hoàn phí'
    seat.payout = payout
    seat.net = payout - seat.stake
    seat.result = result
    seat.status = playerWon ? 'WIN' : dealerWon ? 'LOSS' : 'DRAW'
    seat.win = playerWon
    seat.turn = 'RESULT'
    seat.board = chess.fen()
    this.recalculateCasinoChessStats(table)
    table.outcome = playerWon ? 'PLAYER WIN' : dealerWon ? 'DEALER WIN' : 'DRAW'
    table.resultDetail = `${seat.displayName}: ${result}`
    this.appendCasinoHistory(table, playerWon ? 'W' : dealerWon ? 'L' : 'D')
    if (user) {
      const reward = studioStore.settleCasinoPayout(user.studioId, user.id, 'CHESS', seat.matchId, 'final', payout, { result, moves: seat.moveCount, stake: seat.stake, net: seat.net })
      if (this.state.players.has(sessionId)) this.sendSocialReward(sessionId, reward)
    }
    this.emitCasinoEvent(playerWon ? 'PLAYER_WIN' : dealerWon ? 'PLAYER_LOSS' : 'PLAYER_PUSH', 'CHESS', `${seat.displayName}: ${result} (${seat.net >= 0 ? '+' : ''}${seat.net} Coin)`, sessionId, table.outcome, undefined, payout)
  }

  private recalculateCasinoChessStats(table: CasinoTableState) {
    const activeSeats = [...table.seats.values()].filter((candidate) => ['PLAYING', 'CHECK'].includes(candidate.status))
    table.activePlayers = activeSeats.length
    table.totalWagered = activeSeats.reduce((total, candidate) => total + candidate.stake, 0)
  }

  private finishCasinoResult(table: CasinoTableState, detail: string, historyValue: string) {
    table.resultDetail = detail
    this.appendCasinoHistory(table, historyValue)
    this.setCasinoPhase(table, 'RESULT', CASINO_RESULT_MS, 'ROUND COMPLETE · Trả thưởng tự động')
    this.emitCasinoEvent('ROUND_RESULT', table.mode, detail, undefined, table.outcome)
    this.setCasinoTimer(table.mode, () => this.startCasinoRound(table.mode), CASINO_RESULT_MS)
  }

  private dealCasinoBaccarat(table: CasinoTableState) {
    const result = dealBaccarat(() => this.drawCasinoCard('BACCARAT'))
    table.playerCards = result.playerCards.join(',')
    table.bankerCards = result.bankerCards.join(',')
    table.playerTotal = result.playerTotal
    table.bankerTotal = result.bankerTotal
    table.outcome = result.outcome
    table.shoeRemaining = this.casinoDecks.get('BACCARAT')?.length || 0
    this.setCasinoPhase(table, 'DEALING', CASINO_DEALING_MS, result.natural ? 'NATURAL · Mở bài' : 'DEALING · Áp dụng luật lá thứ ba')
    this.emitCasinoEvent('CARDS_DEALT', 'BACCARAT', result.natural ? 'Natural! Dealer mở kết quả.' : 'Player và Banker đã nhận bài.')
    this.setCasinoTimer('BACCARAT', () => this.settleCasinoBaccarat(table), CASINO_DEALING_MS)
  }

  private settleCasinoBaccarat(table: CasinoTableState) {
    table.seats.forEach((seat, sessionId) => {
      const wagers = this.casinoWagers(seat)
      let payout = 0
      Object.entries(wagers).forEach(([choice, amount]) => {
        if (table.outcome === 'TIE' && (choice === 'PLAYER' || choice === 'BANKER')) payout += amount
        else if (choice === table.outcome) {
          if (choice === 'PLAYER') payout += amount * 2
          else if (choice === 'BANKER') payout += amount + Math.floor(amount * CASINO_RULES.BACCARAT.bankerProfit)
          else payout += amount * (1 + CASINO_RULES.BACCARAT.tieProfit)
        }
      })
      this.settleCasinoSeat(table, sessionId, seat, payout, payout > seat.stake ? `Thắng cửa ${table.outcome}` : payout === seat.stake ? 'Hòa · hoàn cược' : `Kết quả ${table.outcome}`, payout > seat.stake)
    })
    this.finishCasinoResult(table, `${table.outcome} thắng · Player ${table.playerTotal} — Banker ${table.bankerTotal}`, table.outcome.slice(0, 1))
  }

  private shakeCasinoSicBo(table: CasinoTableState) {
    const dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6))
    table.dice = dice.join(',')
    table.outcome = String(dice.reduce((sum, value) => sum + value, 0))
    this.setCasinoPhase(table, 'SHAKING', CASINO_SHAKING_MS, 'SHAKING · Xúc xắc đang lắc trong hũ')
    this.emitCasinoEvent('DICE_SHAKING', 'SICBO', 'Dealer đang lắc ba viên xúc xắc.')
    this.setCasinoTimer('SICBO', () => this.settleCasinoSicBo(table), CASINO_SHAKING_MS)
  }

  private settleCasinoSicBo(table: CasinoTableState) {
    const dice = table.dice.split(',').map(Number)
    const triple = dice[0] === dice[1] && dice[1] === dice[2]
    table.seats.forEach((seat, sessionId) => {
      let payout = 0
      Object.entries(this.casinoWagers(seat)).forEach(([choice, amount]) => {
        const profit = sicBoProfit(choice, dice)
        if (profit >= 0) payout += amount * (1 + profit)
      })
      this.settleCasinoSeat(table, sessionId, seat, payout, payout > seat.stake ? `Trúng ${dice.join('·')}` : `Trượt ${dice.join('·')}`, payout > seat.stake)
    })
    const total = dice.reduce((sum, value) => sum + value, 0)
    table.outcome = triple ? `TRIPLE ${dice[0]}` : total <= 10 ? `SMALL ${total}` : `BIG ${total}`
    this.finishCasinoResult(table, `${dice.join(' · ')} = ${total}${triple ? ' · BỘ BA' : total % 2 ? ' · LẺ' : ' · CHẴN'}`, triple ? `T${dice[0]}` : String(total))
  }

  private shakeCasinoBauCua(table: CasinoTableState) {
    const faces = CASINO_RULES.BAU_CUA.choices
    const dice = [0, 1, 2].map(() => faces[Math.floor(Math.random() * faces.length)])
    table.dice = dice.join(',')
    table.outcome = dice.join(' · ')
    this.setCasinoPhase(table, 'SHAKING', CASINO_SHAKING_MS, 'LẮC BẦU CUA · Hũ đang xoay')
    this.emitCasinoEvent('DICE_SHAKING', 'BAU_CUA', 'Cô Ba đang lắc hũ Bầu Cua.')
    this.setCasinoTimer('BAU_CUA', () => this.settleCasinoBauCua(table), CASINO_SHAKING_MS)
  }

  private settleCasinoBauCua(table: CasinoTableState) {
    const dice = table.dice.split(',')
    table.seats.forEach((seat, sessionId) => {
      let payout = 0
      Object.entries(this.casinoWagers(seat)).forEach(([choice, amount]) => {
        const profit = bauCuaProfit(choice, dice)
        if (profit >= 0) payout += amount * (1 + profit)
      })
      this.settleCasinoSeat(table, sessionId, seat, payout, payout > seat.stake ? `Trúng ${dice.join(' · ')}` : 'Không có linh vật đã cược', payout > seat.stake)
    })
    this.finishCasinoResult(table, `Mở hũ: ${dice.join(' · ')}`, dice.map((face) => face.slice(0, 1)).join(''))
  }

  private shakeCasinoDiceDuel(table: CasinoTableState) {
    const playerRoll = 1 + Math.floor(Math.random() * 6)
    const houseRoll = 1 + Math.floor(Math.random() * 6)
    table.dice = `${playerRoll},${houseRoll}`
    table.outcome = playerRoll === houseRoll ? 'TIE' : playerRoll > houseRoll ? 'PLAYER' : 'HOUSE'
    this.setCasinoPhase(table, 'SHAKING', CASINO_SHAKING_MS, 'ROLLING · Player vs House')
    this.emitCasinoEvent('DICE_SHAKING', 'DICE_DUEL', 'Hai viên xúc xắc đang lăn.')
    this.setCasinoTimer('DICE_DUEL', () => this.settleCasinoDiceDuel(table), CASINO_SHAKING_MS)
  }

  private settleCasinoDiceDuel(table: CasinoTableState) {
    const [playerRoll, houseRoll] = table.dice.split(',').map(Number)
    table.seats.forEach((seat, sessionId) => {
      const payout = table.outcome === 'PLAYER' ? Math.floor(seat.stake * 1.8) : table.outcome === 'TIE' ? seat.stake : 0
      this.settleCasinoSeat(table, sessionId, seat, payout, table.outcome === 'PLAYER' ? `${playerRoll} thắng ${houseRoll}` : table.outcome === 'TIE' ? `${playerRoll} hòa ${houseRoll}` : `${playerRoll} thua ${houseRoll}`, payout > seat.stake)
    })
    this.finishCasinoResult(table, `PLAYER ${playerRoll} — ${houseRoll} HOUSE · ${table.outcome}`, `${playerRoll}${houseRoll}`)
  }

  private spinCasinoLuckyDraw(table: CasinoTableState) {
    const rewards = CASINO_RULES.LUCKY_DRAW.rewards
    const multiplier = rewards[Math.floor(Math.random() * rewards.length)]
    const symbols = multiplier === 5 ? ['STAR', 'STAR', 'STAR'] : multiplier === 2 ? ['GEM', 'GEM', 'COIN'] : multiplier === 1 ? ['COIN', 'COIN', 'CHERRY'] : ['CHERRY', 'GEM', 'STAR'].sort(() => Math.random() - 0.5)
    table.dice = symbols.join(',')
    table.outcome = `x${multiplier}`
    this.setCasinoPhase(table, 'SHAKING', CASINO_SHAKING_MS, 'SPINNING · Prize reels đang quay')
    this.emitCasinoEvent('REELS_SPINNING', 'LUCKY_DRAW', 'Ba reel Lucky Draw đang quay.')
    this.setCasinoTimer('LUCKY_DRAW', () => this.settleCasinoLuckyDraw(table, multiplier), CASINO_SHAKING_MS)
  }

  private settleCasinoLuckyDraw(table: CasinoTableState, multiplier: number) {
    table.seats.forEach((seat, sessionId) => {
      const payout = seat.stake * multiplier
      this.settleCasinoSeat(table, sessionId, seat, payout, multiplier > 1 ? `Trúng x${multiplier}` : multiplier === 1 ? 'Hoàn vốn x1' : 'Không trúng', payout > seat.stake)
    })
    this.finishCasinoResult(table, `${table.dice.split(',').join(' · ')} · ${table.outcome}`, table.outcome)
  }

  private dealCasinoBlackjack(table: CasinoTableState) {
    const dealerCards = [this.drawCasinoCard('BLACKJACK'), this.drawCasinoCard('BLACKJACK')]
    table.dealerCards = dealerCards.join(',')
    table.dealerTotal = scoreBlackjack(dealerCards).total
    table.seats.forEach((seat) => {
      if (!seat.stake) return
      const cards = [this.drawCasinoCard('BLACKJACK'), this.drawCasinoCard('BLACKJACK')]
      const score = scoreBlackjack(cards)
      seat.cards = cards.join(',')
      seat.handValue = score.total
      seat.status = score.blackjack ? 'BLACKJACK' : 'PLAYING'
      seat.acted = score.blackjack
      seat.turn = score.blackjack ? 'DONE' : 'WAITING'
      seat.lastMove = 'DEAL'
      seat.doubled = false
      seat.payout = 0
      seat.win = false
      seat.result = ''
    })
    table.shoeRemaining = this.casinoDecks.get('BLACKJACK')?.length || 0
    this.setCasinoPhase(table, 'DEALING', CASINO_DEALING_MS, 'DEALING · Hai lá cho mỗi ghế')
    this.emitCasinoEvent('CARDS_DEALT', 'BLACKJACK', 'Dealer đã chia hai lá. Một lá nhà cái đang úp.')
    this.setCasinoTimer('BLACKJACK', () => this.startCasinoBlackjackTurn(table), CASINO_DEALING_MS)
  }

  private blackjackActiveSeats(table: CasinoTableState) {
    return [...table.seats.values()].filter((seat) => seat.stake > 0).sort((left, right) => left.seatIndex - right.seatIndex)
  }

  private timeoutCasinoBlackjackTurn(table: CasinoTableState) {
    const activeSeat = this.blackjackActiveSeats(table).find((seat) => seat.turn === 'ACTIVE')
    if (!activeSeat) {
      this.startCasinoBlackjackTurn(table)
      return
    }
    activeSeat.acted = true
    activeSeat.turn = 'DONE'
    activeSeat.status = 'AUTO_STAND'
    activeSeat.lastMove = 'TIMEOUT'
    this.emitCasinoEvent('BLACKJACK_TIMEOUT', 'BLACKJACK', `${activeSeat.displayName} hết giờ, tự động dằn.`, undefined, 'AUTO_STAND')
    this.startCasinoBlackjackTurn(table)
  }

  private startCasinoBlackjackTurn(table: CasinoTableState) {
    const dealerScore = scoreBlackjack(table.dealerCards.split(',').filter(Boolean))
    const activeSeats = this.blackjackActiveSeats(table)
    const nextSeat = activeSeats.find((seat) => !seat.acted)
    if (dealerScore.blackjack || activeSeats.length === 0 || !nextSeat) {
      this.finishCasinoBlackjackTurn(table)
      return
    }
    activeSeats.forEach((seat) => {
      if (seat !== nextSeat && !seat.acted) seat.turn = 'WAITING'
    })
    nextSeat.turn = 'ACTIVE'
    this.setCasinoPhase(table, 'PLAYER_TURN', CASINO_PLAYER_TURN_MS, `LƯỢT ${nextSeat.displayName} · Hit, Stand hoặc Double`)
    this.emitCasinoEvent('PLAYER_TURN', 'BLACKJACK', `${nextSeat.displayName} đang hành động. Dealer sẽ đứng ở soft 17.`, undefined, nextSeat.status)
    this.setCasinoTimer('BLACKJACK', () => this.timeoutCasinoBlackjackTurn(table), CASINO_PLAYER_TURN_MS)
  }

  private handleCasinoBlackjackAction(client: Client, table: CasinoTableState, action: string, actionId: string) {
    const seat = table.seats.get(client.sessionId)
    if (table.phase !== 'PLAYER_TURN' || !seat || seat.turn !== 'ACTIVE' || seat.acted || !seat.stake) throw new DomainError('BLACKJACK_ACTION_CLOSED', 'Chưa tới lượt hand này.', 409)
    const cards = seat.cards.split(',').filter(Boolean)
    if (action === 'HIT') {
      cards.push(this.drawCasinoCard('BLACKJACK'))
      const score = scoreBlackjack(cards)
      seat.cards = cards.join(',')
      seat.handValue = score.total
      seat.status = score.bust ? 'BUST' : score.total === 21 ? 'TWENTY_ONE' : 'PLAYING'
      seat.acted = score.bust || score.total === 21
      seat.lastMove = 'HIT'
      if (seat.acted) seat.turn = 'DONE'
      this.emitCasinoEvent('BLACKJACK_HIT', 'BLACKJACK', `${seat.displayName} rút thêm một lá${score.bust ? ' và quắc.' : '.'}`, client.sessionId, seat.status)
    } else if (action === 'STAND') {
      seat.acted = true
      seat.turn = 'DONE'
      seat.lastMove = 'STAND'
      seat.status = 'STAND'
      this.emitCasinoEvent('BLACKJACK_STAND', 'BLACKJACK', `${seat.displayName} dằn ${seat.handValue} điểm.`, client.sessionId, 'STAND')
    } else if (action === 'DOUBLE') {
      if (cards.length !== 2) throw new DomainError('BLACKJACK_DOUBLE_INVALID', 'Chỉ được Double khi đang có đúng hai lá.', 409)
      const player = this.state.players.get(client.sessionId)
      const user = player ? studioStore.getUserById(player.userId) : undefined
      if (!player || !user) throw new DomainError('BLACKJACK_PLAYER_INVALID', 'Không tìm thấy người chơi.')
      const doubleStake = seat.stake
      const safeActionId = /^[a-zA-Z0-9:_-]{8,120}$/.test(actionId) ? actionId : 'DOUBLE'
      const reward = studioStore.placeCasinoWager(user.studioId, user.id, 'BLACKJACK', table.roundId, safeActionId, doubleStake, { action: 'DOUBLE' })
      this.sendSocialReward(client.sessionId, reward)
      if (reward.duplicate) return
      const wagers = this.casinoWagers(seat)
      wagers.DOUBLE = doubleStake
      seat.wagersJson = JSON.stringify(wagers)
      seat.stake += doubleStake
      seat.net = -seat.stake
      seat.doubled = true
      table.totalWagered += doubleStake
      cards.push(this.drawCasinoCard('BLACKJACK'))
      const score = scoreBlackjack(cards)
      seat.cards = cards.join(',')
      seat.handValue = score.total
      seat.acted = true
      seat.turn = 'DONE'
      seat.lastMove = 'DOUBLE'
      seat.status = score.bust ? 'BUST' : 'DOUBLE_STAND'
      this.emitCasinoEvent('BLACKJACK_DOUBLE', 'BLACKJACK', `${seat.displayName} Double và nhận đúng một lá.`, client.sessionId, seat.status, doubleStake)
    } else throw new DomainError('BLACKJACK_ACTION_INVALID', 'Action Blackjack không hợp lệ.')
    table.shoeRemaining = this.casinoDecks.get('BLACKJACK')?.length || 0
    if (seat.acted) this.startCasinoBlackjackTurn(table)
    else this.setCasinoTimer('BLACKJACK', () => this.timeoutCasinoBlackjackTurn(table), CASINO_PLAYER_TURN_MS)
  }

  private finishCasinoBlackjackTurn(table: CasinoTableState) {
    table.seats.forEach((seat) => {
      if (seat.stake > 0 && !seat.acted) {
        seat.acted = true
        seat.status = 'AUTO_STAND'
        seat.lastMove = 'AUTO_STAND'
      }
      if (seat.stake > 0) seat.turn = 'DONE'
    })
    const dealerCards = table.dealerCards.split(',').filter(Boolean)
    let dealerScore = scoreBlackjack(dealerCards)
    while (dealerScore.total < 17 || (dealerScore.total === 17 && dealerScore.soft && !CASINO_RULES.BLACKJACK.dealerStandsSoft17)) {
      dealerCards.push(this.drawCasinoCard('BLACKJACK'))
      dealerScore = scoreBlackjack(dealerCards)
    }
    table.dealerCards = dealerCards.join(',')
    table.dealerTotal = dealerScore.total
    table.outcome = dealerScore.blackjack ? 'DEALER BLACKJACK' : dealerScore.bust ? 'DEALER BUST' : `DEALER ${dealerScore.total}`
    table.shoeRemaining = this.casinoDecks.get('BLACKJACK')?.length || 0
    this.setCasinoPhase(table, 'REVEAL', CASINO_REVEAL_MS, 'DEALER TURN · Mở hole card và rút theo luật')
    this.emitCasinoEvent('DEALER_REVEAL', 'BLACKJACK', dealerScore.bust ? `Dealer quắc ${dealerScore.total}.` : `Dealer dừng ở ${dealerScore.total}.`, undefined, table.outcome)
    this.setCasinoTimer('BLACKJACK', () => this.settleCasinoBlackjack(table), CASINO_REVEAL_MS)
  }

  private settleCasinoBlackjack(table: CasinoTableState) {
    const dealerScore = scoreBlackjack(table.dealerCards.split(',').filter(Boolean))
    table.seats.forEach((seat, sessionId) => {
      const playerScore = scoreBlackjack(seat.cards.split(',').filter(Boolean))
      let payout = 0
      let result = 'Thua'
      if (playerScore.blackjack && !dealerScore.blackjack) {
        payout = Math.floor(seat.stake * (1 + CASINO_RULES.BLACKJACK.blackjackProfit))
        result = 'BLACKJACK · trả 3:2'
      } else if (!playerScore.bust && dealerScore.blackjack === playerScore.blackjack && playerScore.total === dealerScore.total) {
        payout = seat.stake
        result = 'PUSH · hoàn cược'
      } else if (!playerScore.bust && (dealerScore.bust || playerScore.total > dealerScore.total)) {
        payout = seat.stake * 2
        result = dealerScore.bust ? 'Dealer quắc · thắng' : `${playerScore.total} thắng ${dealerScore.total}`
      } else result = playerScore.bust ? `Quắc ${playerScore.total}` : `${playerScore.total} thua ${dealerScore.total}`
      this.settleCasinoSeat(table, sessionId, seat, payout, result, payout > seat.stake)
    })
    this.finishCasinoResult(table, `${table.outcome} · Dealer ${dealerScore.total}`, dealerScore.bust ? 'B' : String(dealerScore.total))
  }

  private startMiniGame(client: Client, mode?: MiniGameMode, partyId?: string) {
    if (mode && isCasinoMode(mode)) {
      this.sendMiniGameError(client, `${gameDisplayName(mode)} đang chạy liên tục; hãy tới bàn và đặt chip khi phase BETTING mở.`)
      return
    }
    const player = this.state.players.get(client.sessionId)
    const party = partyId ? this.parties.get(partyId) : undefined
    const partyLaunch = Boolean(partyId)
    if (partyLaunch && (!party || party.leaderId !== player?.userId)) {
      this.sendMiniGameError(client, 'Chỉ party leader mới có thể mở activity cho party này.')
      return
    }
    if (!player || (!partyLaunch && !TAG_GAME_ADMIN_ROLES.includes(player.role))) {
      this.sendMiniGameError(client, 'Chỉ Admin hoặc Owner mới có thể mở mini game.')
      return
    }

    if (!mode || !MINI_GAME_MODES.some((definition) => definition.id === mode)) {
      this.sendMiniGameError(client, 'Mini game không hợp lệ.')
      return
    }

    if (!MVP_MINI_GAME_MODES.has(mode)) {
      this.sendMiniGameError(client, 'Mode này sẽ được mở ở một milestone sau.')
      return
    }

    if (partyLaunch && mode !== 'PAINT_TILES' && mode !== 'TREASURE_HUNT') {
      this.sendMiniGameError(client, 'Party MVP hiện hỗ trợ Paint Tiles và Treasure Hunt.')
      return
    }

    if (this.state.tagGame.status === 'COUNTDOWN' || this.state.tagGame.status === 'PLAYING' || this.state.miniGame.status === 'COUNTDOWN' || this.state.miniGame.status === 'PLAYING') {
      this.sendMiniGameError(client, 'Một mini game khác đang diễn ra rồi.')
      return
    }

    const requiredRoom = this.isCardRoomMode(mode) ? 'CARD_ROOM' : 'LOBBY'
    const roomMatches = (candidate: Player) => requiredRoom === 'CARD_ROOM' ? this.isCardRoomLocation(candidate.currentRoom) : candidate.currentRoom === requiredRoom
    const attendees = party
      ? party.members.map((member) => [...this.state.players.entries()].find(([, candidate]) => candidate.userId === member.userId)).filter((entry): entry is [string, Player] => Boolean(entry?.[1]?.online && roomMatches(entry[1]))).slice(0, 8)
      : [...this.state.players.entries()].filter(([, candidate]) => candidate.online && roomMatches(candidate)).slice(0, mode === 'CHESS' ? 2 : 8)
    const minPlayers = this.cardGameCanPlaySolo(mode) ? 1 : 2
    if (attendees.length < minPlayers) {
      this.sendMiniGameError(client, `Cần ít nhất ${minPlayers} người đang ở ${requiredRoom === 'CARD_ROOM' ? 'Play Lounge, VIP Games hoặc Arcade Hall' : 'Studio Commons'} để điểm danh và bắt đầu game.`)
      return
    }

    this.clearMiniGameTimers()
    this.miniGameLastActionAt.clear()
    this.miniGameRolls.clear()
    this.miniGameBets.clear()
    const game = this.state.miniGame
    const now = Date.now()
    const attendeeIds = attendees.map(([sessionId]) => sessionId)
    game.mode = mode
    game.gameId = mode.toLowerCase()
    game.status = 'COUNTDOWN'
    game.roundId = `${mode.toLowerCase()}-${now}`
    game.startedBy = player.userId
    game.leaderSessionId = attendeeIds[Math.floor(Math.random() * attendeeIds.length)]
    game.targetColor = ''
    game.turnTeam = ''
    game.teamRedScore = 0
    game.teamBlueScore = 0
    game.startedAt = now + MINI_GAME_COUNTDOWN_MS
    game.endsAt = game.startedAt + MINI_GAME_DURATION_MS
    game.score = 0
    game.totalTasks = 0
    game.completedTasks = 0
    game.minPlayers = minPlayers
    game.maxPlayers = mode === 'CHESS' ? 2 : 8
    game.spectatorCount = 0
    game.settlementStatus = 'NONE'
    game.winnerIds.clear()
    game.resultMessage = ''
    game.notice = this.miniGameDefinition(mode).description
    game.attendees.clear()
    game.items.clear()
    game.boardCells.clear()

    attendees.forEach(([sessionId, attendee], index) => {
      const participant = new MiniGameParticipant()
      participant.userId = attendee.userId
      participant.displayName = attendee.name
      participant.connected = true
      participant.alive = true
      participant.score = 0
      // Persistent Coin is private wallet state. Keep the legacy public field
      // at zero so presence/mini-game snapshots cannot leak another player's balance.
      participant.coins = 0
      participant.team = this.teamMode(mode) ? (index % 2 === 0 ? 'RED' : 'BLUE') : mode === 'CHESS' ? (index === 0 ? 'WHITE' : 'BLACK') : ''
      participant.color = mode === 'COLOR_CHASE' ? MINI_GAME_PALETTE[index % MINI_GAME_PALETTE.length] : ''
      game.attendees.set(sessionId, participant)
    })

    this.configureMiniGame(mode, attendeeIds)
    if (party) {
      this.activeMiniGamePartyId = party.partyId
      party.status = 'IN_ACTIVITY'
      party.activity = { type: 'SOCIAL_GAME', targetId: mode }
      party.members = party.members.map((member) => ({ ...member, status: attendeeIds.some((sessionId) => this.state.players.get(sessionId)?.userId === member.userId) ? 'IN_ACTIVITY' : member.status }))
      party.version += 1
      this.broadcastParty(party)
    }
    recordSocialMetric('social_round_started', { roundId: game.roundId, gameId: game.gameId, participantCount: attendees.length })
    const roundId = game.roundId
    this.miniGameStartTimer = setTimeout(() => this.beginMiniGame(roundId), MINI_GAME_COUNTDOWN_MS)
  }

  private configureMiniGame(mode: MiniGameMode, attendeeIds: string[]) {
    const game = this.state.miniGame
    const leader = game.attendees.get(game.leaderSessionId)

    if (mode === 'HIDE_SEEK') {
      if (leader) leader.role = 'SEEKER'
      game.attendees.forEach((participant, sessionId) => {
        if (sessionId !== game.leaderSessionId) {
          participant.role = 'HIDER'
          participant.hidden = true
        }
      })
    } else if (mode === 'FREEZE_TAG') {
      if (leader) leader.role = 'TAGGER'
      game.attendees.forEach((participant, sessionId) => { if (sessionId !== game.leaderSessionId) participant.role = 'RUNNER' })
    } else if (mode === 'HOT_BOMB') {
      if (leader) {
        leader.role = 'BOMB HOLDER'
        leader.hasBomb = true
      }
      game.attendees.forEach((participant, sessionId) => { if (sessionId !== game.leaderSessionId) participant.role = 'RUNNER' })
    } else if (mode === 'IMPOSTOR') {
      if (leader) leader.role = 'IMPOSTOR'
      game.totalTasks = attendeeIds.length * 2
      game.attendees.forEach((participant, sessionId) => { if (sessionId !== game.leaderSessionId) participant.role = 'CREW' })
    } else if (mode === 'COLOR_CHASE') {
      game.targetColor = MINI_GAME_PALETTE[Math.floor(Math.random() * MINI_GAME_PALETTE.length)]
      game.attendees.forEach((participant) => { participant.role = participant.color === game.targetColor ? 'TARGET' : 'CHASER' })
    } else if (mode === 'CAPTURE_FLAG') {
      const redFlag = new MiniGameItem()
      redFlag.kind = 'RED_FLAG'
      redFlag.team = 'RED'
      redFlag.x = 455
      redFlag.y = 500
      redFlag.homeX = 455
      redFlag.homeY = 500
      game.items.set('red-flag', redFlag)
      const blueFlag = new MiniGameItem()
      blueFlag.kind = 'BLUE_FLAG'
      blueFlag.team = 'BLUE'
      blueFlag.x = 615
      blueFlag.y = 500
      blueFlag.homeX = 615
      blueFlag.homeY = 500
      game.items.set('blue-flag', blueFlag)
    } else if (mode === 'PAINT_TILES') {
      for (let index = 0; index < 9; index++) {
        const cell = new MiniGameCell()
        cell.index = index
        game.boardCells.set(String(index), cell)
      }
    } else if (mode === 'TREASURE_HUNT') {
      const treasureSpots = [[440, 410], [520, 410], [600, 410], [440, 550], [520, 550], [600, 550]]
      treasureSpots.forEach(([x, y], index) => {
        const item = new MiniGameItem()
        item.kind = 'TREASURE'
        item.x = x
        item.y = y
        item.value = index % 3 === 0 ? 3 : 1
        game.items.set(`treasure-${index}`, item)
      })
    } else if (mode === 'DODGE_FALLING') {
      for (let index = 0; index < 4; index++) this.spawnDodgeHazard(`hazard-${index}`)
    } else if (mode === 'CHESS') {
      game.turnTeam = 'WHITE'
      const backRank = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK']
      backRank.forEach((kind, x) => {
        const white = new MiniGameItem()
        white.kind = kind
        white.team = 'WHITE'
        white.x = x
        white.y = 7
        game.items.set(`chess-white-back-${x}`, white)
        const black = new MiniGameItem()
        black.kind = kind
        black.team = 'BLACK'
        black.x = x
        black.y = 0
        game.items.set(`chess-black-back-${x}`, black)
        const whitePawn = new MiniGameItem()
        whitePawn.kind = 'PAWN'
        whitePawn.team = 'WHITE'
        whitePawn.x = x
        whitePawn.y = 6
        game.items.set(`chess-white-pawn-${x}`, whitePawn)
        const blackPawn = new MiniGameItem()
        blackPawn.kind = 'PAWN'
        blackPawn.team = 'BLACK'
        blackPawn.x = x
        blackPawn.y = 1
        game.items.set(`chess-black-pawn-${x}`, blackPawn)
      })
    }
  }

  private beginMiniGame(roundId: string) {
    const game = this.state.miniGame
    if (game.roundId !== roundId || game.status !== 'COUNTDOWN') return
    if (this.activeMiniGameAttendeeCount() < game.minPlayers) {
      this.finishMiniGame('Game bị hủy vì không còn đủ người tham gia.')
      return
    }
    game.status = 'PLAYING'
    game.startedAt = Date.now()
    game.endsAt = game.startedAt + MINI_GAME_DURATION_MS
    game.notice = this.miniGameDefinition(game.mode as MiniGameMode).description
    if (game.mode === 'DODGE_FALLING') {
      this.miniGameTickTimer = setInterval(() => this.tickDodgeFalling(), 1_100)
    }
    this.miniGameEndTimer = setTimeout(() => this.finishMiniGame(), MINI_GAME_DURATION_MS)
  }

  private handleMiniGameAction(client: Client, message: MiniGameActionPayload) {
    const game = this.state.miniGame
    const participant = game.attendees.get(client.sessionId)
    if (game.status !== 'PLAYING' || !participant?.connected) {
      this.sendMiniGameError(client, 'Mini game chưa bắt đầu hoặc bạn không còn trong lượt chơi.')
      return
    }
    const player = this.state.players.get(client.sessionId)
    const roomMatches = this.isCardRoomMode(game.mode as MiniGameMode)
      ? Boolean(player && this.isCardRoomLocation(player.currentRoom))
      : player?.currentRoom === 'LOBBY'
    if (!roomMatches) {
      this.sendMiniGameError(client, 'Bạn cần đứng trong đúng khu game để thực hiện action.')
      return
    }
    if (Date.now() >= game.endsAt) {
      this.finishMiniGame()
      return
    }
    const now = Date.now()
    if (now - (this.miniGameLastActionAt.get(client.sessionId) || 0) < MINI_GAME_ACTION_COOLDOWN_MS) return
    const action = message?.action || ''
    let accepted = false

    try {
      switch (game.mode) {
        case 'THROWABLES':
          accepted = this.handleThrowableAction(client.sessionId, message?.item || 'STONE')
          break
        case 'FREEZE_TAG':
          accepted = this.handleFreezeAction(client.sessionId)
          break
        case 'HOT_BOMB':
          accepted = action === 'PASS_BOMB' && this.passBomb(client.sessionId)
          break
        case 'CAPTURE_FLAG':
          accepted = action === 'PICKUP_FLAG' ? this.pickupFlag(client.sessionId) : action === 'RETURN_FLAG' && this.returnFlag(client.sessionId)
          break
        case 'IMPOSTOR':
          accepted = action === 'TASK' ? this.completeImpostorTask(client.sessionId) : action === 'SABOTAGE' ? this.sabotageNearest(client.sessionId) : action === 'VOTE' && this.voteForImpostor(client.sessionId, message?.targetSessionId || '')
          break
        case 'BACCARAT':
          accepted = action === 'BET' && this.resolveBaccarat(client.sessionId, message?.choice || '')
          break
        case 'BLACKJACK':
          accepted = action === 'BET' && this.resolveBlackjack(client.sessionId)
          break
        case 'POKER':
          this.sendMiniGameError(client, 'Texas Hold’em dùng bàn LIVE No-Limit. Hãy tới VIP Games và mở bàn Poker.')
          return
        case 'SICBO':
          accepted = action === 'BET' && this.resolveSicbo(client.sessionId, message?.choice || '')
          break
        case 'BAU_CUA':
          accepted = action === 'BET' && this.resolveBauCua(client.sessionId, message?.choice || '')
          break
        case 'CHESS':
          accepted = action === 'MOVE' && this.moveChess(client.sessionId, message?.fromX, message?.fromY, message?.toX, message?.toY)
          break
        case 'DICE_DUEL':
          accepted = action === 'ROLL' && this.resolveDiceDuel(client.sessionId)
          break
        case 'LUCKY_DRAW':
          accepted = action === 'DRAW' && this.resolveLuckyDraw(client.sessionId)
          break
        default:
          break
      }
    } catch (error) {
      if (error instanceof DomainError) this.sendMiniGameError(client, error.message)
      else this.sendMiniGameError(client, 'Không thể xử lý action của mini game.')
      return
    }
    if (accepted) this.miniGameLastActionAt.set(client.sessionId, now)
  }

  private handleMiniGameCheer(client: Client) {
    const game = this.state.miniGame
    if (game.status !== 'COUNTDOWN' && game.status !== 'PLAYING') return
    const player = this.state.players.get(client.sessionId)
    if (!player) return
    game.spectatorCount = Math.max(0, [...this.state.players.keys()].filter((sessionId) => !game.attendees.has(sessionId)).length)
    this.emitMiniGameEvent('CHEER', `${player.name} đang cổ vũ!`, client.sessionId)
  }

  private checkMiniGameMovement(sessionId: string) {
    const game = this.state.miniGame
    if (game.status !== 'PLAYING') return
    const participant = game.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    if (!participant?.connected || !player || player.currentRoom !== 'LOBBY') return

    if (game.mode === 'HIDE_SEEK' && sessionId === game.leaderSessionId) this.findNearestHider(sessionId)
    if (game.mode === 'FREEZE_TAG') this.checkFreezeMovement(sessionId)
    if (game.mode === 'COLOR_CHASE') this.checkColorChaseMovement(sessionId)
    if (game.mode === 'CAPTURE_FLAG') this.checkFlagCarrierMovement(sessionId)
    if (game.mode === 'PAINT_TILES') this.paintPlayerCell(sessionId)
    if (game.mode === 'TREASURE_HUNT') this.collectNearestTreasure(sessionId)
  }

  private findNearestHider(seekerSessionId: string) {
    const game = this.state.miniGame
    const seeker = this.state.players.get(seekerSessionId)
    if (!seeker) return
    const target = this.nearestParticipant(seekerSessionId, MINI_GAME_TAG_DISTANCE, (participant) => participant.role === 'HIDER' && !participant.found)
    if (!target) return
    target.participant.found = true
    target.participant.hidden = false
    const seekerParticipant = game.attendees.get(seekerSessionId)
    if (seekerParticipant) seekerParticipant.score += 1
    game.score += 1
    this.emitMiniGameEvent('FOUND', `${seekerParticipant?.displayName || 'Người tìm'} đã tìm thấy ${target.participant.displayName}!`, seekerSessionId, target.sessionId)
    const remaining = [...game.attendees.values()].some((participant) => participant.role === 'HIDER' && !participant.found && participant.connected)
    if (!remaining) this.finishMiniGame('Người tìm đã tìm thấy tất cả mọi người.')
  }

  private checkFreezeMovement(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant) return
    if (participant.role === 'TAGGER') {
      const target = this.nearestParticipant(sessionId, MINI_GAME_TAG_DISTANCE, (candidate) => candidate.role === 'RUNNER' && !candidate.frozen)
      if (!target) return
      target.participant.frozen = true
      participant.score += 1
      game.score += 1
      this.emitMiniGameEvent('FROZEN', `${target.participant.displayName} bị đóng băng!`, sessionId, target.sessionId)
      const remaining = [...game.attendees.values()].some((candidate) => candidate.role === 'RUNNER' && !candidate.frozen && candidate.connected)
      if (!remaining) this.finishMiniGame('Người bắt đã đóng băng cả nhóm.')
    } else if (!participant.frozen) {
      const target = this.nearestParticipant(sessionId, MINI_GAME_TAG_DISTANCE, (candidate) => candidate.frozen)
      if (!target) return
      target.participant.frozen = false
      this.emitMiniGameEvent('UNFROZEN', `${participant.displayName} đã giải cứu ${target.participant.displayName}!`, sessionId, target.sessionId)
    }
  }

  private handleFreezeAction(sessionId: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    if (!participant || participant.frozen) return false
    this.checkFreezeMovement(sessionId)
    return true
  }

  private checkColorChaseMovement(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant || participant.role !== 'CHASER') return
    const target = this.nearestParticipant(sessionId, MINI_GAME_TAG_DISTANCE, (candidate) => candidate.role === 'TARGET' && !candidate.found)
    if (!target) return
    target.participant.found = true
    participant.score += 1
    game.score += 1
    this.emitMiniGameEvent('COLOR_FOUND', `${target.participant.displayName} đã bị bắt!`, sessionId, target.sessionId)
    const remaining = [...game.attendees.values()].some((candidate) => candidate.role === 'TARGET' && !candidate.found && candidate.connected)
    if (!remaining) this.finishMiniGame(`Đội đuổi đã bắt hết người màu ${game.targetColor}.`)
  }

  private nearestParticipant(sessionId: string, maxDistance: number, predicate: (participant: MiniGameParticipant) => boolean) {
    const source = this.state.players.get(sessionId)
    if (!source) return undefined
    let nearest: { sessionId: string; participant: MiniGameParticipant; distance: number } | undefined
    this.state.miniGame.attendees.forEach((participant, candidateSessionId) => {
      if (candidateSessionId === sessionId || !participant.connected || !predicate(participant)) return
      const candidate = this.state.players.get(candidateSessionId)
      if (!candidate || candidate.currentRoom !== 'LOBBY') return
      const distance = Math.hypot(candidate.x - source.x, candidate.y - source.y)
      if (distance <= maxDistance && (!nearest || distance < nearest.distance)) nearest = { sessionId: candidateSessionId, participant, distance }
    })
    return nearest
  }

  private handleThrowableAction(sessionId: string, item: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant) return false
    const itemName = MINI_GAME_THROWABLES[item] || MINI_GAME_THROWABLES.STONE
    const target = this.nearestParticipant(sessionId, MINI_GAME_THROW_DISTANCE, (candidate) => candidate.alive)
    if (!target) {
      this.emitMiniGameEvent('THROW_MISS', `${participant.displayName} ném ${itemName} nhưng trượt rồi.`, sessionId, undefined, item)
      return true
    }
    participant.score += 1
    game.score += 1
    this.emitMiniGameEvent('THROW_HIT', `${participant.displayName} ném ${itemName} trúng ${target.participant.displayName}!`, sessionId, target.sessionId, item)
    return true
  }

  private passBomb(sessionId: string) {
    const game = this.state.miniGame
    const holder = game.attendees.get(sessionId)
    if (!holder?.hasBomb) return false
    const target = this.nearestParticipant(sessionId, 110, (candidate) => candidate.alive && !candidate.hasBomb)
    if (!target) return false
    holder.hasBomb = false
    holder.role = 'RUNNER'
    target.participant.hasBomb = true
    target.participant.role = 'BOMB HOLDER'
    game.score += 1
    this.emitMiniGameEvent('BOMB_PASSED', `${holder.displayName} chuyền bom cho ${target.participant.displayName}!`, sessionId, target.sessionId, 'BOMB')
    return true
  }

  private pickupFlag(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant?.team || participant.carryingFlag) return false
    const target = this.nearestFlag(sessionId, 52, (item) => item.active && item.team !== participant.team)
    if (!target) return false
    target.item.active = false
    target.item.collectedBy = sessionId
    participant.carryingFlag = target.itemId
    this.emitMiniGameEvent('FLAG_PICKED', `${participant.displayName} đã cướp cờ ${target.item.team}!`, sessionId, undefined, target.item.kind)
    return true
  }

  private returnFlag(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant?.carryingFlag) return false
    const homeFlag = [...game.items.entries()].find(([, item]) => item.team === participant.team)
    const player = this.state.players.get(sessionId)
    if (!homeFlag || !player || Math.hypot(player.x - homeFlag[1].homeX, player.y - homeFlag[1].homeY) > 80) return false
    const carriedFlag = game.items.get(participant.carryingFlag)
    if (!carriedFlag) return false
    participant.carryingFlag = ''
    participant.score += 1
    if (participant.team === 'RED') game.teamRedScore += 1
    else game.teamBlueScore += 1
    carriedFlag.active = true
    carriedFlag.collectedBy = ''
    carriedFlag.x = carriedFlag.homeX
    carriedFlag.y = carriedFlag.homeY
    this.emitMiniGameEvent('FLAG_RETURNED', `${participant.displayName} mang cờ về căn cứ!`, sessionId, undefined, carriedFlag.kind)
    if (game.teamRedScore >= 3 || game.teamBlueScore >= 3) this.finishMiniGame(`Đội ${game.teamRedScore >= 3 ? 'Đỏ' : 'Xanh'} đã thắng Cướp cờ.`)
    return true
  }

  private nearestFlag(sessionId: string, maxDistance: number, predicate: (item: MiniGameItem) => boolean) {
    const player = this.state.players.get(sessionId)
    if (!player) return undefined
    let nearest: { itemId: string; item: MiniGameItem; distance: number } | undefined
    this.state.miniGame.items.forEach((item, itemId) => {
      if (!predicate(item)) return
      const distance = Math.hypot(item.x - player.x, item.y - player.y)
      if (distance <= maxDistance && (!nearest || distance < nearest.distance)) nearest = { itemId, item, distance }
    })
    return nearest
  }

  private checkFlagCarrierMovement(sessionId: string) {
    const carrier = this.state.miniGame.attendees.get(sessionId)
    if (!carrier?.carryingFlag) return
    const carrierPlayer = this.state.players.get(sessionId)
    if (!carrierPlayer) return
    const opponent = this.nearestParticipant(sessionId, MINI_GAME_TAG_DISTANCE, (candidate) => candidate.team && candidate.team !== carrier.team && candidate.alive)
    if (!opponent) return
    const carriedFlag = this.state.miniGame.items.get(carrier.carryingFlag)
    if (!carriedFlag) return
    carrier.carryingFlag = ''
    carriedFlag.active = true
    carriedFlag.collectedBy = ''
    carriedFlag.x = carrierPlayer.x
    carriedFlag.y = carrierPlayer.y
    this.emitMiniGameEvent('FLAG_DROPPED', `${opponent.participant.displayName} chặn được người cầm cờ!`, opponent.sessionId, sessionId, carriedFlag.kind)
  }

  private paintPlayerCell(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    if (!participant || !player) return
    const cellIndex = this.getPaintCellIndex(player.x, player.y)
    if (cellIndex < 0) return
    const cell = game.boardCells.get(String(cellIndex))
    if (!cell || cell.ownerSessionId === sessionId) return
    cell.ownerSessionId = sessionId
    cell.team = participant.team
    participant.score = [...game.boardCells.values()].filter((candidate) => candidate.ownerSessionId === sessionId).length
    game.teamRedScore = [...game.boardCells.values()].filter((candidate) => candidate.team === 'RED').length
    game.teamBlueScore = [...game.boardCells.values()].filter((candidate) => candidate.team === 'BLUE').length
    game.score = Math.max(game.score, game.teamRedScore + game.teamBlueScore)
  }

  private getPaintCellIndex(x: number, y: number) {
    const originX = 446
    const originY = 398
    const cellSize = 60
    const column = Math.floor((x - originX) / cellSize)
    const row = Math.floor((y - originY) / cellSize)
    return column >= 0 && column < 3 && row >= 0 && row < 3 ? row * 3 + column : -1
  }

  private collectNearestTreasure(sessionId: string) {
    const player = this.state.players.get(sessionId)
    const participant = this.state.miniGame.attendees.get(sessionId)
    if (!player || !participant) return
    let collected: { itemId: string; item: MiniGameItem } | undefined
    this.state.miniGame.items.forEach((item, itemId) => {
      if (!item.active || item.kind !== 'TREASURE') return
      if (Math.hypot(item.x - player.x, item.y - player.y) <= 38 && !collected) collected = { itemId, item }
    })
    if (!collected) return
    collected.item.active = false
    collected.item.collectedBy = sessionId
    participant.score += collected.item.value
    this.state.miniGame.score += collected.item.value
    this.emitMiniGameEvent('TREASURE_FOUND', `${participant.displayName} nhặt được kho báu +${collected.item.value}!`, sessionId, undefined, 'TREASURE')
    const remaining = [...this.state.miniGame.items.values()].some((item) => item.kind === 'TREASURE' && item.active)
    if (!remaining) this.finishMiniGame('Cả nhóm đã thu thập hết kho báu.')
  }

  private spawnDodgeHazard(itemId: string) {
    const item = this.state.miniGame.items.get(itemId) || new MiniGameItem()
    item.kind = 'FALLING_OBJECT'
    item.x = 438 + Math.floor(Math.random() * 180)
    item.y = 390 + Math.floor(Math.random() * 190)
    item.value = 0
    item.active = true
    this.state.miniGame.items.set(itemId, item)
  }

  private tickDodgeFalling() {
    const game = this.state.miniGame
    if (game.status !== 'PLAYING' || game.mode !== 'DODGE_FALLING') return
    game.items.forEach((item, itemId) => {
      if (item.kind === 'FALLING_OBJECT') this.spawnDodgeHazard(itemId)
    })
    game.attendees.forEach((participant, sessionId) => {
      if (!participant.connected || !participant.alive) return
      const player = this.state.players.get(sessionId)
      if (!player || player.currentRoom !== 'LOBBY') return
      const hit = [...game.items.values()].some((item) => item.kind === 'FALLING_OBJECT' && Math.hypot(item.x - player.x, item.y - player.y) <= 38)
      if (!hit) return
      participant.alive = false
      game.score += 1
      this.emitMiniGameEvent('DODGED_OUT', `${participant.displayName} bị vật rơi trúng!`, undefined, sessionId, 'FALLING_OBJECT')
    })
    const survivors = [...game.attendees.values()].filter((participant) => participant.connected && participant.alive)
    if (survivors.length <= 1) this.finishMiniGame(survivors[0] ? `${survivors[0].displayName} là người sống sót cuối cùng.` : 'Cả nhóm đã bị vật rơi phủ kín.')
  }

  private completeImpostorTask(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant || participant.role !== 'CREW' || !participant.alive || game.completedTasks >= game.totalTasks) return false
    participant.score += 1
    game.completedTasks += 1
    this.emitMiniGameEvent('TASK_DONE', `${participant.displayName} hoàn thành một nhiệm vụ.`, sessionId, undefined, 'TASK')
    if (game.completedTasks >= game.totalTasks) this.finishMiniGame('Crew đã hoàn thành toàn bộ nhiệm vụ và tìm ra kẻ giả mạo.')
    return true
  }

  private sabotageNearest(sessionId: string) {
    const game = this.state.miniGame
    const impostor = game.attendees.get(sessionId)
    if (!impostor || impostor.role !== 'IMPOSTOR' || !impostor.alive) return false
    const target = this.nearestParticipant(sessionId, MINI_GAME_THROW_DISTANCE, (candidate) => candidate.role === 'CREW' && candidate.alive)
    if (!target) return false
    target.participant.alive = false
    impostor.score += 1
    this.emitMiniGameEvent('SABOTAGED', `${impostor.displayName} đã phá nhiệm vụ của ${target.participant.displayName}!`, sessionId, target.sessionId, 'SABOTAGE')
    const crewAlive = [...game.attendees.values()].some((participant) => participant.role === 'CREW' && participant.alive && participant.connected)
    if (!crewAlive) this.finishMiniGame('Impostor đã loại toàn bộ Crew.')
    return true
  }

  private voteForImpostor(sessionId: string, targetSessionId: string) {
    const game = this.state.miniGame
    const voter = game.attendees.get(sessionId)
    const target = game.attendees.get(targetSessionId)
    if (!voter || voter.role !== 'CREW' || !voter.alive || !target || targetSessionId === sessionId || !target.alive) return false
    voter.choice = targetSessionId
    const crew = [...game.attendees.entries()].filter(([, participant]) => participant.role === 'CREW' && participant.alive && participant.connected)
    const votes = new Map<string, number>()
    crew.forEach(([, participant]) => { if (participant.choice) votes.set(participant.choice, (votes.get(participant.choice) || 0) + 1) })
    if (votes.size === 0 || [...votes.values()].reduce((sum, value) => sum + value, 0) < crew.length) {
      this.emitMiniGameEvent('VOTE_CAST', `${voter.displayName} đã bỏ phiếu.`, sessionId, targetSessionId, 'VOTE')
      return true
    }
    const votedSessionId = [...votes.entries()].sort((left, right) => right[1] - left[1])[0][0]
    const votedParticipant = game.attendees.get(votedSessionId)
    if (votedParticipant?.role === 'IMPOSTOR') {
      this.finishMiniGame(`Crew đã bỏ phiếu đúng: ${votedParticipant.displayName} là Impostor.`)
    } else {
      game.notice = 'Crew đã bỏ phiếu nhầm. Impostor vẫn còn trong game!'
      game.attendees.forEach((participant) => { participant.choice = '' })
      this.emitMiniGameEvent('VOTE_MISSED', 'Cả nhóm bỏ phiếu nhầm rồi!', undefined, votedSessionId, 'VOTE')
    }
    return true
  }

  private resolveBaccarat(sessionId: string, choice: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    const rules = MINI_GAME_CARD_RULES.BACCARAT
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!participant || !player || !user || !(rules.choices as readonly string[]).includes(choice)) return false
    if (studioStore.getSocialProgression(user.studioId, user.id).coinBalance < rules.cost) return false
    const outcome = rules.choices[Math.floor(Math.random() * rules.choices.length)]
    const betNumber = (this.miniGameBets.get(sessionId) || 0) + 1
    if (betNumber > 1) return false
    const reward = studioStore.settleBaccaratBet(user.studioId, player.userId, this.state.miniGame.roundId, betNumber, choice as 'PLAYER' | 'BANKER' | 'TIE', outcome)
    this.miniGameBets.set(sessionId, betNumber)
    participant.choice = choice
    const payout = reward.coinDelta + rules.cost
    if (choice === outcome) {
      participant.wins += 1
      participant.score += 1
    }
    this.state.miniGame.score += 1
    this.sendSocialReward(sessionId, reward)
    this.emitMiniGameEvent('BACCARAT_RESULT', `${participant.displayName} chọn ${choice}; kết quả ${outcome}. ${payout ? `Trả ${payout} coin.` : `Mất ${rules.cost} coin.`} Ví đã cập nhật riêng.`, sessionId, undefined, outcome)
    return true
  }

  private resolveBlackjack(sessionId: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    if (!participant || !player) return false
    const rules = MINI_GAME_CARD_RULES.BLACKJACK
    const betNumber = (this.miniGameBets.get(sessionId) || 0) + 1
    if (betNumber > 1) return false
    const draw = () => 1 + Math.floor(Math.random() * 10)
    const playerTotal = draw() + draw()
    const dealerTotal = draw() + draw()
    const outcome: 'WIN' | 'TIE' | 'LOSS' = playerTotal > 21 ? 'LOSS' : dealerTotal > 21 || playerTotal > dealerTotal ? 'WIN' : playerTotal === dealerTotal ? 'TIE' : 'LOSS'
    const reward = studioStore.settleTableBet(studioStore.getUserById(player.userId)!.studioId, player.userId, 'BLACKJACK', this.state.miniGame.roundId, betNumber, rules.cost, outcome === 'WIN' ? rules.winPayout : outcome === 'TIE' ? rules.tiePayout : 0, { playerTotal, dealerTotal, outcome })
    this.miniGameBets.set(sessionId, betNumber)
    participant.choice = 'BLACKJACK'
    if (outcome === 'WIN') { participant.wins += 1; participant.score += 1 }
    this.state.miniGame.score += 1
    this.sendSocialReward(sessionId, reward)
    this.emitMiniGameEvent('BLACKJACK_RESULT', `${participant.displayName} có ${playerTotal}, nhà cái ${dealerTotal}. ${outcome === 'WIN' ? 'Thắng!' : outcome === 'TIE' ? 'Hòa, hoàn cược.' : 'Thua.'}`, sessionId, undefined, outcome)
    return true
  }

  private resolveSicbo(sessionId: string, choice: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    const rules = MINI_GAME_CARD_RULES.SICBO
    if (!participant || !player || !(rules.choices as readonly string[]).includes(choice)) return false
    const betNumber = (this.miniGameBets.get(sessionId) || 0) + 1
    if (betNumber > 1) return false
    const dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6))
    const total = dice.reduce((sum, value) => sum + value, 0)
    const triple = dice[0] === dice[1] && dice[1] === dice[2]
    const wins = choice === 'SMALL' ? total >= 4 && total <= 10 && !triple : choice === 'BIG' ? total >= 11 && total <= 17 && !triple : choice === 'ODD' ? total % 2 === 1 : total % 2 === 0
    const reward = studioStore.settleTableBet(studioStore.getUserById(player.userId)!.studioId, player.userId, 'SICBO', this.state.miniGame.roundId, betNumber, rules.cost, wins ? rules.winPayout : 0, { choice, dice: dice.join(','), total, triple })
    this.miniGameBets.set(sessionId, betNumber)
    participant.choice = choice
    if (wins) { participant.wins += 1; participant.score += 1 }
    this.state.miniGame.score += 1
    this.sendSocialReward(sessionId, reward)
    this.emitMiniGameEvent('SICBO_RESULT', `${participant.displayName} chọn ${choice}; xúc xắc ${dice.join('-')} = ${total}. ${wins ? 'Đoán đúng!' : 'Đoán trượt.'}`, sessionId, undefined, choice)
    return true
  }

  private resolveBauCua(sessionId: string, choice: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    const rules = MINI_GAME_CARD_RULES.BAU_CUA
    if (!participant || !player || !(rules.choices as readonly string[]).includes(choice)) return false
    const betNumber = (this.miniGameBets.get(sessionId) || 0) + 1
    if (betNumber > 1) return false
    const dice = [0, 1, 2].map(() => rules.choices[Math.floor(Math.random() * rules.choices.length)])
    const matches = dice.filter((item) => item === choice).length
    const reward = studioStore.settleTableBet(studioStore.getUserById(player.userId)!.studioId, player.userId, 'BAU_CUA', this.state.miniGame.roundId, betNumber, rules.cost, matches ? rules.cost * (matches + 1) : 0, { choice, dice: dice.join(','), matches })
    this.miniGameBets.set(sessionId, betNumber)
    participant.choice = choice
    if (matches) { participant.wins += 1; participant.score += matches }
    this.state.miniGame.score += matches
    this.sendSocialReward(sessionId, reward)
    this.emitMiniGameEvent('BAU_CUA_RESULT', `${participant.displayName} chọn ${choice}; kết quả ${dice.join(' · ')}. ${matches ? `Trúng ${matches} mặt!` : 'Chưa trúng.'}`, sessionId, undefined, choice)
    return true
  }

  private chessPieceAt(x: number, y: number) {
    return [...this.state.miniGame.items.values()].find((item) => item.active && item.x === x && item.y === y)
  }

  private chessPathClear(fromX: number, fromY: number, toX: number, toY: number) {
    const stepX = Math.sign(toX - fromX)
    const stepY = Math.sign(toY - fromY)
    let x = fromX + stepX
    let y = fromY + stepY
    while (x !== toX || y !== toY) {
      if (this.chessPieceAt(x, y)) return false
      x += stepX
      y += stepY
    }
    return true
  }

  private legalChessMove(piece: MiniGameItem, fromX: number, fromY: number, toX: number, toY: number) {
    const dx = toX - fromX
    const dy = toY - fromY
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (piece.kind === 'PAWN') {
      const direction = piece.team === 'WHITE' ? -1 : 1
      const startRow = piece.team === 'WHITE' ? 6 : 1
      if (dx === 0 && dy === direction && !this.chessPieceAt(toX, toY)) return true
      if (dx === 0 && dy === direction * 2 && fromY === startRow && !this.chessPieceAt(toX, toY) && !this.chessPieceAt(fromX, fromY + direction)) return true
      return ax === 1 && dy === direction && Boolean(this.chessPieceAt(toX, toY))
    }
    if (piece.kind === 'KNIGHT') return (ax === 1 && ay === 2) || (ax === 2 && ay === 1)
    if (piece.kind === 'KING') return ax <= 1 && ay <= 1 && (ax > 0 || ay > 0)
    if (piece.kind === 'ROOK') return (dx === 0 || dy === 0) && this.chessPathClear(fromX, fromY, toX, toY)
    if (piece.kind === 'BISHOP') return ax === ay && this.chessPathClear(fromX, fromY, toX, toY)
    return (dx === 0 || dy === 0 || ax === ay) && this.chessPathClear(fromX, fromY, toX, toY)
  }

  private moveChess(sessionId: string, fromX?: number, fromY?: number, toX?: number, toY?: number) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant || ![fromX, fromY, toX, toY].every((value) => Number.isInteger(value) && value >= 0 && value <= 7) || participant.team !== game.turnTeam) return false
    const source = this.chessPieceAt(fromX!, fromY!)
    const target = this.chessPieceAt(toX!, toY!)
    if (!source || source.team !== participant.team || target?.team === participant.team || !this.legalChessMove(source, fromX!, fromY!, toX!, toY!)) return false
    if (target) target.active = false
    source.x = toX!
    source.y = toY!
    if (source.kind === 'PAWN' && (source.y === 0 || source.y === 7)) source.kind = 'QUEEN'
    participant.score += 1
    game.score += 1
    game.turnTeam = participant.team === 'WHITE' ? 'BLACK' : 'WHITE'
    this.emitMiniGameEvent('CHESS_MOVE', `${participant.displayName} di chuyển ${source.kind}. Lượt ${game.turnTeam}.`, sessionId, undefined, 'CHESS')
    if (target?.kind === 'KING') this.finishMiniGame(`${participant.displayName} chiếu hết và thắng ván cờ.`)
    return true
  }

  private resolveDiceDuel(sessionId: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    const rules = MINI_GAME_CARD_RULES.DICE_DUEL
    const rollNumber = (this.miniGameRolls.get(sessionId) || 0) + 1
    if (!participant || !player || rollNumber > socialEconomy.diceMaxRollsPerRound) return false
    const progression = studioStore.getSocialProgression(player.userId ? studioStore.getUserById(player.userId)!.studioId : '', player.userId)
    if (progression.coinBalance < socialEconomy.diceEntry) throw new DomainError('INSUFFICIENT_COIN', 'Bạn không đủ Coin để đổ xúc xắc.')
    const playerRoll = 1 + Math.floor(Math.random() * 6)
    const houseRoll = 1 + Math.floor(Math.random() * 6)
    const outcome: 'WIN' | 'TIE' | 'LOSS' = playerRoll > houseRoll ? 'WIN' : playerRoll === houseRoll ? 'TIE' : 'LOSS'
    const payout = outcome === 'WIN' ? rules.winPayout : outcome === 'TIE' ? rules.tiePayout : 0
    const reward = studioStore.settleDiceRoll(studioStore.getUserById(player.userId)!.studioId, player.userId, this.state.miniGame.roundId, rollNumber, outcome)
    this.miniGameRolls.set(sessionId, rollNumber)
    if (playerRoll > houseRoll) {
      participant.wins += 1
      participant.score += 1
    }
    this.state.miniGame.score += 1
    this.sendSocialReward(sessionId, reward)
    this.emitMiniGameEvent('DICE_RESULT', `${participant.displayName} đổ ${playerRoll}; nhà cái đổ ${houseRoll}. ${payout ? `Trả ${payout} Coin.` : `Mất ${rules.cost} Coin.`} Còn ${reward.coinBalance} Coin.`, sessionId, undefined, 'DICE')
    return true
  }

  private resolveLuckyDraw(sessionId: string) {
    const participant = this.state.miniGame.attendees.get(sessionId)
    const player = this.state.players.get(sessionId)
    const rules = MINI_GAME_CARD_RULES.LUCKY_DRAW
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (!participant || !player || !user || studioStore.getSocialProgression(user.studioId, user.id).coinBalance < rules.cost) return false
    const reward = rules.rewards[Math.floor(Math.random() * rules.rewards.length)]
    const betNumber = (this.miniGameBets.get(sessionId) || 0) + 1
    const settlement = studioStore.settleLuckyDraw(user.studioId, player.userId, this.state.miniGame.roundId, betNumber, reward)
    this.miniGameBets.set(sessionId, betNumber)
    if (reward > 0) participant.wins += 1
    participant.score += reward
    this.state.miniGame.score += 1
    this.sendSocialReward(sessionId, settlement)
    this.emitMiniGameEvent('LUCKY_DRAW', `${participant.displayName} rút được ${reward} coin. ${reward ? `Nhận ${reward} coin.` : `Mất ${rules.cost} coin.`} Ví đã cập nhật riêng.`, sessionId, undefined, 'DRAW')
    return true
  }

  private finishMiniGame(message?: string) {
    const game = this.state.miniGame
    if (game.status !== 'COUNTDOWN' && game.status !== 'PLAYING') return
    this.clearMiniGameTimers()
    game.status = 'RESULT'
    game.settlementStatus = 'SETTLING'
    game.endsAt = Date.now()
    game.resultMessage = message || this.defaultMiniGameResult()
    game.notice = game.resultMessage
    game.winnerIds.clear()
    this.miniGameWinnerIds().forEach((sessionId) => game.winnerIds.push(sessionId))
    this.settleMiniGameRewards()
    const roundId = game.roundId
    const partyId = this.activeMiniGamePartyId
    if (partyId) {
      const party = this.parties.get(partyId)
      this.activeMiniGamePartyId = ''
      if (party) {
        party.status = 'OPEN'
        delete party.activity
        party.members = party.members.map((member) => ({ ...member, status: member.status === 'DISCONNECTED' ? member.status : 'JOINED' }))
        party.version += 1
        this.broadcastPartyEvent(party, { type: 'ACTIVITY_FINISHED', message: game.resultMessage })
        this.broadcastParty(party)
      }
    }
    recordSocialMetric(game.resultMessage.includes('hủy') || game.resultMessage.includes('không còn đủ') ? 'social_round_abandoned' : 'social_round_finished', { roundId, gameId: game.gameId, participantCount: game.attendees.size })
    this.emitMiniGameEvent('ROUND_FINISHED', game.resultMessage)
    this.miniGameResetTimer = setTimeout(() => {
      if (this.state.miniGame.roundId !== roundId || this.state.miniGame.status !== 'RESULT') return
      this.resetMiniGameState()
    }, MINI_GAME_RESULT_MS)
  }

  private defaultMiniGameResult() {
    const game = this.state.miniGame
    const ranked = [...game.attendees.values()].sort((left, right) => this.miniGameRankingScore(right) - this.miniGameRankingScore(left))
    const winner = ranked.find((participant) => participant.connected) || ranked[0]
    if (game.mode === 'CAPTURE_FLAG') return `Đội Đỏ ${game.teamRedScore} điểm · Đội Xanh ${game.teamBlueScore} điểm.`
    if (game.mode === 'PAINT_TILES') return `Đội Đỏ ${game.teamRedScore} ô · Đội Xanh ${game.teamBlueScore} ô.`
    return winner ? `${winner.displayName} dẫn đầu với ${this.miniGameRankingScore(winner)} điểm.` : 'Round đã kết thúc.'
  }

  private miniGameRankingScore(participant: MiniGameParticipant) {
    return participant.score
  }

  private miniGameWinnerIds() {
    const game = this.state.miniGame
    if (game.mode === 'CAPTURE_FLAG' || game.mode === 'PAINT_TILES') {
      const winningTeam = game.teamRedScore === game.teamBlueScore ? '' : game.teamRedScore > game.teamBlueScore ? 'RED' : 'BLUE'
      return winningTeam ? [...game.attendees.entries()].filter(([, participant]) => participant.team === winningTeam && participant.connected).map(([sessionId]) => sessionId) : []
    }
    const ranked = [...game.attendees.entries()].sort(([, left], [, right]) => this.miniGameRankingScore(right) - this.miniGameRankingScore(left))
    const winner = ranked.find(([, participant]) => participant.connected) || ranked[0]
    return winner ? [winner[0]] : []
  }

  private settleMiniGameRewards() {
    const game = this.state.miniGame
    const gameId = game.mode as SocialGameId
    if (!socialGameRewards[gameId]?.enabledInMvp) {
      game.settlementStatus = 'SETTLED'
      return
    }
    if (game.mode === 'CHESS') {
      const participants = [...game.attendees.entries()]
      const winnerSessionId = game.winnerIds[0]
      try {
        participants.forEach(([sessionId, participant]) => {
          const player = this.state.players.get(sessionId)
          if (!player || !participant.connected) return
          const user = studioStore.getUserById(participant.userId)
          if (!user) return
          const reward = studioStore.settleTableBet(user.studioId, user.id, 'CHESS', game.roundId, 1, MINI_GAME_CARD_RULES.CHESS.cost, sessionId === winnerSessionId ? MINI_GAME_CARD_RULES.CHESS.winPayout : 0, { winnerSessionId, team: participant.team })
          this.sendSocialReward(sessionId, reward)
        })
        game.settlementStatus = 'SETTLED'
      } catch (error) {
        game.settlementStatus = 'FAILED'
        game.notice = error instanceof DomainError ? error.message : 'Không thể settle ván cờ.'
      }
      return
    }
    if (!socialGameRewards[gameId].free) {
      game.settlementStatus = 'SETTLED'
      return
    }
    const participants = [...game.attendees.entries()].map(([sessionId, participant]) => ({
      userId: participant.userId,
      score: participant.score,
      team: participant.team,
      eligible: participant.connected && Boolean(this.state.players.get(sessionId)?.online) && this.state.players.get(sessionId)?.currentRoom === 'LOBBY',
      sessionId,
    }))
    try {
      const rewards = this.settleRoundRewards(game.roundId, gameId, game.winnerIds.map((sessionId) => game.attendees.get(sessionId)?.userId || '').filter(Boolean), participants)
      rewards.forEach((reward) => {
        const recipient = participants.find((participant) => participant.userId === reward.userId)
        if (recipient) this.sendSocialReward(recipient.sessionId, reward)
      })
      game.settlementStatus = 'SETTLED'
    } catch (error) {
      game.settlementStatus = 'FAILED'
      game.notice = error instanceof DomainError ? error.message : 'Không thể settle reward của round.'
    }
  }

  private sendSocialReward(sessionId: string, reward: unknown) {
    const player = this.state.players.get(sessionId)
    const user = player ? studioStore.getUserById(player.userId) : undefined
    if (player && user) {
      const loadout = studioStore.getSocialLoadout(user.studioId, user.id)
      // Coin changes can revoke a title. Keep the live player label in sync
      // before sending the reward response to the client.
      player.nameplateId = loadout.nameplateId || 'nameplate-basic'
      player.titleId = loadout.titleId || ''
    }
    this.clients.forEach((client) => {
      if (client.sessionId === sessionId) client.send(Message.SOCIAL_REWARD, reward)
    })
  }

  private resetMiniGameState() {
    const game = this.state.miniGame
    game.mode = ''
    game.gameId = ''
    game.status = 'IDLE'
    game.roundId = ''
    game.startedBy = ''
    game.leaderSessionId = ''
    game.targetColor = ''
    game.turnTeam = ''
    game.teamRedScore = 0
    game.teamBlueScore = 0
    game.startedAt = 0
    game.endsAt = 0
    game.score = 0
    game.totalTasks = 0
    game.completedTasks = 0
    game.minPlayers = 2
    game.maxPlayers = 8
    game.spectatorCount = 0
    game.settlementStatus = 'NONE'
    game.winnerIds.clear()
    game.resultMessage = ''
    game.notice = ''
    game.attendees.clear()
    game.items.clear()
    game.boardCells.clear()
    this.miniGameLastActionAt.clear()
    this.miniGameRolls.clear()
    this.miniGameBets.clear()
    this.activeMiniGamePartyId = ''
  }

  private handleMiniGameLeave(sessionId: string) {
    const game = this.state.miniGame
    const participant = game.attendees.get(sessionId)
    if (!participant) return
    participant.connected = false
    participant.alive = false
    if (this.activeMiniGameAttendeeCount() < game.minPlayers) {
      this.finishMiniGame('Game kết thúc vì không còn đủ người tham gia.')
      return
    }
    if (game.leaderSessionId !== sessionId) return
    const next = [...game.attendees.entries()].find(([candidateSessionId, candidate]) => candidate.connected && this.state.players.get(candidateSessionId)?.online)
    if (!next) return
    game.leaderSessionId = next[0]
    if (game.mode === 'HIDE_SEEK' || game.mode === 'FREEZE_TAG' || game.mode === 'IMPOSTOR') {
      game.attendees.forEach((candidate) => {
        if (candidate.role === 'SEEKER' || candidate.role === 'TAGGER' || candidate.role === 'IMPOSTOR') candidate.role = game.mode === 'HIDE_SEEK' ? 'HIDER' : game.mode === 'IMPOSTOR' ? 'CREW' : 'RUNNER'
      })
      const nextParticipant = next[1]
      nextParticipant.role = game.mode === 'HIDE_SEEK' ? 'SEEKER' : game.mode === 'IMPOSTOR' ? 'IMPOSTOR' : 'TAGGER'
      nextParticipant.hidden = false
      if (game.mode === 'IMPOSTOR') nextParticipant.alive = true
    } else if (game.mode === 'HOT_BOMB') {
      const bombHolder = [...game.attendees.values()].find((candidate) => candidate.hasBomb && candidate.connected)
      if (!bombHolder) next[1].hasBomb = true
      next[1].role = 'BOMB HOLDER'
    }
  }

  private activeMiniGameAttendeeCount() {
    let count = 0
    const requiredRoom = this.isCardRoomMode(this.state.miniGame.mode as MiniGameMode) ? 'CARD_ROOM' : 'LOBBY'
    this.state.miniGame.attendees.forEach((participant, sessionId) => {
      const player = this.state.players.get(sessionId)
      const roomMatches = requiredRoom === 'CARD_ROOM' ? Boolean(player && this.isCardRoomLocation(player.currentRoom)) : player?.currentRoom === requiredRoom
      if (participant.connected && player?.online && roomMatches) count += 1
    })
    return count
  }

  private settleRoundRewards(
    roundId: string,
    gameId: SocialGameId,
    winnerIds: string[],
    participants: Array<{ userId: string; score: number; team?: string; eligible?: boolean; sessionId: string }>
  ) {
    const rewards = [] as ReturnType<typeof studioStore.settleSocialRound>
    const byStudio = new Map<string, typeof participants>()
    participants.forEach((participant) => {
      const user = studioStore.getUserById(participant.userId)
      if (!user) return
      const studioParticipants = byStudio.get(user.studioId) || []
      studioParticipants.push(participant)
      byStudio.set(user.studioId, studioParticipants)
    })
    byStudio.forEach((studioParticipants, studioId) => {
      rewards.push(...studioStore.settleSocialRound(studioId, { roundId, gameId, winnerIds, participants: studioParticipants }))
    })
    return rewards
  }

  private isCardRoomMode(mode: MiniGameMode) {
    return mode === 'BACCARAT' || mode === 'BLACKJACK' || mode === 'POKER' || mode === 'SICBO' || mode === 'BAU_CUA' || mode === 'CHESS' || mode === 'TIEN_LEN' || mode === 'DICE_DUEL' || mode === 'LUCKY_DRAW'
  }

  private isCardRoomLocation(room: string) {
    return room === 'CARD_ROOM' || room === 'GAME_LOUNGE' || room === 'ARCADE'
  }

  private cardGameCanPlaySolo(mode: MiniGameMode) {
    return this.isCardRoomMode(mode) && mode !== 'CHESS'
  }

  private miniGameCost(mode: MiniGameMode) {
    if (mode === 'BACCARAT') return MINI_GAME_CARD_RULES.BACCARAT.cost
    if (mode === 'BLACKJACK') return MINI_GAME_CARD_RULES.BLACKJACK.cost
    if (mode === 'SICBO') return MINI_GAME_CARD_RULES.SICBO.cost
    if (mode === 'BAU_CUA') return MINI_GAME_CARD_RULES.BAU_CUA.cost
    if (mode === 'CHESS') return MINI_GAME_CARD_RULES.CHESS.cost
    if (mode === 'DICE_DUEL') return socialEconomy.diceEntry
    if (mode === 'LUCKY_DRAW') return MINI_GAME_CARD_RULES.LUCKY_DRAW.cost
    return 0
  }

  private teamMode(mode: MiniGameMode) {
    return mode === 'CAPTURE_FLAG' || mode === 'PAINT_TILES'
  }

  private miniGameDefinition(mode: MiniGameMode) {
    return MINI_GAME_MODES.find((definition) => definition.id === mode) || MINI_GAME_MODES[0]
  }

  private emitMiniGameEvent(type: string, message: string, sessionId?: string, targetSessionId?: string, item?: string) {
    const payload: MiniGameEventPayload = {
      type,
      message,
      mode: this.state.miniGame.mode,
      sessionId,
      targetSessionId,
      item,
      score: this.state.miniGame.score,
    }
    this.state.miniGame.notice = message
    this.broadcast(Message.MINI_GAME_EVENT, payload)
  }

  private sendMiniGameError(client: Client, message: string) {
    client.send(Message.MINI_GAME_ERROR, { message })
  }

  private clearMiniGameTimers() {
    if (this.miniGameStartTimer) clearTimeout(this.miniGameStartTimer)
    if (this.miniGameEndTimer) clearTimeout(this.miniGameEndTimer)
    if (this.miniGameResetTimer) clearTimeout(this.miniGameResetTimer)
    if (this.miniGameTickTimer) clearInterval(this.miniGameTickTimer)
    this.miniGameStartTimer = undefined
    this.miniGameEndTimer = undefined
    this.miniGameResetTimer = undefined
    this.miniGameTickTimer = undefined
  }

  private startTagGame(client: Client) {
    const player = this.state.players.get(client.sessionId)
    if (!player || !TAG_GAME_ADMIN_ROLES.includes(player.role)) {
      this.sendTagGameError(client, 'Chỉ Admin hoặc Owner mới có thể mở game.')
      return
    }

    if (this.state.tagGame.status === 'COUNTDOWN' || this.state.tagGame.status === 'PLAYING') {
      this.sendTagGameError(client, 'Một lượt đuổi bắt đang diễn ra rồi.')
      return
    }

    const attendees = [...this.state.players.entries()].filter(([, candidate]) => candidate.online && candidate.currentRoom === 'LOBBY')
    if (attendees.length < 2) {
      this.sendTagGameError(client, 'Cần ít nhất 2 người đang ở Studio Commons để điểm danh và bắt đầu game.')
      return
    }

    this.clearTagGameTimers()
    this.tagGameBlockedSessionId = ''
    this.lastTagAt = 0

    const game = this.state.tagGame
    const now = Date.now()
    game.attendees.clear()
    attendees.forEach(([sessionId, attendee]) => {
      const participant = new TagGameParticipant()
      participant.userId = attendee.userId
      participant.displayName = attendee.name
      participant.connected = true
      game.attendees.set(sessionId, participant)
    })

    const attendeeIds = attendees.map(([sessionId]) => sessionId)
    game.status = 'COUNTDOWN'
    game.gameId = 'tag'
    game.roundId = `tag-${now}`
    game.startedBy = player.userId
    game.taggerSessionId = attendeeIds[Math.floor(Math.random() * attendeeIds.length)]
    game.score = 0
    game.settlementStatus = 'NONE'
    game.winnerIds.clear()
    game.startedAt = now + TAG_GAME_COUNTDOWN_MS
    game.endsAt = game.startedAt + TAG_GAME_DURATION_MS
    game.resultMessage = ''

    recordSocialMetric('social_round_started', { roundId: game.roundId, gameId: game.gameId, participantCount: attendees.length })
    const roundId = game.roundId
    this.tagGameStartTimer = setTimeout(() => this.beginTagGame(roundId), TAG_GAME_COUNTDOWN_MS)
  }

  private beginTagGame(roundId: string) {
    const game = this.state.tagGame
    if (game.roundId !== roundId || game.status !== 'COUNTDOWN') return
    if (this.activeTagGameAttendeeCount() < 2) {
      this.finishTagGame('Game bị hủy vì không còn đủ người tham gia.')
      return
    }
    game.status = 'PLAYING'
    game.startedAt = Date.now()
    game.endsAt = game.startedAt + TAG_GAME_DURATION_MS
    this.tagGameEndTimer = setTimeout(() => this.finishTagGame(), TAG_GAME_DURATION_MS)
  }

  private finishTagGame(message?: string) {
    const game = this.state.tagGame
    if (game.status !== 'COUNTDOWN' && game.status !== 'PLAYING') return
    this.clearTagGameTimers()
    game.status = 'RESULT'
    game.endsAt = Date.now()
    game.resultMessage = message || `Cả nhóm đã thực hiện ${game.score} lượt bắt.`
    game.winnerIds.clear()
    this.tagGameWinnerIds().forEach((sessionId) => game.winnerIds.push(sessionId))
    game.settlementStatus = 'SETTLING'
    try {
      const participants = [...game.attendees.entries()].map(([sessionId, participant]) => ({ userId: participant.userId, score: participant.tagCount, eligible: participant.connected && Boolean(this.state.players.get(sessionId)?.online) && this.state.players.get(sessionId)?.currentRoom === 'LOBBY', sessionId }))
      const rewards = this.settleRoundRewards(game.roundId, 'TAG', game.winnerIds.map((sessionId) => game.attendees.get(sessionId)?.userId || '').filter(Boolean), participants)
      rewards.forEach((reward) => {
        const recipient = participants.find((participant) => participant.userId === reward.userId)
        if (recipient) this.sendSocialReward(recipient.sessionId, reward)
      })
      game.settlementStatus = 'SETTLED'
    } catch (error) {
      game.settlementStatus = 'FAILED'
      game.resultMessage = error instanceof DomainError ? error.message : 'Không thể settle reward của Tag Game.'
    }
    const roundId = game.roundId
    recordSocialMetric(message?.includes('hủy') || message?.includes('không còn đủ') ? 'social_round_abandoned' : 'social_round_finished', { roundId, gameId: 'TAG', participantCount: game.attendees.size })
    this.tagGameResetTimer = setTimeout(() => {
      if (this.state.tagGame.roundId !== roundId || this.state.tagGame.status !== 'RESULT') return
      this.state.tagGame.status = 'IDLE'
      this.state.tagGame.roundId = ''
      this.state.tagGame.startedBy = ''
      this.state.tagGame.taggerSessionId = ''
      this.state.tagGame.score = 0
      this.state.tagGame.settlementStatus = 'NONE'
      this.state.tagGame.winnerIds.clear()
      this.state.tagGame.startedAt = 0
      this.state.tagGame.endsAt = 0
      this.state.tagGame.resultMessage = ''
      this.state.tagGame.attendees.clear()
    }, TAG_GAME_RESULT_MS)
  }

  private checkTagGameCollision() {
    const game = this.state.tagGame
    if (game.status !== 'PLAYING') return
    const now = Date.now()
    if (now >= game.endsAt) {
      this.finishTagGame()
      return
    }
    if (now - this.lastTagAt < TAG_GAME_TAG_COOLDOWN_MS) return

    const tagger = this.state.players.get(game.taggerSessionId)
    const taggerParticipant = game.attendees.get(game.taggerSessionId)
    if (!tagger || !taggerParticipant?.connected || tagger.currentRoom !== 'LOBBY') return

    let targetSessionId = ''
    let targetDistance = Number.POSITIVE_INFINITY
    game.attendees.forEach((participant, sessionId) => {
      if (sessionId === game.taggerSessionId || !participant.connected || sessionId === this.tagGameBlockedSessionId) return
      const target = this.state.players.get(sessionId)
      if (!target || target.currentRoom !== 'LOBBY') return
      const distance = Math.hypot(target.x - tagger.x, target.y - tagger.y)
      if (distance <= TAG_GAME_TAG_DISTANCE && distance < targetDistance) {
        targetSessionId = sessionId
        targetDistance = distance
      }
    })

    if (!targetSessionId) {
      if (this.tagGameBlockedSessionId) {
        const blockedTarget = this.state.players.get(this.tagGameBlockedSessionId)
        if (!blockedTarget || Math.hypot(blockedTarget.x - tagger.x, blockedTarget.y - tagger.y) > TAG_GAME_TAG_DISTANCE * 1.75) {
          this.tagGameBlockedSessionId = ''
        }
      }
      return
    }

    const previousTaggerSessionId = game.taggerSessionId
    const targetParticipant = game.attendees.get(targetSessionId)
    if (!targetParticipant) return

    targetParticipant.tagCount += 1
    game.taggerSessionId = targetSessionId
    game.score += 1
    this.lastTagAt = now
    this.tagGameBlockedSessionId = previousTaggerSessionId
    this.broadcast(Message.TAG_GAME_TAGGED, {
      previousTaggerSessionId,
      taggerSessionId: targetSessionId,
      displayName: targetParticipant.displayName,
      score: game.score,
    })
  }

  private tagGameWinnerIds() {
    const ranked = [...this.state.tagGame.attendees.entries()].filter(([, participant]) => participant.connected).sort(([, left], [, right]) => right.tagCount - left.tagCount)
    if (!ranked.length) return []
    const topScore = ranked[0][1].tagCount
    return ranked.filter(([, participant]) => participant.tagCount === topScore).map(([sessionId]) => sessionId)
  }

  private assignNextTaggerOrFinish() {
    const game = this.state.tagGame
    if (game.status !== 'COUNTDOWN' && game.status !== 'PLAYING') return
    if (this.activeTagGameAttendeeCount() < 2) {
      this.finishTagGame('Game kết thúc vì không còn đủ người tham gia.')
      return
    }
    const nextTagger = [...game.attendees.entries()].find(([sessionId, participant]) => {
      const player = this.state.players.get(sessionId)
      return participant.connected && player?.online && player.currentRoom === 'LOBBY'
    })
    if (!nextTagger) {
      this.finishTagGame('Game kết thúc vì Người bắt đã rời Studio Commons.')
      return
    }
    game.taggerSessionId = nextTagger[0]
    this.tagGameBlockedSessionId = ''
  }

  private activeTagGameAttendeeCount() {
    let count = 0
    this.state.tagGame.attendees.forEach((participant, sessionId) => {
      if (participant.connected && this.state.players.get(sessionId)?.online) count += 1
    })
    return count
  }

  private sendTagGameError(client: Client, message: string) {
    client.send(Message.TAG_GAME_ERROR, { message })
  }

  private clearTagGameTimers() {
    if (this.tagGameStartTimer) clearTimeout(this.tagGameStartTimer)
    if (this.tagGameEndTimer) clearTimeout(this.tagGameEndTimer)
    if (this.tagGameResetTimer) clearTimeout(this.tagGameResetTimer)
    this.tagGameStartTimer = undefined
    this.tagGameEndTimer = undefined
    this.tagGameResetTimer = undefined
  }
}
