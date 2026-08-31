import React, { useEffect, useRef, useState } from 'react'

import { CasinoEventPayload } from '../../../types/Casino'
import { CombatEventPayload } from '../../../types/Combat'
import { MiniGameEventPayload } from '../../../types/MiniGame'
import { TienLenPrivateState } from '../../../types/TienLen'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'

type Cue =
  | 'click'
  | 'select'
  | 'open'
  | 'close'
  | 'confirm'
  | 'error'
  | 'interact'
  | 'room'
  | 'deal'
  | 'reveal'
  | 'chip'
  | 'dice'
  | 'diceReveal'
  | 'spin'
  | 'coin'
  | 'success'
  | 'fail'
  | 'countdown'
  | 'notify'

const AUDIO_ROOT = '/assets/audio'

const interfaceFile = (name: string) => `kenney/interface/${name}.ogg`
const casinoFile = (name: string) => `kenney/casino/${name}.ogg`

/*
 * These are local, versioned files rather than CDN URLs. Keeping the asset map
 * explicit makes a missing file easy to catch during a build and lets the
 * sound design stay consistent across every game surface.
 */
const cueFiles: Record<Cue, string[]> = {
  // Keep every cue semantically narrow. Variants are allowed inside one
  // family, but a card, dice and chip sound must never be mixed together.
  click: [interfaceFile('click_001'), interfaceFile('click_002'), interfaceFile('click_003')],
  select: [interfaceFile('select_001'), interfaceFile('select_002')],
  open: [interfaceFile('open_001'), interfaceFile('open_002')],
  close: [interfaceFile('close_001'), interfaceFile('close_002')],
  confirm: [interfaceFile('confirmation_001'), interfaceFile('confirmation_002')],
  error: [interfaceFile('error_001'), interfaceFile('error_002')],
  interact: [interfaceFile('pluck_001'), interfaceFile('pluck_002')],
  room: [interfaceFile('switch_001'), interfaceFile('switch_002')],
  deal: [casinoFile('card-place-1'), casinoFile('card-place-2'), casinoFile('card-slide-1'), casinoFile('card-slide-2')],
  reveal: [casinoFile('card-fan-1'), casinoFile('card-fan-2')],
  chip: [casinoFile('chip-lay-1'), casinoFile('chip-lay-2'), casinoFile('chip-lay-3')],
  dice: [casinoFile('dice-shake-1'), casinoFile('dice-shake-2'), casinoFile('dice-shake-3')],
  diceReveal: [casinoFile('dice-throw-1'), casinoFile('dice-throw-2'), casinoFile('dice-throw-3')],
  // There is no reel-specific file in the licensed local pack. A card shuffle
  // is the closest short, continuous mechanical texture; UI switch sounds
  // made the reels feel detached from the animation.
  spin: [casinoFile('card-shuffle')],
  coin: [casinoFile('chips-stack-1'), casinoFile('chips-stack-2'), casinoFile('chips-stack-3')],
  success: [interfaceFile('confirmation_001'), interfaceFile('confirmation_002')],
  fail: [interfaceFile('error_001'), interfaceFile('error_002')],
  countdown: [interfaceFile('tick_001'), interfaceFile('tick_002')],
  notify: [interfaceFile('bong_001')],
}

type CuePolicy = {
  volume: number
  cooldownMs: number
  maxVoices: number
  maxDurationMs: number
}

/*
 * A small mixer is more important than simply adding more sounds. Betting
 * tables can emit several events in a few milliseconds, so each cue has a
 * cooldown, a voice cap, and a hard maximum duration.
 */
