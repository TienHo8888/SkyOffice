import { TexasAction, TexasGameVariant, TexasHoldemPublicState, TexasHoldemState, TexasPlayerState, TexasStreet } from '../../types/TexasHoldem'
import { comparePoker, createShoe, pokerWinningCards, scorePoker, shuffleCards } from './casino-rules'

export const TEXAS_BUY_IN = 100
export const TEXAS_SMALL_BLIND = 5
export const TEXAS_BIG_BLIND = 10
export const TEXAS_HUMAN_TURN_MS = 15_000
export const TEXAS_BOT_THINK_MIN_MS = 1_100
export const TEXAS_BOT_THINK_MAX_MS = 2_800

const BOT_PROFILES = [
  { id: 'BOT_NOVA', name: 'Nova', aggression: 0.68 },
  { id: 'BOT_RIVER', name: 'River', aggression: 0.48 },
  { id: 'BOT_ACE', name: 'Ace', aggression: 0.78 },
] as const

function nextSeat(players: TexasPlayerState[], fromSeat: number, predicate: (player: TexasPlayerState) => boolean): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const seat = (fromSeat + offset) % players.length
    const player = players.find((candidate) => candidate.seat === seat)
    if (player && predicate(player)) return seat
  }
  return -1
}

function commitChips(player: TexasPlayerState, amount: number) {
  const committed = Math.max(0, Math.min(player.stack, Math.floor(amount)))
  player.stack -= committed
  player.streetBet += committed
  player.totalBet += committed
  player.allIn = player.stack === 0
  return committed
}

function addLog(state: TexasHoldemState, message: string) {
  state.actionLog.unshift(message)
  state.actionLog = state.actionLog.slice(0, 18)
}

function activePlayers(state: TexasHoldemState) {
  return state.players.filter((player) => !player.folded)
}

function actionablePlayers(state: TexasHoldemState) {
  return activePlayers(state).filter((player) => !player.allIn)
}

function roundComplete(state: TexasHoldemState) {
  const actionable = actionablePlayers(state)
  if (actionable.length === 0) return true
  return actionable.every((player) => player.acted && player.streetBet === state.currentBet)
}

function findNextActor(state: TexasHoldemState, fromSeat: number): number {
  return nextSeat(state.players, fromSeat, (player) => !player.folded && !player.allIn && (!player.acted || player.streetBet < state.currentBet))
}

function dealCommunity(state: TexasHoldemState, count: number) {
  for (let index = 0; index < count; index += 1) state.community.push(state.deck.pop()!)
}

function comparePlayerHands(left: TexasPlayerState, right: TexasPlayerState, community: string[]) {
  return comparePoker(scorePoker([...left.cards, ...community]), scorePoker([...right.cards, ...community]))
}

function awardUncontested(state: TexasHoldemState) {
  const winner = activePlayers(state)[0]
  const pot = state.players.reduce((total, player) => total + player.totalBet, 0)
  state.players.forEach((player) => {
    player.payout = 0
    player.handRank = ''
    player.winningCards = []
  })
  winner.stack += pot
  winner.revealed = false
  winner.payout = pot
  winner.handRank = 'UNCONTESTED · FOLD'
  state.pot = pot
  state.winners = [winner.id]
  state.result = `${winner.name} thắng ${pot} chip · mọi đối thủ đã Fold`
  state.street = 'COMPLETE'
  state.complete = true
  state.actingSeat = -1
  state.turnStatus = 'COMPLETE'
  state.turnStartedAt = 0
  state.turnEndsAt = 0
  state.turnTimeLimitMs = 0
  state.botThinkingUntil = 0
  addLog(state, state.result)
}

