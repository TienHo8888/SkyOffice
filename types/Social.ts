import type { AvatarOutfitDefinition, AvatarWardrobeDefinition, CharacterConfig } from './Avatar'
import type { StudioAvatarKey } from './Studio'
import type { WorkCareerId, WorkRankId } from './Work'
import type { InventoryStack } from './Inventory'
import type { PropertyStyles, PropertyVisibility } from './Housing'

export type SocialGameId = 'TAG' | 'TREASURE_HUNT' | 'PAINT_TILES' | 'DICE_DUEL' | 'BACCARAT' | 'BLACKJACK' | 'POKER' | 'SICBO' | 'BAU_CUA' | 'CHESS' | 'TIEN_LEN' | 'RPS' | 'LUCKY_DRAW'
export type CosmeticSlot = 'OUTFIT' | 'NAMEPLATE' | 'FURNITURE' | 'EMOTE' | 'BORDER' | 'ROOM_STYLE'
export type CosmeticRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'SEASONAL'
export type GameQuestCategory = 'DAILY' | 'WEEKLY' | 'SPECIAL'
export type GameQuestMetric = 'PLAY_ROUND' | 'WIN_ROUND' | 'COMPLETE_MISSION'

export interface GameQuestDefinition {
  id: string
  category: GameQuestCategory
  title: string
  description: string
  icon: string
  metric: GameQuestMetric
  target: number
  xpReward: number
  coinReward: number
}

export interface GameQuest extends GameQuestDefinition {
  progress: number
  completed: boolean
  claimed: boolean
  periodKey: string
  completedAt?: string
}

export type SocialTitleMetric = 'WINNING_COINS'

export interface SocialTitleAchievement {
  gameId: SocialGameId
  metric: SocialTitleMetric
  target: number
}

export interface SocialTitleProgress {
  gameId: SocialGameId
  winningCoins: number
}

// Character progression is intentionally driven by a small, readable table so
// the same thresholds can be used by the server and the HUD without guessing
// how much of the current level has already been earned.
export const CHARACTER_LEVEL_THRESHOLDS: readonly number[] = [0, 100, 250, 500, 900]

export function characterXpForCurrentLevel(xp: number): number {
  let threshold = CHARACTER_LEVEL_THRESHOLDS[0]
  CHARACTER_LEVEL_THRESHOLDS.forEach((candidate) => {
    if (xp >= candidate) threshold = candidate
  })
  if (xp < CHARACTER_LEVEL_THRESHOLDS[CHARACTER_LEVEL_THRESHOLDS.length - 1]) return threshold
  let nextThreshold = Math.ceil(Math.max(900, threshold) * 1.5)
  while (xp >= nextThreshold) {
    threshold = nextThreshold
    nextThreshold = Math.ceil(Math.max(900, threshold) * 1.5)
  }
  return threshold
}

export function characterXpToNextLevel(xp: number): number {
  const staticNext = CHARACTER_LEVEL_THRESHOLDS.find((threshold) => threshold > xp)
  if (staticNext !== undefined) return staticNext
  const currentThreshold = characterXpForCurrentLevel(xp)
  return Math.ceil(Math.max(900, currentThreshold) * 1.5)
}

export function characterLevelForXp(xp: number): number {
  let level = CHARACTER_LEVEL_THRESHOLDS.filter((threshold) => xp >= threshold).length || 1
  if (level < CHARACTER_LEVEL_THRESHOLDS.length) return level
  let threshold = CHARACTER_LEVEL_THRESHOLDS[CHARACTER_LEVEL_THRESHOLDS.length - 1]
  while (xp >= Math.ceil(Math.max(900, threshold) * 1.5)) {
    threshold = Math.ceil(Math.max(900, threshold) * 1.5)
    level += 1
  }
  return level
}