const cuePolicies: Record<Cue, CuePolicy> = {
  click: { volume: 0.18, cooldownMs: 70, maxVoices: 1, maxDurationMs: 420 },
  select: { volume: 0.2, cooldownMs: 90, maxVoices: 1, maxDurationMs: 620 },
  open: { volume: 0.22, cooldownMs: 150, maxVoices: 2, maxDurationMs: 900 },
  close: { volume: 0.2, cooldownMs: 150, maxVoices: 2, maxDurationMs: 900 },
  confirm: { volume: 0.25, cooldownMs: 220, maxVoices: 2, maxDurationMs: 1000 },
  error: { volume: 0.22, cooldownMs: 220, maxVoices: 1, maxDurationMs: 900 },
  interact: { volume: 0.22, cooldownMs: 170, maxVoices: 1, maxDurationMs: 850 },
  room: { volume: 0.2, cooldownMs: 380, maxVoices: 1, maxDurationMs: 900 },
  deal: { volume: 0.22, cooldownMs: 90, maxVoices: 3, maxDurationMs: 650 },
  reveal: { volume: 0.24, cooldownMs: 240, maxVoices: 2, maxDurationMs: 850 },
  chip: { volume: 0.2, cooldownMs: 120, maxVoices: 2, maxDurationMs: 520 },
  dice: { volume: 0.24, cooldownMs: 180, maxVoices: 2, maxDurationMs: 900 },
  diceReveal: { volume: 0.24, cooldownMs: 240, maxVoices: 2, maxDurationMs: 720 },
  spin: { volume: 0.2, cooldownMs: 180, maxVoices: 1, maxDurationMs: 780 },
  coin: { volume: 0.22, cooldownMs: 260, maxVoices: 2, maxDurationMs: 760 },
  success: { volume: 0.26, cooldownMs: 450, maxVoices: 2, maxDurationMs: 1100 },
  fail: { volume: 0.22, cooldownMs: 450, maxVoices: 1, maxDurationMs: 900 },
  countdown: { volume: 0.16, cooldownMs: 130, maxVoices: 1, maxDurationMs: 480 },
  notify: { volume: 0.18, cooldownMs: 280, maxVoices: 1, maxDurationMs: 760 },
}

type AudioVoice = {
  element: HTMLAudioElement
  timer?: number
}

type AudioEventCue = {
  cue: Cue
  key: string
}

const MUSIC_TRACKS = [
  `${AUDIO_ROOT}/music/studio-loop.ogg`,
  `${AUDIO_ROOT}/bgm/calm-track-loop.ogg`,
  `${AUDIO_ROOT}/bgm/chill-lofi-loop.ogg`,
  `${AUDIO_ROOT}/bgm/urban-shop.ogg`,
]

// These games already emit a result/action event with its own sound. Their
// wallet message is still used to update Coin, but must not add a second,
// unrelated payout sound on top of the visible result animation.
const RESULT_SOUND_GAME_IDS = new Set([
  'BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'TIEN_LEN', 'DICE_DUEL', 'LUCKY_DRAW', 'RPS',
])

