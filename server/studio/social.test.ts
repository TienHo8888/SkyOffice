import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hashPassword } from './auth'
import { StudioStore } from './store'
import { SOCIAL_TITLES } from '../../types/Social'
import {
  DEFAULT_CHARACTER_CONFIG,
  getAvatarAssetPath,
  getAvatarCatalogItem,
  normalizeCharacterConfig,
} from '../../types/Avatar'

function makeStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-social-test-'))
  return new StudioStore(path.join(directory, 'studio-db.json'))
}

const store = makeStore()
assert.equal(store.getUserByLogin('demo')?.displayName, 'Demo Player')
assert.equal(store.getUserByLogin('dealer')?.displayName, 'Dealer Bot')
assert.equal(store.getUserByLogin('demo')?.characterConfig?.slots.body, 'body-male')
assert.equal(store.getUserByLogin('demo')?.avatarRevision, 1)

const teenConfig = normalizeCharacterConfig({
  ...DEFAULT_CHARACTER_CONFIG,
  bodyProfile: 'teen',
  slots: {
    ...DEFAULT_CHARACTER_CONFIG.slots,
    body: 'body-teen',
  },
})
assert.equal(teenConfig.bodyProfile, 'teen')
assert.equal(teenConfig.slots.body, 'body-teen')
assert.match(getAvatarAssetPath(getAvatarCatalogItem(teenConfig.slots.top, 'top'), teenConfig.bodyProfile, 'idle') || '', /\/top\/tshirt\/teen\/idle\.png$/)
assert.match(getAvatarAssetPath(getAvatarCatalogItem(teenConfig.slots.bottom, 'bottom'), teenConfig.bodyProfile, 'idle') || '', /\/bottom\/pants\/teen\/idle\.png$/)
assert.match(getAvatarAssetPath(getAvatarCatalogItem(teenConfig.slots.shoes, 'shoes'), teenConfig.bodyProfile, 'idle') || '', /\/shoes\/basic\/teen\/idle\.png$/)
assert.match(getAvatarAssetPath(getAvatarCatalogItem('shop-top-001', 'top'), 'teen', 'idle') || '', /\/shop\/top\/001\/teen\/idle\.png$/)
const initial = store.getSocialProgression('studio-rng-1', 'user-tohi')
assert.equal(initial.coinBalance, 1000)
assert.equal(initial.gameXp, 0)

const shopStore = makeStore()
const outfitCatalog = shopStore.getSocialCatalog().filter((item) => item.slot === 'OUTFIT')
assert.ok(outfitCatalog.length >= 12)
assert.ok(outfitCatalog.every((item) => item.outfit?.slots.top && item.outfit.slots.bottom && item.outfit.slots.shoes))
for (const category of ['TOPS', 'BOTTOMS', 'HEADWEAR', 'FOOTWEAR', 'ACCESSORIES'] as const) {
  assert.equal(outfitCatalog.filter((item) => item.wardrobe?.category === category).length, 100)
}
const wardrobeStore = makeStore()
const hatProduct = wardrobeStore.getSocialCatalog().find((item) => item.wardrobe?.category === 'HEADWEAR')!
assert.ok(hatProduct.wardrobe)
assert.equal(wardrobeStore.purchaseCosmetic('studio-rng-1', 'user-tohi', hatProduct.id).duplicate, false)
const hatLoadout = wardrobeStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { hatId: hatProduct.wardrobe!.itemId })
assert.equal(hatLoadout.hatId, hatProduct.wardrobe!.itemId)
assert.equal(wardrobeStore.getUserById('user-tohi')?.characterConfig?.slots.hat, hatProduct.wardrobe!.itemId)
assert.equal(shopStore.getOwnedCosmetics('studio-rng-1', 'user-tohi').includes('outfit-starter-green'), true)
const purchasedOutfit = shopStore.purchaseCosmetic('studio-rng-1', 'user-tohi', 'outfit-art-pastel')
assert.equal(purchasedOutfit.duplicate, false)
assert.equal(shopStore.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 100)
const equippedOutfit = shopStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { outfitId: 'outfit-art-pastel' })
assert.equal(equippedOutfit.outfitId, 'outfit-art-pastel')
assert.equal(shopStore.getUserById('user-tohi')?.characterConfig?.slots.top, 'top-scoop')
assert.equal(shopStore.getUserById('user-tohi')?.characterConfig?.slots.bottom, 'bottom-short-shorts')
assert.equal(shopStore.getUserById('user-tohi')?.characterConfig?.slots.shoes, 'shoes-sandals')
const mixedWardrobe = shopStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { topId: 'top-tshirt' })
assert.equal(mixedWardrobe.topId, 'top-tshirt')
assert.equal(mixedWardrobe.bottomId, 'bottom-short-shorts')
assert.equal(mixedWardrobe.outfitId, undefined)
assert.equal(shopStore.getUserById('user-tohi')?.characterConfig?.slots.top, 'top-tshirt')
assert.equal(shopStore.getUserById('user-tohi')?.characterConfig?.slots.bottom, 'bottom-short-shorts')
assert.throws(
  () => shopStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { bottomId: 'bottom-formal-striped' }),
  (error: any) => error.code === 'WARDROBE_ITEM_NOT_OWNED'
)
const purchaseRetry = shopStore.purchaseCosmetic('studio-rng-1', 'user-tohi', 'outfit-art-pastel')
assert.equal(purchaseRetry.duplicate, true)
assert.equal(shopStore.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 100)

