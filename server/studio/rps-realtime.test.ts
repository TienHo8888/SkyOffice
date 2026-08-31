import assert from 'node:assert/strict'
import { Client } from 'colyseus.js'

import { Message } from '../../types/Messages'
import { RpsPrivateState } from '../../types/Rps'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, timeout = 5000, label = 'state') {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for RPS realtime state: ${label}`)
    await pause(40)
  }
}

async function run() {
  const demo = studioStore.getUserByLogin('demo')
  const dealer = studioStore.getUserByLogin('dealer')
  if (!demo || !dealer) throw new Error('Default RPS test accounts are missing.')
  const endpoint = process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567'
  const demoRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(demo)) })
  const dealerRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(dealer)) })
  const demoState = demoRoom.state as any
  const dealerState = dealerRoom.state as any
  ;[demoRoom, dealerRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.SOCIAL_REWARD, () => undefined)
  })
  let demoRps: RpsPrivateState | undefined
  let dealerRps: RpsPrivateState | undefined
  const errors: string[] = []
  demoRoom.onMessage(Message.RPS_STATE, (payload: RpsPrivateState) => { demoRps = payload })
  dealerRoom.onMessage(Message.RPS_STATE, (payload: RpsPrivateState) => { dealerRps = payload })
  demoRoom.onMessage(Message.RPS_ERROR, (payload: { message: string }) => errors.push(payload.message))
  dealerRoom.onMessage(Message.RPS_ERROR, (payload: { message: string }) => errors.push(payload.message))

  demoRoom.send(Message.UPDATE_PLAYER, { x: 700, y: 500, anim: 'adam_idle_down' })
  dealerRoom.send(Message.UPDATE_PLAYER, { x: 748, y: 500, anim: 'lucy_idle_down' })
  await waitFor(() => demoState.players.get(demoRoom.sessionId)?.currentRoom === dealerState.players.get(dealerRoom.sessionId)?.currentRoom && Math.abs(demoState.players.get(demoRoom.sessionId)?.x - dealerState.players.get(dealerRoom.sessionId)?.x) <= 96, 5000, 'nearby players')

  demoRoom.send(Message.RPS_ACTION, { action: 'CREATE', targetSessionId: dealerRoom.sessionId, wager: 10, actionId: `rps-create-${Date.now()}` })
  await waitFor(() => demoRps?.status === 'PENDING' && dealerRps?.status === 'PENDING', 5000, 'challenge popup')
  assert.equal(demoRps?.role, 'CHALLENGER')
  assert.equal(dealerRps?.role, 'CHALLENGED')
  assert.equal(dealerRps?.wager, 10)
  assert.equal(dealerRps?.opponentMove, undefined, 'incoming popup must not reveal a move')

  dealerRoom.send(Message.RPS_ACTION, { action: 'ACCEPT', challengeId: dealerRps?.challengeId, actionId: `rps-accept-${Date.now()}` })
  await waitFor(() => demoRps?.status === 'READY' && dealerRps?.status === 'READY', 5000, 'accepted challenge')
  const challengeId = demoRps?.challengeId
  demoRoom.send(Message.RPS_ACTION, { action: 'SELECT_MOVE', challengeId, move: 'ROCK', actionId: `rps-rock-${Date.now()}` })
  await waitFor(() => demoRps?.myMove === 'ROCK' && dealerRps?.opponentMove === undefined, 5000, 'hidden challenger move')
  dealerRoom.send(Message.RPS_ACTION, { action: 'SELECT_MOVE', challengeId, move: 'SCISSORS', actionId: `rps-scissors-${Date.now()}` })
  await waitFor(() => dealerRps?.myMove === 'SCISSORS', 5000, 'hidden challenged move')

  demoRoom.send(Message.RPS_ACTION, { action: 'READY', challengeId, actionId: `rps-ready-demo-${Date.now()}` })
  dealerRoom.send(Message.RPS_ACTION, { action: 'READY', challengeId, actionId: `rps-ready-dealer-${Date.now()}` })
  await waitFor(() => demoRps?.status === 'RESOLVED' && dealerRps?.status === 'RESOLVED', 5000, 'resolved result')
  assert.equal(demoRps?.winnerSessionId, demoRoom.sessionId)
  assert.equal(demoRps?.opponentMove, 'SCISSORS')
  assert.equal(dealerRps?.opponentMove, 'ROCK')
  assert.match(demoRps?.resultText || '', /thắng/)
  assert.equal(errors.length, 0, errors.join('; '))

  await demoRoom.leave()
  await dealerRoom.leave()
  console.log('RPS realtime tests passed: nearby challenge, accept, hidden moves, double-ready resolution and winner payout')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
