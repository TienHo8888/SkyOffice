import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PersonIcon from '@mui/icons-material/Person'

import { CASINO_CHIPS, CasinoEventPayload, CasinoGameMode, CasinoTableSnapshot, PVP_TABLE_CATALOG, PvpTableMode, PvpTableSnapshot } from '../../../types/Casino'
import { TexasHoldemPublicState } from '../../../types/TexasHoldem'
import { TienLenPlay, TienLenPrivateState } from '../../../types/TienLen'
import phaserGame from '../PhaserGame'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import Game from '../scenes/Game'
import GameChannelChat from './GameChannelChat'

const EMPTY_TABLE: CasinoTableSnapshot = {
  mode: 'BACCARAT', phase: 'BETTING', roundId: '', roundNumber: 0, phaseStartedAt: 0, phaseEndsAt: 0,
  dealerName: 'DEALER AI', statusText: 'Đang kết nối bàn…', outcome: '', playerCards: [], bankerCards: [], dealerCards: [],
  communityCards: [], dice: [], playerTotal: 0, bankerTotal: 0, dealerTotal: 0, resultDetail: '', history: [],
  totalWagered: 0, activePlayers: 0, shoeRemaining: 0, seats: [],
  pvpLobby: undefined,
  tienLenPublic: undefined,
}

const GAME_META: Record<CasinoGameMode, { title: string; kicker: string; color: string; rule: string }> = {
  BACCARAT: { title: 'Baccarat', kicker: 'LIVE SHOE / COMMISSION', color: '#d6b36a', rule: 'Player 1:1 · Banker 0.95:1 · Tie 8:1' },
  BLACKJACK: { title: 'Blackjack', kicker: 'CLASSIC S17 / 3:2', color: '#71d0a4', rule: 'Blackjack 3:2 · Dealer stands soft 17' },
  POKER: { title: "Texas Hold'em", kicker: 'NO-LIMIT CASH TABLE', color: '#9c8cff', rule: 'Buy-in 100 · Blinds 5/10 · 3 bot hoặc 2–4 người thật' },
  SICBO: { title: 'Sic Bo', kicker: '3 DICE / GRA PAYTABLE', color: '#ed6f69', rule: 'Big/Small/Odd/Even lose on any triple' },
  BAU_CUA: { title: 'Bầu Cua Tôm Cá', kicker: 'VIETNAMESE CLASSIC', color: '#f1bd56', rule: '1 mặt 1:1 · 2 mặt 2:1 · 3 mặt 3:1' },
  CHESS: { title: 'Chess Arena', kicker: 'YOU VS DEALER AI', color: '#e8c980', rule: 'Phí 10 · Thắng nhận 18 · Hòa hoàn 10' },
  TIEN_LEN: { title: 'Tiến Lên Miền Nam', kicker: 'SOUTHERN RULES / 4 SEATS', color: '#ff9d6c', rule: '3♠ mở ván · đôi thông · tứ quý chặt heo' },
  DICE_DUEL: { title: 'Dice Duel', kicker: 'PLAYER VS HOUSE', color: '#57c9dd', rule: 'Player thắng trả 1.8× · Hòa hoàn cược' },
  LUCKY_DRAW: { title: 'Lucky Draw', kicker: 'PIXEL PRIZE REELS', color: '#ff7fc9', rule: 'Ba reel · jackpot x5 · tự trả thưởng' },
}

const GAME_GUIDES: Record<CasinoGameMode, { goal: string; steps: string[]; tip: string }> = {
  BACCARAT: { goal: 'Đoán cửa có tổng điểm gần 9 hơn.', steps: ['Chọn chip ở thanh dưới.', 'Đặt vào Player, Banker hoặc Tie trước khi hết giờ.', 'Dealer tự chia bài và trả thưởng.'], tip: 'Player/Banker dễ trúng hơn Tie; Tie trả cao nhưng hiếm.' },
  BLACKJACK: { goal: 'Đạt gần 21 hơn dealer mà không vượt 21.', steps: ['Đặt chip vào một ghế.', 'Hit để rút, Stand để dừng, Double để nhân đôi.', 'Dealer đứng ở soft 17.'], tip: 'Tổng 12–16 là vùng quyết định; nhìn lá ngửa của dealer trước.' },
  POKER: { goal: 'Thắng pot bằng bộ 5 lá mạnh nhất hoặc khiến đối thủ fold.', steps: ['Chọn đấu bot hoặc bàn người thật.', 'Theo lượt: Check/Call, Raise hoặc Fold.', 'Cash out khi kết thúc để nhận stack còn lại.'], tip: 'Đừng call mọi hand; vị trí và pot odds quan trọng hơn một lá bài đẹp.' },
  SICBO: { goal: 'Đoán tính chất tổng của 3 xúc xắc.', steps: ['Chọn chip.', 'Đặt vào Nhỏ/Lớn/Lẻ/Chẵn.', 'Chờ lắc và mở bát.'], tip: 'Bất kỳ bộ ba nào cũng làm cửa Nhỏ/Lớn/Lẻ/Chẵn thua.' },
  BAU_CUA: { goal: 'Chọn linh vật xuất hiện trên 3 viên xúc xắc.', steps: ['Chọn chip.', 'Có thể đặt nhiều linh vật.', 'Mỗi mặt trùng trả thêm 1 lần cược.'], tip: 'Một linh vật xuất hiện 2 lần sẽ trả 2:1.' },
  CHESS: { goal: 'Chiếu hết vua đối phương trong bàn 1v1.', steps: ['Vào bàn với phí 10 Coin.', 'Chọn quân rồi chọn ô đích hợp lệ.', 'Theo dõi lượt và trạng thái chiếu.'], tip: 'Phát triển quân nhẹ và bảo vệ vua trước khi tấn công.' },
  TIEN_LEN: { goal: 'Đánh hết bài trước ba người còn lại.', steps: ['Chọn đấu bot hoặc bàn chờ.', 'Ván đầu phải mở bằng 3♠.', 'Đánh bộ cùng loại mạnh hơn hoặc Bỏ lượt.'], tip: 'Giữ đôi thông/tứ quý để chặt heo, nhưng đừng giữ quá lâu.' },
  DICE_DUEL: { goal: 'Lắc điểm cao hơn nhà cái.', steps: ['Chọn chip.', 'Bấm Roll trước khi khóa cược.', 'So điểm và nhận thưởng tự động.'], tip: 'Đây là game may rủi nhanh; đặt mức cược nhỏ, dễ đọc.' },
  LUCKY_DRAW: { goal: 'Quay ba reel để tìm multiplier.', steps: ['Chọn chip.', 'Bấm quay.', 'Jackpot x5 được trả tự động.'], tip: 'Kết quả server-side; đây là prize draw may rủi.' },
}

const CASINO_GUIDE_DISABLED_KEY = 'skyoffice:game-guides-disabled'

function readGuidePreference(mode: CasinoGameMode) {
  try {
    const storage = window.localStorage
    return {
      disabled: storage.getItem(CASINO_GUIDE_DISABLED_KEY) === 'yes',
      hidden: storage.getItem(`skyoffice:game-guide:${mode}`) === 'seen' || storage.getItem(`skyoffice:game-guide:${mode}`) === 'hidden',
    }
  } catch {
    // The guide is only a convenience layer. If storage is unavailable, it
    // should still render and remain dismissible for the current mount.
    return { disabled: false, hidden: false }
  }
}

function CasinoGuide({ mode }: { mode: CasinoGameMode }) {
  const initialPreference = readGuidePreference(mode)
  const [open, setOpen] = useState(!initialPreference.disabled && !initialPreference.hidden)
  const [disabled, setDisabled] = useState(initialPreference.disabled)
  const guide = GAME_GUIDES[mode]

  useEffect(() => {
    const preference = readGuidePreference(mode)
    setDisabled(preference.disabled)
    setOpen(!preference.disabled && !preference.hidden)
  }, [mode])

  const persist = (key: string, value: string) => {
    try { window.localStorage.setItem(key, value) } catch { /* non-blocking preference */ }
  }

  const hide = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    persist(`skyoffice:game-guide:${mode}`, 'hidden')
    setOpen(false)
  }

  const disable = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    persist(CASINO_GUIDE_DISABLED_KEY, 'yes')
    persist(`skyoffice:game-guide:${mode}`, 'hidden')
    setDisabled(true)
    setOpen(false)
  }

  const reopen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  if (disabled) return null
  if (!open) return <button type="button" className="casino-guide-reopen" aria-label={`Mở hướng dẫn ${guide.goal}`} onClick={reopen}>?</button>
  return <aside className="casino-guide" aria-label="Hướng dẫn nhanh" onPointerDown={(event) => event.stopPropagation()}><header><span>HƯỚNG DẪN NHANH</span><button className="casino-guide-close" type="button" aria-label="Ẩn hướng dẫn" title="Ẩn hướng dẫn" onClick={hide}>×</button></header><strong>{guide.goal}</strong><ol>{guide.steps.map((step, index) => <li key={step}><b>{index + 1}</b>{step}</li>)}</ol><p>TIP · {guide.tip}</p><footer><span>HƯỚNG DẪN TỰ CHỌN</span><button type="button" onClick={disable}>TẮT HƯỚNG DẪN</button></footer></aside>
}

const BETTING_TABLE_MODES: CasinoGameMode[] = ['BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'DICE_DUEL', 'LUCKY_DRAW']

const BAU_FACES: Record<string, { icon: string; name: string }> = {
  DEER: { icon: '🦌', name: 'Nai' }, GOURD: { icon: '🎃', name: 'Bầu' }, ROOSTER: { icon: '🐓', name: 'Gà' },
  FISH: { icon: '🐟', name: 'Cá' }, CRAB: { icon: '🦀', name: 'Cua' }, SHRIMP: { icon: '🦐', name: 'Tôm' },
}

function secondsLeft(table: CasinoTableSnapshot, now: number) {
  return Math.max(0, Math.ceil((table.phaseEndsAt - now) / 1000))
}

function remainingPhaseProgress(startedAt: number, endsAt: number, now: number) {
  const duration = endsAt - startedAt
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, ((endsAt - now) / duration) * 100))
}

function CasinoPhaseTimer({ label, status, seconds, progress, live, urgent }: { label: string; status: string; seconds: number; progress: number; live: boolean; urgent: boolean }) {
  const shownSeconds = live ? '∞' : seconds.toString().padStart(2, '0')
  const progressStyle = live ? undefined : { width: `${progress}%` }
  return <section className={`casino-phase-timer ${live ? 'is-live' : ''} ${urgent ? 'is-urgent' : ''}`} role="timer" aria-label={live ? `${label}, bàn luôn mở` : `${label}, còn ${seconds} giây`}>
    <div className="casino-phase-timer-copy">
      <span>PHASE TIMER</span>
      <strong>{label}</strong>
      <small>{status}</small>
    </div>
    <div className="casino-phase-clock" aria-hidden="true"><b>{shownSeconds}</b><i>{live ? 'LIVE' : 'SEC'}</i></div>
    <div className="casino-phase-progress" role="progressbar" aria-label="Thời gian phase còn lại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={live ? 100 : Math.round(progress)}><i style={progressStyle} /></div>
  </section>
}

function phaseLabel(phase: CasinoTableSnapshot['phase']) {
  return ({ BETTING: 'ĐẶT CƯỢC', BETTING_CLOSED: 'KHÓA CƯỢC', DEALING: 'CHIA BÀI', PLAYER_TURN: 'LƯỢT CỦA BẠN', SHAKING: 'ĐANG LẮC', REVEAL: 'MỞ KẾT QUẢ', RESULT: 'TRẢ THƯỞNG' } as Record<string, string>)[phase] || phase
}

function Card({ code, hidden = false, index = 0, className = '' }: { code?: string; hidden?: boolean; index?: number; className?: string }) {
  if (hidden || !code) return <i className={`casino-card casino-card-back ${className}`} style={{ animationDelay: `${index * 90}ms` }} aria-label="Lá bài úp"><span className="casino-card-back-mark">STU</span></i>
  const rank = code.slice(0, -1)
  const suitCode = code.slice(-1)
  const suit = ({ S: '♠', H: '♥', D: '♦', C: '♣' } as Record<string, string>)[suitCode] || '◆'
  const red = suitCode === 'H' || suitCode === 'D'
  return <i className={`casino-card ${red ? 'is-red' : ''} ${className}`} style={{ animationDelay: `${index * 90}ms` }} aria-label={`Lá ${rank} ${suit}`}>
    <b className="casino-card-rank" aria-hidden="true">{rank}</b>
    <span className="casino-card-suit" aria-hidden="true">{suit}</span>
  </i>
}

function Hand({ cards, hideFrom = 99, highlightCards = [], className = '' }: { cards: string[]; hideFrom?: number; highlightCards?: string[]; className?: string }) {
  const highlighted = new Set(highlightCards)
  return <div className={`casino-hand ${className} ${highlightCards.length ? 'is-winning-hand' : ''}`.trim()}>{cards.map((card, index) => <Card code={card} className={highlighted.has(card) ? 'is-winning-card' : ''} hidden={index >= hideFrom} index={index} key={`${card}-${index}`} />)}</div>
}

type TexasActionVisual = { kind: 'CALL' | 'CHECK' | 'RAISE' | 'FOLD' | 'ALL_IN' | 'BLIND'; label: string; amount?: number; amountLabel?: string }

