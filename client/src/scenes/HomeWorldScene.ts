import Phaser from 'phaser'
import WorldSceneBase, { WorldSceneData } from './WorldSceneBase'
import type { FurniturePlacement, PropertySnapshot } from '../../../types/Social'
import { DEFAULT_PROPERTY_STYLES, HOME_GRID_HEIGHT, HOME_GRID_WIDTH, getHousingItemDefinition, PropertyStyles } from '../../../types/Housing'
import { setWorldMapLoading } from '../stores/WorldStore'
import store from '../stores'
import { Event, phaserEvents } from '../events/EventCenter'

const HOME_BOUNDS = { minX: 64, maxX: 960, minY: 64, maxY: 640 }
const GRID_ORIGIN = { x: 128, y: 96 }
const GRID_CELL = 90

const FURNITURE_COLORS: Record<string, number> = {
  'furniture-starter-chair': 0x9a704b,
  'furniture-starter-plant': 0x65b57c,
  'furniture-plaza-lamp': 0xffd36d,
  'furniture-arcade-cabinet': 0x6fe0b0,
  'furniture-trophy-case': 0xffb86c,
  'furniture-tiny-table': 0xc89066,
  'furniture-cozy-rug': 0xd77d9c,
  'furniture-wall-shelf': 0xa8b6d8,
}

type HomeLayoutPayload = Pick<PropertySnapshot, 'furniture' | 'styles' | 'visibility'> | { furniture?: FurniturePlacement[]; styles?: PropertyStyles; visibility?: string }

export default class HomeWorldScene extends WorldSceneBase {
  private roomBackground!: Phaser.GameObjects.Graphics
  private roomTitle!: Phaser.GameObjects.Text
  private furnitureVisuals: Phaser.GameObjects.GameObject[] = []
  private exitMarker!: Phaser.GameObjects.Graphics
  private wasNearExit = false
  private readonly exitPortal = { x: 96, y: 570, radius: 92 }

  constructor() {
    super('home-world')
  }

  init(data: WorldSceneData) {
    this.network = data.network
    store.dispatch(setWorldMapLoading('LOADING'))
  }

  preload() {
    if (!this.textures.exists('housing-fishing-props')) this.load.image('housing-fishing-props', 'assets/world/home/housing_fishing_props_v0_alpha.png')
  }

  create(data: WorldSceneData) {
    this.createRoomBackground(DEFAULT_PROPERTY_STYLES)
    this.initializeWorld(data, 'HOME', HOME_BOUNDS, { x: 480, y: 360 })
    this.createExitPortal()
    this.renderLayout(this.network.getLatestHomeLayout())
    phaserEvents.on(Event.HOME_LAYOUT_UPDATED, this.handleLayoutUpdated, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupHome, this)
  }

  update(time: number, delta: number) {
    this.updateWorld(time, delta)
    if (this.exitMarker) this.exitMarker.setAlpha(0.65 + Math.sin(time / 280) * 0.2)
  }

