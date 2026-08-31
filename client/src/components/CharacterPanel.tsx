import React, { useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppSelector } from '../hooks'
import { Event, phaserEvents } from '../events/EventCenter'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { setSocialLoadout } from '../stores/SocialStore'
import { setAuthSession } from '../stores/UserStore'
import { getSocialTitle, getSocialTitleWinningCoins, getUnlockedSocialTitles, isSocialTitleUnlocked, SOCIAL_TITLES, SocialTitle, SocialTitleProgress } from '../../../types/Social'
import { characterConfigToLegacyAvatar, normalizeCharacterConfig } from '../../../types/Avatar'
import type { CharacterConfig } from '../../../types/Avatar'
import { StudioAvatarKey } from '../../../types/Studio'
import { studioRoomName } from '../../../types/StudioWorld'
import AvatarCreator from './AvatarCreator'
import { getActiveWorldScene } from '../utils/activeWorld'

import Adam from '../images/login/Adam_login.png'
import Ash from '../images/login/Ash_login.png'
import Lucy from '../images/login/Lucy_login.png'
import Nancy from '../images/login/Nancy_login.png'

const avatarImages: Record<StudioAvatarKey, string> = {
  adam: Adam,
  ash: Ash,
  lucy: Lucy,
  nancy: Nancy,
}

type CharacterTab = 'overview' | 'titles' | 'appearance'

interface CharacterPanelProps {
  open: boolean
  onClose: () => void
}

function formatCoins(value: number) {
  return value.toLocaleString('vi-VN')
}

