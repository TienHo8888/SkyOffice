import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  LPC_ANIMATION_FRAME_COUNTS,
  LPC_ANIMATION_FRAME_DURATIONS,
  LPC_LAYER_RENDER_ORDER,
  AVATAR_STATIC_FRAME_INDEX,
  getAvatarFrameCoordinates,
  getAvatarSheetFrameSize,
  getAvatarLayerZ,
  getAvatarAssetPath,
  getAvatarCatalogItem,
  LPC_SHADOW_ASSETS,
  normalizeCharacterConfig,
} from '../../../types/Avatar'
import type { AvatarAnimation, AvatarDirection, AvatarSlot, CharacterConfig } from '../../../types/Avatar'
import { getCachedAvatarImage, loadAvatarImage } from '../characters/AvatarAssetCache'

const TINTED_SLOTS: readonly AvatarSlot[] = ['top', 'bottom', 'shoes', 'hat', 'neck', 'arms', 'shoulders']

interface PreviewLayer {
  path: string
  tint?: string
  z: number
}

interface LpcAvatarPreviewProps {
  config: CharacterConfig
  animation?: AvatarAnimation
  direction?: AvatarDirection
  className?: string
  /** Outfit previews omit the equipped weapon so its silhouette is readable. */
  showWeapon?: boolean
  /** Render only the first frame; useful for static catalog thumbnails. */
  paused?: boolean
  /** Defer network work until this preview is near the visible scroll area. */
  lazy?: boolean
}

function getPreviewLayers(config: CharacterConfig, animation: AvatarAnimation, showWeapon: boolean): PreviewLayer[] {
  const layers: PreviewLayer[] = [{ path: LPC_SHADOW_ASSETS[animation], z: 0 }]
  LPC_LAYER_RENDER_ORDER.filter((slot) => showWeapon || slot !== 'weapon').forEach((slot) => {
    const item = getAvatarCatalogItem(config.slots[slot], slot)
    const path = getAvatarAssetPath(item, config.bodyProfile, animation)
    if (path) layers.push({
      path,
      tint: TINTED_SLOTS.includes(slot) ? item?.swatch : undefined,
      z: getAvatarLayerZ(slot, item?.id),
    })
  })
  return layers.sort((left, right) => left.z - right.z)
}

export default function LpcAvatarPreview({
  config,
  animation = 'idle',
  direction = 'down',
  className,
  showWeapon = true,
  paused = false,
  lazy = false,
}: LpcAvatarPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(!lazy)
  const [loading, setLoading] = useState(!lazy)
  const [hasMissingLayer, setHasMissingLayer] = useState(false)
  const [loadedVersion, setLoadedVersion] = useState(0)
  const normalizedConfig = useMemo(() => normalizeCharacterConfig(config), [config])

  useEffect(() => {
    if (!lazy) {
      setIsNearViewport(true)
      return
    }

    const preview = previewRef.current
    if (!preview) return
    if (!('IntersectionObserver' in window)) {
      setIsNearViewport(true)
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setIsNearViewport(true)
      observer.disconnect()
    }, { rootMargin: '420px 0px' })
    observer.observe(preview)
    return () => observer.disconnect()
  }, [lazy])

  useEffect(() => {
    if (!isNearViewport) return
    let cancelled = false
    const paths = getPreviewLayers(normalizedConfig, animation, showWeapon).map((layer) => layer.path)
    setLoading(paths.some((path) => !getCachedAvatarImage(path)))
    setHasMissingLayer(false)

    Promise.all(paths.map((path) => loadAvatarImage(path))).then((images) => {
      if (!cancelled) {
        setHasMissingLayer(images.some((image) => !image))
        setLoading(false)
        setLoadedVersion((version) => version + 1)
      }
    })

    return () => { cancelled = true }
  }, [animation, isNearViewport, normalizedConfig, showWeapon])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isNearViewport) return
    const context = canvas.getContext('2d')
    if (!context) return

    context.imageSmoothingEnabled = false
    let frameHandle = 0
    const startedAt = performance.now()
    const layers = getPreviewLayers(normalizedConfig, animation, showWeapon)
    const tintCanvas = document.createElement('canvas')
    tintCanvas.width = 128
    tintCanvas.height = 128
    const tintContext = tintCanvas.getContext('2d')
    if (tintContext) tintContext.imageSmoothingEnabled = false

    const render = (now: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      const staticFrame = AVATAR_STATIC_FRAME_INDEX[animation]
      const frame = staticFrame !== undefined
        ? staticFrame
        : Math.floor((now - startedAt) / LPC_ANIMATION_FRAME_DURATIONS[animation]) % LPC_ANIMATION_FRAME_COUNTS[animation]

      layers.forEach((layer) => {
        const image = getCachedAvatarImage(layer.path)
        if (!image) return
        const sourceWidth = image.naturalWidth || image.width
        const sourceHeight = image.naturalHeight || image.height
        const frameSize = getAvatarSheetFrameSize(animation, layer.path)
        const coordinates = getAvatarFrameCoordinates(animation, direction, sourceWidth, sourceHeight, frame, frameSize)
        const drawSize = coordinates.frameSize
        if (!layer.tint || !tintContext) {
          context.drawImage(image, coordinates.column * drawSize, coordinates.row * drawSize, drawSize, drawSize, 0, 0, 128, 128)
          return
        }
        tintContext.clearRect(0, 0, 128, 128)
        tintContext.globalCompositeOperation = 'source-over'
        tintContext.drawImage(image, coordinates.column * drawSize, coordinates.row * drawSize, drawSize, drawSize, 0, 0, 128, 128)
        tintContext.globalCompositeOperation = 'multiply'
        tintContext.fillStyle = layer.tint
        tintContext.fillRect(0, 0, 128, 128)
        tintContext.globalCompositeOperation = 'destination-in'
        tintContext.drawImage(image, coordinates.column * drawSize, coordinates.row * drawSize, drawSize, drawSize, 0, 0, 128, 128)
        tintContext.globalCompositeOperation = 'source-over'
        context.drawImage(tintCanvas, 0, 0)
      })

      if (!paused) frameHandle = window.requestAnimationFrame(render)
    }

    frameHandle = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(frameHandle)
  }, [animation, direction, isNearViewport, loadedVersion, normalizedConfig, paused, showWeapon])

  return (
    <div ref={previewRef} className={`lpc-avatar-preview${className ? ` ${className}` : ''}`} aria-busy={loading}>
      {isNearViewport && <canvas ref={canvasRef} width={128} height={128} aria-label="Avatar preview" />}
      {!isNearViewport && <span className="lpc-avatar-preview-deferred">Cuộn để xem</span>}
      {isNearViewport && loading && <span className="lpc-avatar-preview-loading">Đang tải layer…</span>}
      {isNearViewport && !loading && hasMissingLayer && <span className="lpc-avatar-preview-error">Thiếu layer</span>}
    </div>
  )
}
