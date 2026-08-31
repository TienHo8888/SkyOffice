import React, { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '../hooks'
import { clearLevelUpNotice } from '../stores/SocialStore'
import { Event, phaserEvents } from '../events/EventCenter'
import { normalizeCharacterConfig } from '../../../types/Avatar'
import LpcAvatarPreview from './LpcAvatarPreview'
import { studioInteractiveObjects, studioRoomName } from '../../../types/StudioWorld'
import { getActiveWorldNetwork } from '../utils/activeWorld'

export default function PlayerHud() {
  const dispatch = useAppDispatch()
  const authUser = useAppSelector((state) => state.user.authUser)
  const displayName = useAppSelector((state) => state.user.displayName) || authUser?.displayName || 'Studio Maker'
  const authAvatar = authUser?.avatarKey
  const currentRoom = useAppSelector((state) => state.user.currentRoom)
  const activeWorld = useAppSelector((state) => state.world.worldId)
  const social = useAppSelector((state) => state.social.snapshot)
  const work = useAppSelector((state) => state.work.snapshot)

  const avatarKey = social?.loadout.avatarKey || authAvatar || 'adam'
  const avatarConfig = normalizeCharacterConfig(social?.identity?.characterConfig || authUser?.characterConfig, avatarKey)
  const gameLevel = social?.progression.gameLevel || 1
  const gameXp = social?.progression.gameXp || 0
  const xpForCurrentLevel = social?.progression.xpForCurrentLevel || 0
  const xpToNextLevel = social?.progression.xpToNextLevel || 100
  const coinBalance = social?.progression.coinBalance || 0
  const lastLevelUp = useAppSelector((state) => state.social.lastLevelUp)
  const levelXp = Math.max(0, gameXp - xpForCurrentLevel)
  const levelXpTarget = Math.max(1, xpToNextLevel - xpForCurrentLevel)
  const xpProgress = Math.max(0, Math.min(100, levelXp / levelXpTarget * 100))
  const currentCareer = work?.progression.currentCareerId ? work.careers.find((career) => career.id === work.progression.currentCareerId) : undefined
  const workCareerLabel = currentCareer ? `${currentCareer.name} · ${work.progression.currentRank}` : work?.tutorialCompleted ? 'Chưa chọn nghề' : 'Chưa làm tutorial'
  const salaryLabel = work ? `${work.daily.completedJobs} / ${work.salary.requiredJobs} JOBS` : 'WORK'
  const isDestination = activeWorld !== 'PUBLIC'
  const workCta = isDestination ? 'VỀ OFFICE' : !work?.tutorialCompleted ? 'BẮT ĐẦU' : !currentCareer ? 'CHỌN NGHỀ' : work.salary.state === 'READY' ? 'NHẬN LƯƠNG' : 'LÀM JOB'

  const openFishing = () => {
    const network = getActiveWorldNetwork()
    if (!network) {
      return
    }
    void network.joinFishing().catch(() => undefined)
  }

  const openWorkPanel = () => {
    if (isDestination) {
      void getActiveWorldNetwork()?.returnToPublic()
      return
    }
    const objectId = !work?.tutorialCompleted ? 'job-board' : !currentCareer ? 'career-center' : work.salary.state === 'READY' ? 'payroll-office' : 'job-board'
    const object = studioInteractiveObjects.find((candidate) => candidate.id === objectId)
    if (object) phaserEvents.emit(Event.WORK_INTERACTION, object)
  }

  useEffect(() => {
    if (!lastLevelUp) return
    const timeout = window.setTimeout(() => dispatch(clearLevelUpNotice()), 3400)
    return () => window.clearTimeout(timeout)
  }, [dispatch, lastLevelUp])

  return <aside className="player-hud" aria-label="Thông tin người chơi">
    <div className="player-hud-avatar">
      <LpcAvatarPreview config={avatarConfig} animation="idle" direction="down" showWeapon={false} />
      <span>LV {gameLevel}</span>
    </div>
    <div className="player-hud-content">
      <div className="player-hud-head">
        <div><span className="player-hud-kicker">CHARACTER PROFILE</span><strong>{displayName}</strong></div>
        <small>● {activeWorld === 'FISHING' ? 'Fishing · Riverbend' : activeWorld === 'HOME' ? 'Home World' : studioRoomName(currentRoom || 'LOBBY')}</small>
      </div>
      <div className="player-hud-stats"><span className="player-hud-coin">✦ <b>{coinBalance.toLocaleString()}</b> <small>COIN</small></span><span className="player-hud-xp">{levelXp.toLocaleString()} / {levelXpTarget.toLocaleString()} EXP</span></div>
      <div className="player-hud-progress" aria-label={`${levelXp} trên ${levelXpTarget} EXP ở cấp hiện tại`}><i style={{ width: `${xpProgress}%` }} /></div>
      <div className="player-hud-work"><span>{isDestination ? 'DESTINATION MAP' : workCareerLabel}</span><small>{isDestination ? 'FISHING / HOME WORLD' : `TIẾN ĐỘ LƯƠNG ${salaryLabel}`}</small><button type="button" onClick={openWorkPanel}>{workCta} ↗</button>{!isDestination && <button className="player-hud-fishing" type="button" onClick={openFishing}>🎣 ĐI CÂU CÁ ↗</button>}</div>
    </div>
    {lastLevelUp && <div className="player-hud-level-up" role="status" aria-live="polite"><span>✦ LEVEL UP</span><strong>LV {lastLevelUp.to}</strong></div>}
  </aside>
}
