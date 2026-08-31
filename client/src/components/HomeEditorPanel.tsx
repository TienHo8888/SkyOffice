import React, { useEffect, useMemo, useState } from 'react'
import type { FurniturePlacement, PropertySnapshot } from '../../../types/Social'
import type { PropertyStyles, PropertyVisibility } from '../../../types/Housing'
import { DEFAULT_PROPERTY_STYLES, HOME_GRID_HEIGHT, HOME_GRID_WIDTH, getHousingItemDefinition } from '../../../types/Housing'
import { useAppDispatch, useAppSelector } from '../hooks'
import { setSocialSnapshot } from '../stores/SocialStore'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { Event, phaserEvents } from '../events/EventCenter'
import { getActiveWorldNetwork } from '../utils/activeWorld'

const furnitureIcons: Record<string, string> = {
  'furniture-starter-chair': '🪑',
  'furniture-starter-plant': '🌱',
  'furniture-plaza-lamp': '🏮',
  'furniture-arcade-cabinet': '🕹️',
  'furniture-trophy-case': '🏆',
  'furniture-tiny-table': '▱',
  'furniture-cozy-rug': '▰',
  'furniture-wall-shelf': '▤',
}

export default function HomeEditorPanel() {
  const dispatch = useAppDispatch()
  const worldId = useAppSelector((state) => state.world.worldId)
  const ownerId = useAppSelector((state) => state.world.ownerId)
  const authUser = useAppSelector((state) => state.user.authUser)
  const token = useAppSelector((state) => state.user.authToken)
  const social = useAppSelector((state) => state.social.snapshot)
  const [property, setProperty] = useState<PropertySnapshot | null>(null)
  const [layout, setLayout] = useState<FurniturePlacement[]>([])
  const [styles, setStyles] = useState<PropertyStyles>(DEFAULT_PROPERTY_STYLES)
  const [visibility, setVisibility] = useState<PropertyVisibility>('FRIENDS')
  const [selectedFurniture, setSelectedFurniture] = useState('')
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState('')
  const isOwner = Boolean(authUser?.id && ownerId === authUser.id)

  useEffect(() => {
    if (worldId !== 'HOME' || !token || !ownerId) return
    let active = true
    studioApi.property(token, ownerId).then((next) => {
      if (!active) return
      setProperty(next)
      setLayout(next.furniture || [])
      setStyles(next.styles || DEFAULT_PROPERTY_STYLES)
      setVisibility(next.visibility || 'FRIENDS')
    }).catch(() => undefined)
    return () => { active = false }
  }, [ownerId, token, worldId])

  useEffect(() => {
    if (worldId !== 'HOME') return
    const handleLayout = (next: PropertySnapshot) => {
      if (next.ownerId !== ownerId) return
      setProperty(next)
      setLayout(next.furniture || [])
      setStyles(next.styles || DEFAULT_PROPERTY_STYLES)
      setVisibility(next.visibility || 'FRIENDS')
    }
    phaserEvents.on(Event.HOME_LAYOUT_UPDATED, handleLayout)
    return () => { phaserEvents.off(Event.HOME_LAYOUT_UPDATED, handleLayout) }
  }, [ownerId, worldId])

  const ownedFurniture = useMemo(() => {
    const owned = new Set(social?.ownedCosmetics || [])
    return (social?.catalog || []).filter((item) => item.slot === 'FURNITURE' && owned.has(item.id))
  }, [social?.catalog, social?.ownedCosmetics])
  const ownedStyles = useMemo(() => {
    const owned = new Set(social?.ownedCosmetics || [])
    return (social?.catalog || []).filter((item) => item.slot === 'ROOM_STYLE' && owned.has(item.id))
  }, [social?.catalog, social?.ownedCosmetics])

  if (worldId !== 'HOME') return null

  const occupiedCells = (placement: FurniturePlacement) => {
    const definition = getHousingItemDefinition(placement.itemId)
    if (!definition) return []
    const width = placement.rotation === 90 || placement.rotation === 270 ? definition.height : definition.width
    const height = placement.rotation === 90 || placement.rotation === 270 ? definition.width : definition.height
    return Array.from({ length: width * height }, (_, index) => `${placement.x + index % width}:${placement.y + Math.floor(index / width)}`)
  }

  const placeFurniture = (x: number, y: number) => {
    if (!isOwner || !selectedFurniture) return
    const candidate: FurniturePlacement = { itemId: selectedFurniture, x, y, rotation }
    const cells = new Set(occupiedCells(candidate))
    const next = layout.filter((placement) => !occupiedCells(placement).some((cell) => cells.has(cell)))
    next.push(candidate)
    setLayout(next)
  }

  const saveLayout = async () => {
    if (!token || !isOwner || busy) return
    setBusy('layout')
    setFeedback('')
    try {
      const next = await studioApi.updateProperty(token, layout, styles)
      setProperty(next)
      setLayout(next.furniture)
      if (social) dispatch(setSocialSnapshot({ ...social, property: next }))
      setFeedback('Layout đã được lưu và broadcast tới khách đang ở Home.')
    } catch (error) {
      setFeedback(error instanceof StudioApiError ? error.message : 'Không thể lưu layout.')
    } finally { setBusy('') }
  }

  const updateVisibility = async (nextVisibility: PropertyVisibility) => {
    if (!token || !isOwner || busy) return
    setVisibility(nextVisibility)
    setBusy('access')
    try {
      const next = await studioApi.updatePropertyAccess(token, nextVisibility)
      setProperty(next)
      if (social) dispatch(setSocialSnapshot({ ...social, property: next }))
    } catch (error) {
      setFeedback(error instanceof StudioApiError ? error.message : 'Không thể cập nhật quyền truy cập.')
    } finally { setBusy('') }
  }

  return (
    <section className="world-panel home-editor-panel" aria-label="Home editor">
      <div className="world-panel-header"><div><span className="world-panel-kicker">HOME WORLD / {isOwner ? 'OWNER EDITOR' : 'GUEST VIEW'}</span><h2>🏠 Home</h2></div><button className="world-panel-close" onClick={() => void getActiveWorldNetwork()?.returnToPublic()} aria-label="Về SkyOffice">×</button></div>
      <p className="world-panel-copy">Room grid cố định {HOME_GRID_WIDTH}×{HOME_GRID_HEIGHT}. {isOwner ? 'Bạn là owner và có thể chỉnh nội thất.' : 'Bạn đang xem layout ở chế độ read-only.'}</p>
      {isOwner && <>
        <div className="home-editor-controls"><label>Wall<select value={styles.wallStyleId} onChange={(event) => setStyles({ ...styles, wallStyleId: event.target.value })}>{ownedStyles.filter((item) => item.id.includes('wall')).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Floor<select value={styles.floorStyleId} onChange={(event) => setStyles({ ...styles, floorStyleId: event.target.value })}>{ownedStyles.filter((item) => item.id.includes('floor')).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Access<select value={visibility} onChange={(event) => void updateVisibility(event.target.value as PropertyVisibility)}><option value="FRIENDS">Friends</option><option value="PUBLIC">Public</option></select></label></div>
        <div className="home-editor-tool-row"><select value={selectedFurniture} onChange={(event) => setSelectedFurniture(event.target.value)}><option value="">Chọn furniture…</option>{ownedFurniture.map((item) => <option value={item.id} key={item.id}>{furnitureIcons[item.id] || '◆'} {item.name}</option>)}</select><button className="world-secondary" onClick={() => setRotation((rotation + 90) % 360 as 0 | 90 | 180 | 270)}>Rotate {rotation}°</button><button className="world-primary" disabled={busy === 'layout'} onClick={() => void saveLayout()}>{busy === 'layout' ? 'Saving…' : 'Save layout'}</button></div>
      </>}
      <div className="home-editor-grid" aria-label="Home 8 by 6 grid">{Array.from({ length: HOME_GRID_WIDTH * HOME_GRID_HEIGHT }, (_, index) => { const x = index % HOME_GRID_WIDTH; const y = Math.floor(index / HOME_GRID_WIDTH); const placed = layout.find((item) => item.x === x && item.y === y); return <button disabled={!isOwner} className={`home-editor-cell${placed ? ' is-filled' : ''}`} key={`${x}-${y}`} onClick={() => placeFurniture(x, y)} title={`Ô ${x + 1}, ${y + 1}`}>{placed ? furnitureIcons[placed.itemId] || '◆' : ''}</button> })}</div>
      <div className="home-editor-meta"><span>{property?.ownerName || 'Home owner'} · {layout.length} furniture</span><span>{visibility === 'PUBLIC' ? 'PUBLIC VISITOR' : 'FRIENDS ONLY'}</span></div>
      {feedback && <div className="world-panel-error" role="status">{feedback}</div>}
    </section>
  )
}
