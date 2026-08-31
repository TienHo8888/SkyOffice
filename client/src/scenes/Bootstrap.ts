import Phaser from 'phaser'
import Network from '../services/Network'
import { BackgroundMode } from '../../../types/BackgroundMode'
import store from '../stores'
import { setRoomJoined } from '../stores/RoomStore'
import { AVATAR_ANIMATIONS, AVATAR_CATALOG, getAvatarAssetKey, getAvatarSheetFrameSize, LPC_SHADOW_ASSETS } from '../../../types/Avatar'
import { Event, phaserEvents } from '../events/EventCenter'
import type { WorldId } from '../../../types/IWorldState'

export default class Bootstrap extends Phaser.Scene {
  private preloadComplete = false
  network!: Network

  constructor() {
    super('bootstrap')
  }

  preload() {
    this.load.atlas(
      'cloud_day',
      'assets/background/cloud_day.png',
      'assets/background/cloud_day.json'
    )
    this.load.image('backdrop_day', 'assets/background/backdrop_day.png')
    this.load.atlas(
      'cloud_night',
      'assets/background/cloud_night.png',
      'assets/background/cloud_night.json'
    )
    this.load.image('backdrop_night', 'assets/background/backdrop_night.png')
    this.load.image('sun_moon', 'assets/background/sun_moon.png')

    this.load.tilemapTiledJSON('tilemap', 'assets/map/map.json')
    this.load.tilemapTiledJSON('gamesWing', 'assets/map/games-wing.json')
    this.load.spritesheet('tiles_wall', 'assets/map/FloorAndGround.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('chairs', 'assets/items/chair.png', {
      frameWidth: 32,
      frameHeight: 64,
    })
    this.load.spritesheet('computers', 'assets/items/computer.png', {
      frameWidth: 96,
      frameHeight: 64,
    })
    this.load.spritesheet('whiteboards', 'assets/items/whiteboard.png', {
      frameWidth: 64,
      frameHeight: 64,
    })
    this.load.spritesheet('vendingmachines', 'assets/items/vendingmachine.png', {
      frameWidth: 48,
      frameHeight: 72,
    })
    this.load.spritesheet('office', 'assets/tileset/Modern_Office_Black_Shadow.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('basement', 'assets/tileset/Basement.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('generic', 'assets/tileset/Generic.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('adam', 'assets/character/adam.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('ash', 'assets/character/ash.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('lucy', 'assets/character/lucy.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('nancy', 'assets/character/nancy.png', {
      frameWidth: 32,
      frameHeight: 48,
    })

    // Load the small, curated LPC catalog used by the in-game avatar creator.
    // The full generator repository stays outside the runtime bundle.
    const loadedLpcAssets = new Set<string>()
    const loadLpcAssetSet = (assetSet: typeof LPC_SHADOW_ASSETS) => {
      AVATAR_ANIMATIONS.forEach((animation) => {
        const source = assetSet[animation]
        const key = getAvatarAssetKey(source)
        if (loadedLpcAssets.has(key)) return
        loadedLpcAssets.add(key)
        const frameSize = getAvatarSheetFrameSize(animation, source)
        this.load.spritesheet(key, source, { frameWidth: frameSize, frameHeight: frameSize })
      })
    }
    loadLpcAssetSet(LPC_SHADOW_ASSETS)
    AVATAR_CATALOG.forEach((item) => {
      Object.values(item.assets).forEach((assetSet) => {
        if (assetSet) loadLpcAssetSet(assetSet)
      })
    })

    this.load.on('complete', () => {
      this.preloadComplete = true
      this.launchBackground(store.getState().user.backgroundMode)
      // The user can join the lobby before the Phaser preload finishes. In
      // that race WORLD_JOINED has already fired, so replay the current room
      // once the scene manager is ready instead of leaving the UI on the
      // room-selection screen.
      if (this.network?.getPlayers()) this.handleWorldJoined({ worldId: this.network.getActiveWorld() })
    })
  }

  init() {
    this.network = new Network()
    phaserEvents.on(Event.WORLD_JOINED, this.handleWorldJoined, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => phaserEvents.off(Event.WORLD_JOINED, this.handleWorldJoined, this))
  }

  private handleWorldJoined(payload: { worldId?: 'PUBLIC' | WorldId; ownerId?: string }) {
    if (!this.preloadComplete || !this.network) return
    const worldId = payload?.worldId || 'PUBLIC'
    this.network.webRTC?.checkPreviousPermission()
    if (worldId === 'FISHING') {
      if (this.scene.isActive('game')) this.scene.stop('game')
      if (this.scene.isActive('home-world')) this.scene.stop('home-world')
      if (!this.scene.isActive('fishing-world')) this.scene.launch('fishing-world', { network: this.network })
    } else if (worldId === 'HOME') {
      if (this.scene.isActive('game')) this.scene.stop('game')
      if (this.scene.isActive('fishing-world')) this.scene.stop('fishing-world')
      if (!this.scene.isActive('home-world')) this.scene.launch('home-world', { network: this.network })
    } else {
      if (this.scene.isActive('fishing-world')) this.scene.stop('fishing-world')
      if (this.scene.isActive('home-world')) this.scene.stop('home-world')
      this.launchGame()
    }
    store.dispatch(setRoomJoined(true))
  }

  private launchBackground(backgroundMode: BackgroundMode) {
    this.scene.launch('background', { backgroundMode })
  }

  launchGame() {
    if (!this.preloadComplete) return
    this.network.webRTC?.checkPreviousPermission()
    if (!this.scene.isActive('game')) this.scene.launch('game', { network: this.network })

    // update Redux state
    store.dispatch(setRoomJoined(true))
  }

  changeBackgroundMode(backgroundMode: BackgroundMode) {
    this.scene.stop('background')
    this.launchBackground(backgroundMode)
  }
}
