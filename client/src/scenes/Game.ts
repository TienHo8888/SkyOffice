import Phaser from 'phaser'

// import { debugDraw } from '../utils/debug'
import { createCharacterAnims } from '../anims/CharacterAnims'

import Item from '../items/Item'
import Chair from '../items/Chair'
import Computer from '../items/Computer'
import Whiteboard from '../items/Whiteboard'
import VendingMachine from '../items/VendingMachine'
import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'
import Network from '../services/Network'
import { IPlayer } from '../../../types/IOfficeState'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { ItemType } from '../../../types/Items'
import { getRoomForPosition, InteractiveObjectType, isWorkInteractiveObject, opensStudioHub, STUDIO_GAMES_WING_HEIGHT, STUDIO_GAMES_WING_ORIGIN_X, STUDIO_GAMES_WING_WIDTH, studioInteractiveObjects, studioRoomZones, studioWorldPortals, StudioWorldPortal } from '../../../types/StudioWorld'
import { canAccessStudioHub } from '../../../types/Studio'

import store from '../stores'
import { setFocused, setShowChat } from '../stores/ChatStore'
import { setCurrentRoom } from '../stores/UserStore'
import { NavKeys, Keyboard } from '../../../types/KeyboardState'
import { Event, phaserEvents } from '../events/EventCenter'
import { TagGameSnapshot } from '../../../types/TagGame'
import { MiniGameSnapshot } from '../../../types/MiniGame'
import { COMBAT_WEAPONS, CombatEventPayload, CombatWeapon } from '../../../types/Combat'
import { CharacterConfig } from '../../../types/Avatar'
import { SocialEmoteEvent } from '../../../types/Social'

type StudioLabelAnchor = {
  x: number
  y: number
  originX: number
  originY: number
}

const INTERACTIVE_LABEL_LAYOUT: Record<InteractiveObjectType, StudioLabelAnchor> = {
  TASK_BOARD: { x: 0, y: -52, originX: 0.5, originY: 1 },
  PROJECT_BOARD: { x: 0, y: -52, originX: 0.5, originY: 1 },
  ASSET_BOARD: { x: 0, y: -52, originX: 0.5, originY: 1 },
  BUILD_MACHINE: { x: 0, y: -52, originX: 0.5, originY: 1 },
  JOB_BOARD: { x: 0, y: -52, originX: 0.5, originY: 1 },
  WORK_STATION: { x: 0, y: -52, originX: 0.5, originY: 1 },
  CAREER_CENTER: { x: 0, y: -52, originX: 0.5, originY: 1 },
  PAYROLL_OFFICE: { x: 0, y: -52, originX: 0.5, originY: 1 },
  MY_ROOM: { x: 0, y: 42, originX: 0.5, originY: 0 },
  // Keep the table label inside the lower room; the old below-object offset
  // pushed it past the room's bottom wall into the outdoor background.
  MEETING_TABLE: { x: 0, y: -52, originX: 0.5, originY: 1 },
  ARCADE_MACHINE: { x: 0, y: 42, originX: 0.5, originY: 0 },
  CARD_TABLE: { x: 0, y: 44, originX: 0.5, originY: 0 },
}

const INTERACTION_HINT_OFFSETS: Record<InteractiveObjectType, { x: number; y: number }> = {
  TASK_BOARD: { x: 0, y: -74 },
  PROJECT_BOARD: { x: 0, y: -74 },
  ASSET_BOARD: { x: 0, y: -74 },
  BUILD_MACHINE: { x: 0, y: -74 },
  JOB_BOARD: { x: 0, y: -74 },
  WORK_STATION: { x: 0, y: -74 },
  CAREER_CENTER: { x: 0, y: -74 },
  PAYROLL_OFFICE: { x: 0, y: -74 },
  MY_ROOM: { x: 0, y: -54 },
  MEETING_TABLE: { x: 0, y: -60 },
  ARCADE_MACHINE: { x: 0, y: -62 },
  CARD_TABLE: { x: 0, y: -58 },
}

// Hit reactions are deliberately playful and non-violent. Keep them short
// enough for the existing speech-bubble width while giving each hit a little
// personality: panic, teasing, a mild comeback, and mock threats.
const COMBAT_HIT_REACTIONS: Record<CombatWeapon, readonly string[]> = {
  WATER_GUN: [
    'Á á á! Lạnh quá, tha cho tui với!',
    'Ê! Ai cho bắn nước vào người ta đó?!',
    'Đồ chơi xấu tính! Tôi tưới lại bây giờ!',
    'Huhu… tóc tôi ướt hết rồi!',
    'Coi chừng tôi trả đũa bằng cả xô nước!',
  ],
  BAT: [
    'Á! Đánh lén hả?! Đau nha!',
    'Bonk đau đó! Tôi ghi sổ rồi!',
    'Đồ nghịch ngợm, đứng lại đó!',
    'Đừng ép tôi bật mode phản công!',
    'Coi chừng tôi bonk lại nha!',
  ],
  STONE: [
    'Á á á! Đá bay vào người kìa!',
    'Đồ ném đá lén! Tôi nhớ mặt rồi!',
    'Ai cho ném đá vậy?! Hết hồn á!',
    'Coi chừng tôi ném lại đó nha!',
    'Huhu… tôi muốn khóc luôn rồi!',
  ],
  SLIPPER: [
    'Á! Dép bay! Né không kịp!',
    'Ai ném dép đó?! Đồ xấu tính!',
    'Dép này tôi tịch thu làm bằng chứng!',
    'Coi chừng tôi trả dép tận tay nha!',
    'Huhu… chiếc dép vô tội mà!',
  ],
}

