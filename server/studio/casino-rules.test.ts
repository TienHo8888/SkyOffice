import assert from 'node:assert/strict'

import {
  bauCuaProfit,
  comparePoker,
  dealBaccarat,
  dealerQualifiesCasinoHoldem,
  scoreBlackjack,
  scorePoker,
  sicBoProfit,
} from './casino-rules'

function drawer(cards: string[]) {
  let index = 0
  return () => cards[index++]
}

const natural = dealBaccarat(drawer(['9S', '7H', 'KC', 'AC']))
assert.equal(natural.natural, true)
assert.equal(natural.outcome, 'PLAYER')
assert.deepEqual(natural.playerCards, ['9S', 'KC'])

const bankerStandsAgainstEight = dealBaccarat(drawer(['2S', 'AH', '3D', '2C', '8S', '9H']))
assert.equal(bankerStandsAgainstEight.playerCards.length, 3)
assert.equal(bankerStandsAgainstEight.bankerCards.length, 2)
assert.equal(bankerStandsAgainstEight.outcome, 'TIE')

const bankerDrawsAgainstSeven = dealBaccarat(drawer(['2S', '2H', '3D', '2C', '7S', '5H']))
assert.equal(bankerDrawsAgainstSeven.bankerCards.length, 3)
assert.equal(bankerDrawsAgainstSeven.bankerTotal, 9)

assert.deepEqual(scoreBlackjack(['AS', '6H']), { total: 17, soft: true, blackjack: false, bust: false })
assert.deepEqual(scoreBlackjack(['AS', '6H', '10D']), { total: 17, soft: false, blackjack: false, bust: false })
assert.equal(scoreBlackjack(['AS', 'KH']).blackjack, true)
assert.equal(scoreBlackjack(['KS', 'QH', '2D']).bust, true)

const royal = scorePoker(['AS', 'KS', 'QS', 'JS', '10S', '2D', '3C'])
const quads = scorePoker(['9S', '9H', '9D', '9C', 'AS', '2D', '3C'])
const wheel = scorePoker(['AS', '2H', '3D', '4C', '5S', 'KD', 'QC'])
assert.equal(royal.label, 'Royal Flush')
assert.equal(quads.label, 'Four of a Kind')
assert.equal(wheel.label, 'Straight')
assert.ok(comparePoker(royal, quads) > 0)
assert.equal(dealerQualifiesCasinoHoldem(scorePoker(['4S', '4H', '2D', '7C', '9S', 'JD', 'QC'])), true)
assert.equal(dealerQualifiesCasinoHoldem(scorePoker(['AS', 'KH', '2D', '7C', '9S', 'JD', '3C'])), false)

assert.equal(sicBoProfit('SMALL', [2, 3, 4]), 1)
assert.equal(sicBoProfit('SMALL', [3, 3, 3]), -1)
assert.equal(sicBoProfit('ODD', [3, 3, 3]), -1)
assert.equal(sicBoProfit('ANY_TRIPLE', [3, 3, 3]), 31)
assert.equal(sicBoProfit('TRIPLE_3', [3, 3, 3]), 180)
assert.equal(sicBoProfit('TOTAL_4', [1, 1, 2]), 62)
assert.equal(sicBoProfit('SINGLE_5', [5, 5, 5]), 12)

assert.equal(bauCuaProfit('CRAB', ['CRAB', 'FISH', 'CRAB']), 2)
assert.equal(bauCuaProfit('SHRIMP', ['CRAB', 'FISH', 'CRAB']), -1)

console.log('Casino rules tests passed: Baccarat draw table, Blackjack scoring, Hold’em ranking, Sic Bo and Bầu Cua payouts')
