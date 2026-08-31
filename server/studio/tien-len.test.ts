import assert from 'node:assert/strict'

import {
  canBeatTienLen,
  classifyTienLen,
  createTienLenGame,
  legalTienLenPlays,
  passTienLen,
  playTienLen,
  startTienLenGame,
} from './tien-len'

assert.equal(classifyTienLen(['3S']), 'SINGLE')
assert.equal(classifyTienLen(['8S', '8H']), 'PAIR')
assert.equal(classifyTienLen(['3S', '4H', '5D']), 'STRAIGHT')
assert.equal(classifyTienLen(['3S', '3H', '4S', '4H', '5S', '5H']), 'THREE_PAIRS')
assert.equal(classifyTienLen(['2S', '2H', '2D', '2C']), 'FOUR_KIND')
assert.equal(classifyTienLen(['QH', 'KH', 'AH']), 'STRAIGHT')
assert.equal(classifyTienLen(['QH', 'KH', '2H']), undefined)

const threePairs = { playerId: 'A', playerName: 'A', cards: ['3S', '3H', '4S', '4H', '5S', '5H'], combo: 'THREE_PAIRS' as const, highRank: 5, highSuit: 3 }
const two = { playerId: 'B', playerName: 'B', cards: ['2H'], combo: 'SINGLE' as const, highRank: 15, highSuit: 3 }
assert.equal(canBeatTienLen(threePairs, two), true)

const game = startTienLenGame(createTienLenGame('test', 'LOBBY', [
  { id: 'A', name: 'A' },
  { id: 'B', name: 'B' },
  { id: 'C', name: 'C' },
  { id: 'D', name: 'D' },
]), () => 0.37)
const opener = game.players.find((player) => player.cards.includes('3S'))!
assert.equal(game.currentSeat, opener.seat)
assert.ok(legalTienLenPlays(game, opener.id).some((play) => play.cards.includes('3S')))
const opening = legalTienLenPlays(game, opener.id).find((play) => play.cards.length === 1 && play.cards[0] === '3S')!
playTienLen(game, opener.id, opening.cards)
assert.equal(game.openingRequired, false)
assert.notEqual(game.currentSeat, opener.seat)
for (let index = 0; index < 3; index += 1) {
  const current = game.players.find((player) => player.seat === game.currentSeat)!
  passTienLen(game, current.id)
}
assert.equal(game.lastPlay, undefined)
assert.equal(game.currentSeat, opener.seat)

console.log('Tien Len rules tests passed: Southern opening, combinations, special cuts and server turns')
