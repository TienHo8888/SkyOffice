import assert from 'assert'
import { Client } from 'colyseus.js'
import { Message } from '../../types/Messages'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'
import { CombatEventPayload } from '../../types/Combat'
import { walkPlayerTo } from './realtime-test-helpers'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, timeout = 4000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error('Timed out waiting for realtime state.')
    await pause(50)
  }
}

async function run() {
  const alex = studioStore.getUserByLogin('demo')
  const amy = studioStore.getUserByLogin('dealer')
  const admin = ['tohi', 'designer', 'qa', 'fifu', 'haha', 'hyo', 'martin', 'amy']
    .map((login) => studioStore.getUserByLogin(login))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))
    .find((user) => user.id !== alex?.id && user.id !== amy?.id && studioStore.getSocialProgression(user.studioId, user.id).coinBalance >= 100)
  if (!alex || !amy || !admin) throw new Error('Default realtime test accounts are missing.')
  const alexClient = new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567')
  const amyClient = new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567')
  const adminClient = new Client(process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567')
  const alexRoom = await alexClient.joinOrCreate('skyoffice', { token: createSessionToken(toUser(alex)) })
  const amyRoom = await amyClient.joinOrCreate('skyoffice', { token: createSessionToken(toUser(amy)) })
  const adminRoom = await adminClient.joinOrCreate('skyoffice', { token: createSessionToken(toUser(admin)) })
  ;[alexRoom, amyRoom, adminRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.PLAYER_ROOM_CHANGED, () => undefined)
    room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
    room.onMessage(Message.MINI_GAME_EVENT, () => undefined)
    room.onMessage(Message.CASINO_EVENT, () => undefined)
    room.onMessage(Message.COMBAT_EVENT, () => undefined)
  })

  const alexState = alexRoom.state as any
  const amyState = amyRoom.state as any
  const adminState = adminRoom.state as any
  await waitFor(() => Boolean(alexState.players.get(amyRoom.sessionId)))
  await waitFor(() => Boolean(amyState.players.get(alexRoom.sessionId)))
  await waitFor(() => Boolean(adminState.players.get(alexRoom.sessionId)))

  // Normal movement is server-authoritative and speed-limited. Walk in two
  // accepted deltas instead of treating UPDATE_PLAYER as an instant relocation command.
  alexRoom.send(Message.UPDATE_PLAYER, { x: 650, y: 500, anim: 'adam_idle_right' })
  await waitFor(() => alexState.players.get(alexRoom.sessionId)?.x === 650)
  alexRoom.send(Message.UPDATE_PLAYER, { x: 600, y: 500, anim: 'adam_idle_right' })
  amyRoom.send(Message.UPDATE_PLAYER, { x: 700, y: 500, anim: 'lucy_idle_left' })
  await waitFor(() => alexState.players.get(alexRoom.sessionId)?.x === 600 && alexState.players.get(amyRoom.sessionId)?.x === 700)
  let movementCorrection: { x?: number; y?: number } | undefined
  alexRoom.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, (payload: { x?: number; y?: number }) => { movementCorrection = payload })
  alexRoom.send(Message.UPDATE_PLAYER, { x: 1300, y: 500, anim: 'adam_idle_right' })
  await waitFor(() => Boolean(movementCorrection))
  assert.equal(alexState.players.get(alexRoom.sessionId)?.x, 600, 'an oversized position jump must be rejected')

  let combatEvent: CombatEventPayload | undefined
  alexRoom.onMessage(Message.COMBAT_EVENT, (payload: CombatEventPayload) => { if (payload.attackerSessionId === alexRoom.sessionId) combatEvent = payload })
  alexRoom.send(Message.COMBAT_ACTION, { weapon: 'WATER_GUN', directionX: 1, directionY: 0, actionId: `combat:${Date.now()}` })
  await waitFor(() => Boolean(combatEvent))
  assert.equal(combatEvent?.hit, true)
  assert.equal(combatEvent?.targetSessionId, amyRoom.sessionId)
  assert.ok(Math.abs((combatEvent?.originX || 0) - 600) < 1, 'server must use authoritative attacker position')

  let movedRoom = ''
  amyRoom.onMessage(Message.PLAYER_ROOM_CHANGED, (payload: { sessionId: string; currentRoom: string }) => {
    if (payload.sessionId === alexRoom.sessionId) movedRoom = payload.currentRoom
  })
  await walkPlayerTo(alexRoom, { x: 280, y: 230 }, 'adam_idle_up', { x: 600, y: 500 })
  await waitFor(() => movedRoom === 'DESIGN')
  await waitFor(() => amyState.players.get(alexRoom.sessionId)?.currentRoom === 'DESIGN')

  await walkPlayerTo(adminRoom, { x: 1384, y: 216 }, 'adam_idle_up')
  await waitFor(() => adminState.players.get(adminRoom.sessionId)?.currentRoom === 'GAME_LOUNGE')
  let rewardGameId = ''
  adminRoom.onMessage(Message.SOCIAL_REWARD, (payload: { gameId?: string }) => { rewardGameId = payload.gameId || '' })
  await waitFor(() => Boolean(adminState.casinoTables?.get('BACCARAT')?.roundNumber), 5000)
  await waitFor(() => adminState.casinoTables.get('BACCARAT').phase === 'BETTING', 25_000)
  const baccaratRoundId = adminState.casinoTables.get('BACCARAT').roundId
  adminRoom.send(Message.CASINO_ACTION, { mode: 'BACCARAT', action: 'BET', choice: 'PLAYER', amount: 10, actionId: `realtime:${Date.now()}` })
  await waitFor(() => adminState.casinoTables.get('BACCARAT').seats.get(adminRoom.sessionId)?.stake === 10)
  await waitFor(() => rewardGameId === 'BACCARAT')
  await waitFor(() => adminState.casinoTables.get('BACCARAT').roundId === baccaratRoundId && adminState.casinoTables.get('BACCARAT').phase === 'RESULT', 20_000)
  assert.equal(adminState.casinoTables.get('BACCARAT').seats.get(adminRoom.sessionId).status, 'SETTLED')

  await waitFor(() => adminState.casinoTables.get('BLACKJACK').phase === 'BETTING', 25_000)
  adminRoom.send(Message.CASINO_ACTION, { mode: 'BLACKJACK', action: 'BET', choice: 'MAIN', amount: 10, seatIndex: 2, actionId: `blackjack-seat-${Date.now()}` })
  await waitFor(() => adminState.casinoTables.get('BLACKJACK').seats.get(adminRoom.sessionId)?.stake === 10)
  assert.equal(adminState.casinoTables.get('BLACKJACK').seats.get(adminRoom.sessionId).seatIndex, 2)

  const chessTable = adminState.casinoTables.get('CHESS')
  assert.equal(chessTable.phase, 'PLAYER_TURN')
  assert.equal(chessTable.phaseEndsAt, 0)
  rewardGameId = ''
  adminRoom.send(Message.CASINO_ACTION, { mode: 'CHESS', action: 'BET', choice: 'MAIN', amount: 10, actionId: `chess:${Date.now()}` })
  await waitFor(() => Boolean(adminState.casinoTables.get('CHESS').seats.get(adminRoom.sessionId)?.board))
  const initialBoard = adminState.casinoTables.get('CHESS').seats.get(adminRoom.sessionId).board
  assert.ok(initialBoard.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'))
  await waitFor(() => rewardGameId === 'CHESS')
  adminRoom.send(Message.CASINO_ACTION, { mode: 'CHESS', action: 'MOVE', move: 'e2e4', promotion: 'q', actionId: `chess-move:${Date.now()}` })
  await waitFor(() => adminState.casinoTables.get('CHESS').seats.get(adminRoom.sessionId)?.moveCount === 2)
  const chessSeat = adminState.casinoTables.get('CHESS').seats.get(adminRoom.sessionId)
  assert.notEqual(chessSeat.board, initialBoard)
  assert.equal(chessSeat.turn, 'WHITE')
  assert.ok(['PLAYING', 'CHECK'].includes(chessSeat.status))

  const pokerTable = adminState.casinoTables.get('POKER')
  assert.equal(pokerTable.phase, 'PLAYER_TURN')
  assert.equal(pokerTable.phaseEndsAt, 0)
  rewardGameId = ''
  adminRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'SIT_DOWN', amount: 100, actionId: `texas-buyin:${Date.now()}` })
  await waitFor(() => Boolean(adminState.casinoTables.get('POKER').seats.get(adminRoom.sessionId)?.pokerStateJson), 8000)
  await waitFor(() => rewardGameId === 'POKER')
  const firstPokerState = JSON.parse(adminState.casinoTables.get('POKER').seats.get(adminRoom.sessionId).pokerStateJson)
  assert.equal(firstPokerState.players.length, 4)
  assert.ok(['HUMAN_TURN', 'BOT_THINKING'].includes(firstPokerState.turnStatus))
  assert.ok(firstPokerState.turnEndsAt > firstPokerState.turnStartedAt)
  assert.ok(firstPokerState.turnTimeLimitMs > 0)
  assert.equal(firstPokerState.players.filter((player: any) => player.isBot).every((player: any) => player.cards.length === 0), true)
  assert.equal(firstPokerState.players.find((player: any) => player.id === 'HUMAN').cards.length, 2)
  const pokerAction = firstPokerState.legalActions.includes('CHECK') ? 'CHECK' : firstPokerState.legalActions.includes('CALL') ? 'CALL' : 'FOLD'
  adminRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: pokerAction, actionId: `texas-action:${Date.now()}` })
  await waitFor(() => JSON.parse(adminState.casinoTables.get('POKER').seats.get(adminRoom.sessionId).pokerStateJson).actionLog.length > firstPokerState.actionLog.length)
  adminRoom.send(Message.CASINO_ACTION, { mode: 'POKER', action: 'CASH_OUT', actionId: `texas-cashout:${Date.now()}` })
  await waitFor(() => !adminState.casinoTables.get('POKER').seats.get(adminRoom.sessionId))

  await amyRoom.leave()
  await adminRoom.leave()
  await waitFor(() => !alexState.players.get(amyRoom.sessionId))
  await waitFor(() => !alexState.casinoTables.get('CHESS').seats.get(adminRoom.sessionId))
  assert.equal(alexState.casinoTables.get('CHESS').activePlayers, [...alexState.casinoTables.get('CHESS').seats.values()].filter((seat: any) => ['PLAYING', 'CHECK'].includes(seat.status)).length)
  await alexRoom.leave()
  assert.equal(movedRoom, 'DESIGN')
  console.log('Realtime tests passed: presence, server-authoritative walking/combat, Games Wing, Baccarat, Chess AI and Texas Hold’em cash-out')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
