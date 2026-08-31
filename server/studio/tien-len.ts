import { createShoe, shuffleCards } from './casino-rules'
import {
  TienLenCombo,
  TienLenGameState,
  TienLenMode,
  TienLenPlay,
  TienLenPlayer,
  TienLenPrivateState,
  TienLenPublicState,
} from '../../types/TienLen'

const SUIT_ORDER: Record<string, number> = { S: 0, C: 1, D: 2, H: 3 }
const COMBO_ORDER: Record<TienLenCombo, number> = {
  SINGLE: 0,
  PAIR: 1,
  TRIPLE: 2,
  STRAIGHT: 3,
  THREE_PAIRS: 4,
  FOUR_KIND: 5,
  FOUR_PAIRS: 6,
}

export class TienLenRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TienLenRuleError'
  }
}

function rankValue(card: string): number {
  const rank = card.slice(0, -1)
  if (rank === '2') return 15
  if (rank === 'A') return 14
  if (rank === 'K') return 13
  if (rank === 'Q') return 12
  if (rank === 'J') return 11
  return Number(rank)
}

function suitValue(card: string): number {
  return SUIT_ORDER[card.slice(-1)] ?? -1
}

function cardSort(left: string, right: string): number {
  return rankValue(left) - rankValue(right) || suitValue(left) - suitValue(right)
}

function isValidCard(card: string): boolean {
  return /^(10|[2-9JQKA])[SHDC]$/.test(card)
}

function isConsecutive(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1)
}

function classifyCards(cards: string[]): { combo: TienLenCombo; highRank: number; highSuit: number } | undefined {
  if (!cards.length || cards.some((card) => !isValidCard(card))) return undefined
  const sorted = [...cards].sort(cardSort)
  if (new Set(sorted).size !== sorted.length) return undefined
  const values = sorted.map(rankValue)
  const counts = new Map<number, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  const uniqueValues = [...counts.keys()].sort((left, right) => left - right)
  const highRank = values[values.length - 1]
  const highSuit = Math.max(...sorted.map(suitValue))

  if (sorted.length === 1) return { combo: 'SINGLE', highRank, highSuit }
  if (sorted.length === 2 && counts.size === 1) return { combo: 'PAIR', highRank, highSuit }
  if (sorted.length === 3 && counts.size === 1) return { combo: 'TRIPLE', highRank, highSuit }
  if (sorted.length === 4 && counts.size === 1) return { combo: 'FOUR_KIND', highRank, highSuit }
  if (sorted.length >= 3 && counts.size === sorted.length && !values.includes(15) && isConsecutive(uniqueValues)) {
    return { combo: 'STRAIGHT', highRank, highSuit }
  }
  if ((sorted.length === 6 || sorted.length === 8) && counts.size === sorted.length / 2 && !values.includes(15)) {
    const pairValues = [...counts.entries()].filter(([, count]) => count === 2).map(([value]) => value).sort((left, right) => left - right)
    if (pairValues.length === sorted.length / 2 && isConsecutive(pairValues)) {
      return { combo: sorted.length === 6 ? 'THREE_PAIRS' : 'FOUR_PAIRS', highRank: pairValues[pairValues.length - 1], highSuit }
    }
  }
  return undefined
}

export function classifyTienLen(cards: string[]): TienLenCombo | undefined {
  return classifyCards(cards)?.combo
}

function specialBeats(candidate: TienLenPlay, target: TienLenPlay): boolean {
  const targetIsSingleTwo = target.combo === 'SINGLE' && target.highRank === 15
  const targetIsPairTwo = target.combo === 'PAIR' && target.highRank === 15
  if (candidate.combo === 'THREE_PAIRS') return targetIsSingleTwo
  if (candidate.combo === 'FOUR_KIND') return targetIsSingleTwo || target.combo === 'THREE_PAIRS'
  if (candidate.combo === 'FOUR_PAIRS') return targetIsSingleTwo || targetIsPairTwo || target.combo === 'THREE_PAIRS' || target.combo === 'FOUR_KIND'
  return false
}