  protected updateWorldInteraction() {
    const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, this.exitPortal.x, this.exitPortal.y)
    const near = distance <= this.exitPortal.radius
    if (near !== this.wasNearExit) this.wasNearExit = near
    if (near) this.showInteractionHint('[E] VỀ SKYOFFICE', this.exitPortal.x, this.exitPortal.y - 64)
    else this.interactionHint.setVisible(false)
  }

  protected onWorldInteract() {
    if (this.wasNearExit) void this.network.returnToPublic()
  }

  private handleLayoutUpdated(layout: HomeLayoutPayload) {
    this.renderLayout(layout)
  }

  private createRoomBackground(styles: PropertyStyles) {
    this.roomBackground?.destroy()
    this.roomBackground = this.add.graphics().setDepth(-15)
    const wallColor = styles.wallStyleId === 'blue_wallpaper' ? 0x3f6592 : 0x354363
    const floorColor = styles.floorStyleId === 'stone_floor' ? 0x667384 : 0x9a704b
    this.roomBackground.fillStyle(wallColor, 1).fillRect(32, 32, 928, 608)
    this.roomBackground.fillStyle(floorColor, 1).fillRect(GRID_ORIGIN.x - 18, GRID_ORIGIN.y - 18, GRID_CELL * HOME_GRID_WIDTH + 36, GRID_CELL * HOME_GRID_HEIGHT + 36)
    this.roomBackground.lineStyle(4, 0x101622, 0.85).strokeRect(32, 32, 928, 608)
    this.roomBackground.lineStyle(1, 0xf2d2a1, 0.17)
    for (let column = 0; column <= HOME_GRID_WIDTH; column += 1) this.roomBackground.lineBetween(GRID_ORIGIN.x + column * GRID_CELL, GRID_ORIGIN.y, GRID_ORIGIN.x + column * GRID_CELL, GRID_ORIGIN.y + HOME_GRID_HEIGHT * GRID_CELL)
    for (let row = 0; row <= HOME_GRID_HEIGHT; row += 1) this.roomBackground.lineBetween(GRID_ORIGIN.x, GRID_ORIGIN.y + row * GRID_CELL, GRID_ORIGIN.x + HOME_GRID_WIDTH * GRID_CELL, GRID_ORIGIN.y + row * GRID_CELL)
  }

  private createExitPortal() {
    this.exitMarker = this.add.graphics().setDepth(15)
    this.exitMarker.lineStyle(3, 0x84b8ff, 0.9).strokeCircle(this.exitPortal.x, this.exitPortal.y, 22)
    this.exitMarker.fillStyle(0x84b8ff, 0.22).fillCircle(this.exitPortal.x, this.exitPortal.y, 18)
    this.add.text(this.exitPortal.x, this.exitPortal.y + 32, 'EXIT · SKYOFFICE', {
      color: '#d9f4ff', fontFamily: 'DM Mono', fontSize: '8px', fontStyle: 'bold', backgroundColor: '#10233dcc', padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setDepth(16)
    this.roomTitle = this.add.text(62, 52, 'HOME · OWNER ROOM', {
      color: '#f2ffd8', fontFamily: 'DM Mono', fontSize: '13px', fontStyle: 'bold', backgroundColor: '#101622dd', padding: { left: 8, right: 8, top: 5, bottom: 5 },
    }).setDepth(16).setStroke('#101622', 3)
  }

  private renderLayout(raw: unknown) {
    const layout = raw as HomeLayoutPayload | undefined
    const styles = layout?.styles && typeof layout.styles === 'object' ? layout.styles : DEFAULT_PROPERTY_STYLES
    this.createRoomBackground(styles)
    this.furnitureVisuals.forEach((object) => object.destroy())
    this.furnitureVisuals = []
    const furniture = Array.isArray(layout?.furniture) ? layout.furniture : []
    furniture.forEach((placement) => this.renderFurniture(placement))
    if (this.roomTitle && layout?.visibility) this.roomTitle.setText(`HOME · ${layout.visibility === 'PUBLIC' ? 'PUBLIC' : 'FRIENDS'}`)
  }

  private renderFurniture(placement: FurniturePlacement) {
    const definition = getHousingItemDefinition(placement.itemId)
    if (!definition || definition.kind !== 'FURNITURE') return
    const rotated = placement.rotation === 90 || placement.rotation === 270
    const width = rotated ? definition.height : definition.width
    const height = rotated ? definition.width : definition.height
    const x = GRID_ORIGIN.x + placement.x * GRID_CELL + (width * GRID_CELL) / 2
    const y = GRID_ORIGIN.y + placement.y * GRID_CELL + (height * GRID_CELL) / 2
    const color = FURNITURE_COLORS[placement.itemId] || 0xae91ff
    const graphic = this.add.graphics().setDepth(y + 12)
    graphic.fillStyle(color, 0.9).fillRoundedRect(x - (width * GRID_CELL - 22) / 2, y - (height * GRID_CELL - 22) / 2, width * GRID_CELL - 22, height * GRID_CELL - 22, 8)
    graphic.lineStyle(2, 0x101622, 0.9).strokeRoundedRect(x - (width * GRID_CELL - 22) / 2, y - (height * GRID_CELL - 22) / 2, width * GRID_CELL - 22, height * GRID_CELL - 22, 8)
    const label = this.add.text(x, y, placement.itemId.replace('furniture-', '').replaceAll('-', ' ').toUpperCase(), {
      color: '#101622', fontFamily: 'DM Mono', fontSize: width > 1 ? '8px' : '7px', fontStyle: 'bold', align: 'center', wordWrap: { width: width * GRID_CELL - 28 },
    }).setOrigin(0.5).setDepth(y + 13)
    this.furnitureVisuals.push(graphic, label)
  }

  private cleanupHome() {
    this.wasNearExit = false
    phaserEvents.off(Event.HOME_LAYOUT_UPDATED, this.handleLayoutUpdated, this)
  }
}
