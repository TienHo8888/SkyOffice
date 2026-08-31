import { CasinoGameMode } from '../../types/Casino'

export const CARD_SUITS = ['S', 'H', 'D', 'C'] as const
export const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

export interface BlackjackScore {
  total: number
  soft: boolean
  blackjack: boolean
  bust: boolean
}

export interface PokerScore {
  category: number
  label: string
  kickers: number[]
}

export interface BaccaratResult {
  playerCards: string[]
  bankerCards: string[]
  playerTotal: number
  bankerTotal: number
  outcome: 'PLAYER' | 'BANKER' | 'TIE'
  natural: boolean
}

export function createShoe(decks = 6): string[] {
  const cards: string[] = []
  for (let deck = 0; deck < decks; deck += 1) {
    CARD_SUITS.forEach((suit) => CARD_RANKS.forEach((rank) => cards.push(`${rank}${suit}`)))
  }
  return cards
}

export function shuffleCards(cards: string[], random: () => number = Math.random): string[] {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = value
  }
  return shuffled
}

export function cardRank(card: string): string {
  return card.slice(0, -1)
}

export function cardRankValue(card: string): number {
  const rank = cardRank(card)
  if (rank === 'A') return 14
  if (rank === 'K') return 13
  if (rank === 'Q') return 12
  if (rank === 'J') return 11
  return Number(rank)
}

export function baccaratCardValue(card: string): number {
  const rank = cardRank(card)
  if (rank === 'A') return 1
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0
  return Number(rank)
}

export function baccaratTotal(cards: string[]): number {
  return cards.reduce((total, card) => total + baccaratCardValue(card), 0) % 10
}

export function dealBaccarat(draw: () => string): BaccaratResult {
  const playerCards = [draw()]
  const bankerCards = [draw()]
  playerCards.push(draw())
  bankerCards.push(draw())
  let playerTotal = baccaratTotal(playerCards)
  let bankerTotal = baccaratTotal(bankerCards)
  const natural = playerTotal >= 8 || bankerTotal >= 8

  if (!natural) {
    let playerThirdValue: number | undefined
    if (playerTotal <= 5) {
      const third = draw()
      playerCards.push(third)
      playerThirdValue = baccaratCardValue(third)
      playerTotal = baccaratTotal(playerCards)
    }

    const bankerDraws = playerThirdValue === undefined
      ? bankerTotal <= 5
      : bankerTotal <= 2
        || (bankerTotal === 3 && playerThirdValue !== 8)
        || (bankerTotal === 4 && playerThirdValue >= 2 && playerThirdValue <= 7)
        || (bankerTotal === 5 && playerThirdValue >= 4 && playerThirdValue <= 7)
        || (bankerTotal === 6 && playerThirdValue >= 6 && playerThirdValue <= 7)
    if (bankerDraws) {
      bankerCards.push(draw())
      bankerTotal = baccaratTotal(bankerCards)
    }
  }

  return {
    playerCards,
    bankerCards,
    playerTotal,
    bankerTotal,
    outcome: playerTotal === bankerTotal ? 'TIE' : playerTotal > bankerTotal ? 'PLAYER' : 'BANKER',
    natural,
  }
}

export function scoreBlackjack(cards: string[]): BlackjackScore {
  let total = 0
  let aces = 0
  cards.forEach((card) => {
    const rank = cardRank(card)
    if (rank === 'A') {
      aces += 1
      total += 11
    } else if (rank === 'K' || rank === 'Q' || rank === 'J') total += 10
    else total += Number(rank)
  })
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return { total, soft: aces > 0, blackjack: cards.length === 2 && total === 21, bust: total > 21 }
}

function straightHigh(values: number[]): number {
  const unique = [...new Set(values)].sort((left, right) => right - left)
  if (unique.includes(14)) unique.push(1)
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) return unique[index]
  }
  return 0
}

function compareNumberArrays(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0)
  }
  return 0
}