function musicTrackForRoom(room: string) {
  switch (room.toUpperCase()) {
    case 'CARD_ROOM':
      return 1
    case 'GAME_LOUNGE':
    case 'ARCADE':
      return 3
    case 'MY_ROOM':
    case 'PERSONAL_ROOM':
    case 'HOME':
      return 2
    case 'FISHING':
      return 1
    default:
      return 0
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

class StudioAudio {
  private readonly voices = new Map<Cue, AudioVoice[]>()
  private readonly lastCueAt = new Map<Cue, number>()
  private readonly lastEventAt = new Map<string, number>()
  private readonly cueCursor = new Map<Cue, number>()
  private readonly preloaded = new Set<string>()
  private readonly preloadElements = new Map<string, HTMLAudioElement>()
  private music?: HTMLAudioElement
  private musicTrackIndex = -1
  private currentRoom = 'LOBBY'
  private unlocked = false
  private enabled = true
  private musicEnabled = true
  private readonly masterVolume = 0.82
  private readonly sfxVolume = 0.78
  private readonly musicVolume = 0.2

  unlock() {
    if (!this.unlocked) {
      this.unlocked = true
      this.preloadSfx()
      this.createMusic()
    }
    if (this.musicEnabled) this.playMusic()
  }

  setEnabled(value: boolean) {
    this.enabled = value
    if (!value) {
      this.stopSfx()
      return
    }
    if (this.unlocked) this.preloadSfx()
  }

  setMusicEnabled(value: boolean) {
    this.musicEnabled = value
    if (!value) {
      this.music?.pause()
      return
    }
    if (!this.unlocked) return
    if (!this.music) this.createMusic()
    this.playMusic()
  }

  setRoom(room: string) {
    const nextRoom = room || 'LOBBY'
    this.currentRoom = nextRoom
    if (!this.unlocked || !this.music || !this.musicEnabled) return
    const nextTrackIndex = musicTrackForRoom(nextRoom)
    if (nextTrackIndex !== this.musicTrackIndex) this.playMusicTrack(nextTrackIndex)
  }

  cue(cue: Cue, eventKey?: string) {
    this.unlock()
    if (!this.enabled) return

    const policy = cuePolicies[cue]
    const now = performance.now()
    if (eventKey) {
      const previousEventAt = this.lastEventAt.get(eventKey)
      // The same network event can be observed by more than one UI listener
      // during a React update. Suppress that duplicate, while still allowing
      // two real actions of the same type after a short, intentional gap.
      if (previousEventAt !== undefined && now - previousEventAt < 900) return
      this.lastEventAt.set(eventKey, now)
      if (this.lastEventAt.size > 320) {
        for (const [key, timestamp] of this.lastEventAt) {
          if (now - timestamp > 15_000) this.lastEventAt.delete(key)
        }
      }
    }
    const lastCueAt = this.lastCueAt.get(cue)
    if (lastCueAt !== undefined && now - lastCueAt < policy.cooldownMs) return
    this.lastCueAt.set(cue, now)

    const files = cueFiles[cue]
    const cursor = this.cueCursor.get(cue) || 0
    const file = files[cursor % files.length]
    this.cueCursor.set(cue, cursor + 1)
    const voices = this.voices.get(cue) || []
    let voice = voices.find((candidate) => candidate.element.paused || candidate.element.ended)
    if (!voice && voices.length < policy.maxVoices) {
      voice = { element: this.preloadElements.get(file) || this.createAudio(file) }
      voices.push(voice)
      this.voices.set(cue, voices)
    }
    if (!voice) return

    if (voice.timer) window.clearTimeout(voice.timer)
    const element = voice.element
    element.pause()
    element.currentTime = 0
    element.volume = clamp(policy.volume * this.masterVolume * this.sfxVolume, 0, 1)
    // Do not pitch-shift action sounds randomly. The previous variation made
    // repeated bets and rewards sound like unrelated effects.
    element.playbackRate = 1
    const finish = () => {
      if (voice?.timer) window.clearTimeout(voice.timer)
      if (voice) voice.timer = undefined
    }
    element.onended = finish
    element.onerror = finish
    voice.timer = window.setTimeout(() => {
      element.pause()
      finish()
    }, policy.maxDurationMs)
    element.play().catch(finish)
  }

  private createAudio(file: string) {
    const audio = new Audio(`${AUDIO_ROOT}/${file}`)
    audio.preload = 'auto'
    return audio
  }

  private preloadSfx() {
    // Warm only the cues that can happen immediately. The rest load lazily so
    // opening the app does not request the entire sound library at once.
    const priorityCues: Cue[] = ['click', 'chip', 'deal', 'reveal', 'dice', 'diceReveal', 'coin', 'confirm', 'error']
    priorityCues.forEach((cue) => cueFiles[cue].forEach((file) => {
      if (this.preloaded.has(file)) return
      this.preloaded.add(file)
      const audio = this.createAudio(file)
      this.preloadElements.set(file, audio)
      audio.load()
    }))
  }

  private createMusic() {
    this.playMusicTrack(musicTrackForRoom(this.currentRoom))
  }

  private playMusicTrack(trackIndex: number) {
    const safeIndex = ((trackIndex % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length
    if (this.music) {
      this.music.onended = null
      this.music.onerror = null
      this.music.pause()
    }
    const music = new Audio(MUSIC_TRACKS[safeIndex])
    music.preload = 'auto'
    music.loop = false
    music.volume = clamp(this.masterVolume * this.musicVolume, 0, 1)
    music.onended = () => {
      if (this.music !== music || !this.musicEnabled) return
      this.playMusicTrack((safeIndex + 1) % MUSIC_TRACKS.length)
    }
    music.onerror = () => {
      if (this.music !== music || !this.musicEnabled) return
      this.playMusicTrack((safeIndex + 1) % MUSIC_TRACKS.length)
    }
    this.music = music
    this.musicTrackIndex = safeIndex
    music.load()
    if (this.unlocked && this.musicEnabled) this.playMusic()
  }

  private playMusic() {
    if (!this.music || !this.musicEnabled) return
    this.music.play().catch(() => undefined)
  }

  private stopSfx() {
    this.voices.forEach((voices) => voices.forEach((voice) => {
      if (voice.timer) window.clearTimeout(voice.timer)
      voice.timer = undefined
      voice.element.pause()
      voice.element.currentTime = 0
    }))
  }
}

export const studioAudio = new StudioAudio()

type RpsStatePayload = {
  status?: string
  winnerSessionId?: string
}

type WorkResultPayload = {
  mode?: string
  passed?: boolean
  score?: number
  coinDelta?: number
}

function payloadKey(scope: string, payload: { mode?: string; type?: string; roundId?: string; sessionId?: string; targetSessionId?: string; item?: string; amount?: number; message?: string }) {
  return [scope, payload.mode || '', payload.type || '', payload.roundId || '', payload.sessionId || '', payload.targetSessionId || '', payload.item || '', payload.amount ?? '', payload.message || ''].join('|')
}

function isLocalActor(payload: { sessionId?: string }, sessionId?: string) {
  return Boolean(sessionId && payload.sessionId && payload.sessionId === sessionId)
}

function isLocalTarget(payload: { targetSessionId?: string }, sessionId?: string) {
  return Boolean(sessionId && payload.targetSessionId && payload.targetSessionId === sessionId)
}

function miniGameCue(payload: MiniGameEventPayload, sessionId?: string): AudioEventCue | undefined {
  const type = (payload.type || '').toUpperCase()
  const key = payloadKey('mini', payload)
  const actor = isLocalActor(payload, sessionId)
  const target = isLocalTarget(payload, sessionId)
  if (type === 'ROUND_FINISHED') {
    // The card mini-games already announce their result through a private
    // result event. Other mini-games, such as the lightweight Chess mode,
    // need one shared end-of-round cue when their result panel is visible.
    if (['BACCARAT', 'BLACKJACK', 'SICBO', 'BAU_CUA', 'DICE_DUEL', 'LUCKY_DRAW'].includes(payload.mode || '')) return undefined
    return { cue: 'notify', key }
  }
  if (['BACCARAT_RESULT', 'BLACKJACK_RESULT', 'SICBO_RESULT', 'BAU_CUA_RESULT', 'DICE_RESULT', 'LUCKY_DRAW'].includes(type)) {
    if (!actor) return undefined
    const message = (payload.message || '').toUpperCase()
    if (message.includes('THẮNG') || message.includes('ĐOÁN ĐÚNG') || message.includes('TRÚNG') || message.includes('NHẬN') || message.includes('TRẢ')) return { cue: 'success', key }
    if (message.includes('THUA') || message.includes('TRƯỢT') || message.includes('MẤT')) return { cue: 'fail', key }
    return { cue: 'notify', key }
  }
  if (type === 'FLAG_DROPPED' || type === 'SABOTAGED') {
    if (actor) return { cue: 'success', key }
    if (target) return { cue: 'fail', key }
    return undefined
  }
  if (type === 'FROZEN') {
    if (actor) return { cue: 'success', key }
    if (target) return { cue: 'fail', key }
    return undefined
  }
  if (['TASK_DONE', 'TREASURE_FOUND', 'FLAG_RETURNED', 'UNFROZEN', 'FOUND', 'COLOR_FOUND'].includes(type)) {
    if (!actor && !target) return undefined
    return { cue: 'success', key }
  }
  if (['THROW_HIT', 'BOMB_PASSED', 'FLAG_PICKED', 'VOTE_CAST', 'CHEER'].includes(type)) {
    if (!actor && !target) return undefined
    return { cue: 'interact', key }
  }
  if (['THROW_MISS', 'DODGED_OUT', 'VOTE_MISSED'].includes(type)) {
    if (!actor && !target) return undefined
    return { cue: 'fail', key }
  }
  return undefined
}

function casinoCue(payload: CasinoEventPayload, sessionId?: string): AudioEventCue | undefined {
  const type = (payload.type || '').toUpperCase()
  const key = payloadKey('casino', payload)
  const actor = isLocalActor(payload, sessionId)
  switch (type) {
    // Opening a table already has a local UI interaction cue. ROUND_OPEN is a
    // state label, not an animation, so it stays silent.
    case 'CHESS_MATCH_STARTED':
    case 'TEXAS_TABLE_STARTED':
      return actor ? { cue: 'open', key } : undefined
    case 'BET_ACCEPTED':
      // A chip flight is rendered for the accepted wager. Only the player who
      // placed the chip gets this local confirmation; spectators do not hear a
      // sound for every remote click in a busy room.
      return actor ? { cue: 'chip', key } : undefined
    case 'BETTING_CLOSED':
      return { cue: 'close', key }
    case 'CARDS_DEALT':
      return { cue: 'deal', key }
    case 'DEALER_REVEAL':
      return { cue: 'reveal', key }
    case 'DICE_SHAKING':
      return { cue: 'dice', key }
    case 'ROUND_RESULT':
      if (['SICBO', 'BAU_CUA', 'DICE_DUEL'].includes(payload.mode)) return { cue: 'diceReveal', key }
      if (payload.mode === 'LUCKY_DRAW') return { cue: 'confirm', key }
      return undefined
    case 'REELS_SPINNING':
      return { cue: 'spin', key }
    case 'BLACKJACK_HIT':
      return actor ? { cue: 'deal', key } : undefined
    case 'BLACKJACK_STAND':
      return actor ? { cue: 'confirm', key } : undefined
    case 'BLACKJACK_DOUBLE':
      return actor ? { cue: 'deal', key } : undefined
    case 'TEXAS_HAND_STARTED':
      return actor ? { cue: 'deal', key } : undefined
    case 'TEXAS_ACTION': {
      if (!actor) return undefined
      const action = (payload.message || '').toUpperCase()
      if (action.includes('FOLD')) return { cue: 'close', key }
      if (action.includes('CALL') || action.includes('RAISE') || action.includes('ALL-IN') || action.includes('BLIND')) return { cue: 'chip', key }
      if (action.includes('CHECK')) return { cue: 'confirm', key }
      return undefined
    }
    case 'CHESS_MOVE':
      return actor ? { cue: 'select', key } : undefined
    case 'PLAYER_WIN':
      return actor ? { cue: 'success', key } : undefined
    case 'PLAYER_LOSS':
      return actor ? { cue: 'fail', key } : undefined
    case 'PLAYER_PUSH':
      return actor ? { cue: 'notify', key } : undefined
    case 'TEXAS_AUTO_FOLD':
      return actor ? { cue: 'fail', key } : undefined
    case 'TIEN_LEN_PAYOUT':
    case 'TEXAS_CASH_OUT':
      return actor ? { cue: 'coin', key } : undefined
    default:
      return undefined
  }
}

const GAME_SURFACE_SELECTOR = [
  '.casino-shell',
  '.mini-game-panel',
  '.tag-game-panel',
  '.work-game-panel',
  '.combat-hotbar',
  '.rps-panel',
  '.pvp-table-lobby',
  '.tien-len-panel',
  '.texas-panel',
  '.game-channel-chat',
].join(',')

export default function AudioDirector() {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const currentRoom = useAppSelector((state) => state.user.currentRoom)
  const [soundOn, setSoundOn] = useState(() => window.localStorage.getItem('skyoffice:sound') !== 'off')
  const [musicOn, setMusicOn] = useState(() => window.localStorage.getItem('skyoffice:music') !== 'off')
  const previousRpsStatus = useRef('')

  useEffect(() => {
    studioAudio.setRoom(currentRoom || 'LOBBY')
  }, [currentRoom])

  useEffect(() => {
    studioAudio.setEnabled(soundOn)
    studioAudio.setMusicEnabled(musicOn)

    const unlock = () => studioAudio.unlock()
    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const interactive = target?.closest('button, [role="button"], select') as HTMLElement | null
      if (!interactive || interactive.closest(GAME_SURFACE_SELECTOR) || interactive.closest('.audio-dock') || interactive.matches('[data-no-sfx]')) return
      if ((interactive as HTMLButtonElement).disabled || interactive.getAttribute('aria-disabled') === 'true') return
      studioAudio.cue('click')
    }
    const roomChanged = (room: { id?: string } | string) => {
      const roomId = typeof room === 'string' ? room : room?.id || 'LOBBY'
      studioAudio.setRoom(roomId)
      studioAudio.cue('room', `room:${roomId}`)
    }
    const tableOpened = () => studioAudio.cue('open', 'table-open')
    const workOpened = () => studioAudio.cue('open', 'work-open')
    const tagGameTagged = (payload: { displayName?: string; score?: number }) => {
      if (!document.querySelector('.tag-game-panel')) return
      studioAudio.cue('interact', `tag:${payload.displayName || ''}:${payload.score ?? ''}`)
    }
    let lastTienLenPlayKey = ''
    const tienLenState = (payload: TienLenPrivateState) => {
      const play = payload?.lastPlay
      if (!play || payload.status !== 'PLAYING') return
      const key = `${payload.gameId}:${payload.handNumber}:${play.playerId}:${play.cards.join(',')}`
      if (lastTienLenPlayKey === key || !document.querySelector('.casino-tien_len')) return
      lastTienLenPlayKey = key
      studioAudio.cue('deal', `tienlen:${key}`)
    }
    const miniGameEvent = (payload: MiniGameEventPayload) => {
      if (!document.querySelector('.mini-game-panel')) return
      const eventCue = miniGameCue(payload, sessionId)
      if (eventCue) studioAudio.cue(eventCue.cue, eventCue.key)
    }
    const casinoEvent = (payload: CasinoEventPayload) => {
      if (!document.querySelector('.casino-shell')) return
      const eventCue = casinoCue(payload, sessionId)
      if (eventCue) studioAudio.cue(eventCue.cue, eventCue.key)
    }
    const combatEvent = (payload: CombatEventPayload) => {
      const localActor = payload.attackerSessionId === sessionId
      const localTarget = payload.targetSessionId === sessionId
      if (!localActor && !localTarget) return
      studioAudio.cue(payload.hit ? 'confirm' : 'fail', `combat:${payload.eventId}`)
    }
    const rpsState = (payload: RpsStatePayload) => {
      const status = (payload.status || '').toUpperCase()
      if (status === previousRpsStatus.current) return
      previousRpsStatus.current = status
      const key = `rps:${status}:${payload.winnerSessionId || 'tie'}`
      if (status === 'RESOLVED') studioAudio.cue(payload.winnerSessionId && payload.winnerSessionId === sessionId ? 'success' : 'fail', key)
      else if (status === 'READY') studioAudio.cue('confirm', key)
      else if (status === 'DECLINED' || status === 'CANCELLED') studioAudio.cue('notify', key)
    }
    const workResult = (payload: WorkResultPayload) => {
      const key = `work:${payload.mode || 'JOB'}:${payload.score ?? ''}:${payload.coinDelta ?? ''}`
      if (payload.mode === 'CERTIFICATION') studioAudio.cue(payload.passed ? 'success' : 'fail', key)
      else if (payload.score !== undefined && payload.score < 60) studioAudio.cue('fail', key)
      else if ((payload.coinDelta || 0) > 0) studioAudio.cue('coin', key)
      else studioAudio.cue('success', key)
    }
    const socialReward = (payload: { gameId?: string; coinDelta?: number; reason?: string; duplicate?: boolean }) => {
      if (payload.duplicate || RESULT_SOUND_GAME_IDS.has(payload.gameId || '') || (payload.reason || '').toLowerCase().includes('wager accepted')) return
      if ((payload.coinDelta || 0) > 0) studioAudio.cue('coin', `social:${payload.reason || ''}:${payload.coinDelta || 0}`)
    }
    const error = () => studioAudio.cue('error')

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    document.addEventListener('click', click)
    phaserEvents.on(Event.MY_PLAYER_ROOM_CHANGED, roomChanged)
    phaserEvents.on(Event.GAME_TABLE_OPEN, tableOpened)
    phaserEvents.on(Event.WORK_INTERACTION, workOpened)
    phaserEvents.on(Event.TAG_GAME_TAGGED, tagGameTagged)
    phaserEvents.on(Event.TIEN_LEN_PRIVATE_STATE, tienLenState)
    phaserEvents.on(Event.MINI_GAME_EVENT, miniGameEvent)
    phaserEvents.on(Event.CASINO_EVENT, casinoEvent)
    phaserEvents.on(Event.COMBAT_EVENT, combatEvent)
    phaserEvents.on(Event.RPS_STATE, rpsState)
    phaserEvents.on(Event.WORK_RESULT, workResult)
    phaserEvents.on(Event.SOCIAL_REWARD, socialReward)
    phaserEvents.on(Event.TAG_GAME_ERROR, error)
    phaserEvents.on(Event.MINI_GAME_ERROR, error)
    phaserEvents.on(Event.CASINO_ERROR, error)
    phaserEvents.on(Event.COMBAT_ERROR, error)
    phaserEvents.on(Event.RPS_ERROR, error)
    phaserEvents.on(Event.TIEN_LEN_ERROR, error)
    phaserEvents.on(Event.TEXAS_ERROR, error)
    phaserEvents.on(Event.WORK_ERROR, error)
    phaserEvents.on(Event.SOCIAL_REWARD_ERROR, error)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('click', click)
      phaserEvents.off(Event.MY_PLAYER_ROOM_CHANGED, roomChanged)
      phaserEvents.off(Event.GAME_TABLE_OPEN, tableOpened)
      phaserEvents.off(Event.WORK_INTERACTION, workOpened)
      phaserEvents.off(Event.TAG_GAME_TAGGED, tagGameTagged)
      phaserEvents.off(Event.TIEN_LEN_PRIVATE_STATE, tienLenState)
      phaserEvents.off(Event.MINI_GAME_EVENT, miniGameEvent)
      phaserEvents.off(Event.CASINO_EVENT, casinoEvent)
      phaserEvents.off(Event.COMBAT_EVENT, combatEvent)
      phaserEvents.off(Event.RPS_STATE, rpsState)
      phaserEvents.off(Event.WORK_RESULT, workResult)
      phaserEvents.off(Event.SOCIAL_REWARD, socialReward)
      phaserEvents.off(Event.TAG_GAME_ERROR, error)
      phaserEvents.off(Event.MINI_GAME_ERROR, error)
      phaserEvents.off(Event.CASINO_ERROR, error)
      phaserEvents.off(Event.COMBAT_ERROR, error)
      phaserEvents.off(Event.RPS_ERROR, error)
      phaserEvents.off(Event.TIEN_LEN_ERROR, error)
      phaserEvents.off(Event.TEXAS_ERROR, error)
      phaserEvents.off(Event.WORK_ERROR, error)
      phaserEvents.off(Event.SOCIAL_REWARD_ERROR, error)
    }
  }, [musicOn, sessionId, soundOn])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    studioAudio.setEnabled(next)
    window.localStorage.setItem('skyoffice:sound', next ? 'on' : 'off')
  }

  const toggleMusic = () => {
    const next = !musicOn
    setMusicOn(next)
    studioAudio.setMusicEnabled(next)
    window.localStorage.setItem('skyoffice:music', next ? 'on' : 'off')
  }

  return <div className="audio-dock" aria-label="Điều khiển âm thanh">
    <button className={soundOn ? 'active' : ''} onClick={toggleSound} title="Bật/tắt hiệu ứng âm thanh" data-no-sfx>
      {soundOn ? '🔊' : '🔇'}<span>SFX</span>
    </button>
    <button className={musicOn ? 'active' : ''} onClick={toggleMusic} title="Bật/tắt nhạc nền" data-no-sfx>
      {musicOn ? '♫' : '♪'}<span>BGM</span>
    </button>
  </div>
}
