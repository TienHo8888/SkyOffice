import React, { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { applySocialReward, setSocialSnapshot } from '../stores/SocialStore'
import { setAuthSession } from '../stores/UserStore'
import { Event, phaserEvents } from '../events/EventCenter'
import { CosmeticCatalogItem, FurniturePlacement, PublicSocialProfile, SocialLoadout, SocialSnapshot } from '../../../types/Social'
import { normalizeCharacterConfig } from '../../../types/Avatar'
import type { AvatarWardrobeSlot } from '../../../types/Avatar'
import { StudioAvatarKey } from '../../../types/Studio'
import { getActiveWorldNetwork, getActiveWorldScene } from '../utils/activeWorld'
import LpcAvatarPreview from './LpcAvatarPreview'

interface Props {
  token: string
  social: SocialSnapshot | null
  onRefresh: () => void
  onNotice: (message: string) => void
  onError: (message: string) => void
}

const furnitureIcons: Record<string, string> = {
  'furniture-starter-chair': '🪑',
  'furniture-starter-plant': '🌱',
  'furniture-plaza-lamp': '🏮',
  'furniture-arcade-cabinet': '🕹️',
  'furniture-trophy-case': '🏆',
}

const wardrobeSlotLabels: Record<AvatarWardrobeSlot, string> = {
  top: 'Áo',
  bottom: 'Quần',
  shoes: 'Giày',
  hat: 'Nón',
  neck: 'Phụ kiện cổ',
  arms: 'Phụ kiện tay',
  shoulders: 'Phụ kiện vai',
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

export default function SocialHubPanel({ token, social, onRefresh, onNotice, onError }: Props) {
  const dispatch = useAppDispatch()
  const authUser = useAppSelector((state) => state.user.authUser)
  const [section, setSection] = useState<'overview' | 'wardrobe' | 'room' | 'profile'>('overview')
  const [selectedFurniture, setSelectedFurniture] = useState('')
  const [layout, setLayout] = useState<FurniturePlacement[]>(social?.property.furniture || [])
  const [profileId, setProfileId] = useState('')
  const [profile, setProfile] = useState<PublicSocialProfile | null>(null)
  const [giftItemId, setGiftItemId] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [characterAvatar, setCharacterAvatar] = useState<StudioAvatarKey>('adam')
  const [tradeRecipient, setTradeRecipient] = useState('')
  const [tradeAmount, setTradeAmount] = useState('10')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    setLayout(social?.property.furniture || [])
  }, [social?.property.updatedAt])

  useEffect(() => {
    if (authUser) setCharacterName(authUser.displayName)
    if (social?.loadout.avatarKey) setCharacterAvatar(social.loadout.avatarKey)
  }, [authUser?.id, authUser?.displayName, social?.loadout.avatarKey])

  const owned = useMemo(() => new Set(social?.ownedCosmetics || []), [social?.ownedCosmetics])
  const ownedItems = useMemo(() => (social?.catalog || []).filter((item) => owned.has(item.id)), [social?.catalog, owned])
  const wardrobeItems = ownedItems.filter((item) => item.slot === 'OUTFIT' || item.slot === 'NAMEPLATE')
  const furnitureItems = ownedItems.filter((item) => item.slot === 'FURNITURE')

  if (!social) return <div className="studio-loading">Loading social world…</div>

  const levelXp = Math.max(0, social.progression.gameXp - social.progression.xpForCurrentLevel)
  const levelXpTarget = Math.max(1, social.progression.xpToNextLevel - social.progression.xpForCurrentLevel)

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    try { await task() } catch (requestError) { onError(requestError instanceof StudioApiError ? requestError.message : 'Social action failed.') } finally { setBusy('') }
  }

  const claimDaily = () => run('daily', async () => {
    const reward = await studioApi.claimDailySocialReward(token)
    dispatch(applySocialReward(reward))
    onNotice(reward.duplicate ? 'Daily reward đã nhận rồi.' : `Daily reward · +${reward.coinDelta} Coin · +${reward.gameXpDelta} Character EXP`)
    onRefresh()
  })

  const saveCharacter = () => run('character', async () => {
    const displayName = characterName.trim()
    if (displayName.length < 2) { onError('Tên hiển thị cần ít nhất 2 ký tự.'); return }
    const characterConfig = normalizeCharacterConfig(authUser?.characterConfig || social.identity?.characterConfig, characterAvatar)
    const result = await studioApi.updateProfile(token, { displayName, avatarKey: characterAvatar, characterConfig })
    dispatch(setAuthSession({ token, user: result.user }))
    const scene = getActiveWorldScene()
    const savedConfig = result.user.characterConfig || characterConfig
    scene?.myPlayer?.setPlayerName(result.user.displayName)
    scene?.myPlayer?.setPlayerTexture(result.user.avatarKey || characterAvatar)
    scene?.myPlayer?.setCharacterConfig(savedConfig)
    scene?.network?.updatePlayerCharacterConfig(savedConfig)
    onNotice('Đã lưu nhân vật và tên hiển thị.')
    onRefresh()
  })

  const trade = () => run('trade', async () => {
    const amount = Number(tradeAmount)
    if (!tradeRecipient.trim() || !Number.isInteger(amount) || amount < 1) { onError('Nhập username/email người nhận và số Coin hợp lệ.'); return }
    const result = await studioApi.transferCoins(token, { recipient: tradeRecipient.trim(), amount, tradeId: `trade-${Date.now()}` })
    dispatch(setSocialSnapshot({ ...social, progression: result.progression }))
    setTradeAmount('10')
    onNotice(result.duplicate ? 'Giao dịch đã được ghi nhận trước đó.' : `Đã chuyển ${amount} Coin cho ${result.recipientName}.`)
    onRefresh()
  })

  const buy = (item: CosmeticCatalogItem) => run(item.id, async () => {
    const result = await studioApi.purchaseCosmetic(token, item.id)
    onNotice(result.duplicate ? 'Item đã có trong collection.' : `Đã mở khóa ${item.name}.`)
    onRefresh()
  })

  const equip = (item: CosmeticCatalogItem) => run(`equip-${item.id}`, async () => {
    const patch = item.wardrobe ? loadoutPatchForLayer(item.wardrobe.slot, item.wardrobe.itemId) : item.slot === 'OUTFIT' ? { outfitId: item.id } : { nameplateId: item.id }
    const loadout = await studioApi.updateSocialLoadout(token, patch)
    dispatch(setSocialSnapshot({ ...social, loadout }))
    if (item.slot === 'OUTFIT') {
      // Outfit changes update the canonical LPC config on the server. Pull the
      // returned identity immediately so the in-world avatar does not wait
      // for a scene reload or the next Studio refresh tick.
      const [{ user }, snapshot] = await Promise.all([studioApi.me(token), studioApi.social(token)])
      dispatch(setAuthSession({ token, user }))
      dispatch(setSocialSnapshot(snapshot))
      const scene = getActiveWorldScene()
      const savedConfig = user.characterConfig || snapshot.identity?.characterConfig
      if (savedConfig) {
        scene?.myPlayer?.setPlayerTexture(user.avatarKey || 'adam')
        scene?.myPlayer?.setCharacterConfig(savedConfig)
        scene?.network?.updatePlayerCharacterConfig(savedConfig)
      }
    } else {
      phaserEvents.emit(Event.MY_PLAYER_NAMEPLATE_CHANGE, item.id)
    }
    onNotice(`Đã trang bị ${item.name}. Ngoại hình và identity đã đồng bộ.`)
    onRefresh()
  })

  const placeFurniture = (x: number, y: number) => {
    if (!selectedFurniture) return
    const next = layout.filter((item) => item.itemId !== selectedFurniture && !(item.x === x && item.y === y))
    next.push({ itemId: selectedFurniture, x, y, rotation: 0 })
    setLayout(next)
  }

  const saveLayout = () => run('layout', async () => {
    const property = await studioApi.updateProperty(token, layout)
    dispatch(setSocialSnapshot({ ...social, property }))
    onNotice('Personal Room đã được lưu.')
  })

  const inspectProfile = () => run('profile', async () => {
    if (!profileId.trim()) return
    setProfile(await studioApi.socialProfile(token, profileId.trim()))
    setSection('profile')
  })

  const visitHome = () => run('home', async () => {
    if (!profile) return
    const network = getActiveWorldNetwork()
    if (!network) throw new Error('Kết nối game chưa sẵn sàng.')
    await network.joinHome(profile.userId)
    onNotice(`Đang mở Home của ${profile.displayName}.`)
  })

  const like = () => profile && run('like', async () => {
    const property = await studioApi.likeProperty(token, profile.userId)
    setProfile({ ...profile, property })
    onNotice('Đã thả like cho Personal Room.')
  })

  const gift = () => profile && giftItemId && run('gift', async () => {
    const item = await studioApi.giftPropertyFurniture(token, profile.userId, giftItemId)
    onNotice(item.duplicate ? 'Món furniture này đã được tặng trước đó.' : `Đã tặng ${item.item.name} cho ${profile.displayName}.`)
    setGiftItemId('')
    onRefresh()
  })

  const renderOverview = () => <>
    <div className="social-stat-grid">
      <div><span>COIN</span><strong>{social.progression.coinBalance.toLocaleString()}</strong><small>Virtual only</small></div>
      <div><span>GAME LEVEL</span><strong>{social.progression.gameLevel}</strong><small>{levelXp} / {levelXpTarget} EXP cấp này</small></div>
      <div><span>COLLECTION</span><strong>{social.ownedCosmetics.length}</strong><small>/ {social.catalog.length} items</small></div>
      <div><span>ROOM VISITS</span><strong>{social.property.visitCount}</strong><small>{social.property.likes} likes</small></div>
    </div>
    <section className="studio-card social-hero-card"><div><span className="studio-kicker">SOCIAL WORLD / CHARACTER LOOP</span><h2>Đây là thế giới của bạn.</h2><p>Chơi game, hoàn thành nhiệm vụ, nhận Character EXP và Coin, rồi biến avatar và căn phòng thành dấu ấn riêng.</p><button className="studio-primary" disabled={busy === 'daily'} onClick={claimDaily}>{busy === 'daily' ? 'Claiming…' : 'Claim daily reward →'}</button></div><div className="social-hero-mark">✦<small>LEVEL {social.progression.gameLevel}</small></div></section>
    <div className="social-world-actions"><section className="studio-card social-character-card"><div className="studio-card-header"><h3>Nhân vật</h3><span>{authUser?.username || 'player'}</span></div><div className="social-character-form"><label>Tên hiển thị<input value={characterName} maxLength={24} onChange={(event) => setCharacterName(event.target.value)} /></label><label>Avatar<select value={characterAvatar} onChange={(event) => setCharacterAvatar(event.target.value as StudioAvatarKey)}><option value="adam">Adam</option><option value="ash">Ash</option><option value="lucy">Lucy</option><option value="nancy">Nancy</option></select></label><button className="studio-secondary" disabled={busy === 'character'} onClick={saveCharacter}>Save character</button></div></section><section className="studio-card social-trade-card"><div className="studio-card-header"><h3>Giao dịch Coin</h3><span>Internal only</span></div><div className="social-character-form"><label>Người nhận<input value={tradeRecipient} onChange={(event) => setTradeRecipient(event.target.value)} placeholder="username / email" /></label><label>Số Coin<input type="number" min="1" max="100000" value={tradeAmount} onChange={(event) => setTradeAmount(event.target.value)} /></label><button className="studio-primary" disabled={busy === 'trade'} onClick={trade}>Send Coin</button></div></section></div>
    <div className="social-section-tabs"><button className="studio-secondary" onClick={() => setSection('wardrobe')}>Open wardrobe</button><button className="studio-secondary" onClick={() => setSection('room')}>Edit personal room</button><button className="studio-secondary" onClick={() => setSection('profile')}>Inspect profile</button></div>
  </>

  const renderWardrobe = () => {
    const liveConfig = normalizeCharacterConfig(authUser?.characterConfig || social.identity?.characterConfig, social.loadout.avatarKey)
    const collectionItems = (social.catalog || []).filter((item) => item.slot === 'OUTFIT' || item.slot === 'NAMEPLATE')
    return <>
      <div className="studio-page-title"><div><span className="studio-kicker">MY WORLD / COLLECTION</span><h2>Wardrobe & status</h2><p>Cosmetic chỉ tạo identity, không tăng sức mạnh competitive.</p></div><button className="studio-ghost-link" onClick={() => setSection('overview')}>← Back</button></div>
      <section className="social-collection-grid">{collectionItems.map((item) => { const isOwned = owned.has(item.id); const equipped = item.wardrobe ? liveConfig.slots[item.wardrobe.slot] === item.wardrobe.itemId : item.slot === 'OUTFIT' ? social.loadout.outfitId === item.id : social.loadout.nameplateId === item.id; const itemLabel = item.wardrobe ? wardrobeSlotLabels[item.wardrobe.slot] : item.slot === 'OUTFIT' ? 'Bộ phối' : 'Nameplate'; return <article className={`social-item-card ${isOwned ? 'owned' : 'locked'}`} key={item.id}><span className="social-item-swatch" style={{ background: item.color || '#c8f267' }}>{item.wardrobe?.slot === 'hat' ? '⌂' : item.wardrobe ? '✦' : item.slot === 'OUTFIT' ? '◉' : '◆'}</span><div><strong>{item.name}</strong><small>{item.rarity} · {itemLabel}</small><p>{item.description}</p></div>{isOwned ? <button className="studio-secondary" disabled={equipped || busy === `equip-${item.id}`} onClick={() => equip(item)}>{equipped ? 'Equipped' : 'Equip'}</button> : <button className="studio-primary" disabled={busy === item.id || social.progression.gameLevel < (item.unlockLevel || 1) || social.progression.coinBalance < item.price} onClick={() => buy(item)}>{social.progression.gameLevel < (item.unlockLevel || 1) ? `Level ${item.unlockLevel}` : `${item.price.toLocaleString()} Coin`}</button>}</article> })}</section>
    </>
  }

  const renderRoom = () => <>
    <div className="studio-page-title"><div><span className="studio-kicker">MY WORLD / PROPERTY</span><h2>Personal Room</h2><p>Chọn furniture rồi bấm vào một ô để đặt. Template cố định 8×6.</p></div><div><button className="studio-ghost-link" onClick={() => setSection('overview')}>← Back</button><button className="studio-primary" disabled={busy === 'layout'} onClick={saveLayout}>Save room</button></div></div>
    <div className="social-room-layout"><section className="studio-card social-room-card"><div className="social-room-grid">{Array.from({ length: 48 }, (_, index) => { const x = index % 8; const y = Math.floor(index / 8); const placed = layout.find((item) => item.x === x && item.y === y); return <button className={`social-room-cell ${placed ? 'filled' : ''}`} key={`${x}-${y}`} onClick={() => placeFurniture(x, y)} title={`Room cell ${x + 1}, ${y + 1}`}>{placed ? furnitureIcons[placed.itemId] || '◆' : ''}</button> })}</div></section><aside className="studio-card social-furniture-list"><div className="studio-card-header"><h3>Furniture</h3><span>{layout.length} placed</span></div>{furnitureItems.map((item) => <button className={selectedFurniture === item.id ? 'selected' : ''} key={item.id} onClick={() => setSelectedFurniture(item.id)}><span>{furnitureIcons[item.id] || '◆'}</span><strong>{item.name}</strong></button>)}</aside></div>
  </>

  const renderProfile = () => <>
    <div className="studio-page-title"><div><span className="studio-kicker">MY WORLD / PUBLIC PROFILE</span><h2>Inspect a player</h2><p>Chỉ hiển thị social status, không hiển thị work XP.</p></div><button className="studio-ghost-link" onClick={() => setSection('overview')}>← Back</button></div>
    <section className="studio-card social-profile-search"><input value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="Nhập user ID" /><button className="studio-primary" disabled={busy === 'profile'} onClick={inspectProfile}>Inspect</button></section>
    {profile && <section className="studio-card social-profile-card"><LpcAvatarPreview className="social-profile-avatar-preview" config={profile.avatar.characterConfig} animation="idle" direction="down" showWeapon={false} /><div><span className="studio-kicker">{profile.nameplateId || 'BASIC'}</span><h2>{profile.displayName}</h2><p>{profile.title} · Game Level {profile.gameLevel}</p><p className="social-profile-career"><strong>{profile.career || 'No career selected'}</strong>{profile.careerRank ? ` · ${profile.careerRank}` : ''}</p><p>Achievements: {profile.achievements.join(' · ')}</p><p>Favorite game: {profile.favoriteGame || 'Chưa chọn'} · {profile.club}</p><p>Collection {profile.collectionCount}/{profile.collectionTotal} · Room likes {profile.property.likes} · Visits {profile.property.visitCount}</p><div className="social-profile-actions"><button className="studio-secondary" disabled={busy === 'home'} onClick={visitHome}>Visit Home</button><button className="studio-secondary" disabled={busy === 'like'} onClick={like}>♥ Like room</button><select value={giftItemId} onChange={(event) => setGiftItemId(event.target.value)}><option value="">Gift furniture…</option>{furnitureItems.filter((item) => item.price > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price.toLocaleString()} Coin</option>)}</select><button className="studio-primary" disabled={!giftItemId || busy === 'gift'} onClick={gift}>Send gift</button></div></div></section>}
  </>

  return <section className="social-hub-panel">{section === 'overview' ? renderOverview() : section === 'wardrobe' ? renderWardrobe() : section === 'room' ? renderRoom() : renderProfile()}</section>
}