export function scorePoker(cards: string[]): PokerScore {
  const values = cards.map(cardRankValue)
  const counts = new Map<number, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])
  const suits = new Map<string, number[]>()
  cards.forEach((card) => {
    const suit = card.slice(-1)
    const suitValues = suits.get(suit) || []
    suitValues.push(cardRankValue(card))
    suits.set(suit, suitValues)
  })
  const flushValues = [...suits.values()].find((candidate) => candidate.length >= 5)
  const flushStraightHigh = flushValues ? straightHigh(flushValues) : 0
  if (flushStraightHigh) return { category: 8, label: flushStraightHigh === 14 ? 'Royal Flush' : 'Straight Flush', kickers: [flushStraightHigh] }
  if (groups[0]?.[1] === 4) return { category: 7, label: 'Four of a Kind', kickers: [groups[0][0], ...values.filter((value) => value !== groups[0][0]).sort((a, b) => b - a).slice(0, 1)] }
  const trips = groups.filter((group) => group[1] >= 3)
  const pairs = groups.filter((group) => group[1] >= 2)
  if (trips.length && pairs.some((group) => group[0] !== trips[0][0])) {
    const pair = pairs.find((group) => group[0] !== trips[0][0])!
    return { category: 6, label: 'Full House', kickers: [trips[0][0], pair[0]] }
  }
  if (flushValues) return { category: 5, label: 'Flush', kickers: [...flushValues].sort((a, b) => b - a).slice(0, 5) }
  const highStraight = straightHigh(values)
  if (highStraight) return { category: 4, label: 'Straight', kickers: [highStraight] }
  if (trips.length) return { category: 3, label: 'Three of a Kind', kickers: [trips[0][0], ...values.filter((value) => value !== trips[0][0]).sort((a, b) => b - a).slice(0, 2)] }
  if (pairs.length >= 2) {
    const pairValues = pairs.map((group) => group[0]).sort((a, b) => b - a).slice(0, 2)
    const kicker = values.filter((value) => !pairValues.includes(value)).sort((a, b) => b - a)[0]
    return { category: 2, label: 'Two Pair', kickers: [...pairValues, kicker] }
  }
  if (pairs.length === 1) return { category: 1, label: 'Pair', kickers: [pairs[0][0], ...values.filter((value) => value !== pairs[0][0]).sort((a, b) => b - a).slice(0, 3)] }
  return { category: 0, label: 'High Card', kickers: [...values].sort((a, b) => b - a).slice(0, 5) }
}

function selectPokerCards(cards: string[], values: number[], suit?: string): string[] {
  const selected: string[] = []
  const available = [...cards]
  values.forEach((value) => {
    const index = available.findIndex((card) => cardRankValue(card) === value && (!suit || card.slice(-1) === suit))
    if (index >= 0) selected.push(available.splice(index, 1)[0])
  })
  return selected
}

function straightValues(high: number): number[] {
  return high === 5 ? [5, 4, 3, 2, 14] : [high, high - 1, high - 2, high - 3, high - 4]
}

/** Returns the exact five cards represented by scorePoker for showdown highlighting. */
export function pokerWinningCards(cards: string[]): string[] {
  const score = scorePoker(cards)
  const values = cards.map(cardRankValue)
  const groups = [...new Map(values.map((value) => [value, values.filter((candidate) => candidate === value).length])).entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])
  const suits = [...new Set(cards.map((card) => card.slice(-1)))]
  const flushSuit = suits.find((suit) => cards.filter((card) => card.slice(-1) === suit).length >= 5)

  if (score.category === 8 && flushSuit) return selectPokerCards(cards, straightValues(score.kickers[0]), flushSuit)
  if (score.category === 7) return selectPokerCards(cards, [groups[0][0], groups[0][0], groups[0][0], groups[0][0], ...values.filter((value) => value !== groups[0][0]).sort((left, right) => right - left).slice(0, 1)])
  if (score.category === 6) {
    const trips = groups.find((group) => group[1] >= 3)?.[0]
    const pair = groups.find((group) => group[0] !== trips && group[1] >= 2)?.[0]
    if (trips && pair) return selectPokerCards(cards, [trips, trips, trips, pair, pair])
  }
  if (score.category === 5 && flushSuit) return selectPokerCards(cards, cards.filter((card) => card.slice(-1) === flushSuit).map(cardRankValue).sort((left, right) => right - left).slice(0, 5), flushSuit)
  if (score.category === 4) return selectPokerCards(cards, straightValues(score.kickers[0]))
  if (score.category === 3) return selectPokerCards(cards, [score.kickers[0], score.kickers[0], score.kickers[0], ...score.kickers.slice(1, 3)])
  if (score.category === 2) return selectPokerCards(cards, [score.kickers[0], score.kickers[0], score.kickers[1], score.kickers[1], score.kickers[2]])
  if (score.category === 1) return selectPokerCards(cards, [score.kickers[0], score.kickers[0], ...score.kickers.slice(1, 4)])
  return selectPokerCards(cards, score.kickers.slice(0, 5))
}

