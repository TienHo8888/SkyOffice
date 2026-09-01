import Phaser from 'phaser'
import WorldSceneBase, { WorldSceneData } from './WorldSceneBase'
import { DEFAULT_FISHING_SPOT_ID, FISHING_MAP_HEIGHT, FISHING_MAP_WIDTH, FISHING_SPOTS, FISHING_WATER_BLOCKERS, getFishingSpawnPoint, getFishingSpot } from '../../../types/Fishing'
import type { FishingPhase } from '../../../types/Fishing'
import { setNearbyFishingSpot, setWorldMapLoading } from '../stores/WorldStore'
import store from '../stores'
import { Event, phaserEvents } from '../events/EventCenter'

const FISHING_BOUNDS = { minX: 48, maxX: FISHING_MAP_WIDTH - 48, minY: 48, maxY: FISHING_MAP_HEIGHT - 48 }

// The source map is a visual backdrop only. Water geometry is shared with the
// server through FISHING_WATER_BLOCKERS so a rejected network position and a
// local Arcade collision always agree about where the avatar may stand.
const FISHING_COLLISION_RECTS = [
  { x: 0, y: 0, width: FISHING_MAP_WIDTH, height: 48 },
  { x: 0, y: FISHING_MAP_HEIGHT - 48, width: FISHING_MAP_WIDTH, height: 48 },
  { x: 0, y: 0, width: 48, height: FISHING_MAP_HEIGHT },
  { x: FISHING_MAP_WIDTH - 48, y: 0, width: 48, height: FISHING_MAP_HEIGHT },
  ...FISHING_WATER_BLOCKERS,
]

export default class FishingWorldScene extends WorldSceneBase {
  private spotMarkers: Phaser.GameObjects.Graphics[] = []
  private castTargetMarkers: Phaser.GameObjects.Graphics[] = []
  private fishingWalls?: Phaser.Physics.Arcade.StaticGroup
  private nearbyFishingSpotId: string | null = null
  private fishingActionActive = false
  private keySpace!: Phaser.Input.Keyboard.Key

  constructor() {
    super('fishing-world')
  }

  init(data: WorldSceneData) {
    this.network = data.network
    store.dispatch(setWorldMapLoading('LOADING'))
  }

  preload() {
    if (!this.textures.exists('fishing-riverbend-map')) this.load.image('fishing-riverbend-map', 'assets/world/fishing/life_fishing_riverbend_v1.png')
    if (!this.textures.exists('fish-pond-minnow')) this.load.image('fish-pond-minnow', 'assets/world/fishing/fish/pond_minnow.png')
    if (!this.textures.exists('fish-leaf-carp')) this.load.image('fish-leaf-carp', 'assets/world/fishing/fish/leaf_carp.png')
    if (!this.textures.exists('fish-moon-koi')) this.load.image('fish-moon-koi', 'assets/world/fishing/fish/moon_koi.png')
  }