export function settleTexasShowdown(state: TexasHoldemState) {
  state.street = 'SHOWDOWN'
  const contenders = activePlayers(state)
  state.players.forEach((player) => {
    player.payout = 0
    player.handRank = ''
    player.winningCards = []
  })
  contenders.forEach((player) => {
    player.revealed = true
    const cards = [...player.cards, ...state.community]
    player.handRank = scorePoker(cards).label
    player.winningCards = pokerWinningCards(cards)
  })
  const levels = [...new Set(state.players.map((player) => player.totalBet).filter((amount) => amount > 0))].sort((left, right) => left - right)
  let previous = 0
  const allWinners = new Set<string>()
  levels.forEach((level) => {
    const contributors = state.players.filter((player) => player.totalBet >= level)
    const amount = (level - previous) * contributors.length
    const eligible = contenders.filter((player) => player.totalBet >= level)
    if (!eligible.length || amount <= 0) {
      previous = level
      return
    }
    let winners = [eligible[0]]
    eligible.slice(1).forEach((player) => {
      const comparison = comparePlayerHands(player, winners[0], state.community)
      if (comparison > 0) winners = [player]
      else if (comparison === 0) winners.push(player)
    })
    const share = Math.floor(amount / winners.length)
    let remainder = amount - share * winners.length
    winners.sort((left, right) => ((left.seat - state.dealerSeat + state.players.length) % state.players.length) - ((right.seat - state.dealerSeat + state.players.length) % state.players.length))
    winners.forEach((winner) => {
      const payout = share + (remainder > 0 ? 1 : 0)
      winner.stack += payout
      winner.payout = (winner.payout || 0) + payout
      if (remainder > 0) remainder -= 1
      allWinners.add(winner.id)
    })
    previous = level
  })
  state.pot = state.players.reduce((total, player) => total + player.totalBet, 0)
  state.winners = [...allWinners]
  state.result = state.winners.map((id) => state.players.find((player) => player.id === id)?.name).filter(Boolean).join(' & ') + ` thắng showdown ${state.pot} chip`
  state.street = 'COMPLETE'
  state.complete = true
  state.actingSeat = -1
  state.turnStatus = 'COMPLETE'
  state.turnStartedAt = 0
  state.turnEndsAt = 0
  state.turnTimeLimitMs = 0
  state.botThinkingUntil = 0
  addLog(state, state.result)
}

function advanceStreet(state: TexasHoldemState) {
  state.players.forEach((player) => {
    player.streetBet = 0
    player.acted = player.folded || player.allIn
  })
  state.currentBet = 0
  state.minRaise = state.bigBlind
  if (state.street === 'PREFLOP') {
    state.street = 'FLOP'
    dealCommunity(state, 3)
  } else if (state.street === 'FLOP') {
    state.street = 'TURN'
    dealCommunity(state, 1)
  } else if (state.street === 'TURN') {
    state.street = 'RIVER'
    dealCommunity(state, 1)
  } else {
    settleTexasShowdown(state)
    return
  }
  addLog(state, `${state.street} · ${state.community.join(' ')}`)
  if (actionablePlayers(state).length <= 1) {
    while (!state.complete && state.street !== 'RIVER') advanceStreet(state)
    if (!state.complete) settleTexasShowdown(state)
    return
  }
  state.actingSeat = nextSeat(state.players, state.dealerSeat, (player) => !player.folded && !player.allIn)
}

export function legalTexasActions(state: TexasHoldemState, playerId = 'HUMAN') {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player || state.complete || player.folded || player.allIn || player.seat !== state.actingSeat) return []
  const toCall = Math.max(0, state.currentBet - player.streetBet)
  const actions = toCall > 0 ? ['FOLD', 'CALL'] : ['CHECK']
  if (player.stack > toCall) actions.push('RAISE')
  if (player.stack > 0) actions.push('ALL_IN')
  return actions
}

export function applyTexasAction(state: TexasHoldemState, playerId: string, input: TexasAction) {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player || player.seat !== state.actingSeat) throw new Error('NOT_PLAYER_TURN')
  const legal = legalTexasActions(state, playerId)
  if (!legal.includes(input.action)) throw new Error('ILLEGAL_TEXAS_ACTION')
  const toCall = Math.max(0, state.currentBet - player.streetBet)
  if (input.action === 'FOLD') {
    player.folded = true
    player.acted = true
    player.lastAction = 'FOLD'
  } else if (input.action === 'CHECK') {
    player.acted = true
    player.lastAction = 'CHECK'
  } else if (input.action === 'CALL') {
    const paid = commitChips(player, toCall)
    player.acted = true
    player.lastAction = player.allIn ? `CALL ALL-IN ${paid}` : `CALL ${paid}`
  } else {
    const allInTarget = player.streetBet + player.stack
    const requestedTarget = input.action === 'ALL_IN' ? allInTarget : Math.floor(input.amount || 0)
    if (requestedTarget <= state.currentBet || requestedTarget > allInTarget) throw new Error('INVALID_RAISE_SIZE')
    const raiseSize = requestedTarget - state.currentBet
    if (requestedTarget < state.currentBet + state.minRaise && requestedTarget !== allInTarget) throw new Error('RAISE_BELOW_MINIMUM')
    state.players.forEach((candidate) => {
      if (!candidate.folded && !candidate.allIn) candidate.acted = false
    })
    commitChips(player, requestedTarget - player.streetBet)
    state.currentBet = player.streetBet
    if (raiseSize >= state.minRaise) state.minRaise = raiseSize
    player.acted = true
    player.lastAction = input.action === 'ALL_IN' ? `ALL-IN ${player.streetBet}` : `RAISE TO ${player.streetBet}`
  }
  state.pot = state.players.reduce((total, candidate) => total + candidate.totalBet, 0)
  addLog(state, `${player.name}: ${player.lastAction}`)
  if (activePlayers(state).length === 1) {
    awardUncontested(state)
    return
  }
  if (roundComplete(state)) {
    advanceStreet(state)
    return
  }
  state.actingSeat = findNextActor(state, player.seat)
  if (state.actingSeat < 0) advanceStreet(state)
}

