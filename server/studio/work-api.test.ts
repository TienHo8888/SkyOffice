import assert from 'assert'
import http from 'http'
import express from 'express'
import { WORK_JOB_DEFINITIONS } from '../../types/Work'
import { createSessionToken } from './auth'
import { createStudioApi } from './api'
import { markOnline, resetPresence } from './presence'
import { StudioStore, toUser } from './store'
import { createWorkChallenge } from './work-rules'

function makeStore() {
  const directory = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'studio-work-api-test-'))
  return new StudioStore(require('path').join(directory, 'studio-db.json'))
}

function request(baseUrl: string, path: string, token?: string, method = 'GET', body?: unknown): Promise<{ status: number; payload: any }> {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(`${baseUrl}${path}`)
    const requestBody = body === undefined ? '' : JSON.stringify(body)
    const requestObject = http.request({
      hostname: requestUrl.hostname,
      port: Number(requestUrl.port),
      path: `${requestUrl.pathname}${requestUrl.search}`,
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(requestBody ? { 'content-length': Buffer.byteLength(requestBody) } : {}) },
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => resolve({ status: response.statusCode || 0, payload: raw ? JSON.parse(raw) : {} }))
    })
    requestObject.on('error', reject)
    if (requestBody) requestObject.write(requestBody)
    requestObject.end()
  })
}

function settleSolved(store: StudioStore, sessionId: string, jobId: 'INBOX_TRIAGE' | 'PALETTE_MATCH' = 'INBOX_TRIAGE', careerId?: 'ART') {
  const job = WORK_JOB_DEFINITIONS.find((entry) => entry.id === jobId)!
  const challenge = createWorkChallenge(job, sessionId, 'JOB', careerId)
  return store.settleWorkJob('studio-rng-1', 'user-tohi', {
    sessionId,
    jobId,
    careerId,
    challenge,
    actions: Object.entries(challenge.solutionByStep).map(([stepId, optionId], index) => ({ actionId: `api-action-${index}`, stepId, optionId, receivedAt: index })),
    elapsedMs: 1_000,
  })
}

async function run() {
  const store = makeStore()
  const user = store.getUserByLogin('tohi')!
  const member = store.getUserByLogin('demo')!
  const app = express()
  app.use(express.json())
  app.use('/api', createStudioApi(store))
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${address.port}/api`
  const token = createSessionToken(toUser(user))
  const memberToken = createSessionToken(toUser(member))

  try {
    const unauthenticated = await request(baseUrl, '/work')
    assert.equal(unauthenticated.status, 401)

    const initial = await request(baseUrl, '/work', memberToken)
    assert.equal(initial.status, 200)
    assert.equal(initial.payload.progression.currentCareerId, undefined)
    assert.equal(initial.payload.careers.length, 9)

    const selectTooEarly = await request(baseUrl, '/work/career/select', token, 'POST', { careerId: 'QA' })
    assert.equal(selectTooEarly.status, 409)
    assert.equal(selectTooEarly.payload.code, 'WORK_TUTORIAL_REQUIRED')

    settleSolved(store, 'api-tutorial')
    store.selectCareer('studio-rng-1', user.id, 'ART')
    settleSolved(store, 'api-art-1', 'PALETTE_MATCH', 'ART')
    settleSolved(store, 'api-art-2', 'PALETTE_MATCH', 'ART')

    resetPresence()
    markOnline({ userId: user.id, displayName: user.displayName, role: user.role, x: 610, y: 610, currentRoom: 'LOBBY' })
    const wrongLocation = await request(baseUrl, '/work/salary/claim', token, 'POST', {})
    assert.equal(wrongLocation.status, 409)
    assert.equal(wrongLocation.payload.code, 'PAYROLL_LOCATION_REQUIRED')

    markOnline({ userId: user.id, displayName: user.displayName, role: user.role, x: 610, y: 610, currentRoom: 'MEETING' })
    const receipt = await request(baseUrl, '/work/salary/claim', token, 'POST', {})
    assert.equal(receipt.status, 200)
    assert.equal(receipt.payload.coinDelta, 100)
    const retry = await request(baseUrl, '/work/salary/claim', token, 'POST', {})
    assert.equal(retry.status, 200)
    assert.equal(retry.payload.duplicate, true)

    const history = await request(baseUrl, '/work/history', token)
    assert.equal(history.status, 200)
    assert.equal(history.payload.every((entry: { userId?: string }) => entry.userId === undefined), true)
  } finally {
    resetPresence()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  console.log('Work API tests passed: auth, member access, tutorial gate, payroll location validation and salary idempotency')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