function texasActionVisual(lastAction?: string): TexasActionVisual | undefined {
  const value = (lastAction || '').trim().toUpperCase()
  if (!value || value === 'ĐANG CHƠI') return undefined
  const amountMatch = value.match(/(\d+)\s*$/)
  const amount = amountMatch ? Number(amountMatch[1]) : undefined
  if (value.startsWith('SMALL BLIND')) return { kind: 'BLIND', label: 'SB', amount }
  if (value.startsWith('BIG BLIND')) return { kind: 'BLIND', label: 'BB', amount }
  if (value.startsWith('ALL-IN')) return { kind: 'ALL_IN', label: 'ALL-IN', amount }
  if (value.startsWith('RAISE')) return { kind: 'RAISE', label: 'RAISE', amount, amountLabel: 'TO' }
  if (value.startsWith('CALL')) return { kind: 'CALL', label: 'CALL', amount }
  if (value.startsWith('CHECK')) return { kind: 'CHECK', label: 'CHECK' }
  if (value.startsWith('FOLD')) return { kind: 'FOLD', label: 'FOLD' }
  return undefined
}

type TexasSeatRole = { kind: 'dealer' | 'small-blind' | 'big-blind'; label: 'D' | 'SB' | 'BB'; title: string }

function texasSeatRoles(state: TexasHoldemPublicState, seat: number): TexasSeatRole[] {
  const seats = [...state.players].sort((left, right) => left.seat - right.seat).map((player) => player.seat)
  const dealerIndex = seats.indexOf(state.dealerSeat)
  if (dealerIndex < 0 || seats.length < 2) return []
  const smallBlindSeat = seats[(dealerIndex + 1) % seats.length]
  const bigBlindSeat = seats[(dealerIndex + 2) % seats.length]
  const roles: TexasSeatRole[] = []
  if (seat === state.dealerSeat) roles.push({ kind: 'dealer', label: 'D', title: 'Dealer button' })
  if (seat === smallBlindSeat) roles.push({ kind: 'small-blind', label: 'SB', title: `Small Blind ${state.smallBlind}` })
  if (seat === bigBlindSeat) roles.push({ kind: 'big-blind', label: 'BB', title: `Big Blind ${state.bigBlind}` })
  return roles
}

// Table coordinates are always from the viewer's perspective: seat 0 is the
// bottom edge (6 o'clock), then seats continue clockwise around the table.
function relativeTableSeat(seat: number, viewerSeat: number, seatCount: number) {
  if (seatCount <= 0) return 0
  return (seat - viewerSeat + seatCount) % seatCount
}

function Dice({ values, shaking, bauCua = false }: { values: string[]; shaking: boolean; bauCua?: boolean }) {
  return <div className={`casino-dice-tray ${shaking ? 'is-shaking' : ''}`}>{[0, 1, 2].map((index) => {
    const value = values[index]
    return <i className={`casino-die ${bauCua ? 'is-bau' : ''}`} key={index}>{shaking ? '?' : bauCua ? (BAU_FACES[value]?.icon || '✦') : (value || '•')}</i>
  })}</div>
}

function BetPoolMeta({ total, players, className = '' }: { total: number; players: number; className?: string }) {
  const normalizedTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const normalizedPlayers = Number.isFinite(players) ? Math.max(0, Math.floor(players)) : 0
  if (normalizedTotal <= 0 && normalizedPlayers <= 0) return null

  const amountLabel = `$${normalizedTotal.toLocaleString()}`
  const accessibleLabel = `Tổng cược ${amountLabel}; ${normalizedPlayers} người`
  return <span className={`casino-bet-meta ${className}`.trim()} aria-label={accessibleLabel} title={accessibleLabel}>
    <b className="casino-bet-total" aria-hidden="true">{amountLabel}</b>
    <span className="casino-bet-players" aria-hidden="true"><PersonIcon /><b>{normalizedPlayers}</b></span>
  </span>
}

interface BetAreaProps {
  choice: string
  label: React.ReactNode
  odds: string
  amount: number
  disabled: boolean
  onBet: (choice: string) => void
  className?: string
  areaRef?: (node: HTMLButtonElement | null) => void
  liveTotal?: number
  livePlayers?: number
  tone?: 'green' | 'red' | 'gold'
  resultState?: CasinoResultState
}

type CasinoResultState = 'winner' | 'push' | 'loser'
type CasinoResultKind = 'win' | 'push' | 'loss'
type CasinoSeatSnapshot = CasinoTableSnapshot['seats'][number]

function casinoResultStateLabel(state: CasinoResultState) {
  return state === 'winner' ? '★ THẮNG' : state === 'push' ? '◆ HÒA' : '— TRƯỢT'
}

function casinoResultStateFromNet(net: number): CasinoResultState {
  return net > 0 ? 'winner' : net === 0 ? 'push' : 'loser'
}

function casinoResultKindFromNet(net: number): CasinoResultKind {
  return net > 0 ? 'win' : net === 0 ? 'push' : 'loss'
}

function casinoResultStateForSeat(seat: CasinoSeatSnapshot | undefined, visible: boolean) {
  if (!seat || !visible || !seat.stake) return undefined
  return casinoResultStateFromNet(seat.net)
}

function winningSicBoChoices(table: CasinoTableSnapshot) {
  const dice = table.dice.map(Number).filter((value) => Number.isFinite(value))
  if (dice.length !== 3) return new Set<string>()
  const total = dice.reduce((sum, value) => sum + value, 0)
  const triple = dice[0] === dice[1] && dice[1] === dice[2]
  const choices = new Set<string>([`TOTAL_${total}`])
  if (!triple) {
    choices.add(total <= 10 ? 'SMALL' : 'BIG')
    choices.add(total % 2 ? 'ODD' : 'EVEN')
  } else {
    choices.add('ANY_TRIPLE')
    choices.add(`TRIPLE_${dice[0]}`)
  }
  dice.forEach((value) => {
    const matches = dice.filter((candidate) => candidate === value).length
    choices.add(`SINGLE_${value}`)
    if (matches >= 2) choices.add(`DOUBLE_${value}`)
  })
  return choices
}

function casinoBetResultState(mode: CasinoGameMode, choice: string, table: CasinoTableSnapshot): CasinoResultState | undefined {
  if (table.phase !== 'RESULT') return undefined
  if (mode === 'BACCARAT') {
    if (!['PLAYER', 'BANKER', 'TIE'].includes(table.outcome)) return undefined
    if (table.outcome === 'TIE' && (choice === 'PLAYER' || choice === 'BANKER')) return 'push'
    return choice === table.outcome ? 'winner' : 'loser'
  }
  if (mode === 'SICBO') {
    const winningChoices = winningSicBoChoices(table)
    return winningChoices.size ? winningChoices.has(choice) ? 'winner' : 'loser' : undefined
  }
  if (mode === 'BAU_CUA') return table.dice.length === 3 ? table.dice.includes(choice) ? 'winner' : 'loser' : undefined
  if (mode === 'DICE_DUEL' && choice === 'MAIN') {
    if (!['PLAYER', 'HOUSE', 'TIE'].includes(table.outcome)) return undefined
    return table.outcome === 'PLAYER' ? 'winner' : table.outcome === 'TIE' ? 'push' : 'loser'
  }
  if (mode === 'LUCKY_DRAW' && choice === 'DRAW') {
    const multiplier = Number(table.outcome.replace(/^x/i, ''))
    return Number.isFinite(multiplier) && /^x\d+$/i.test(table.outcome) ? multiplier > 1 ? 'winner' : multiplier === 1 ? 'push' : 'loser' : undefined
  }
  return undefined
}

function BetArea({ choice, label, odds, amount, disabled, onBet, className = '', areaRef, liveTotal = 0, livePlayers = 0, tone = 'green', resultState }: BetAreaProps) {
  const hasPoolStats = liveTotal > 0 || livePlayers > 0
  return <button ref={areaRef} data-bet-tone={tone} className={`casino-bet-area bet-tone-${tone} ${className} ${amount || liveTotal ? 'has-wager' : ''} ${resultState ? `is-result-${resultState}` : ''}`} disabled={disabled} onClick={() => onBet(choice)}>
    <span>{label}</span><small>{odds}</small>{hasPoolStats && <BetPoolMeta total={liveTotal} players={livePlayers} />}{amount > 0 && <b className="casino-wager-amount"><small>BẠN</small>{amount.toLocaleString()} COIN</b>}{resultState && <i className={`casino-bet-result-label is-${resultState}`}>{casinoResultStateLabel(resultState)}</i>}
  </button>
}

type LiveBetTarget = (choice: string) => (node: HTMLButtonElement | null) => void

function liveBetSummary(table: CasinoTableSnapshot, choice: string) {
  const players = table.seats.filter((seat) => (seat.wagers[choice] || 0) > 0)
  return { total: players.reduce((sum, seat) => sum + (seat.wagers[choice] || 0), 0), players: players.length }
}

function formatBetChoice(choice: string) {
  return choice.replace('ANY_TRIPLE', 'BỘ BA').replace('PLAYER', 'PLAYER').replace('BANKER', 'BANKER').replace('TIE', 'HÒA').replace('SMALL', 'NHỎ').replace('BIG', 'LỚN').replace('ODD', 'LẺ').replace('EVEN', 'CHẴN').replace('_', ' ')
}

type CasinoTone = 'green' | 'red' | 'gold'

const SICBO_TONES: Record<string, CasinoTone> = {
  SMALL: 'green', ODD: 'red', ANY_TRIPLE: 'red', EVEN: 'green', BIG: 'red',
}

const BAU_CUA_TONES: Record<string, CasinoTone> = {
  DEER: 'green', GOURD: 'red', ROOSTER: 'green', FISH: 'red', CRAB: 'green', SHRIMP: 'red',
}

const BAU_CUA_FACE_BY_INITIAL: Record<string, string> = {
  D: 'DEER', G: 'GOURD', R: 'ROOSTER', F: 'FISH', C: 'CRAB', S: 'SHRIMP',
}

function casinoHistoryTone(mode: CasinoGameMode, item: string): CasinoTone {
  const value = item.toUpperCase()
  if (mode === 'BACCARAT') return value === 'B' ? 'red' : value === 'T' ? 'gold' : 'green'
  if (mode === 'SICBO') {
    if (value.startsWith('T')) return 'red'
    const total = Number(value)
    return Number.isFinite(total) && total <= 10 ? 'green' : 'red'
  }
  if (mode === 'BAU_CUA') {
    const tones = value.split('').map((face) => BAU_CUA_TONES[BAU_CUA_FACE_BY_INITIAL[face]] || 'gold')
    const redCount = tones.filter((tone) => tone === 'red').length
    const greenCount = tones.filter((tone) => tone === 'green').length
    return redCount === greenCount ? 'gold' : redCount > greenCount ? 'red' : 'green'
  }
  if (mode === 'BLACKJACK') return value === 'B' ? 'green' : value.includes('PUSH') ? 'gold' : 'red'
  if (mode === 'POKER') return value.includes('FOLD') ? 'red' : value.includes('ALL-IN') || value.includes('RAISE') ? 'gold' : 'green'
  if (mode === 'DICE_DUEL') {
    const playerRoll = Number(value.slice(0, 1))
    const houseRoll = Number(value.slice(-1))
    return playerRoll === houseRoll ? 'gold' : playerRoll > houseRoll ? 'green' : 'red'
  }
  if (mode === 'LUCKY_DRAW') {
    const multiplier = Number(value.replace(/^X/, ''))
    return multiplier > 1 ? 'green' : multiplier === 1 ? 'gold' : 'red'
  }
  return 'gold'
}

function CasinoHistory({ mode, history }: { mode: CasinoGameMode; history: string[] }) {
  return <div className="casino-history"><span>SOI CẦU</span><div>{history.length ? history.slice(0, 8).map((item, index) => {
    const tone = casinoHistoryTone(mode, item)
    const isBauCua = mode === 'BAU_CUA'
    return <i className={`casino-history-token is-${tone} ${isBauCua ? 'is-bau-cua' : ''}`} title={`${metaLabelForHistory(mode)} · ${item}`} key={`${item}-${index}`}>
      {isBauCua ? item.split('').map((face, faceIndex) => <b className={`casino-history-dot is-${BAU_CUA_TONES[BAU_CUA_FACE_BY_INITIAL[face]] || 'gold'}`} key={`${face}-${faceIndex}`}>{face}</b>) : item}
    </i>
  }) : <small>Chờ kết quả…</small>}</div></div>
}

function metaLabelForHistory(mode: CasinoGameMode) {
  return mode === 'BACCARAT' ? 'Baccarat' : mode === 'SICBO' ? 'Sic Bo' : mode === 'BAU_CUA' ? 'Bầu Cua' : GAME_META[mode].title
}

