import { Client, Room } from 'colyseus.js'
import { IComputer, IOfficeState, IPlayer, IWhiteboard } from '../../../types/IOfficeState'
import type { IWorldState, WorldId } from '../../../types/IWorldState'
import { Message } from '../../../types/Messages'
import { RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import { ITagGameState, TagGameSnapshot } from '../../../types/TagGame'
import { IMiniGameState, MiniGameActionPayload, MiniGameEventPayload, MiniGameMode, MiniGameSnapshot } from '../../../types/MiniGame'
import type { FishingCastState, FishingCatchReceipt } from '../../../types/Fishing'
import { SocialEmoteEvent, SocialEmotePayload, SocialPartyActionPayload, SocialPartyError, SocialPartyInvite, SocialPartyState, SocialReward } from '../../../types/Social'
import { CasinoActionPayload, CasinoEventPayload, CasinoGameMode, CasinoTableSnapshot, ICasinoTableState } from '../../../types/Casino'
import { CombatActionPayload, CombatEventPayload } from '../../../types/Combat'
import { TienLenActionPayload, TienLenPrivateState } from '../../../types/TienLen'
import { TexasHoldemPublicState } from '../../../types/TexasHoldem'
import { RpsActionPayload, RpsPrivateState } from '../../../types/Rps'
import { GameChatChannel, GameChatClientPayload, GameChatServerPayload } from '../../../types/GameChat'
import { WorkActionPayload, WorkCancelPayload, WorkCertificationResult, WorkChallengePublic, WorkReward, WorkStartPayload, WorkSubmitPayload } from '../../../types/Work'
import type { CharacterConfig } from '../../../types/Avatar'
import WebRTC from '../web/WebRTC'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap, setCurrentRoom } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
  setRoomJoined,
} from '../stores/RoomStore'
import { setActiveWorld, setWorldError, setWorldMapLoading, setWorldOwner, setWorldTransition } from '../stores/WorldStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from '../stores/ChatStore'
import { setWhiteboardUrls } from '../stores/WhiteboardStore'

export default class Network {
  private client: Client
  private room?: Room<IOfficeState | IWorldState>
  private lobby?: Room
  webRTC?: WebRTC

