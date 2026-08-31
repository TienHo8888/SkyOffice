import assert from 'node:assert/strict'

import { TexasHoldemState, TexasPlayerState } from '../../types/TexasHoldem'
import {
  applyTexasAction,
  createTexasHoldemGame,
  createTexasHoldemGameFromPlayers,
  estimateTexasEquity,
  publicTexasState,
  runTexasBots,
  settleTexasShowdown,
} from './texas-holdem'

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

const random = seededRandom(42)
const game = createTexasHoldemGame('test-hand', 'Tester', 0, random)
assert.equal(game.players.length, 4)
assert.equal(game.pot, 15)
assert.equal(game.currentBet, 10)
assert.equal(game.players.reduce((total, player) => total + player.stack + player.totalBet, 0), 400)
assert.deepEqual(publicTexasState(game).players.filter((player) => player.isBot).map((player) => player.cards), [[], [], []])

const steppedGame = createTexasHoldemGame('stepped-hand', 'Tester', 0, seededRandom(43))
const steppedActionCount = runTexasBots(steppedGame, seededRandom(43), 1)
assert.equal(steppedActionCount, 1, 'server timer mode should advance only one bot action at a time')
assert.ok(steppedGame.actionLog.length > 1, 'a stepped bot turn should be visible in the action log')

const multiplayer = createTexasHoldemGameFromPlayers('multi-hand', [
  { id: 'session-a', name: 'Alice' },
  { id: 'session-b', name: 'Bob' },
], 0, seededRandom(44))
const aliceView = publicTexasState(multiplayer, 'session-a')
assert.equal(aliceView.variant, 'MULTIPLAYER')
assert.equal(aliceView.viewerId, 'session-a')
assert.equal(aliceView.players.find((player) => player.id === 'session-a')?.cards.length, 2)
assert.equal(aliceView.players.find((player) => player.id === 'session-b')?.cards.length, 0, 'opponent hole cards must be private')
assert.deepEqual(publicTexasState(multiplayer, '').legalActions, [], 'shared public state must not expose a player action surface')

runTexasBots(game, random)
let guard = 0
while (!game.complete && guard < 30) {
  const legal = publicTexasState(game).legalActions
  assert.ok(legal.length > 0, 'human should have a legal action when bot loop yields')
  const action = legal.includes('CHECK') ? 'CHECK' : legal.includes('CALL') ? 'CALL' : 'FOLD'
  applyTexasAction(game, 'HUMAN', { action })
  runTexasBots(game, random)
  guard += 1
}
assert.equal(game.complete, true)
assert.equal(game.players.reduce((total, player) => total + player.stack, 0), 400)
assert.ok(game.actionLog.some((line) => /Nova|River|Ace/.test(line)), 'bots should take real actions')

const player = (id: string, seat: number, cards: string[], totalBet: number): TexasPlayerState => ({
  id, name: id, seat, isBot: id !== 'HUMAN', cards, stack: 0, streetBet: 0, totalBet,
  folded: false, allIn: true, acted: true, lastAction: 'ALL-IN', revealed: id === 'HUMAN',
})
const sidePot: TexasHoldemState = {
  handId: 'side-pot', variant: 'BOT', street: 'RIVER', dealerSeat: 0, smallBlind: 5, bigBlind: 10, actingSeat: -1,
  turnStatus: 'WAITING', turnStartedAt: 0, turnEndsAt: 0, turnTimeLimitMs: 0, botThinkingUntil: 0,
  currentBet: 0, minRaise: 10, pot: 90, community: ['AS', 'KS', 'QS', '2D', '3C'], deck: [],
  players: [
    player('HUMAN', 0, ['JS', '10S'], 10),
    player('BOT_NOVA', 1, ['AH', 'AD'], 20),
    player('BOT_RIVER', 2, ['9H', '9D'], 30),
    player('BOT_ACE', 3, ['QH', 'QD'], 30),
  ],
  actionLog: [], winners: [], result: '', complete: false, processedActionIds: [],
}
settleTexasShowdown(sidePot)
assert.equal(sidePot.players.find((candidate) => candidate.id === 'HUMAN')?.stack, 40, 'short stack wins main pot')
assert.equal(sidePot.players.find((candidate) => candidate.id === 'BOT_NOVA')?.stack, 30, 'second stack wins first side pot')
assert.equal(sidePot.players.find((candidate) => candidate.id === 'BOT_ACE')?.stack, 20, 'deep stack wins final side pot')
assert.equal(sidePot.players.reduce((total, candidate) => total + candidate.stack, 0), 90)

const equityRandom = seededRandom(7)
const aces = estimateTexasEquity(['AS', 'AH'], [], 1, 900, equityRandom)
const sevenTwo = estimateTexasEquity(['7C', '2D'], [], 1, 900, seededRandom(7))
assert.ok(aces > 0.75, `pocket aces equity should be strong, got ${aces}`)
assert.ok(aces > sevenTwo + 0.25, `bot equity model should distinguish premium and weak hands (${aces} vs ${sevenTwo})`)

console.log('Texas Hold’em tests passed: blinds, legal flow, bot actions, hidden cards, equity and side pots')