export function canBeatTienLen(candidate: TienLenPlay, target: TienLenPlay): boolean {
  if (specialBeats(candidate, target)) return true
  if (candidate.combo !== target.combo || candidate.cards.length !== target.cards.length) return false
  if (candidate.highRank !== target.highRank) return candidate.highRank > target.highRank
  return candidate.highSuit > target.highSuit
}

export function comboLabel(combo: TienLenCombo): string {
  return ({ SINGLE: 'một', PAIR: 'đôi', TRIPLE: 'ba', STRAIGHT: 'sảnh', THREE_PAIRS: 'ba đôi thông', FOUR_KIND: 'tứ quý', FOUR_PAIRS: 'tứ đôi thông' } as Record<TienLenCombo, string>)[combo]
}

function copyPlayer(player: TienLenPlayer): TienLenPlayer {
  return { ...player, cards: [...player.cards] }
}

export function createTienLenGame(gameId: string, mode: TienLenMode, players: Array<{ id: string; name: string; isBot?: boolean }>): TienLenGameState {
  return {
    gameId,
    mode,
    status: 'WAITING',
    hostId: players[0]?.id || '',
    handNumber: 0,
    players: players.slice(0, 4).map((player, seat) => ({ id: player.id, name: player.name, seat, isBot: Boolean(player.isBot), cards: [], connected: true, passed: false, finished: false })),
    currentSeat: 0,
    leadSeat: 0,
    pileCount: 0,
    notice: 'Chờ người chơi sẵn sàng.',
    result: '',
    winnerIds: [],
    openingRequired: true,
    lastPlayerSeat: 0,
    passCount: 0,
    deck: [],
  }
}

export function addTienLenPlayer(game: TienLenGameState, player: { id: string; name: string }): TienLenPlayer {
  if (game.status !== 'WAITING') throw new TienLenRuleError('Ván đã bắt đầu, không thể vào bàn.')
  if (game.players.some((candidate) => candidate.id === player.id)) return game.players.find((candidate) => candidate.id === player.id)!
  if (game.players.length >= 4) throw new TienLenRuleError('Bàn Tiến Lên đã đủ 4 người.')
  const seat: TienLenPlayer = { id: player.id, name: player.name, seat: game.players.length, isBot: false, cards: [], connected: true, passed: false, finished: false }
  game.players.push(seat)
  if (!game.hostId) game.hostId = seat.id
  return seat
}

export function startTienLenGame(game: TienLenGameState, random: () => number = Math.random): TienLenGameState {
  if (game.players.length < 2) throw new TienLenRuleError('Cần ít nhất 2 người để bắt đầu bàn.')
  if (game.players.length > 4) throw new TienLenRuleError('Bàn Tiến Lên tối đa 4 người.')
  game.status = 'PLAYING'
  game.handNumber += 1
  game.deck = shuffleCards(createShoe(1), random)
  game.lastPlay = undefined
  game.lastPlayerSeat = 0
  game.leadSeat = 0
  game.currentSeat = 0
  game.pileCount = 0
  game.passCount = 0
  game.openingRequired = true
  game.result = ''
  game.winnerIds = []
  game.players.forEach((player) => {
    player.cards = []
    player.passed = false
    player.finished = false
    player.finishRank = undefined
  })
  const dealCount = game.players.length * 13
  const threeSpadesIndex = game.deck.indexOf('3S')
  if (threeSpadesIndex >= dealCount) {
    const holderSeat = Math.floor(random() * game.players.length)
    const replacement = game.deck[holderSeat]
    game.deck[holderSeat] = '3S'
    game.deck[threeSpadesIndex] = replacement
  }
  for (let cardIndex = 0; cardIndex < dealCount; cardIndex += 1) {
    game.players[cardIndex % game.players.length].cards.push(game.deck[cardIndex])
  }
  game.players.forEach((player) => player.cards.sort(cardSort))
  const opener = game.players.find((player) => player.cards.includes('3S'))
  if (!opener) throw new TienLenRuleError('Không thể xác định người giữ 3♠.')
  game.currentSeat = opener.seat
  game.leadSeat = opener.seat
  game.lastPlayerSeat = opener.seat
  game.notice = `${opener.name} giữ 3♠ và được đi trước.`
  return game
}