function LiveBettingStage({ table, sessionId, children }: { table: CasinoTableSnapshot; sessionId: string; children: (registerTarget: LiveBetTarget) => React.ReactNode }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const targetRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLElement | null>>({})
  const previousRef = useRef<{ roundId: string; totals: Record<string, number> }>({ roundId: '', totals: {} })
  const [flight, setFlight] = useState<{ sessionId: string; choice: string; amount: number; token: number }>()
  const [layout, setLayout] = useState<{ token: number; targetX: number; targetY: number; startX: number; startY: number }>()
  const registerTarget: LiveBetTarget = (choice) => (node) => { targetRefs.current[choice] = node }

  useEffect(() => {
    const totals: Record<string, number> = {}
    table.seats.forEach((seat) => Object.entries(seat.wagers).forEach(([choice, amount]) => { totals[`${seat.sessionId}:${choice}`] = amount }))
    const previous = previousRef.current
    previousRef.current = { roundId: table.roundId, totals }
    if (previous.roundId !== table.roundId) {
      setFlight(undefined)
      return
    }
    const changed = table.seats.flatMap((seat) => Object.entries(seat.wagers).map(([choice, amount]) => ({ seat, choice, amount: amount - (previous.totals[`${seat.sessionId}:${choice}`] || 0) }))).find((entry) => entry.amount > 0)
    if (!changed) return
    const token = Date.now()
    setFlight({ sessionId: changed.seat.sessionId, choice: changed.choice, amount: changed.amount, token })
    const timer = window.setTimeout(() => setFlight(undefined), 1050)
    return () => window.clearTimeout(timer)
  }, [table.roundId, table.seats])

  useLayoutEffect(() => {
    if (!flight) {
      setLayout(undefined)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const stage = stageRef.current
      const source = seatRefs.current[flight.sessionId]
      const target = targetRefs.current[flight.choice]
      if (!stage || !source || !target) return
      const stageRect = stage.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const targetX = targetRect.left + targetRect.width / 2
      const targetY = targetRect.top + targetRect.height / 2
      setLayout({ token: flight.token, targetX: targetX - stageRect.left, targetY: targetY - stageRect.top, startX: sourceRect.left + sourceRect.width / 2 - targetX, startY: sourceRect.top + sourceRect.height / 2 - targetY })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [flight])

  const flightTone = targetRefs.current[flight?.choice || '']?.dataset.betTone || 'green'
  return <div className="casino-live-betting-stage" ref={stageRef}>
    {children(registerTarget)}
    {flight && layout?.token === flight.token && <div className={`casino-live-chip-flight bet-tone-${flightTone}`} style={{ '--live-target-x': `${layout.targetX}px`, '--live-target-y': `${layout.targetY}px`, '--live-start-x': `${layout.startX}px`, '--live-start-y': `${layout.startY}px` } as React.CSSProperties} key={flight.token}><strong>+{flight.amount}</strong><span>CHIP</span></div>}
    <section className="casino-live-crowd"><header><span>NGƯỜI CHƠI TRONG BÀN</span><strong>{table.activePlayers} LIVE</strong></header><div>{table.seats.length ? table.seats.map((seat) => { const activity = Object.entries(seat.wagers).filter(([, amount]) => amount > 0).map(([choice, amount]) => `${formatBetChoice(choice)} ${amount}`).join(' · '); const active = flight?.sessionId === seat.sessionId; return <article className={`${active ? 'is-betting' : ''} ${seat.sessionId === sessionId ? 'is-self' : ''}`} ref={(node) => { seatRefs.current[seat.sessionId] = node }} key={seat.sessionId}><i>{seat.displayName.slice(0, 2).toUpperCase()}</i><div><b>{seat.displayName}{seat.sessionId === sessionId ? ' · BẠN' : ''}</b><small>{activity || seat.status}</small></div><strong>{seat.stake.toLocaleString()}<small> COIN</small></strong>{active && <em>ĐANG CƯỢC</em>}</article> }) : <p>Chưa có chip trên bàn · hãy là người mở cược đầu tiên.</p>}</div></section>
  </div>
}

interface CasinoRewardToastState {
  kind: CasinoResultKind
  result: string
  net: number
  payout: number
  stake: number
  roundId: string
}

function casinoRewardToastFromSeat(seat: CasinoSeatSnapshot, roundId: string, fallbackResult: string, payoutOverride?: number) {
  const net = Number.isFinite(seat.net) ? Math.floor(seat.net) : 0
  const payoutSource = payoutOverride ?? seat.payout
  const payout = Number.isFinite(payoutSource) ? Math.max(0, Math.floor(payoutSource)) : 0
  const stake = Number.isFinite(seat.stake) ? Math.max(0, Math.floor(seat.stake)) : 0
  return {
    kind: casinoResultKindFromNet(net),
    result: seat.result || fallbackResult || 'Ván đã kết thúc',
    net,
    payout,
    stake,
    roundId,
  } satisfies CasinoRewardToastState
}

function CasinoRewardToast({ notice }: { notice: CasinoRewardToastState }) {
  const copy = notice.kind === 'win'
    ? { eyebrow: 'PAYOUT CONFIRMED', title: 'THẮNG CƯỢC', icon: '★' }
    : notice.kind === 'push'
      ? { eyebrow: 'STAKE RETURNED', title: 'HOÀN CƯỢC', icon: '◆' }
      : { eyebrow: 'ROUND SETTLED', title: 'KẾT QUẢ VÁN', icon: '×' }
  const netLabel = `${notice.net > 0 ? '+' : ''}${notice.net.toLocaleString()}`
  return <div className={`casino-toast casino-reward-toast is-${notice.kind}`} role="status" aria-live="assertive">
    <div className="casino-reward-emblem" aria-hidden="true"><span>{copy.icon}</span><i /></div>
    <div className="casino-reward-copy"><small>{copy.eyebrow}</small><strong>{copy.title}</strong><p>{notice.result}</p></div>
    <div className="casino-reward-value"><b>{netLabel}</b><span>COIN NET</span><small>{notice.payout > 0 ? `${notice.kind === 'push' ? 'HOÀN' : 'NHẬN'} ${notice.payout.toLocaleString()} COIN` : `CƯỢC ${notice.stake.toLocaleString()} COIN`}</small></div>
  </div>
}

const CASINO_RESULT_PARTICLES = Array.from({ length: 26 }, (_, index) => {
  const angle = (index / 26) * Math.PI * 2
  const distance = 115 + (index % 5) * 34
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.68,
    delay: (index % 7) * 42,
    rotate: (index * 47) % 360,
  }
})

const CASINO_RESULT_COINS = Array.from({ length: 12 }, (_, index) => ({
  x: -145 + ((index * 61) % 290),
  y: 72 + ((index * 23) % 80),
  delay: (index % 6) * 75,
  rotate: (index * 31) % 360,
}))

function CasinoResultVfx({ kind }: { kind: CasinoResultKind }) {
  return <div className={`casino-result-vfx is-${kind}`} aria-hidden="true">
    <div className="casino-result-flash" />
    <div className="casino-result-rays" />
    <div className="casino-result-ring" />
    <div className="casino-result-core"><span>{kind === 'win' ? '★' : kind === 'push' ? '◆' : '×'}</span></div>
    <div className="casino-result-particles">{CASINO_RESULT_PARTICLES.map((particle, index) => <i key={index} style={{ '--result-particle-x': `${particle.x}px`, '--result-particle-y': `${particle.y}px`, '--result-particle-delay': `${particle.delay}ms`, '--result-particle-rotate': `${particle.rotate}deg` } as React.CSSProperties} />)}</div>
    {kind === 'win' && <div className="casino-result-coins">{CASINO_RESULT_COINS.map((coin, index) => <i key={index} style={{ '--result-coin-x': `${coin.x}px`, '--result-coin-y': `${coin.y}px`, '--result-coin-delay': `${coin.delay}ms`, '--result-coin-rotate': `${coin.rotate}deg` } as React.CSSProperties}>●</i>)}</div>}
  </div>
}

export default function CasinoTableOverlay({ mode, stationLabel, onClose }: { mode: CasinoGameMode; stationLabel: string; onClose: () => void }) {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const coinBalance = useAppSelector((state) => state.social.snapshot?.progression.coinBalance || 0)
  const [table, setTable] = useState<CasinoTableSnapshot>({ ...EMPTY_TABLE, mode })
  const [selectedChip, setSelectedChip] = useState<number>(10)
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState<{ kind: 'win' | 'loss' | 'info'; text: string } | null>(null)
  const [rewardToast, setRewardToast] = useState<CasinoRewardToastState | null>(null)
  const [resultVfx, setResultVfx] = useState<{ kind: CasinoResultKind; roundId: string } | null>(null)
  const [tienLenState, setTienLenState] = useState<TienLenPrivateState>()
  const [tienLenAnimatingPlay, setTienLenAnimatingPlay] = useState<TienLenPlay>()
  const [texasPrivateState, setTexasPrivateState] = useState<TexasHoldemPublicState>()
  const resultRound = useRef('')
  const actionSequence = useRef(0)
  const meta = GAME_META[mode]
  const game = phaserGame.scene.keys.game as Game | undefined

  useEffect(() => {
    if (!game?.network) return
    const update = (snapshot: CasinoTableSnapshot) => setTable(snapshot)
    const casinoEvent = (payload: CasinoEventPayload) => {
      if (payload.mode !== mode) return
      if (payload.sessionId && payload.sessionId !== sessionId) return
      setToast({ kind: payload.type === 'PLAYER_WIN' ? 'win' : payload.type === 'PLAYER_LOSS' ? 'loss' : 'info', text: payload.message })
    }
    const casinoError = (payload: { message: string }) => setToast({ kind: 'loss', text: payload.message })
    game.network.onCasinoTableUpdated(mode, update)
    game.network.onCasinoEvent(casinoEvent)
    game.network.onCasinoError(casinoError)
    const tienLenStateUpdate = (payload: TienLenPrivateState) => setTienLenState(payload)
    const tienLenError = (payload: { message: string }) => setToast({ kind: 'loss', text: payload.message })
    const texasStateUpdate = (payload: TexasHoldemPublicState) => setTexasPrivateState(payload)
    const texasError = (payload: { message: string }) => setToast({ kind: 'loss', text: payload.message })
    game.network.onTienLenState(tienLenStateUpdate)
    game.network.onTienLenError(tienLenError)
    game.network.onTexasState(texasStateUpdate)
    game.network.onTexasError(texasError)
    return () => {
      phaserEvents.off(`${Event.CASINO_TABLE_UPDATED}:${mode}`, update)
      phaserEvents.off(Event.CASINO_EVENT, casinoEvent)
      phaserEvents.off(Event.CASINO_ERROR, casinoError)
      phaserEvents.off(Event.TIEN_LEN_PRIVATE_STATE, tienLenStateUpdate)
      phaserEvents.off(Event.TIEN_LEN_ERROR, tienLenError)
      phaserEvents.off(Event.TEXAS_PRIVATE_STATE, texasStateUpdate)
      phaserEvents.off(Event.TEXAS_ERROR, texasError)
    }
  }, [game, mode, sessionId])

  useEffect(() => {
    if (mode !== 'POKER') setTexasPrivateState(undefined)
  }, [mode])

  useEffect(() => {
    resultRound.current = ''
    setRewardToast(null)
    setResultVfx(null)
  }, [mode])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!game) return
    game.disableKeys('casino-table-modal')
    return () => game.enableKeys('casino-table-modal')
  }, [game])

  const mySeat = useMemo(() => table.seats.find((seat) => seat.sessionId === sessionId), [table.seats, sessionId])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const send = (action: string, choice?: string, amount?: number, tableId?: string, seatIndex?: number) => {
    actionSequence.current += 1
    game?.network.casinoAction({ mode, action, choice, amount, tableId, seatIndex, actionId: `${sessionId}:${Date.now()}:${actionSequence.current}` })
  }
  const sendChessMove = (move: string, promotion = 'q') => {
    actionSequence.current += 1
    game?.network.casinoAction({ mode, action: 'MOVE', move, promotion, actionId: `${sessionId}:${Date.now()}:${actionSequence.current}` })
  }
  const sendTienLen = (action: 'PLAY_BOT' | 'JOIN_TABLE' | 'LEAVE_TABLE' | 'START_LOBBY' | 'PLAY' | 'PASS', cards?: string[], tableId?: string) => {
    actionSequence.current += 1
    if (action === 'LEAVE_TABLE') setTienLenState(undefined)
    game?.network.tienLenAction({ action, cards, tableId, actionId: `${sessionId}:${Date.now()}:${actionSequence.current}` })
  }
  const alwaysOpen = mode === 'CHESS' || mode === 'POKER' || mode === 'TIEN_LEN'
  const betting = table.phase === 'BETTING' || alwaysOpen
  const bet = (choice: string, seatIndex?: number) => send('BET', choice, selectedChip, undefined, seatIndex)
  const wagers = mySeat?.wagers || {}
  const timer = secondsLeft(table, now)
  const texasPublicState = mode === 'POKER' ? mySeat?.pokerState : undefined
  const texasState = texasPrivateState && texasPublicState?.handId === texasPrivateState.handId ? texasPrivateState : texasPublicState
  const texasActingPlayer = texasState?.players.find((player) => player.seat === texasState.actingSeat)
  const texasSeconds = texasState?.turnEndsAt ? Math.max(0, Math.ceil((texasState.turnEndsAt - now) / 1000)) : 0
  const texasPhase = texasState?.complete ? 'KẾT QUẢ HAND' : texasState?.turnStatus === 'BOT_THINKING' ? 'BOT ĐANG SUY NGHĨ' : texasState?.turnStatus === 'HUMAN_TURN' ? 'LƯỢT CỦA BẠN' : 'BÀN POKER'
  const texasStatus = texasState?.complete ? texasState.result : texasActingPlayer ? `${texasActingPlayer.name} đang giữ lượt · ${texasState?.turnStatus === 'BOT_THINKING' ? 'đang tính nước' : 'chờ hành động'}` : table.statusText
  const tableHasClock = table.phaseEndsAt > 0 && table.phaseEndsAt > table.phaseStartedAt
  const texasTurnHasClock = mode === 'POKER' && Boolean(texasState?.turnEndsAt && texasState.turnEndsAt > texasState.turnStartedAt && !texasState.complete)
  const phaseClockStart = texasTurnHasClock ? texasState?.turnStartedAt || 0 : table.phaseStartedAt
  const phaseClockEnd = texasTurnHasClock ? texasState?.turnEndsAt || 0 : table.phaseEndsAt
  const phaseTimerLive = phaseClockEnd <= phaseClockStart
  const phaseTimerSeconds = texasTurnHasClock ? texasSeconds : timer
  const phaseTimerProgress = phaseTimerLive ? 100 : remainingPhaseProgress(phaseClockStart, phaseClockEnd, now)
  const phaseLabelText = texasTurnHasClock ? texasPhase : tableHasClock ? phaseLabel(table.phase) : alwaysOpen ? 'BÀN LUÔN MỞ' : phaseLabel(table.phase)
  const phaseStatusText = mode === 'POKER' && texasState ? texasStatus : mode === 'TIEN_LEN' && tienLenAnimatingPlay ? `${tienLenAnimatingPlay.playerName} đang đánh · bài đang bay` : table.statusText
  const availableChips = mode === 'CHESS' ? [10] : mode === 'POKER' ? [100] : mode === 'LUCKY_DRAW' ? CASINO_CHIPS : CASINO_CHIPS.filter((chip) => chip >= 10)
  const showGameHistory = BETTING_TABLE_MODES.includes(mode)
  const activeTienLenState = mode === 'TIEN_LEN' ? (tienLenState?.gameId === table.tienLenPublic?.gameId ? tienLenState : table.tienLenPublic) : undefined
  const hasResultStake = Boolean(mySeat && (mode !== 'TIEN_LEN' || mySeat.stake > 0))
  const resultIsVisible = Boolean(mySeat && hasResultStake && (
    table.phase === 'RESULT'
    || (mode === 'POKER' && texasState?.complete)
    || (mode === 'CHESS' && ['WIN', 'LOSS', 'DRAW', 'SETTLED'].includes(mySeat.status))
    || (mode === 'TIEN_LEN' && activeTienLenState?.status === 'COMPLETE')
  ))
  const resultId = mode === 'POKER' && texasState?.complete
    ? `POKER:${texasState.handId}`
    : mode === 'TIEN_LEN' && activeTienLenState?.status === 'COMPLETE'
      ? `TIEN_LEN:${activeTienLenState.gameId}:${activeTienLenState.handNumber}`
      : `${mode}:${table.roundId}`
  const resultDetail = mySeat?.result || texasState?.result || activeTienLenState?.result || table.resultDetail || 'Ván đã kết thúc'
  const texasHumanPayout = mode === 'POKER' && texasState?.complete
    ? texasState.players.find((player) => player.id === texasState.viewerId || player.id === 'HUMAN' || player.id === mySeat?.sessionId)?.payout
    : undefined

  useEffect(() => {
    if (!resultIsVisible || !mySeat || !resultId || resultRound.current === resultId) return
    resultRound.current = resultId
    const notice = casinoRewardToastFromSeat(mySeat, resultId, resultDetail, texasHumanPayout)
    setRewardToast(notice)
    setToast(null)
    setResultVfx({ kind: notice.kind, roundId: resultId })
  }, [mySeat, resultDetail, resultId, resultIsVisible, texasHumanPayout])

  useEffect(() => {
    if (!rewardToast) return
    const timer = window.setTimeout(() => setRewardToast(null), 5600)
    return () => window.clearTimeout(timer)
  }, [rewardToast])

  useEffect(() => {
    if (!resultVfx) return
    const timer = window.setTimeout(() => setResultVfx(null), 2300)
    return () => window.clearTimeout(timer)
  }, [resultVfx])

  return <div className="casino-modal-backdrop" aria-live="polite">
    <section className={`casino-shell casino-${mode.toLowerCase()} phase-${table.phase.toLowerCase()}`} style={{ '--casino-accent': meta.color } as React.CSSProperties}>
      <header className="casino-header">
        <div className="casino-brand"><span className="casino-live-dot" /><div><small>{meta.kicker}</small><h2>{meta.title}</h2></div></div>
        <div className="casino-round-meta"><span>ROUND</span><b>#{table.roundNumber}</b><em>{table.shoeRemaining ? `${table.shoeRemaining} cards` : 'LIVE RNG'}</em></div>
        <div className="casino-header-wallet"><span>VÍ COIN</span><b>{coinBalance.toLocaleString()}</b></div>
        <div className="casino-header-tools"><CasinoGuide mode={mode} /><button className="casino-close" aria-label="Đóng bàn casino" onClick={onClose}>×</button></div>
      </header>

      <div className="casino-phasebar"><div><span>{phaseLabelText}</span><strong>{phaseStatusText}</strong></div></div>

      <main className="casino-table-surface">
        <CasinoPhaseTimer label={phaseLabelText} status={phaseStatusText} seconds={phaseTimerSeconds} progress={phaseTimerProgress} live={phaseTimerLive} urgent={!phaseTimerLive && phaseTimerSeconds <= 3} />
        <div className="casino-dealer"><span className="casino-dealer-avatar">AI</span><div><small>LIVE DEALER</small><strong>{table.dealerName}</strong></div><BetPoolMeta total={table.totalWagered} players={table.activePlayers} className="casino-dealer-meta" /></div>
        {mode === 'BACCARAT' && <LiveBettingStage table={table} sessionId={sessionId}>{(registerBetTarget) => <BaccaratTable table={table} wagers={wagers} disabled={!betting} onBet={bet} registerBetTarget={registerBetTarget} />}</LiveBettingStage>}
        {mode === 'BLACKJACK' && <BlackjackTable table={table} mySeat={mySeat} disabled={!betting} onBet={bet} onAction={send} />}
        {mode === 'POKER' && <TexasHoldemTable table={table} mySeat={mySeat} privateState={texasState === texasPrivateState ? texasPrivateState : undefined} coinBalance={coinBalance} now={now} onAction={send} />}
        {mode === 'TIEN_LEN' && <TienLenTable table={table} sessionId={sessionId} privateState={tienLenState?.gameId === table.tienLenPublic?.gameId ? tienLenState : undefined} coinBalance={coinBalance} onAction={sendTienLen} onAnimationChange={setTienLenAnimatingPlay} />}
        {mode === 'SICBO' && <LiveBettingStage table={table} sessionId={sessionId}>{(registerBetTarget) => <SicBoTable table={table} wagers={wagers} disabled={!betting} onBet={bet} registerBetTarget={registerBetTarget} />}</LiveBettingStage>}
        {mode === 'BAU_CUA' && <LiveBettingStage table={table} sessionId={sessionId}>{(registerBetTarget) => <BauCuaTable table={table} wagers={wagers} disabled={!betting} onBet={bet} registerBetTarget={registerBetTarget} />}</LiveBettingStage>}
        {mode === 'CHESS' && <ChessCasinoTable mySeat={mySeat} onStart={() => send('BET', 'MAIN', 10)} onMove={sendChessMove} />}
        {mode === 'DICE_DUEL' && <DiceDuelTable table={table} mySeat={mySeat} disabled={!betting} onBet={bet} />}
        {mode === 'LUCKY_DRAW' && <LuckyDrawTable table={table} mySeat={mySeat} disabled={!betting} onBet={bet} />}
      </main>

      {resultVfx && <CasinoResultVfx key={resultVfx.roundId} kind={resultVfx.kind} />}

      <GameChannelChat channel={mode} />
      <footer className="casino-controls">
        {mode !== 'TIEN_LEN' && <div className="casino-chip-rack"><span>CHỌN CHIP</span>{availableChips.map((chip) => <button className={`casino-chip chip-${chip} ${selectedChip === chip ? 'selected' : ''}`} disabled={coinBalance < chip} key={chip} onClick={() => setSelectedChip(chip)}>{chip}</button>)}</div>}
        <div className="casino-player-summary"><span>{mode === 'TIEN_LEN' ? 'PHÍ VÀO PHÒNG' : 'CƯỢC VÁN NÀY'}</span><b>{mode === 'TIEN_LEN' ? mySeat?.stake ? `${mySeat.stake.toLocaleString()} Coin` : 'MIỄN PHÍ / BOT' : `${(mySeat?.stake || 0).toLocaleString()} Coin`}</b><small>{meta.rule}</small></div>
        {showGameHistory && <CasinoHistory mode={mode} history={table.history} />}
      </footer>
      {rewardToast ? <CasinoRewardToast notice={rewardToast} /> : toast && <div className={`casino-toast is-${toast.kind}`} role="status"><span>{toast.kind === 'win' ? '✦' : toast.kind === 'loss' ? '×' : '◆'}</span><strong>{toast.text}</strong></div>}
      <span className="casino-station-name">{stationLabel} · Server authoritative</span>
    </section>
  </div>
}