const titleStore = makeStore()
assert.equal(SOCIAL_TITLES.length, 19)
assert.equal(SOCIAL_TITLES.filter((title) => title.achievement).length, 9)
assert.equal(titleStore.getSocialLoadout('studio-rng-1', 'user-tohi').titleId, undefined)
const pokerTitle = SOCIAL_TITLES.find((title) => title.achievement?.gameId === 'POKER')!
assert.equal(pokerTitle.achievement?.target, 1_000)
assert.equal(titleStore.getSocialSnapshot('studio-rng-1', 'user-tohi').titleProgress.find((progress) => progress.gameId === 'POKER')?.winningCoins, 0)
assert.throws(
  () => titleStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { titleId: pokerTitle.id }),
  (error: any) => error.code === 'TITLE_ACHIEVEMENT_LOCKED'
)
titleStore.placeCasinoWager('studio-rng-1', 'user-tohi', 'POKER', 'title-poker-round-1', 'buy-in', 100)
titleStore.settleCasinoPayout('studio-rng-1', 'user-tohi', 'POKER', 'title-poker-round-1', 'cash-out', 1_100, { stake: 100, result: 'WIN' })
assert.equal(titleStore.getSocialSnapshot('studio-rng-1', 'user-tohi').titleProgress.find((progress) => progress.gameId === 'POKER')?.winningCoins, 1_000)
assert.equal(titleStore.updateSocialLoadout('studio-rng-1', 'user-tohi', { titleId: pokerTitle.id }).titleId, pokerTitle.id)
titleStore.placeCasinoWager('studio-rng-1', 'user-tohi', 'POKER', 'title-poker-round-2', 'buy-in', 100)
titleStore.settleCasinoPayout('studio-rng-1', 'user-tohi', 'POKER', 'title-poker-round-2', 'cash-out', 0, { stake: 100, result: 'LOSS' })
assert.equal(titleStore.getSocialLoadout('studio-rng-1', 'user-tohi').titleId, pokerTitle.id)

const daily = store.claimDailySocialReward('studio-rng-1', 'user-tohi')
assert.equal(daily.coinDelta, 100)
assert.equal(daily.gameXpDelta, 50)
const dailyRetry = store.claimDailySocialReward('studio-rng-1', 'user-tohi')
assert.equal(dailyRetry.duplicate, true)
assert.equal(dailyRetry.coinDelta, 0)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 1100)

