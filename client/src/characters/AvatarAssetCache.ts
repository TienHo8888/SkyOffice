import { getAvatarAssetKey, LPC_FRAME_SIZE } from '../../../types/Avatar'

const AVATAR_IMAGE_TIMEOUT_MS = 10000

const imageCache = new Map<string, HTMLImageElement>()
const imageRequests = new Map<string, Promise<HTMLImageElement | undefined>>()

function loadImage(source: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false
    let timeoutId = 0

    const finish = (result: HTMLImageElement | undefined) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      image.onload = null
      image.onerror = null
      resolve(result)
    }

    timeoutId = window.setTimeout(() => finish(undefined), AVATAR_IMAGE_TIMEOUT_MS)
    image.decoding = 'async'
    image.onload = () => finish(image)
    image.onerror = () => finish(undefined)
    image.src = source
  })
}

/**
 * Share one in-flight request between the shop cards, the large shop preview
 * and the in-world Phaser renderer. Hundreds of cards otherwise request the
 * same LPC body/shadow sheets independently and can starve the browser.
 */
export function loadAvatarImage(source: string): Promise<HTMLImageElement | undefined> {
  const cached = imageCache.get(source)
  if (cached) return Promise.resolve(cached)

  const pending = imageRequests.get(source)
  if (pending) return pending

  const request = loadImage(source)
    .then((image) => {
      if (image) imageCache.set(source, image)
      return image
    })
    .finally(() => imageRequests.delete(source))
  imageRequests.set(source, request)
  return request
}

export function getCachedAvatarImage(source: string): HTMLImageElement | undefined {
  return imageCache.get(source)
}

interface PhaserTextureHost {
  textures: {
    exists: (key: string) => boolean
    addSpriteSheet: (key: string, image: HTMLImageElement, config: { frameWidth: number; frameHeight: number }) => unknown
  }
}

/** Load one browser image and register it as a Phaser texture on demand. */
export async function ensureAvatarTexture(scene: PhaserTextureHost, source: string, frameSize = LPC_FRAME_SIZE): Promise<boolean> {
  const key = getAvatarAssetKey(source)
  if (scene.textures.exists(key)) return true
  const image = await loadAvatarImage(source)
  if (!image || scene.textures.exists(key)) return scene.textures.exists(key)
  scene.textures.addSpriteSheet(key, image, { frameWidth: frameSize, frameHeight: frameSize })
  return scene.textures.exists(key)
}
