import assert from 'node:assert/strict'
import { Client } from 'colyseus.js'

import { PVP_TABLE_CATALOG } from '../../types/Casino'
import { Message } from '../../types/Messages'
import { TexasHoldemPublicState } from '../../types/TexasHoldem'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'
import { walkPlayerTo } from './realtime-test-helpers'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, timeout = 7000, label = 'state') {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for Texas multiplayer realtime state: ${label}`)
    await pause(50)
  }
}

function sharedState(room: any): TexasHoldemPublicState | undefined {
  const seat = [...(room.state.casinoTables.get('POKER')?.seats?.values() || [])].find((candidate: any) => candidate.pokerMode === 'MULTIPLAYER')
  if (!seat?.pokerStateJson) return undefined
  try { return JSON.parse(seat.pokerStateJson) } catch (_error) { return undefined }
}

async function run() {
  const texasBuyIn = PVP_TABLE_CATALOG.POKER[0].buyIn
  const texasUsers = ['demo', 'dealer', 'designer', 'qa', 'tohi']
    .map((login) => studioStore.getUserByLogin(login))
    .filter((user): user is NonNullable<typeof user> => Boolean(user) && studioStore.getSocialProgression(user!.studioId, user!.id).coinBalance >= texasBuyIn)
    .slice(0, 2)
  if (texasUsers.length < 2) throw new Error(`At least two Texas multiplayer accounts need ${texasBuyIn} Coin.`)
  const [demo, dealer] = texasUsers
  const endpoint = process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567'
  const demoRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(demo)) })
  const dealerRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(dealer)) })
  const demoState = demoRoom.state as any
  const dealerState = dealerRoom.state as any
  const privateStates = new Map<string, TexasHoldemPublicState>()
  const errors: string[] = []
  ;[demoRoom, dealerRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.PLAYER_ROOM_CHANGED, () => undefined)
    room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
    room.onMessage(Message.SOCIAL_REWARD, () => undefined)
    room.onMessage(Message.CASINO_EVENT, () => undefined)
  })
  demoRoom.onMessage(Message.TEXAS_PRIVATE_STATE, (payload: TexasHoldemPublicState) => privateStates.set(demoRoom.sessionId, payload))
  dealerRoom.onMessage(Message.TEXAS_PRIVATE_STATE, (payload: TexasHoldemPublicState) => privateStates.set(dealerRoom.sessionId, payload))
  demoRoom.onMessage(Message.CASINO_ERROR, (payload: { message: string }) => errors.push(payload.message))
  dealerRoom.onMessage(Message.CASINO_ERROR, (payload: { message: string }) => errors.push(payload.message))

  await Promise.all([
    walkPlayerTo(demoRoom, { x: 1384, y: 216 }, 'adam_idle_up'),
    walkPlayerTo(dealerRoom, { x: 1384, y: 216 }, 'dealer_idle_up'),
  ])
  await waitFor(() => demoState.players.get(demoRoom.sessionId)?.currentRoom === 'GAME_LOUNGE' && dealerState.players.get(dealerRoom.sessionId)?.currentRoom === 'GAME_LOUNGE', 7000, 'move to game lounge')
  demoRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'JOIN_TABLE', actionId: `texas-multi-join-demo-${Date.now()}` })
  dealerRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'JOIN_TABLE', actionId: `texas-multi-join-dealer-${Date.now()}` })
  await waitFor(() => [...demoState.casinoTables.get('POKER').seats.values()].filter((seat: any) => seat.pokerMode === 'MULTIPLAYER_WAITING').length === 2, 7000, `two waiting seats; seats=${JSON.stringify([...demoState.casinoTables.get('POKER').seats.values()].map((seat: any) => ({ id: seat.userId, mode: seat.pokerMode, status: seat.status })))} errors=${JSON.stringify(errors)}`)
  assert.ok(demoState.casinoTables.get('POKER').phaseEndsAt > Date.now(), 'two players should start a five-second countdown')
  await waitFor(() => Boolean(sharedState(demoRoom)?.handId && [...demoState.casinoTables.get('POKER').seats.values()].some((seat: any) => seat.pokerMode === 'MULTIPLAYER')), 8000, 'table auto-started after countdown')
  await waitFor(() => privateStates.size === 2, 7000, `private state for both; shared=${JSON.stringify(sharedState(demoRoom))}`)

  const demoView = privateStates.get(demoRoom.sessionId)
  const dealerView = privateStates.get(dealerRoom.sessionId)
  if (!demoView || !dealerView) throw new Error('Texas private state was not delivered to both players.')
  assert.equal(demoView.variant, 'MULTIPLAYER')
  assert.equal(demoView.handId, dealerView.handId)
  assert.equal(demoView.players.find((player) => player.id === demoRoom.sessionId)?.cards.length, 2)
  assert.equal(dealerView.players.find((player) => player.id === dealerRoom.sessionId)?.cards.length, 2)
  assert.equal(demoView.players.find((player) => player.id === dealerRoom.sessionId)?.cards.length, 0, 'demo must not see dealer hole cards')
  assert.equal(dealerView.players.find((player) => player.id === demoRoom.sessionId)?.cards.length, 0, 'dealer must not see demo hole cards')
  assert.ok(demoView.turnEndsAt > demoView.turnStartedAt)
  assert.equal(errors.length, 0, errors.join('; '))
  const firstHandId = demoView.handId
  const firstDealerSeat = demoView.dealerSeat

  const acting = [...privateStates.entries()].find(([sessionId, state]) => state.legalActions.length > 0 && state.players.some((player) => player.id === sessionId && player.seat === state.actingSeat))
  if (!acting) throw new Error('Texas multiplayer acting player was not found.')
  const [actingSession, actingState] = acting
  const legalAction = 'FOLD'
  assert.ok(actingState.legalActions.includes(legalAction), 'acting player should be able to fold and finish the heads-up hand')
  const actingRoom = actingSession === demoRoom.sessionId ? demoRoom : dealerRoom
  const previousActionCount = actingState.actionLog.length
  actingRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: legalAction, actionId: `texas-multi-action-${Date.now()}` })
  await waitFor(() => (sharedState(demoRoom)?.actionLog.length || 0) > previousActionCount, 7000, `acting player action; acting=${actingSession}; action=${legalAction}; before=${previousActionCount}; shared=${JSON.stringify(sharedState(demoRoom))}; errors=${JSON.stringify(errors)}`)
  await waitFor(() => Boolean(sharedState(demoRoom)?.complete), 7000, 'first hand completed')
  assert.ok(demoState.casinoTables.get('POKER').phaseEndsAt > Date.now(), 'completed hand should expose the next-hand countdown')
  await waitFor(() => {
    const state = sharedState(demoRoom)
    return Boolean(state && state.handId !== firstHandId && !state.complete)
  }, 8000, 'next hand auto-started')
  const nextHand = sharedState(demoRoom)
  assert.ok(nextHand)
  assert.match(nextHand.handId, /:hand-2$/)
  assert.notEqual(nextHand.dealerSeat, firstDealerSeat, 'dealer should rotate for the next heads-up hand')
  assert.equal(nextHand.players.reduce((total, player) => total + player.stack, 0) + nextHand.pot, 200, 'stacks and pot should carry into the next hand without minting or losing chips')
  assert.equal(errors.length, 0, errors.join('; '))

  demoRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'CASH_OUT', actionId: `texas-multi-cash-demo-${Date.now()}` })
  await waitFor(() => !demoState.casinoTables.get('POKER').seats.get(demoRoom.sessionId), 7000, `demo cash-out; seats=${JSON.stringify([...demoState.casinoTables.get('POKER').seats.values()].map((seat: any) => ({ id: seat.userId, session: seat.sessionId, mode: seat.pokerMode, status: seat.status, payout: seat.payout })))} errors=${JSON.stringify(errors)}`)
  dealerRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'CASH_OUT', actionId: `texas-multi-cash-dealer-${Date.now()}` })
  await waitFor(() => !demoState.casinoTables.get('POKER').seats.get(demoRoom.sessionId) && !dealerState.casinoTables.get('POKER').seats.get(dealerRoom.sessionId), 7000, `cash-out both; demoSeats=${JSON.stringify([...demoState.casinoTables.get('POKER').seats.values()].map((seat: any) => ({ id: seat.userId, mode: seat.pokerMode, status: seat.status })))} dealerSeats=${JSON.stringify([...dealerState.casinoTables.get('POKER').seats.values()].map((seat: any) => ({ id: seat.userId, mode: seat.pokerMode, status: seat.status })))} errors=${JSON.stringify(errors)}`)
  await demoRoom.leave()
  await dealerRoom.leave()
  console.log('Texas multiplayer realtime tests passed: lobby, shared turn, private hole cards, automatic next hand and cash-out')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
