import { TaskPriority, QuestType } from '../../types/Studio'
import { MINI_GAME_CARD_RULES, MINI_GAME_STARTING_COINS } from '../../types/MiniGame'
import { CHARACTER_LEVEL_THRESHOLDS, characterLevelForXp, characterXpForCurrentLevel, characterXpToNextLevel, CosmeticCatalogItem, GAME_QUEST_DEFINITIONS, GameQuestDefinition, SocialGameId } from '../../types/Social'
import { AVATAR_OUTFIT_BUNDLES, AVATAR_WARDROBE_ITEMS, getAvatarOutfitDefinition } from '../../types/Avatar'

export const taskWeightByPriority: Record<TaskPriority, number> = {
  LOW: 50,
  NORMAL: 100,
  HIGH: 200,
  CRITICAL: 500,
}

export const socialLevels = [
  { level: 1, xpRequired: CHARACTER_LEVEL_THRESHOLDS[0], unlocks: ['social_plaza'] },
  { level: 2, xpRequired: CHARACTER_LEVEL_THRESHOLDS[1], unlocks: ['fashion_shop'] },
  { level: 3, xpRequired: CHARACTER_LEVEL_THRESHOLDS[2], unlocks: ['card_room'] },
  { level: 4, xpRequired: CHARACTER_LEVEL_THRESHOLDS[3], unlocks: ['personal_room'] },
  { level: 5, xpRequired: CHARACTER_LEVEL_THRESHOLDS[4], unlocks: ['tournament_placeholder'] },
]

export const socialEconomy = {
  startingCoin: MINI_GAME_STARTING_COINS,
  dailyCoin: 100,
  dailyGameXp: 50,
  freeParticipationCoin: 25,
  freeParticipationXp: 25,
  freeWinnerBonusCoin: 25,
  freeWinnerBonusXp: 25,
  freeRewardRoundsPerDay: 3,
  // The cap limits botting without stopping a normal play session after a
  // single round. Mission XP uses the same cap as round XP.
  dailyGameXpCap: 500,
  diceEntry: MINI_GAME_CARD_RULES.DICE_DUEL.cost,
  diceWinPayout: MINI_GAME_CARD_RULES.DICE_DUEL.winPayout,
  diceTiePayout: MINI_GAME_CARD_RULES.DICE_DUEL.tiePayout,
  diceMaxRollsPerRound: 3,
  baccaratEntry: MINI_GAME_CARD_RULES.BACCARAT.cost,
  baccaratPlayerPayout: MINI_GAME_CARD_RULES.BACCARAT.payouts.PLAYER,
  baccaratBankerPayout: MINI_GAME_CARD_RULES.BACCARAT.payouts.BANKER,
  baccaratTiePayout: MINI_GAME_CARD_RULES.BACCARAT.payouts.TIE,
  luckyDrawEntry: MINI_GAME_CARD_RULES.LUCKY_DRAW.cost,
  luckyDrawRewards: MINI_GAME_CARD_RULES.LUCKY_DRAW.rewards,
  propertyGiftDailyLimit: 3,
  propertyGridWidth: 8,
  propertyGridHeight: 6,
  propertyMaxFurniture: 24,
}

export const characterGameXpRewards: Record<SocialGameId, { play: number; win: number }> = {
  TAG: { play: 25, win: 25 },
  TREASURE_HUNT: { play: 25, win: 25 },
  PAINT_TILES: { play: 25, win: 25 },
  DICE_DUEL: { play: 12, win: 8 },
  BACCARAT: { play: 10, win: 10 },
  BLACKJACK: { play: 12, win: 10 },
  POKER: { play: 20, win: 20 },
  SICBO: { play: 10, win: 10 },
  BAU_CUA: { play: 10, win: 10 },
  CHESS: { play: 20, win: 20 },
  TIEN_LEN: { play: 25, win: 25 },
  RPS: { play: 15, win: 15 },
  LUCKY_DRAW: { play: 5, win: 5 },
}

export const gameQuestDefinitions: readonly GameQuestDefinition[] = GAME_QUEST_DEFINITIONS

