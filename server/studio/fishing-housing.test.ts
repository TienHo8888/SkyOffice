import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hashPassword } from './auth'
import { DomainError, StudioStore } from './store'
import { FISH_DEFINITIONS, selectWeightedFish } from '../../types/Fishing'

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-fishing-test-'))
  return { directory, filePath: path.join(directory, 'studio-db.json'), store: new StudioStore(path.join(directory, 'studio-db.json')) }
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof DomainError && error.code === code
}

const studioId = 'studio-rng-1'
const ownerId = 'user-tohi'
const date = '2099-01-01'
const { filePath, store } = makeStore()

assert.equal(selectWeightedFish(FISH_DEFINITIONS, () => 0).id, 'pond_minnow')
assert.equal(selectWeightedFish(FISH_DEFINITIONS, () => 0.6).id, 'leaf_carp')
assert.equal(selectWeightedFish(FISH_DEFINITIONS, () => 0.9).id, 'moon_koi')

const beforeProgression = store.getSocialProgression(studioId, ownerId)
const first = store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0001', utcDate: date, random: () => 0 })
assert.equal(first.catchNumber, 1)
assert.equal(first.fishId, 'pond_minnow')
assert.equal(first.rarity, 'common')
assert.equal(first.quantityAfter, 1)
assert.deepEqual(first.inventory, [{ itemId: 'pond_minnow', quantity: 1 }])
assert.equal(store.getFishingDailyCount(studioId, ownerId, date), 1)

const retry = store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0001', utcDate: date, random: () => 0.99 })
assert.equal(retry.duplicate, true)
assert.equal(retry.catchNumber, first.catchNumber)
assert.deepEqual(retry.inventory, first.inventory)

const second = store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0002', utcDate: date, random: () => 0.61 })
const third = store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0003', utcDate: date, random: () => 0.91 })
assert.equal(second.fishId, 'leaf_carp')
assert.equal(third.fishId, 'moon_koi')
assert.deepEqual(store.getInventory(studioId, ownerId), [
  { itemId: 'leaf_carp', quantity: 1 },
  { itemId: 'moon_koi', quantity: 1 },
  { itemId: 'pond_minnow', quantity: 1 },
])

for (let catchNumber = 4; catchNumber <= 10; catchNumber += 1) {
  store.claimFishingCatch({ userId: ownerId, studioId, requestId: `catch-${String(catchNumber).padStart(4, '0')}`, utcDate: date, random: () => 0 })
}
assert.throws(
  () => store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0011', utcDate: date, random: () => 0 }),
  hasCode('FISHING_DAILY_LIMIT'),
)
assert.equal(store.getInventory(studioId, ownerId).find((stack) => stack.itemId === 'pond_minnow')?.quantity, 8)
assert.equal(store.getFishingDailyCount(studioId, ownerId, date), 10)

// Fish metadata is selected from the canonical catalog even when a test or a
// future caller passes a same-id object with forged rarity/value fields.
const canonicalFish = FISH_DEFINITIONS.find((fish) => fish.id === 'moon_koi')!
const forgedFish = { ...canonicalFish, rarity: 'common' as const, weight: 10000, sellValue: 0 }
const forgedReceipt = store.claimFishingCatch({ userId: ownerId, studioId, requestId: 'catch-0012', utcDate: '2099-01-02', fish: forgedFish })
assert.equal(forgedReceipt.fishId, 'moon_koi')
assert.equal(forgedReceipt.rarity, 'rare')

// Fishing does not touch the existing Coin/EXP/quest progression and another
// player receives a separate inventory stack.
assert.deepEqual(store.getSocialProgression(studioId, ownerId), beforeProgression)
const otherUserCatch = store.claimFishingCatch({ userId: 'user-demo', studioId, requestId: 'other-catch-01', utcDate: date, random: () => 0 })
assert.equal(otherUserCatch.catchNumber, 1)
assert.deepEqual(store.getInventory(studioId, 'user-demo'), [{ itemId: 'pond_minnow', quantity: 1 }])
assert.equal(store.getInventory(studioId, ownerId).find((stack) => stack.itemId === 'pond_minnow')?.quantity, 8)

const reloadedStore = new StudioStore(filePath)
assert.deepEqual(reloadedStore.getInventory(studioId, ownerId), store.getInventory(studioId, ownerId))
assert.deepEqual(reloadedStore.getSocialSnapshot(studioId, ownerId).inventory, store.getInventory(studioId, ownerId))

// Home layout validation keeps the existing 8x6 contract while applying
// rectangular footprints and 90/270-degree rotation swaps.
store.purchaseCosmetic(studioId, ownerId, 'furniture-tiny-table')
const savedLayout = store.updatePropertyLayout(studioId, ownerId, [
  { itemId: 'furniture-tiny-table', x: 7, y: 4, rotation: 90 },
  { itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 },
], { wallStyleId: 'starter_wallpaper', floorStyleId: 'wooden_floor' })
assert.equal(savedLayout.layoutVersion, 2)
assert.equal(savedLayout.styles.wallStyleId, 'starter_wallpaper')
assert.equal(savedLayout.visibility, 'FRIENDS')
assert.throws(
  () => store.updatePropertyLayout(studioId, ownerId, [{ itemId: 'furniture-tiny-table', x: 7, y: 5, rotation: 0 }]),
  hasCode('INVALID_PROPERTY_POSITION'),
)
assert.throws(
  () => store.updatePropertyLayout(studioId, ownerId, [
    { itemId: 'furniture-tiny-table', x: 2, y: 3, rotation: 0 },
    { itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 },
  ]),
  hasCode('INVALID_PROPERTY_OVERLAP'),
)
assert.throws(
  () => store.updatePropertyLayout(studioId, ownerId, [], { wallStyleId: 'blue_wallpaper', floorStyleId: 'wooden_floor' }),
  hasCode('PROPERTY_STYLE_NOT_OWNED'),
)

const friend = store.createUser({ email: 'fishing-friend@studio.local', username: 'fishing_friend', passwordHash: hashPassword('password'), displayName: 'Fishing Friend', avatarUrl: '', role: 'MEMBER', studioId })
const stranger = store.createUser({ email: 'fishing-stranger@studio.local', username: 'fishing_stranger', passwordHash: hashPassword('password'), displayName: 'Fishing Stranger', avatarUrl: '', role: 'MEMBER', studioId })
assert.equal(store.canEnterProperty(studioId, ownerId, friend.id), false)
assert.equal(store.canEnterProperty(studioId, ownerId, stranger.id), false)
const friendRequest = store.requestFriend(studioId, ownerId, friend.id)
store.acceptFriendRequest(studioId, friend.id, friendRequest.id)
assert.equal(store.canEnterProperty(studioId, ownerId, friend.id), true)
assert.equal(store.updatePropertyVisibility(studioId, ownerId, 'PUBLIC').visibility, 'PUBLIC')
assert.equal(store.canEnterProperty(studioId, ownerId, stranger.id), true)
store.blockUser(studioId, ownerId, stranger.id)
assert.equal(store.canEnterProperty(studioId, ownerId, stranger.id), false)

console.log('Fishing/Home tests passed: weighted catches, private idempotent inventory, UTC daily limit, persistence, 8x6 layout validation and property ACL')
