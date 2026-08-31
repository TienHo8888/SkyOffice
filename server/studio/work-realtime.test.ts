import assert from 'assert'
import path from 'path'
import { Client, Room } from 'colyseus.js'
import { Message } from '../../types/Messages'
import { WorkCertificationResult, WorkChallengePublic, WorkReward } from '../../types/Work'
import { createSessionToken } from './auth'
import { StudioStore, studioStore, toUser } from './store'
import { walkPlayerTo } from './realtime-test-helpers'

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(check: () => boolean, timeout = 5_000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) throw new Error('Timed out waiting for work realtime state.')
    await pause(50)
  }
}

function listen<T>(room: Room, message: Message, callback: (payload: T) => void) {
  room.onMessage(message, callback)
}

async function run() {
  const testUsers = ['demo', 'dealer', 'designer', 'qa', 'tohi', 'amy', 'hyo', 'martin', 'haha', 'fifu', 'alex']
    .map((login) => studioStore.getUserByLogin(login))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))
  const actor = testUsers.find((user) => {
    const snapshot = studioStore.getWorkSnapshot(user.studioId, user.id)
    return !snapshot.tutorialCompleted && (snapshot.daily.jobCounts.INBOX_TRIAGE || 0) < 2
  })
  const observer = testUsers.find((user) => user.id !== actor?.id)
  if (!actor || !observer) throw new Error('Two isolated work realtime test accounts are required.')

  const endpoint = process.env.STUDIO_WS_URL || 'ws://127.0.0.1:2567'
  const actorClient = new Client(endpoint)
  const observerClient = new Client(endpoint)
  const actorRoom = await actorClient.joinOrCreate('skyoffice', { token: createSessionToken(toUser(actor)) })
  const observerRoom = await observerClient.joinOrCreate('skyoffice', { token: createSessionToken(toUser(observer)) })
  const actorState = actorRoom.state as any

  ;[actorRoom, observerRoom].forEach((room) => {
    room.onMessage(Message.SEND_ROOM_DATA, () => undefined)
    room.onMessage(Message.WORK_STATE, () => undefined)
    room.onMessage(Message.PLAYER_MOVEMENT_CORRECTION, () => undefined)
  })
  actorRoom.onMessage(Message.WORK_ACTIVITY, () => undefined)

  let actorStarted: { sessionId: string; challenge: WorkChallengePublic; startedAt: number; endsAt: number } | undefined
  let observerStarted: { sessionId: string } | undefined
  let actorResult: WorkReward | undefined
  let observerResult: WorkReward | undefined
  let observerActivity: { message: string; score?: number; coinDelta?: number; careerXp?: number } | undefined

  listen(actorRoom, Message.WORK_SESSION_STARTED, (payload) => { actorStarted = payload as typeof actorStarted })
  listen(observerRoom, Message.WORK_SESSION_STARTED, (payload) => { observerStarted = payload as typeof observerStarted })
  listen(actorRoom, Message.WORK_RESULT, (payload) => { const result = payload as WorkReward | WorkCertificationResult; if (result.mode !== 'CERTIFICATION') actorResult = result })
  listen(observerRoom, Message.WORK_RESULT, (payload) => { const result = payload as WorkReward | WorkCertificationResult; if (result.mode !== 'CERTIFICATION') observerResult = result })
  listen(observerRoom, Message.WORK_ACTIVITY, (payload) => { observerActivity = payload as typeof observerActivity })

  try {
    // Work begins only when the player has physically walked close enough to
    // the Job Board. Movement arrives as small, speed-limited updates.
    await walkPlayerTo(actorRoom, { x: 604, y: 458 }, 'adam_idle_down')
    await waitFor(() => actorState.players.get(actorRoom.sessionId)?.x === 604 && actorState.players.get(actorRoom.sessionId)?.y === 458)

    actorRoom.send(Message.WORK_START, { jobId: 'INBOX_TRIAGE', stationId: 'JOB_BOARD', actionId: `work-start:${Date.now()}` })
    await waitFor(() => Boolean(actorStarted))
    assert.equal(observerStarted, undefined, 'private challenge must not be broadcast to observers')
    assert.ok(actorStarted?.challenge.steps.length)
    assert.ok(!JSON.stringify(actorStarted?.challenge).includes('solutionByStep'))
    assert.ok(!JSON.stringify(actorStarted?.challenge).includes('coinDelta'))

    // Even when the client adds fake payout/score fields, only a valid option
    // from the public challenge is accepted and the server computes the grade.
    actorStarted!.challenge.steps.forEach((step, index) => {
      actorRoom.send(Message.WORK_ACTION, {
        sessionId: actorStarted!.sessionId,
        actionId: `work-action:${index}:${Date.now()}`,
        actionType: 'SELECT_OPTION',
        payload: { stepId: step.id, optionId: step.options[0].id, score: 999, grade: 'S', coinDelta: 999, careerXpDelta: 999 },
      })
    })
    actorRoom.send(Message.WORK_SUBMIT, { sessionId: actorStarted!.sessionId, actionId: `work-submit:${Date.now()}` })
    await waitFor(() => Boolean(actorResult))
    assert.equal(observerResult, undefined, 'wallet receipt must remain private to the actor')
    assert.ok((actorResult?.coinDelta || 0) < 999)
    assert.ok((actorResult?.careerXpDelta || 0) < 999)
    assert.ok(observerActivity)
    assert.equal(observerActivity?.score, undefined)
    assert.equal(observerActivity?.coinDelta, undefined)
    assert.equal(observerActivity?.careerXp, undefined)

    // A disconnect while a job is active settles as ABANDONED and never pays
    // Coin. Use a fresh session after the first tutorial attempt.
    actorStarted = undefined
    actorResult = undefined
    actorRoom.send(Message.WORK_START, { jobId: 'INBOX_TRIAGE', stationId: 'JOB_BOARD', actionId: `work-start-abandon:${Date.now()}` })
    await waitFor(() => Boolean(actorStarted))
    const abandonedSessionId = actorStarted!.sessionId
    // Room.leave() waits for the Colyseus leave acknowledgement. For this
    // scenario the important event is the server observing the disconnect, so
    // close immediately and give the room a short settlement window.
    actorRoom.leave(false).catch(() => undefined)
    await pause(500)
    const persistedStore = new StudioStore(process.env.STUDIO_DB_PATH || path.resolve(__dirname, '../data/studio-db.json'))
    const abandoned = persistedStore.getWorkHistory(actor.studioId, actor.id).find((entry) => entry.sessionId === abandonedSessionId)
    assert.equal(abandoned?.status, 'ABANDONED')
    assert.equal(abandoned?.coinDelta, 0)
  } finally {
    observerRoom.leave(false).catch(() => undefined)
    actorRoom.leave(false).catch(() => undefined)
  }

  console.log('Work realtime tests passed: private challenge/result, sanitized activity, fake payout fields ignored and disconnect abandonment')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
