import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { calculateLevel, calculateSocialLevel, socialXpForCurrentLevel, socialXpToNextLevel } from './config'
import { StudioStore } from './store'
import { DEFAULT_CHARACTER_CONFIG, isCharacterConfig } from '../../types/Avatar'

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-os-test-'))
  return new StudioStore(path.join(directory, 'studio-db.json'))
}

const store = makeStore()
const first = store.completeTask('studio-rng-1', 'task-combat-engine', 'user-tohi')
assert.equal(first.task.status, 'DONE')
assert.equal(first.personalProgress.xp, 100)
assert.equal(first.gameXpDelta, 100)
assert.equal(first.gameProgression.gameXp, 100)
assert.equal(first.gameProgression.gameLevel, 2)
assert.equal(first.gameQuests.find((quest) => quest.id === 'daily-mission-2')?.progress, 1)
assert.equal(first.studioProgress.xp, 50)
assert.equal(first.boss?.currentHp, 17000)

assert.throws(
  () => store.completeTask('studio-rng-1', 'task-combat-engine', 'user-tohi'),
  (error: any) => error.code === 'TASK_ALREADY_COMPLETED'
)

const defeatStore = makeStore()
defeatStore.updateTask('studio-rng-1', 'task-combat-engine', { bossDamage: 20000 })
const defeated = defeatStore.completeTask('studio-rng-1', 'task-combat-engine', 'user-tohi')
assert.equal(defeated.boss?.currentHp, 0)
assert.equal(defeated.boss?.status, 'DEFEATED')
assert.equal(calculateLevel(1100), 2)
assert.equal(calculateSocialLevel(1350), 6)
assert.equal(socialXpForCurrentLevel(1400), 1350)
assert.equal(socialXpToNextLevel(1400), 2025)

const questStore = makeStore()
questStore.completeTask('studio-rng-1', 'task-combat-engine', 'user-tohi')
const secondMission = questStore.completeTask('studio-rng-1', 'task-formation-system', 'user-tohi')
assert.equal(secondMission.gameXpDelta, 180)
assert.equal(secondMission.gameProgression.gameXp, 280)
assert.equal(secondMission.gameProgression.gameLevel, 3)
assert.equal(secondMission.gameQuests.find((quest) => quest.id === 'daily-mission-2')?.claimed, true)

const crudStore = makeStore()
assert.equal(crudStore.updateUser('studio-rng-1', 'user-tohi', { avatarKey: 'nancy' }).avatarKey, 'nancy')
const configuredUser = crudStore.updateUser('studio-rng-1', 'user-tohi', { characterConfig: DEFAULT_CHARACTER_CONFIG })
assert.ok(configuredUser.characterConfig)
assert.equal(configuredUser.characterConfig?.slots.weapon, 'weapon-none')
assert.equal(isCharacterConfig(configuredUser.characterConfig), true)
assert.throws(
  () => crudStore.updateUser('studio-rng-1', 'user-tohi', { avatarKey: 'invalid' as any }),
  (error: any) => error.code === 'INVALID_AVATAR'
)
assert.throws(
  () => crudStore.updateUser('studio-rng-1', 'user-tohi', { characterConfig: { ...DEFAULT_CHARACTER_CONFIG, slots: { ...DEFAULT_CHARACTER_CONFIG.slots, hair: 'missing-hair' } } as any }),
  (error: any) => error.code === 'INVALID_CHARACTER_CONFIG'
)
const created = crudStore.createTask('studio-rng-1', { projectId: 'project-hero-battle-h5', sprintId: 'sprint-combat-prototype', title: 'CRUD smoke task', priority: 'HIGH', assigneeId: 'user-tohi' })
assert.equal(created.bossDamage, 400)
assert.equal(crudStore.getQuestByTaskId(created.id)?.questType, 'MAIN')
crudStore.updateTask('studio-rng-1', created.id, { status: 'TODO' })
crudStore.deleteTask('studio-rng-1', created.id)
assert.equal(crudStore.getTask(created.id), undefined)
assert.deepEqual(crudStore.getStudio('studio-rng-1')?.unlocks, [])
const resource = crudStore.createResource('studio-rng-1', 'user-tohi', { title: 'QA evidence', kind: 'BUILD', url: 'https://example.com/qa', tags: ['qa', 'release'] })
assert.equal(crudStore.getResources('studio-rng-1').find((item) => item.id === resource.id)?.title, 'QA evidence')

const cardStore = makeStore()
assert.equal(cardStore.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 1000)
const baccaratWin = cardStore.settleBaccaratBet('studio-rng-1', 'user-tohi', 'baccarat-smoke', 1, 'PLAYER', 'PLAYER')
assert.equal(baccaratWin.coinDelta, 10)
assert.equal(baccaratWin.coinBalance, 1010)
const baccaratDuplicate = cardStore.settleBaccaratBet('studio-rng-1', 'user-tohi', 'baccarat-smoke', 1, 'PLAYER', 'PLAYER')
assert.equal(baccaratDuplicate.duplicate, true)
assert.equal(baccaratDuplicate.coinBalance, 1010)
const diceLoss = cardStore.settleDiceRoll('studio-rng-1', 'user-tohi', 'dice-smoke', 1, 'LOSS')
assert.equal(diceLoss.coinDelta, -10)
assert.equal(diceLoss.coinBalance, 1000)
const luckyDraw = cardStore.settleLuckyDraw('studio-rng-1', 'user-tohi', 'lucky-smoke', 1, 25)
assert.equal(luckyDraw.coinDelta, 20)
assert.equal(luckyDraw.coinBalance, 1020)

console.log('Studio domain tests passed: completion, idempotency, boss defeat, level calculation, task/resource CRUD, card-game wallet settlement')