// These are progression missions for the character, not production tasks.
// They are advanced by server-side game settlements and task completions.
export const GAME_QUEST_DEFINITIONS: readonly GameQuestDefinition[] = [
  { id: 'daily-play-3', category: 'DAILY', title: 'Khởi động thế giới', description: 'Hoàn thành 3 ván game bất kỳ trong hôm nay.', icon: '✹', metric: 'PLAY_ROUND', target: 3, xpReward: 50, coinReward: 0 },
  { id: 'daily-win-2', category: 'DAILY', title: 'Bắt nhịp chiến thắng', description: 'Thắng 2 ván game trong hôm nay.', icon: '♛', metric: 'WIN_ROUND', target: 2, xpReward: 75, coinReward: 0 },
  { id: 'daily-mission-2', category: 'DAILY', title: 'Người giao nhiệm vụ', description: 'Hoàn thành 2 nhiệm vụ của studio trong hôm nay.', icon: '◆', metric: 'COMPLETE_MISSION', target: 2, xpReward: 80, coinReward: 0 },
  { id: 'weekly-play-5', category: 'WEEKLY', title: 'Người chơi năng nổ', description: 'Hoàn thành 5 ván game trong tuần này.', icon: '✦', metric: 'PLAY_ROUND', target: 5, xpReward: 300, coinReward: 0 },
  { id: 'weekly-mission-3', category: 'WEEKLY', title: 'Đẩy tiến độ chapter', description: 'Hoàn thành 3 nhiệm vụ của studio trong tuần này.', icon: '▦', metric: 'COMPLETE_MISSION', target: 3, xpReward: 350, coinReward: 0 },
  { id: 'special-release-5', category: 'SPECIAL', title: 'Release Dragon Hunt', description: 'Hoàn thành 5 nhiệm vụ để cùng team đẩy lùi Release Dragon.', icon: '♨', metric: 'COMPLETE_MISSION', target: 5, xpReward: 500, coinReward: 0 },
]

export interface SocialTitle {
  id: string
  name: string
  description: string
  color: string
  achievement?: SocialTitleAchievement
  /** Career-specific titles are available only while that career is active. */
  careerId?: WorkCareerId
  /** Career-specific level required before the title can be equipped. */
  requiredCareerRank?: WorkRankId
}