function getCombatHitReaction(weapon: CombatWeapon, eventId: string) {
  const reactions = COMBAT_HIT_REACTIONS[weapon]
  const hash = [...eventId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0)
  return reactions[hash % reactions.length]
}

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: NavKeys
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private gamesWingMap!: Phaser.Tilemaps.Tilemap
  myPlayer!: MyPlayer
  private playerSelector!: Phaser.GameObjects.Zone
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  computerMap = new Map<string, Computer>()
  private whiteboardMap = new Map<string, Whiteboard>()
  private interactionHint!: Phaser.GameObjects.Text
  private currentRoom = 'LOBBY'
  private nearestInteractive?: typeof studioInteractiveObjects[number]
  private nearestPortal?: StudioWorldPortal
  private nearestPlayerForInteraction?: { sessionId: string; userId: string; displayName: string; distance: number; avatarKey: string; characterConfig?: CharacterConfig }
  private studioUnlocks = new Set<string>()
  private miniGameItemMarkers = new Map<string, Phaser.GameObjects.Text>()
  private inputLocks = new Set<string>()
  private selectedCombatWeapon: CombatWeapon = 'WATER_GUN'
  private combatActionSequence = 0
  private gamesWingConnectorBounds?: { x: number; y: number; width: number; height: number }
  private readonly handleOpenChatKey = () => {
    store.dispatch(setShowChat(true))
    store.dispatch(setFocused(true))
  }
  private readonly handleEscapeKey = () => store.dispatch(setShowChat(false))
  private readonly handleWorldTransition = (payload: { status?: string }) => {
    if (payload?.status === 'LEAVING' || payload?.status === 'JOINING') this.disableKeys('world-transition')
    if (payload?.status === 'READY' || payload?.status === 'ERROR') this.enableKeys('world-transition')
  }
  constructor() {
    super('game')
  }

  registerKeys() {
    this.cursors = {
      ...this.input.keyboard.createCursorKeys(),
      ...(this.input.keyboard.addKeys('W,S,A,D') as Keyboard),
    }

    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyE = this.input.keyboard.addKey('E')
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.off('keydown-E', this.handleStudioInteraction, this)
    this.input.keyboard.on('keydown-E', this.handleStudioInteraction, this)
    this.input.keyboard.disableGlobalCapture()
    this.input.keyboard.off('keydown-ENTER', this.handleOpenChatKey, this)
    this.input.keyboard.off('keydown-ESC', this.handleEscapeKey, this)
    this.input.keyboard.on('keydown-ENTER', this.handleOpenChatKey, this)
    this.input.keyboard.on('keydown-ESC', this.handleEscapeKey, this)
  }

  disableKeys(lock = 'studio-hub') {
    this.inputLocks.add(lock)
    this.input.keyboard.enabled = false
  }

  enableKeys(lock = 'studio-hub') {
    this.inputLocks.delete(lock)
    this.input.keyboard.enabled = this.inputLocks.size === 0
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }
    this.registerKeys()
    this.enableKeys('world-transition')

    createCharacterAnims(this.anims)

    this.map = this.make.tilemap({ key: 'tilemap' })
    const FloorAndGround = this.map.addTilesetImage('FloorAndGround', 'tiles_wall')
    this.gamesWingMap = this.make.tilemap({ key: 'gamesWing' })
    const gamesWingTileset = this.gamesWingMap.addTilesetImage('FloorAndGround', 'tiles_wall')
    this.gamesWingMap.createLayer('Ground', gamesWingTileset, STUDIO_GAMES_WING_ORIGIN_X, 0)

    this.createStudioWorldOverlay()

    const groundLayer = this.map.createLayer('Ground', FloorAndGround)
    groundLayer.setCollisionByProperty({ collides: true })

    // debugDraw(groundLayer, this)

    const savedAvatar = store.getState().user.authUser?.avatarKey || 'adam'
    this.myPlayer = this.add.myPlayer(705, 500, savedAvatar, this.network.mySessionId)
    this.myPlayer.userId = store.getState().user.authUser?.id || ''
    const savedCharacterConfig = store.getState().user.authUser?.characterConfig
    if (savedCharacterConfig) this.myPlayer.setCharacterConfig(savedCharacterConfig)
    const savedLoadout = store.getState().social.snapshot?.loadout
    this.myPlayer.setNameplate(savedLoadout?.nameplateId || 'nameplate-basic')
    this.myPlayer.setTitle(savedLoadout?.titleId)
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)
    this.createGamesWingArchitecture(groundLayer)

    // import chair objects from Tiled map to Phaser
    const chairs = this.physics.add.staticGroup({ classType: Chair })
    const chairLayer = this.map.getObjectLayer('Chair')
    chairLayer.objects.forEach((chairObj) => {
      if (this.isInGamesWingConnector(chairObj)) return
      const item = this.addObjectFromTiled(chairs, chairObj, 'chairs', 'chair') as Chair
      // custom properties[0] is the object direction specified in Tiled
      item.itemDirection = chairObj.properties[0].value
    })

    // import computers objects from Tiled map to Phaser
    const computers = this.physics.add.staticGroup({ classType: Computer })
    const computerLayer = this.map.getObjectLayer('Computer')
    computerLayer.objects.forEach((obj, i) => {
      if (this.isInGamesWingConnector(obj)) return
      const item = this.addObjectFromTiled(computers, obj, 'computers', 'computer') as Computer
      item.setDepth(item.y + item.height * 0.27)
      const id = `${i}`
      item.id = id
      this.computerMap.set(id, item)
    })

    // import whiteboards objects from Tiled map to Phaser
    const whiteboards = this.physics.add.staticGroup({ classType: Whiteboard })
    const whiteboardLayer = this.map.getObjectLayer('Whiteboard')
    whiteboardLayer.objects.forEach((obj, i) => {
      if (this.isInGamesWingConnector(obj)) return
      const item = this.addObjectFromTiled(
        whiteboards,
        obj,
        'whiteboards',
        'whiteboard'
      ) as Whiteboard
      const id = `${i}`
      item.id = id
      this.whiteboardMap.set(id, item)
    })

    // import vending machine objects from Tiled map to Phaser
    const vendingMachines = this.physics.add.staticGroup({ classType: VendingMachine })
    const vendingMachineLayer = this.map.getObjectLayer('VendingMachine')
    vendingMachineLayer.objects.forEach((obj, i) => {
      if (this.isInGamesWingConnector(obj)) return
      this.addObjectFromTiled(vendingMachines, obj, 'vendingmachines', 'vendingmachine')
    })

    // import other objects from Tiled map to Phaser
    this.addGroupFromTiled('Wall', 'tiles_wall', 'FloorAndGround', false)
    this.addGroupFromTiled('Objects', 'office', 'Modern_Office_Black_Shadow', false)
    this.addGroupFromTiled('ObjectsOnCollide', 'office', 'Modern_Office_Black_Shadow', true)
    this.addGroupFromTiled('GenericObjects', 'generic', 'Generic', false)
    this.addGroupFromTiled('GenericObjectsOnCollide', 'generic', 'Generic', true)
    this.addGroupFromTiled('Basement', 'basement', 'Basement', true)

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    // An integer zoom keeps the pixel-art camera and the LPC layers on the
    // same sampling grid. A fractional zoom (1.5) makes a moving character
    // alternate between half-pixel screen positions and look jittery.
    this.cameras.main.setZoom(2)
    this.cameras.main.setBounds(0, 0, 1280 + STUDIO_GAMES_WING_WIDTH, Math.max(this.map.heightInPixels, STUDIO_GAMES_WING_HEIGHT))
    this.cameras.main.setRoundPixels(true)
    this.cameras.main.startFollow(this.myPlayer, true)

    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], groundLayer)
    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], vendingMachines)

    this.physics.add.overlap(
      this.playerSelector,
      [chairs, computers, whiteboards],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    this.physics.add.overlap(
      this.myPlayer,
      this.otherPlayers,
      this.handlePlayersOverlap,
      undefined,
      this
    )

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerVideoConnected(this.handleMyVideoConnected, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
    this.network.onStudioEvent(this.handleStudioEvent, this)
    this.network.onTagGameUpdated(this.handleTagGameUpdated, this)
    this.network.onMiniGameUpdated(this.handleMiniGameUpdated, this)
    this.network.onCombatEvent(this.handleCombatEvent, this)
    this.network.getPlayers()?.forEach((player, sessionId) => {
      if (sessionId !== this.network.mySessionId) this.handlePlayerJoined(player, sessionId)
    })
    phaserEvents.on(Event.MY_PLAYER_NAMEPLATE_CHANGE, this.handleMyPlayerNameplateChange, this)
    phaserEvents.on(Event.MY_PLAYER_TITLE_CHANGE, this.handleMyPlayerTitleChange, this)
    phaserEvents.on(Event.PLAYER_MOVEMENT_CORRECTION, this.handlePlayerMovementCorrection, this)
    phaserEvents.on(Event.SOCIAL_EMOTE, this.handleSocialEmote, this)
    phaserEvents.on(Event.WORLD_TRANSITION, this.handleWorldTransition, this)
    phaserEvents.emit(Event.COMBAT_SELECTION_CHANGED, this.selectedCombatWeapon)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      phaserEvents.off(Event.PLAYER_JOINED, this.handlePlayerJoined, this)
      phaserEvents.off(Event.PLAYER_LEFT, this.handlePlayerLeft, this)
      phaserEvents.off(Event.MY_PLAYER_READY, this.handleMyPlayerReady, this)
      phaserEvents.off(Event.MY_PLAYER_VIDEO_CONNECTED, this.handleMyVideoConnected, this)
      phaserEvents.off(Event.PLAYER_UPDATED, this.handlePlayerUpdated, this)
      phaserEvents.off(Event.ITEM_USER_ADDED, this.handleItemUserAdded, this)
      phaserEvents.off(Event.ITEM_USER_REMOVED, this.handleItemUserRemoved, this)
      phaserEvents.off(Event.UPDATE_DIALOG_BUBBLE, this.handleChatMessageAdded, this)
      phaserEvents.off(Event.STUDIO_EVENT, this.handleStudioEvent, this)
      phaserEvents.off(Event.TAG_GAME_UPDATED, this.handleTagGameUpdated, this)
      phaserEvents.off(Event.MINI_GAME_UPDATED, this.handleMiniGameUpdated, this)
      phaserEvents.off(Event.COMBAT_EVENT, this.handleCombatEvent, this)
      phaserEvents.off(Event.MY_PLAYER_NAMEPLATE_CHANGE, this.handleMyPlayerNameplateChange, this)
      phaserEvents.off(Event.MY_PLAYER_TITLE_CHANGE, this.handleMyPlayerTitleChange, this)
      phaserEvents.off(Event.PLAYER_MOVEMENT_CORRECTION, this.handlePlayerMovementCorrection, this)
      phaserEvents.off(Event.SOCIAL_EMOTE, this.handleSocialEmote, this)
      phaserEvents.off(Event.WORLD_TRANSITION, this.handleWorldTransition, this)
      this.input.keyboard?.off('keydown-E', this.handleStudioInteraction, this)
      this.input.keyboard?.off('keydown-ENTER', this.handleOpenChatKey, this)
      this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey, this)
      this.input.keyboard?.removeAllKeys(true)
      this.inputLocks.clear()
    })
  }

  selectCombatWeapon(weapon: CombatWeapon) {
    if (!COMBAT_WEAPONS.some((candidate) => candidate.id === weapon)) return
    this.selectedCombatWeapon = weapon
    phaserEvents.emit(Event.COMBAT_SELECTION_CHANGED, weapon)
  }

  useSelectedCombatWeapon() {
    if (!this.myPlayer || !this.network || this.inputLocks.size > 0 || this.myPlayer.playerBehavior !== PlayerBehavior.IDLE) return
    const animation = this.myPlayer.anims.currentAnim?.key || `${this.myPlayer.playerTexture}_idle_down`
    const facing = animation.endsWith('_left') ? { x: -1, y: 0 } : animation.endsWith('_right') ? { x: 1, y: 0 } : animation.endsWith('_up') ? { x: 0, y: -1 } : { x: 0, y: 1 }
    this.combatActionSequence += 1
    this.network.combatAction({
      weapon: this.selectedCombatWeapon,
      directionX: facing.x,
      directionY: facing.y,
      actionId: `${this.network.mySessionId}:${Date.now()}:${this.combatActionSequence}`,
    })
  }

  private applyAuthoritativePosition(x: number, y: number, anim?: string) {
    if (!this.myPlayer || !Number.isFinite(x) || !Number.isFinite(y)) return
    this.myPlayer.setVelocity(0, 0).setPosition(x, y).setDepth(y)
    const body = this.myPlayer.body as Phaser.Physics.Arcade.Body
    body.reset(x, y)
    this.myPlayer.playerContainer.setPosition(x, y - 30)
    const containerBody = this.myPlayer.playerContainer.body as Phaser.Physics.Arcade.Body
    containerBody.reset(x, y - 30)
    this.playerSelector?.setPosition(x, y)
    if (anim && /^[a-zA-Z0-9_-]{1,100}$/.test(anim)) this.myPlayer.playAnimation(anim, true)
  }

  private handlePlayerMovementCorrection(payload: { x?: number; y?: number; anim?: string }) {
    if (payload?.x !== undefined && payload?.y !== undefined) this.applyAuthoritativePosition(Number(payload.x), Number(payload.y), payload.anim)
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item
    // currentItem is undefined if nothing was perviously selected
    if (currentItem) {
      // if the selection has not changed, do nothing
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      // if selection changes, clear pervious dialog
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    // set selected item and set up new dialog
    playerSelector.selectedItem = selectionItem
    selectionItem.onOverlapDialog()
  }

  private createStudioWorldOverlay() {
    const canUseStudioHub = canAccessStudioHub(store.getState().user.authUser?.role)
    const roomGraphics = this.add.graphics().setDepth(1)
    studioRoomZones.forEach((zone) => {
      roomGraphics.fillStyle(zone.color, 0.035)
      roomGraphics.fillRect(zone.x, zone.y, zone.width, zone.height)
      roomGraphics.lineStyle(2, zone.color, 0.2)
      roomGraphics.strokeRect(zone.x, zone.y, zone.width, zone.height)

      // The Play Wing has bespoke neon headers. Work rooms only show the
      // department name; detailed descriptions live in the world directory.
      if (zone.group === 'WORK') this.createWorkRoomSign(zone)
    })

    this.createGameLoungeDecor()
    this.createArcadeHallDecor()
    this.createVipCardRoomDecor()
    this.createWorkWingSignage()
    this.createWorldWayfinding()
    this.createWorldPortals()

    studioInteractiveObjects.forEach((object) => {
      if (!canUseStudioHub && opensStudioHub(object.type)) return
      // Career access points stay interactive through their invisible map
      // coordinates, but their extra overlay blocks, markers and labels add
      // visual noise to the compact work rooms, so keep them hidden.
      if (isWorkInteractiveObject(object.type) || opensStudioHub(object.type)) return

      // Game panels open only after the player walks close enough and presses E.
      const isCardTable = object.type === 'CARD_TABLE'
      const isGameObject = isCardTable || object.type === 'ARCADE_MACHINE'
      if (isCardTable) this.createCardTableOrMachine(object.x, object.y, object.label)
      if (object.type === 'ARCADE_MACHINE') this.createArcadeMachine(object.x, object.y, object.label)
      if (isCardTable) this.createGameTableSeats(object.x, object.y)
      if (object.accessVisibility === 'PROXIMITY') return

      // Tables and cabinets already have a physical prop as their access
      // affordance. Do not stack another glowing circle on top of them.
      if (!isGameObject) {
        const markerColor = object.type === 'JOB_BOARD' ? 0xc8f267 : object.type === 'ASSET_BOARD' ? 0xf28bb4 : object.type === 'BUILD_MACHINE' ? 0x6fc8ff : 0xae91ff
        const markerIcon = object.type === 'JOB_BOARD' ? '▦' : object.type === 'PROJECT_BOARD' ? '◆' : object.type === 'TASK_BOARD' ? '✦' : object.type === 'ASSET_BOARD' ? '◇' : '⚙'
        const markerDepth = object.y + 28
        this.add.circle(object.x, object.y, 8, markerColor, 0.32).setDepth(markerDepth)
        this.add.text(object.x, object.y - 5, markerIcon, { color: '#172015', fontSize: '10px' }).setOrigin(0.5).setDepth(markerDepth + 1)
      }

      const labelLayout = object.roomId === 'LOBBY'
        ? { x: 0, y: 32, originX: 0.5, originY: 0 }
        : INTERACTIVE_LABEL_LAYOUT[object.type]
      const accessLabel = object.accessLabel || object.label
      this.add.text(object.x + labelLayout.x, object.y + labelLayout.y, accessLabel, {
        color: isGameObject ? '#ffe0b1' : '#dce8cf',
        fontFamily: 'DM Mono',
        fontSize: isGameObject ? '7px' : '8px',
        fontStyle: 'bold',
        backgroundColor: '#101622d9',
        padding: { left: 5, right: 5, top: 2, bottom: 2 },
      }).setOrigin(labelLayout.originX, labelLayout.originY).setStroke('#101622', 2).setResolution(2).setDepth(900)
    })

    this.interactionHint = this.add.text(0, 0, '', {
      color: '#182317',
      fontFamily: 'DM Mono',
      fontSize: '14px',
      fontStyle: 'bold',
      backgroundColor: '#c8f267',
      padding: { left: 9, right: 9, top: 6, bottom: 6 },
    }).setOrigin(0.5, 1).setStroke('#e9ffb9', 1).setResolution(2).setDepth(6000).setVisible(false)
  }

  private createWorkRoomSign(zone: typeof studioRoomZones[number]) {
    const title = this.add.text(zone.x + 23, zone.y + 15, zone.shortName.toUpperCase(), {
      color: '#f5f8ed',
      fontFamily: 'DM Mono',
      fontSize: '9px',
      fontStyle: 'bold',
    }).setStroke('#101622', 2).setResolution(3).setDepth(998)
    const signWidth = Math.min(zone.width - 20, Math.ceil(title.width) + 26)
    const sign = this.add.graphics().setDepth(997)
    sign.fillStyle(0x101622, 0.9).fillRoundedRect(zone.x + 10, zone.y + 10, signWidth, 22, 5)
    sign.fillStyle(zone.color, 0.85).fillRect(zone.x + 10, zone.y + 10, 4, 22)
    sign.fillStyle(zone.color, 0.12).fillRect(zone.x + 15, zone.y + 10, signWidth - 5, 22)
  }

  private createWorkWingSignage() {
    const title = this.add.text(174, 97, 'WORK WING', {
      color: '#dff4cb',
      fontFamily: 'DM Mono',
      fontSize: '8px',
      fontStyle: 'bold',
    }).setStroke('#101622', 2).setResolution(3).setDepth(998)
    const directory = this.add.text(252, 97, 'DESIGN  ·  CREATIVE  ·  ENGINEERING  ·  QUALITY  ·  PEOPLE OPS', {
      color: '#a9c2b2',
      fontFamily: 'DM Mono',
      fontSize: '6px',
    }).setStroke('#101622', 1).setResolution(3).setDepth(998)

    const signLeft = 160
    const contentRight = Math.max(title.x + title.width, directory.x + directory.width)
    const signWidth = Math.ceil(contentRight - signLeft + 16)
    const sign = this.add.graphics().setDepth(996)
    sign.fillStyle(0x101622, 0.82).fillRoundedRect(signLeft, 92, signWidth, 26, 5)
    sign.fillStyle(0xc8f267, 0.75).fillRect(signLeft, 92, 4, 26)
  }

  private createWorldWayfinding() {
    const paths = this.add.graphics().setDepth(2)
    // A single visual spine makes the compact office readable: Commons is the
    // hub, upper rooms are creation, lower rooms are delivery/people, and the
    // east arrow is recreation. Paths are decorative and never add collision.
    paths.lineStyle(5, 0xdce8cf, 0.11)
    paths.lineBetween(536, 468, 536, 382)
    paths.lineBetween(536, 382, 280, 382)
    paths.lineBetween(536, 382, 816, 382)
    paths.lineBetween(280, 382, 280, 314)
    paths.lineBetween(536, 382, 536, 314)
    paths.lineBetween(816, 382, 816, 314)
    paths.lineBetween(536, 468, 536, 544)
    paths.lineBetween(536, 544, 280, 544)
    paths.lineBetween(280, 544, 280, 616)
    paths.lineBetween(536, 544, 536, 592)
    paths.lineBetween(816, 382, 1000, 382)
    paths.lineBetween(1000, 382, 1000, 248)
    ;[[536,382],[280,382],[816,382],[536,544],[280,544],[1000,382]].forEach(([x,y]) => paths.fillStyle(0xc8f267, 0.3).fillCircle(x, y, 4))

    const directory = this.add.graphics().setDepth(994)
    directory.fillStyle(0x0d1620, 0.94).fillRoundedRect(842, 386, 136, 70, 6)
    directory.lineStyle(2, 0xc8f267, 0.5).strokeRoundedRect(842, 386, 136, 70, 6)
    directory.fillStyle(0xc8f267, 0.16).fillRect(849, 393, 122, 15)
    this.add.text(854, 397, 'STUDIO DIRECTORY', {
      color: '#f0f8df',
      fontFamily: 'DM Mono',
      fontSize: '7px',
      fontStyle: 'bold',
    }).setStroke('#0d1620', 1).setResolution(3).setDepth(995)
    this.add.text(854, 416, '↑ CREATE · DESIGN / ART / ENG\n← QUALITY · PEOPLE OPS ↓\nPLAY →', {
      color: '#c5d8cb',
      fontFamily: 'DM Mono',
      fontSize: '6px',
      lineSpacing: 4,
    }).setStroke('#0d1620', 1).setResolution(3).setDepth(995)

    // Low-noise planters soften the work wing without obscuring stations.
    ;[[182, 376], [638, 376], [182, 488], [638, 488], [930, 376]].forEach(([x, y], index) => {
      const plant = this.add.graphics().setDepth(y + 8)
      plant.fillStyle(0x283b32, 0.95).fillRect(x - 6, y, 12, 9)
      plant.fillStyle(index % 2 ? 0x6fe0b0 : 0xc8f267, 0.66).fillCircle(x - 4, y - 4, 5).fillCircle(x + 4, y - 6, 5).fillCircle(x, y - 10, 6)
    })
  }

  private createWorldPortals() {
    studioWorldPortals.forEach((portal) => {
      const portalGraphics = this.add.graphics().setDepth(portal.y + 18)
      portalGraphics.lineStyle(3, portal.color, 0.95).strokeCircle(portal.x, portal.y, 24)
      portalGraphics.fillStyle(portal.color, 0.22).fillCircle(portal.x, portal.y, 19)
      portalGraphics.fillStyle(0xffffff, 0.7).fillCircle(portal.x - 7, portal.y - 7, 4)
      this.tweens.add({ targets: portalGraphics, alpha: { from: 0.65, to: 1 }, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      this.add.text(portal.x, portal.y + 34, portal.label, {
        color: portal.destination === 'FISHING' ? '#d9f4ff' : '#eadbff',
        fontFamily: 'DM Mono',
        fontSize: '8px',
        fontStyle: 'bold',
        backgroundColor: '#101622dd',
        padding: { left: 5, right: 5, top: 3, bottom: 3 },
      }).setOrigin(0.5).setStroke('#101622', 2).setDepth(portal.y + 19)
    })
  }

  private createGameLoungeDecor() {
    const lounge = this.add.graphics().setDepth(1)
    lounge.fillStyle(0x17152d, 0.78).fillRoundedRect(1324, 108, 296, 264, 10)
    lounge.lineStyle(3, 0xff78c8, 0.48).strokeRoundedRect(1324, 108, 296, 264, 10)
    lounge.fillStyle(0xff78c8, 0.08)
    for (let index = 0; index < 7; index++) lounge.fillRect(1338 + index * 38, 144, 18, 202)
    lounge.fillStyle(0xff78c8, 0.55).fillRect(1340, 126, 264, 4)
    lounge.fillStyle(0x6e4a78, 0.45).fillRect(1340, 354, 264, 5)
    this.add.text(1472, 122, 'PLAY ZONE', { color: '#ffd1eb', fontFamily: 'DM Mono', fontSize: '10px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4)
    this.add.text(1472, 137, 'XÌ DÁCH · BACCARAT · BẦU CUA · SIC BO', { color: '#c687b0', fontFamily: 'DM Mono', fontSize: '5px' }).setOrigin(0.5).setDepth(4)
    const neon = this.add.graphics().setDepth(3)
    neon.fillStyle(0xff78c8, 0.8).fillRect(1332, 166, 3, 174).fillRect(1609, 166, 3, 174)
    neon.fillStyle(0xffd1eb, 0.8)
    ;[[1340, 160], [1598, 160], [1340, 346], [1598, 346]].forEach(([x, y]) => neon.fillRect(x, y, 8, 3))
  }

  private createArcadeHallDecor() {
    const arcade = this.add.graphics().setDepth(1)
    arcade.fillStyle(0x102a2b, 0.82).fillRoundedRect(1676, 108, 296, 264, 10)
    arcade.lineStyle(3, 0x6fe0b0, 0.5).strokeRoundedRect(1676, 108, 296, 264, 10)
    arcade.fillStyle(0x6fe0b0, 0.08)
    for (let index = 0; index < 7; index++) arcade.fillRect(1690 + index * 38, 144, 18, 202)
    arcade.fillStyle(0x6fe0b0, 0.62).fillRect(1692, 126, 264, 4)
    this.add.text(1824, 122, 'INSERT COIN', { color: '#c9ffe6', fontFamily: 'DM Mono', fontSize: '10px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4)
    this.add.text(1824, 137, 'CABINETS · PRIZES', { color: '#75bca1', fontFamily: 'DM Mono', fontSize: '6px' }).setOrigin(0.5).setDepth(4)
  }

  private createVipCardRoomDecor() {
    const room = this.add.graphics().setDepth(1)
    room.fillStyle(0x211a2a, 0.78).fillRoundedRect(1324, 428, 648, 392, 10)
    room.lineStyle(3, 0xffb86c, 0.42).strokeRoundedRect(1324, 428, 648, 392, 10)
    room.fillStyle(0xffb86c, 0.12).fillRoundedRect(1340, 500, 616, 136, 8).fillRoundedRect(1340, 664, 616, 136, 8)
    room.lineStyle(1, 0xffb86c, 0.24).strokeRoundedRect(1340, 500, 616, 136, 8).strokeRoundedRect(1340, 664, 616, 136, 8)
    this.add.text(1648, 446, 'VIP GAMES', { color: '#ffe0b1', fontFamily: 'DM Mono', fontSize: '11px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4)
    this.add.text(1648, 462, 'POKER · BACCARAT · TIẾN LÊN · CỜ VUA', { color: '#b99978', fontFamily: 'DM Mono', fontSize: '5px' }).setOrigin(0.5).setDepth(4)
    this.add.text(1360, 510, 'DEALER ROW · VIP TABLES', { color: '#ffcf90', fontFamily: 'DM Mono', fontSize: '7px', fontStyle: 'bold' }).setDepth(4)
    this.add.text(1360, 674, 'MULTIPLAYER ROW · FRIENDLY TABLES', { color: '#ffcf90', fontFamily: 'DM Mono', fontSize: '7px', fontStyle: 'bold' }).setDepth(4)
  }

  private createGameTableSeats(x: number, y: number) {
    const seats = [
      { x: x - 52, frame: 3 },
      { x: x + 52, frame: 2 },
    ]
    seats.forEach(({ x: seatX, frame }) => {
      this.add.sprite(seatX, y + 7, 'chairs', frame).setScale(0.52).setDepth(y + 24)
    })
  }

  private createGamesWingArchitecture(groundLayer: Phaser.Tilemaps.TilemapLayer) {
    // The office map ends at x=1280 while the games wing starts at x=1280.
    // Open the last two office tile rows so this connector is a real walkable
    // route between the Work Wing and the Play Wing.
    const connectorStartTileX = Math.floor(960 / this.map.tileWidth)
    const connectorEndTileX = Math.ceil(1280 / this.map.tileWidth)
    const connectorStartTileY = Math.floor(224 / this.map.tileHeight)
    const connectorEndTileY = Math.ceil(288 / this.map.tileHeight)
    for (let tileY = connectorStartTileY; tileY < connectorEndTileY; tileY += 1) {
      for (let tileX = connectorStartTileX; tileX < connectorEndTileX; tileX += 1) {
        if (tileX < this.map.width && tileY < this.map.height) groundLayer.getTileAt(tileX, tileY)?.setCollision(false)
      }
    }

    const connector = this.add.graphics().setDepth(1)
    // Keep the connector visually distinct from both rooms: it is a neutral
    // walkable hallway, not another green room attached to the workspace.
    connector.fillStyle(0x5e686d, 0.98).fillRect(960, 208, 352, 80)
    connector.fillStyle(0xd1d8ce, 0.08)
    for (let x = 968; x < 1304; x += 32) connector.fillRect(x, 216, 18, 64)
    connector.lineStyle(2, 0x202936, 0.65).strokeRect(960, 208, 352, 80)
    connector.lineStyle(3, 0xc8f267, 0.65)
    connector.lineBetween(980, 249, 1268, 249)
    connector.fillStyle(0xc8f267, 0.9)
    connector.fillTriangle(1278, 241, 1290, 249, 1278, 257)
    this.add.text(1175, 225, '→ PLAY WING', {
      color: '#d9ffe9',
      fontFamily: 'DM Mono',
      fontSize: '9px',
      fontStyle: 'bold',
      backgroundColor: '#101622dd',
      padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setStroke('#101622', 2).setDepth(4)
    this.add.text(1130, 262, 'SOCIAL · TABLES · ARCADE', {
      color: '#78caa9',
      fontFamily: 'DM Mono',
      fontSize: '7px',
      backgroundColor: '#101622bb',
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
    }).setOrigin(0.5).setStroke('#101622', 1).setDepth(4)
    this.add.text(1012, 242, 'WORK WING EXIT', {
      color: '#dce8cf',
      fontFamily: 'DM Mono',
      fontSize: '7px',
      backgroundColor: '#101622dd',
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
    }).setOrigin(0.5).setStroke('#101622', 2).setDepth(7)

    // One old office prop sits directly on the new doorway. It is decorative
    // in the source map, so omit it from the collidable group when it overlaps
    // the connector opening.
    this.gamesWingConnectorBounds = { x: 960, y: 208, width: 336, height: 80 }

    const wallGraphics = this.add.graphics().setDepth(6)
    const wallColor = 0x242b3c
    const edgeColor = 0xffcf90
    const wallRects = [
      { x: 1664, y: 48, width: 16, height: 212 },
      { x: 1664, y: 320, width: 16, height: 80 },
      { x: 960, y: 192, width: 336, height: 16 },
      { x: 960, y: 288, width: 336, height: 16 },
      { x: 1296, y: 48, width: 720, height: 16 },
      { x: 1296, y: 880, width: 720, height: 16 },
      { x: 2016, y: 48, width: 16, height: 848 },
      // Main entrance from the workspace connector into Game Lounge.
      { x: 1296, y: 48, width: 16, height: 160 },
      { x: 1296, y: 288, width: 16, height: 608 },
      { x: 1296, y: 400, width: 144, height: 16 },
      { x: 1504, y: 400, width: 256, height: 16 },
      { x: 1824, y: 400, width: 192, height: 16 },
    ]
    wallRects.forEach(({ x, y, width, height }) => {
      wallGraphics.fillStyle(wallColor, 0.98).fillRect(x, y, width, height)
      wallGraphics.lineStyle(2, edgeColor, 0.24).strokeRect(x + 2, y + 2, width - 4, height - 4)
    })
    wallGraphics.fillStyle(0xc8f267, 0.18).fillRect(1300, 216, 8, 64)
    wallGraphics.fillStyle(0xff78c8, 0.25).fillRect(1658, 264, 28, 56)

    const walls = this.physics.add.staticGroup()
    wallRects.forEach(({ x, y, width, height }) => {
      const collider = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false)
      this.physics.add.existing(collider, true)
      walls.add(collider)
    })
    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], walls)

    this.add.sprite(1980, 322, 'vendingmachines', 0).setScale(0.9).setDepth(330)
    this.add.text(1980, 369, 'PRIZE KIOSK', { color: '#dff4cb', fontFamily: 'DM Mono', fontSize: '7px', backgroundColor: '#101622dd', padding: { left: 4, right: 4, top: 2, bottom: 2 } }).setOrigin(0.5, 0).setDepth(331)
  }

  private createArcadeMachine(x: number, y: number, label: string) {
    const accent = label.includes('Rhythm') ? 0xae91ff : label.includes('Prize') ? 0xffb86c : 0x6fe0b0
    const machine = this.add.graphics().setDepth(y - 20)
    machine.fillStyle(0x102027, 1).fillRect(x - 19, y - 35, 38, 52)
    machine.fillStyle(accent, 0.88).fillRect(x - 16, y - 31, 32, 25)
    machine.fillStyle(0x18253a, 1).fillRect(x - 12, y - 27, 24, 15)
    machine.fillStyle(accent, 0.9).fillRect(x - 8, y - 23, 4, 4).fillRect(x, y - 23, 4, 4).fillRect(x + 8, y - 23, 4, 4)
    machine.fillStyle(0x263744, 1).fillRect(x - 15, y - 3, 30, 4)
    machine.fillStyle(accent, 0.8).fillRect(x - 10, y + 3, 7, 5).fillRect(x + 4, y + 3, 7, 5)
    machine.fillStyle(0x0c171b, 1).fillRect(x - 16, y + 13, 32, 5)
    machine.fillStyle(accent, 0.48).fillRect(x - 22, y + 19, 44, 3)
  }

  private createCardTableOrMachine(x: number, y: number, label: string) {
    const accent = label.includes('Chess') ? 0xae91ff : label.includes('Poker') ? 0x6fe0b0 : label.includes('Baccarat') ? 0xffb86c : label.includes('Bầu Cua') ? 0xf1bd56 : label.includes('Tiến Lên') ? 0xff9d6c : 0xff78c8
    const isMachine = label.includes('Machine')
    const table = this.add.graphics().setDepth(y - 8)
    if (isMachine) {
      table.fillStyle(0x202038, 1).fillRoundedRect(x - 24, y - 28, 48, 48, 5)
      table.lineStyle(2, accent, 0.85).strokeRoundedRect(x - 24, y - 28, 48, 48, 5)
      table.fillStyle(0x101827, 1).fillRect(x - 16, y - 20, 32, 18)
      table.fillStyle(accent, 0.8).fillRect(x - 11, y - 15, 6, 4).fillRect(x - 1, y - 15, 6, 4).fillRect(x + 9, y - 15, 3, 4)
      table.fillStyle(accent, 0.6).fillRect(x - 13, y + 5, 8, 5).fillRect(x + 5, y + 5, 8, 5)
    } else {
      table.fillStyle(0x161727, 1).fillRoundedRect(x - 36, y - 18, 72, 36, 12)
      table.lineStyle(3, accent, 0.9).strokeRoundedRect(x - 36, y - 18, 72, 36, 12)
      table.fillStyle(0x29463f, 1).fillRoundedRect(x - 29, y - 12, 58, 24, 8)
      table.fillStyle(accent, 0.9).fillCircle(x - 12, y, 4).fillCircle(x, y, 4).fillCircle(x + 12, y, 4)
      table.fillStyle(0x1a1b2b, 1).fillRect(x - 46, y - 5, 8, 12).fillRect(x + 38, y - 5, 8, 12)
      if (label.includes('Chess')) {
        table.fillStyle(0xf5dfbc, 0.95)
        for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) if ((row + column) % 2 === 0) table.fillRect(x - 13 + column * 7, y - 10 + row * 5, 6, 4)
      }
    }
  }

  private getNearestInteractive() {
    if (!this.myPlayer) return undefined
    const canUseStudioHub = canAccessStudioHub(store.getState().user.authUser?.role)
    let nearest: typeof studioInteractiveObjects[number] | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    studioInteractiveObjects.forEach((object) => {
      if (!canUseStudioHub && opensStudioHub(object.type)) return
      const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, object.x, object.y)
      if (distance <= object.interactionRadius && distance < nearestDistance) {
        nearest = object
        nearestDistance = distance
      }
    })
    return nearest
  }

  private getNearestPortal() {
    if (!this.myPlayer) return undefined
    let nearest: StudioWorldPortal | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    studioWorldPortals.forEach((portal) => {
      const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, portal.x, portal.y)
      if (distance <= portal.interactionRadius && distance < nearestDistance) {
        nearest = portal
        nearestDistance = distance
      }
    })
    return nearest
  }

  private getNearestPlayerForInteraction() {
    if (!this.myPlayer) return undefined
    let nearest: { sessionId: string; userId: string; displayName: string; distance: number; avatarKey: string; characterConfig?: CharacterConfig } | undefined
    this.otherPlayerMap.forEach((otherPlayer, sessionId) => {
      // Layered LPC players intentionally hide the legacy sprite while their
      // container remains visible. Use `active` here so social interaction is
      // not disabled for users who have a canonical avatar config.
      if (!otherPlayer.active) return
      const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, otherPlayer.x, otherPlayer.y)
      if (distance > 84 || (nearest && distance >= nearest.distance)) return
      nearest = {
        sessionId,
        userId: otherPlayer.userId,
        displayName: otherPlayer.playerName.text || 'người chơi',
        distance,
        avatarKey: otherPlayer.playerTexture,
        characterConfig: otherPlayer.characterConfig,
      }
    })
    return nearest
  }

  private handleStudioInteraction() {
    const nearestPlayer = this.getNearestPlayerForInteraction()
    if (nearestPlayer) {
      phaserEvents.emit(Event.PLAYER_CONTEXT, nearestPlayer)
      return
    }
    const portal = this.getNearestPortal()
    if (portal) {
      const userId = store.getState().user.authUser?.id || ''
      const transition = portal.destination === 'FISHING' ? this.network.joinFishing() : this.network.joinHome(userId)
      void transition.catch(() => undefined)
      return
    }
    const object = this.getNearestInteractive()
    if (object) {
      if (opensStudioHub(object.type) && !canAccessStudioHub(store.getState().user.authUser?.role)) return
      if (isWorkInteractiveObject(object.type)) {
        phaserEvents.emit(Event.WORK_INTERACTION, object)
        return
      }
      phaserEvents.emit(Event.GAME_INTERACTION, object.type as InteractiveObjectType)
      if (object.gameMode) phaserEvents.emit(Event.GAME_TABLE_OPEN, { ...object })
    }
  }

  private updateStudioWorld() {
    if (!this.myPlayer) return
    const room = getRoomForPosition(this.myPlayer.x, this.myPlayer.y)
    if (room.id !== this.currentRoom) {
      this.currentRoom = room.id
      store.dispatch(setCurrentRoom(room.id))
      phaserEvents.emit(Event.MY_PLAYER_ROOM_CHANGED, room)
    }
    this.nearestInteractive = this.getNearestInteractive()
    this.nearestPortal = this.getNearestPortal()
    this.nearestPlayerForInteraction = this.getNearestPlayerForInteraction()
    if (this.nearestPlayerForInteraction) {
      this.interactionHint
        .setText(`[E] SOCIAL · ${this.nearestPlayerForInteraction.displayName}`)
        .setPosition(this.myPlayer.x, this.myPlayer.y - 52)
        .setVisible(true)
    } else if (this.nearestPortal) {
      this.interactionHint
        .setText(`[E] VÀO ${this.nearestPortal.label}`)
        .setPosition(this.nearestPortal.x, this.nearestPortal.y - 58)
        .setVisible(true)
    } else if (this.nearestInteractive) {
      const hintOffset = INTERACTION_HINT_OFFSETS[this.nearestInteractive.type]
      const isWorkAccess = isWorkInteractiveObject(this.nearestInteractive.type)
      this.interactionHint
        .setText(`[E] ${this.nearestInteractive.accessLabel || this.nearestInteractive.label}`)
        // Follow the player for work access points. This keeps the prompt
        // below the room sign and avoids covering neighboring department
        // labels in the compact rooms.
        .setPosition(isWorkAccess ? this.myPlayer.x : this.nearestInteractive.x + hintOffset.x, isWorkAccess ? this.myPlayer.y - 52 : this.nearestInteractive.y + hintOffset.y)
        .setVisible(true)
    } else {
      this.interactionHint.setVisible(false)
    }
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const obj = group
      .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
      .setDepth(actualY)
    return obj
  }

  private addGroupFromTiled(
    objectLayerName: string,
    key: string,
    tilesetName: string,
    collidable: boolean
  ) {
    const group = this.physics.add.staticGroup()
    const objectLayer = this.map.getObjectLayer(objectLayerName)
    objectLayer.objects.forEach((object) => {
      // The connector owns this strip of the map. Do not load old office
      // props/walls on top of it, otherwise the hallway looks fused to a room.
      if (this.isInGamesWingConnector(object)) return
      const actualX = object.x! + object.width! * 0.5
      const actualY = object.y! - object.height! * 0.5
      group
        .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
        .setDepth(actualY)
    })
    if (this.myPlayer && collidable)
      this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], group)
  }

  private isInGamesWingConnector(object: Phaser.Types.Tilemaps.TiledObject) {
    const connector = this.gamesWingConnectorBounds
    if (!connector || object.x === undefined || object.y === undefined) return false
    const width = object.width || 0
    const height = object.height || 0
    return object.x < connector.x + connector.width && object.x + width > connector.x &&
      object.y < connector.y + connector.height && object.y + height > connector.y
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (!newPlayer || id === this.network.mySessionId || this.otherPlayerMap.has(id)) return
    const texture = newPlayer.anim.split('_')[0] || 'adam'
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, texture, id, newPlayer.name)
    otherPlayer.userId = newPlayer.userId
    if (newPlayer.characterConfigJson) {
      try { otherPlayer.setCharacterConfig(JSON.parse(newPlayer.characterConfigJson) as CharacterConfig) } catch { /* legacy player */ }
    }
    otherPlayer.setNameplate(newPlayer.nameplateId || 'nameplate-basic')
    otherPlayer.setTitle(newPlayer.titleId)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true
  }

  private handleMyVideoConnected() {
    this.myPlayer.videoConnected = true
  }

  private handleMyPlayerNameplateChange(nameplateId?: string) {
    const social = store.getState().social.snapshot
    this.myPlayer?.setNameplate(nameplateId || social?.loadout.nameplateId || 'nameplate-basic')
  }

  private handleMyPlayerTitleChange(titleId?: string) {
    const social = store.getState().social.snapshot
    this.myPlayer?.setTitle(titleId !== undefined ? titleId : social?.loadout.titleId)
  }

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handleSocialEmote(payload: SocialEmoteEvent) {
    const target = payload.sessionId === this.network?.mySessionId ? this.myPlayer : this.otherPlayerMap.get(payload.sessionId)
    if (!target) return
    const labels: Record<string, string> = {
      WAVE: '👋',
      HEART: '💚',
      CLAP: '👏',
      COFFEE: '☕',
      GG: 'GG!',
      THINK: '🤔',
    }
    const emote = this.add.text(target.x, target.y - 78, labels[payload.emoteId] || '✦', {
      color: '#f4ffd7',
      fontFamily: 'DM Mono',
      fontSize: payload.emoteId === 'GG' ? '12px' : '18px',
      fontStyle: 'bold',
      backgroundColor: '#101622dd',
      padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setStroke('#101622', 2).setDepth(7100)
    this.tweens.add({ targets: emote, y: emote.y - 26, alpha: 0, duration: 1150, ease: 'Sine.easeOut', onComplete: () => emote.destroy() })
  }

  private handlePlayersOverlap(myPlayer, otherPlayer) {
    otherPlayer.makeCall(myPlayer, this.network?.webRTC)
  }

  private handleItemUserAdded(playerId: string, itemId: string, itemType: ItemType) {
    if (itemType === ItemType.COMPUTER) {
      const computer = this.computerMap.get(itemId)
      computer?.addCurrentUser(playerId)
    } else if (itemType === ItemType.WHITEBOARD) {
      const whiteboard = this.whiteboardMap.get(itemId)
      whiteboard?.addCurrentUser(playerId)
    }
  }

  private handleItemUserRemoved(playerId: string, itemId: string, itemType: ItemType) {
    if (itemType === ItemType.COMPUTER) {
      const computer = this.computerMap.get(itemId)
      computer?.removeCurrentUser(playerId)
    } else if (itemType === ItemType.WHITEBOARD) {
      const whiteboard = this.whiteboardMap.get(itemId)
      whiteboard?.removeCurrentUser(playerId)
    }
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content)
  }

  private handleStudioEvent(payload: { type: string; completion?: any }) {
    const completion = payload.completion
    const level = Number(completion?.studioProgress?.level || 1)
    if (payload.type === 'BOSS_DEFEATED') {
      this.cameras.main.flash(550, 255, 205, 105)
      this.cameras.main.shake(350, 0.006)
    } else if (payload.type === 'STUDIO_LEVEL_UP') {
      this.cameras.main.flash(400, 200, 242, 103)
    }
    if (level > 1) this.renderStudioUnlocks(level)
  }

  private handleTagGameUpdated(payload: TagGameSnapshot) {
    const taggerSessionId = payload.status === 'PLAYING' || payload.status === 'COUNTDOWN' ? payload.taggerSessionId : ''
    this.myPlayer?.setTagGameTagger(this.myPlayer.playerId === taggerSessionId)
    this.otherPlayerMap.forEach((player, sessionId) => player.setTagGameTagger(sessionId === taggerSessionId))
  }

  private handleMiniGameUpdated(payload: MiniGameSnapshot) {
    const markerLabels: Record<string, string> = {
      TREASURE: '💎',
      FALLING_OBJECT: '⚠',
      RED_FLAG: '🚩',
      BLUE_FLAG: '🚩',
    }
    const visibleItems = new Set<string>()
    if (payload.status === 'COUNTDOWN' || payload.status === 'PLAYING') {
      payload.items.forEach((item) => {
        const label = markerLabels[item.kind]
        if (!label || !item.active) return
        visibleItems.add(item.id)
        let marker = this.miniGameItemMarkers.get(item.id)
        if (!marker) {
          marker = this.add.text(item.x, item.y, label, {
            color: '#172015',
            fontFamily: 'Arial',
            fontSize: '15px',
            backgroundColor: '#ffcf90',
            padding: { left: 4, right: 4, top: 3, bottom: 3 },
          }).setOrigin(0.5).setDepth(5000)
          this.miniGameItemMarkers.set(item.id, marker)
        }
        marker.setPosition(item.x, item.y).setText(label).setVisible(true)
      })
    }
    this.miniGameItemMarkers.forEach((marker, itemId) => marker.setVisible(visibleItems.has(itemId)))
  }

  private handleCombatEvent(payload: CombatEventPayload) {
    const definition = COMBAT_WEAPONS.find((candidate) => candidate.id === payload.weapon)
    if (!definition) return
    const duration = payload.weapon === 'WATER_GUN' ? 210 : payload.weapon === 'BAT' ? 150 : 360
    if (payload.weapon === 'BAT') {
      const swing = this.add.text(payload.originX, payload.originY - 9, definition.icon, { fontSize: '20px' }).setOrigin(0.5).setDepth(7000)
      swing.setAngle(payload.directionX < 0 ? -55 : 55)
      this.tweens.add({ targets: swing, x: payload.targetX, y: payload.targetY, angle: payload.directionX < 0 ? -145 : 145, alpha: 0.2, duration, onComplete: () => swing.destroy() })
    } else {
      const projectile = this.add.text(payload.originX, payload.originY, payload.weapon === 'WATER_GUN' ? '💧' : definition.icon, { fontSize: payload.weapon === 'WATER_GUN' ? '12px' : '16px' }).setOrigin(0.5).setDepth(7000)
      if (payload.weapon === 'SLIPPER') this.tweens.add({ targets: projectile, angle: 540, duration, repeat: 0 })
      const trail = this.add.graphics().setDepth(6999)
      trail.lineStyle(payload.weapon === 'WATER_GUN' ? 3 : 2, payload.weapon === 'WATER_GUN' ? 0x6ee7ff : 0xffd58a, 0.65)
      trail.lineBetween(payload.originX, payload.originY, payload.targetX, payload.targetY)
      this.tweens.add({ targets: trail, alpha: 0, duration: duration + 120, onComplete: () => trail.destroy() })
      this.tweens.add({ targets: projectile, x: payload.targetX, y: payload.targetY, duration, ease: 'Sine.easeIn', onComplete: () => projectile.destroy() })
    }
    if (!payload.hit) return
    const target = payload.targetSessionId === this.network.mySessionId ? this.myPlayer : payload.targetSessionId ? this.otherPlayerMap.get(payload.targetSessionId) : undefined
    if (target) {
      target.setTint(payload.weapon === 'WATER_GUN' ? 0x70ddff : 0xffc36e)
      target.updateDialogBubble(getCombatHitReaction(payload.weapon, payload.eventId))
      this.time.delayedCall(260, () => target.clearTint())
    }
    const impact = this.add.text(payload.targetX, payload.targetY - 24, payload.weapon === 'WATER_GUN' ? 'SPLASH!' : 'HIT!', { color: payload.weapon === 'WATER_GUN' ? '#80e8ff' : '#ffe08a', fontFamily: 'DM Mono', fontSize: '10px', fontStyle: 'bold', stroke: '#101622', strokeThickness: 3 }).setOrigin(0.5).setDepth(7100)
    this.tweens.add({ targets: impact, y: impact.y - 24, alpha: 0, scale: 1.35, duration: 520, onComplete: () => impact.destroy() })
    if (payload.targetSessionId === this.network.mySessionId) this.cameras.main.shake(130, 0.004)
  }

  private renderStudioUnlocks(level: number) {
    const unlocks = level >= 2 ? ['office_plant_large'] : []
    if (level >= 3) unlocks.push('qa_trophy')
    if (level >= 4) unlocks.push('arcade_machine')
    unlocks.forEach((unlock) => {
      if (this.studioUnlocks.has(unlock)) return
      this.studioUnlocks.add(unlock)
      const positions: Record<string, { x: number; y: number; label: string; color: number }> = {
        office_plant_large: { x: 820, y: 270, label: '✿', color: 0x8fe388 },
        qa_trophy: { x: 505, y: 390, label: '♛', color: 0xffc865 },
        arcade_machine: { x: 1908, y: 320, label: '★', color: 0xae91ff },
      }
      const placement = positions[unlock]
      if (!placement) return
      this.add.circle(placement.x, placement.y, 18, placement.color, 0.85).setDepth(5)
      this.add.text(placement.x, placement.y - 7, placement.label, { color: '#172015', fontSize: '17px' }).setOrigin(0.5).setDepth(6)
      this.add.text(placement.x, placement.y + 21, unlock.replace(/_/g, ' '), { color: '#e6f7d2', fontFamily: 'Arial', fontSize: '8px', backgroundColor: '#101622dd', padding: { left: 3, right: 3, top: 2, bottom: 2 } }).setOrigin(0.5, 0).setDepth(6)
    })
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyE, this.keyR, this.network)
      this.updateStudioWorld()
    }
  }
}