const round = { roundId: 'treasure-round-1', gameId: 'TREASURE_HUNT' as const, winnerIds: ['user-tohi'], participants: [{ userId: 'user-tohi', score: 3, eligible: true }] }
const reward = store.settleSocialRound('studio-rng-1', round)
assert.equal(reward[0].coinDelta, 50)
assert.equal(reward[0].gameXpDelta, 50)
assert.equal(reward[0].gameLevel, 2)
assert.equal(reward[0].xpForCurrentLevel, 100)
assert.equal(reward[0].gameQuests?.find((quest) => quest.id === 'daily-play-3')?.progress, 1)
assert.equal(reward[0].gameQuests?.find((quest) => quest.id === 'daily-win-2')?.progress, 1)
const rewardRetry = store.settleSocialRound('studio-rng-1', round)
assert.equal(rewardRetry[0].duplicate, true)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 1150)

assert.throws(
  () => store.purchaseCosmetic('studio-rng-1', 'user-tohi', 'nameplate-neon'),
  (error: any) => error.code === 'INSUFFICIENT_COIN' || error.code === 'COSMETIC_LOCKED'
)
assert.throws(
  () => store.updatePropertyLayout('studio-rng-1', 'user-tohi', [{ itemId: 'furniture-starter-chair', x: 8, y: 0, rotation: 0 }]),
  (error: any) => error.code === 'INVALID_PROPERTY_POSITION'
)

const friend = store.createUser({ email: 'friend@studio.local', username: 'friend', passwordHash: hashPassword('password'), displayName: 'Friend', avatarUrl: '', role: 'MEMBER', studioId: 'studio-rng-1' })
store.updateUser('studio-rng-1', friend.id, { displayName: 'Friend Ash', avatarKey: 'ash' })
assert.equal(store.getSocialLoadout('studio-rng-1', friend.id).avatarKey, 'ash')
const profileBefore = store.getPublicSocialProfile('studio-rng-1', friend.id, 'user-tohi')
assert.equal(profileBefore.displayName, 'Friend Ash')
assert.equal(profileBefore.avatarKey, 'ash')
assert.equal(profileBefore.property.visitCount, 1)
const profileAfterRetry = store.getPublicSocialProfile('studio-rng-1', friend.id, 'user-tohi')
assert.equal(profileAfterRetry.property.visitCount, 1)
assert.equal(profileAfterRetry.avatar.characterConfig.slots.body, 'body-male')
const liked = store.likeProperty('studio-rng-1', 'user-tohi', friend.id)
assert.equal(liked.likes, 1)
assert.equal(store.likeProperty('studio-rng-1', 'user-tohi', friend.id).likes, 1)

const gift = store.giftPropertyFurniture('studio-rng-1', friend.id, 'user-tohi', 'furniture-plaza-lamp', 'gift-social-test-1')
assert.equal(gift.duplicate, false)
assert.equal(store.getOwnedCosmetics('studio-rng-1', 'user-tohi').includes('furniture-plaza-lamp'), true)
const giftRetry = store.giftPropertyFurniture('studio-rng-1', friend.id, 'user-tohi', 'furniture-plaza-lamp', 'gift-social-test-1')
assert.equal(giftRetry.duplicate, true)
assert.equal(store.getSocialProgression('studio-rng-1', friend.id).coinBalance, 800)

const transfer = store.transferCoins('studio-rng-1', 'user-tohi', friend.id, 75, 'trade-social-test-1')
assert.equal(transfer.duplicate, false)
assert.equal(transfer.amount, 75)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 1075)
assert.equal(store.getSocialProgression('studio-rng-1', friend.id).coinBalance, 875)