const CHESS_GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

function chessSquares(fen: string) {
  const board = fen.split(' ')[0] || '8/8/8/8/8/8/8/8'
  const squares: Array<{ square: string; piece: string }> = []
  board.split('/').forEach((rankText, rankIndex) => {
    let fileIndex = 0
    for (const token of rankText) {
      if (/\d/.test(token)) {
        for (let empty = 0; empty < Number(token); empty += 1) {
          squares.push({ square: `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`, piece: '' })
          fileIndex += 1
        }
      } else {
        squares.push({ square: `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`, piece: token })
        fileIndex += 1
      }
    }
  })
  return squares
}

function ChessCasinoTable({ mySeat, onStart, onMove }: { mySeat?: CasinoTableSnapshot['seats'][number]; onStart: () => void; onMove: (move: string, promotion?: string) => void }) {
  const [selected, setSelected] = useState('')
  const board = useMemo(() => chessSquares(mySeat?.board || ''), [mySeat?.board])
  const active = Boolean(mySeat && ['PLAYING', 'CHECK'].includes(mySeat.status))
  const lastFrom = mySeat?.lastMove.slice(0, 2) || ''
  const lastTo = mySeat?.lastMove.slice(2, 4) || ''
  const resultState = casinoResultStateForSeat(mySeat, Boolean(mySeat && !active))

  useEffect(() => setSelected(''), [mySeat?.board])

  const selectSquare = (square: string, piece: string) => {
    if (!active || mySeat?.turn !== 'WHITE') return
    const isWhitePiece = Boolean(piece && piece === piece.toUpperCase())
    if (!selected) {
      if (isWhitePiece) setSelected(square)
      return
    }
    if (isWhitePiece) {
      setSelected(square)
      return
    }
    onMove(`${selected}${square}`, 'q')
    setSelected('')
  }

  return <div className="casino-chess-layout">
    <section className="casino-chess-opponent"><div className="casino-chess-avatar">♚</div><div><span>DEALER AI · BLACK</span><strong>GRANDMASTER NOVA</strong><small>Luật chuẩn · phản hồi tự động</small></div></section>
    <div className="casino-chess-board-wrap">
      <div className={`casino-chess-board ${mySeat?.status === 'CHECK' ? 'is-check' : ''} ${resultState ? `is-result-${resultState}` : ''}`}>
        {board.map(({ square, piece }, index) => <button
          className={`${(Math.floor(index / 8) + index) % 2 ? 'is-dark' : 'is-light'} ${selected === square ? 'is-selected' : ''} ${lastFrom === square || lastTo === square ? 'is-last-move' : ''}`}
          disabled={!active || mySeat?.turn !== 'WHITE'}
          onClick={() => selectSquare(square, piece)}
          key={square}
          aria-label={`${square}${piece ? ` ${piece}` : ''}`}
        ><i>{CHESS_GLYPHS[piece] || ''}</i>{square[0] === 'a' && <small>{square[1]}</small>}{square[1] === '1' && <em>{square[0]}</em>}</button>)}
      </div>
      {!mySeat && <div className="casino-chess-start"><span>♙</span><h3>THÁCH ĐẤU DEALER AI</h3><p>Bạn cầm quân Trắng. Mỗi ván 10 Coin, thắng nhận 18 Coin, hòa hoàn phí.</p><button onClick={onStart}>PLAY · 10 COIN</button></div>}
      {mySeat && !active && <div className={`casino-chess-start is-result ${resultState ? `is-result-${resultState}` : ''}`}><span>{mySeat.win ? '♛' : mySeat.status === 'DRAW' ? '♜' : '♟'}</span><h3>{mySeat.status}</h3><p>{mySeat.result}</p><strong>{mySeat.net >= 0 ? '+' : ''}{mySeat.net} COIN</strong><button onClick={onStart}>CHƠI VÁN MỚI · 10 COIN</button></div>}
    </div>
    <section className="casino-chess-player"><div className="casino-chess-avatar is-player">♔</div><div><span>YOU · WHITE</span><strong>{mySeat?.displayName || 'CHỜ NGƯỜI CHƠI'}</strong><small>{active ? mySeat?.result : 'Bàn sẵn sàng bất kỳ lúc nào'}</small></div><b>{active ? (mySeat?.turn === 'WHITE' ? 'YOUR TURN' : 'AI TURN') : 'READY'}</b></section>
  </div>
}

