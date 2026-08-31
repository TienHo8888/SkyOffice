import assert from 'assert'
import { Client, Room } from 'colyseus.js'
import { Message } from '../../types/Messages'
import { SocialEmoteEvent, SocialPartyInvite, SocialPartyState } from '../../types/Social'
import { createSessionToken } from './auth'
import { studioStore, toUser } from './store'
import { walkPlayerTo } from './realtime-test-helpers'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, label: string, timeout = 5000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for party realtime state: ${label}`)
    await pause(40)
  }
}

function requestId(prefix: string) {
  return `party-test:${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function registerQuietHandlers(room: Room) {
  room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
  room.onMessage(Message.PLAYER_ROOM_CHANGED, () => undefined)
  room.onMessage(Message.SOCIAL_EMOTE, () => undefined)
  room.onMessage(Message.SOCIAL_REWARD, () => undefined)
  room.onMessage(Message.PARTY_ERROR, () => undefined)
  room.onMessage(Message.PARTY_EVENT, () => undefined)
  room.onMessage(Message.STUDIO_EVENT, () => undefined)
  room.onMessage(Message.WORK_ACTIVITY, () => undefined)
  room.onMessage(Message.MINI_GAME_EVENT, () => undefined)
  room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
}

async function run() {
  const actor = studioStore.getUserByLogin('demo')
  const friend = studioStore.getUserByLogin('dealer')
  if (!actor || !friend) throw new Error('Default party realtime test accounts are missing.')

  const endpoint = process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567'
  const actorRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(actor)) })
  const friendRoom = await new Client(endpoint).joinOrCreate('skyoffice', { token: createSessionToken(toUser(friend)) })
  const actorState = actorRoom.state as any
  const friendState = friendRoom.state as any
  let actorParty: SocialPartyState | null = null
  let friendParty: SocialPartyState | null = null
  let receivedInvite: SocialPartyInvite | undefined
  const friendEmotes: SocialEmoteEvent[] = []

  registerQuietHandlers(actorRoom)
  registerQuietHandlers(friendRoom)
  actorRoom.onMessage(Message.PARTY_STATE, (payload: SocialPartyState | null) => { actorParty = payload })
  friendRoom.onMessage(Message.PARTY_STATE, (payload: SocialPartyState | null) => { friendParty = payload })
  friendRoom.onMessage(Message.PARTY_INVITE, (payload: SocialPartyInvite) => { receivedInvite = payload })
  friendRoom.onMessage(Message.SOCIAL_EMOTE, (payload: SocialEmoteEvent) => { friendEmotes.push(payload) })

  try {
    actorRoom.send(Message.PARTY_ACTION, { action: 'CREATE', requestId: requestId('create') })
    await waitFor(() => Boolean(actorParty?.partyId), 'party creation')
    assert.equal(actorParty?.leaderId, actor.id)
    assert.deepEqual(actorParty?.members.map((member) => member.userId), [actor.id])

    actorRoom.send(Message.PARTY_ACTION, {
      action: 'INVITE',
      partyId: actorParty!.partyId,
      targetUserId: friend.id,
      requestId: requestId('invite'),
    })
    await waitFor(() => Boolean(receivedInvite), 'party invite delivery')
    assert.equal(receivedInvite?.partyId, actorParty?.partyId)
    assert.equal(receivedInvite?.inviterId, actor.id)

    friendRoom.send(Message.PARTY_ACTION, {
      action: 'ACCEPT',
      inviteId: receivedInvite!.inviteId,
      partyId: receivedInvite!.partyId,
      requestId: requestId('accept'),
    })
    await waitFor(() => Boolean(actorParty && friendParty && actorParty.members.length === 2 && friendParty.members.length === 2), 'party member join')
    assert.equal(friendParty?.leaderId, actor.id)
    assert.ok(actorParty?.members.some((member) => member.userId === friend.id))

    const friendReadyRequestId = requestId('friend-ready')
    friendRoom.send(Message.PARTY_ACTION, { action: 'READY', partyId: friendParty!.partyId, requestId: friendReadyRequestId })
    // Duplicate UI delivery must not toggle Ready back to JOINED.
    friendRoom.send(Message.PARTY_ACTION, { action: 'READY', partyId: friendParty!.partyId, requestId: friendReadyRequestId })
    actorRoom.send(Message.PARTY_ACTION, { action: 'READY', partyId: actorParty!.partyId, requestId: requestId('actor-ready') })
    await waitFor(() => actorParty?.members.every((member) => member.status === 'READY') === true, 'party ready state')

    actorRoom.send(Message.SOCIAL_EMOTE, { actionId: requestId('emote'), emoteId: 'WAVE' })
    await waitFor(() => friendEmotes.length === 1, 'social emote broadcast')
    assert.equal(friendEmotes[0].userId, actor.id)
    assert.equal(friendEmotes[0].emoteId, 'WAVE')
    actorRoom.send(Message.SOCIAL_EMOTE, { actionId: requestId('emote-cooldown'), emoteId: 'HEART' })
    await pause(120)
    assert.equal(friendEmotes.length, 1, 'emotes must respect the server cooldown')

    await walkPlayerTo(friendRoom, { x: 280, y: 230 }, 'dealer_idle_up')
    await waitFor(() => friendState.players.get(friendRoom.sessionId)?.currentRoom === 'DESIGN', 'authoritative party member walking')
    assert.equal(friendState.players.get(friendRoom.sessionId)?.currentRoom, 'DESIGN')
    await walkPlayerTo(friendRoom, { x: 600, y: 430 }, 'dealer_idle_down', { x: 280, y: 230 })
    await waitFor(() => friendState.players.get(friendRoom.sessionId)?.currentRoom === 'LOBBY', 'party member walk back to lobby')

    actorRoom.send(Message.PARTY_ACTION, {
      action: 'ACTIVITY_REQUEST',
      partyId: actorParty!.partyId,
      activityType: 'SOCIAL_GAME',
      mode: 'PAINT_TILES',
      requestId: requestId('paint'),
    })
    await waitFor(() => actorParty?.status === 'IN_ACTIVITY' && friendParty?.status === 'IN_ACTIVITY', 'party activity state')
    await waitFor(() => actorState.miniGame?.status === 'COUNTDOWN', 'party mini game launch')
    assert.equal(actorParty?.activity?.type, 'SOCIAL_GAME')
    assert.equal(actorParty?.activity?.targetId, 'PAINT_TILES')
    assert.equal(actorState.miniGame.attendees.size, 2)

    // Leaving an active party must also remove the member from the owned
    // mini-game; otherwise the party and activity would get stuck at 2/2.
    friendRoom.send(Message.PARTY_ACTION, { action: 'LEAVE', partyId: actorParty!.partyId, requestId: requestId('leave-active') })
    await waitFor(() => friendParty === null, 'active party member leave')
    await waitFor(() => actorParty?.status === 'OPEN', 'party activity cleanup')
    await waitFor(() => actorState.miniGame?.status === 'RESULT', 'mini game result after party member leave')
    assert.equal(actorState.miniGame.status, 'RESULT')
  } finally {
    await actorRoom.leave(false).catch(() => undefined)
    await friendRoom.leave(false).catch(() => undefined)
  }

  console.log('Party realtime tests passed: create, invite/accept, ready state, emote cooldown, authoritative walking and party mini-game launch')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