export function estimateTexasEquity(holeCards: string[], community: string[], opponents: number, iterations = 140, random: () => number = Math.random) {
  const known = new Set([...holeCards, ...community])
  const available = createShoe(1).filter((card) => !known.has(card))
  let equity = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const deck = shuffleCards(available, random)
    let cursor = 0
    const board = [...community]
    while (board.length < 5) board.push(deck[cursor++])
    const hero = scorePoker([...holeCards, ...board])
    let tied = 1
    let lost = false
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const villain = scorePoker([deck[cursor++], deck[cursor++], ...board])
      const comparison = comparePoker(hero, villain)
      if (comparison < 0) {
        lost = true
        break
      }
      if (comparison === 0) tied += 1
    }
    if (!lost) equity += 1 / tied
  }
  return equity / iterations
}

export function chooseTexasBotAction(state: TexasHoldemState, botId: string, random: () => number = Math.random): TexasAction {
  const bot = state.players.find((player) => player.id === botId)
  if (!bot) throw new Error('BOT_NOT_FOUND')
  const profile = BOT_PROFILES.find((candidate) => candidate.id === botId) || BOT_PROFILES[0]
  const opponents = activePlayers(state).filter((player) => player.id !== botId).length
  const equity = estimateTexasEquity(bot.cards, state.community, Math.max(1, opponents), 110, random)
  const toCall = Math.max(0, state.currentBet - bot.streetBet)
  const potOdds = toCall / Math.max(1, state.pot + toCall)
  const positionBoost = bot.seat === state.dealerSeat ? 0.04 : 0
  const adjusted = equity + positionBoost + (profile.aggression - 0.5) * 0.08
  const canRaise = bot.stack > toCall
  const bluff = random() < 0.055 * profile.aggression
  if (toCall === 0) {
    if (canRaise && (adjusted > 0.58 || bluff)) {
      const target = Math.min(bot.streetBet + bot.stack, Math.max(state.bigBlind, Math.floor(state.pot * (adjusted > 0.72 ? 0.75 : 0.45))))
      if (target > state.currentBet) return { action: 'RAISE', amount: Math.max(target, state.currentBet + state.minRaise) > bot.streetBet + bot.stack ? bot.streetBet + bot.stack : Math.max(target, state.currentBet + state.minRaise) }
    }
    return { action: 'CHECK' }
  }
  if (adjusted + 0.04 < potOdds && !bluff) return { action: 'FOLD' }
  if (canRaise && (adjusted > 0.7 || bluff)) {
    const minTarget = state.currentBet + state.minRaise
    const target = Math.min(bot.streetBet + bot.stack, Math.max(minTarget, state.currentBet + Math.floor(Math.max(state.bigBlind, state.pot * 0.55))))
    if (target > state.currentBet) return target === bot.streetBet + bot.stack ? { action: 'ALL_IN' } : { action: 'RAISE', amount: target }
  }
  return { action: 'CALL' }
}

export function runTexasBots(state: TexasHoldemState, random: () => number = Math.random, maxActions = 120) {
  let guard = 0
  while (!state.complete && guard < maxActions) {
    const acting = state.players.find((player) => player.seat === state.actingSeat)
    if (!acting || !acting.isBot) break
    applyTexasAction(state, acting.id, chooseTexasBotAction(state, acting.id, random))
    guard += 1
  }
  if (maxActions >= 120 && guard >= 120) throw new Error('TEXAS_BOT_LOOP_GUARD')
  return guard
}

export interface TexasPlayerDefinition {
  id: string
  name: string
  isBot?: boolean
  stack?: number
}

