import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SOCIAL_TITLES } from '../../types/Social'
import { WorkActionRecord, WorkCareerId, WorkJobDefinition } from '../../types/Work'
import { WORK_CAREER_DEFINITIONS, WORK_JOB_DEFINITIONS, WORK_RANK_DEFINITIONS } from '../../types/Work'
import { workEconomy, workSalaryBonus, workSalaryForRank } from './work-config'
import { createWorkChallenge, evaluateWorkChallenge, workGradeReward } from './work-rules'
import { buildCareerQuestionBank, workCareerQuestionBankSizes } from './work-question-bank'
import { StudioStore } from './store'

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-work-test-'))
  return new StudioStore(path.join(directory, 'studio-db.json'))
}

function solvedActions(challenge: ReturnType<typeof createWorkChallenge>): WorkActionRecord[] {
  return Object.entries(challenge.solutionByStep).map(([stepId, optionId], index) => ({
    actionId: `answer-${index}`,
    stepId,
    optionId,
    receivedAt: index + 1,
  }))
}

function settle(store: StudioStore, sessionId: string, job: WorkJobDefinition, careerId?: WorkCareerId, options: { abandoned?: boolean; expired?: boolean } = {}) {
  const challenge = createWorkChallenge(job, sessionId, 'JOB', careerId)
  return store.settleWorkJob('studio-rng-1', 'user-tohi', {
    sessionId,
    jobId: job.id,
    careerId,
    challenge,
    actions: solvedActions(challenge),
    elapsedMs: 1_000,
    ...options,
  })
}

const launchJobs = WORK_JOB_DEFINITIONS.filter((job) => job.id === 'INBOX_TRIAGE' || job.careerIds.length === 1)
assert.deepEqual(WORK_CAREER_DEFINITIONS.map((career) => career.id), ['ART', 'ANIMATION', 'GAME_DESIGN', 'FRONTEND', 'BACKEND', 'QA', 'QC', 'PM', 'HR'])
assert.deepEqual(WORK_RANK_DEFINITIONS.map((rank) => rank.id), ['INTERN', 'APPRENTICE', 'JUNIOR', 'SPECIALIST', 'SENIOR', 'LEAD'])
assert.deepEqual(SOCIAL_TITLES.filter((title) => title.careerId).map((title) => title.careerId), WORK_CAREER_DEFINITIONS.map((career) => career.id))
WORK_CAREER_DEFINITIONS.forEach((career) => {
  const bank = buildCareerQuestionBank(career.id)
  assert.ok(bank.length >= 1_000, `${career.id} must have at least 1,000 questions`)
  assert.equal(bank.length, workCareerQuestionBankSizes[career.id])
  assert.equal(new Set(bank.map((question) => question.id)).size, bank.length, `${career.id} question ids must be unique`)
  assert.equal(new Set(bank.map((question) => question.prompt)).size, bank.length, `${career.id} prompts must be unique`)
  assert.deepEqual([...new Set(bank.map((question) => question.difficulty))], [1, 2, 3, 4, 5, 6])
  const normalizedPrompts = bank.map((question) => `${question.topic} ${question.prompt}`.toLowerCase()).join('\n')
  ;['slot', 'betting', 'card game', 'crash', 'responsible'].forEach((domain) => assert.ok(normalizedPrompts.includes(domain), `${career.id} must cover ${domain}`))
  assert.ok(bank.some((question) => question.image), `${career.id} must include visual questions`)
})
assert.equal(workSalaryForRank('INTERN'), 100)
assert.equal(workSalaryForRank('LEAD'), 350)
assert.equal(workSalaryBonus(2, 100), 0)
assert.equal(workSalaryBonus(3, 100), 5)
assert.equal(workSalaryBonus(7, 210), 21)
assert.equal(workSalaryBonus(99, 210), 21)
assert.equal(workGradeReward(45, 'S', 'coin'), 56)
assert.equal(workGradeReward(50, 'S', 'careerXp'), 60)
assert.equal(workGradeReward(45, 'B', 'coin'), 36)

const store = makeStore()
const initial = store.getWorkSnapshot('studio-rng-1', 'user-tohi')
assert.equal(initial.progression.currentCareerId, undefined)
assert.equal(initial.progression.currentRank, 'INTERN')
assert.equal(initial.coinBalance, 1000)
assert.equal(initial.salary.state, 'LOCKED')
assert.equal(initial.progression.careers.length, 9)
assert.equal(initial.tutorialCompleted, false)

const inbox = WORK_JOB_DEFINITIONS.find((job) => job.id === 'INBOX_TRIAGE')!
const tutorialReward = settle(store, 'work-tutorial-1', inbox)
assert.equal(tutorialReward.grade, 'S')
assert.equal(tutorialReward.coinDelta, 38)
assert.equal(tutorialReward.careerXpDelta, 0)
assert.equal(store.getWorkSnapshot('studio-rng-1', 'user-tohi').tutorialCompleted, true)