export function comparePoker(left: PokerScore, right: PokerScore): number {
  if (left.category !== right.category) return left.category - right.category
  return compareNumberArrays(left.kickers, right.kickers)
}

export function dealerQualifiesCasinoHoldem(score: PokerScore): boolean {
  return score.category > 1 || (score.category === 1 && score.kickers[0] >= 4)
}

export function casinoHoldemAnteProfit(score: PokerScore): number {
  if (score.category === 8) return score.kickers[0] === 14 ? 100 : 20
  if (score.category === 7) return 10
  if (score.category === 6) return 3
  if (score.category === 5) return 2
  return 1
}

const SICBO_TOTAL_PROFIT: Record<number, number> = { 4: 62, 5: 31, 6: 18, 7: 12, 8: 8, 9: 7, 10: 6, 11: 6, 12: 7, 13: 8, 14: 12, 15: 18, 16: 31, 17: 62 }

export function sicBoProfit(choice: string, dice: number[]): number {
  const total = dice.reduce((sum, value) => sum + value, 0)
  const triple = dice[0] === dice[1] && dice[1] === dice[2]
  if (choice === 'SMALL') return !triple && total >= 4 && total <= 10 ? 1 : -1
  if (choice === 'BIG') return !triple && total >= 11 && total <= 17 ? 1 : -1
  if (choice === 'ODD') return !triple && total % 2 === 1 ? 1 : -1
  if (choice === 'EVEN') return !triple && total % 2 === 0 ? 1 : -1
  if (choice === 'ANY_TRIPLE') return triple ? 31 : -1
  if (choice.startsWith('TRIPLE_')) return triple && dice[0] === Number(choice.slice(7)) ? 180 : -1
  if (choice.startsWith('DOUBLE_')) return dice.filter((value) => value === Number(choice.slice(7))).length >= 2 ? 11 : -1
  if (choice.startsWith('TOTAL_')) return total === Number(choice.slice(6)) ? (SICBO_TOTAL_PROFIT[total] || -1) : -1
  if (choice.startsWith('SINGLE_')) {
    const matches = dice.filter((value) => value === Number(choice.slice(7))).length
    return matches === 3 ? 12 : matches
  }
  return -1
}

export function bauCuaProfit(choice: string, dice: string[]): number {
  return dice.filter((face) => face === choice).length || -1
}

export function isCasinoMode(mode: string): mode is CasinoGameMode {
  return ['BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'TIEN_LEN', 'DICE_DUEL', 'LUCKY_DRAW'].includes(mode)
}

export function gameDisplayName(mode: CasinoGameMode): string {
  const names: Record<CasinoGameMode, string> = { BACCARAT: 'Baccarat', BLACKJACK: 'Blackjack', POKER: "Texas Hold'em", SICBO: 'Sic Bo', BAU_CUA: 'Bầu Cua', CHESS: 'Chess Arena', TIEN_LEN: 'Tiến Lên Miền Nam', DICE_DUEL: 'Dice Duel', LUCKY_DRAW: 'Lucky Draw' }
  return names[mode]
}
