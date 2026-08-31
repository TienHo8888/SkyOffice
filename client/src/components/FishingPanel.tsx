import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FISH_DEFINITIONS, FISHING_COOLDOWN_MS, FISHING_DAILY_LIMIT, FISHING_TIMING } from '../../../types/Fishing'
import type { FishingCastState, FishingCatchReceipt, FishingPhase } from '../../../types/Fishing'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppDispatch, useAppSelector } from '../hooks'
import { applyInventory, setSocialSnapshot } from '../stores/SocialStore'
import { studioApi } from '../services/StudioApi'
import { getActiveWorldNetwork } from '../utils/activeWorld'

const phaseLabels: Record<FishingPhase, string> = {
  IDLE: 'Sẵn sàng thả câu',
  CASTING: 'Đang quăng phao…',
  WAITING: 'Mặt nước đang yên…',
  NIBBLE: 'Phao vừa động nhẹ…',
  BITE: 'CÁ CẮN — GIẬT NGAY!',
  REELING: 'Đang kéo chiến lợi phẩm…',
  MISSED: 'Cá đã thoát mất!',
}

const phaseHints: Record<FishingPhase, string> = {
  IDLE: 'Bấm E hoặc nút Thả câu',
  CASTING: 'Giữ nguyên vị trí',
  WAITING: 'Chỉ giật khi tín hiệu vàng bật lên',
  NIBBLE: 'Cẩn thận — có thể chỉ là cú nhử',
  BITE: 'E / SPACE / click trước khi thanh thời gian hết',
  REELING: 'Đang xác nhận kết quả từ server',
  MISSED: 'Canh lại nhịp ở lượt tiếp theo',
}