  mySessionId!: string
  private lastPlayerUpdateAt = 0
  private lastPlayerUpdate = ''
  private latestTagGame?: TagGameSnapshot
  private latestMiniGame?: MiniGameSnapshot
  private tagGameBound = false
  private miniGameBound = false
  private latestCasinoTables = new Map<CasinoGameMode, CasinoTableSnapshot>()
  private casinoTablesBound = false
  private latestTienLenState?: TienLenPrivateState
  private latestTexasState?: TexasHoldemPublicState
  private latestRpsState?: RpsPrivateState
  private latestParty?: SocialPartyState
  private lobbyJoinPromise?: Promise<void>
  private roomRequestSequence = 0
  private roomGeneration = 0
  private activeWorld: 'PUBLIC' | WorldId = 'PUBLIC'
  private latestHomeLayout?: unknown

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    const configuredEndpoint = import.meta.env.VITE_SERVER_URL?.trim()
    const isLocalPreview = import.meta.env.DEV || window.location.port === '3001' || window.location.port === '4173'
    if (!configuredEndpoint && !isLocalPreview) {
      throw new Error('VITE_SERVER_URL is required for the deployed multiplayer client.')
    }
    const endpoint = configuredEndpoint || `${protocol}//${window.location.hostname}:2567`
    this.client = new Client(endpoint)
    this.joinLobbyRoom().then(() => {
      store.dispatch(setLobbyJoined(true))
    }).catch(() => store.dispatch(setLobbyJoined(false)))

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_NAMEPLATE_CHANGE, this.updatePlayerNameplate, this)
    phaserEvents.on(Event.MY_PLAYER_TITLE_CHANGE, this.updatePlayerNameplate, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    if (this.lobby) return
    if (this.lobbyJoinPromise) return this.lobbyJoinPromise
    const pending = this.client.joinOrCreate(RoomType.LOBBY).then((lobby) => {
      if (this.lobby) {
        void lobby.leave().catch(() => undefined)
        return
      }
      this.lobby = lobby

      lobby.onMessage('rooms', (rooms) => {
        store.dispatch(setAvailableRooms(rooms))
      })

      lobby.onMessage('+', ([roomId, room]) => {
        store.dispatch(addAvailableRooms({ roomId, room }))
      })

      lobby.onMessage('-', (roomId) => {
        store.dispatch(removeAvailableRooms(roomId))
      })
    }).finally(() => {
      if (this.lobbyJoinPromise === pending) this.lobbyJoinPromise = undefined
    })
    this.lobbyJoinPromise = pending
    return pending
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    const requestSequence = ++this.roomRequestSequence
    this.beginWorldTransition('LEAVING')
    const previousRoom = this.room
    this.invalidateRoom()
    try { await previousRoom?.leave() } catch { /* switching rooms after a dropped socket is safe */ }
    this.webRTC?.destroy()
    this.webRTC = undefined
    this.resetRoomCaches()
    let room: Room<IOfficeState | IWorldState>
    try {
      this.beginWorldTransition('JOINING')
      room = await this.client.joinOrCreate<IOfficeState | IWorldState>(RoomType.PUBLIC, this.getAuthOptions())
    } catch (error) {
      if (requestSequence === this.roomRequestSequence) await this.restoreLobby()
      throw error
    }
    if (requestSequence !== this.roomRequestSequence) {
      await room.leave().catch(() => undefined)
      return
    }
    this.room = room
    this.activeWorld = 'PUBLIC'
    this.initialize()
  }

  async joinFishing(): Promise<void> {
    await this.joinWorld(RoomType.FISHING, { worldId: 'FISHING', mapId: 'fishing_riverbend_v1' }, 'FISHING')
  }

  async joinHome(ownerId: string): Promise<void> {
    const normalizedOwnerId = String(ownerId || '').trim()
    if (!normalizedOwnerId) throw new Error('A Home owner is required.')
    await this.joinWorld(RoomType.HOME, { worldId: 'HOME', ownerId: normalizedOwnerId, mapId: 'home_room_v1' }, 'HOME')
  }

  async returnToPublic(): Promise<void> {
    await this.joinOrCreatePublic()
  }

  private async joinWorld(roomType: RoomType, worldOptions: { worldId: WorldId; ownerId?: string; mapId: string }, worldId: WorldId): Promise<void> {
    const requestSequence = ++this.roomRequestSequence
    this.beginWorldTransition('LEAVING')
    const previousRoom = this.room
    this.invalidateRoom()
    try { await previousRoom?.leave() } catch { /* switching worlds after a dropped socket is safe */ }
    this.webRTC?.destroy()
    this.webRTC = undefined
    this.resetRoomCaches()
    this.beginWorldTransition('JOINING')
    let room: Room<IOfficeState | IWorldState>
    try {
      room = await this.client.joinOrCreate<IOfficeState | IWorldState>(roomType, { ...worldOptions, ...this.getAuthOptions() })
    } catch (error) {
      if (requestSequence === this.roomRequestSequence) {
        const failure = this.describeWorldJoinFailure(error, worldId)
        store.dispatch(setWorldError(failure))
        phaserEvents.emit(Event.WORLD_ERROR, failure)
        phaserEvents.emit(Event.WORLD_TRANSITION, { status: 'ERROR' })
        await this.restoreLobby()
      }
      throw error
    }
    if (requestSequence !== this.roomRequestSequence) {
      await room.leave().catch(() => undefined)
      return
    }
    this.activeWorld = worldId
    this.room = room
    this.initialize()
  }

  private describeWorldJoinFailure(error: unknown, worldId: WorldId) {
    const candidate = error as { code?: unknown; message?: unknown } | undefined
    const code = typeof candidate?.code === 'number' ? String(candidate.code) : String(candidate?.code || '')
    const message = typeof candidate?.message === 'string' ? candidate.message : 'Không thể vào destination world.'
    const isFishingCapacityError = worldId === 'FISHING'
      && (code === '4211' || code === '4213' || /full|maximum|capacity|no seats|already full/i.test(message))
    if (isFishingCapacityError) {
      return { code: 'WORLD_FULL', message: 'Fishing world đang đầy (tối đa 100 người). Vui lòng thử lại sau.' }
    }
    return { code: 'WORLD_JOIN_FAILED', message }
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    const requestSequence = ++this.roomRequestSequence
    this.beginWorldTransition('LEAVING')
    const previousRoom = this.room
    this.invalidateRoom()
    try { await previousRoom?.leave() } catch { /* switching rooms after a dropped socket is safe */ }
    this.webRTC?.destroy()
    this.webRTC = undefined
    this.resetRoomCaches()
    let room: Room<IOfficeState | IWorldState>
    try {
      this.beginWorldTransition('JOINING')
      room = await this.client.joinById<IOfficeState | IWorldState>(roomId, { password, ...this.getAuthOptions() })
    } catch (error) {
      if (requestSequence === this.roomRequestSequence) await this.restoreLobby()
      throw error
    }
    if (requestSequence !== this.roomRequestSequence) {
      await room.leave().catch(() => undefined)
      return
    }
    this.room = room
    this.activeWorld = 'PUBLIC'
    this.initialize()
  }

  private beginWorldTransition(status: 'LEAVING' | 'JOINING') {
    store.dispatch(setWorldTransition(status))
    phaserEvents.emit(Event.WORLD_TRANSITION, { status })
  }

  /**
   * Colyseus can deliver a final state patch/message after leave() resolves.
   * Invalidate the captured room before starting a transition so those late
   * callbacks cannot mutate the next destination scene or its stores.
   */
  private invalidateRoom() {
    this.roomGeneration += 1
    this.room = undefined
  }

  private isWorldState(state: IOfficeState | IWorldState): state is IWorldState {
    const candidate = state as Partial<IWorldState>
    return candidate?.worldId === 'FISHING' || candidate?.worldId === 'HOME'
  }

  private parseJson(value: string): unknown {
    try { return JSON.parse(value) } catch { return undefined }
  }

  getActiveWorld(): 'PUBLIC' | WorldId {
    return this.activeWorld
  }

  getLatestHomeLayout(): unknown {
    return this.latestHomeLayout
  }

  getPlayers(): IOfficeState['players'] | undefined {
    return this.room?.state.players
  }

  private getAuthOptions() {
    const user = store.getState().user
    return { token: user.authToken, userId: user.authUser?.id, displayName: user.displayName, role: user.authUser?.role }
  }

  private resetRoomCaches() {
    this.lastPlayerUpdateAt = 0
    this.lastPlayerUpdate = ''
    this.latestTagGame = undefined
    this.latestMiniGame = undefined
    this.latestCasinoTables.clear()
    this.latestTienLenState = undefined
    this.latestTexasState = undefined
    this.latestRpsState = undefined
    this.latestParty = undefined
    this.tagGameBound = false
    this.miniGameBound = false
    this.casinoTablesBound = false
  }

  private async restoreLobby() {
    try {
      await this.joinLobbyRoom()
      store.dispatch(setLobbyJoined(true))
    } catch {
      store.dispatch(setLobbyJoined(false))
    }
  }

  // set up all network listeners before the game starts
  initialize() {
    const room = this.room
    if (!room) return
    const generation = ++this.roomGeneration
    const isCurrentRoom = () => this.room === room && this.roomGeneration === generation

    // Colyseus can resolve the seat reservation before the first schema patch
    // has populated the room state. Destination rooms must wait for that patch
    // instead of trying to bind listeners to an undefined players map.
    const roomState = room.state as { players?: unknown } | undefined
    if (!roomState?.players) {
      room.onStateChange(() => {
        if (isCurrentRoom() && (room.state as { players?: unknown } | undefined)?.players) this.initialize()
      })
      return
    }

    const onMessage = (message: Message, handler: (payload: any) => void) => {
      room.onMessage(message, (payload: any) => {
        if (isCurrentRoom()) handler(payload)
      })
    }

    const lobby = this.lobby
    this.lobby = undefined
    void lobby?.leave().catch(() => undefined)
    this.mySessionId = room.sessionId
    store.dispatch(setSessionId(room.sessionId))
    this.webRTC = new WebRTC(this.mySessionId, this)
    // joinWorld records the requested destination before the first schema
    // patch arrives. Use it as a short-lived fallback if Colyseus has not
    // decoded worldId yet, so a destination cannot be rendered as PUBLIC.
    const stateWorld = room.state as Partial<IWorldState> | undefined
    const isWorldRoom = this.isWorldState(room.state) || this.activeWorld !== 'PUBLIC'

    // new instance added to the players MapSchema
    room.state.players.onAdd = (player: IPlayer, key: string) => {
      if (!isCurrentRoom() || key === this.mySessionId) return

      let announced = false
      const announceJoined = () => {
        if (announced || !isCurrentRoom() || !player.name) return
        announced = true
        phaserEvents.emit(Event.PLAYER_JOINED, player, key)
        store.dispatch(setPlayerNameMap({ id: key, name: player.name }))
        store.dispatch(pushPlayerJoinedMessage(player.name))
      }

      // track changes on every child object inside the players MapSchema
      player.onChange = (changes) => {
        if (!isCurrentRoom()) return
        changes.forEach((change) => {
          if (!isCurrentRoom()) return
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

          // when a new player finished setting up player name
          if (field === 'name' && value !== '') {
            announceJoined()
          }
        })
      }
      // WorldRoom and the authenticated SkyOffice room both hydrate the name
      // before putting the player in the MapSchema. Do not wait for a later
      // name mutation or remote players can be missing from a live scene.
      announceJoined()
    }

    // an instance removed from the players MapSchema
    room.state.players.onRemove = (player: IPlayer, key: string) => {
      if (!isCurrentRoom()) return
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      this.webRTC?.deleteVideoStream(key)
      this.webRTC?.deleteOnCalledVideoStream(key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    }

    if (!isWorldRoom) {
      const officeState = room.state as IOfficeState
      // new instance added to the computers MapSchema
      officeState.computers.onAdd = (computer: IComputer, key: string) => {
      if (!isCurrentRoom()) return
      // track changes on every child object's connectedUser
      computer.connectedUser.onAdd = (item, index) => {
        if (!isCurrentRoom()) return
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
      }
      computer.connectedUser.onRemove = (item, index) => {
        if (!isCurrentRoom()) return
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
      }
    }

      // new instance added to the whiteboards MapSchema
      officeState.whiteboards.onAdd = (whiteboard: IWhiteboard, key: string) => {
      if (!isCurrentRoom()) return
      store.dispatch(
        setWhiteboardUrls({
          whiteboardId: key,
          roomId: whiteboard.roomId,
        })
      )
      // track changes on every child object's connectedUser
      whiteboard.connectedUser.onAdd = (item, index) => {
        if (!isCurrentRoom()) return
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
      }
      whiteboard.connectedUser.onRemove = (item, index) => {
        if (!isCurrentRoom()) return
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
      }
      }
    }

    // new instance added to the chatMessages ArraySchema
    room.state.chatMessages.onAdd = (item, index) => {
      if (!isCurrentRoom()) return
      store.dispatch(pushChatMessage(item))
    }

    // Older servers may not expose the optional game states yet. On the
    // client, nested schema fields can arrive on the first state patch after
    // initialize(), so bind immediately and retry on every state sync until
    // each state is available.
    const bindGameStates = () => {
      if (!isCurrentRoom()) return
      const officeState = !isWorldRoom ? room.state as IOfficeState : undefined
      const tagGame = officeState?.tagGame
      if (!this.tagGameBound && tagGame?.attendees) {
        this.tagGameBound = true
        this.bindTagGameState(tagGame, isCurrentRoom)
      }
      const miniGame = officeState?.miniGame
      if (!this.miniGameBound && miniGame?.attendees) {
        this.miniGameBound = true
        this.bindMiniGameState(miniGame, isCurrentRoom)
      }
      const casinoTables = officeState?.casinoTables
      if (!this.casinoTablesBound && casinoTables) {
        this.casinoTablesBound = true
        this.bindCasinoTables(casinoTables, isCurrentRoom)
      }
    }
    bindGameStates()
    room.onStateChange(() => {
      if (isCurrentRoom()) bindGameStates()
    })

    if (isWorldRoom) {
      const worldState = room.state as IWorldState
      const worldId = this.isWorldState(room.state) ? worldState.worldId : this.activeWorld as WorldId
      const syncWorldState = () => {
        if (!isCurrentRoom() || !this.isWorldState(room.state)) return
        this.latestHomeLayout = worldState.layoutJson ? this.parseJson(worldState.layoutJson) : undefined
        // The first Colyseus patch can contain worldId before ownerId. Keep
        // the Home editor in owner mode once the authoritative owner field
        // arrives instead of leaving the owner stuck in guest view.
        if (worldState.worldId === 'HOME' && worldState.ownerId && store.getState().world.ownerId !== worldState.ownerId) {
          store.dispatch(setWorldOwner(worldState.ownerId))
        }
        if (worldState.worldId === 'HOME' && this.latestHomeLayout) phaserEvents.emit(Event.HOME_LAYOUT_UPDATED, this.latestHomeLayout)
      }
      syncWorldState()
      room.onStateChange(() => {
        if (isCurrentRoom()) syncWorldState()
      })
      store.dispatch(setActiveWorld({ worldId, ownerId: stateWorld?.ownerId || '' }))
      store.dispatch(setCurrentRoom(worldId))
      store.dispatch(setWorldMapLoading('READY'))
      phaserEvents.emit(Event.WORLD_JOINED, { worldId, ownerId: stateWorld?.ownerId || '', mapId: stateWorld?.mapId || '' })
    } else {
      this.latestHomeLayout = undefined
      store.dispatch(setActiveWorld({ worldId: 'PUBLIC' }))
      store.dispatch(setCurrentRoom('PUBLIC'))
      store.dispatch(setWorldMapLoading('READY'))
      phaserEvents.emit(Event.WORLD_JOINED, { worldId: 'PUBLIC' })
    }
    // Keep the room-selection/login flow independent from Phaser preload
    // timing. The room is now hydrated and safe for the UI to use.
    store.dispatch(setRoomJoined(true))

    // when the server sends room data
    onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // when a user sends a message
    onMessage(Message.ADD_CHAT_MESSAGE, ({ clientId, content }) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, clientId, content)
    })

    onMessage(Message.FISHING_CATCH_RESULT, (payload: FishingCatchReceipt) => {
      phaserEvents.emit(Event.FISHING_CATCH_RESULT, payload)
    })

    onMessage(Message.FISHING_CAST_STATE, (payload: FishingCastState) => {
      phaserEvents.emit(Event.FISHING_CAST_STATE, payload)
    })

    onMessage(Message.FISHING_CATCH_ERROR, (payload: { code: string; message: string; requestId?: string }) => {
      phaserEvents.emit(Event.FISHING_CATCH_ERROR, payload)
    })

    // when a peer disconnects with myPeer
    onMessage(Message.DISCONNECT_STREAM, (clientId: string) => {
      this.webRTC?.deleteOnCalledVideoStream(clientId)
    })

    // when a computer user stops sharing screen
    onMessage(Message.STOP_SCREEN_SHARE, (clientId: string) => {
      const computerState = store.getState().computer
      computerState.shareScreenManager?.onUserLeft(clientId)
    })

    onMessage(Message.STUDIO_EVENT, (payload) => {
      phaserEvents.emit(Event.STUDIO_EVENT, payload)
    })

    onMessage(Message.TAG_GAME_TAGGED, (payload: { displayName: string; score: number }) => {
      phaserEvents.emit(Event.TAG_GAME_TAGGED, payload)
    })

    onMessage(Message.TAG_GAME_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.TAG_GAME_ERROR, payload)
    })

    onMessage(Message.MINI_GAME_EVENT, (payload: MiniGameEventPayload) => {
      phaserEvents.emit(Event.MINI_GAME_EVENT, payload)
    })

    onMessage(Message.MINI_GAME_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.MINI_GAME_ERROR, payload)
    })

    onMessage(Message.CASINO_EVENT, (payload: CasinoEventPayload) => {
      phaserEvents.emit(Event.CASINO_EVENT, payload)
    })

    onMessage(Message.CASINO_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.CASINO_ERROR, payload)
    })

    onMessage(Message.COMBAT_EVENT, (payload: CombatEventPayload) => {
      phaserEvents.emit(Event.COMBAT_EVENT, payload)
    })

    onMessage(Message.COMBAT_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.COMBAT_ERROR, payload)
    })

    onMessage(Message.TIEN_LEN_PRIVATE_STATE, (payload: TienLenPrivateState) => {
      this.latestTienLenState = payload
      phaserEvents.emit(Event.TIEN_LEN_PRIVATE_STATE, payload)
    })

    onMessage(Message.TIEN_LEN_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.TIEN_LEN_ERROR, payload)
    })

    onMessage(Message.TEXAS_PRIVATE_STATE, (payload: TexasHoldemPublicState) => {
      this.latestTexasState = payload
      phaserEvents.emit(Event.TEXAS_PRIVATE_STATE, payload)
    })

    onMessage(Message.TEXAS_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.TEXAS_ERROR, payload)
    })

    onMessage(Message.RPS_STATE, (payload: RpsPrivateState) => {
      this.latestRpsState = payload
      phaserEvents.emit(Event.RPS_STATE, payload)
    })

    onMessage(Message.RPS_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.RPS_ERROR, payload)
    })

    onMessage(Message.GAME_CHAT, (payload: GameChatServerPayload) => {
      phaserEvents.emit(Event.GAME_CHAT, payload)
    })

    onMessage(Message.SOCIAL_REWARD, (payload: SocialReward) => {
      phaserEvents.emit(Event.SOCIAL_REWARD, payload)
    })

    onMessage(Message.SOCIAL_REWARD_ERROR, (payload: { message: string }) => {
      phaserEvents.emit(Event.SOCIAL_REWARD_ERROR, payload)
    })

    onMessage(Message.WORK_SESSION_STARTED, (payload: { sessionId: string; challenge: WorkChallengePublic; startedAt: number; endsAt: number }) => {
      phaserEvents.emit(Event.WORK_SESSION_STARTED, payload)
    })

    onMessage(Message.WORK_STATE, (payload: { sessionId: string; answeredSteps: number; totalSteps: number; endsAt: number }) => {
      phaserEvents.emit(Event.WORK_STATE, payload)
    })

    onMessage(Message.WORK_RESULT, (payload: WorkReward | WorkCertificationResult) => {
      phaserEvents.emit(Event.WORK_RESULT, payload)
    })

    onMessage(Message.WORK_ERROR, (payload: { code?: string; message: string }) => {
      phaserEvents.emit(Event.WORK_ERROR, payload)
    })

    onMessage(Message.WORK_ACTIVITY, (payload: { userId?: string; displayName?: string; careerId?: string; stationId?: string; message: string }) => {
      phaserEvents.emit(Event.WORK_ACTIVITY, payload)
    })

    onMessage(Message.PLAYER_MOVEMENT_CORRECTION, (payload) => {
      phaserEvents.emit(Event.PLAYER_MOVEMENT_CORRECTION, payload)
    })

    onMessage(Message.SOCIAL_EMOTE, (payload: SocialEmoteEvent) => {
      phaserEvents.emit(Event.SOCIAL_EMOTE, payload)
    })

    onMessage(Message.PARTY_STATE, (payload: SocialPartyState | null) => {
      this.latestParty = payload || undefined
      phaserEvents.emit(Event.PARTY_STATE, payload)
    })

    onMessage(Message.PARTY_INVITE, (payload: SocialPartyInvite) => {
      phaserEvents.emit(Event.PARTY_INVITE, payload)
    })

    onMessage(Message.PARTY_ERROR, (payload: SocialPartyError) => {
      phaserEvents.emit(Event.PARTY_ERROR, payload)
    })

    onMessage(Message.PARTY_EVENT, (payload) => {
      phaserEvents.emit(Event.PARTY_EVENT, payload)
    })

    onMessage(Message.PLAYER_ROOM_CHANGED, (payload) => {
      phaserEvents.emit(Event.PLAYER_UPDATED, 'currentRoom', payload.currentRoom, payload.sessionId || payload.userId)
    })
  }

  // method to register event listener and call back function when a item user added
  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  // method to register event listener and call back function when a item user added
  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  // method to register event listener and call back function when a item user removed
  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  // method to register event listener and call back function when a player joined
  onPlayerJoined(callback: (Player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  // method to register event listener and call back function when my video is connected
  onMyPlayerVideoConnected(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_VIDEO_CONNECTED, callback, context)
  }

  // method to register event listener and call back function when a player updated
  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  onStudioEvent(callback: (payload: { type: string; studioId?: string; completion?: unknown }) => void, context?: any) {
    phaserEvents.on(Event.STUDIO_EVENT, callback, context)
  }

  onTagGameUpdated(callback: (payload: TagGameSnapshot) => void, context?: any) {
    phaserEvents.on(Event.TAG_GAME_UPDATED, callback, context)
    if (this.latestTagGame) callback.call(context, this.latestTagGame)
  }

  onTagGameTagged(callback: (payload: { displayName: string; score: number }) => void, context?: any) {
    phaserEvents.on(Event.TAG_GAME_TAGGED, callback, context)
  }

  onTagGameError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.TAG_GAME_ERROR, callback, context)
  }

  // method to send player updates to Colyseus server
  updatePlayer(currentX: number, currentY: number, currentAnim: string, force = false) {
    const now = Date.now()
    const signature = `${Math.round(currentX)}:${Math.round(currentY)}:${currentAnim}`
    if (!force && (now - this.lastPlayerUpdateAt < 75 || signature === this.lastPlayerUpdate)) return
    this.lastPlayerUpdateAt = now
    this.lastPlayerUpdate = signature
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  updatePlayerCharacterConfig(characterConfig: CharacterConfig) {
    const revision = store.getState().user.authUser?.avatarRevision
    this.room?.send(Message.UPDATE_PLAYER_CHARACTER_CONFIG, { characterConfig, revision })
  }

  updatePlayerNameplate() {
    this.room?.send(Message.UPDATE_PLAYER_NAMEPLATE)
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  // method to send ready-to-connect signal to Colyseus server
  videoConnected() {
    this.room?.send(Message.VIDEO_CONNECTED)
    phaserEvents.emit(Event.MY_PLAYER_VIDEO_CONNECTED)
  }

  // method to send stream-disconnection signal to Colyseus server
  playerStreamDisconnect(id: string) {
    this.room?.send(Message.DISCONNECT_STREAM, { clientId: id })
    this.webRTC?.deleteVideoStream(id)
  }

  connectToComputer(id: string) {
    this.room?.send(Message.CONNECT_TO_COMPUTER, { computerId: id })
  }

  disconnectFromComputer(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_COMPUTER, { computerId: id })
  }

  connectToWhiteboard(id: string) {
    this.room?.send(Message.CONNECT_TO_WHITEBOARD, { whiteboardId: id })
  }

  disconnectFromWhiteboard(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_WHITEBOARD, { whiteboardId: id })
  }

  onStopScreenShare(id: string) {
    this.room?.send(Message.STOP_SCREEN_SHARE, { computerId: id })
  }

  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content: content })
  }

  claimFishingCatch(spotId: string, requestId = `fishing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`) {
    if (this.activeWorld !== 'FISHING') return
    this.room?.send(Message.FISHING_CATCH_REQUEST, { spotId, requestId })
  }

  startFishingCast(spotId: string, requestId = `fishing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`) {
    if (this.activeWorld !== 'FISHING') return
    this.room?.send(Message.FISHING_CAST_REQUEST, { spotId, requestId })
  }

  startTagGame() {
    this.room?.send(Message.START_TAG_GAME)
  }

  startMiniGame(mode: MiniGameMode, partyId?: string) {
    this.room?.send(Message.START_MINI_GAME, { mode, partyId })
  }

  socialEmote(emoteId: string, actionId = `emote:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`) {
    this.room?.send(Message.SOCIAL_EMOTE, { emoteId, actionId } as SocialEmotePayload)
  }

  partyAction(payload: SocialPartyActionPayload) {
    this.room?.send(Message.PARTY_ACTION, payload)
  }

  miniGameAction(action: string, payload: Omit<MiniGameActionPayload, 'action'> = {}) {
    this.room?.send(Message.MINI_GAME_ACTION, { action, ...payload })
  }

  miniGameCheer() {
    this.room?.send(Message.MINI_GAME_CHEER)
  }

  casinoAction(payload: CasinoActionPayload) {
    this.room?.send(Message.CASINO_ACTION, payload)
  }

  tienLenAction(payload: TienLenActionPayload) {
    this.room?.send(Message.TIEN_LEN_ACTION, payload)
  }

  rpsAction(payload: RpsActionPayload) {
    this.room?.send(Message.RPS_ACTION, payload)
  }

  startWork(payload: WorkStartPayload) {
    this.room?.send(Message.WORK_START, payload)
  }

  workAction(payload: WorkActionPayload) {
    this.room?.send(Message.WORK_ACTION, payload)
  }

  submitWork(payload: WorkSubmitPayload) {
    this.room?.send(Message.WORK_SUBMIT, payload)
  }

  cancelWork(payload: WorkCancelPayload) {
    this.room?.send(Message.WORK_CANCEL, payload)
  }

  gameChat(payload: GameChatClientPayload) {
    this.room?.send(Message.GAME_CHAT, payload)
  }

  onGameChat(callback: (payload: GameChatServerPayload) => void, context?: any) {
    phaserEvents.on(Event.GAME_CHAT, callback, context)
  }

  combatAction(payload: CombatActionPayload) {
    this.room?.send(Message.COMBAT_ACTION, payload)
  }

  onCombatEvent(callback: (payload: CombatEventPayload) => void, context?: any) {
    phaserEvents.on(Event.COMBAT_EVENT, callback, context)
  }

  onCombatError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.COMBAT_ERROR, callback, context)
  }

  onCasinoTableUpdated(mode: CasinoGameMode, callback: (payload: CasinoTableSnapshot) => void, context?: any) {
    const eventName = `${Event.CASINO_TABLE_UPDATED}:${mode}`
    phaserEvents.on(eventName, callback, context)
    const latest = this.latestCasinoTables.get(mode)
    if (latest) callback.call(context, latest)
  }

  onCasinoEvent(callback: (payload: CasinoEventPayload) => void, context?: any) {
    phaserEvents.on(Event.CASINO_EVENT, callback, context)
  }

  onCasinoError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.CASINO_ERROR, callback, context)
  }

  onTienLenState(callback: (payload: TienLenPrivateState) => void, context?: any) {
    phaserEvents.on(Event.TIEN_LEN_PRIVATE_STATE, callback, context)
    if (this.latestTienLenState) callback.call(context, this.latestTienLenState)
  }

  onTienLenError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.TIEN_LEN_ERROR, callback, context)
  }

  onTexasState(callback: (payload: TexasHoldemPublicState) => void, context?: any) {
    phaserEvents.on(Event.TEXAS_PRIVATE_STATE, callback, context)
    if (this.latestTexasState) callback.call(context, this.latestTexasState)
  }

  onTexasError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.TEXAS_ERROR, callback, context)
  }

  onRpsState(callback: (payload: RpsPrivateState) => void, context?: any) {
    phaserEvents.on(Event.RPS_STATE, callback, context)
    if (this.latestRpsState) callback.call(context, this.latestRpsState)
  }

  onRpsError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.RPS_ERROR, callback, context)
  }

  onMiniGameUpdated(callback: (payload: MiniGameSnapshot) => void, context?: any) {
    phaserEvents.on(Event.MINI_GAME_UPDATED, callback, context)
    if (this.latestMiniGame) callback.call(context, this.latestMiniGame)
  }

  onMiniGameEvent(callback: (payload: MiniGameEventPayload) => void, context?: any) {
    phaserEvents.on(Event.MINI_GAME_EVENT, callback, context)
  }

  onMiniGameError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.MINI_GAME_ERROR, callback, context)
  }

  onSocialReward(callback: (payload: SocialReward) => void, context?: any) {
    phaserEvents.on(Event.SOCIAL_REWARD, callback, context)
  }

  onSocialRewardError(callback: (payload: { message: string }) => void, context?: any) {
    phaserEvents.on(Event.SOCIAL_REWARD_ERROR, callback, context)
  }

  onPartyState(callback: (payload: SocialPartyState | null) => void, context?: any) {
    phaserEvents.on(Event.PARTY_STATE, callback, context)
    if (this.latestParty) callback.call(context, this.latestParty)
  }

  onPartyInvite(callback: (payload: SocialPartyInvite) => void, context?: any) {
    phaserEvents.on(Event.PARTY_INVITE, callback, context)
  }

  onPartyError(callback: (payload: SocialPartyError) => void, context?: any) {
    phaserEvents.on(Event.PARTY_ERROR, callback, context)
  }

  async disconnect() {
    ++this.roomRequestSequence
    const room = this.room
    this.invalidateRoom()
    this.resetRoomCaches()
    this.mySessionId = ''
    this.webRTC?.destroy()
    this.webRTC = undefined
    try { await room?.leave() } catch { /* already disconnected */ }
    store.dispatch(setSessionId(''))
    store.dispatch(setRoomJoined(false))
    this.activeWorld = 'PUBLIC'
    this.latestHomeLayout = undefined
    store.dispatch(setActiveWorld({ worldId: 'PUBLIC' }))
    store.dispatch(setWorldTransition('IDLE'))
    // initialize() closes LobbyRoom while the world room is active. Re-open
    // it after logout so the next login can select a room without a dead-end
    // loader; the join is deduplicated if another reconnect is already in
    // flight.
    try {
      await this.joinLobbyRoom()
      store.dispatch(setLobbyJoined(true))
    } catch {
      store.dispatch(setLobbyJoined(false))
    }
  }

  private bindTagGameState(tagGame: ITagGameState, isCurrentRoom: () => boolean) {
    const emit = () => {
      if (!isCurrentRoom()) return
      this.latestTagGame = this.serializeTagGame(tagGame)
      phaserEvents.emit(Event.TAG_GAME_UPDATED, this.latestTagGame)
    }

    tagGame.onChange = emit
    tagGame.attendees.onAdd = (participant) => {
      participant.onChange = emit
      emit()
    }
    tagGame.attendees.onRemove = emit
    tagGame.attendees.forEach((participant) => { participant.onChange = emit })
    emit()
  }

  private serializeTagGame(tagGame: ITagGameState): TagGameSnapshot {
    return {
      status: tagGame.status,
      gameId: tagGame.gameId,
      roundId: tagGame.roundId,
      startedBy: tagGame.startedBy,
      taggerSessionId: tagGame.taggerSessionId,
      score: tagGame.score,
      settlementStatus: tagGame.settlementStatus,
      winnerIds: [...tagGame.winnerIds],
      startedAt: tagGame.startedAt,
      endsAt: tagGame.endsAt,
      resultMessage: tagGame.resultMessage,
      attendees: [...tagGame.attendees.entries()].map(([sessionId, participant]) => ({
        sessionId,
        userId: participant.userId,
        displayName: participant.displayName,
        tagCount: participant.tagCount,
        connected: participant.connected,
      })),
    }
  }

  private bindMiniGameState(miniGame: IMiniGameState, isCurrentRoom: () => boolean) {
    const emit = () => {
      if (!isCurrentRoom()) return
      this.latestMiniGame = this.serializeMiniGame(miniGame)
      phaserEvents.emit(Event.MINI_GAME_UPDATED, this.latestMiniGame)
    }
    miniGame.onChange = emit
    miniGame.attendees.onAdd = (participant) => { participant.onChange = emit; emit() }
    miniGame.attendees.onRemove = emit
    miniGame.attendees.forEach((participant) => { participant.onChange = emit })
    miniGame.items.onAdd = (item) => { item.onChange = emit; emit() }
    miniGame.items.onRemove = emit
    miniGame.items.forEach((item) => { item.onChange = emit })
    miniGame.boardCells.onAdd = (cell) => { cell.onChange = emit; emit() }
    miniGame.boardCells.onRemove = emit
    miniGame.boardCells.forEach((cell) => { cell.onChange = emit })
    emit()
  }

  private bindCasinoTables(tables: IOfficeState['casinoTables'], isCurrentRoom: () => boolean) {
    const bind = (table: ICasinoTableState, key: string) => {
      const mode = key as CasinoGameMode
      const emit = () => {
        if (!isCurrentRoom()) return
        const snapshot = this.serializeCasinoTable(table)
        this.latestCasinoTables.set(mode, snapshot)
        phaserEvents.emit(`${Event.CASINO_TABLE_UPDATED}:${mode}`, snapshot)
      }
      table.onChange = emit
      table.seats.onAdd = (seat) => { seat.onChange = emit; emit() }
      table.seats.onRemove = emit
      table.seats.forEach((seat) => { seat.onChange = emit })
      emit()
    }
    tables.onAdd = bind
    tables.onRemove = (_table, key) => {
      if (isCurrentRoom()) this.latestCasinoTables.delete(key as CasinoGameMode)
    }
    tables.forEach(bind)
  }

  private serializeCasinoTable(table: ICasinoTableState): CasinoTableSnapshot {
    const cards = (value: string) => value ? value.split(',').filter(Boolean) : []
    const wagers = (value: string): Record<string, number> => {
      try { return JSON.parse(value || '{}') }
      catch (_error) { return {} }
    }
    const pokerState = (value: string) => {
      try { return value ? JSON.parse(value) : undefined }
      catch (_error) { return undefined }
    }
    return {
      mode: table.mode,
      phase: table.phase,
      roundId: table.roundId,
      roundNumber: table.roundNumber,
      phaseStartedAt: table.phaseStartedAt,
      phaseEndsAt: table.phaseEndsAt,
      dealerName: table.dealerName,
      statusText: table.statusText,
      outcome: table.outcome,
      playerCards: cards(table.playerCards),
      bankerCards: cards(table.bankerCards),
      dealerCards: cards(table.dealerCards),
      communityCards: cards(table.communityCards),
      dice: cards(table.dice),
      playerTotal: table.playerTotal,
      bankerTotal: table.bankerTotal,
      dealerTotal: table.dealerTotal,
      resultDetail: table.resultDetail,
      history: table.history ? table.history.split('|').filter(Boolean) : [],
      totalWagered: table.totalWagered,
      activePlayers: table.activePlayers,
      shoeRemaining: table.shoeRemaining,
      pvpLobby: (() => { try { return table.pvpLobbyJson ? JSON.parse(table.pvpLobbyJson) : undefined } catch (_error) { return undefined } })(),
      tienLenPublic: (() => { try { return table.tienLenPublicJson ? JSON.parse(table.tienLenPublicJson) : undefined } catch (_error) { return undefined } })(),
      seats: [...table.seats.entries()].map(([sessionId, seat]) => ({ sessionId, userId: seat.userId, displayName: seat.displayName, seatIndex: seat.seatIndex, wagers: wagers(seat.wagersJson), cards: cards(seat.cards), status: seat.status, result: seat.result, stake: seat.stake, payout: seat.payout, net: seat.net, handValue: seat.handValue, acted: seat.acted, doubled: seat.doubled, folded: seat.folded, win: seat.win, board: seat.board, lastMove: seat.lastMove, turn: seat.turn, moveCount: seat.moveCount, matchId: seat.matchId, pokerMode: seat.pokerMode, pvpTableId: seat.pvpTableId, pokerState: pokerState(seat.pokerStateJson) })),
    }
  }

  private serializeMiniGame(miniGame: IMiniGameState): MiniGameSnapshot {
    return {
      mode: miniGame.mode,
      gameId: miniGame.gameId,
      status: miniGame.status,
      roundId: miniGame.roundId,
      startedBy: miniGame.startedBy,
      leaderSessionId: miniGame.leaderSessionId,
      targetColor: miniGame.targetColor,
      turnTeam: miniGame.turnTeam,
      teamRedScore: miniGame.teamRedScore,
      teamBlueScore: miniGame.teamBlueScore,
      startedAt: miniGame.startedAt,
      endsAt: miniGame.endsAt,
      score: miniGame.score,
      totalTasks: miniGame.totalTasks,
      completedTasks: miniGame.completedTasks,
      minPlayers: miniGame.minPlayers,
      maxPlayers: miniGame.maxPlayers,
      spectatorCount: miniGame.spectatorCount,
      settlementStatus: miniGame.settlementStatus,
      winnerIds: [...miniGame.winnerIds],
      resultMessage: miniGame.resultMessage,
      notice: miniGame.notice,
      attendees: [...miniGame.attendees.entries()].map(([sessionId, participant]) => ({
        sessionId,
        userId: participant.userId,
        displayName: participant.displayName,
        role: participant.role,
        team: participant.team,
        color: participant.color,
        score: participant.score,
        coins: participant.coins,
        wins: participant.wins,
        connected: participant.connected,
        alive: participant.alive,
        frozen: participant.frozen,
        hidden: participant.hidden,
        found: participant.found,
        hasBomb: participant.hasBomb,
        carryingFlag: participant.carryingFlag,
        choice: participant.choice,
      })),
      items: [...miniGame.items.entries()].map(([id, item]) => ({ id, kind: item.kind, x: item.x, y: item.y, value: item.value, active: item.active, collectedBy: item.collectedBy, team: item.team, homeX: item.homeX, homeY: item.homeY })),
      boardCells: [...miniGame.boardCells.entries()].map(([id, cell]) => ({ index: cell.index || Number(id), ownerSessionId: cell.ownerSessionId, team: cell.team })),
    }
  }
}