// Titles are status labels, not purchasable cosmetics. Game titles are unlocked
// by lifetime positive net winnings in a specific game; career titles use rank.
export const SOCIAL_TITLES: readonly SocialTitle[] = [
  { id: 'title-newcomer', name: 'Thực tập sinh Commons', description: 'Bắt đầu ca làm đầu tiên tại Studio Commons.', color: '#78d8ff' },
  { id: 'title-baccarat-player', name: 'Thần Bài', description: 'Thắng ròng 500 Coin ở Baccarat.', color: '#8ff0af', achievement: { gameId: 'BACCARAT', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-blackjack-master', name: 'Vua Blackjack', description: 'Thắng ròng 500 Coin ở Blackjack.', color: '#c8f267', achievement: { gameId: 'BLACKJACK', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-poker-master', name: 'Cao thủ Poker', description: 'Thắng ròng 1.000 Coin ở Poker.', color: '#b9c8e8', achievement: { gameId: 'POKER', metric: 'WINNING_COINS', target: 1_000 } },
  { id: 'title-sicbo-king', name: 'Vua Sic Bo', description: 'Thắng ròng 500 Coin ở Sic Bo.', color: '#ffb86c', achievement: { gameId: 'SICBO', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-bau-cua-boss', name: 'Trùm Bầu Cua', description: 'Thắng ròng 500 Coin ở Bầu Cua.', color: '#ae91ff', achievement: { gameId: 'BAU_CUA', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-chess-shark', name: 'Cao thủ Bàn Cờ', description: 'Thắng ròng 500 Coin ở Chess Arena.', color: '#78d8ff', achievement: { gameId: 'CHESS', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-tien-len-king', name: 'Vua Trò Chơi', description: 'Thắng ròng 1.000 Coin ở Tiến Lên.', color: '#ff91c8', achievement: { gameId: 'TIEN_LEN', metric: 'WINNING_COINS', target: 1_000 } },
  { id: 'title-dice-duel-master', name: 'Thần Xúc Xắc', description: 'Thắng ròng 500 Coin ở Dice Duel.', color: '#d8b4ff', achievement: { gameId: 'DICE_DUEL', metric: 'WINNING_COINS', target: 500 } },
  { id: 'title-lucky-hand', name: 'Bàn Tay May Mắn', description: 'Thắng ròng 250 Coin ở Lucky Draw.', color: '#fff0a6', achievement: { gameId: 'LUCKY_DRAW', metric: 'WINNING_COINS', target: 250 } },
  { id: 'title-career-art', name: 'Họa sĩ Pixel', description: 'Tạo màu cho từng góc studio.', color: '#f28bb4', careerId: 'ART', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-animation', name: 'Phù thủy Keyframe', description: 'Canh từng nhịp chuyển động.', color: '#ff9d6c', careerId: 'ANIMATION', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-game-design', name: 'Kiến trúc sư Game', description: 'Dựng mechanic rõ, vui, cân bằng.', color: '#ae91ff', careerId: 'GAME_DESIGN', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-frontend', name: 'Thợ dựng UI', description: 'Biến ý tưởng thành giao diện.', color: '#78d8ff', careerId: 'FRONTEND', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-backend', name: 'Kỹ sư Realtime', description: 'Giữ event và hệ thống chạy mượt.', color: '#6fe0b0', careerId: 'BACKEND', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-qa', name: 'Thợ săn Bug', description: 'Bắt lỗi trước khi người chơi gặp.', color: '#94a0ff', careerId: 'QA', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-qc', name: 'Người gác chuẩn', description: 'Giữ chất lượng luôn đúng chuẩn.', color: '#c8f267', careerId: 'QC', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-pm', name: 'Nhạc trưởng Sprint', description: 'Nối việc, người và deadline.', color: '#ffb86c', careerId: 'PM', requiredCareerRank: 'APPRENTICE' },
  { id: 'title-career-hr', name: 'Người kết nối', description: 'Giúp team bắt đầu cùng nhau.', color: '#ff91c8', careerId: 'HR', requiredCareerRank: 'APPRENTICE' },
]

export function getSocialTitle(titleId?: string): SocialTitle | undefined {
  return SOCIAL_TITLES.find((title) => title.id === titleId)
}

const SOCIAL_TITLE_RANK_ORDER: readonly WorkRankId[] = ['INTERN', 'APPRENTICE', 'JUNIOR', 'SPECIALIST', 'SENIOR', 'LEAD']

export function getSocialTitleWinningCoins(title: SocialTitle, titleProgress: readonly SocialTitleProgress[]): number {
  if (!title.achievement) return 0
  return titleProgress.find((progress) => progress.gameId === title.achievement?.gameId)?.winningCoins || 0
}

export function isSocialTitleUnlocked(title: SocialTitle, titleProgress: readonly SocialTitleProgress[], currentCareerId?: WorkCareerId, currentCareerRank?: WorkRankId): boolean {
  if (title.achievement && getSocialTitleWinningCoins(title, titleProgress) < title.achievement.target) return false
  if (title.careerId && title.careerId !== currentCareerId) return false
  if (title.requiredCareerRank) {
    const requiredRankIndex = SOCIAL_TITLE_RANK_ORDER.indexOf(title.requiredCareerRank)
    const currentRankIndex = currentCareerRank ? SOCIAL_TITLE_RANK_ORDER.indexOf(currentCareerRank) : -1
    if (currentRankIndex < requiredRankIndex) return false
  }
  return true
}

export function getUnlockedSocialTitles(titleProgress: readonly SocialTitleProgress[], currentCareerId?: WorkCareerId, currentCareerRank?: WorkRankId): SocialTitle[] {
  return SOCIAL_TITLES.filter((title) => isSocialTitleUnlocked(title, titleProgress, currentCareerId, currentCareerRank))
}

export interface SocialProgression {
  userId: string
  gameXp: number
  gameLevel: number
  xpForCurrentLevel: number
  xpToNextLevel: number
  coinBalance: number
  dailyClaimDate?: string
  freeRewardDate?: string
  freeRoundsRewardedToday: number
  gameXpDate?: string
  gameXpEarnedToday: number
}

export interface CosmeticCatalogItem {
  id: string
  name: string
  description: string
  slot: CosmeticSlot
  rarity: CosmeticRarity
  price: number
  color?: string
  unlockLevel?: number
  starter?: boolean
  /** Present for outfit cosmetics so clients can preview/equip the asset bundle. */
  outfit?: AvatarOutfitDefinition
  /** Present for single-layer shop products so clients can mix and match them. */
  wardrobe?: AvatarWardrobeDefinition
}

export interface SocialLoadout {
  userId: string
  avatarKey: StudioAvatarKey
  outfitId?: string
  /** Individually equipped LPC wardrobe layers. These may come from different owned products or bundles. */
  topId?: string
  bottomId?: string
  shoesId?: string
  hatId?: string
  neckId?: string
  armsId?: string
  shouldersId?: string
  nameplateId?: string
  titleId?: string
  borderId?: string
  emoteId?: string
}

/**
 * Canonical visual identity shared by the React UI, Phaser players and
 * realtime social surfaces. `avatarKey` is retained as a legacy fallback for
 * older accounts, while `characterConfig` is the source of truth.
 */
export interface AvatarSnapshot {
  userId: string
  displayName: string
  characterConfig: CharacterConfig
  avatarKey: StudioAvatarKey
  outfitId?: string
  nameplateId?: string
  titleId?: string
  borderId?: string
  emoteId?: string
  revision: number
  updatedAt: string
}

export type SocialPresenceStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'IN_ACTIVITY' | 'OFFLINE'

export interface SocialPresenceView {
  userId: string
  displayName: string
  avatar: AvatarSnapshot
  online: boolean
  sessionId?: string
  status: SocialPresenceStatus
  currentRoom?: string
  activity?: string
  partyId?: string
  lastSeenAt?: string
}

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED'

export interface FriendshipView {
  id: string
  userId: string
  displayName: string
  avatar: AvatarSnapshot
  status: FriendshipStatus
  direction?: 'INCOMING' | 'OUTGOING'
  presence?: SocialPresenceView
  createdAt: string
  updatedAt: string
}

export type SocialNotificationType =
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'PARTY_INVITE'
  | 'ROOM_LIKED'
  | 'GIFT_RECEIVED'
  | 'EVENT_REMINDER'

export interface SocialNotification {
  id: string
  userId: string
  type: SocialNotificationType
  actorId?: string
  actorName?: string
  payload: Record<string, string | number | boolean>
  readAt?: string
  createdAt: string
}

export interface SocialPeopleSnapshot {
  friends: FriendshipView[]
  incomingRequests: FriendshipView[]
  outgoingRequests: FriendshipView[]
  notifications: SocialNotification[]
  unreadNotifications: number
}

export interface SocialPeopleSearchEntry {
  userId: string
  username?: string
  displayName: string
  avatar: AvatarSnapshot
  presence: SocialPresenceView
  friendshipStatus: 'NONE' | 'INCOMING' | 'OUTGOING' | 'FRIENDS' | 'BLOCKED'
}

export type SocialPartyMemberStatus = 'INVITED' | 'JOINED' | 'READY' | 'IN_ACTIVITY' | 'DISCONNECTED'

export interface SocialPartyMember {
  userId: string
  displayName: string
  avatar: AvatarSnapshot
  status: SocialPartyMemberStatus
  joinedAt: string
}

export type SocialPartyStatus = 'OPEN' | 'IN_ACTIVITY' | 'DISBANDED'

export interface SocialPartyActivity {
  type: 'SOCIAL_GAME' | 'ROOM_VISIT' | 'PHOTO_SESSION'
  targetId?: string
}

export interface SocialPartyState {
  partyId: string
  leaderId: string
  members: SocialPartyMember[]
  activity?: SocialPartyActivity
  status: SocialPartyStatus
  version: number
}

export interface SocialPartyInvite {
  inviteId: string
  partyId: string
  inviterId: string
  inviterName: string
  inviterAvatar: AvatarSnapshot
  expiresAt: string
}

export type SocialPartyAction = 'CREATE' | 'INVITE' | 'ACCEPT' | 'DECLINE' | 'LEAVE' | 'KICK' | 'READY' | 'ACTIVITY_REQUEST'

export interface SocialPartyActionPayload {
  action: SocialPartyAction
  requestId: string
  partyId?: string
  inviteId?: string
  targetSessionId?: string
  targetUserId?: string
  activityType?: SocialPartyActivity['type']
  targetId?: string
  mode?: SocialGameId
}

export interface SocialPartyError {
  requestId?: string
  code: string
  message: string
}

export interface SocialEmotePayload {
  actionId: string
  emoteId: string
}

export interface SocialEmoteEvent {
  actionId: string
  emoteId: string
  userId: string
  sessionId: string
  displayName: string
}

export interface WalletTransaction {
  id: string
  userId: string
  delta: number
  balanceAfter: number
  source: string
  sourceId: string
  idempotencyKey: string
  metadata?: Record<string, string | number | boolean>
  createdAt: string
}

export interface SocialReward {
  roundId: string
  gameId: SocialGameId
  userId: string
  coinDelta: number
  gameXpDelta: number
  coinBalance: number
  gameXp: number
  gameLevel: number
  xpForCurrentLevel?: number
  reason: string
  duplicate?: boolean
  grantedAt: string
  gameQuests?: GameQuest[]
}

export interface SocialRoundParticipantResult {
  userId: string
  score: number
  team?: string
  eligible?: boolean
}

export interface SocialRoundResult {
  roundId: string
  gameId: SocialGameId
  winnerIds: string[]
  participants: SocialRoundParticipantResult[]
  finishedAt: string
}

export interface FurniturePlacement {
  itemId: string
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
}

export interface PropertySnapshot {
  ownerId: string
  ownerName: string
  templateId: string
  layoutVersion: number
  furniture: FurniturePlacement[]
  visitCount: number
  likes: number
  updatedAt: string
  styles: PropertyStyles
  visibility: PropertyVisibility
}

export interface PublicSocialProfile {
  userId: string
  displayName: string
  avatar: AvatarSnapshot
  avatarKey: StudioAvatarKey
  gameLevel: number
  career?: string
  careerRank?: string
  title: string
  nameplateId?: string
  achievements: string[]
  club: string
  collectionCount: number
  collectionTotal: number
  favoriteGame?: SocialGameId
  property: PropertySnapshot
  friendshipStatus?: 'NONE' | 'INCOMING' | 'OUTGOING' | 'FRIENDS' | 'BLOCKED'
  presence?: SocialPresenceView
}

export interface SocialSnapshot {
  progression: SocialProgression
  gameQuests: GameQuest[]
  titleProgress: SocialTitleProgress[]
  catalog: CosmeticCatalogItem[]
  ownedCosmetics: string[]
  loadout: SocialLoadout
  property: PropertySnapshot
  inventory: InventoryStack[]
  fishingDailyCount: number
  identity?: AvatarSnapshot
}

export interface SocialLeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  avatarKey: StudioAvatarKey
  avatar?: AvatarSnapshot
  gameLevel: number
  coinBalance: number
  online: boolean
  currentRoom: string
}