export function createTexasHoldemGameFromPlayers(
  handId: string,
  definitions: TexasPlayerDefinition[],
  dealerSeat = 0,
  random: () => number = Math.random,
  variant: TexasGameVariant = 'MULTIPLAYER',
): TexasHoldemState {
  const selected = definitions.slice(0, 4)
  if (selected.length < 2) throw new Error('TEXAS_NEEDS_TWO_PLAYERS')
  const deck = shuffleCards(createShoe(1), random)
  const players: TexasPlayerState[] = selected.map((player, seat) => ({
    id: player.id,
    name: player.name,
    seat,
    isBot: Boolean(player.isBot),
    cards: [],
    stack: Math.max(1, Math.floor(player.stack ?? TEXAS_BUY_IN)),
    streetBet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    acted: false,
    lastAction: '',
    revealed: false,
    handRank: '',
    winningCards: [],
    payout: 0,
  }))
  for (let card = 0; card < 2; card += 1) players.forEach((player) => player.cards.push(deck.pop()!))
  const state: TexasHoldemState = {
    handId,
    variant,
    street: 'PREFLOP',
    dealerSeat: ((dealerSeat % players.length) + players.length) % players.length,
    smallBlind: TEXAS_SMALL_BLIND,
    bigBlind: TEXAS_BIG_BLIND,
    actingSeat: -1,
    turnStatus: 'WAITING',
    turnStartedAt: 0,
    turnEndsAt: 0,
    turnTimeLimitMs: 0,
    botThinkingUntil: 0,
    currentBet: TEXAS_BIG_BLIND,
    minRaise: TEXAS_BIG_BLIND,
    pot: 0,
    community: [],
    deck,
    players,
    actionLog: [],
    winners: [],
    result: '',
    complete: false,
    processedActionIds: [],
  }
  const smallBlindSeat = nextSeat(players, state.dealerSeat, () => true)
  const bigBlindSeat = nextSeat(players, smallBlindSeat, () => true)
  const smallBlindPlayer = players.find((player) => player.seat === smallBlindSeat)!
  const bigBlindPlayer = players.find((player) => player.seat === bigBlindSeat)!
  commitChips(smallBlindPlayer, state.smallBlind)
  commitChips(bigBlindPlayer, state.bigBlind)
  smallBlindPlayer.lastAction = `SMALL BLIND ${state.smallBlind}`
  bigBlindPlayer.lastAction = `BIG BLIND ${state.bigBlind}`
  state.pot = state.smallBlind + state.bigBlind
  state.actingSeat = nextSeat(players, bigBlindSeat, (player) => !player.folded && !player.allIn)
  addLog(state, `${bigBlindPlayer.name} BB ${state.bigBlind} · ${smallBlindPlayer.name} SB ${state.smallBlind}`)
  return state
}

export function createTexasHoldemGame(handId: string, humanName: string, dealerSeat = 0, random: () => number = Math.random, humanStack = TEXAS_BUY_IN): TexasHoldemState {
  return createTexasHoldemGameFromPlayers(handId, [
    { id: 'HUMAN', name: humanName, isBot: false, stack: humanStack },
    ...BOT_PROFILES.map((bot) => ({ id: bot.id, name: bot.name, isBot: true, stack: TEXAS_BUY_IN })),
  ], dealerSeat, random, 'BOT')
}

export function foldTexasPlayer(state: TexasHoldemState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player || state.complete || player.folded) return
  if (player.seat === state.actingSeat && legalTexasActions(state, player.id).includes('FOLD')) {
    applyTexasAction(state, player.id, { action: 'FOLD' })
  } else {
    player.folded = true
    player.acted = true
    player.lastAction = 'FOLD · RỜI BÀN'
    addLog(state, `${player.name}: ${player.lastAction}`)
    if (activePlayers(state).length === 1) awardUncontested(state)
    else if (player.seat === state.actingSeat) {
      state.actingSeat = findNextActor(state, player.seat)
      if (state.actingSeat < 0) advanceStreet(state)
    }
  }
}

export function foldTexasHumanAndRunOut(state: TexasHoldemState, random: () => number = Math.random) {
  foldTexasPlayer(state, 'HUMAN')
  runTexasBots(state, random)
}

export function publicTexasState(state: TexasHoldemState, viewerId = 'HUMAN'): TexasHoldemPublicState {
  const viewer = state.players.find((player) => player.id === viewerId)
  const callAmount = viewer ? Math.min(viewer.stack, Math.max(0, state.currentBet - viewer.streetBet)) : 0
  return {
    handId: state.handId,
    variant: state.variant,
    viewerId,
    street: state.street,
    dealerSeat: state.dealerSeat,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    actingSeat: state.actingSeat,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: state.pot,
    community: [...state.community],
    players: state.players.map((player) => ({ ...player, cards: player.id === viewerId || player.revealed ? [...player.cards] : [] })),
    actionLog: [...state.actionLog],
    winners: [...state.winners],
    result: state.result,
    complete: state.complete,
    turnStatus: state.turnStatus,
    turnStartedAt: state.turnStartedAt,
    turnEndsAt: state.turnEndsAt,
    turnTimeLimitMs: state.turnTimeLimitMs,
    botThinkingUntil: state.botThinkingUntil,
    legalActions: legalTexasActions(state, viewerId),
    callAmount,
    minRaiseTo: viewer ? Math.min(viewer.streetBet + viewer.stack, state.currentBet + state.minRaise) : 0,
    maxRaiseTo: viewer ? viewer.streetBet + viewer.stack : 0,
  }
}

export function texasStreetLabel(street: TexasStreet) {
  return street === 'PREFLOP' ? 'PRE-FLOP' : street
}
