import Phaser from 'phaser'
import {
  AVATAR_ANIMATIONS,
  LPC_ANIMATION_FRAME_COUNTS,
  LPC_ANIMATION_FRAME_DURATIONS,
  LPC_LAYER_RENDER_ORDER,
  AVATAR_STATIC_FRAME_INDEX,
  AvatarAnimation,
  AvatarCatalogItem,
  AvatarDirection,
  CharacterConfig,
  getAvatarFrameCoordinates,
  getAvatarSheetFrameSize,
  getAvatarLayerZ,
  getAvatarAssetKey,
  getAvatarAssetSet,
  getAvatarAssetPath,
  getAvatarCatalogItem,
  LPC_SHADOW_ASSETS,
  normalizeCharacterConfig,
} from '../../../types/Avatar'

interface RenderLayer {
  sprite: Phaser.GameObjects.Sprite
  item?: AvatarCatalogItem
  slot?: keyof CharacterConfig['slots']
  shadow?: boolean
}

const TINTED_SLOTS: ReadonlyArray<keyof CharacterConfig['slots']> = ['top', 'bottom', 'shoes', 'hat', 'neck', 'arms', 'shoulders']

function parseAnimationKey(animationKey: string): { animation: AvatarAnimation; direction: AvatarDirection } {
  const parts = animationKey.split('_')
  const directionPart = parts[parts.length - 1] as AvatarDirection
  const direction = ['up', 'left', 'down', 'right'].includes(directionPart) ? directionPart : 'down'
  const actionPart = parts.length > 2 ? parts[parts.length - 2] : 'idle'
  const animation = AVATAR_ANIMATIONS.includes(actionPart as AvatarAnimation) ? actionPart as AvatarAnimation : 'idle'
  return { animation, direction }
}

export default class LpcLayeredCharacterRenderer {
  readonly container: Phaser.GameObjects.Container
  private config: CharacterConfig
  private layers: RenderLayer[] = []
  private animation: AvatarAnimation = 'idle'
  private direction: AvatarDirection = 'down'
  private animationStartedAt = 0
  private lastFrame = -1
  private lastAnimationKey = ''

  constructor(private readonly scene: Phaser.Scene) {
    this.config = normalizeCharacterConfig(undefined)
    this.container = scene.add.container(0, 0).setVisible(false)
  }

  setConfig(config: CharacterConfig) {
    this.config = normalizeCharacterConfig(config)
    this.rebuildLayers()
    this.container.setVisible(true)
    this.animationStartedAt = this.scene.time.now
    this.lastFrame = -1
    this.lastAnimationKey = ''
    this.syncFrame(this.getFrameAt(0))
  }

  setAnimation(animationKey: string) {
    const next = parseAnimationKey(animationKey)
    const normalizedKey = `${next.animation}_${next.direction}`
    if (normalizedKey === this.lastAnimationKey) return
    this.animation = next.animation
    this.direction = next.direction
    this.lastAnimationKey = normalizedKey
    this.animationStartedAt = this.scene.time.now
    this.lastFrame = -1
    this.syncFrame(this.getFrameAt(0))
  }

  update(time: number) {
    if (!this.container.visible) return
    const staticFrame = AVATAR_STATIC_FRAME_INDEX[this.animation]
    if (staticFrame !== undefined) {
      if (staticFrame !== this.lastFrame) this.syncFrame(staticFrame)
      return
    }
    const frameCount = LPC_ANIMATION_FRAME_COUNTS[this.animation]
    const frameDuration = LPC_ANIMATION_FRAME_DURATIONS[this.animation]
    const frame = Math.floor(Math.max(0, time - this.animationStartedAt) / frameDuration) % frameCount
    if (frame !== this.lastFrame) this.syncFrame(frame)
  }

  private getFrameAt(elapsedMilliseconds: number) {
    const staticFrame = AVATAR_STATIC_FRAME_INDEX[this.animation]
    if (staticFrame !== undefined) return staticFrame
    const frameCount = LPC_ANIMATION_FRAME_COUNTS[this.animation]
    const frameDuration = LPC_ANIMATION_FRAME_DURATIONS[this.animation]
    return Math.floor(Math.max(0, elapsedMilliseconds) / frameDuration) % frameCount
  }