  create(data: WorldSceneData) {
    const map = this.add.image(0, 0, 'fishing-riverbend-map').setOrigin(0).setDepth(-20)
    map.setDisplaySize(FISHING_MAP_WIDTH, FISHING_MAP_HEIGHT)
    this.createMapWayfinding()
    this.createCollisionLayer()
    this.initializeWorld(data, 'FISHING', FISHING_BOUNDS, getFishingSpawnPoint(0))
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.createFishingSpots()
    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], this.fishingWalls as Phaser.Physics.Arcade.StaticGroup)
    phaserEvents.on(Event.FISHING_PHASE_CHANGED, this.handleFishingPhase, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupFishing, this)
  }

  update(time: number, delta: number) {
    if (this.fishingActionActive) {
      this.myPlayer?.setVelocity(0, 0)
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) phaserEvents.emit(Event.FISHING_REEL_ACTION)
    } else this.updateWorld(time, delta)
    const pulse = 0.65 + Math.sin(time / 260) * 0.2
    this.spotMarkers.forEach((marker) => marker.setAlpha(pulse))
    this.castTargetMarkers.forEach((marker) => marker.setAlpha(0.35 + Math.sin(time / 320) * 0.12))
  }

  protected updateWorldInteraction() {
    let nearestSpot: typeof FISHING_SPOTS[number] | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    FISHING_SPOTS.forEach((spot) => {
      const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, spot.x, spot.y)
      if (distance < nearestDistance) {
        nearestSpot = spot
        nearestDistance = distance
      }
    })
    const nearSpot = nearestSpot && nearestDistance <= nearestSpot.interactionRadius ? nearestSpot : undefined
    const nextSpotId = nearSpot?.id || null
    if (nextSpotId !== this.nearbyFishingSpotId) {
      this.nearbyFishingSpotId = nextSpotId
      store.dispatch(setNearbyFishingSpot(nextSpotId))
    }
    if (nearSpot) this.showInteractionHint(`[E] CÂU CÁ · ${nearSpot.label}`, nearSpot.x, nearSpot.y - 72)
    else this.interactionHint.setVisible(false)
  }

  protected onWorldInteract() {
    const spot = getFishingSpot(this.nearbyFishingSpotId || '')
    if (spot) phaserEvents.emit(Event.FISHING_SPOT_INTERACTION, { spotId: spot.id })
  }

  private createFishingSpots() {
    const markerColors = [0x84b8ff, 0x6fe0b0, 0xae91ff, 0xffb86c, 0x78d8ff, 0xc8f267, 0xff78c8, 0x9ce8ff]
    FISHING_SPOTS.forEach((spot, index) => {
      const color = markerColors[index % markerColors.length]
      const marker = this.add.graphics().setDepth(20)
      marker.lineStyle(3, color, 0.9).strokeCircle(spot.x, spot.y, 24)
      marker.fillStyle(color, 0.2).fillCircle(spot.x, spot.y, 20)
      marker.fillStyle(0xffffff, 0.75).fillCircle(spot.x - 7, spot.y - 7, 4)
      marker
        .setInteractive(new Phaser.Geom.Circle(spot.x, spot.y, 30), Phaser.Geom.Circle.Contains)
        .on('pointerdown', () => {
          if (this.nearbyFishingSpotId === spot.id) phaserEvents.emit(Event.FISHING_SPOT_INTERACTION, { spotId: spot.id })
        })
      this.spotMarkers.push(marker)

      // A quiet ripple marks the water landing point without turning every
      // patch of water into an interaction target. The cast animation uses
      // this exact coordinate as its bobber destination.
      const castTarget = this.add.graphics().setDepth(-5)
      castTarget.lineStyle(1, color, 0.36).strokeEllipse(spot.castX, spot.castY, 30, 10)
      castTarget.fillStyle(color, 0.08).fillEllipse(spot.castX, spot.castY, 18, 6)
      this.castTargetMarkers.push(castTarget)

      this.add.text(spot.x, spot.y + 32, `FISHING SPOT · ${spot.label}`, {
        color: index % 2 ? '#d9ffe9' : '#d9f4ff', fontFamily: 'DM Mono', fontSize: '7px', fontStyle: 'bold', backgroundColor: '#10233dcc', padding: { left: 5, right: 5, top: 2, bottom: 2 },
      }).setOrigin(0.5).setDepth(21)
    })
  }

  private handleFishingPhase(payload: { phase?: FishingPhase; spotId?: string }) {
    if (!this.myPlayer || !payload?.phase) return
    if (payload.phase === 'IDLE') {
      this.fishingActionActive = false
      this.myPlayer.stopFishingAnimation()
      return
    }
    const spot = getFishingSpot(payload.spotId || DEFAULT_FISHING_SPOT_ID)
    if (!spot) return
    this.fishingActionActive = true
    this.myPlayer.setVelocity(0, 0)
    this.myPlayer.playFishingAnimation(payload.phase, spot)
  }

  private createMapWayfinding() {
    this.add.text(92, 72, 'RIVERBEND · PUBLIC FISHING', {
      color: '#f2ffd8', fontFamily: 'DM Mono', fontSize: '13px', fontStyle: 'bold', backgroundColor: '#10233dcc', padding: { left: 8, right: 8, top: 5, bottom: 5 },
    }).setDepth(10).setStroke('#10233d', 3)
    this.add.text(92, 105, 'Mọi người đã đăng nhập đều có thể vào · [ESC] quay về SkyOffice', {
      color: '#d1e7d5', fontFamily: 'DM Mono', fontSize: '8px', backgroundColor: '#10233d99', padding: { left: 6, right: 6, top: 3, bottom: 3 },
    }).setDepth(10)
  }

  private createCollisionLayer() {
    if (this.fishingWalls) return this.fishingWalls
    const walls = this.physics.add.staticGroup()
    FISHING_COLLISION_RECTS.forEach(({ x, y, width, height }) => {
      const wall = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false)
      this.physics.add.existing(wall, true)
      walls.add(wall)
    })
    this.fishingWalls = walls
    return walls
  }

  private cleanupFishing() {
    phaserEvents.off(Event.FISHING_PHASE_CHANGED, this.handleFishingPhase, this)
    this.myPlayer?.stopFishingAnimation()
    this.fishingActionActive = false
    this.nearbyFishingSpotId = null
    this.fishingWalls = undefined
    this.spotMarkers = []
    this.castTargetMarkers = []
    store.dispatch(setNearbyFishingSpot(null))
  }
}
