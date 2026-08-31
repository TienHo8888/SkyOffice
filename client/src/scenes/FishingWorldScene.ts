import Phaser from 'phaser'
import WorldSceneBase, { WorldSceneData } from './WorldSceneBase'
import { FISHING_MAP_HEIGHT, FISHING_MAP_WIDTH, FISHING_SPOTS, getFishingSpot } from '../../../types/Fishing'
import type { FishingPhase } from '../../../types/Fishing'
import { setNearFishingSpot, setWorldMapLoading } from '../stores/WorldStore'
import store from '../stores'
import { Event, phaserEvents } from '../events/EventCenter'

const FISHING_BOUNDS = { minX: 48, maxX: FISHING_MAP_WIDTH - 48, minY: 48, maxY: FISHING_MAP_HEIGHT - 48 }

// This is intentionally a Phaser-owned collision layer. The source map is a
// visual backdrop only; these rectangles are the SkyOffice collision contract
// and can be replaced by a hand-authored polygon layer without running any
// Godot scene/script from the reference repository.
const FISHING_COLLISION_RECTS = [
  { x: 0, y: 0, width: FISHING_MAP_WIDTH, height: 48 },
  { x: 0, y: FISHING_MAP_HEIGHT - 48, width: FISHING_MAP_WIDTH, height: 48 },
  { x: 0, y: 0, width: 48, height: FISHING_MAP_HEIGHT },
  { x: FISHING_MAP_WIDTH - 48, y: 0, width: 48, height: FISHING_MAP_HEIGHT },
  // Approximate the largest water channels while leaving the marked pier and
  // the central path open. Fine-grained collision can be authored later.
  { x: 420, y: 115, width: 130, height: 80 },
  { x: 580, y: 250, width: 160, height: 115 },
  { x: 760, y: 390, width: 150, height: 100 },
  { x: 910, y: 580, width: 120, height: 170 },
]

export default class FishingWorldScene extends WorldSceneBase {
  private spotMarker!: Phaser.GameObjects.Graphics
  private fishingWalls?: Phaser.Physics.Arcade.StaticGroup
  private wasNearFishingSpot = false
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
    this.initializeWorld(data, 'FISHING', FISHING_BOUNDS, { x: 760, y: 500 })
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.createFishingSpot()
    this.physics.add.collider(this.myPlayer, this.fishingWalls as Phaser.Physics.Arcade.StaticGroup)
    phaserEvents.on(Event.FISHING_PHASE_CHANGED, this.handleFishingPhase, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupFishing, this)
  }

  update(time: number, delta: number) {
    if (this.fishingActionActive) {
      this.myPlayer?.setVelocity(0, 0)
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) phaserEvents.emit(Event.FISHING_REEL_ACTION)
    } else this.updateWorld(time, delta)
    if (this.spotMarker) this.spotMarker.setAlpha(0.65 + Math.sin(time / 260) * 0.2)
  }

  protected updateWorldInteraction() {
    const spot = FISHING_SPOTS[0]
    const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, spot.x, spot.y)
    const near = distance <= spot.interactionRadius
    if (near !== this.wasNearFishingSpot) {
      this.wasNearFishingSpot = near
      store.dispatch(setNearFishingSpot(near))
    }
    if (near) this.showInteractionHint('[E] CÂU CÁ · Riverbend', spot.x, spot.y - 72)
    else this.interactionHint.setVisible(false)
  }

  protected onWorldInteract() {
    if (!this.wasNearFishingSpot) return
    const spot = getFishingSpot('town_pier')
    if (spot) phaserEvents.emit(Event.FISHING_SPOT_INTERACTION, { spotId: spot.id })
  }

  private createFishingSpot() {
    const spot = FISHING_SPOTS[0]
    this.spotMarker = this.add.graphics().setDepth(20)
    this.spotMarker.lineStyle(3, 0x84b8ff, 0.9).strokeCircle(spot.x, spot.y, 24)
    this.spotMarker.fillStyle(0x84b8ff, 0.2).fillCircle(spot.x, spot.y, 20)
    this.add.text(spot.x, spot.y + 32, 'FISHING SPOT · TOWN PIER', {
      color: '#d9f4ff', fontFamily: 'DM Mono', fontSize: '8px', fontStyle: 'bold', backgroundColor: '#10233dcc', padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setDepth(21)
  }

  private handleFishingPhase(payload: { phase?: FishingPhase; spotId?: string }) {
    if (!this.myPlayer || !payload?.phase) return
    if (payload.phase === 'IDLE') {
      this.fishingActionActive = false
      this.myPlayer.stopFishingAnimation()
      return
    }
    const spot = getFishingSpot(payload.spotId || 'town_pier')
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
    this.wasNearFishingSpot = false
    this.fishingWalls = undefined
    store.dispatch(setNearFishingSpot(false))
  }
}