function makeRequestId() {
  return `fishing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function missMessage(reason?: FishingCastState['reason']) {
  if (reason === 'TOO_EARLY') return 'Giật sớm quá — đó chỉ là cú nhử.'
  if (reason === 'TOO_LATE') return 'Chậm một nhịp — cá đã nhả mồi.'
  return 'Hết cửa sổ phản xạ — cá đã thoát.'
}

export default function FishingPanel() {
  const dispatch = useAppDispatch()
  const worldId = useAppSelector((state) => state.world.worldId)
  const nearFishingSpot = useAppSelector((state) => state.world.nearFishingSpot)
  const token = useAppSelector((state) => state.user.authToken)
  const inventory = useAppSelector((state) => state.social.snapshot?.inventory || [])
  const canonicalDailyCount = useAppSelector((state) => state.social.snapshot?.fishingDailyCount || 0)
  const [phase, setPhase] = useState<FishingPhase>('IDLE')
  const [requestId, setRequestId] = useState('')
  const [lastCatch, setLastCatch] = useState<FishingCatchReceipt | null>(null)
  const [dailyCount, setDailyCount] = useState(0)
  const [biteWindowMs, setBiteWindowMs] = useState(0)
  const [biteSequence, setBiteSequence] = useState(0)
  const [revealSequence, setRevealSequence] = useState(0)
  const [error, setError] = useState('')
  const timers = useRef<number[]>([])
  const phaseRef = useRef<FishingPhase>('IDLE')
  const requestIdRef = useRef('')

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay)
    timers.current.push(timer)
    return timer
  }, [])

  const transitionPhase = useCallback((nextPhase: FishingPhase, spotId = 'town_pier') => {
    phaseRef.current = nextPhase
    setPhase(nextPhase)
    phaserEvents.emit(Event.FISHING_PHASE_CHANGED, { phase: nextPhase, spotId })
  }, [])

  const setActiveRequest = useCallback((nextRequestId: string) => {
    requestIdRef.current = nextRequestId
    setRequestId(nextRequestId)
  }, [])

  const startCast = useCallback((spotId = 'town_pier') => {
    if (!nearFishingSpot || phaseRef.current !== 'IDLE') return
    if (dailyCount >= FISHING_DAILY_LIMIT) {
      setError(`Hôm nay bạn đã câu đủ ${FISHING_DAILY_LIMIT} con.`)
      return
    }
    clearTimers()
    const nextRequestId = makeRequestId()
    setActiveRequest(nextRequestId)
    setError('')
    setLastCatch(null)
    setBiteWindowMs(0)
    transitionPhase('CASTING', spotId)
    getActiveWorldNetwork()?.startFishingCast(spotId, nextRequestId)
    schedule(() => {
      if (phaseRef.current === 'CASTING') transitionPhase('WAITING', spotId)
    }, FISHING_TIMING.castDelaySeconds * 1000)
  }, [clearTimers, dailyCount, nearFishingSpot, schedule, setActiveRequest, transitionPhase])

  const reel = useCallback((spotId = 'town_pier') => {
    if (!requestIdRef.current || !['WAITING', 'NIBBLE', 'BITE'].includes(phaseRef.current)) return
    clearTimers()
    transitionPhase('REELING', spotId)
    getActiveWorldNetwork()?.claimFishingCatch(spotId, requestIdRef.current)
  }, [clearTimers, transitionPhase])

  const performAction = useCallback((spotId = 'town_pier') => {
    if (phaseRef.current === 'IDLE') startCast(spotId)
    else reel(spotId)
  }, [reel, startCast])

  useEffect(() => {
    if (worldId !== 'FISHING') return
    const handleSpotInteraction = (payload?: { spotId?: string }) => performAction(payload?.spotId || 'town_pier')
    const handleReelAction = () => reel('town_pier')
    const handleCastState = (payload: FishingCastState) => {
      if (!payload?.requestId || payload.requestId !== requestIdRef.current) return
      if (payload.state === 'CASTED') return
      if (payload.state === 'NIBBLE') {
        transitionPhase('NIBBLE', payload.spotId)
        schedule(() => {
          if (phaseRef.current === 'NIBBLE') transitionPhase('WAITING', payload.spotId)
        }, 280)
        return
      }
      if (payload.state === 'BITE') {
        clearTimers()
        setBiteWindowMs(Math.max(1, Number(payload.windowMs) || 1))
        setBiteSequence(payload.sequence)
        transitionPhase('BITE', payload.spotId)
        return
      }
      clearTimers()
      setError(missMessage(payload.reason))
      transitionPhase('MISSED', payload.spotId)
      schedule(() => {
        setActiveRequest('')
        setError('')
        transitionPhase('IDLE', payload.spotId)
      }, 900)
    }
    const handleCatchResult = (receipt: FishingCatchReceipt) => {
      if (receipt.requestId !== requestIdRef.current) return
      clearTimers()
      setLastCatch(receipt)
      setRevealSequence((value) => value + 1)
      setDailyCount(receipt.catchNumber)
      setError('')
      dispatch(applyInventory(receipt.inventory))
      schedule(() => {
        setActiveRequest('')
        transitionPhase('IDLE')
      }, 650)
      schedule(() => setLastCatch(null), 3_400)
      if (token) void studioApi.social(token).then((snapshot) => dispatch(setSocialSnapshot(snapshot))).catch(() => undefined)
    }
    const handleCatchError = (payload: { code?: string; message?: string; requestId?: string }) => {
      if (payload.requestId && payload.requestId !== requestIdRef.current) return
      clearTimers()
      const timingMiss = payload.code === 'FISHING_EARLY_REEL' || payload.code === 'FISHING_REEL_MISSED' || payload.code === 'FISHING_NO_ACTIVE_CAST'
      setError(payload.message || 'Không thể câu cá lúc này.')
      transitionPhase(timingMiss ? 'MISSED' : 'IDLE')
      schedule(() => {
        setActiveRequest('')
        setError('')
        transitionPhase('IDLE')
      }, timingMiss ? 900 : FISHING_COOLDOWN_MS)
    }
    phaserEvents.on(Event.FISHING_SPOT_INTERACTION, handleSpotInteraction)
    phaserEvents.on(Event.FISHING_REEL_ACTION, handleReelAction)
    phaserEvents.on(Event.FISHING_CAST_STATE, handleCastState)
    phaserEvents.on(Event.FISHING_CATCH_RESULT, handleCatchResult)
    phaserEvents.on(Event.FISHING_CATCH_ERROR, handleCatchError)
    return () => {
      phaserEvents.off(Event.FISHING_SPOT_INTERACTION, handleSpotInteraction)
      phaserEvents.off(Event.FISHING_REEL_ACTION, handleReelAction)
      phaserEvents.off(Event.FISHING_CAST_STATE, handleCastState)
      phaserEvents.off(Event.FISHING_CATCH_RESULT, handleCatchResult)
      phaserEvents.off(Event.FISHING_CATCH_ERROR, handleCatchError)
    }
  }, [clearTimers, dispatch, performAction, reel, schedule, setActiveRequest, token, transitionPhase, worldId])

  useEffect(() => () => {
    clearTimers()
    phaserEvents.emit(Event.FISHING_PHASE_CHANGED, { phase: 'IDLE', spotId: 'town_pier' })
  }, [clearTimers])

  useEffect(() => {
    if (worldId === 'FISHING') return
    clearTimers()
    phaseRef.current = 'IDLE'
    requestIdRef.current = ''
    setPhase('IDLE')
    setRequestId('')
    setLastCatch(null)
    setError('')
  }, [clearTimers, worldId])

  useEffect(() => {
    if (worldId === 'FISHING') setDailyCount(canonicalDailyCount)
  }, [canonicalDailyCount, worldId])

  if (worldId !== 'FISHING') return null

  const fishQuantity = inventory.reduce((total, stack) => total + (stack.itemId.startsWith('pond_') || stack.itemId.startsWith('leaf_') || stack.itemId.startsWith('moon_') ? stack.quantity : 0), 0)
  const fish = lastCatch ? FISH_DEFINITIONS.find((definition) => definition.id === lastCatch.fishId) : undefined
  const canAct = nearFishingSpot && dailyCount < FISHING_DAILY_LIMIT && (phase === 'IDLE' || phase === 'WAITING' || phase === 'NIBBLE' || phase === 'BITE')
  const actionLabel = phase === 'IDLE'
    ? nearFishingSpot ? '🎣 THẢ CÂU · E' : 'TỚI TOWN PIER'
    : phase === 'BITE'
      ? '⚡ GIẬT CẦN NGAY!'
      : phase === 'WAITING' || phase === 'NIBBLE'
        ? 'GIẬT CẦN · E / SPACE'
        : phaseLabels[phase]

  return (
    <>
      <section className={`fishing-quickbar is-${phase.toLowerCase()} ${nearFishingSpot ? 'is-near' : ''}`} aria-label="Fishing action">
        <div className="fishing-quickbar-signal">
          <span className="fishing-quickbar-bobber" aria-hidden="true" />
          <div>
            <small>RIVERBEND · {dailyCount}/{FISHING_DAILY_LIMIT} · BAG {fishQuantity}</small>
            <strong>{nearFishingSpot || phase !== 'IDLE' ? phaseLabels[phase] : 'Tìm vòng sáng Town Pier'}</strong>
            <em>{nearFishingSpot || phase !== 'IDLE' ? phaseHints[phase] : 'Đi tới mép nước để bắt đầu'}</em>
          </div>
        </div>
        <button className={`fishing-action-button is-${phase.toLowerCase()}`} disabled={!canAct} aria-busy={phase === 'CASTING' || phase === 'REELING'} onClick={() => performAction('town_pier')}>
          {actionLabel}
        </button>
        {phase === 'BITE' && <div className="fishing-reaction-window" key={`${requestId}-${biteSequence}`} style={{ '--fishing-window': `${biteWindowMs}ms` } as React.CSSProperties}><i /></div>}
        {error && <div className="fishing-quickbar-error" role="alert">{error}</div>}
      </section>

      {lastCatch && <div className={`fishing-loot-reveal is-${lastCatch.rarity}`} key={`${lastCatch.requestId}-${revealSequence}`} role="status">
        <span className="fishing-loot-rays" aria-hidden="true" />
        {fish && <img src={fish.iconPath} alt="" />}
        <div>
          <small>{lastCatch.rarity === 'rare' ? '✦✦ RARE CATCH ✦✦' : lastCatch.rarity === 'uncommon' ? '✦ UNCOMMON CATCH ✦' : 'COMMON CATCH'}</small>
          <strong>{lastCatch.fishId.replaceAll('_', ' ')}</strong>
          <em>Catch #{lastCatch.catchNumber} · +{lastCatch.quantityDelta} · stack x{lastCatch.quantityAfter}</em>
        </div>
      </div>}
    </>
  )
}
