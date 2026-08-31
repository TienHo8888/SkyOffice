import React, { useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { setAuthSession } from '../stores/UserStore'
import { setSocialLoadout, setSocialSnapshot } from '../stores/SocialStore'
import { cloneCharacterConfig, getAvatarCatalogItem, normalizeCharacterConfig } from '../../../types/Avatar'
import type { AvatarSlot, AvatarWardrobeSlot, CharacterConfig } from '../../../types/Avatar'
import type { CosmeticCatalogItem, CosmeticRarity, SocialLoadout } from '../../../types/Social'
import { FISH_DEFINITIONS } from '../../../types/Fishing'
import { getActiveWorldScene } from '../utils/activeWorld'
import LpcAvatarPreview from './LpcAvatarPreview'

// The first 24 slots preserve the original inventory rhythm. The grid grows
// when a player owns more than that, so a large wardrobe remains accessible.
const INVENTORY_SLOT_COUNT = 24

type InventoryRarity = CosmeticRarity
type InventoryItemKind = 'utility' | 'outfit'

interface InventoryItem {
  id: string
  name: string
  description: string
  icon: string
  rarity: InventoryRarity
  quantity: number
  usable: boolean
  tradable: boolean
  kind: InventoryItemKind
  catalogItem?: CosmeticCatalogItem
}

const starterItems: InventoryItem[] = [
  {
    id: 'energy-potion',
    name: 'Nước tăng lực',
    description: 'Hồi một phần năng lượng cho nhân vật trong các hoạt động dài.',
    icon: '🧪',
    rarity: 'COMMON',
    quantity: 3,
    usable: true,
    tradable: true,
    kind: 'utility',
  },
  {
    id: 'lucky-ticket',
    name: 'Vé may mắn',
    description: 'Một lượt tham gia event đặc biệt của thế giới game.',
    icon: '🎟️',
    rarity: 'RARE',
    quantity: 2,
    usable: true,
    tradable: true,
    kind: 'utility',
  },
  {
    id: 'water-blaster',
    name: 'Súng nước',
    description: 'Vật phẩm chiến đấu đang được trang bị trong hotbar.',
    icon: '🔫',
    rarity: 'RARE',
    quantity: 1,
    usable: true,
    tradable: false,
    kind: 'utility',
  },
  {
    id: 'studio-token',
    name: 'Studio token',
    description: 'Token sưu tầm nhận được từ các mốc đóng góp của studio.',
    icon: '◆',
    rarity: 'EPIC',
    quantity: 1,
    usable: false,
    tradable: true,
    kind: 'utility',
  },
]

interface InventoryPanelProps {
  open: boolean
  onClose: () => void
}

const BUNDLE_LAYERS: readonly AvatarWardrobeSlot[] = ['top', 'bottom', 'shoes']

const LAYER_LABELS: Record<AvatarWardrobeSlot, string> = {
  top: 'ÁO',
  bottom: 'QUẦN',
  shoes: 'GIÀY',
  hat: 'NÓN',
  neck: 'CỔ',
  arms: 'TAY',
  shoulders: 'VAI',
}

function layerLabel(itemId: string, slot: AvatarSlot): string {
  return getAvatarCatalogItem(itemId, slot)?.label || itemId
}

function catalogLayers(item?: CosmeticCatalogItem): Array<{ slot: AvatarWardrobeSlot; itemId: string }> {
  if (!item) return []
  if (item.wardrobe) return [{ slot: item.wardrobe.slot, itemId: item.wardrobe.itemId }]
  if (!item.outfit) return []
  return BUNDLE_LAYERS.map((slot) => ({ slot, itemId: item.outfit!.slots[slot] }))
}

function previewWithOutfit(baseConfig: CharacterConfig, item?: CosmeticCatalogItem): CharacterConfig {
  const nextConfig = cloneCharacterConfig(baseConfig)
  catalogLayers(item).forEach(({ slot, itemId }) => { nextConfig.slots[slot] = itemId })
  return nextConfig
}

function loadoutPatchForLayer(slot: AvatarWardrobeSlot, itemId: string): Partial<Omit<SocialLoadout, 'userId'>> {
  if (slot === 'top') return { topId: itemId }
  if (slot === 'bottom') return { bottomId: itemId }
  if (slot === 'shoes') return { shoesId: itemId }
  if (slot === 'hat') return { hatId: itemId }
  if (slot === 'neck') return { neckId: itemId }
  if (slot === 'arms') return { armsId: itemId }
  return { shouldersId: itemId }
}

function isCatalogItemEquipped(item: CosmeticCatalogItem, config: CharacterConfig, currentOutfitId?: string): boolean {
  if (item.wardrobe) return config.slots[item.wardrobe.slot] === item.wardrobe.itemId
  return currentOutfitId === item.id
}

function wardrobeIcon(item: CosmeticCatalogItem): string {
  if (!item.wardrobe) return '👕'
  if (item.wardrobe.slot === 'hat') return '🧢'
  if (item.wardrobe.slot === 'shoes') return '👟'
  if (item.wardrobe.slot === 'neck') return '🧣'
  if (item.wardrobe.slot === 'arms' || item.wardrobe.slot === 'shoulders') return '🛡️'
  return '👕'
}

export default function InventoryPanel({ open, onClose }: InventoryPanelProps) {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.user.authToken)
  const authUser = useAppSelector((state) => state.user.authUser)
  const social = useAppSelector((state) => state.social.snapshot)
  const coinBalance = social?.progression.coinBalance || 0
  const [utilityItems, setUtilityItems] = useState<InventoryItem[]>(starterItems)
  const [selectedId, setSelectedId] = useState(starterItems[0].id)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const ownedOutfits = useMemo<InventoryItem[]>(() => {
    const owned = new Set(social?.ownedCosmetics || [])
    return (social?.catalog || [])
      .filter((item) => item.slot === 'OUTFIT' && item.outfit && owned.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.wardrobe
          ? `${item.description} Mặc riêng layer ${LAYER_LABELS[item.wardrobe.slot].toLowerCase()} hoặc phối cùng các món khác.`
          : `${item.description} Mặc một lần để áp dụng trọn bộ áo, quần và giày.`,
        icon: wardrobeIcon(item),
        rarity: item.rarity,
        quantity: 1,
        usable: true,
        tradable: false,
        kind: 'outfit',
        catalogItem: item,
      }))
  }, [social?.catalog, social?.ownedCosmetics])

  const caughtFish = useMemo<InventoryItem[]>(() => {
    const fishById = new Map(FISH_DEFINITIONS.map((fish) => [fish.id, fish]))
    return (social?.inventory || []).flatMap((stack) => {
      const fish = fishById.get(stack.itemId)
      if (!fish || stack.quantity <= 0) return []
      const rarity = fish.rarity.toUpperCase() as InventoryRarity
      const icon = fish.id === 'moon_koi' ? '🐟' : fish.id === 'leaf_carp' ? '🐠' : '🐡'
      return [{ id: fish.id, name: fish.id === 'pond_minnow' ? 'Pond Minnow' : fish.id === 'leaf_carp' ? 'Leaf Carp' : 'Moon Koi', description: `Cá bắt được ở Riverbend. Sell value tương lai: ${fish.sellValue} Coin.`, icon, rarity, quantity: stack.quantity, usable: false, tradable: false, kind: 'utility' as const }]
    })
  }, [social?.inventory])

  const items = useMemo(() => [...utilityItems, ...caughtFish, ...ownedOutfits], [caughtFish, ownedOutfits, utilityItems])
  const occupiedItems = useMemo(() => items.filter((item) => item.quantity > 0), [items])
  const inventorySlotCount = Math.max(INVENTORY_SLOT_COUNT, occupiedItems.length)
  const selectedItem = occupiedItems.find((item) => item.id === selectedId) || occupiedItems[0]
  const currentOutfitId = social?.loadout.outfitId
  const baseConfig = useMemo(
    () => normalizeCharacterConfig(authUser?.characterConfig, authUser?.avatarKey),
    [authUser?.avatarKey, authUser?.characterConfig],
  )
  const selectedPreviewConfig = useMemo(
    () => previewWithOutfit(baseConfig, selectedItem?.catalogItem),
    [baseConfig, selectedItem],
  )

  useEffect(() => {
    if (!selectedItem && occupiedItems[0]) setSelectedId(occupiedItems[0].id)
  }, [occupiedItems, selectedItem])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  if (!open) return null

  const useItem = () => {
    if (!selectedItem || selectedItem.kind !== 'utility' || !selectedItem.usable || selectedItem.quantity < 1 || busy) return
    setUtilityItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, quantity: item.quantity - 1 } : item))
    setFeedback(`Đã sử dụng ${selectedItem.name}.`)
  }

  const tradeItem = () => {
    if (!selectedItem || selectedItem.kind !== 'utility' || !selectedItem.tradable || selectedItem.quantity < 1) return
    setFeedback(`${selectedItem.name} có thể giao dịch khi marketplace được mở.`)
  }

  const equipLayer = async (slot: AvatarWardrobeSlot) => {
    const item = selectedItem?.catalogItem
    if (!token || !item || selectedItem?.kind !== 'outfit' || busy) return
    const layer = catalogLayers(item).find((candidate) => candidate.slot === slot)
    if (!layer || baseConfig.slots[slot] === layer.itemId) return
    setBusy(true)
    setFeedback('')
    try {
      const loadout = await studioApi.updateSocialLoadout(token, loadoutPatchForLayer(layer.slot, layer.itemId))
      dispatch(setSocialLoadout(loadout))
      const [{ user }, snapshot] = await Promise.all([studioApi.me(token), studioApi.social(token)])
      dispatch(setAuthSession({ token, user }))
      dispatch(setSocialSnapshot(snapshot))

      const scene = getActiveWorldScene()
      const fallbackConfig = cloneCharacterConfig(baseConfig)
      fallbackConfig.slots[layer.slot] = layer.itemId
      const savedConfig = user.characterConfig || fallbackConfig
      scene?.myPlayer?.setPlayerTexture(user.avatarKey || 'adam')
      scene?.myPlayer?.setCharacterConfig(savedConfig)
      scene?.network?.updatePlayerCharacterConfig(savedConfig)
      setFeedback(`Đã thay riêng ${LAYER_LABELS[layer.slot].toLowerCase()} “${layerLabel(layer.itemId, layer.slot)}”.`)
    } catch (requestError) {
      setFeedback(requestError instanceof StudioApiError ? requestError.message : 'Không thể thay món đồ này lúc này.')
    } finally {
      setBusy(false)
    }
  }

  const equipOutfit = async () => {
    const item = selectedItem?.catalogItem
    if (!token || !item || selectedItem?.kind !== 'outfit' || busy) return
    if (item.wardrobe) {
      await equipLayer(item.wardrobe.slot)
      return
    }
    if (currentOutfitId === item.id) return
    setBusy(true)
    setFeedback('')
    try {
      const loadout = await studioApi.updateSocialLoadout(token, { outfitId: item.id })
      dispatch(setSocialLoadout(loadout))
      const [{ user }, snapshot] = await Promise.all([studioApi.me(token), studioApi.social(token)])
      dispatch(setAuthSession({ token, user }))
      dispatch(setSocialSnapshot(snapshot))

      const scene = getActiveWorldScene()
      const savedConfig = user.characterConfig || previewWithOutfit(baseConfig, item)
      scene?.myPlayer?.setPlayerTexture(user.avatarKey || 'adam')
      scene?.myPlayer?.setCharacterConfig(savedConfig)
      scene?.network?.updatePlayerCharacterConfig(savedConfig)
      setFeedback(`Đã mặc bộ “${item.name}”. Ngoại hình đã đồng bộ với nhân vật trong phòng.`)
    } catch (requestError) {
      setFeedback(requestError instanceof StudioApiError ? requestError.message : 'Không thể mặc trang phục lúc này.')
    } finally {
      setBusy(false)
    }
  }

  const selectedLayers = catalogLayers(selectedItem?.catalogItem)
  const selectedIsOutfit = selectedItem?.kind === 'outfit' && Boolean(selectedItem.catalogItem)
  const selectedIsCurrent = Boolean(selectedItem?.catalogItem && isCatalogItemEquipped(selectedItem.catalogItem, baseConfig, currentOutfitId))

  return (
    <div className="game-feature-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="inventory-panel" role="dialog" aria-modal="true" aria-labelledby="inventory-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="game-feature-header">
          <div>
            <span className="game-feature-kicker">PLAYER INVENTORY / ITEM STORAGE</span>
            <h2 id="inventory-title">Túi đồ</h2>
            <p>Vật phẩm và hơn 600 món LPC đã sở hữu. Trang phục mua ở Cửa hàng có thể mặc riêng từng layer hoặc mặc thành bộ.</p>
          </div>
          <button className="game-feature-close" aria-label="Đóng túi đồ" onClick={onClose}>×</button>
        </header>

        <div className="inventory-meta">
          <span><i /> {occupiedItems.length} / {inventorySlotCount} Ô đã dùng</span>
          <strong>✦ {coinBalance.toLocaleString('vi-VN')} <small>COIN</small></strong>
        </div>

        <div className="inventory-layout">
          <div className="inventory-grid" aria-label="Các ô trong túi đồ">
            {Array.from({ length: inventorySlotCount }, (_, index) => {
              const item = occupiedItems[index]
              if (!item) return <div className="inventory-slot is-empty" key={`empty-${index}`} aria-label={`Ô trống ${index + 1}`}><span>＋</span><small>EMPTY</small></div>
              const isCurrentOutfit = item.kind === 'outfit' && Boolean(item.catalogItem && isCatalogItemEquipped(item.catalogItem, baseConfig, currentOutfitId))
              return <button className={`inventory-slot ${selectedItem?.id === item.id ? 'is-selected' : ''}${isCurrentOutfit ? ' is-equipped' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setFeedback('') }} aria-label={`${item.name}, số lượng ${item.quantity}`}>
                <i className={`inventory-rarity rarity-${item.rarity.toLowerCase()}`} />
                <strong>{item.icon}</strong>
                <span>{item.name}</span>
                <b>{isCurrentOutfit ? '✓' : item.quantity}</b>
              </button>
            })}
          </div>

          <aside className={`inventory-details${selectedIsOutfit ? ' has-outfit' : ''}`} aria-live="polite">
            {selectedItem ? <>
              {selectedIsOutfit && <div className="inventory-outfit-preview"><LpcAvatarPreview config={selectedPreviewConfig} animation="idle" direction="down" showWeapon={false} /></div>}
              <div className={`inventory-detail-icon rarity-${selectedItem.rarity.toLowerCase()}`}>{selectedItem.icon}</div>
              <span className={`inventory-rarity-label rarity-text-${selectedItem.rarity.toLowerCase()}`}>{selectedItem.rarity}</span>
              <h3>{selectedItem.name}</h3>
              <p>{selectedItem.description}</p>
              {selectedIsOutfit && <div className="inventory-outfit-layer-list">
                {selectedLayers.map(({ slot, itemId }) => {
                  const equipped = baseConfig.slots[slot] === itemId
                  return <span key={slot}><b>{LAYER_LABELS[slot]}</b><em>{layerLabel(itemId, slot)}</em><button type="button" disabled={busy || equipped} onClick={() => equipLayer(slot)}>{equipped ? 'ĐANG MẶC' : 'MẶC RIÊNG'}</button></span>
                })}
              </div>}
              {selectedIsOutfit ? <div className="inventory-detail-stats"><span>LOẠI <b>{selectedItem.catalogItem?.wardrobe ? 'LAYER' : 'BỘ PHỐI'}</b></span><span>TRADE <b>NO</b></span></div> : <div className="inventory-detail-stats"><span>SỐ LƯỢNG <b>x{selectedItem.quantity}</b></span><span>TRADE <b>{selectedItem.tradable ? 'YES' : 'NO'}</b></span></div>}
              <div className="inventory-actions">
                {selectedIsOutfit ? <>
                  <button className="inventory-primary" disabled={busy || selectedIsCurrent} onClick={equipOutfit}>{busy ? 'Đang đồng bộ…' : selectedIsCurrent ? 'Đang mặc' : selectedItem.catalogItem?.wardrobe ? 'Mặc món này' : 'Mặc bộ trang phục'}</button>
                  <button className="inventory-secondary" disabled>Đã sở hữu</button>
                </> : <>
                  <button className="inventory-primary" disabled={!selectedItem.usable || selectedItem.quantity < 1 || busy} onClick={useItem}>Dùng vật phẩm</button>
                  <button className="inventory-secondary" disabled={!selectedItem.tradable || selectedItem.quantity < 1 || busy} onClick={tradeItem}>Giao dịch</button>
                </>}
              </div>
            </> : <div className="inventory-empty-detail"><span>◌</span><strong>Túi đồ đang trống</strong><small>Vật phẩm nhận được sẽ xuất hiện ở đây.</small></div>}
          </aside>
        </div>

        {feedback && <div className="game-feature-feedback" role="status" aria-live="polite"><span>✦</span>{feedback}</div>}
        <footer className="game-feature-footer">Trang phục đã mua được lưu vĩnh viễn · có thể mặc trọn bộ hoặc phối riêng từng layer áo / quần / nón / giày / phụ kiện.</footer>
      </section>
    </div>
  )
}