export const socialGameRewards: Record<SocialGameId, { free: boolean; enabledInMvp: boolean }> = {
  TAG: { free: true, enabledInMvp: true },
  TREASURE_HUNT: { free: true, enabledInMvp: true },
  PAINT_TILES: { free: true, enabledInMvp: true },
  DICE_DUEL: { free: false, enabledInMvp: true },
  BACCARAT: { free: false, enabledInMvp: true },
  BLACKJACK: { free: false, enabledInMvp: true },
  POKER: { free: false, enabledInMvp: true },
  SICBO: { free: false, enabledInMvp: true },
  BAU_CUA: { free: false, enabledInMvp: true },
  CHESS: { free: false, enabledInMvp: true },
  TIEN_LEN: { free: true, enabledInMvp: true },
  RPS: { free: false, enabledInMvp: true },
  LUCKY_DRAW: { free: false, enabledInMvp: false },
}

function outfitCatalogItem(id: string): CosmeticCatalogItem {
  const outfit = getAvatarOutfitDefinition(id)
  if (!outfit) throw new Error(`Missing avatar outfit definition: ${id}`)
  return {
    id: outfit.id,
    name: outfit.name,
    description: outfit.description,
    slot: 'OUTFIT',
    rarity: outfit.rarity,
    price: outfit.price,
    color: outfit.color,
    unlockLevel: outfit.unlockLevel,
    starter: outfit.starter,
    outfit,
  }
}

function wardrobeCatalogItem(wardrobe: (typeof AVATAR_WARDROBE_ITEMS)[number]): CosmeticCatalogItem {
  return {
    id: wardrobe.id,
    name: wardrobe.name,
    description: wardrobe.description,
    slot: 'OUTFIT',
    rarity: wardrobe.rarity,
    price: wardrobe.price,
    color: wardrobe.color,
    unlockLevel: wardrobe.unlockLevel,
    starter: wardrobe.starter,
    // Keep the old outfit-shaped field populated so existing clients and
    // catalog tests remain compatible while the wardrobe metadata tells the
    // new loadout flow which individual layer to equip.
    outfit: {
      id: wardrobe.id,
      name: wardrobe.name,
      description: wardrobe.description,
      rarity: wardrobe.rarity,
      price: wardrobe.price,
      color: wardrobe.color,
      unlockLevel: wardrobe.unlockLevel,
      starter: wardrobe.starter,
      slots: wardrobe.slots,
    },
    wardrobe,
  }
}