const selected = store.selectCareer('studio-rng-1', 'user-tohi', 'ART')
assert.equal(selected.currentCareerId, 'ART')
assert.equal(selected.currentRank, 'INTERN')
assert.throws(
  () => store.selectCareer('studio-rng-1', 'user-tohi', 'QA'),
  (error: any) => error.code === 'CAREER_ALREADY_SELECTED'
)

const palette = WORK_JOB_DEFINITIONS.find((job) => job.id === 'PALETTE_MATCH')!
const artRewardOne = settle(store, 'work-art-1', palette, 'ART')
const artRewardTwo = settle(store, 'work-art-2', palette, 'ART')
assert.equal(artRewardOne.coinDelta, 44)
assert.equal(artRewardOne.careerXpDelta, 42)
assert.equal(artRewardTwo.careerXp, 84)
assert.equal(store.getWorkSnapshot('studio-rng-1', 'user-tohi').daily.completedJobs, 3)
assert.equal(store.getWorkSnapshot('studio-rng-1', 'user-tohi').salary.state, 'READY')

const beforeDuplicate = store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance
const duplicate = settle(store, 'work-art-1', palette, 'ART')
assert.equal(duplicate.duplicate, true)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, beforeDuplicate)

const salary = store.claimDailySalary('studio-rng-1', 'user-tohi')
assert.equal(salary.baseSalary, 100)
assert.equal(salary.streakBonus, 0)
assert.equal(salary.coinDelta, 100)
const salaryRetry = store.claimDailySalary('studio-rng-1', 'user-tohi')
assert.equal(salaryRetry.duplicate, true)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, beforeDuplicate + 100)
const publicWorkActivities = (store as any).state.activities.filter((entry: any) => entry.type === 'WORK_COMPLETED' || entry.type === 'WORK_SALARY')
assert.equal(publicWorkActivities.every((entry: any) => !entry.metadata || (!('coins' in entry.metadata) && !('careerXp' in entry.metadata) && !('score' in entry.metadata))), true)

const cooldownNow = Date.now()
const firstChange = store.changeCareer('studio-rng-1', 'user-tohi', 'ANIMATION', cooldownNow)
assert.equal(firstChange.currentCareerId, 'ANIMATION')
assert.throws(
  () => store.changeCareer('studio-rng-1', 'user-tohi', 'ART', cooldownNow),
  (error: any) => error.code === 'CAREER_CHANGE_COOLDOWN'
)
const changed = store.changeCareer('studio-rng-1', 'user-tohi', 'ART', cooldownNow + workEconomy.careerChangeCooldownMs + 1)
assert.equal(changed.currentCareerId, 'ART')
assert.equal(changed.careers.find((career) => career.careerId === 'ART')?.careerXp, 84)
assert.equal(changed.careers.find((career) => career.careerId === 'ANIMATION')?.careerXp, 0)

const careerTitleStore = makeStore()
settle(careerTitleStore, 'career-title-tutorial', inbox)
careerTitleStore.selectCareer('studio-rng-1', 'user-tohi', 'ART')
const artTitle = SOCIAL_TITLES.find((title) => title.careerId === 'ART')!
const animationTitle = SOCIAL_TITLES.find((title) => title.careerId === 'ANIMATION')!
assert.equal(artTitle.requiredCareerRank, 'APPRENTICE')
assert.throws(
  () => careerTitleStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { titleId: artTitle.id }),
  (error: any) => error.code === 'TITLE_RANK_LOCKED'
)
const artProgress = (careerTitleStore as any).state.workCareerProgress.find((entry: any) => entry.userId === 'user-tohi' && entry.careerId === 'ART')
artProgress.careerXp = 300
artProgress.rank = 'APPRENTICE'
assert.equal(careerTitleStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { titleId: artTitle.id }).titleId, artTitle.id)
assert.equal(careerTitleStore.getPublicSocialProfile('studio-rng-1', 'user-tohi').title, artTitle.name)
assert.throws(
  () => careerTitleStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { titleId: animationTitle.id }),
  (error: any) => error.code === 'TITLE_CAREER_MISMATCH'
)
careerTitleStore.changeCareer('studio-rng-1', 'user-tohi', 'ANIMATION', Date.now())
assert.equal(careerTitleStore.getSocialLoadout('studio-rng-1', 'user-tohi').titleId, undefined)

const sessionLockStore = makeStore()
assert.equal(sessionLockStore.beginWorkSession('user-tohi'), true)
assert.equal(sessionLockStore.beginWorkSession('user-tohi'), false)
assert.throws(
  () => sessionLockStore.changeCareer('studio-rng-1', 'user-tohi', 'QA'),
  (error: any) => error.code === 'WORK_SESSION_ACTIVE'
)
sessionLockStore.endWorkSession('user-tohi')
assert.equal(sessionLockStore.hasActiveWorkSession('user-tohi'), false)