function BaccaratTable({ table, wagers, disabled, onBet, registerBetTarget }: { table: CasinoTableSnapshot; wagers: Record<string, number>; disabled: boolean; onBet: (choice: string) => void; registerBetTarget: LiveBetTarget }) {
  const showCards = table.phase !== 'BETTING' && table.phase !== 'BETTING_CLOSED'
  const live = (choice: string) => liveBetSummary(table, choice)
  const playerResult = casinoBetResultState('BACCARAT', 'PLAYER', table)
  const tieResult = casinoBetResultState('BACCARAT', 'TIE', table)
  const bankerResult = casinoBetResultState('BACCARAT', 'BANKER', table)
  return <div className="casino-baccarat-layout">
    <section className={`casino-baccarat-hand is-player ${playerResult ? `is-result-${playerResult}` : ''} ${playerResult === 'winner' ? 'is-winner' : ''}`}><span>PLAYER</span><b>{showCards ? table.playerTotal : '—'}</b>{showCards ? <Hand cards={table.playerCards} /> : <div className="casino-card-placeholder">PLACE BETS</div>}</section>
    <div className="casino-table-center"><span className="casino-table-logo">STU</span><small>BACCARAT</small><em>8 DECK SHOE</em></div>
    <section className={`casino-baccarat-hand is-banker ${bankerResult ? `is-result-${bankerResult}` : ''} ${bankerResult === 'winner' ? 'is-winner' : ''}`}><span>BANKER</span><b>{showCards ? table.bankerTotal : '—'}</b>{showCards ? <Hand cards={table.bankerCards} /> : <div className="casino-card-placeholder">NO MORE BETS</div>}</section>
    <div className="casino-baccarat-bets"><BetArea choice="PLAYER" label="PLAYER" odds="1 : 1" amount={wagers.PLAYER || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget('PLAYER')} liveTotal={live('PLAYER').total} livePlayers={live('PLAYER').players} tone="green" resultState={playerResult} /><BetArea choice="TIE" label="TIE" odds="8 : 1" amount={wagers.TIE || 0} disabled={disabled} onBet={onBet} className="is-tie" areaRef={registerBetTarget('TIE')} liveTotal={live('TIE').total} livePlayers={live('TIE').players} tone="gold" resultState={tieResult} /><BetArea choice="BANKER" label="BANKER" odds="0.95 : 1" amount={wagers.BANKER || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget('BANKER')} liveTotal={live('BANKER').total} livePlayers={live('BANKER').players} tone="red" resultState={bankerResult} /></div>
  </div>
}

function BlackjackTable({ table, mySeat, disabled, onBet, onAction }: { table: CasinoTableSnapshot; mySeat?: CasinoTableSnapshot['seats'][number]; disabled: boolean; onBet: (choice: string, seatIndex?: number) => void; onAction: (action: string) => void }) {
  const revealDealer = table.phase === 'REVEAL' || table.phase === 'RESULT'
  const spots = [0, 1, 2, 3].map((index) => table.seats.find((seat) => seat.seatIndex === index))
  const activeSeat = spots.find((seat) => seat.turn === 'ACTIVE')
  const canBet = !disabled
  const canEnterSpot = canBet && !mySeat
  const myTurn = table.phase === 'PLAYER_TURN' && mySeat?.turn === 'ACTIVE' && !mySeat.acted
  return <div className="casino-blackjack-layout">
    <section className={`blackjack-dealer-zone ${revealDealer ? 'is-revealed' : ''}`}>
      <div className="blackjack-dealer-top">
        <div className="blackjack-dealer-identity"><span className="casino-dealer-avatar">AI</span><div><small>LIVE DEALER</small><strong>{table.dealerName}</strong></div></div>
        <div className="blackjack-dealer-score"><small>DEALER HAND</small><b>{revealDealer ? table.dealerTotal : table.dealerCards.length ? '?' : '—'}</b></div>
      </div>
      <Hand cards={table.dealerCards} hideFrom={revealDealer ? 99 : 1} />
      <div className="blackjack-dealer-rules"><span>BLACKJACK PAYS 3 TO 2</span><small>DEALER STANDS ON SOFT 17</small></div>
    </section>

    <div className="blackjack-spots-heading"><span>BETTING SPOTS</span><strong>{table.activePlayers}/4 TỤ ĐANG CƯỢC</strong><small>{table.phase === 'BETTING' ? 'Mỗi người chọn một tụ trống' : activeSeat ? `Lượt của ${activeSeat.displayName}` : 'Chờ dealer'}</small></div>

    <section className="blackjack-player-spots" aria-label="Các tụ cược Blackjack">
      {[0, 1, 2, 3].map((index) => {
        const seat = spots[index]
        const isMine = seat?.sessionId === mySeat?.sessionId
        const isActive = seat?.turn === 'ACTIVE'
        const canAddWager = Boolean(isMine && canBet)
        const resultState = casinoResultStateForSeat(seat, table.phase === 'RESULT')
        return <article className={`blackjack-spot ${seat ? 'is-occupied' : 'is-open'} ${isActive ? 'is-active' : ''} ${seat?.win ? 'is-winner' : ''} ${resultState ? `is-result-${resultState}` : ''}`} key={seat?.sessionId || `open-${index}`}>
          <header><span>TỤ {index + 1}</span>{seat ? <b>{isActive ? 'ĐANG ĐÁNH' : seat.status || 'ĐÃ CƯỢC'}</b> : <small>TRỐNG</small>}</header>
          {seat ? <div className="blackjack-spot-body">
            {resultState && <div className={`casino-result-badge is-${resultState}`}><span>{resultState === 'winner' ? '★' : resultState === 'push' ? '◆' : '×'}</span>{casinoResultStateLabel(resultState)}</div>}
            <BetPoolMeta total={seat.stake} players={1} className="blackjack-spot-meta" />
            <div className="blackjack-spot-player"><strong>{seat.displayName}</strong>{isMine && <em>BẠN</em>}</div>
            <div className="blackjack-spot-wager"><span>CƯỢC</span><b>{seat.stake.toLocaleString()} COIN</b></div>
            {seat.cards.length ? <Hand cards={seat.cards} /> : <div className="casino-seat-empty">Đợi chia bài</div>}
            <footer><strong>{seat.handValue || '—'}</strong><small>{isActive ? 'TỚI LƯỢT' : seat.result || seat.status || 'CHỜ LƯỢT'}</small></footer>
            {canAddWager && <BetArea choice="MAIN" label="THÊM CHIP" odds="MIN 10" amount={0} disabled={false} onBet={() => onBet('MAIN', seat.seatIndex)} className="is-inline" tone="gold" />}
          </div> : <div className="blackjack-spot-empty">
            <strong>TỤ TRỐNG</strong><small>{canEnterSpot ? 'Chọn chip để vào tụ' : mySeat ? `Bạn đang ở tụ ${mySeat.seatIndex + 1}` : 'Đang chờ người chơi'}</small>
            {canBet && <BetArea choice="MAIN" label="VÀO TỤ" odds="MIN 10" amount={0} disabled={!canEnterSpot} onBet={() => onBet('MAIN', index)} tone="green" />}
          </div>}
        </article>
      })}
    </section>

    <div className={`blackjack-turn-status ${myTurn ? 'is-mine' : ''}`}><span>{table.phase === 'PLAYER_TURN' ? 'ACTION' : 'TABLE STATUS'}</span><strong>{activeSeat ? `LƯỢT CỦA ${activeSeat.displayName}` : table.statusText}</strong>{myTurn && <small>Chọn Hit, Stand hoặc Double</small>}</div>
    {myTurn && <div className="casino-decision-bar"><button onClick={() => onAction('HIT')}>HIT <small>RÚT</small></button><button onClick={() => onAction('STAND')}>STAND <small>DẰN</small></button><button disabled={mySeat.cards.length !== 2} onClick={() => onAction('DOUBLE')}>DOUBLE <small>2× BET</small></button></div>}
  </div>
}

function PvpTableLobby({ mode, table, coinBalance, onJoin, onPlayBot }: { mode: PvpTableMode; table: CasinoTableSnapshot; coinBalance: number; onJoin: (tableId: string) => void; onPlayBot: () => void }) {
  const configs = PVP_TABLE_CATALOG[mode]
  const [stakeFilter, setStakeFilter] = useState<number | 'ALL'>('ALL')
  const snapshots = table.pvpLobby || []
  const rows = configs.map((config, index) => {
    const live = snapshots.find((candidate) => candidate.id === config.id)
    if (live) return live
    return { ...config, playerCount: index === 0 ? table.activePlayers : 0, status: index === 0 && table.activePlayers > 0 ? 'WAITING' : 'OPEN', pot: index === 0 ? table.totalWagered : 0, roundId: table.roundId } as PvpTableSnapshot
  })
  const firstOpenId = rows.find((candidate) => candidate.status !== 'FULL' && candidate.status !== 'RUNNING')?.id
  const isPoker = mode === 'POKER'
  const stakeOptions = [...new Set(rows.map((candidate) => candidate.buyIn))]
  const visibleRows = isPoker || stakeFilter === 'ALL' ? rows : rows.filter((candidate) => candidate.buyIn === stakeFilter)
  return <div className={`pvp-table-lobby pvp-table-lobby-${mode.toLowerCase()}`}>
    <div className="pvp-lobby-hero"><div><span className="pvp-lobby-kicker">PVP TABLE LOBBY · LIVE</span><h3>{isPoker ? 'Chọn bàn Texas Hold’em' : 'Sảnh phòng Tiến Lên tự do'}</h3><p>{isPoker ? 'Chọn mức blind, số ghế đang có người và vào thẳng bàn cash thật.' : 'Đọc số phòng để rủ bạn bè. Nếu phòng đầy, server tự tìm bàn cùng mức cược còn chỗ.'}</p></div><div className="pvp-lobby-hero-actions"><button className="pvp-bot-button" onClick={onPlayBot}>ĐÁNH VỚI 3 BOT<small>SOLO TABLE</small></button></div></div>
    <div className="pvp-table-lobby-toolbar"><span><b>{visibleRows.length}</b> TABLE ĐANG HIỂN THỊ</span>{!isPoker && <div className="pvp-stake-filters"><button className={stakeFilter === 'ALL' ? 'active' : ''} onClick={() => setStakeFilter('ALL')}>TẤT CẢ</button>{stakeOptions.map((stake) => <button className={stakeFilter === stake ? 'active' : ''} onClick={() => setStakeFilter(stake)} key={stake}>{stake ? `${stake} COIN` : 'MIỄN PHÍ'}</button>)}</div>}<small>{isPoker ? 'BUY-IN 100 · BLINDS 5 / 10' : '2–4 NGƯỜI · TỰ CHUYỂN KHI ĐẦY'}</small></div>
    <div className="pvp-table-grid">{visibleRows.map((candidate) => {
      const isJoinable = !isPoker || candidate.status !== 'RUNNING'
      const isFull = candidate.status === 'FULL' || candidate.playerCount >= candidate.maxPlayers
      const statusLabel = candidate.status === 'RUNNING' ? 'ĐANG CHƠI' : candidate.status === 'FULL' ? 'ĐẦY BÀN' : candidate.status === 'WAITING' ? 'ĐANG CHỜ' : 'BÀN TRỐNG'
      return <article className={`pvp-table-card is-${candidate.status.toLowerCase()} ${!isJoinable ? 'is-coming-soon' : ''}`} key={candidate.id}>
        <div className="pvp-table-card-top"><span className="pvp-table-status"><i />{statusLabel}</span><b>{candidate.playerCount}<small>/{candidate.maxPlayers}</small></b></div>
        <div className="pvp-room-code"><span>PHÒNG</span><strong>#{candidate.roomCode}</strong><small>ĐỌC SỐ NÀY ĐỂ RỦ BẠN</small></div><h4>{candidate.name}</h4>
        <div className="pvp-table-card-stats"><div><small>{isPoker ? 'BLINDS' : 'MỨC CƯỢC'}</small><strong>{candidate.stakesLabel}</strong></div><div><small>{isPoker ? 'BUY-IN' : 'PHÍ VÀO'}</small><strong>{candidate.buyIn ? `${candidate.buyIn} COIN` : 'MIỄN PHÍ'}</strong></div>{isPoker && <div><small>POT HIỆN TẠI</small><strong>{candidate.pot.toLocaleString()} CHIP</strong></div>}</div>
        <div className="pvp-table-card-bottom"><span>{candidate.hostName || (candidate.playerCount ? `${candidate.playerCount} người đang ở bàn` : 'Sẵn sàng nhận người chơi')}</span><button disabled={!isJoinable || coinBalance < candidate.buyIn} onClick={() => onJoin(candidate.id)}>{coinBalance < candidate.buyIn ? 'THIẾU COIN' : !isPoker && (isFull || candidate.status === 'RUNNING') ? 'TÌM BÀN CÙNG MỨC →' : !isJoinable ? 'ĐANG CHƠI' : 'VÀO PHÒNG →'}</button></div>
      </article>
    })}</div>
    <div className="pvp-table-lobby-foot"><span>◆</span><p>Server cập nhật số ghế và trạng thái bàn theo thời gian thực.</p><small>{firstOpenId ? `Bàn gợi ý: ${rows.find((candidate) => candidate.id === firstOpenId)?.name}` : 'Các bàn đang đầy'}</small></div>
  </div>
}