// Social Identity + friend graph foundation: the canonical avatar is shared by
// profile/friend views, friend requests are directional and notifications are
// private to the recipient, while block removes the relationship from search.
const foundationStore = makeStore()
const foundationActor = foundationStore.getUserByLogin('demo')!
const foundationFriend = foundationStore.createUser({ email: 'foundation-friend@studio.local', username: 'foundation_friend', passwordHash: hashPassword('password'), displayName: 'Foundation Friend', avatarUrl: '', avatarKey: 'lucy', role: 'MEMBER', studioId: foundationActor.studioId })
assert.equal(foundationStore.getAvatarSnapshot(foundationActor.studioId, foundationFriend.id).revision, 1)
foundationStore.updateUser(foundationActor.studioId, foundationFriend.id, { avatarKey: 'ash' })
const updatedIdentity = foundationStore.getAvatarSnapshot(foundationActor.studioId, foundationFriend.id)
assert.equal(updatedIdentity.avatarKey, 'ash')
assert.equal(updatedIdentity.revision, 2)
const pendingFriendship = foundationStore.requestFriend(foundationActor.studioId, foundationActor.id, foundationFriend.id)
assert.equal(pendingFriendship.status, 'PENDING')
assert.equal(foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationActor.id).outgoingRequests[0].userId, foundationFriend.id)
const friendInbox = foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationFriend.id)
assert.equal(friendInbox.incomingRequests[0].userId, foundationActor.id)
assert.equal(friendInbox.unreadNotifications, 1)
foundationStore.acceptFriendRequest(foundationActor.studioId, foundationFriend.id, pendingFriendship.id)
assert.equal(foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationActor.id).friends[0].displayName, foundationFriend.displayName)
const actorNotifications = foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationActor.id).notifications
assert.equal(actorNotifications.some((notification) => notification.type === 'FRIEND_ACCEPTED' && notification.actorId === foundationFriend.id), true)
foundationStore.markAllSocialNotificationsRead(foundationActor.studioId, foundationActor.id)
assert.equal(foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationActor.id).unreadNotifications, 0)
foundationStore.blockUser(foundationActor.studioId, foundationActor.id, foundationFriend.id)
assert.equal(foundationStore.getSocialPeopleSnapshot(foundationActor.studioId, foundationActor.id).friends.length, 0)
assert.equal(foundationStore.searchSocialPeople(foundationActor.studioId, foundationActor.id, 'foundation').length, 0)
foundationStore.unblockUser(foundationActor.studioId, foundationActor.id, foundationFriend.id)
assert.equal(foundationStore.searchSocialPeople(foundationActor.studioId, foundationActor.id, 'foundation')[0].friendshipStatus, 'NONE')
const transferRetry = store.transferCoins('studio-rng-1', 'user-tohi', friend.id, 75, 'trade-social-test-1')
assert.equal(transferRetry.duplicate, true)
assert.equal(store.getSocialProgression('studio-rng-1', 'user-tohi').coinBalance, 1075)

const diceStore = makeStore()
const diceLoss = diceStore.settleDiceRoll('studio-rng-1', 'user-tohi', 'dice-round-1', 1, 'LOSS')
assert.equal(diceLoss.coinDelta, -10)
assert.equal(diceLoss.gameXpDelta, 12)
assert.equal(diceLoss.coinBalance, 990)
const diceRetry = diceStore.settleDiceRoll('studio-rng-1', 'user-tohi', 'dice-round-1', 1, 'LOSS')
assert.equal(diceRetry.duplicate, true)
assert.equal(diceRetry.coinBalance, 990)
const blackjack = diceStore.settleTableBet('studio-rng-1', 'user-tohi', 'BLACKJACK', 'blackjack-round-1', 1, 10, 20, { result: 'WIN' })
assert.equal(blackjack.coinDelta, 10)
assert.equal(blackjack.coinBalance, 1000)

const capStore = makeStore()
for (let roundNumber = 1; roundNumber <= 20; roundNumber += 1) {
  const result = capStore.settleSocialRound('studio-rng-1', { roundId: `cap-round-${roundNumber}`, gameId: 'TREASURE_HUNT', winnerIds: [], participants: [{ userId: 'user-tohi', score: 1, eligible: true }] })
  assert.equal(result.length, 1)
}
const cappedProgression = capStore.getSocialProgression('studio-rng-1', 'user-tohi')
assert.equal(cappedProgression.gameXpEarnedToday, 500)
assert.equal(cappedProgression.gameXp, 500)

console.log('Social domain tests passed: default accounts, daily idempotency, round settlement, cosmetic validation, property visits/likes, gift/trade idempotency, table ledger')