function playerFor(game: TienLenGameState, playerId: string): TienLenPlayer {
  const player = game.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new TienLenRuleError('Bạn không có trong bàn Tiến Lên.')
  return player
}

function currentPlayer(game: TienLenGameState): TienLenPlayer {
  const player = game.players.find((candidate) => candidate.seat === game.currentSeat)
  if (!player) throw new TienLenRuleError('Không xác định được lượt hiện tại.')
  return player
}

function assertTurn(game: TienLenGameState, playerId: string): TienLenPlayer {
  if (game.status !== 'PLAYING') throw new TienLenRuleError('Ván chưa bắt đầu hoặc đã kết thúc.')
  const player = playerFor(game, playerId)
  if (player.seat !== game.currentSeat) throw new TienLenRuleError('Chưa tới lượt của bạn.')
  if (player.passed) throw new TienLenRuleError('Bạn đã bỏ lượt trong vòng này.')
  return player
}

function makePlay(player: TienLenPlayer, cards: string[]): TienLenPlay {
  const details = classifyCards(cards)
  if (!details) throw new TienLenRuleError('Bộ bài không hợp lệ theo luật Tiến Lên Miền Nam.')
  return { playerId: player.id, playerName: player.name, cards: [...cards].sort(cardSort), ...details }
}

function includesAll(hand: string[], cards: string[]): boolean {
  const available = new Set(hand)
  return cards.every((card) => available.has(card)) && new Set(cards).size === cards.length
}

function findNextAvailable(game: TienLenGameState, afterSeat: number, excludeId?: string): TienLenPlayer | undefined {
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const candidate = game.players[(afterSeat + offset) % game.players.length]
    if (candidate.id !== excludeId && candidate.seat !== game.lastPlayerSeat && candidate.cards.length > 0 && !candidate.finished && !candidate.passed) return candidate
  }
  return undefined
}

function resetTrick(game: TienLenGameState, leaderSeat: number) {
  game.lastPlay = undefined
  game.pileCount = 0
  game.passCount = 0
  game.leadSeat = leaderSeat
  game.currentSeat = leaderSeat
  game.players.forEach((player) => { if (!player.finished) player.passed = false })
  game.notice = `${game.players.find((player) => player.seat === leaderSeat)?.name || 'Người chơi'} mở vòng mới.`
}

export function playTienLen(game: TienLenGameState, playerId: string, cards: string[]): TienLenPlay {
  const player = assertTurn(game, playerId)
  if (!cards?.length || !includesAll(player.cards, cards)) throw new TienLenRuleError('Hãy chọn các lá bài đang có trong tay.')
  const play = makePlay(player, cards)
  if (game.openingRequired && !play.cards.includes('3S')) throw new TienLenRuleError('Ván đầu tiên phải đánh bộ có 3♠.')
  if (game.lastPlay && !canBeatTienLen(play, game.lastPlay)) throw new TienLenRuleError(`Bộ ${comboLabel(play.combo)} này chưa chặt được lượt trước.`)
  player.cards = player.cards.filter((card) => !play.cards.includes(card))
  game.lastPlay = play
  game.lastPlayerSeat = player.seat
  game.openingRequired = false
  game.passCount = 0
  game.pileCount += play.cards.length
  game.notice = `${player.name} đánh ${comboLabel(play.combo)} ${play.cards.join(' ')}.`
  if (!player.cards.length) {
    player.finished = true
    player.finishRank = 1
    game.status = 'COMPLETE'
    game.winnerIds = [player.id]
    game.result = `${player.name} thắng · đã hết bài!`
    return play
  }
  const next = findNextAvailable(game, player.seat, player.id)
  if (next) game.currentSeat = next.seat
  else resetTrick(game, player.seat)
  return play
}

export function passTienLen(game: TienLenGameState, playerId: string) {
  const player = assertTurn(game, playerId)
  if (!game.lastPlay) throw new TienLenRuleError('Bạn đang mở vòng, không thể bỏ lượt.')
  player.passed = true
  game.passCount += 1
  game.notice = `${player.name} bỏ lượt.`
  const next = findNextAvailable(game, player.seat, player.id)
  if (next) game.currentSeat = next.seat
  else resetTrick(game, game.lastPlayerSeat)
}