export const socialCosmeticCatalog: CosmeticCatalogItem[] = [
  ...AVATAR_OUTFIT_BUNDLES.map((outfit) => outfitCatalogItem(outfit.id)),
  ...AVATAR_WARDROBE_ITEMS.map(wardrobeCatalogItem),
  { id: 'nameplate-basic', name: 'Basic', description: 'The default nameplate.', slot: 'NAMEPLATE', rarity: 'COMMON', price: 0, starter: true },
  { id: 'nameplate-neon', name: 'Neon', description: 'A bright social signature.', slot: 'NAMEPLATE', rarity: 'RARE', price: 2000, color: '#ae91ff', unlockLevel: 2 },
  { id: 'nameplate-champion', name: 'Champion', description: 'For players who lead the room.', slot: 'NAMEPLATE', rarity: 'EPIC', price: 8000, color: '#ffb86c', unlockLevel: 3 },
  { id: 'nameplate-lucky', name: 'Lucky', description: 'A playful card-room badge.', slot: 'NAMEPLATE', rarity: 'LEGENDARY', price: 20000, color: '#c8f267', unlockLevel: 4 },
  { id: 'furniture-starter-chair', name: 'Starter Chair', description: 'A place to sit in your room.', slot: 'FURNITURE', rarity: 'COMMON', price: 0, starter: true },
  { id: 'furniture-starter-plant', name: 'Starter Plant', description: 'A little life for your room.', slot: 'FURNITURE', rarity: 'COMMON', price: 0, starter: true },
  { id: 'furniture-plaza-lamp', name: 'Plaza Lamp', description: 'A warm light for late-night social sessions.', slot: 'FURNITURE', rarity: 'COMMON', price: 200, color: '#ffe08a' },
  { id: 'furniture-arcade-cabinet', name: 'Arcade Cabinet', description: 'A tiny reminder to play.', slot: 'FURNITURE', rarity: 'RARE', price: 1500, color: '#6fe0b0', unlockLevel: 2 },
  { id: 'furniture-trophy-case', name: 'Trophy Case', description: 'Display your best moments.', slot: 'FURNITURE', rarity: 'EPIC', price: 5000, color: '#ffb86c', unlockLevel: 4 },
  { id: 'furniture-tiny-table', name: 'Tiny Table', description: 'A compact table for a small room.', slot: 'FURNITURE', rarity: 'COMMON', price: 250, color: '#c89066' },
  { id: 'furniture-cozy-rug', name: 'Cozy Rug', description: 'A warm patch of color for the floor.', slot: 'FURNITURE', rarity: 'COMMON', price: 350, color: '#d77d9c' },
  { id: 'furniture-wall-shelf', name: 'Wall Shelf', description: 'A narrow shelf for little treasures.', slot: 'FURNITURE', rarity: 'RARE', price: 900, color: '#a8b6d8' },
  { id: 'starter_wallpaper', name: 'Starter Wallpaper', description: 'The default room wall style.', slot: 'ROOM_STYLE', rarity: 'COMMON', price: 0, starter: true, color: '#354363' },
  { id: 'wooden_floor', name: 'Wooden Floor', description: 'The default warm wooden floor.', slot: 'ROOM_STYLE', rarity: 'COMMON', price: 0, starter: true, color: '#9a704b' },
  { id: 'blue_wallpaper', name: 'Blue Wallpaper', description: 'A calm blue wall finish.', slot: 'ROOM_STYLE', rarity: 'RARE', price: 450, color: '#446eaa' },
  { id: 'stone_floor', name: 'Stone Floor', description: 'A cool stone floor finish.', slot: 'ROOM_STYLE', rarity: 'RARE', price: 450, color: '#77849a' },
]

export const studioLevels = [
  { level: 1, xpRequired: 0, unlocks: [] as string[] },
  { level: 2, xpRequired: 1000, unlocks: ['office_plant_large'] },
  { level: 3, xpRequired: 2500, unlocks: ['qa_trophy'] },
  { level: 4, xpRequired: 5000, unlocks: ['arcade_machine'] },
  { level: 5, xpRequired: 8500, unlocks: ['trophy_room'] },
  { level: 6, xpRequired: 13000, unlocks: ['meeting_lounge'] },
]

export const questTypeMultiplier: Record<QuestType, number> = {
  MAIN: 2,
  SIDE: 1,
  BUG: 1,
  ELITE: 2,
}

export function calculateLevel(xp: number): number {
  let level = 1
  for (const entry of studioLevels) {
    if (xp >= entry.xpRequired) level = entry.level
  }
  return level
}

export function calculateSocialLevel(xp: number): number {
  return characterLevelForXp(xp)
}

export function socialXpToNextLevel(xp: number): number {
  return characterXpToNextLevel(xp)
}

export function socialXpForCurrentLevel(xp: number): number {
  return characterXpForCurrentLevel(xp)
}

export function socialUnlocksForLevel(level: number): string[] {
  return socialLevels.filter((entry) => entry.level <= level).flatMap((entry) => entry.unlocks)
}

export function xpToNextLevel(xp: number): number {
  return studioLevels.find((entry) => entry.xpRequired > xp)?.xpRequired || Math.ceil(Math.max(13000, xp) * 1.5)
}

export function unlocksForLevel(level: number): string[] {
  return studioLevels.filter((entry) => entry.level <= level).flatMap((entry) => entry.unlocks)
}

export function defaultBossDamage(priority: TaskPriority, questType: QuestType): number {
  return taskWeightByPriority[priority] * questTypeMultiplier[questType]
}
