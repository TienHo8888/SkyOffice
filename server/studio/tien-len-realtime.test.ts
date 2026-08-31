import assert from 'node:assert/strict'
import { Client } from 'colyseus.js'

import { Message } from '../../types/Messages'
import { TienLenPrivateState } from '../../types/TienLen'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'
import { walkPlayerTo } from './realtime-test-helpers'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function publicState(room: any) {
  const value = room.state.casinoTables.get('TIEN_LEN')?.tienLenPublicJson || ''
  if (!value) return undefined
  try { return JSON.parse(value) } catch (_error) { return undefined }
}

function pvpLobby(room: any) {
  const value = room.state.casinoTables.get('TIEN_LEN')?.pvpLobbyJson || ''
  if (!value) return []
  try { return JSON.parse(value) } catch (_error) { return [] }
}

async function waitFor(check: () => boolean, timeout = 5000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error('Timed out waiting for Tiến Lên realtime state.')
    await pause(50)
  }
}

async function run() {
  const demo = studioStore.getUserByLogin('demo')
  const dealer = studioStore.getUserByLogin('dealer')
  if (!demo || !dealer) throw new Error('Default Tiến Lên test accounts are missing.')

  const demoRoom = await new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567').joinOrCreate('skyoffice', { token: createSessionToken(toUser(demo)) })
  const dealerRoom = await new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567').joinOrCreate('skyoffice', { token: createSessionToken(toUser(dealer)) })
  const demoState = demoRoom.state as any
  const dealerState = dealerRoom.state as any
  const privateStates = new Map<string, TienLenPrivateState>()
  demoRoom.onMessage(Message.TIEN_LEN_PRIVATE_STATE, (payload: TienLenPrivateState) => privateStates.set(demoRoom.sessionId, payload))
  dealerRoom.onMessage(Message.TIEN_LEN_PRIVATE_STATE, (payload: TienLenPrivateState) => privateStates.set(dealerRoom.sessionId, payload))
  demoRoom.onMessage(Message.TIEN_LEN_ERROR, (payload: { message: string }) => { throw new Error(payload.message) })
  dealerRoom.onMessage(Message.TIEN_LEN_ERROR, (payload: { message: string }) => { throw new Error(payload.message) })
  ;[demoRoom, dealerRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.PLAYER_ROOM_CHANGED, () => undefined)
    room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
  })

  await Promise.all([
    walkPlayerTo(demoRoom, { x: 1384, y: 216 }, 'adam_idle_up'),
    walkPlayerTo(dealerRoom, { x: 1384, y: 216 }, 'dealer_idle_up'),
  ])
  await waitFor(() => demoState.players.get(demoRoom.sessionId)?.currentRoom === 'GAME_LOUNGE' && dealerState.players.get(dealerRoom.sessionId)?.currentRoom === 'GAME_LOUNGE')
  demoRoom.send(Message.TIEN_LEN_ACTION, { action: 'JOIN_TABLE', actionId: `tl-join-demo-${Date.now()}` })
  dealerRoom.send(Message.TIEN_LEN_ACTION, { action: 'JOIN_TABLE', actionId: `tl-join-dealer-${Date.now()}` })
  await waitFor(() => publicState(demoRoom)?.players.length === 2)
  demoRoom.send(Message.TIEN_LEN_ACTION, { action: 'START_LOBBY', actionId: `tl-start-${Date.now()}` })
  await waitFor(() => publicState(demoRoom)?.status === 'PLAYING')
  await waitFor(() => privateStates.size === 2)

  const startedState = publicState(demoRoom)
  if (!startedState) throw new Error('Tiến Lên public state was not initialized.')
  const opener = [...privateStates.values()].find((state) => state.hand.includes('3S'))!
  assert.equal(opener.mustPlayThreeSpades, true)
  assert.equal(opener.currentSeat, startedState.currentSeat)
  const openerRoom = opener.playerId === demoRoom.sessionId ? demoRoom : dealerRoom
  const otherRoom = openerRoom === demoRoom ? dealerRoom : demoRoom
  openerRoom.send(Message.TIEN_LEN_ACTION, { action: 'PLAY', cards: ['3S'], actionId: `tl-play-${Date.now()}` })
  await waitFor(() => publicState(demoRoom)?.lastPlay?.cards?.[0] === '3S')
  otherRoom.send(Message.TIEN_LEN_ACTION, { action: 'PASS', actionId: `tl-pass-${Date.now()}` })
  await waitFor(() => !publicState(demoRoom)?.lastPlay)
  assert.equal(publicState(demoRoom)?.currentSeat, opener.players.find((player) => player.id === opener.playerId)?.seat)

  demoRoom.send(Message.TIEN_LEN_ACTION, { action: 'LEAVE_TABLE', actionId: `tl-leave-demo-${Date.now()}` })
  dealerRoom.send(Message.TIEN_LEN_ACTION, { action: 'LEAVE_TABLE', actionId: `tl-leave-dealer-${Date.now()}` })
  await pause(300)
  await demoRoom.leave()
  await dealerRoom.leave()
  await pause(300)

  const overflowUsers = ['demo', 'dealer', 'designer', 'qa', 'tohi'].map((login) => studioStore.getUserByLogin(login))
  if (overflowUsers.some((user) => !user)) throw new Error('Five default accounts are required for Tiến Lên room overflow testing.')
  const overflowRooms = await Promise.all(overflowUsers.map((user) => new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567').joinOrCreate('skyoffice', { token: createSessionToken(toUser(user!)) })))
  overflowRooms.forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.PLAYER_ROOM_CHANGED, () => undefined)
    room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
    room.onMessage(Message.CASINO_EVENT, () => undefined)
    room.onMessage(Message.TIEN_LEN_PRIVATE_STATE, () => undefined)
  })
  await Promise.all(overflowRooms.map((room) => walkPlayerTo(room, { x: 1384, y: 216 }, 'adam_idle_up')))
  await waitFor(() => overflowRooms.every((room) => (room.state as any).players.get(room.sessionId)?.currentRoom === 'GAME_LOUNGE'))
  overflowRooms.forEach((room, index) => room.send(Message.TIEN_LEN_ACTION, { action: 'JOIN_TABLE', tableId: 'tienlen-free-101', actionId: `tl-overflow-${index}-${Date.now()}` }))
  await waitFor(() => {
    const snapshots = pvpLobby(overflowRooms[0])
    return snapshots.find((table: any) => table.roomCode === '101')?.playerCount === 4 && snapshots.find((table: any) => table.roomCode === '102')?.playerCount === 1
  })
  const overflowSnapshots = pvpLobby(overflowRooms[0])
  assert.equal(overflowSnapshots.find((table: any) => table.roomCode === '101')?.status, 'FULL')
  assert.equal(overflowSnapshots.find((table: any) => table.roomCode === '102')?.playerCount, 1)
  overflowRooms.forEach((room, index) => room.send(Message.TIEN_LEN_ACTION, { action: 'LEAVE_TABLE', actionId: `tl-overflow-leave-${index}-${Date.now()}` }))
  await pause(250)
  await Promise.all(overflowRooms.map((room) => room.leave()))
  console.log('Tien Len realtime tests passed: private play flow, numbered rooms and full-table overflow routing')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