  setPosition(x: number, y: number) {
    // LPC frames are 64×64 while the existing world body is 32×48. Keeping
    // the feet on the same baseline makes the renderer a drop-in visual layer.
    // The world is pixel art and the camera uses integer follow pixels. Keep
    // this separate visual layer on the same integer grid so it cannot shimmer
    // between half-pixel positions while the physics body is moving.
    this.container.setPosition(Math.round(x), Math.round(y) + 24)
  }

  setDepth(depth: number) {
    this.container.setDepth(Math.round(depth))
  }

  destroy() {
    this.container.destroy(true)
  }

  private rebuildLayers() {
    this.container.removeAll(true)
    this.layers = []

    this.addLayer(LPC_SHADOW_ASSETS, undefined, true)
    const layerEntries = LPC_LAYER_RENDER_ORDER.map((slot) => {
      const item = getAvatarCatalogItem(this.config.slots[slot], slot)
      if (!item) return undefined
      const assetSet = getAvatarAssetSet(item, this.config.bodyProfile)
      if (!assetSet) return undefined
      return { slot, item, assetSet, z: getAvatarLayerZ(slot, item.id) }
    }).filter((entry): entry is { slot: keyof CharacterConfig['slots']; item: AvatarCatalogItem; assetSet: typeof LPC_SHADOW_ASSETS; z: number } => Boolean(entry))

    // Sorting by the shared LPC z values keeps normal shoes behind trousers
    // while still allowing tall boots to overlap the trouser hem correctly.
    layerEntries.sort((left, right) => left.z - right.z)
    layerEntries.forEach(({ slot, item, assetSet }) => {
      this.addLayer(assetSet, item, false, TINTED_SLOTS.includes(slot), slot)
    })
  }

  private addLayer(
    assetSet: typeof LPC_SHADOW_ASSETS,
    item?: AvatarCatalogItem,
    shadow = false,
    tinted = false,
    slot?: keyof CharacterConfig['slots'],
  ) {
    const initialPath = item ? getAvatarAssetPath(item, this.config.bodyProfile, this.animation) : assetSet[this.animation]
    if (!initialPath) return
    const key = getAvatarAssetKey(initialPath)
    if (!this.scene.textures.exists(key)) return
    const sprite = this.scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1)
    if (tinted && item?.swatch) sprite.setTint(Number.parseInt(item.swatch.slice(1), 16))
    this.container.add(sprite)
    this.layers.push({ sprite, item, slot, shadow })
  }

  private syncFrame(frame: number) {
    // Scene shutdown can dispose the child sprites before the scene emits its
    // final fishing cleanup event. Ignore late animation updates instead of
    // calling setTexture on a detached Phaser object.
    if (!this.container.active || !this.scene?.sys?.isActive()) return
    this.lastFrame = frame
    this.layers.forEach((layer) => {
      if (!layer.sprite.active || !layer.sprite.scene?.sys?.isActive()) return
      const path = layer.item
        ? getAvatarAssetPath(layer.item, this.config.bodyProfile, this.animation)
        : LPC_SHADOW_ASSETS[this.animation]
      if (!path) {
        layer.sprite.setVisible(false)
        return
      }
      const key = getAvatarAssetKey(path)
      if (!this.scene.textures.exists(key)) {
        layer.sprite.setVisible(false)
        return
      }
      layer.sprite.setVisible(true)
      layer.sprite.setTexture(key)
      const source = layer.sprite.texture.getSourceImage() as HTMLImageElement
      const frameSize = getAvatarSheetFrameSize(this.animation, path)
      const coordinates = getAvatarFrameCoordinates(
        this.animation,
        this.direction,
        source.width,
        source.height,
        frame,
        frameSize,
      )
      const columns = Math.max(1, Math.floor(source.width / coordinates.frameSize))
      layer.sprite.setFrame(coordinates.row * columns + coordinates.column)
    })
  }
}
