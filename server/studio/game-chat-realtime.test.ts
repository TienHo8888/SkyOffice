import assert from 'node:assert/strict'
import { Client } from 'colyseus.js'

import { GameChatMessage, GameChatServerPayload } from '../../types/GameChat'
import { Message } from '../../types/Messages'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, label: string, timeout = 5000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for game chat: ${label}`)
    await pause(40)
  }
}

async function run() {
  const demo = studioStore.getUserByLogin('demo')
  const dealer = studioStore.getUserByLogin('dealer')
  if (!demo || !dealer) throw new Error('Default game-chat test accounts are missing.')
  const endpoint = process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567'
  const demoRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(demo)) })
  const dealerRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(dealer)) })
  ;[demoRoom, dealerRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.GAME_CHAT, () => undefined)
    room.onMessage(Message.CASINO_EVENT, () => undefined)
  })
  const received: GameChatMessage[] = []
  const histories = new Map<string, GameChatMessage[]>()
  dealerRoom.onMessage(Message.GAME_CHAT, (payload: GameChatServerPayload) => {
    if (payload.action === 'MESSAGE') received.push(payload.message)
    if (payload.action === 'HISTORY') histories.set(payload.channel, payload.messages)
  })

  const pokerText = `Poker hello ${Date.now()}`
  const tienLenText = `Tien Len hello ${Date.now()}`
  demoRoom.send(Message.GAME_CHAT, { action: 'SEND', channel: 'POKER', content: pokerText })
  await waitFor(() => received.some((message) => message.content === pokerText), 'Poker broadcast')
  await pause(550)
  demoRoom.send(Message.GAME_CHAT, { action: 'SEND', channel: 'TIEN_LEN', content: tienLenText })
  await waitFor(() => received.some((message) => message.content === tienLenText), 'Tien Len broadcast')

  dealerRoom.send(Message.GAME_CHAT, { action: 'LOAD', channel: 'POKER' })
  dealerRoom.send(Message.GAME_CHAT, { action: 'LOAD', channel: 'TIEN_LEN' })
  await waitFor(() => histories.has('POKER') && histories.has('TIEN_LEN'), 'separate histories')
  assert.ok(histories.get('POKER')?.some((message) => message.content === pokerText))
  assert.ok(!histories.get('POKER')?.some((message) => message.content === tienLenText))
  assert.ok(histories.get('TIEN_LEN')?.some((message) => message.content === tienLenText))
  assert.ok(!histories.get('TIEN_LEN')?.some((message) => message.content === pokerText))

  await demoRoom.leave()
  await dealerRoom.leave()
  console.log('Game chat realtime tests passed: broadcast, history and per-game channel isolation')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