const abandonedStore = makeStore()
settle(abandonedStore, 'work-abandon-tutorial', inbox)
abandonedStore.selectCareer('studio-rng-1', 'user-tohi', 'QA')
const bugHunt = WORK_JOB_DEFINITIONS.find((job) => job.id === 'BUG_HUNT')!
const abandoned = settle(abandonedStore, 'work-abandoned', bugHunt, 'QA', { abandoned: true })
assert.equal(abandoned.coinDelta, 0)
assert.equal(abandoned.careerXpDelta, 10)
const abandonedSnapshot = abandonedStore.getWorkSnapshot('studio-rng-1', 'user-tohi')
assert.equal(abandonedSnapshot.daily.completedJobs, 1)
assert.equal(abandonedSnapshot.salary.state, 'LOCKED')
assert.equal(abandonedSnapshot.history.find((entry) => entry.sessionId === 'work-abandoned')?.status, 'ABANDONED')

const expired = settle(abandonedStore, 'work-expired', bugHunt, 'QA', { expired: true })
assert.equal(expired.coinDelta, 0)
assert.equal(abandonedStore.getWorkSnapshot('studio-rng-1', 'user-tohi').daily.completedJobs, 1)

const expiredSalaryStore = makeStore()
const expiredState = (expiredSalaryStore as any).state
expiredState.workProfiles.find((entry: any) => entry.userId === 'user-tohi').currentCareerId = 'QA'
const yesterday = new Date()
yesterday.setUTCDate(yesterday.getUTCDate() - 1)
expiredState.workDailyStats.push({ userId: 'user-tohi', date: yesterday.toISOString().slice(0, 10), completedJobs: 3, paidJobs: 3, sessionCount: 3, careerXpEarned: 150, jobCounts: {}, salaryClaimed: false })
assert.equal(expiredSalaryStore.getWorkSnapshot('studio-rng-1', 'user-tohi').salary.state, 'EXPIRED')

// Every launch career has a deterministic, server-owned resolver. Solving the
// generated challenge with its private answer map must yield a full score.
launchJobs.forEach((job) => {
  const careerId = job.careerIds[0]
  const challenge = createWorkChallenge(job, `resolver-${job.id}`, 'JOB', careerId)
  const score = evaluateWorkChallenge(challenge, solvedActions(challenge), 1_000)
  assert.equal(score.grade, 'S', job.id)
  assert.equal(score.accuracy, 100, job.id)
  assert.equal(score.completion, 100, job.id)
})

const frontendJob = WORK_JOB_DEFINITIONS.find((job) => job.id === 'UI_COMPONENT_ASSEMBLY')!
const internChallenge = createWorkChallenge(frontendJob, 'difficulty-intern', 'JOB', 'FRONTEND', undefined, 'INTERN')
const leadChallenge = createWorkChallenge(frontendJob, 'difficulty-lead', 'JOB', 'FRONTEND', undefined, 'LEAD')
assert.equal(internChallenge.publicChallenge.difficulty, 1)
assert.equal(leadChallenge.publicChallenge.difficulty, 6)
assert.equal(leadChallenge.publicChallenge.questionBankSize, 3_456)
assert.equal(leadChallenge.publicChallenge.steps.every((step) => step.title.startsWith('Lãnh đạo')), true)

const certStore = makeStore()
settle(certStore, 'cert-tutorial', inbox)
certStore.selectCareer('studio-rng-1', 'user-tohi', 'ART')
const certCareer = (certStore as any).state.workCareerProgress.find((entry: any) => entry.userId === 'user-tohi' && entry.careerId === 'ART')
certCareer.careerXp = 300
const certificationChallenge = createWorkChallenge(palette, 'cert-fail', 'CERTIFICATION', 'ART', 'APPRENTICE')
const failedCertification = certStore.completeWorkCertification('studio-rng-1', 'user-tohi', {
  sessionId: 'cert-fail', careerId: 'ART', targetRank: 'APPRENTICE', challenge: certificationChallenge,
  actions: [], elapsedMs: 1_000,
})
assert.equal(failedCertification.passed, false)
assert.equal(failedCertification.currentRank, 'INTERN')
assert.equal(certCareer.careerXp, 300)
const passedChallenge = createWorkChallenge(palette, 'cert-pass', 'CERTIFICATION', 'ART', 'APPRENTICE')
const passedCertification = certStore.completeWorkCertification('studio-rng-1', 'user-tohi', {
  sessionId: 'cert-pass', careerId: 'ART', targetRank: 'APPRENTICE', challenge: passedChallenge,
  actions: solvedActions(passedChallenge), elapsedMs: 1_000,
})
assert.equal(passedCertification.passed, true)
assert.equal(passedCertification.promoted, true)
assert.equal(passedCertification.currentRank, 'APPRENTICE')
const certificationRetry = certStore.completeWorkCertification('studio-rng-1', 'user-tohi', {
  sessionId: 'cert-pass', careerId: 'ART', targetRank: 'APPRENTICE', challenge: passedChallenge,
  actions: solvedActions(passedChallenge), elapsedMs: 1_000,
})
assert.equal(certificationRetry.duplicate, true)

console.log('Work domain tests passed: 9 careers x 3,456 professional/iGaming questions, rank-scaled difficulty, deterministic scoring, progression, salary, certification and idempotency')