function TexasHoldemTable({ table, mySeat, privateState, coinBalance, now, onAction }: { table: CasinoTableSnapshot; mySeat?: CasinoTableSnapshot['seats'][number]; privateState?: TexasHoldemPublicState; coinBalance: number; now: number; onAction: (action: string, choice?: string, amount?: number, tableId?: string) => void }) {
  const state = privateState || mySeat?.pokerState
  const [raiseTo, setRaiseTo] = useState(20)
  const [chipFlight, setChipFlight] = useState<{ playerId: string; seat: number; amount: number; token: number }>()
  const [chipLayout, setChipLayout] = useState<{ token: number; targetX: number; targetY: number; startX: number; startY: number }>()
  const [payoutFlight, setPayoutFlight] = useState<{ playerId: string; seat: number; amount: number; token: number }>()
  const [payoutLayout, setPayoutLayout] = useState<{ token: number; targetX: number; targetY: number; startX: number; startY: number }>()
  const texasFeltRef = useRef<HTMLDivElement | null>(null)
  const texasBoardRef = useRef<HTMLDivElement | null>(null)
  const texasSeatRefs = useRef<Record<number, HTMLElement | null>>({})
  const previousBetTotalsRef = useRef<{ handId: string; totals: Record<string, number> }>({ handId: '', totals: {} })
  const lastTexasActionKeyRef = useRef('')
  const payoutKeyRef = useRef('')
  const viewerId = state?.viewerId || mySeat?.sessionId || ''
  const humanSeat = state?.players.find((player) => player.id === viewerId)?.seat ?? state?.players.find((player) => player.id === 'HUMAN')?.seat ?? 0
  const visualSeat = (seat: number) => state ? relativeTableSeat(seat, humanSeat, state.players.length) : seat
  useEffect(() => {
    if (state?.minRaiseTo) setRaiseTo(state.minRaiseTo)
  }, [state?.handId, state?.minRaiseTo])
  useEffect(() => {
    if (!state) return
    const currentTotals = Object.fromEntries(state.players.map((player) => [player.id, player.totalBet]))
    const previous = previousBetTotalsRef.current
    const actionKey = `${state.handId}:${state.actionLog[0] || ''}`
    if (previous.handId !== state.handId) {
      previousBetTotalsRef.current = { handId: state.handId, totals: currentTotals }
      lastTexasActionKeyRef.current = actionKey
      setChipFlight(undefined)
      return
    }
    if (lastTexasActionKeyRef.current === actionKey) {
      previousBetTotalsRef.current = { handId: state.handId, totals: currentTotals }
      return
    }
    lastTexasActionKeyRef.current = actionKey
    const changed = state.players.find((player) => player.totalBet > (previous.totals[player.id] ?? player.totalBet))
    previousBetTotalsRef.current = { handId: state.handId, totals: currentTotals }
    if (!changed) return
    const amount = changed.totalBet - (previous.totals[changed.id] || 0)
    const token = Date.now()
    setChipFlight({ playerId: changed.id, seat: changed.seat, amount, token })
    const timer = window.setTimeout(() => setChipFlight(undefined), 980)
    return () => window.clearTimeout(timer)
  }, [state?.handId, state?.actionLog?.[0], state?.players])
  useLayoutEffect(() => {
    if (!chipFlight) {
      setChipLayout(undefined)
      return
    }
    setChipLayout(undefined)
    const frame = window.requestAnimationFrame(() => {
      const felt = texasFeltRef.current
      const board = texasBoardRef.current
      const source = texasSeatRefs.current[visualSeat(chipFlight.seat)]
      if (!felt || !board || !source) return
      const feltRect = felt.getBoundingClientRect()
      const boardRect = board.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      const targetCenterX = boardRect.left + boardRect.width / 2
      const targetCenterY = boardRect.top + boardRect.height / 2
      const sourceCenterX = sourceRect.left + sourceRect.width / 2
      const sourceCenterY = sourceRect.top + sourceRect.height / 2
      setChipLayout({
        token: chipFlight.token,
        targetX: targetCenterX - feltRect.left,
        targetY: targetCenterY - feltRect.top,
        startX: sourceCenterX - targetCenterX,
        startY: sourceCenterY - targetCenterY,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [chipFlight?.token])
  useEffect(() => {
    if (!state?.complete || !state.winners.length) return
    const payoutKey = `${state.handId}:${state.winners.join(',')}:${state.players.map((player) => `${player.id}-${player.payout || 0}`).join(',')}`
    if (payoutKeyRef.current === payoutKey) return
    payoutKeyRef.current = payoutKey
    const winner = state.players.find((player) => player.id === state.winners[0])
    if (!winner) return
    const amount = winner.payout || Math.floor(state.pot / state.winners.length)
    if (amount <= 0) return
    const token = Date.now()
    setPayoutFlight({ playerId: winner.id, seat: winner.seat, amount, token })
    const timer = window.setTimeout(() => setPayoutFlight(undefined), 1_420)
    return () => window.clearTimeout(timer)
  }, [state?.handId, state?.complete, state?.winners, state?.pot, state?.players])
  useLayoutEffect(() => {
    if (!payoutFlight) {
      setPayoutLayout(undefined)
      return
    }
    setPayoutLayout(undefined)
    const frame = window.requestAnimationFrame(() => {
      const felt = texasFeltRef.current
      const board = texasBoardRef.current
      const target = texasSeatRefs.current[visualSeat(payoutFlight.seat)]
      if (!felt || !board || !target) return
      const feltRect = felt.getBoundingClientRect()
      const boardRect = board.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const sourceCenterX = boardRect.left + boardRect.width / 2
      const sourceCenterY = boardRect.top + boardRect.height / 2
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      setPayoutLayout({
        token: payoutFlight.token,
        targetX: targetCenterX - feltRect.left,
        targetY: targetCenterY - feltRect.top,
        startX: sourceCenterX - targetCenterX,
        startY: sourceCenterY - targetCenterY,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [payoutFlight?.token])
  const waitingSeats = table.seats.filter((seat) => seat.pokerMode === 'MULTIPLAYER_WAITING')
  if (!mySeat) return <div className="texas-table-wrap"><PvpTableLobby mode="POKER" table={table} coinBalance={coinBalance} onPlayBot={() => onAction('PLAY_BOT', undefined, 100)} onJoin={(tableId) => onAction('JOIN_TABLE', undefined, 100, tableId)} /></div>

  if (mySeat.pokerMode === 'MULTIPLAYER_WAITING') {
    const isHost = waitingSeats[0]?.sessionId === mySeat.sessionId
    const autoStartSeconds = table.phaseEndsAt > now ? Math.max(1, Math.ceil((table.phaseEndsAt - now) / 1000)) : 0
    return <div className="texas-table-wrap"><div className="texas-felt is-empty texas-lobby"><div className="texas-lobby-head"><div><span className="texas-kicker">MULTIPLAYER CASH TABLE</span><h3>Phòng chờ Texas Hold’em</h3><p>Buy-in đã khóa: 100 Coin/người · blind 5/10 · {waitingSeats.length >= 2 ? `đủ người, bàn tự động bắt đầu sau ${autoStartSeconds || 5}s.` : 'cần ít nhất 2 người để bắt đầu.'}</p></div><strong>{waitingSeats.length}<small>/ 4 GHẾ</small></strong></div><div className="texas-lobby-seats">{[0, 1, 2, 3].map((index) => { const seat = waitingSeats[index]; return <div className={`texas-lobby-seat ${seat ? 'is-filled' : ''}`} key={index}><span>{seat ? seat.displayName.slice(0, 2).toUpperCase() : '—'}</span><div><b>{seat?.displayName || 'Ghế trống'}</b><small>{seat ? (index === 0 ? 'CHỦ BÀN' : 'NGƯỜI CHƠI') : 'Đang chờ người vào'}</small></div></div> })}</div><div className="texas-lobby-actions"><button className="is-secondary" onClick={() => onAction('LEAVE_TABLE')}>RỜI BÀN</button><span className="texas-auto-start">{waitingSeats.length >= 2 ? `TỰ ĐỘNG BẮT ĐẦU · ${autoStartSeconds || 5}S` : 'ĐANG CHỜ NGƯỜI CHƠI'}</span>{isHost && waitingSeats.length < 2 && <span className="texas-host-note">Bạn là chủ bàn</span>}</div></div></div>
  }

  if (!state) return <div className="texas-table-wrap"><div className="texas-felt is-empty"><span className="texas-logo">STU</span><h3>ĐANG NHẬN STATE BÀN</h3><p>Server đang gửi hand state riêng cho bạn…</p></div></div>

  const human = state.players.find((player) => player.id === state.viewerId) || state.players.find((player) => player.id === 'HUMAN')
  const isMultiplayer = state.variant === 'MULTIPLAYER'
  const seconds = state.turnEndsAt > 0 ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000)) : 0
  const nextHandSeconds = isMultiplayer && state.complete && table.phaseEndsAt > now ? Math.max(1, Math.ceil((table.phaseEndsAt - now) / 1000)) : 0
  const botThinking = state.turnStatus === 'BOT_THINKING'
  const humanTurn = state.turnStatus === 'HUMAN_TURN' && state.actingSeat === human?.seat && Boolean(privateState || !isMultiplayer)
  const legal = new Set(state.legalActions)
  const latestActionLine = state.actionLog.find((line) => state.players.some((player) => line.startsWith(`${player.name}:`))) || ''
  const latestActionPlayerId = state.players.find((player) => latestActionLine.startsWith(`${player.name}:`))?.id
  const winnerPlayers = state.players.filter((player) => state.winners.includes(player.id))
  const winningCardCodes = new Set(winnerPlayers.flatMap((player) => player.winningCards || []))
  const totalWinnerPayout = winnerPlayers.reduce((total, player) => total + (player.payout || Math.floor(state.pot / Math.max(1, winnerPlayers.length))), 0)
  const winnerNames = winnerPlayers.map((player) => player.name).join(' · ')
  const potPlayers = state.players.filter((player) => player.totalBet > 0).length
  return <div className="texas-table-wrap">
    <div className="texas-felt" ref={texasFeltRef}>
      <div className={`texas-board ${state.complete && winnerPlayers.length ? 'has-winner is-result' : ''}`} ref={texasBoardRef}><BetPoolMeta total={state.pot} players={potPlayers} className="texas-board-meta" /><span>{state.street} · {isMultiplayer ? 'LIVE NGƯỜI THẬT' : '3 BOT AI'}</span><div>{[0, 1, 2, 3, 4].map((index) => state.community[index] ? <Card code={state.community[index]} className={winningCardCodes.has(state.community[index]) ? 'is-winning-card' : ''} index={index} key={index} /> : <i className="casino-card-slot" key={index} />)}</div><strong>POT {state.pot.toLocaleString()} CHIP</strong><small>BET {state.currentBet} · MIN RAISE {state.minRaise}</small>{state.complete && winnerPlayers.length > 0 && <div className="texas-pot-caption"><span>POT WIN</span><strong>{winnerNames} +{totalWinnerPayout.toLocaleString()} CHIP</strong></div>}</div>
      <div className="texas-board-chip-pile" aria-label="Chip cược trên bàn">{state.players.filter((player) => player.streetBet > 0).map((player, index) => <span className="texas-board-chip" style={{ '--chip-offset': index % 2 ? 3 : 0 } as React.CSSProperties} key={player.id}><i>{player.streetBet.toLocaleString()}</i><small>{player.name}</small></span>)}</div>
      {state.players.map((player) => { const action = texasActionVisual(player.lastAction); const latestAction = latestActionPlayerId === player.id; const isWinner = state.winners.includes(player.id); const resultState = state.complete ? (isWinner ? 'winner' : 'loser') : undefined; const roles = texasSeatRoles(state, player.seat); const playerWinningCards = player.winningCards?.length ? player.winningCards : isWinner ? player.cards : []; const payout = player.payout || (isWinner ? Math.floor(state.pot / Math.max(1, winnerPlayers.length)) : 0); const visualSeatIndex = visualSeat(player.seat); return <section className={`texas-seat seat-${visualSeatIndex} ${state.actingSeat === player.seat ? 'is-acting' : ''} ${player.folded ? 'is-folded' : ''} ${isWinner ? 'is-winner' : ''} ${resultState ? `is-result-${resultState}` : ''}`} ref={(node) => { texasSeatRefs.current[visualSeatIndex] = node }} key={player.id}>
        <header><div className="texas-seat-player-meta">{roles.length > 0 && <div className="texas-seat-role-badges" aria-label={roles.map((role) => role.title).join(', ')}>{roles.map((role) => <span className={`texas-seat-role-marker is-${role.kind}`} title={role.title} key={role.kind}>{role.label}</span>)}</div>}<b>{player.name}</b>{player.isBot && <em>BOT</em>}</div>{player.seat === state.actingSeat && !state.complete && <span className={`texas-seat-turn-timer ${seconds <= 3 ? 'is-urgent' : ''}`} aria-label={`Còn ${seconds} giây để hành động`}><small>LƯỢT</small><b>{seconds.toString().padStart(2, '0')}</b><i>s</i></span>}</header>
        <div className="texas-hole">{player.cards.length ? <Hand cards={player.cards} highlightCards={state.complete && isWinner ? playerWinningCards : []} /> : !player.folded ? <Hand cards={['XX', 'YY']} hideFrom={0} /> : <span>FOLD</span>}</div>
        {state.complete && isWinner && <div className="texas-hand-result"><span>WINNING HAND</span><strong>{player.handRank || 'SHOWDOWN WINNER'}</strong><b>+{payout.toLocaleString()} CHIP</b></div>}
        <footer><strong>{player.stack.toLocaleString()} CHIP</strong><small>{player.seat === state.actingSeat && !state.complete ? botThinking ? 'BOT ĐANG SUY NGHĨ' : 'ĐANG HÀNH ĐỘNG' : player.lastAction || 'WAIT'}</small></footer>
        {action && latestAction && <div key={latestActionLine} className={`texas-action-card texas-action-${action.kind} is-latest`}><strong>{action.label}</strong>{action.amount !== undefined && <span>{action.amountLabel ? `${action.amountLabel} ${action.amount.toLocaleString()}` : `${action.amount.toLocaleString()} CHIP`}</span>}</div>}
      </section>})}
      {chipFlight && chipLayout?.token === chipFlight.token && <div className={`texas-chip-flight from-seat-${chipFlight.seat} is-flying`} style={{ '--chip-target-x': `${chipLayout.targetX}px`, '--chip-target-y': `${chipLayout.targetY}px`, '--chip-start-x': `${chipLayout.startX}px`, '--chip-start-y': `${chipLayout.startY}px` } as React.CSSProperties} key={chipFlight.token}><strong>+{chipFlight.amount.toLocaleString()}</strong><span>CHIP</span></div>}
      {payoutFlight && payoutLayout?.token === payoutFlight.token && <div className={`texas-pot-payout to-seat-${payoutFlight.seat} is-flying`} style={{ '--payout-target-x': `${payoutLayout.targetX}px`, '--payout-target-y': `${payoutLayout.targetY}px`, '--payout-start-x': `${payoutLayout.startX}px`, '--payout-start-y': `${payoutLayout.startY}px` } as React.CSSProperties} key={payoutFlight.token}><strong>+{payoutFlight.amount.toLocaleString()}</strong><span>CHIP</span></div>}
      <div className="texas-log">{state.actionLog.slice(0, 5).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</div>
    </div>
    {!state.complete && <div className="texas-actions">
      <button className="is-fold" disabled={!humanTurn || !legal.has('FOLD')} onClick={() => onAction('FOLD')}>FOLD</button>
      <button disabled={!humanTurn || !legal.has('CHECK')} onClick={() => onAction('CHECK')}>CHECK</button>
      <button className="is-call" disabled={!humanTurn || !legal.has('CALL')} onClick={() => onAction('CALL')}>CALL {state.callAmount || ''}</button>
      <label><span>RAISE TO</span><input type="range" min={state.minRaiseTo} max={Math.max(state.minRaiseTo, state.maxRaiseTo)} value={Math.min(raiseTo, Math.max(state.minRaiseTo, state.maxRaiseTo))} disabled={!humanTurn || !legal.has('RAISE')} onChange={(event) => setRaiseTo(Number(event.target.value))} /><b>{Math.min(raiseTo, state.maxRaiseTo)}</b></label>
      <button disabled={!humanTurn || !legal.has('RAISE')} onClick={() => onAction('RAISE', undefined, Math.min(raiseTo, state.maxRaiseTo))}>RAISE</button>
      <button className="is-allin" disabled={!humanTurn || !legal.has('ALL_IN')} onClick={() => onAction('ALL_IN')}>ALL-IN {human?.stack || ''}</button>
      <button className="is-cashout" onClick={() => onAction('CASH_OUT')}>CASH OUT</button>
    </div>}
    {state.complete && <div className={`texas-result ${human && state.winners.includes(human.id) ? 'is-win' : ''}`}><span>{human && state.winners.includes(human.id) ? '★' : '◆'}</span><div><h3>{state.result}</h3><p>Stack hiện tại: <b>{human?.stack || 0} chip</b> · P/L: <b>{(human?.stack || 0) - (mySeat.stake || 100) >= 0 ? '+' : ''}{(human?.stack || 0) - (mySeat.stake || 100)}</b></p>{winnerPlayers.length > 0 && <div className="texas-result-payout"><span>{winnerNames}</span><strong>+{totalWinnerPayout.toLocaleString()} CHIP</strong><small>{winnerPlayers[0].handRank || 'SHOWDOWN WINNER'} · POT ĐÃ GOM VỀ SEAT THẮNG</small></div>}</div>{isMultiplayer && nextHandSeconds > 0 && <span className="texas-next-hand">HAND MỚI<strong>{nextHandSeconds.toString().padStart(2, '0')}S</strong></span>}{!isMultiplayer && <button disabled={!human?.stack} onClick={() => onAction('NEXT_HAND')}>HAND MỚI</button>}<button className="is-cashout" onClick={() => onAction('CASH_OUT')}>CASH OUT</button></div>}
  </div>
}

function TienLenTable({ table, sessionId, privateState, coinBalance, onAction, onAnimationChange }: { table: CasinoTableSnapshot; sessionId: string; privateState?: TienLenPrivateState; coinBalance: number; onAction: (action: 'PLAY_BOT' | 'JOIN_TABLE' | 'LEAVE_TABLE' | 'START_LOBBY' | 'PLAY' | 'PASS', cards?: string[], tableId?: string) => void; onAnimationChange: (play?: TienLenPlay) => void }) {
  const privateIsCurrent = Boolean(privateState?.players.some((player) => player.id === sessionId))
  const publicState = privateIsCurrent ? privateState : table.tienLenPublic
  const [selected, setSelected] = useState<string[]>([])
  const [settledPlay, setSettledPlay] = useState<TienLenPlay>()
  const [flyingPlay, setFlyingPlay] = useState<{ play: TienLenPlay; sourceSeat: number; token: number }>()
  const [flyingLayout, setFlyingLayout] = useState<{ token: number; targetX: number; targetY: number; startX: number; startY: number }>()
  const [showTableLobby, setShowTableLobby] = useState(false)
  const lastPlayKeyRef = useRef('')
  const tableFeltRef = useRef<HTMLDivElement | null>(null)
  const centerPileRef = useRef<HTMLDivElement | null>(null)
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const joined = Boolean(publicState?.players.some((player) => player.id === sessionId))
  const myPlayer = publicState?.players.find((player) => player.id === sessionId)
  const playKey = privateState?.lastPlay ? `${privateState.gameId}:${privateState.handNumber}:${privateState.lastPlay.playerId}:${privateState.lastPlay.cards.join(',')}` : `${privateState?.gameId || ''}:${privateState?.handNumber || 0}:empty`
  const perspectiveSeat = (seat: number) => relativeTableSeat(seat, myPlayer?.seat ?? 0, 4)
  const playNeedsAnimation = Boolean(privateState?.lastPlay && lastPlayKeyRef.current !== playKey)

  useLayoutEffect(() => {
    if (!flyingPlay) {
      setFlyingLayout(undefined)
      return
    }
    setFlyingLayout(undefined)
    const frame = window.requestAnimationFrame(() => {
      const felt = tableFeltRef.current
      const target = centerPileRef.current
      const source = seatRefs.current[perspectiveSeat(flyingPlay.sourceSeat)]
      if (!felt || !target || !source) return
      const feltRect = felt.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      const sourceCenterX = sourceRect.left + sourceRect.width / 2
      const sourceCenterY = sourceRect.top + sourceRect.height / 2
      setFlyingLayout({
        token: flyingPlay.token,
        targetX: targetCenterX - feltRect.left,
        targetY: targetCenterY - feltRect.top,
        startX: sourceCenterX - targetCenterX,
        startY: sourceCenterY - targetCenterY,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [flyingPlay?.token, myPlayer?.seat])

  useEffect(() => {
    if (!privateState) return
    if (!privateState.lastPlay) {
      lastPlayKeyRef.current = playKey
      onAnimationChange(undefined)
      setSettledPlay(undefined)
      setFlyingPlay(undefined)
      return
    }
    if (lastPlayKeyRef.current === playKey) return
    lastPlayKeyRef.current = playKey
    const sourceSeat = privateState.players.find((player) => player.id === privateState.lastPlay?.playerId)?.seat ?? 0
    const play = privateState.lastPlay
    onAnimationChange(play)
    setFlyingPlay({ play, sourceSeat, token: Date.now() })
    const timer = window.setTimeout(() => {
      onAnimationChange(undefined)
      setSettledPlay(play)
      setFlyingPlay(undefined)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [onAnimationChange, playKey])

  useEffect(() => setSelected([]), [privateState?.gameId, privateState?.hand.join(','), privateState?.currentSeat, privateState?.lastPlay?.cards.join(',')])

  useEffect(() => {
    if (privateState?.playerId === sessionId) setShowTableLobby(false)
  }, [privateState?.playerId, sessionId])

  const toggleCard = (card: string) => {
    if (!isMyTurn) return
    setSelected((current) => current.includes(card) ? current.filter((candidate) => candidate !== card) : [...current, card])
  }

  const leaveTable = () => {
    setSelected([])
    setShowTableLobby(true)
    onAction('LEAVE_TABLE')
  }

  const tableLobby = () => <div className="tien-len-entry is-room-browser"><PvpTableLobby mode="TIEN_LEN" table={table} coinBalance={coinBalance} onPlayBot={() => onAction('PLAY_BOT')} onJoin={(tableId) => onAction('JOIN_TABLE', undefined, tableId)} /></div>

  if (showTableLobby || !publicState || (!joined && (publicState.status === 'WAITING' || publicState.status === 'COMPLETE'))) return tableLobby()

  if (publicState.status === 'WAITING') {
    const isHost = publicState.hostId === sessionId
    const config = PVP_TABLE_CATALOG.TIEN_LEN.find((candidate) => publicState.gameId.includes(candidate.id))
    return <div className="tien-len-lobby"><div className="tien-len-lobby-head"><div><span className="tien-len-kicker">PHÒNG #{config?.roomCode || '—'} · {config?.stakesLabel || 'BÀN TỰ DO'}</span><h3>Ngồi vào bàn Tiến Lên</h3><p>Đọc số phòng để rủ bạn bè. Chủ bàn bắt đầu khi có từ 2 đến 4 người.{config?.buyIn ? ` Pot hiện tại ${config.buyIn * publicState.players.length} Coin.` : ' Bàn này miễn phí.'}</p></div><strong>{publicState.players.length}<small>/ 4 GHẾ</small></strong></div><div className="tien-len-seats">{[0, 1, 2, 3].map((seat) => { const player = publicState.players.find((candidate) => candidate.seat === seat); return <div className={`tien-len-seat ${player ? 'is-filled' : ''}`} key={seat}><span>{player ? (player.isBot ? 'AI' : player.name.slice(0, 2).toUpperCase()) : '—'}</span><div><b>{player?.name || 'Ghế trống'}</b><small>{player ? (player.id === publicState.hostId ? 'CHỦ BÀN' : player.isBot ? 'BOT' : 'NGƯỜI CHƠI') : 'Đang chờ người vào'}</small></div></div> })}</div><div className="tien-len-lobby-notice"><span>{publicState.notice}</span></div><div className="tien-len-lobby-actions"><button className="is-secondary" onClick={leaveTable}>RỜI BÀN</button>{isHost && <button disabled={publicState.players.length < 2} onClick={() => onAction('START_LOBBY')}>{publicState.players.length < 2 ? 'CẦN 2 NGƯỜI' : 'BẮT ĐẦU VÁN →'}</button>}</div></div>
  }

  if (publicState.status === 'COMPLETE' && !flyingPlay && !playNeedsAnimation) {
    const won = publicState.winnerIds.includes(sessionId)
    const resultState = won ? 'winner' : 'loser'
    return <div className={`tien-len-complete is-result-${resultState}`}><div className="tien-len-result-mark">{won ? '★' : '✦'}</div><span className="tien-len-kicker">KẾT QUẢ VÁN #{publicState.handNumber}</span><h3>{publicState.result || 'Ván đã kết thúc'}</h3><p>{publicState.notice}</p><div className="tien-len-result-actions">{publicState.mode === 'BOT' ? <button onClick={() => onAction('PLAY_BOT')}>VÁN MỚI VỚI BOT</button> : <button onClick={() => onAction('JOIN_TABLE')}>VÀO BÀN CHỜ MỚI</button>}<button className="is-secondary" onClick={leaveTable}>RỜI BÀN</button></div></div>
  }

  if (!privateState) return <div className="tien-len-sync"><span>✦</span><h3>Đang nhận tay bài riêng…</h3><p>Kết nối server authoritative của bàn.</p></div>
  const visibleCurrentSeat = flyingPlay?.sourceSeat ?? publicState.currentSeat
  const visibleActingPlayer = publicState.players.find((player) => player.seat === visibleCurrentSeat)
  const isAnimatingPlay = Boolean(flyingPlay)
  const isMyTurn = !isAnimatingPlay && Boolean(privateState.currentSeat === myPlayer?.seat && privateState.legalActions.includes('PLAY'))
  const legalPlay = !isAnimatingPlay && privateState.legalActions.includes('PLAY')
  const legalPass = !isAnimatingPlay && privateState.legalActions.includes('PASS')
  const turnLabel = isAnimatingPlay ? `${visibleActingPlayer?.name || '—'} ĐANG ĐÁNH` : publicState.status !== 'PLAYING' ? 'BÀN ĐANG CHỜ' : isMyTurn ? 'LƯỢT CỦA BẠN' : `LƯỢT ${visibleActingPlayer?.name || '—'}`
  const turnHint = isAnimatingPlay ? 'Bài đang bay vào bàn' : publicState.status !== 'PLAYING' ? 'Sẵn sàng' : isMyTurn ? 'Chọn bộ bài để đánh' : visibleActingPlayer?.isBot ? 'BOT ĐANG SUY NGHĨ' : 'Đang chờ người chơi'
  return <div className="tien-len-game">
    <div className="tien-len-game-head"><div><span className="tien-len-kicker">{privateState.mode === 'BOT' ? 'SOLO TABLE · 3 BOT' : 'MULTIPLAYER TABLE · LIVE'}</span><h3>Tiến Lên Miền Nam <small>Ván #{privateState.handNumber}</small></h3></div><div className={`tien-len-turn-pill ${isMyTurn ? 'is-self' : visibleActingPlayer?.isBot ? 'is-bot' : ''}`}><strong>{turnLabel}</strong><small>{turnHint}</small></div></div>
    <div className="tien-len-table-stage">
      <div className={`tien-len-table-felt ${isAnimatingPlay ? 'is-animating' : ''}`} ref={tableFeltRef}>
        <div className="tien-len-table-brand"><span>TIẾN LÊN</span><small>MIỀN NAM · 4 GÓC BÀN</small></div>
        <div className="tien-len-center-pile" ref={centerPileRef}><span className="tien-len-pile-label">BÀI TRÊN BÀN</span>{settledPlay && !flyingPlay ? <><strong>{settledPlay.playerName} · {settledPlay.combo}</strong><Hand cards={settledPlay.cards} className="tien-len-played-hand" /><small>{publicState.pileCount} lá đã đánh</small></> : <div className="tien-len-empty-pile"><b>{flyingPlay ? 'ĐANG NHẬN BÀI' : privateState.mustPlayThreeSpades ? '3♠ MỞ VÁN' : 'SẴN SÀNG'}</b><small>{flyingPlay ? `${flyingPlay.play.playerName} đang ra bài` : privateState.mustPlayThreeSpades ? 'Bộ đầu tiên phải có 3♠' : 'Chọn bộ bài hợp lệ để đánh'}</small></div>}</div>
        {publicState.players.map((player) => { const position = perspectiveSeat(player.seat); const animatingSource = flyingPlay?.sourceSeat === player.seat; const active = (isAnimatingPlay ? animatingSource : publicState.currentSeat === player.seat) && (publicState.status === 'PLAYING' || isAnimatingPlay); return <div className={`tien-len-seat-corner seat-position-${position} ${active ? 'is-active' : ''} ${animatingSource ? 'is-animating' : ''} ${player.id === sessionId ? 'is-self' : ''} ${player.passed ? 'is-passed' : ''}`} ref={(node) => { seatRefs.current[position] = node }} key={player.id}><div className="tien-len-seat-avatar">{player.isBot ? 'AI' : player.name.slice(0, 2).toUpperCase()}</div><div className="tien-len-seat-copy"><span>{position === 0 ? 'BẠN' : player.isBot ? 'BOT AI' : position === 2 ? 'ĐỐI DIỆN' : 'NGƯỜI CHƠI'}</span><strong>{player.name}</strong><small>{player.finished ? '★ ĐÃ VỀ ĐÍCH' : `${player.cardCount} LÁ`}{player.passed ? ' · BỎ LƯỢT' : ''}</small></div>{active && <em>{animatingSource ? 'BÀI ĐANG BAY' : player.isBot ? 'BOT SUY NGHĨ' : position === 0 ? 'ĐANG ĐÁNH' : 'TỚI LƯỢT'}</em>}</div> })}
        {flyingPlay && flyingLayout?.token === flyingPlay.token && <div className={`tien-len-flying-play from-seat-${perspectiveSeat(flyingPlay.sourceSeat)} is-animating`} style={{ '--fly-target-x': `${flyingLayout.targetX}px`, '--fly-target-y': `${flyingLayout.targetY}px`, '--fly-start-x': `${flyingLayout.startX}px`, '--fly-start-y': `${flyingLayout.startY}px` } as React.CSSProperties} key={flyingPlay.token}><span>{flyingPlay.play.playerName} đánh</span><Hand cards={flyingPlay.play.cards} className="tien-len-flight-hand" /></div>}
      </div>
    </div>
    <div className="tien-len-hand-panel"><div className="tien-len-hand-label"><span>TAY BÀI CỦA {myPlayer?.name || 'BẠN'} · {privateState.hand.length} LÁ</span><small>{privateState.mustPlayThreeSpades ? 'BẮT BUỘC CÓ 3♠' : isMyTurn ? 'CHỌN LÁ RỒI BẤM ĐÁNH' : 'CHỜ LƯỢT'}</small></div><div className="tien-len-hand">{privateState.hand.map((card, index) => <button className={`tien-len-card-button ${selected.includes(card) ? 'is-selected' : ''}`} disabled={!isMyTurn} onClick={() => toggleCard(card)} key={card}><Card code={card} index={index} /></button>)}</div><div className="tien-len-action-bar"><button disabled={!legalPlay || !selected.length} onClick={() => { onAction('PLAY', selected); setSelected([]) }}>ĐÁNH BÀI <small>{selected.length ? `${selected.length} LÁ` : 'CHỌN BÀI'}</small></button><button className="is-secondary" disabled={!legalPass} onClick={() => { onAction('PASS'); setSelected([]) }}>BỎ LƯỢT</button><button className="is-quiet" onClick={leaveTable}>RỜI</button></div></div>
    <div className="tien-len-notice"><span aria-hidden="true">◆</span><span className="tien-len-notice-copy" title={privateState.notice}>{privateState.notice}</span><small>Server kiểm tra toàn bộ bộ bài và lượt chơi</small></div>
  </div>
}

function SicBoTable({ table, wagers, disabled, onBet, registerBetTarget }: { table: CasinoTableSnapshot; wagers: Record<string, number>; disabled: boolean; onBet: (choice: string) => void; registerBetTarget: LiveBetTarget }) {
  const shaking = table.phase === 'SHAKING'
  const hidden = table.phase === 'BETTING' || table.phase === 'BETTING_CLOSED'
  const live = (choice: string) => liveBetSummary(table, choice)
  return <div className="casino-sicbo-layout">
    <div className="casino-dice-dome"><span className={`casino-bowl ${shaking ? 'is-shaking' : ''}`}>SIC<br />BO</span><Dice values={hidden ? [] : table.dice} shaking={shaking} /></div>
    <div className="casino-bet-legend"><span><i className="is-green" /> CỬA XANH</span><span><i className="is-red" /> CỬA ĐỎ</span><small>CHẠM CỬA · CHIP BAY VÀO BÀN</small></div>
    <div className="sicbo-main-grid">{[['SMALL', 'SMALL', '4 — 10', '1:1'], ['ODD', 'ODD', 'LẺ', '1:1'], ['ANY_TRIPLE', 'ANY TRIPLE', 'BỘ BA', '31:1'], ['EVEN', 'EVEN', 'CHẴN', '1:1'], ['BIG', 'BIG', '11 — 17', '1:1']].map(([choice, label, sub, odds]) => { const summary = live(choice); return <BetArea key={choice} choice={choice} label={<>{label}<em>{sub}</em></>} odds={odds} amount={wagers[choice] || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget(choice)} liveTotal={summary.total} livePlayers={summary.players} tone={SICBO_TONES[choice] || 'green'} resultState={casinoBetResultState('SICBO', choice, table)} /> })}</div>
    <div className="sicbo-number-grid">{[1, 2, 3, 4, 5, 6].map((value) => { const choice = `SINGLE_${value}`; const summary = live(choice); return <BetArea key={value} choice={choice} label={<b className="sicbo-face">{value}</b>} odds="1 / 2 / 12" amount={wagers[choice] || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget(choice)} liveTotal={summary.total} livePlayers={summary.players} tone={value % 2 === 0 ? 'green' : 'red'} resultState={casinoBetResultState('SICBO', choice, table)} /> })}</div>
    <div className="sicbo-total-grid">{[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((value) => { const choice = `TOTAL_${value}`; const summary = live(choice); return <BetArea key={value} choice={choice} label={value} odds={({ 4: 62, 5: 31, 6: 18, 7: 12, 8: 8, 9: 7, 10: 6, 11: 6, 12: 7, 13: 8, 14: 12, 15: 18, 16: 31, 17: 62 } as Record<number, number>)[value] + ':1'} amount={wagers[choice] || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget(choice)} liveTotal={summary.total} livePlayers={summary.players} tone={value <= 10 ? 'green' : 'red'} resultState={casinoBetResultState('SICBO', choice, table)} /> })}</div>
  </div>
}

function BauCuaTable({ table, wagers, disabled, onBet, registerBetTarget }: { table: CasinoTableSnapshot; wagers: Record<string, number>; disabled: boolean; onBet: (choice: string) => void; registerBetTarget: LiveBetTarget }) {
  const shaking = table.phase === 'SHAKING'
  const hidden = table.phase === 'BETTING' || table.phase === 'BETTING_CLOSED'
  const live = (choice: string) => liveBetSummary(table, choice)
  return <div className="casino-baucua-layout">
    <div className="casino-bet-legend"><span><i className="is-green" /> LINH VẬT XANH</span><span><i className="is-red" /> LINH VẬT ĐỎ</span><small>CHẠM LINH VẬT · CHIP BAY VÀO TỤ</small></div>
    <div className="baucua-dish"><span className={`baucua-bowl ${shaking ? 'is-shaking' : ''}`}>LỘC<br />XUÂN</span><Dice values={hidden ? [] : table.dice} shaking={shaking} bauCua /></div>
    <div className="baucua-grid">{Object.entries(BAU_FACES).map(([choice, face]) => { const summary = live(choice); return <BetArea key={choice} choice={choice} label={<><b>{face.icon}</b><em>{face.name}</em></>} odds="1 : 1 mỗi mặt" amount={wagers[choice] || 0} disabled={disabled} onBet={onBet} areaRef={registerBetTarget(choice)} liveTotal={summary.total} livePlayers={summary.players} tone={BAU_CUA_TONES[choice] || 'green'} resultState={casinoBetResultState('BAU_CUA', choice, table)} /> })}</div>
  </div>
}

function DiceDuelTable({ table, mySeat, disabled, onBet }: { table: CasinoTableSnapshot; mySeat?: CasinoTableSnapshot['seats'][number]; disabled: boolean; onBet: (choice: string) => void }) {
  const shaking = table.phase === 'SHAKING'
  const reveal = table.phase === 'RESULT'
  const live = liveBetSummary(table, 'MAIN')
  const playerResult = reveal ? table.outcome === 'PLAYER' ? 'winner' : table.outcome === 'TIE' ? 'push' : 'loser' : undefined
  const houseResult = reveal ? table.outcome === 'HOUSE' ? 'winner' : table.outcome === 'TIE' ? 'push' : 'loser' : undefined
  return <div className="casino-duel-layout"><section className={playerResult ? `is-result-${playerResult}` : ''}><span>PLAYER</span><i className={`casino-duel-die ${shaking ? 'is-rolling' : ''}`}>{reveal ? table.dice[0] : '?'}</i></section><div className="casino-duel-center"><b>VS</b><BetArea choice="MAIN" label="ROLL BET" odds="WIN 1.8×" amount={mySeat?.wagers.MAIN || 0} disabled={disabled} onBet={onBet} liveTotal={live.total} livePlayers={live.players} tone="green" resultState={casinoBetResultState('DICE_DUEL', 'MAIN', table)} /></div><section className={houseResult ? `is-result-${houseResult}` : ''}><span>HOUSE</span><i className={`casino-duel-die is-house ${shaking ? 'is-rolling' : ''}`}>{reveal ? table.dice[1] : '?'}</i></section></div>
}

function LuckyDrawTable({ table, mySeat, disabled, onBet }: { table: CasinoTableSnapshot; mySeat?: CasinoTableSnapshot['seats'][number]; disabled: boolean; onBet: (choice: string) => void }) {
  const spinning = table.phase === 'SHAKING'
  const icons: Record<string, string> = { STAR: '★', GEM: '◆', COIN: '●', CHERRY: '♣' }
  const live = liveBetSummary(table, 'DRAW')
  const resultState = casinoBetResultState('LUCKY_DRAW', 'DRAW', table)
  return <div className="casino-lucky-layout"><div className={`casino-reel-machine ${resultState ? `is-result-${resultState}` : ''}`}><header>PIXEL PRIZE</header><div className={`casino-reels ${spinning ? 'is-spinning' : ''}`}>{[0, 1, 2].map((index) => <i key={index}>{spinning ? '✦' : icons[table.dice[index]] || '?'}</i>)}</div><strong>{table.phase === 'RESULT' ? table.outcome : 'JACKPOT x5'}</strong></div><BetArea choice="DRAW" label="SPIN" odds="x0 · x1 · x2 · x5" amount={mySeat?.wagers.DRAW || 0} disabled={disabled} onBet={onBet} liveTotal={live.total} livePlayers={live.players} tone="red" resultState={resultState} /></div>
}