function combinations(cards: string[]): string[][] {
  const result: string[][] = []
  const total = 1 << cards.length
  for (let mask = 1; mask < total; mask += 1) {
    const selected: string[] = []
    for (let index = 0; index < cards.length; index += 1) if (mask & (1 << index)) selected.push(cards[index])
    result.push(selected)
  }
  return result
}

export function legalTienLenPlays(game: TienLenGameState, playerId: string): TienLenPlay[] {
  if (game.status !== 'PLAYING') return []
  const player = playerFor(game, playerId)
  if (player.seat !== game.currentSeat || player.passed) return []
  const target = game.lastPlay
  return combinations(player.cards).map((cards) => {
    const play = classifyCards(cards)
    if (!play) return undefined
    const candidate: TienLenPlay = { playerId: player.id, playerName: player.name, cards: [...cards].sort(cardSort), ...play }
    if (game.openingRequired && !candidate.cards.includes('3S')) return undefined
    if (target && !canBeatTienLen(candidate, target)) return undefined
    return candidate
  }).filter((play): play is TienLenPlay => Boolean(play))
}

function botScore(play: TienLenPlay): number {
  const special = play.combo === 'THREE_PAIRS' || play.combo === 'FOUR_KIND' || play.combo === 'FOUR_PAIRS'
  return (special ? 100000 : COMBO_ORDER[play.combo] * 10000) + play.highRank * 100 + play.highSuit * 10 + play.cards.length
}

export function chooseTienLenBotPlay(game: TienLenGameState, playerId: string): TienLenPlay | undefined {
  return legalTienLenPlays(game, playerId).sort((left, right) => botScore(left) - botScore(right))[0]
}

export function runTienLenBots(game: TienLenGameState, maxActions = 80): number {
  let actions = 0
  while (game.status === 'PLAYING' && actions < maxActions) {
    const player = currentPlayer(game)
    if (!player.isBot) break
    const play = chooseTienLenBotPlay(game, player.id)
    if (play) playTienLen(game, player.id, play.cards)
    else if (game.lastPlay) passTienLen(game, player.id)
    else throw new TienLenRuleError('Bot không tìm được nước mở hợp lệ.')
    actions += 1
  }
  return actions
}

export function publicTienLenState(game: TienLenGameState): TienLenPublicState {
  return {
    gameId: game.gameId,
    mode: game.mode,
    status: game.status,
    hostId: game.hostId,
    handNumber: game.handNumber,
    players: game.players.map((player) => ({ id: player.id, name: player.name, seat: player.seat, isBot: player.isBot, cardCount: player.cards.length, connected: player.connected, passed: player.passed, finished: player.finished, finishRank: player.finishRank })),
    currentSeat: game.currentSeat,
    leadSeat: game.leadSeat,
    lastPlay: game.lastPlay ? { ...game.lastPlay, cards: [...game.lastPlay.cards] } : undefined,
    pileCount: game.pileCount,
    notice: game.notice,
    result: game.result,
    winnerIds: [...game.winnerIds],
  }
}

export function privateTienLenState(game: TienLenGameState, playerId: string): TienLenPrivateState {
  const player = playerFor(game, playerId)
  const publicState = publicTienLenState(game)
  const current = player.seat === game.currentSeat && game.status === 'PLAYING' && !player.passed
  return {
    ...publicState,
    playerId,
    hand: [...player.cards].sort(cardSort),
    legalActions: current ? ['PLAY', ...(game.lastPlay ? ['PASS' as const] : [])] : [],
    mustPlayThreeSpades: current && game.openingRequired,
  }
}

export function cloneTienLenGame(game: TienLenGameState): TienLenGameState {
  return { ...game, players: game.players.map(copyPlayer), deck: [...game.deck], lastPlay: game.lastPlay ? { ...game.lastPlay, cards: [...game.lastPlay.cards] } : undefined, winnerIds: [...game.winnerIds] }
}