function roleLabel(role?: string) {
  if (!role) return 'Người chơi'
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const titleGameNames: Record<string, string> = {
  BACCARAT: 'Baccarat',
  BLACKJACK: 'Blackjack',
  POKER: 'Poker',
  SICBO: 'Sic Bo',
  BAU_CUA: 'Bầu Cua',
  CHESS: 'Chess Arena',
  TIEN_LEN: 'Tiến Lên',
  DICE_DUEL: 'Dice Duel',
  LUCKY_DRAW: 'Lucky Draw',
}

function titleAchievementLabel(title: SocialTitle, titleProgress: readonly SocialTitleProgress[]) {
  if (!title.achievement) return ''
  const current = Math.min(getSocialTitleWinningCoins(title, titleProgress), title.achievement.target)
  const gameName = titleGameNames[title.achievement.gameId] || title.achievement.gameId
  return `${formatCoins(current)}/${formatCoins(title.achievement.target)} COIN THẮNG · ${gameName}`
}

export default function CharacterPanel({ open, onClose }: CharacterPanelProps) {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.user.authToken)
  const authUser = useAppSelector((state) => state.user.authUser)
  const displayName = useAppSelector((state) => state.user.displayName) || authUser?.displayName || 'Studio Maker'
  const currentRoom = useAppSelector((state) => state.user.currentRoom) || 'LOBBY'
  const activeWorld = useAppSelector((state) => state.world.worldId)
  const social = useAppSelector((state) => state.social.snapshot)
  const work = useAppSelector((state) => state.work.snapshot)
  const [tab, setTab] = useState<CharacterTab>('overview')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [appearanceConfig, setAppearanceConfig] = useState<CharacterConfig>(() => normalizeCharacterConfig(authUser?.characterConfig, authUser?.avatarKey))
  const [appearanceSaving, setAppearanceSaving] = useState(false)

  const coinBalance = social?.progression.coinBalance || 0
  const gameLevel = social?.progression.gameLevel || 1
  const gameXp = social?.progression.gameXp || 0
  const xpForCurrentLevel = social?.progression.xpForCurrentLevel || 0
  const xpToNextLevel = social?.progression.xpToNextLevel || 100
  const levelXp = Math.max(0, gameXp - xpForCurrentLevel)
  const levelXpTarget = Math.max(1, xpToNextLevel - xpForCurrentLevel)
  const xpProgress = Math.max(0, Math.min(100, levelXp / levelXpTarget * 100))
  const avatarKey = social?.loadout.avatarKey || authUser?.avatarKey || 'adam'
  const titleProgress = social?.titleProgress || []
  const currentCareerId = work?.progression.currentCareerId
  const currentCareerRank = currentCareerId ? work?.progression.currentRank : undefined
  const currentCareer = currentCareerId ? work?.careers.find((career) => career.id === currentCareerId) : undefined
  const savedTitle = getSocialTitle(social?.loadout.titleId)
  const equippedTitle = savedTitle && isSocialTitleUnlocked(savedTitle, titleProgress, currentCareerId, currentCareerRank) ? savedTitle : undefined
  const unlockedTitles = useMemo(() => getUnlockedSocialTitles(titleProgress, currentCareerId, currentCareerRank), [titleProgress, currentCareerId, currentCareerRank])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    setAppearanceConfig(normalizeCharacterConfig(authUser?.characterConfig, authUser?.avatarKey))
  }, [authUser?.avatarKey, authUser?.characterConfig, open])

  useEffect(() => {
    if (!notice && !error) return
    const timeout = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 3200)
    return () => window.clearTimeout(timeout)
  }, [notice, error])

  if (!open) return null

  const changeTitle = async (title?: SocialTitle) => {
    if (!token || !social || busy) return
    const titleId = title?.id || ''
    setBusy(titleId || 'clear-title')
    setNotice('')
    setError('')
    try {
      const loadout = await studioApi.updateSocialLoadout(token, { titleId })
      dispatch(setSocialLoadout(loadout))
      phaserEvents.emit(Event.MY_PLAYER_TITLE_CHANGE, loadout.titleId || '')
      setNotice(title ? `Đã trang bị danh hiệu “${title.name}”.` : 'Đã bỏ danh hiệu. Tên nhân vật trở về mặc định.')
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể cập nhật danh hiệu.')
    } finally {
      setBusy('')
    }
  }

  const saveAppearance = async () => {
    if (!token || !authUser || appearanceSaving) return
    setAppearanceSaving(true)
    setNotice('')
    setError('')
    try {
      const normalizedConfig = normalizeCharacterConfig(appearanceConfig, authUser.avatarKey)
      const legacyAvatarKey = characterConfigToLegacyAvatar(normalizedConfig)
      const { user } = await studioApi.updateProfile(token, { avatarKey: legacyAvatarKey, characterConfig: normalizedConfig })
      dispatch(setAuthSession({ token, user }))
      const scene = getActiveWorldScene()
      const savedConfig = user.characterConfig || normalizedConfig
      scene?.myPlayer?.setPlayerTexture(user.avatarKey || legacyAvatarKey)
      scene?.myPlayer?.setCharacterConfig(savedConfig)
      scene?.network?.updatePlayerCharacterConfig(savedConfig)
      setAppearanceConfig(savedConfig)
      setNotice('Đã lưu ngoại hình và đồng bộ với người chơi trong phòng.')
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể lưu ngoại hình nhân vật.')
    } finally {
      setAppearanceSaving(false)
    }
  }

  return (
    <div className="game-feature-layer character-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="character-panel" role="dialog" aria-modal="true" aria-labelledby="character-panel-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="game-feature-header character-header">
          <div>
            <span className="game-feature-kicker">PLAYER IDENTITY / CHARACTER MENU</span>
            <h2 id="character-panel-title">Nhân vật</h2>
            <p>EXP nhân vật tăng qua ván chơi và nhiệm vụ; chọn danh hiệu để hiển thị phía trên tên trong thế giới game.</p>
          </div>
          <button className="game-feature-close" aria-label="Đóng thông tin nhân vật" onClick={onClose}>×</button>
        </header>

        <div className="character-identity-card">
          <div className="character-portrait">
            <img src={avatarImages[avatarKey]} alt="" />
            <span>LV {gameLevel}</span>
          </div>
          <div className="character-identity-copy">
            <span className="character-label">DISPLAY NAME</span>
            <h3>{displayName}</h3>
            <p>@{authUser?.username || 'player'} <i>·</i> {roleLabel(authUser?.role)}</p>
            <p className="character-career-status"><span>CAREER</span> {currentCareer?.name || 'Chưa chọn nghề'}{currentCareer && ` · ${work?.progression.currentRank}`}</p>
            <div className={`character-equipped-title ${equippedTitle ? 'has-title' : 'is-empty'}`}>
              <small>DANH HIỆU ĐANG DÙNG</small>
              <strong style={equippedTitle ? { color: equippedTitle.color } : undefined}>{equippedTitle?.name || 'Chưa trang bị'}</strong>
            </div>
          </div>
          <div className="character-current-room"><span><i /> ONLINE</span><strong>{activeWorld === 'FISHING' ? 'Fishing · Riverbend' : activeWorld === 'HOME' ? 'Home World' : studioRoomName(currentRoom)}</strong><small>Vị trí hiện tại</small></div>
        </div>

        <nav className="character-tabs" aria-label="Thông tin nhân vật">
          <button className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}><span>01</span><strong>Thông tin cơ bản</strong></button>
          <button className={tab === 'titles' ? 'is-active' : ''} onClick={() => setTab('titles')}><span>02</span><strong>Danh hiệu</strong><b>{unlockedTitles.length}/{SOCIAL_TITLES.length}</b></button>
          <button className={tab === 'appearance' ? 'is-active' : ''} onClick={() => setTab('appearance')}><span>03</span><strong>Ngoại hình</strong></button>
        </nav>

        {tab === 'overview' ? <div className="character-overview">
          <section className="character-level-progress" aria-label="Tiến độ cấp nhân vật">
            <div className="character-level-progress-head"><div><span>CHARACTER EXP</span><strong>LEVEL {gameLevel}</strong></div><b>{formatCoins(levelXp)} <small>/ {formatCoins(levelXpTarget)} EXP</small></b></div>
            <div className="character-level-progress-bar"><i style={{ width: `${xpProgress}%` }} /></div>
            <p>{Math.max(0, levelXpTarget - levelXp).toLocaleString('vi-VN')} EXP nữa để lên Level {gameLevel + 1} · tổng cộng {formatCoins(gameXp)} EXP từ chơi game và hoàn thành nhiệm vụ.</p>
          </section>
          <div className="character-stat-grid">
            <article><span>COIN HIỆN CÓ</span><strong className="is-coin">✦ {formatCoins(coinBalance)}</strong><small>Số dư chơi game và mua đồ</small></article>
            <article><span>GAME LEVEL</span><strong>{gameLevel}</strong><small>{formatCoins(levelXp)} / {formatCoins(levelXpTarget)} EXP cấp này</small></article>
            <article><span>VAI TRÒ</span><strong>{roleLabel(authUser?.role)}</strong><small>Trong studio hiện tại</small></article>
            <article><span>CAREER</span><strong>{currentCareer?.name || 'Tutorial'}</strong><small>{currentCareer ? `${work?.progression.currentRank} · ${work?.progression.careerXp || 0} Career XP` : 'Hoàn thành Inbox Triage để chọn nghề'}</small></article>
            <article><span>TÊN HIỂN THỊ</span><strong>{displayName}</strong><small>Được đồng bộ realtime</small></article>
          </div>
          <section className="character-info-note">
            <span className="character-note-icon">✦</span>
            <div><strong>Danh hiệu là dấu ấn của bạn</strong><p>Danh hiệu game mở theo Coin thắng ròng ở từng game; danh hiệu nghề mở khi đúng nghề và đạt cấp yêu cầu. Tất cả chỉ để thể hiện cá tính, không cộng sức mạnh.</p></div>
            <button className="character-note-action" onClick={() => setTab('titles')}>Xem danh hiệu →</button>
          </section>
        </div> : tab === 'titles' ? <div className="character-titles-view">
          <div className="character-title-toolbar">
            <div><span className="character-label">GAME ACHIEVEMENTS</span><strong>{unlockedTitles.length} <small>ĐÃ MỞ</small></strong><p>Game title cần Coin thắng ròng ở đúng game; title nghề cần đúng career và cấp.</p></div>
            {equippedTitle && <button className="character-clear-title" disabled={busy !== ''} onClick={() => changeTitle()}>Bỏ danh hiệu</button>}
          </div>
          <div className="character-title-list" aria-label="Danh sách danh hiệu">
            {SOCIAL_TITLES.map((title, index) => {
              const isUnlocked = isSocialTitleUnlocked(title, titleProgress, currentCareerId, currentCareerRank)
              const isEquipped = equippedTitle?.id === title.id
              const titleCareer = title.careerId ? work?.careers.find((career) => career.id === title.careerId) : undefined
              const achievementLabel = titleAchievementLabel(title, titleProgress)
              const lockedLabel = title.achievement
                ? `TIẾN ĐỘ · ${achievementLabel}`
                : title.careerId
                ? !currentCareerId
                  ? `CHỌN NGHỀ · CẤP ${title.requiredCareerRank || 'APPRENTICE'}`
                  : currentCareerId !== title.careerId
                    ? `DÀNH CHO ${titleCareer?.name.toUpperCase() || title.careerId}`
                    : `CẦN CẤP ${title.requiredCareerRank || 'APPRENTICE'}`
                : 'ĐÃ SẴN SÀNG'
              return <article className={`character-title-card ${isUnlocked ? 'is-unlocked' : 'is-locked'} ${isEquipped ? 'is-equipped' : ''}`} key={title.id}>
                <div className="character-title-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="character-title-copy">
                  <strong style={{ color: isUnlocked ? title.color : '#738279' }}>{title.name}</strong>
                  <p>{title.description}</p>
                  <small>{isUnlocked ? title.achievement ? `ĐÃ MỞ KHÓA · ${achievementLabel}` : title.careerId ? `ĐÃ MỞ KHÓA · ${titleCareer?.name.toUpperCase() || title.careerId}` : 'ĐÃ MỞ KHÓA' : lockedLabel}</small>
                </div>
                <button className="character-title-action" disabled={!isUnlocked || isEquipped || busy !== ''} onClick={() => changeTitle(title)}>{isEquipped ? 'Đang dùng' : isUnlocked ? 'Trang bị' : 'Đang khóa'}</button>
              </article>
            })}
          </div>
        </div> : <div className="character-appearance-view">
          <AvatarCreator
            config={appearanceConfig}
            onChange={setAppearanceConfig}
            title="Chỉnh sửa ngoại hình"
            description="Chọn giới tính, tóc, khuôn mặt và điểm nhấn; outfit khởi đầu vẫn giữ 3 bộ để dành shop sau này."
          />
          <div className="character-appearance-actions">
            <span>Thay đổi chỉ áp dụng sau khi bạn bấm lưu.</span>
            <button className="character-appearance-save" type="button" disabled={appearanceSaving || !token} onClick={saveAppearance}>
              {appearanceSaving ? 'Đang lưu…' : 'Lưu ngoại hình'}
            </button>
          </div>
        </div>}

        {notice && <div className="game-feature-feedback character-feedback"><span>✦</span>{notice}</div>}
        {error && <div className="character-error" role="alert">{error}</div>}
        <footer className="game-feature-footer">Danh hiệu mặc định: không có · Danh hiệu game theo Coin thắng ròng, danh hiệu nghề theo career và cấp nghề.</footer>
      </section>
    </div>
  )
}
