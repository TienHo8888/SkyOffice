import React, { useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { setAuthSession } from '../stores/UserStore'
import { setSocialLoadout, setSocialSnapshot } from '../stores/SocialStore'
import { AVATAR_SHOP_CATEGORY_META, cloneCharacterConfig, getAvatarCatalogItem, normalizeCharacterConfig } from '../../../types/Avatar'
import type { AvatarShopCategory, AvatarSlot, AvatarWardrobeSlot, CharacterConfig } from '../../../types/Avatar'
import type { CosmeticCatalogItem, SocialLoadout } from '../../../types/Social'
import { getActiveWorldScene } from '../utils/activeWorld'
import LpcAvatarPreview from './LpcAvatarPreview'

interface StorePanelProps {
  open: boolean
  onClose: () => void
}

type StoreTabId = 'ALL' | AvatarShopCategory

interface StoreTab {
  id: StoreTabId
  label: string
  helper: string
  icon: string
}

const STORE_TABS: readonly StoreTab[] = [
  { id: 'ALL', label: 'Tất cả', helper: '600+ món', icon: '⊞' },
  ...AVATAR_SHOP_CATEGORY_META,
]

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

function formatCoins(value: number): string {
  return value.toLocaleString('vi-VN')
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

function itemCategory(item: CosmeticCatalogItem): AvatarShopCategory {
  return item.wardrobe?.category || 'SETS'
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

function previewWithOutfit(baseConfig: CharacterConfig, item?: CosmeticCatalogItem): CharacterConfig {
  const nextConfig = cloneCharacterConfig(baseConfig)
  const layers = catalogLayers(item)
  layers.forEach(({ slot, itemId }) => { nextConfig.slots[slot] = itemId })
  return nextConfig
}

function StoreOutfitCardPreview({ baseConfig, item }: { baseConfig: CharacterConfig; item: CosmeticCatalogItem }) {
  const previewConfig = useMemo(() => previewWithOutfit(baseConfig, item), [baseConfig, item])
  return <LpcAvatarPreview
    config={previewConfig}
    animation="idle"
    direction="down"
    showWeapon={false}
    paused
    className="store-outfit-card-preview"
  />
}

export default function StorePanel({ open, onClose }: StorePanelProps) {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.user.authToken)
  const authUser = useAppSelector((state) => state.user.authUser)
  const social = useAppSelector((state) => state.social.snapshot)
  const [activeTab, setActiveTab] = useState<StoreTabId>('TOPS')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const outfitItems = useMemo(
    () => (social?.catalog || []).filter((item) => item.slot === 'OUTFIT' && item.outfit),
    [social?.catalog],
  )
  const ownedCosmetics = useMemo(() => new Set(social?.ownedCosmetics || []), [social?.ownedCosmetics])
  const categoryCounts = useMemo<Record<StoreTabId, number>>(() => {
    const counts: Record<StoreTabId, number> = { ALL: outfitItems.length, TOPS: 0, BOTTOMS: 0, HEADWEAR: 0, FOOTWEAR: 0, ACCESSORIES: 0, SETS: 0 }
    outfitItems.forEach((item) => { counts[itemCategory(item)] += 1 })
    return counts
  }, [outfitItems])
  const categoryItems = useMemo(
    () => activeTab === 'ALL' ? outfitItems : outfitItems.filter((item) => itemCategory(item) === activeTab),
    [activeTab, outfitItems],
  )
  const visibleItems = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('vi-VN')
    if (!query) return categoryItems
    return categoryItems.filter((item) => `${item.id} ${item.name} ${item.description} ${itemCategory(item)}`.toLocaleLowerCase('vi-VN').includes(query))
  }, [categoryItems, searchTerm])
  const currentOutfitId = social?.loadout.outfitId
  const coinBalance = social?.progression.coinBalance || 0
  const gameLevel = social?.progression.gameLevel || 1
  const baseConfig = useMemo(
    () => normalizeCharacterConfig(authUser?.characterConfig, authUser?.avatarKey),
    [authUser?.avatarKey, authUser?.characterConfig],
  )
  const selectedItem = visibleItems.find((item) => item.id === selectedId) || categoryItems.find((item) => item.id === selectedId) || categoryItems[0] || outfitItems[0]
  const previewConfig = useMemo(() => previewWithOutfit(baseConfig, selectedItem), [baseConfig, selectedItem])

  useEffect(() => {
    if (!open || !categoryItems.length) return
    if (!selectedId || !categoryItems.some((item) => item.id === selectedId)) {
      setSelectedId(currentOutfitId && categoryItems.some((item) => item.id === currentOutfitId) ? currentOutfitId : categoryItems[0].id)
    }
  }, [currentOutfitId, open, categoryItems, selectedId])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !token || social) return
    studioApi.social(token)
      .then((snapshot) => dispatch(setSocialSnapshot(snapshot)))
      .catch((requestError) => setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải catalog trang phục.'))
  }, [dispatch, open, social, token])

  useEffect(() => {
    if (!notice && !error) return
    const timeout = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 3600)
    return () => window.clearTimeout(timeout)
  }, [error, notice])

  if (!open) return null

  const refreshSocial = async () => {
    if (!token) return
    dispatch(setSocialSnapshot(await studioApi.social(token)))
  }

  const purchase = async (item: CosmeticCatalogItem) => {
    if (!token || busy) return
    setBusy(`buy:${item.id}`)
    setNotice('')
    setError('')
    const noun = item.wardrobe ? 'món' : 'bộ'
    try {
      const result = await studioApi.purchaseCosmetic(token, item.id)
      await refreshSocial()
      setNotice(result.duplicate ? `Bạn đã sở hữu ${noun} “${item.name}”.` : `Đã mua ${noun} “${item.name}”. Bạn có thể mặc ngay hoặc đổi trong Túi đồ.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể mua trang phục lúc này.')
    } finally {
      setBusy('')
    }
  }

  const equipLayer = async (item: CosmeticCatalogItem, slot: AvatarWardrobeSlot) => {
    if (!token || busy || !ownedCosmetics.has(item.id)) return
    const layer = catalogLayers(item).find((candidate) => candidate.slot === slot)
    if (!layer || baseConfig.slots[slot] === layer.itemId) return
    setBusy(`equip:${slot}:${item.id}`)
    setNotice('')
    setError('')
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
      setNotice(`Đã thay riêng ${LAYER_LABELS[layer.slot].toLowerCase()} “${layerLabel(layer.itemId, layer.slot)}”. Các phần còn lại được giữ nguyên.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể thay món đồ này lúc này.')
    } finally {
      setBusy('')
    }
  }

  const equip = async (item: CosmeticCatalogItem) => {
    if (!token || busy || !ownedCosmetics.has(item.id)) return
    if (item.wardrobe) {
      await equipLayer(item, item.wardrobe.slot)
      return
    }
    if (currentOutfitId === item.id) return
    setBusy(`equip:${item.id}`)
    setNotice('')
    setError('')
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
      setNotice(`Đã mặc bộ “${item.name}”. Ngoại hình đã đồng bộ với nhân vật trong phòng.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể mặc trang phục lúc này.')
    } finally {
      setBusy('')
    }
  }

  const selectedLayers = catalogLayers(selectedItem)
  const activeTabMeta = STORE_TABS.find((tab) => tab.id === activeTab) || STORE_TABS[0]

  return (
    <div className="game-feature-layer store-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="store-panel" role="dialog" aria-modal="true" aria-labelledby="store-panel-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="game-feature-header store-header">
          <div>
            <span className="game-feature-kicker">COIN SHOP / LPC WARDROBE</span>
            <h2 id="store-panel-title">Cửa hàng trang phục</h2>
            <p>Khám phá hơn 600 món từ Universal LPC: mỗi tab có 100 mẫu để mua riêng, phối cùng tóc, mặt và các layer khác.</p>
          </div>
          <div className="store-header-wallet">
            <span>WALLET</span>
            <strong>✦ {formatCoins(coinBalance)} <small>COIN</small></strong>
          </div>
          <button className="game-feature-close" aria-label="Đóng cửa hàng" onClick={onClose}>×</button>
        </header>

        <div className="store-layout">
          <aside className="store-preview" aria-label="Xem trước trang phục">
            <div className="store-preview-kicker"><span>LIVE PREVIEW</span><i /> <small>{selectedItem?.rarity || 'COMMON'}</small></div>
            <div className="store-preview-stage"><LpcAvatarPreview config={previewConfig} animation="idle" direction="down" showWeapon={false} /></div>
            <div className="store-preview-copy">
              <span>{selectedItem?.wardrobe ? 'MÓN ĐANG CHỌN' : 'BỘ ĐANG CHỌN'}</span>
              <h3>{selectedItem?.name || 'Chưa có trang phục'}</h3>
              <p>{selectedItem?.description || 'Catalog trang phục sẽ xuất hiện sau khi dữ liệu được đồng bộ.'}</p>
            </div>
            {selectedLayers.length > 0 && <div className="store-preview-layers">
              {selectedLayers.map(({ slot, itemId }) => {
                const equipped = baseConfig.slots[slot] === itemId
                const owned = Boolean(selectedItem && ownedCosmetics.has(selectedItem.id))
                return <span key={slot}>
                  <b>{LAYER_LABELS[slot]}</b>
                  <em>{layerLabel(itemId, slot)}</em>
                  <button type="button" className={`store-layer-equip${equipped ? ' is-equipped' : ''}`} disabled={Boolean(busy) || !owned || equipped} onClick={() => selectedItem && equipLayer(selectedItem, slot)}>{equipped ? 'ĐANG MẶC' : owned ? 'MẶC RIÊNG' : selectedItem?.wardrobe ? 'MUA MÓN' : 'MUA BỘ'}</button>
                </span>
              })}
            </div>}
            <div className="store-preview-hint">Món mới chỉ đổi đúng layer của nó; bộ phối đổi áo, quần và giày cùng lúc. Tóc, mặt và các phụ kiện khác luôn được giữ nguyên.</div>
          </aside>

          <div className="store-catalog">
            <nav className="store-tabs" aria-label="Danh mục trang phục" role="tablist">
              {STORE_TABS.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={`store-tab${activeTab === tab.id ? ' is-active' : ''}`} onClick={() => { setActiveTab(tab.id); setSearchTerm('') }}>
                  <span className="store-tab-icon">{tab.icon}</span>
                  <span className="store-tab-copy"><strong>{tab.label}</strong><small>{tab.helper}</small></span>
                  <b>{categoryCounts[tab.id]}</b>
                </button>
              ))}
            </nav>

            <div className="store-catalog-toolbar">
              <div className="store-catalog-head"><div><span className="game-feature-kicker">{activeTabMeta.label.toUpperCase()} / SHOP INVENTORY</span><strong>{visibleItems.length} / {categoryCounts[activeTab]} sản phẩm</strong></div><small>{activeTab === 'ALL' ? 'Toàn bộ catalog đang mở bán' : 'Mỗi danh mục có ít nhất 100 mẫu để phối tự do'}</small></div>
              <label className="store-search"><span aria-hidden="true">⌕</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Tìm tên, mã sản phẩm…" aria-label="Tìm trang phục" /></label>
            </div>

            <div className="store-grid" aria-label={`Danh sách ${activeTabMeta.label.toLowerCase()}`}>
              {visibleItems.map((item) => {
                const owned = ownedCosmetics.has(item.id)
                const current = item.wardrobe ? baseConfig.slots[item.wardrobe.slot] === item.wardrobe.itemId : currentOutfitId === item.id
                const locked = Boolean(item.unlockLevel && gameLevel < item.unlockLevel)
                const canAfford = coinBalance >= item.price
                const itemBusy = busy.endsWith(item.id)
                const noun = item.wardrobe ? 'món' : 'bộ'
                return <article className={`store-outfit-card${selectedItem?.id === item.id ? ' is-selected' : ''}${current ? ' is-current' : ''}`} key={item.id} style={item.color ? { borderColor: `${item.color}88` } : undefined}>
                  <button className="store-outfit-select" type="button" onClick={() => setSelectedId(item.id)} aria-label={`Xem trước ${item.name}`}>
                    <span className="store-outfit-card-name">{item.name}</span>
                  </button>
                  <StoreOutfitCardPreview baseConfig={baseConfig} item={item} />
                  <div className="store-outfit-footer">
                    <span className={`store-outfit-price${owned ? ' is-owned' : ''}`} aria-label={`Giá ${formatCoins(item.price)} Coin`}>
                      {item.price === 0 ? 'MIỄN PHÍ' : <>✦ {formatCoins(item.price)} <small>COIN</small></>}
                    </span>
                    {!owned ? <button
                      type="button"
                      className="store-card-action"
                      aria-label={`Mua ${noun} ${item.name} với giá ${formatCoins(item.price)} Coin`}
                      disabled={Boolean(busy) || locked || !canAfford}
                      onClick={() => purchase(item)}
                    >
                      {itemBusy ? 'ĐANG XỬ LÝ…' : locked ? `CẦN LV ${item.unlockLevel}` : !canAfford && item.price > 0 ? 'THIẾU COIN' : item.price === 0 ? `NHẬN ${noun.toUpperCase()}` : `MUA ${noun.toUpperCase()}`}
                    </button>
                      : <button
                        type="button"
                        className={`store-card-action${current ? ' is-equipped' : ''}`}
                        aria-label={current ? `Đang mặc ${noun} ${item.name}` : `Mặc ${noun} ${item.name}`}
                        disabled={Boolean(busy) || current}
                        onClick={() => equip(item)}
                      >
                        {itemBusy ? 'ĐANG ĐỒNG BỘ…' : current ? 'ĐANG MẶC' : 'MẶC'}
                      </button>}
                  </div>
                </article>
              })}
              {!visibleItems.length && <div className="store-empty"><strong>Không tìm thấy món phù hợp</strong><span>Thử từ khóa khác hoặc chuyển sang tab khác.</span></div>}
            </div>
          </div>
        </div>

        {(notice || error) && <div className={`game-feature-feedback${error ? ' is-error' : ''}`} role="status" aria-live="polite"><span>{error ? '!' : '✦'}</span>{error || notice}</div>}
        <footer className="game-feature-footer">Mua một lần · phối tự do từng layer · Coin là tiền ảo dùng chung trong game · asset tham chiếu từ <a href="https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/" target="_blank" rel="noreferrer">Universal LPC</a>.</footer>
      </section>
    </div>
  )
}
