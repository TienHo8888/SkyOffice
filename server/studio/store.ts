import fs from 'fs'
import path from 'path'
import { randomInt, randomUUID } from 'crypto'
import { ActivityEvent, CompletionResponse, MemberView, Presence, Project, Quest, ResourceKind, Sprint, SprintBoss, Studio, StudioAvatarKey, StudioProgression, StudioResource, Task, User } from '../../types/Studio'
import { characterConfigToLegacyAvatar, isCharacterConfig, normalizeCharacterConfig } from '../../types/Avatar'
import type { AvatarWardrobeSlot, CharacterConfig } from '../../types/Avatar'
import { AvatarSnapshot, CosmeticCatalogItem, FriendshipView, FurniturePlacement, GameQuest, GameQuestCategory, GameQuestMetric, getSocialTitle, InventorySaleReceipt, InventoryTradeReceipt, isSocialTitleUnlocked, PropertySnapshot, PublicSocialProfile, SOCIAL_TITLES, SocialGameId, SocialLeaderboardEntry, SocialLoadout, SocialNotification, SocialPeopleSearchEntry, SocialPeopleSnapshot, SocialPresenceView, SocialProgression, SocialReward, SocialRoundParticipantResult, SocialSnapshot, SocialTitleProgress, WalletTransaction } from '../../types/Social'
import { CareerTrackProgress, DailySalaryReceipt, WorkActionRecord, WorkCareerId, WorkCertificationResult, WorkDailyStatus, WorkGrade, WorkHistoryRecord, WorkJobDefinition, WorkProgression, WorkRankId, WorkReward, WorkSalaryStatus, WorkSessionStatus, WorkSnapshot } from '../../types/Work'
import type { FishingCatchReceipt, FishDefinition } from '../../types/Fishing'
import { FISH_DEFINITIONS, FISHING_DAILY_LIMIT } from '../../types/Fishing'
import { DEFAULT_PROPERTY_STYLES, HOME_GRID_HEIGHT, HOME_GRID_WIDTH, HOME_MAX_FURNITURE, getHousingItemDefinition, isValidPropertyStyles, PropertyStyles, PropertyVisibility } from '../../types/Housing'
import type { InventoryStack } from '../../types/Inventory'
import { hashPassword, verifyPassword } from './auth'
import { calculateLevel, calculateSocialLevel, characterGameXpRewards, defaultBossDamage, gameQuestDefinitions, socialCosmeticCatalog, socialEconomy, socialUnlocksForLevel, socialXpForCurrentLevel, socialXpToNextLevel, unlocksForLevel, xpToNextLevel } from './config'
import { DbActivity, DbBlock, DbBoss, DbFriendship, DbGameQuestProgress, DbLoadout, DbMember, DbOwnedCosmetic, DbPlayerProgression, DbProject, DbProperty, DbPropertyGift, DbPropertyLike, DbPropertyVisit, DbQuest, DbResource, DbSocialNotification, DbSocialRewardClaim, DbSocialRound, DbSprint, DbTask, DbUser, DbWalletTransaction, StudioDbState, createDefaultAdminUser, createDefaultTestUsers, createSeedState, DbWorkCareerProgress, DbWorkDailyStats, DbWorkProfile, DbWorkRewardClaim, DbWorkSession, getDefaultAdminEmail, getDefaultAdminPassword, getDefaultAdminUsername } from './seed'
import { recordSocialMetric } from './metrics'
import { workCareerDefinitions, workEconomy, workJobDefinition, workJobDefinitions, workNextRank, workRankDefinitions, workRankForXp, workRankIndex, workSalaryBonus, workSalaryForRank } from './work-config'
import { evaluateWorkChallenge, WorkChallengeInternal, workGradeReward } from './work-rules'
import type { StudioStatePersistence } from './supabase-persistence'

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

function databasePath(): string {
  if (process.env.STUDIO_DB_PATH) return process.env.STUDIO_DB_PATH
  const compiledServer = path.basename(path.resolve(__dirname, '..')) === 'server' && path.basename(path.resolve(__dirname, '../..')) === 'lib'
  return path.resolve(__dirname, compiledServer ? '../../../data/studio-db.json' : '../data/studio-db.json')
}

function usesSupabasePersistence(): boolean {
  return (process.env.STUDIO_PERSISTENCE || 'local').trim().toLowerCase() === 'supabase'
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

function passwordMatches(password: string, encoded: string): boolean {
  try {
    return verifyPassword(password, encoded)
  } catch {
    return false
  }
}

function ensureDefaultAdmin(state: StudioDbState): boolean {
  let existingAdmin = state.users.find((user) => user.email.toLowerCase() === getDefaultAdminEmail())
  // If an older snapshot contains the original seeded admin identity, keep it
  // as the canonical local account or migrate it in place for production
  // instead of creating a second admin and leaving the old login active.
  if (!existingAdmin) existingAdmin = state.users.find((user) => user.id === 'user-tohi')
  if (existingAdmin) {
    let changed = false
    const desiredEmail = getDefaultAdminEmail()
    const desiredUsername = getDefaultAdminUsername()
    if (isProductionRuntime() && existingAdmin.email !== desiredEmail) {
      existingAdmin.email = desiredEmail
      changed = true
    }
    if (isProductionRuntime() && existingAdmin.username !== desiredUsername) {
      existingAdmin.username = desiredUsername
      changed = true
    }
    if (!existingAdmin.username) {
      existingAdmin.username = desiredUsername
      changed = true
    }
    if (isProductionRuntime()) {
      const configuredPassword = getDefaultAdminPassword()
      if (!passwordMatches(configuredPassword, existingAdmin.passwordHash)) {
        existingAdmin.passwordHash = hashPassword(configuredPassword)
        changed = true
      }
      if (!['OWNER', 'ADMIN'].includes(existingAdmin.role)) {
        existingAdmin.role = 'ADMIN'
        changed = true
      }
      const member = state.members.find((candidate) => candidate.studioId === existingAdmin.studioId && candidate.userId === existingAdmin.id)
      if (member && member.role !== existingAdmin.role) {
        member.role = existingAdmin.role
        changed = true
      }
    }
    return changed
  }
  const studio = state.studios[0]
  if (!studio) return false
  const admin = createDefaultAdminUser(studio.id)
  state.users.push(admin)
  state.members.push({ id: `member-${admin.id}`, studioId: studio.id, userId: admin.id, role: admin.role, joinedAt: admin.createdAt })
  return true
}

function removeSupersededDefaultAdmin(state: StudioDbState): boolean {
  if (!isProductionRuntime()) return false
  const configuredAdmin = state.users.find((user) => user.email.toLowerCase() === getDefaultAdminEmail())
  const legacyAdmin = state.users.find((user) => user.id === 'user-tohi')
  if (!configuredAdmin || !legacyAdmin || configuredAdmin.id === legacyAdmin.id) return false
  const removedId = legacyAdmin.id
  state.users = state.users.filter((user) => user.id !== removedId)
  state.members = state.members.filter((member) => member.userId !== removedId)
  state.tasks.forEach((task) => {
    if (task.assigneeId === removedId) task.assigneeId = configuredAdmin.id
  })
  state.resources.forEach((resource) => {
    if (resource.createdById === removedId) resource.createdById = configuredAdmin.id
  })
  state.activities.forEach((activity) => {
    if (activity.actorId === removedId) activity.actorId = configuredAdmin.id
  })
  return true
}

function ensureDefaultTestUsers(state: StudioDbState): boolean {
  const studio = state.studios[0]
  if (!studio) return false
  let changed = false
  createDefaultTestUsers(studio.id).forEach((candidate) => {
    if (state.users.some((user) => user.username === candidate.username || user.email.toLowerCase() === candidate.email.toLowerCase())) return
    state.users.push(candidate)
    state.members.push({ id: `member-${candidate.id}`, studioId: studio.id, userId: candidate.id, role: candidate.role, joinedAt: candidate.createdAt })
    state.playerProgressions = state.playerProgressions || []
    state.playerProgressions.push({ userId: candidate.id, gameXp: 0, gameLevel: 1, coinBalance: socialEconomy.startingCoin, freeRoundsRewardedToday: 0, gameXpEarnedToday: 0 })
    state.loadouts = state.loadouts || []
    state.loadouts.push({ userId: candidate.id, avatarKey: candidate.avatarKey || 'adam', nameplateId: 'nameplate-basic' })
    state.ownedCosmetics = state.ownedCosmetics || []
    socialCosmeticCatalog.filter((item) => item.starter).forEach((item) => state.ownedCosmetics.push({ userId: candidate.id, itemId: item.id, source: 'STARTER', acquiredAt: candidate.createdAt }))
    state.properties = state.properties || []
    state.properties.push({ ownerId: candidate.id, templateId: 'room_template_v1', layoutVersion: 1, furniture: [{ itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 }, { itemId: 'furniture-starter-plant', x: 5, y: 2, rotation: 0 }], visitCount: 0, updatedAt: candidate.createdAt, styles: { ...DEFAULT_PROPERTY_STYLES }, visibility: 'FRIENDS' })
    changed = true
  })
  return changed
}

const legacyDemoUserIds = new Set(['user-alex', 'user-amy', 'user-john', 'user-mia', 'user-owner'])
const productionFixtureUserIds = new Set(['user-demo', 'user-dealer', 'user-designer', 'user-qa'])

function removeProductionFixtureUsers(state: StudioDbState): boolean {
  if (!isProductionRuntime()) return false
  const removedIds = new Set(state.users.filter((user) => productionFixtureUserIds.has(user.id)).map((user) => user.id))
  if (!removedIds.size) return false
  const adminId = state.users.find((user) => user.id === 'user-tohi' || user.email.toLowerCase() === getDefaultAdminEmail())?.id || 'user-tohi'
  state.users = state.users.filter((user) => !removedIds.has(user.id))
  state.members = state.members.filter((member) => !removedIds.has(member.userId))
  state.tasks.forEach((task) => {
    if (task.assigneeId && removedIds.has(task.assigneeId)) task.assigneeId = adminId
  })
  state.resources.forEach((resource) => {
    if (resource.createdById && removedIds.has(resource.createdById)) resource.createdById = adminId
  })
  state.activities.forEach((activity) => {
    if (activity.actorId && removedIds.has(activity.actorId)) activity.actorId = adminId
  })
  return true
}

function removeLegacyDemoUsers(state: StudioDbState): boolean {
  const hasLegacyUsers = state.users.some((user) => legacyDemoUserIds.has(user.id))
  if (!hasLegacyUsers) return false
  const adminId = state.users.find((user) => user.username === 'tohi')?.id || 'user-tohi'
  state.users = state.users.filter((user) => !legacyDemoUserIds.has(user.id))
  state.members = state.members.filter((member) => !legacyDemoUserIds.has(member.userId))
  state.tasks.forEach((task) => {
    if (task.assigneeId && legacyDemoUserIds.has(task.assigneeId)) task.assigneeId = adminId
  })
  state.resources.forEach((resource) => {
    if (resource.createdById && legacyDemoUserIds.has(resource.createdById)) resource.createdById = adminId
  })
  state.activities.forEach((activity) => {
    if (activity.actorId && legacyDemoUserIds.has(activity.actorId)) activity.actorId = adminId
  })
  return true
}

function ensureSocialState(state: StudioDbState): boolean {
  let changed = false
  state.playerProgressions = state.playerProgressions || []
  state.gameQuestProgress = state.gameQuestProgress || []
  state.walletTransactions = state.walletTransactions || []
  state.ownedCosmetics = state.ownedCosmetics || []
  state.loadouts = state.loadouts || []
  state.properties = state.properties || []
  state.propertyVisits = state.propertyVisits || []
  state.propertyLikes = state.propertyLikes || []
  state.propertyGifts = state.propertyGifts || []
  state.socialRounds = state.socialRounds || []
  state.socialRewardClaims = state.socialRewardClaims || []
  state.friendships = state.friendships || []
  state.blocks = state.blocks || []
  state.socialNotifications = state.socialNotifications || []
  state.playerInventory = state.playerInventory || []
  state.inventoryTransactions = state.inventoryTransactions || []

  state.users.forEach((user) => {
    const canonicalCharacterConfig = normalizeCharacterConfig(user.characterConfig, user.avatarKey)
    const savedSlots = user.characterConfig?.slots as unknown as Partial<Record<string, string>> | undefined
    const missingWardrobeSlots = ['hat', 'neck', 'arms', 'shoulders'].some((slot) => typeof savedSlots?.[slot] !== 'string')
    if (!isCharacterConfig(user.characterConfig) || missingWardrobeSlots) {
      user.characterConfig = canonicalCharacterConfig
      changed = true
    }
    const canonicalAvatarKey = characterConfigToLegacyAvatar(canonicalCharacterConfig)
    if (user.avatarKey !== canonicalAvatarKey) {
      user.avatarKey = canonicalAvatarKey
      changed = true
    }
    if (!user.avatarRevision || user.avatarRevision < 1) {
      user.avatarRevision = 1
      changed = true
    }
    const progression = state.playerProgressions.find((item) => item.userId === user.id)
    if (!progression) {
      state.playerProgressions.push({ userId: user.id, gameXp: 0, gameLevel: 1, coinBalance: socialEconomy.startingCoin, freeRoundsRewardedToday: 0, gameXpEarnedToday: 0 })
      changed = true
    } else if (progression.gameLevel !== calculateSocialLevel(progression.gameXp)) {
      progression.gameLevel = calculateSocialLevel(progression.gameXp)
      changed = true
    }
    const loadout = state.loadouts.find((item) => item.userId === user.id)
    if (!loadout) {
      state.loadouts.push({ userId: user.id, avatarKey: canonicalAvatarKey, nameplateId: 'nameplate-basic' })
      changed = true
    } else if (loadout.avatarKey !== canonicalAvatarKey) {
      loadout.avatarKey = canonicalAvatarKey
      changed = true
    }
    if (!state.properties.some((item) => item.ownerId === user.id)) {
      state.properties.push({ ownerId: user.id, templateId: 'room_template_v1', layoutVersion: 1, furniture: [{ itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 }, { itemId: 'furniture-starter-plant', x: 5, y: 2, rotation: 0 }], visitCount: 0, updatedAt: new Date().toISOString(), styles: { ...DEFAULT_PROPERTY_STYLES }, visibility: 'FRIENDS' })
      changed = true
    }
    const property = state.properties.find((item) => item.ownerId === user.id)
    if (property) {
      if (!property.styles || !isValidPropertyStyles(property.styles)) {
        property.styles = { ...DEFAULT_PROPERTY_STYLES }
        changed = true
      }
      if (!property.visibility) {
        property.visibility = 'FRIENDS'
        changed = true
      }
    }
    socialCosmeticCatalog.filter((item) => item.starter).forEach((item) => {
      if (!state.ownedCosmetics.some((owned) => owned.userId === user.id && owned.itemId === item.id)) {
        state.ownedCosmetics.push({ userId: user.id, itemId: item.id, source: 'STARTER', acquiredAt: new Date().toISOString() })
        changed = true
      }
    })
  })
  return changed
}

function validateAvatarUrl(avatarUrl: string): void {
  if (!avatarUrl) return
  try {
    const url = new URL(avatarUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
  } catch {
    throw new DomainError('INVALID_AVATAR_URL', 'Avatar URL must use http or https.')
  }
}

function validateAvatarKey(avatarKey: StudioAvatarKey): void {
  if (!['adam', 'ash', 'lucy', 'nancy'].includes(avatarKey)) throw new DomainError('INVALID_AVATAR', 'Studio avatar is invalid.')
}

function validateCharacterConfig(characterConfig: unknown): void {
  if (!isCharacterConfig(characterConfig)) throw new DomainError('INVALID_CHARACTER_CONFIG', 'Character appearance is invalid.')
}

const WARDROBE_LOADOUT_KEYS = {
  topId: 'top',
  bottomId: 'bottom',
  shoesId: 'shoes',
  hatId: 'hat',
  neckId: 'neck',
  armsId: 'arms',
  shouldersId: 'shoulders',
} as const

type WardrobeLoadoutKey = keyof typeof WARDROBE_LOADOUT_KEYS

function cosmeticLayerId(item: CosmeticCatalogItem, slot: AvatarWardrobeSlot): string | undefined {
  if (item.wardrobe) return item.wardrobe.slot === slot ? item.wardrobe.itemId : undefined
  if (slot === 'top' || slot === 'bottom' || slot === 'shoes') return item.outfit?.slots[slot]
  return undefined
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function gameQuestPeriodKey(category: GameQuestCategory, date: string): string {
  if (category === 'DAILY') return `day:${date}`
  if (category === 'SPECIAL') return 'season:release-dragon'
  const weekStart = new Date(`${date}T00:00:00.000Z`)
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)
  return `week:${weekStart.toISOString().slice(0, 10)}`
}

function cloneFurniture(furniture: FurniturePlacement[]): FurniturePlacement[] {
  return furniture.map((item) => ({ ...item }))
}

const WORK_CAREER_IDS: WorkCareerId[] = ['ART', 'ANIMATION', 'GAME_DESIGN', 'FRONTEND', 'BACKEND', 'QA', 'QC', 'PM', 'HR']

interface WorkJobSettlementInput {
  sessionId: string
  jobId: WorkJobDefinition['id']
  careerId?: WorkCareerId
  challenge: WorkChallengeInternal
  actions: WorkActionRecord[]
  elapsedMs: number
  startedAt?: string
  abandoned?: boolean
  expired?: boolean
}

interface WorkCertificationSettlementInput {
  sessionId: string
  careerId: WorkCareerId
  targetRank: WorkRankId
  challenge: WorkChallengeInternal
  actions: WorkActionRecord[]
  elapsedMs: number
}

function ensureWorkState(state: StudioDbState): boolean {
  let changed = false
  state.workProfiles = state.workProfiles || []
  state.workCareerProgress = state.workCareerProgress || []
  state.workDailyStats = state.workDailyStats || []
  state.workSessions = state.workSessions || []
  state.workRewardClaims = state.workRewardClaims || []
  state.users.forEach((user) => {
    if (!state.workProfiles.some((profile) => profile.userId === user.id)) {
      state.workProfiles.push({ userId: user.id, tutorialCompleted: false, workStreak: 0 })
      changed = true
    }
    WORK_CAREER_IDS.forEach((careerId) => {
      if (!state.workCareerProgress.some((progress) => progress.userId === user.id && progress.careerId === careerId)) {
        state.workCareerProgress.push({ userId: user.id, careerId, careerXp: 0, rank: 'INTERN' })
        changed = true
      }
    })
  })
  return changed
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function normalizeState(parsed: Partial<StudioDbState>): { state: StudioDbState; changed: boolean } {
  const seed = createSeedState()
  const state = {
    ...parsed,
    users: isArray(parsed.users) ? parsed.users : seed.users,
    studios: isArray(parsed.studios) ? parsed.studios : seed.studios,
    members: isArray(parsed.members) ? parsed.members : seed.members,
    projects: isArray(parsed.projects) ? parsed.projects : seed.projects,
    sprints: isArray(parsed.sprints) ? parsed.sprints : seed.sprints,
    tasks: isArray(parsed.tasks) ? parsed.tasks : seed.tasks,
    quests: isArray(parsed.quests) ? parsed.quests : seed.quests,
    bosses: isArray(parsed.bosses) ? parsed.bosses : seed.bosses,
    resources: isArray(parsed.resources) ? parsed.resources : seed.resources,
    activities: isArray(parsed.activities) ? parsed.activities : seed.activities,
    playerProgressions: isArray(parsed.playerProgressions) ? parsed.playerProgressions : seed.playerProgressions,
    gameQuestProgress: isArray(parsed.gameQuestProgress) ? parsed.gameQuestProgress : seed.gameQuestProgress,
    walletTransactions: isArray(parsed.walletTransactions) ? parsed.walletTransactions : seed.walletTransactions,
    ownedCosmetics: isArray(parsed.ownedCosmetics) ? parsed.ownedCosmetics : seed.ownedCosmetics,
    loadouts: isArray(parsed.loadouts) ? parsed.loadouts : seed.loadouts,
    properties: isArray(parsed.properties) ? parsed.properties : seed.properties,
    propertyVisits: isArray(parsed.propertyVisits) ? parsed.propertyVisits : seed.propertyVisits,
    propertyLikes: isArray(parsed.propertyLikes) ? parsed.propertyLikes : seed.propertyLikes,
    propertyGifts: isArray(parsed.propertyGifts) ? parsed.propertyGifts : seed.propertyGifts,
    socialRounds: isArray(parsed.socialRounds) ? parsed.socialRounds : seed.socialRounds,
    socialRewardClaims: isArray(parsed.socialRewardClaims) ? parsed.socialRewardClaims : seed.socialRewardClaims,
    friendships: isArray(parsed.friendships) ? parsed.friendships : seed.friendships,
    blocks: isArray(parsed.blocks) ? parsed.blocks : seed.blocks,
    socialNotifications: isArray(parsed.socialNotifications) ? parsed.socialNotifications : seed.socialNotifications,
    workProfiles: isArray(parsed.workProfiles) ? parsed.workProfiles : seed.workProfiles,
    workCareerProgress: isArray(parsed.workCareerProgress) ? parsed.workCareerProgress : seed.workCareerProgress,
    workDailyStats: isArray(parsed.workDailyStats) ? parsed.workDailyStats : seed.workDailyStats,
    workSessions: isArray(parsed.workSessions) ? parsed.workSessions : seed.workSessions,
    workRewardClaims: isArray(parsed.workRewardClaims) ? parsed.workRewardClaims : seed.workRewardClaims,
    playerInventory: isArray(parsed.playerInventory) ? parsed.playerInventory : seed.playerInventory,
    inventoryTransactions: isArray(parsed.inventoryTransactions) ? parsed.inventoryTransactions : seed.inventoryTransactions,
  } as StudioDbState
  const adminChanged = ensureDefaultAdmin(state)
  const testUsersChanged = isProductionRuntime() ? removeProductionFixtureUsers(state) : ensureDefaultTestUsers(state)
  const legacyUsersChanged = removeLegacyDemoUsers(state)
  const supersededAdminChanged = removeSupersededDefaultAdmin(state)
  const socialChanged = ensureSocialState(state)
  const workChanged = ensureWorkState(state)
  return { state, changed: adminChanged || testUsersChanged || legacyUsersChanged || supersededAdminChanged || socialChanged || workChanged }
}

export function toUser(user: DbUser): User {
  const { passwordHash, ...safeUser } = user
  return safeUser
}

export class StudioStore {
  private state: StudioDbState
  private readonly filePath: string
  private readonly supabasePersistenceEnabled = usesSupabasePersistence()
  private readonly activeWorkUsers = new Set<string>()
  private supabasePersistence?: StudioStatePersistence
  private supabaseSaveQueue: Promise<void> = Promise.resolve()
  private supabaseSaveError = ''

  constructor(filePath = databasePath()) {
    this.filePath = filePath
    this.state = this.load()
  }

  private load(): StudioDbState {
    // Supabase is the canonical source in this mode. Never bootstrap a
    // production database from an ignored local JSON file that may contain
    // development accounts or historical password hashes.
    if (this.supabasePersistenceEnabled) {
      const seed = createSeedState()
      ensureSocialState(seed)
      ensureWorkState(seed)
      return seed
    }
    if (!fs.existsSync(this.filePath)) {
      const seed = createSeedState()
      ensureSocialState(seed)
      ensureWorkState(seed)
      this.save(seed)
      return seed
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<StudioDbState>
      const normalized = normalizeState(parsed)
      if (normalized.changed) this.save(normalized.state)
      return normalized.state
    } catch {
      const seed = createSeedState()
      ensureSocialState(seed)
      ensureWorkState(seed)
      this.save(seed)
      return seed
    }
  }

  private save(state = this.state) {
    if (!this.supabasePersistenceEnabled) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const tempPath = `${this.filePath}.${process.pid}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2))
      fs.renameSync(tempPath, this.filePath)
    }
    if (this.supabasePersistence) this.queueSupabaseSave(state)
  }

  private queueSupabaseSave(state: StudioDbState) {
    const persistence = this.supabasePersistence
    if (!persistence) return
    const snapshot = JSON.parse(JSON.stringify(state)) as StudioDbState
    this.supabaseSaveQueue = this.supabaseSaveQueue
      .catch(() => undefined)
      .then(() => persistence.save(snapshot))
      .then(() => { this.supabaseSaveError = '' })
      .catch((error) => {
        this.supabaseSaveError = error instanceof Error ? error.message : 'Supabase persistence failed.'
        console.error(this.supabaseSaveError)
      })
  }

  async hydrateFromSupabase(persistence: StudioStatePersistence): Promise<void> {
    const remoteState = await persistence.load()
    if (remoteState && typeof remoteState === 'object' && !Array.isArray(remoteState)) {
      this.state = normalizeState(remoteState as Partial<StudioDbState>).state
    }
    this.supabasePersistence = persistence
    this.supabaseSaveError = ''
    this.save()
    await this.flushPersistence()
  }

  async flushPersistence(): Promise<void> {
    await this.supabaseSaveQueue
    if (this.supabaseSaveError) throw new Error(this.supabaseSaveError)
  }

  getPersistenceStatus(): { mode: 'local' | 'supabase'; ready: boolean; error?: string } {
    return {
      mode: this.supabasePersistenceEnabled ? 'supabase' : 'local',
      ready: !this.supabasePersistenceEnabled || Boolean(this.supabasePersistence),
      ...(this.supabaseSaveError ? { error: this.supabaseSaveError } : {}),
    }
  }

  resetForTests() {
    const seed = createSeedState()
    ensureSocialState(seed)
    ensureWorkState(seed)
    this.state = seed
    this.activeWorkUsers.clear()
    this.save()
  }

  /**
   * Realtime rooms use this small process-local lock so a player cannot
   * change career through REST while a work challenge is still settling.
   * The durable session/claim tables remain the source of truth for rewards;
   * this lock only covers the short-lived active-session window.
   */
  beginWorkSession(userId: string): boolean {
    if (this.activeWorkUsers.has(userId)) return false
    this.activeWorkUsers.add(userId)
    return true
  }

  endWorkSession(userId: string): void {
    this.activeWorkUsers.delete(userId)
  }

  hasActiveWorkSession(userId: string): boolean {
    return this.activeWorkUsers.has(userId)
  }

  getUserByEmail(email: string): DbUser | undefined { return this.state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) }
  getUserByLogin(identifier: string): DbUser | undefined {
    const normalized = identifier.trim().toLowerCase()
    return this.state.users.find((user) => user.username?.toLowerCase() === normalized) || this.state.users.find((user) => user.email.toLowerCase() === normalized || user.email.split('@')[0].toLowerCase() === normalized)
  }
  getUserById(id: string): DbUser | undefined { return this.state.users.find((user) => user.id === id) }
  getStudio(studioId: string): Studio | null {
    const studio = this.state.studios.find((item) => item.id === studioId)
    return studio ? { ...studio, xpToNextLevel: xpToNextLevel(studio.xp), unlocks: unlocksForLevel(studio.level) } : null
  }
  getMember(studioId: string, userId: string): DbMember | undefined { return this.state.members.find((member) => member.studioId === studioId && member.userId === userId) }
  getMembers(studioId: string, presence: Map<string, Presence>, includeEmails = false): MemberView[] {
    return this.state.members.filter((member) => member.studioId === studioId).map((member) => {
      const user = this.getUserById(member.userId)!
      const live = presence.get(user.id)
      const safeUser = toUser(user)
      if (!includeEmails) safeUser.email = ''
      return { ...safeUser, memberId: member.id, online: Boolean(live?.online), currentRoom: live?.currentRoom || 'LOBBY' }
    })
  }
  getProjects(studioId: string): Project[] {
    return this.state.projects.filter((project) => project.studioId === studioId).map((project) => ({ ...project, progress: this.projectProgress(project.id) }))
  }
  getProject(id: string): DbProject | undefined { return this.state.projects.find((project) => project.id === id) }
  getSprints(projectId?: string): Sprint[] { return this.state.sprints.filter((sprint) => !projectId || sprint.projectId === projectId).map((sprint) => ({ ...sprint, progress: this.sprintProgress(sprint.id) })) }
  getSprint(id: string): Sprint | null { return this.getSprints().find((sprint) => sprint.id === id) || null }
  getActiveSprint(studioId: string): Sprint | null {
    const projectIds = this.state.projects.filter((project) => project.studioId === studioId).map((project) => project.id)
    return this.getSprints().find((sprint) => sprint.status === 'ACTIVE' && projectIds.includes(sprint.projectId)) || null
  }
  getTasks(studioId: string, sprintId?: string): Task[] {
    const projectIds = new Set(this.state.projects.filter((project) => project.studioId === studioId).map((project) => project.id))
    return this.state.tasks.filter((task) => projectIds.has(task.projectId) && (!sprintId || task.sprintId === sprintId)).map((task) => ({ ...task }))
  }
  getTask(id: string): DbTask | undefined { return this.state.tasks.find((task) => task.id === id) }
  getQuestByTaskId(taskId: string): DbQuest | undefined { return this.state.quests.find((quest) => quest.taskId === taskId) }
  getQuests(studioId: string): Quest[] { return this.getTasks(studioId).map((task) => this.getQuestByTaskId(task.id)).filter(Boolean) as Quest[] }
  getBossBySprintId(sprintId: string): SprintBoss | null { return this.state.bosses.find((boss) => boss.sprintId === sprintId) || null }
  getResources(studioId: string): StudioResource[] { return this.state.resources.filter((resource) => resource.studioId === studioId).map((resource) => ({ ...resource, tags: [...resource.tags] })) }
  getActivities(studioId: string): ActivityEvent[] { return this.state.activities.filter((event) => event.studioId === studioId).slice(-50).reverse() }

  private getWorkProfileRecord(userId: string): DbWorkProfile {
    let profile = this.state.workProfiles.find((item) => item.userId === userId)
    if (!profile) {
      profile = { userId, tutorialCompleted: false, workStreak: 0 }
      this.state.workProfiles.push(profile)
    }
    return profile
  }

  private getWorkCareerRecord(userId: string, careerId: WorkCareerId): DbWorkCareerProgress {
    let progress = this.state.workCareerProgress.find((item) => item.userId === userId && item.careerId === careerId)
    if (!progress) {
      progress = { userId, careerId, careerXp: 0, rank: 'INTERN' }
      this.state.workCareerProgress.push(progress)
    }
    return progress
  }

  private getWorkDailyRecord(userId: string, date = utcDate()): DbWorkDailyStats {
    let daily = this.state.workDailyStats.find((item) => item.userId === userId && item.date === date)
    if (!daily) {
      daily = { userId, date, completedJobs: 0, paidJobs: 0, sessionCount: 0, careerXpEarned: 0, jobCounts: {}, salaryClaimed: false }
      this.state.workDailyStats.push(daily)
    }
    return daily
  }

  private workDailyStatus(userId: string, date = utcDate()): WorkDailyStatus {
    const daily = this.getWorkDailyRecord(userId, date)
    return {
      date,
      completedJobs: daily.completedJobs,
      paidJobs: daily.paidJobs,
      sessionCount: daily.sessionCount,
      careerXpEarned: daily.careerXpEarned,
      jobCounts: { ...daily.jobCounts },
      salaryEligible: daily.completedJobs >= workEconomy.salaryJobsRequired,
      salaryClaimed: daily.salaryClaimed,
    }
  }

  private workProgression(userId: string, date = utcDate()): WorkProgression {
    const profile = this.getWorkProfileRecord(userId)
    const current = profile.currentCareerId ? this.getWorkCareerRecord(userId, profile.currentCareerId) : undefined
    const daily = this.workDailyStatus(userId, date)
    return {
      userId,
      currentCareerId: profile.currentCareerId,
      currentRank: current?.rank || 'INTERN',
      careerXp: current?.careerXp || 0,
      careers: WORK_CAREER_IDS.map((careerId) => {
        const record = this.getWorkCareerRecord(userId, careerId)
        return { careerId: record.careerId, careerXp: record.careerXp, rank: record.rank, certificationRank: record.certificationRank, lastWorkedAt: record.lastWorkedAt }
      }),
      workStreak: profile.workStreak,
      dailyCompletedJobs: daily.completedJobs,
      dailyPaidJobs: daily.paidJobs,
      dailyWorkSessions: daily.sessionCount,
      dailyCareerXpEarned: daily.careerXpEarned,
      salaryEligible: daily.salaryEligible,
      salaryClaimedToday: daily.salaryClaimed,
      lastSalaryClaimDate: profile.lastSalaryClaimDate,
      lastCareerChangeAt: profile.lastCareerChangeAt,
    }
  }

  private workSalaryStatus(userId: string, date = utcDate()): WorkSalaryStatus {
    const profile = this.getWorkProfileRecord(userId)
    const daily = this.workDailyStatus(userId, date)
    const previousDaily = this.state.workDailyStats.find((entry) => entry.userId === userId && entry.date === this.previousUtcDate(date))
    const rank = profile.currentCareerId ? this.getWorkCareerRecord(userId, profile.currentCareerId).rank : 'INTERN'
    const baseSalary = profile.currentCareerId ? workSalaryForRank(rank) : 0
    const streakBonus = workSalaryBonus(profile.workStreak, baseSalary)
    // Keep today's shift authoritative while making a missed previous-day
    // paycheck explicit. There is no carry-over: EXPIRED is informational and
    // never makes the old salary claimable again.
    const previousSalaryExpired = Boolean(previousDaily && previousDaily.completedJobs >= workEconomy.salaryJobsRequired && !previousDaily.salaryClaimed && daily.completedJobs === 0 && !daily.salaryClaimed)
    return {
      date,
      state: daily.salaryClaimed ? 'CLAIMED' : daily.salaryEligible && Boolean(profile.currentCareerId) ? 'READY' : previousSalaryExpired ? 'EXPIRED' : 'LOCKED',
      baseSalary,
      streakBonus,
      totalSalary: baseSalary + streakBonus,
      requiredJobs: workEconomy.salaryJobsRequired,
      completedJobs: daily.completedJobs,
      streak: profile.workStreak,
    }
  }

  getWorkHistory(studioId: string, userId: string, limit = 50): WorkHistoryRecord[] {
    this.assertStudioUser(studioId, userId)
    return this.state.workSessions
      .filter((session) => session.userId === userId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, Math.max(1, Math.min(50, limit)))
      .map((session) => ({
        sessionId: session.sessionId,
        jobId: session.jobId,
        jobName: workJobDefinition(session.jobId)?.name || session.jobId,
        careerId: session.careerId,
        status: session.status,
        score: session.score,
        grade: session.grade,
        coinDelta: session.coinDelta,
        careerXpDelta: session.careerXpDelta,
        createdAt: session.completedAt || session.startedAt,
      }))
  }

  getWorkSnapshot(studioId: string, userId: string): WorkSnapshot {
    this.assertStudioUser(studioId, userId)
    const date = utcDate()
    return {
      progression: this.workProgression(userId, date),
      coinBalance: this.getPlayerProgressionRecord(userId).coinBalance,
      tutorialCompleted: this.getWorkProfileRecord(userId).tutorialCompleted,
      careers: workCareerDefinitions.map((career) => ({ ...career })),
      ranks: workRankDefinitions.map((rank) => ({ ...rank })),
      jobs: workJobDefinitions.map((job) => ({ ...job, careerIds: [...job.careerIds] })),
      daily: this.workDailyStatus(userId, date),
      salary: this.workSalaryStatus(userId, date),
      history: this.getWorkHistory(studioId, userId),
    }
  }

  getCareerProgress(studioId: string, userId: string, careerId: WorkCareerId): CareerTrackProgress {
    this.assertStudioUser(studioId, userId)
    if (!WORK_CAREER_IDS.includes(careerId)) throw new DomainError('INVALID_CAREER', 'Career is invalid.')
    const progress = this.getWorkCareerRecord(userId, careerId)
    return { careerId: progress.careerId, careerXp: progress.careerXp, rank: progress.rank, certificationRank: progress.certificationRank, lastWorkedAt: progress.lastWorkedAt }
  }

  selectCareer(studioId: string, userId: string, careerId: WorkCareerId): WorkProgression {
    this.assertStudioUser(studioId, userId)
    if (!WORK_CAREER_IDS.includes(careerId)) throw new DomainError('INVALID_CAREER', 'Career is invalid.')
    if (this.hasActiveWorkSession(userId)) throw new DomainError('WORK_SESSION_ACTIVE', 'Hãy hoàn thành work session trước khi chọn career.', 409)
    const profile = this.getWorkProfileRecord(userId)
    if (profile.currentCareerId) throw new DomainError('CAREER_ALREADY_SELECTED', 'Career đã được chọn. Dùng chức năng đổi nghề sau cooldown.', 409)
    if (!profile.tutorialCompleted) throw new DomainError('WORK_TUTORIAL_REQUIRED', 'Hãy hoàn thành Inbox Triage trước khi chọn career.', 409)
    profile.currentCareerId = careerId
    this.getWorkCareerRecord(userId, careerId)
    this.getSocialLoadout(studioId, userId)
    this.save()
    return this.workProgression(userId)
  }

  changeCareer(studioId: string, userId: string, careerId: WorkCareerId, nowMs = Date.now()): WorkProgression {
    this.assertStudioUser(studioId, userId)
    if (!WORK_CAREER_IDS.includes(careerId)) throw new DomainError('INVALID_CAREER', 'Career is invalid.')
    if (this.hasActiveWorkSession(userId)) throw new DomainError('WORK_SESSION_ACTIVE', 'Hãy hoàn thành work session trước khi đổi career.', 409)
    const profile = this.getWorkProfileRecord(userId)
    if (!profile.currentCareerId) return this.selectCareer(studioId, userId, careerId)
    if (profile.currentCareerId === careerId) throw new DomainError('CAREER_ALREADY_ACTIVE', 'Career này đang là career hiện tại.', 409)
    if (profile.lastCareerChangeAt) {
      const elapsed = nowMs - new Date(profile.lastCareerChangeAt).getTime()
      if (elapsed < workEconomy.careerChangeCooldownMs) {
        const remainingHours = Math.ceil((workEconomy.careerChangeCooldownMs - Math.max(0, elapsed)) / 3_600_000)
        throw new DomainError('CAREER_CHANGE_COOLDOWN', `Bạn có thể đổi career sau khoảng ${remainingHours} giờ.`, 409)
      }
    }
    profile.currentCareerId = careerId
    profile.lastCareerChangeAt = new Date(nowMs).toISOString()
    this.getWorkCareerRecord(userId, careerId)
    this.getSocialLoadout(studioId, userId)
    this.save()
    return this.workProgression(userId)
  }

  private previousUtcDate(date: string): string {
    const previous = new Date(`${date}T00:00:00.000Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    return previous.toISOString().slice(0, 10)
  }

  private updateWorkStreak(profile: DbWorkProfile, date: string) {
    if (profile.lastWorkedDate === date) return
    profile.workStreak = profile.lastWorkedDate === this.previousUtcDate(date) ? profile.workStreak + 1 : 1
    profile.lastWorkedDate = date
  }

  private existingWorkClaim(idempotencyKey: string): DbWorkRewardClaim | undefined {
    return this.state.workRewardClaims.find((claim) => claim.idempotencyKey === idempotencyKey)
  }

  private restoreWorkReward(studioId: string, userId: string, claim: DbWorkRewardClaim): WorkReward {
    const reward = JSON.parse(claim.receiptJson) as WorkReward
    const progression = this.workProgression(userId)
    return { ...reward, mode: 'JOB', coinBalance: this.getPlayerProgressionRecord(userId).coinBalance, careerXp: progression.careerXp, rank: progression.currentRank, salaryProgress: progression.dailyCompletedJobs, duplicate: true }
  }

  settleWorkJob(studioId: string, userId: string, input: WorkJobSettlementInput): WorkReward {
    const user = this.assertStudioUser(studioId, userId)
    const existingClaim = this.existingWorkClaim(`work:${input.sessionId}`)
    if (existingClaim) {
      if (existingClaim.userId !== userId) throw new DomainError('WORK_SESSION_FORBIDDEN', 'Work session không thuộc về tài khoản này.', 403)
      return this.restoreWorkReward(studioId, userId, existingClaim)
    }
    const job = workJobDefinition(input.jobId)
    if (!job) throw new DomainError('INVALID_WORK_JOB', 'Work job is invalid.')
    if (input.challenge.publicChallenge.mode !== 'JOB' || input.challenge.publicChallenge.sessionId !== input.sessionId || input.challenge.publicChallenge.jobId !== job.id) {
      throw new DomainError('WORK_SESSION_INVALID', 'Work challenge không khớp với session.', 409)
    }
    const profile = this.getWorkProfileRecord(userId)
    const date = utcDate()
    const daily = this.getWorkDailyRecord(userId, date)
    // General tutorial jobs may be submitted before a career is selected, but
    // once a career exists their XP must always follow the active track. Never
    // trust a client-provided careerId to award XP to an unrelated track.
    const selectedCareer = job.careerIds.length === 0 ? profile.currentCareerId : input.careerId
    if (input.careerId && input.careerId !== selectedCareer) throw new DomainError('CAREER_JOB_LOCKED', 'Career trong work session không khớp career hiện tại.', 409)
    if (job.careerIds.length > 0) {
      if (!selectedCareer || profile.currentCareerId !== selectedCareer || !job.careerIds.includes(selectedCareer)) throw new DomainError('CAREER_JOB_LOCKED', 'Job này không thuộc career hiện tại.', 409)
      const currentRank = this.getWorkCareerRecord(userId, selectedCareer).rank
      if (workRankIndex(currentRank) < workRankIndex(job.minRank)) throw new DomainError('WORK_RANK_REQUIRED', `Cần rank ${workRankDefinitions.find((rank) => rank.id === job.minRank)?.name || job.minRank}.`, 409)
    }
    const count = daily.jobCounts[job.id] || 0
    if (count >= job.dailyLimit) throw new DomainError('WORK_JOB_DAILY_LIMIT', 'Job này đã đủ lượt trong hôm nay.', 409)
    const invalidSession = Boolean(input.abandoned || input.expired)
    const scoreResult = invalidSession
      ? { score: 0, grade: 'C' as WorkGrade }
      : evaluateWorkChallenge(input.challenge, input.actions, input.elapsedMs)
    const practice = !invalidSession && daily.paidJobs >= workEconomy.paidJobsPerDay
    const coinDelta = invalidSession || practice ? 0 : workGradeReward(job.baseCoin, scoreResult.grade, 'coin')
    const requestedCareerXp = invalidSession ? 10 : practice ? Math.floor(job.baseCareerXp * 0.25) : workGradeReward(job.baseCareerXp, scoreResult.grade, 'careerXp')
    const careerRecord = selectedCareer ? this.getWorkCareerRecord(userId, selectedCareer) : undefined
    const remainingCareerXp = Math.max(0, workEconomy.careerXpPerDay - daily.careerXpEarned)
    const careerXpDelta = careerRecord ? Math.min(requestedCareerXp, remainingCareerXp) : 0
    const wallet = this.applyWalletDelta(userId, coinDelta, 'WORK_JOB', input.sessionId, `work:${input.sessionId}`, { jobId: job.id, careerId: selectedCareer || '', grade: scoreResult.grade, practice })
    if (careerRecord && careerXpDelta > 0) {
      careerRecord.careerXp += careerXpDelta
      careerRecord.lastWorkedAt = new Date().toISOString()
      daily.careerXpEarned += careerXpDelta
    }
    daily.sessionCount += 1
    daily.jobCounts[job.id] = count + 1
    if (!invalidSession) {
      daily.completedJobs += 1
      if (coinDelta > 0) daily.paidJobs += 1
      this.updateWorkStreak(profile, date)
      if (job.id === 'INBOX_TRIAGE') profile.tutorialCompleted = true
    }
    const status: WorkSessionStatus = input.expired ? 'EXPIRED' : input.abandoned ? 'ABANDONED' : 'COMPLETED'
    const rank = careerRecord?.rank || 'INTERN'
    const grantedAt = new Date().toISOString()
    const reward: WorkReward = { mode: 'JOB', sessionId: input.sessionId, jobId: job.id, careerId: selectedCareer, grade: scoreResult.grade, score: scoreResult.score, coinDelta: wallet.transaction.delta, coinBalance: this.getPlayerProgressionRecord(userId).coinBalance, careerXpDelta, careerXp: careerRecord?.careerXp || 0, rank, promoted: false, salaryProgress: daily.completedJobs, grantedAt, practice }
    const session: DbWorkSession = { sessionId: input.sessionId, userId, jobId: job.id, careerId: selectedCareer, status, startedAt: input.startedAt || grantedAt, completedAt: grantedAt, score: scoreResult.score, grade: scoreResult.grade, coinDelta: wallet.transaction.delta, careerXpDelta, idempotencyKey: `work:${input.sessionId}`, receiptJson: JSON.stringify(reward) }
    this.state.workSessions.push(session)
    this.state.workRewardClaims.push({ idempotencyKey: `work:${input.sessionId}`, userId, kind: 'JOB', sessionId: input.sessionId, receiptJson: JSON.stringify(reward), grantedAt })
    // Work receipts are private. The studio activity feed may announce that a
    // shift happened, but it must not become an earnings, score, or
    // productivity tracker for other players.
    this.addActivity(studioId, 'WORK_COMPLETED', userId, `${user.displayName} completed ${job.name}.`, { jobId: job.id, careerId: selectedCareer || '' })
    this.save()
    return reward
  }

  completeWorkCertification(studioId: string, userId: string, input: WorkCertificationSettlementInput): WorkCertificationResult {
    this.assertStudioUser(studioId, userId)
    const key = `certification:${input.sessionId}`
    const existingClaim = this.existingWorkClaim(key)
    if (existingClaim) {
      if (existingClaim.userId !== userId) throw new DomainError('WORK_SESSION_FORBIDDEN', 'Certification session không thuộc về tài khoản này.', 403)
      return { ...(JSON.parse(existingClaim.receiptJson) as WorkCertificationResult), duplicate: true }
    }
    const profile = this.getWorkProfileRecord(userId)
    if (profile.currentCareerId !== input.careerId) throw new DomainError('CAREER_NOT_ACTIVE', 'Certification chỉ dành cho career hiện tại.', 409)
    const progress = this.getWorkCareerRecord(userId, input.careerId)
    const nextRank = workNextRank(progress.rank)
    const definition = workRankDefinitions.find((rank) => rank.id === input.targetRank)
    if (!definition || nextRank !== input.targetRank) throw new DomainError('INVALID_PROMOTION_TARGET', 'Promotion target không hợp lệ.', 409)
    if (progress.careerXp < definition.careerXpRequired) throw new DomainError('CERTIFICATION_NOT_READY', 'Chưa đủ Career XP cho certification này.', 409)
    if (input.challenge.publicChallenge.mode !== 'CERTIFICATION' || input.challenge.publicChallenge.sessionId !== input.sessionId || input.challenge.publicChallenge.careerId !== input.careerId || input.challenge.publicChallenge.targetRank !== input.targetRank) {
      throw new DomainError('WORK_SESSION_INVALID', 'Certification challenge không khớp với session.', 409)
    }
    const result = evaluateWorkChallenge(input.challenge, input.actions, input.elapsedMs)
    const passed = result.score >= workEconomy.certificationPassScore
    if (passed) {
      progress.rank = input.targetRank
      progress.certificationRank = input.targetRank
    }
    const receipt: WorkCertificationResult = { mode: 'CERTIFICATION', sessionId: input.sessionId, careerId: input.careerId, targetRank: input.targetRank, score: result.score, passed, promoted: passed, currentRank: progress.rank, careerXp: progress.careerXp, grantedAt: new Date().toISOString() }
    this.state.workRewardClaims.push({ idempotencyKey: key, userId, kind: 'CERTIFICATION', sessionId: input.sessionId, receiptJson: JSON.stringify(receipt), grantedAt: receipt.grantedAt })
    this.addActivity(studioId, 'WORK_COMPLETED', userId, passed ? `Career promotion unlocked: ${input.careerId} ${input.targetRank}.` : `${input.careerId} certification attempt needs another try.`, { careerId: input.careerId, rank: input.targetRank, passed })
    this.save()
    return receipt
  }

  claimDailySalary(studioId: string, userId: string): DailySalaryReceipt {
    const user = this.assertStudioUser(studioId, userId)
    const profile = this.getWorkProfileRecord(userId)
    const date = utcDate()
    const daily = this.getWorkDailyRecord(userId, date)
    const key = `salary:${userId}:${date}`
    const existingClaim = this.existingWorkClaim(key)
    if (existingClaim) {
      const receipt = JSON.parse(existingClaim.receiptJson) as DailySalaryReceipt
      return { ...receipt, coinBalance: this.getPlayerProgressionRecord(userId).coinBalance, duplicate: true }
    }
    if (!profile.currentCareerId) throw new DomainError('CAREER_REQUIRED', 'Hãy chọn career trước khi nhận lương.', 409)
    if (daily.completedJobs < workEconomy.salaryJobsRequired) throw new DomainError('SALARY_NOT_READY', `Cần hoàn thành ${workEconomy.salaryJobsRequired} job hợp lệ trong ngày.`, 409)
    const rank = this.getWorkCareerRecord(userId, profile.currentCareerId).rank
    const baseSalary = workSalaryForRank(rank)
    const streakBonus = workSalaryBonus(profile.workStreak, baseSalary)
    const coinDelta = baseSalary + streakBonus
    const wallet = this.applyWalletDelta(userId, coinDelta, 'DAILY_SALARY', date, key, { careerId: profile.currentCareerId, rank, streak: profile.workStreak })
    daily.salaryClaimed = true
    profile.lastSalaryClaimDate = date
    const receipt: DailySalaryReceipt = { userId, date, baseSalary, streakBonus, coinDelta: wallet.transaction.delta, coinBalance: this.getPlayerProgressionRecord(userId).coinBalance, rank, streak: profile.workStreak, grantedAt: wallet.transaction.createdAt }
    this.state.workRewardClaims.push({ idempotencyKey: key, userId, kind: 'SALARY', receiptJson: JSON.stringify(receipt), grantedAt: receipt.grantedAt })
    // Do not publish salary amount or streak-derived payout details to the
    // studio activity feed. The claimant receives those values privately in
    // DailySalaryReceipt.
    this.addActivity(studioId, 'WORK_SALARY', userId, `${user.displayName} received the daily ${rank} paycheck.`)
    this.save()
    return receipt
  }

  private getPlayerProgressionRecord(userId: string): DbPlayerProgression {
    let progression = this.state.playerProgressions.find((item) => item.userId === userId)
    if (!progression) {
      progression = { userId, gameXp: 0, gameLevel: 1, coinBalance: socialEconomy.startingCoin, freeRoundsRewardedToday: 0, gameXpEarnedToday: 0 }
      this.state.playerProgressions.push(progression)
    }
    return progression
  }

  private getLoadoutRecord(userId: string): DbLoadout {
    let loadout = this.state.loadouts.find((item) => item.userId === userId)
    if (!loadout) {
      loadout = { userId, avatarKey: 'adam', nameplateId: 'nameplate-basic' }
      this.state.loadouts.push(loadout)
    }
    return loadout
  }

  private getPropertyRecord(userId: string): DbProperty {
    let property = this.state.properties.find((item) => item.ownerId === userId)
    if (!property) {
      property = { ownerId: userId, templateId: 'room_template_v1', layoutVersion: 1, furniture: [], visitCount: 0, updatedAt: new Date().toISOString(), styles: { ...DEFAULT_PROPERTY_STYLES }, visibility: 'FRIENDS' }
      this.state.properties.push(property)
    }
    if (!property.styles || !isValidPropertyStyles(property.styles)) property.styles = { ...DEFAULT_PROPERTY_STYLES }
    if (!property.visibility) property.visibility = 'FRIENDS'
    return property
  }

  private assertStudioUser(studioId: string, userId: string): DbUser {
    const user = this.getUserById(userId)
    if (!user || user.studioId !== studioId) throw new DomainError('UNAUTHORIZED', 'You are not a member of this studio.', 403)
    return user
  }

  private resetDailyCounters(progression: DbPlayerProgression, date = utcDate()) {
    if (progression.freeRewardDate !== date) {
      progression.freeRewardDate = date
      progression.freeRoundsRewardedToday = 0
    }
    if (progression.gameXpDate !== date) {
      progression.gameXpDate = date
      progression.gameXpEarnedToday = 0
    }
  }

  private findWalletTransaction(idempotencyKey: string): DbWalletTransaction | undefined {
    return this.state.walletTransactions.find((transaction) => transaction.idempotencyKey === idempotencyKey)
  }

  private applyWalletDelta(userId: string, delta: number, source: string, sourceId: string, idempotencyKey: string, metadata?: Record<string, string | number | boolean>): { transaction: WalletTransaction; duplicate: boolean } {
    const existing = this.findWalletTransaction(idempotencyKey)
    if (existing) return { transaction: { ...existing, metadata: existing.metadata ? { ...existing.metadata } : undefined }, duplicate: true }
    const progression = this.getPlayerProgressionRecord(userId)
    const nextBalance = progression.coinBalance + delta
    if (nextBalance < 0) {
      recordSocialMetric('social_wallet_rejected', { userId, source, sourceId, delta })
      throw new DomainError('INSUFFICIENT_COIN', 'Not enough Coin for this action.', 409)
    }
    progression.coinBalance = nextBalance
    const transaction: DbWalletTransaction = { id: randomUUID(), userId, delta, balanceAfter: nextBalance, source, sourceId, idempotencyKey, metadata, createdAt: new Date().toISOString() }
    this.state.walletTransactions.push(transaction)
    return { transaction, duplicate: false }
  }

  private applyGameXp(progression: DbPlayerProgression, requestedXp: number, date = utcDate()): number {
    this.resetDailyCounters(progression, date)
    const remaining = Math.max(0, socialEconomy.dailyGameXpCap - progression.gameXpEarnedToday)
    const granted = Math.max(0, Math.min(requestedXp, remaining))
    progression.gameXp += granted
    progression.gameXpEarnedToday += granted
    progression.gameLevel = calculateSocialLevel(progression.gameXp)
    return granted
  }

  private gameQuestViews(userId: string, date = utcDate()): GameQuest[] {
    return gameQuestDefinitions.map((definition) => {
      const periodKey = gameQuestPeriodKey(definition.category, date)
      const record = this.state.gameQuestProgress.find((candidate) => candidate.userId === userId && candidate.questId === definition.id && candidate.periodKey === periodKey)
      return {
        ...definition,
        progress: record?.progress || 0,
        completed: Boolean(record?.completed),
        claimed: Boolean(record?.claimed),
        periodKey,
        completedAt: record?.completedAt,
      }
    })
  }

  private advanceGameQuests(studioId: string, userId: string, metric: GameQuestMetric, quantity = 1, date = utcDate()): { gameXpDelta: number; coinDelta: number; quests: GameQuest[]; completedQuestIds: string[] } {
    const user = this.assertStudioUser(studioId, userId)
    const progression = this.getPlayerProgressionRecord(userId)
    const increment = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
    let gameXpDelta = 0
    let coinDelta = 0
    const completedQuestIds: string[] = []
    if (increment > 0) {
      gameQuestDefinitions.filter((definition) => definition.metric === metric).forEach((definition) => {
        const periodKey = gameQuestPeriodKey(definition.category, date)
        let record = this.state.gameQuestProgress.find((candidate) => candidate.userId === userId && candidate.questId === definition.id && candidate.periodKey === periodKey)
        if (!record) {
          const created: DbGameQuestProgress = { userId, questId: definition.id, periodKey, progress: 0, completed: false, claimed: false }
          this.state.gameQuestProgress.push(created)
          record = created
        }
        if (record.claimed) return
        record.progress = Math.min(definition.target, record.progress + increment)
        if (record.progress < definition.target) return

        const claimedAt = new Date().toISOString()
        record.completed = true
        record.claimed = true
        record.completedAt = claimedAt
        record.claimedAt = claimedAt
        if (definition.coinReward > 0) {
          const wallet = this.applyWalletDelta(userId, definition.coinReward, 'GAME_QUEST', definition.id, `game-quest:${userId}:${definition.id}:${periodKey}`, { questId: definition.id, periodKey })
          if (!wallet.duplicate) coinDelta += wallet.transaction.delta
        }
        const questXp = this.applyGameXp(progression, definition.xpReward, date)
        gameXpDelta += questXp
        completedQuestIds.push(definition.id)
        this.addActivity(studioId, 'SOCIAL_REWARD', userId, `${user.displayName} completed the ${definition.title} mission.`, { questId: definition.id, gameXp: questXp, coins: definition.coinReward })
      })
    }
    return { gameXpDelta, coinDelta, quests: this.gameQuestViews(userId, date), completedQuestIds }
  }

  private awardCharacterXpForGame(studioId: string, userId: string, gameId: SocialGameId, outcome: 'WIN' | 'TIE' | 'LOSS', rewardOverride?: { play: number; win: number }): { gameXpDelta: number; coinDelta: number; quests: GameQuest[]; completedQuestIds: string[] } {
    const progression = this.getPlayerProgressionRecord(userId)
    const reward = rewardOverride || characterGameXpRewards[gameId] || { play: 10, win: 10 }
    const outcomeBonus = outcome === 'WIN' ? reward.win : outcome === 'TIE' ? Math.floor(reward.win / 2) : 0
    const gameXpDelta = this.applyGameXp(progression, reward.play + outcomeBonus)
    const playQuests = this.advanceGameQuests(studioId, userId, 'PLAY_ROUND')
    const winQuests = outcome === 'WIN' ? this.advanceGameQuests(studioId, userId, 'WIN_ROUND') : { gameXpDelta: 0, coinDelta: 0, quests: playQuests.quests, completedQuestIds: [] }
    return {
      gameXpDelta: gameXpDelta + playQuests.gameXpDelta + winQuests.gameXpDelta,
      coinDelta: playQuests.coinDelta + winQuests.coinDelta,
      quests: winQuests.quests,
      completedQuestIds: [...playQuests.completedQuestIds, ...winQuests.completedQuestIds],
    }
  }

  private settlementOutcome(payout: number, stake: number, metadata: Record<string, string | number | boolean>): 'WIN' | 'TIE' | 'LOSS' {
    const result = String(metadata.result || metadata.outcome || '').toUpperCase()
    if (result.includes('WIN') || result.includes('THẮNG') || result.includes('WON')) return 'WIN'
    if (result.includes('TIE') || result.includes('DRAW') || result.includes('PUSH') || result.includes('HÒA')) return 'TIE'
    if (metadata.abandoned === true) return 'LOSS'
    return payout > stake ? 'WIN' : payout === stake ? 'TIE' : 'LOSS'
  }

  private socialProgression(userId: string): SocialProgression {
    const progression = this.getPlayerProgressionRecord(userId)
    return {
      userId,
      gameXp: progression.gameXp,
      gameLevel: progression.gameLevel,
      xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp),
      xpToNextLevel: socialXpToNextLevel(progression.gameXp),
      coinBalance: progression.coinBalance,
      dailyClaimDate: progression.dailyClaimDate,
      freeRewardDate: progression.freeRewardDate,
      freeRoundsRewardedToday: progression.freeRoundsRewardedToday,
      gameXpDate: progression.gameXpDate,
      gameXpEarnedToday: progression.gameXpEarnedToday,
    }
  }

  getSocialCatalog(): CosmeticCatalogItem[] {
    return socialCosmeticCatalog.map((item) => ({ ...item }))
  }

  getSocialProgression(studioId: string, userId: string): SocialProgression {
    this.assertStudioUser(studioId, userId)
    return this.socialProgression(userId)
  }

  getGameQuests(studioId: string, userId: string): GameQuest[] {
    this.assertStudioUser(studioId, userId)
    return this.gameQuestViews(userId)
  }

  private getSocialTitleProgress(userId: string): SocialTitleProgress[] {
    const gameIds = new Set<SocialGameId>()
    SOCIAL_TITLES.forEach((title) => {
      if (title.achievement) gameIds.add(title.achievement.gameId)
    })

    const roundTotals = new Map<SocialGameId, Map<string, number>>()
    gameIds.forEach((gameId) => roundTotals.set(gameId, new Map<string, number>()))
    this.state.walletTransactions.forEach((transaction) => {
      const gameId = transaction.source as SocialGameId
      const gameRounds = roundTotals.get(gameId)
      if (!gameRounds || transaction.userId !== userId) return
      gameRounds.set(transaction.sourceId, (gameRounds.get(transaction.sourceId) || 0) + transaction.delta)
    })

    return [...roundTotals.entries()].map(([gameId, totals]) => ({
      gameId,
      // A loss in one round never erases a previously earned achievement.
      // Each round contributes only its positive net result.
      winningCoins: [...totals.values()].reduce((total, net) => total + Math.max(0, net), 0),
    }))
  }

  getSocialLoadout(studioId: string, userId: string, titleProgress = this.getSocialTitleProgress(userId)): SocialLoadout {
    this.assertStudioUser(studioId, userId)
    const loadout = this.getLoadoutRecord(userId)
    const user = this.getUserById(userId)
    let loadoutChanged = false
    if (user) {
      const config = normalizeCharacterConfig(user.characterConfig, user.avatarKey)
      // Keep the individual layer ids useful for clients that want to show
      // the active hat, shirt, accessory, etc. Existing JSON records may not
      // have these fields yet, so this also performs a small lazy migration.
      ;(Object.keys(WARDROBE_LOADOUT_KEYS) as WardrobeLoadoutKey[]).forEach((key) => {
        const avatarSlot = WARDROBE_LOADOUT_KEYS[key]
        const layerId = config.slots[avatarSlot]
        if (loadout[key] !== layerId) {
          loadout[key] = layerId
          loadoutChanged = true
        }
      })
      // Existing profiles may predate outfitId. If their saved LPC clothing
      // exactly matches an owned full bundle (normally the starter bundle),
      // surface that bundle as equipped instead of showing a false empty state.
      const owned = new Set(this.state.ownedCosmetics.filter((item) => item.userId === userId).map((item) => item.itemId))
      const matchingOutfit = socialCosmeticCatalog.find((item) => {
        if (item.wardrobe || !item.outfit || !owned.has(item.id)) return false
        return item.outfit.slots.top === config.slots.top && item.outfit.slots.bottom === config.slots.bottom && item.outfit.slots.shoes === config.slots.shoes
      })
      if (!loadout.outfitId && matchingOutfit) {
        loadout.outfitId = matchingOutfit.id
        loadoutChanged = true
      }
    }
    const currentWork = this.workProgression(userId)
    const currentCareerId = currentWork.currentCareerId
    const title = getSocialTitle(loadout.titleId)
    // A title is tied to its lifetime game achievement and, for career titles,
    // the active career/rank. Remove stale labels instead of showing an invalid title.
    if (loadout.titleId && (!title || !isSocialTitleUnlocked(title, titleProgress, currentCareerId, currentWork.currentRank))) {
      delete loadout.titleId
      loadoutChanged = true
    }
    if (loadoutChanged) this.save()
    return { ...loadout }
  }

  getAvatarSnapshot(studioId: string, userId: string): AvatarSnapshot {
    const user = this.assertStudioUser(studioId, userId)
    const characterConfig = normalizeCharacterConfig(user.characterConfig, user.avatarKey)
    const loadout = this.getSocialLoadout(studioId, userId)
    return {
      userId: user.id,
      displayName: user.displayName,
      characterConfig,
      avatarKey: characterConfigToLegacyAvatar(characterConfig),
      outfitId: loadout.outfitId,
      nameplateId: loadout.nameplateId,
      titleId: loadout.titleId,
      borderId: loadout.borderId,
      emoteId: loadout.emoteId,
      revision: Math.max(1, user.avatarRevision || 1),
      updatedAt: user.avatarUpdatedAt || user.createdAt,
    }
  }

  private socialPresenceView(studioId: string, userId: string, presence?: Map<string, Presence>): SocialPresenceView {
    const user = this.assertStudioUser(studioId, userId)
    const live = presence?.get(userId)
    const avatar = this.getAvatarSnapshot(studioId, userId)
    return {
      userId,
      displayName: user.displayName,
      avatar,
      online: Boolean(live?.online),
      sessionId: live?.online ? live.sessionId : undefined,
      status: live?.online ? live.status || 'ONLINE' : 'OFFLINE',
      currentRoom: live?.currentRoom,
      activity: live?.activity,
      partyId: live?.partyId,
      lastSeenAt: live?.lastSeenAt,
    }
  }

  private findFriendship(studioId: string, firstUserId: string, secondUserId: string): DbFriendship | undefined {
    return this.state.friendships.find((friendship) => (
      friendship.studioId === studioId &&
      ((friendship.requesterId === firstUserId && friendship.addresseeId === secondUserId) ||
        (friendship.requesterId === secondUserId && friendship.addresseeId === firstUserId))
    ))
  }

  isBlocked(studioId: string, firstUserId: string, secondUserId: string): boolean {
    this.assertStudioUser(studioId, firstUserId)
    this.assertStudioUser(studioId, secondUserId)
    return this.state.blocks.some((block) => (
      block.studioId === studioId &&
      ((block.blockerId === firstUserId && block.blockedId === secondUserId) ||
        (block.blockerId === secondUserId && block.blockedId === firstUserId))
    ))
  }

  getFriendshipStatus(studioId: string, viewerId: string, otherUserId: string): 'NONE' | 'INCOMING' | 'OUTGOING' | 'FRIENDS' | 'BLOCKED' {
    this.assertStudioUser(studioId, viewerId)
    this.assertStudioUser(studioId, otherUserId)
    if (viewerId === otherUserId) return 'NONE'
    if (this.isBlocked(studioId, viewerId, otherUserId)) return 'BLOCKED'
    const friendship = this.findFriendship(studioId, viewerId, otherUserId)
    if (!friendship) return 'NONE'
    if (friendship.status === 'ACCEPTED') return 'FRIENDS'
    if (friendship.status === 'PENDING') return friendship.addresseeId === viewerId ? 'INCOMING' : 'OUTGOING'
    return 'NONE'
  }

  private friendshipView(studioId: string, viewerId: string, friendship: DbFriendship, presence?: Map<string, Presence>): FriendshipView {
    const otherUserId = friendship.requesterId === viewerId ? friendship.addresseeId : friendship.requesterId
    const user = this.assertStudioUser(studioId, otherUserId)
    return {
      id: friendship.id,
      userId: user.id,
      displayName: user.displayName,
      avatar: this.getAvatarSnapshot(studioId, user.id),
      status: friendship.status,
      direction: friendship.status === 'PENDING' ? (friendship.addresseeId === viewerId ? 'INCOMING' : 'OUTGOING') : undefined,
      presence: friendship.status === 'ACCEPTED' ? this.socialPresenceView(studioId, user.id, presence) : undefined,
      createdAt: friendship.createdAt,
      updatedAt: friendship.updatedAt,
    }
  }

  private addSocialNotification(studioId: string, userId: string, type: DbSocialNotification['type'], actorId: string | undefined, payload: Record<string, string | number | boolean>): DbSocialNotification {
    const notification: DbSocialNotification = {
      id: randomUUID(),
      studioId,
      userId,
      type,
      actorId,
      payload,
      createdAt: new Date().toISOString(),
    }
    this.state.socialNotifications.push(notification)
    const userNotifications = this.state.socialNotifications.filter((item) => item.userId === userId)
    if (userNotifications.length > 100) {
      const keep = new Set(userNotifications.slice(-100).map((item) => item.id))
      this.state.socialNotifications = this.state.socialNotifications.filter((item) => item.userId !== userId || keep.has(item.id))
    }
    return notification
  }

  createSocialNotification(studioId: string, userId: string, type: DbSocialNotification['type'], actorId: string | undefined, payload: Record<string, string | number | boolean>): SocialNotification {
    this.assertStudioUser(studioId, userId)
    const notification = this.addSocialNotification(studioId, userId, type, actorId, payload)
    this.save()
    return this.notificationView(notification)
  }

  private notificationView(notification: DbSocialNotification): SocialNotification {
    const actor = notification.actorId ? this.getUserById(notification.actorId) : undefined
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      actorId: notification.actorId,
      actorName: actor?.displayName,
      payload: { ...notification.payload },
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    }
  }

  getSocialPeopleSnapshot(studioId: string, userId: string, presence?: Map<string, Presence>): SocialPeopleSnapshot {
    this.assertStudioUser(studioId, userId)
    const related = this.state.friendships.filter((friendship) => (
      friendship.studioId === studioId &&
      (friendship.requesterId === userId || friendship.addresseeId === userId) &&
      ['PENDING', 'ACCEPTED'].includes(friendship.status)
    ))
    const friends = related.filter((friendship) => friendship.status === 'ACCEPTED').map((friendship) => this.friendshipView(studioId, userId, friendship, presence))
    const incomingRequests = related.filter((friendship) => friendship.status === 'PENDING' && friendship.addresseeId === userId).map((friendship) => this.friendshipView(studioId, userId, friendship, presence))
    const outgoingRequests = related.filter((friendship) => friendship.status === 'PENDING' && friendship.requesterId === userId).map((friendship) => this.friendshipView(studioId, userId, friendship, presence))
    const notifications = this.state.socialNotifications
      .filter((notification) => notification.studioId === studioId && notification.userId === userId)
      .slice(-50)
      .reverse()
      .map((notification) => this.notificationView(notification))
    return {
      friends: friends.sort((left, right) => Number(right.presence?.online) - Number(left.presence?.online) || left.displayName.localeCompare(right.displayName)),
      incomingRequests,
      outgoingRequests,
      notifications,
      unreadNotifications: notifications.filter((notification) => !notification.readAt).length,
    }
  }

  searchSocialPeople(studioId: string, viewerId: string, query: string, presence?: Map<string, Presence>): SocialPeopleSearchEntry[] {
    this.assertStudioUser(studioId, viewerId)
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return this.state.users
      .filter((user) => user.studioId === studioId && user.id !== viewerId && !this.isBlocked(studioId, viewerId, user.id))
      .filter((user) => user.displayName.toLowerCase().includes(normalized) || user.username?.toLowerCase().includes(normalized) || user.id.toLowerCase().includes(normalized))
      .slice(0, 20)
      .map((user) => ({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: this.getAvatarSnapshot(studioId, user.id),
        presence: this.socialPresenceView(studioId, user.id, presence),
        friendshipStatus: this.getFriendshipStatus(studioId, viewerId, user.id),
      }))
  }

  requestFriend(studioId: string, requesterId: string, addresseeId: string): FriendshipView {
    const requester = this.assertStudioUser(studioId, requesterId)
    const addressee = this.assertStudioUser(studioId, addresseeId)
    if (requesterId === addresseeId) throw new DomainError('INVALID_FRIEND_REQUEST', 'Bạn không thể tự kết bạn với chính mình.')
    if (this.isBlocked(studioId, requesterId, addresseeId)) throw new DomainError('SOCIAL_BLOCKED', 'Không thể kết nối với người chơi này.', 403)
    const now = new Date().toISOString()
    const existing = this.findFriendship(studioId, requesterId, addresseeId)
    if (existing?.status === 'ACCEPTED') return this.friendshipView(studioId, requesterId, existing)
    if (existing?.status === 'PENDING') {
      if (existing.addresseeId === requesterId) throw new DomainError('FRIEND_REQUEST_INCOMING', `${addressee.displayName} đã gửi lời mời kết bạn cho bạn.`, 409)
      return this.friendshipView(studioId, requesterId, existing)
    }
    const friendship: DbFriendship = existing || {
      id: randomUUID(),
      studioId,
      requesterId,
      addresseeId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }
    friendship.requesterId = requesterId
    friendship.addresseeId = addresseeId
    friendship.status = 'PENDING'
    friendship.updatedAt = now
    if (!existing) this.state.friendships.push(friendship)
    this.addSocialNotification(studioId, addresseeId, 'FRIEND_REQUEST', requesterId, { friendshipId: friendship.id })
    this.save()
    return this.friendshipView(studioId, requesterId, friendship)
  }

  acceptFriendRequest(studioId: string, userId: string, friendshipId: string): FriendshipView {
    const user = this.assertStudioUser(studioId, userId)
    const friendship = this.state.friendships.find((candidate) => candidate.id === friendshipId && candidate.studioId === studioId)
    if (!friendship || friendship.addresseeId !== userId) throw new DomainError('FRIEND_REQUEST_NOT_FOUND', 'Không tìm thấy lời mời kết bạn.', 404)
    if (this.isBlocked(studioId, userId, friendship.requesterId)) throw new DomainError('SOCIAL_BLOCKED', 'Không thể chấp nhận lời mời này.', 403)
    if (friendship.status === 'ACCEPTED') return this.friendshipView(studioId, userId, friendship)
    if (friendship.status !== 'PENDING') throw new DomainError('FRIEND_REQUEST_EXPIRED', 'Lời mời kết bạn không còn hiệu lực.', 409)
    friendship.status = 'ACCEPTED'
    friendship.updatedAt = new Date().toISOString()
    this.addSocialNotification(studioId, friendship.requesterId, 'FRIEND_ACCEPTED', userId, { friendshipId: friendship.id })
    this.save()
    return this.friendshipView(studioId, userId, friendship)
  }

  declineFriendRequest(studioId: string, userId: string, friendshipId: string): FriendshipView {
    this.assertStudioUser(studioId, userId)
    const friendship = this.state.friendships.find((candidate) => candidate.id === friendshipId && candidate.studioId === studioId)
    if (!friendship || friendship.addresseeId !== userId) throw new DomainError('FRIEND_REQUEST_NOT_FOUND', 'Không tìm thấy lời mời kết bạn.', 404)
    if (friendship.status === 'DECLINED' || friendship.status === 'REMOVED') return this.friendshipView(studioId, userId, friendship)
    if (friendship.status !== 'PENDING') throw new DomainError('FRIEND_REQUEST_INVALID', 'Chỉ có thể bỏ qua lời mời đang chờ.', 409)
    friendship.status = 'DECLINED'
    friendship.updatedAt = new Date().toISOString()
    this.save()
    return this.friendshipView(studioId, userId, friendship)
  }

  removeFriend(studioId: string, userId: string, otherUserId: string): void {
    this.assertStudioUser(studioId, userId)
    this.assertStudioUser(studioId, otherUserId)
    const friendship = this.findFriendship(studioId, userId, otherUserId)
    if (!friendship) return
    if (![friendship.requesterId, friendship.addresseeId].includes(userId)) throw new DomainError('FRIEND_FORBIDDEN', 'Bạn không có quyền thay đổi kết nối này.', 403)
    friendship.status = 'REMOVED'
    friendship.updatedAt = new Date().toISOString()
    this.save()
  }

  blockUser(studioId: string, blockerId: string, blockedId: string): void {
    this.assertStudioUser(studioId, blockerId)
    this.assertStudioUser(studioId, blockedId)
    if (blockerId === blockedId) throw new DomainError('INVALID_BLOCK', 'Bạn không thể chặn chính mình.')
    if (!this.state.blocks.some((block) => block.studioId === studioId && block.blockerId === blockerId && block.blockedId === blockedId)) {
      this.state.blocks.push({ id: randomUUID(), studioId, blockerId, blockedId, createdAt: new Date().toISOString() })
    }
    const friendship = this.findFriendship(studioId, blockerId, blockedId)
    if (friendship) {
      friendship.status = 'REMOVED'
      friendship.updatedAt = new Date().toISOString()
    }
    this.save()
  }

  unblockUser(studioId: string, blockerId: string, blockedId: string): void {
    this.assertStudioUser(studioId, blockerId)
    this.assertStudioUser(studioId, blockedId)
    this.state.blocks = this.state.blocks.filter((block) => !(block.studioId === studioId && block.blockerId === blockerId && block.blockedId === blockedId))
    this.save()
  }

  markSocialNotificationRead(studioId: string, userId: string, notificationId: string): void {
    this.assertStudioUser(studioId, userId)
    const notification = this.state.socialNotifications.find((candidate) => candidate.id === notificationId && candidate.studioId === studioId && candidate.userId === userId)
    if (!notification) throw new DomainError('NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo.', 404)
    notification.readAt = notification.readAt || new Date().toISOString()
    this.save()
  }

  markAllSocialNotificationsRead(studioId: string, userId: string): void {
    this.assertStudioUser(studioId, userId)
    const readAt = new Date().toISOString()
    this.state.socialNotifications.forEach((notification) => {
      if (notification.studioId === studioId && notification.userId === userId && !notification.readAt) notification.readAt = readAt
    })
    this.save()
  }

  getOwnedCosmetics(studioId: string, userId: string): string[] {
    this.assertStudioUser(studioId, userId)
    return this.state.ownedCosmetics.filter((item) => item.userId === userId).map((item) => item.itemId)
  }

  getInventory(studioId: string, userId: string): InventoryStack[] {
    this.assertStudioUser(studioId, userId)
    return this.state.playerInventory
      .filter((item) => item.userId === userId && item.quantity > 0)
      .sort((left, right) => left.itemId.localeCompare(right.itemId))
      .map((item) => ({ itemId: item.itemId, quantity: item.quantity }))
  }

  getFishingDailyCount(studioId: string, userId: string, date = utcDate()): number {
    this.assertStudioUser(studioId, userId)
    return this.state.inventoryTransactions.filter((transaction) => {
      if (transaction.userId !== userId || !transaction.idempotencyKey.startsWith(`fishing:${userId}:`)) return false
      try {
        const metadata = JSON.parse(transaction.metadataJson) as { utcDate?: string }
        return metadata.utcDate === date
      } catch {
        return false
      }
    }).length
  }

  getFishingCatchReceipt(studioId: string, userId: string, requestId: string, utcDate: string): FishingCatchReceipt | undefined {
    this.assertStudioUser(studioId, userId)
    const key = `fishing:${userId}:${utcDate}:${requestId}`
    const transaction = this.state.inventoryTransactions.find((candidate) => candidate.idempotencyKey === key)
    if (!transaction?.receiptJson) return undefined
    return JSON.parse(transaction.receiptJson) as FishingCatchReceipt
  }

  /**
   * Atomically applies one fishing catch in the file-backed store. The
   * optional fish/random arguments exist for deterministic tests; production
   * callers omit them so the fish is selected here with a secure RNG.
   */
  claimFishingCatch(input: {
    userId: string
    requestId: string
    utcDate: string
    fish?: FishDefinition
    random?: () => number
    studioId?: string
  }): FishingCatchReceipt {
    const user = this.getUserById(input.userId)
    const studioId = input.studioId || user?.studioId || ''
    this.assertStudioUser(studioId, input.userId)
    if (!/^[-a-zA-Z0-9_:]{8,120}$/.test(input.requestId)) throw new DomainError('INVALID_FISHING_REQUEST', 'Fishing request id is invalid.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.utcDate)) throw new DomainError('INVALID_FISHING_DATE', 'Fishing date is invalid.')

    const idempotencyKey = `fishing:${input.userId}:${input.utcDate}:${input.requestId}`
    const existing = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === idempotencyKey)
    if (existing?.receiptJson) {
      const receipt = JSON.parse(existing.receiptJson) as FishingCatchReceipt
      return { ...receipt, inventory: receipt.inventory.map((stack) => ({ ...stack })), duplicate: true }
    }

    const dailyCount = this.getFishingDailyCount(studioId, input.userId, input.utcDate)
    if (dailyCount >= FISHING_DAILY_LIMIT) throw new DomainError('FISHING_DAILY_LIMIT', `Daily fishing limit reached (${FISHING_DAILY_LIMIT}).`, 409)

    const selectedFish = input.fish
      ? FISH_DEFINITIONS.find((definition) => definition.id === input.fish?.id)
      : this.selectFishingFish(input.random)
    if (!selectedFish) throw new DomainError('INVALID_FISH', 'Fishing result is invalid.')
    const stack = this.state.playerInventory.find((item) => item.userId === input.userId && item.itemId === selectedFish.id)
    const quantityAfter = (stack?.quantity || 0) + 1
    const receipt: FishingCatchReceipt = {
      requestId: input.requestId,
      catchNumber: dailyCount + 1,
      fishId: selectedFish.id,
      rarity: selectedFish.rarity,
      quantityDelta: 1,
      quantityAfter,
      inventory: [],
    }
    if (stack) {
      stack.quantity = quantityAfter
      stack.updatedAt = new Date().toISOString()
    } else {
      this.state.playerInventory.push({ userId: input.userId, itemId: selectedFish.id, quantity: 1, updatedAt: new Date().toISOString() })
    }
    receipt.inventory = this.getInventory(studioId, input.userId)
    this.state.inventoryTransactions.push({
      id: randomUUID(),
      userId: input.userId,
      idempotencyKey,
      itemId: selectedFish.id,
      delta: 1,
      metadataJson: JSON.stringify({ utcDate: input.utcDate, catchNumber: receipt.catchNumber, rarity: selectedFish.rarity }),
      createdAt: new Date().toISOString(),
      receiptJson: JSON.stringify(receipt),
    })
    this.save()
    return receipt
  }

  /**
   * Sells a server-owned fish stack for its canonical catalog value. Fish are
   * the first inventory items exposed to the economy; starter UI-only items
   * never reach this method and therefore cannot be forged into Coin.
   */
  sellInventoryItem(studioId: string, userId: string, itemId: string, quantity: number, requestedSaleId?: string): InventorySaleReceipt {
    const seller = this.assertStudioUser(studioId, userId)
    const fish = FISH_DEFINITIONS.find((definition) => definition.id === itemId)
    if (!fish) throw new DomainError('INVALID_INVENTORY_ITEM', 'Item này chưa thể bán trong chợ cá.')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new DomainError('INVALID_INVENTORY_QUANTITY', 'Số lượng phải nằm trong khoảng 1 đến 100.000.')

    const saleId = requestedSaleId && /^[a-zA-Z0-9_-]{8,80}$/.test(requestedSaleId) ? requestedSaleId : randomUUID()
    const idempotencyKey = `inventory:sell:${userId}:${saleId}`
    const existing = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === idempotencyKey)
    if (existing?.receiptJson) {
      const receipt = JSON.parse(existing.receiptJson) as InventorySaleReceipt
      return { ...receipt, inventory: this.getInventory(studioId, userId), progression: this.socialProgression(userId), duplicate: true }
    }
    if (existing) throw new DomainError('INVENTORY_TRANSACTION_INVALID', 'Giao dịch bán trước đó không hợp lệ để thử lại.')

    const stack = this.state.playerInventory.find((item) => item.userId === userId && item.itemId === fish.id)
    if (!stack || stack.quantity < quantity) throw new DomainError('INSUFFICIENT_ITEM', `Bạn không có đủ ${fish.id} để bán.`, 409)

    const coinValue = fish.sellValue * quantity
    const wallet = this.applyWalletDelta(userId, coinValue, 'FISHING_SELL', saleId, `wallet:${idempotencyKey}`, { itemId: fish.id, quantity, sellValue: fish.sellValue })
    stack.quantity -= quantity
    stack.updatedAt = new Date().toISOString()
    const quantityAfter = stack.quantity
    const receipt: InventorySaleReceipt = {
      saleId,
      itemId: fish.id,
      quantity,
      quantityAfter,
      coinDelta: wallet.duplicate ? 0 : coinValue,
      progression: this.socialProgression(userId),
      inventory: this.getInventory(studioId, userId),
    }
    this.state.inventoryTransactions.push({
      id: randomUUID(),
      userId,
      idempotencyKey,
      itemId: fish.id,
      delta: -quantity,
      metadataJson: JSON.stringify({ type: 'FISHING_SELL', saleId, quantity, sellValue: fish.sellValue }),
      createdAt: new Date().toISOString(),
      receiptJson: JSON.stringify(receipt),
    })
    this.addActivity(studioId, 'SOCIAL_REWARD', userId, `${seller.displayName} sold ${quantity} ${fish.id}.`, { saleId, itemId: fish.id, quantity, coins: receipt.coinDelta })
    this.save()
    return receipt
  }

  /**
   * Transfers fish directly between two members of the same studio. The two
   * inventory ledger rows make retries safe even if a process stops between
   * the sender and recipient side of the mutation.
   */
  transferInventoryItem(studioId: string, senderId: string, recipientId: string, itemId: string, quantity: number, requestedTradeId?: string): InventoryTradeReceipt {
    const sender = this.assertStudioUser(studioId, senderId)
    const recipient = this.assertStudioUser(studioId, recipientId)
    if (senderId === recipientId) throw new DomainError('INVALID_TRADE', 'Bạn không thể trao đổi với chính mình.')
    const fish = FISH_DEFINITIONS.find((definition) => definition.id === itemId)
    if (!fish) throw new DomainError('INVALID_INVENTORY_ITEM', 'Item này chưa thể trao đổi.')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new DomainError('INVALID_INVENTORY_QUANTITY', 'Số lượng phải nằm trong khoảng 1 đến 100.000.')

    const tradeId = requestedTradeId && /^[a-zA-Z0-9_-]{8,80}$/.test(requestedTradeId) ? requestedTradeId : randomUUID()
    const senderKey = `inventory:trade:${tradeId}:sender`
    const recipientKey = `inventory:trade:${tradeId}:recipient`
    const existingSender = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === senderKey)
    const existingRecipient = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === recipientKey)

    if (existingSender && existingRecipient) {
      const savedReceipt = existingSender.receiptJson ? JSON.parse(existingSender.receiptJson) as InventoryTradeReceipt : undefined
      const receipt: InventoryTradeReceipt = savedReceipt || {
        tradeId,
        itemId: fish.id,
        quantity,
        recipientName: recipient.displayName,
        progression: this.socialProgression(senderId),
        inventory: this.getInventory(studioId, senderId),
      }
      return { ...receipt, inventory: this.getInventory(studioId, senderId), progression: this.socialProgression(senderId), duplicate: true }
    }

    const senderStack = this.state.playerInventory.find((item) => item.userId === senderId && item.itemId === fish.id)
    if (!existingSender && (!senderStack || senderStack.quantity < quantity)) throw new DomainError('INSUFFICIENT_ITEM', `Bạn không có đủ ${fish.id} để trao đổi.`, 409)

    if (!existingSender && senderStack) {
      senderStack.quantity -= quantity
      senderStack.updatedAt = new Date().toISOString()
      this.state.inventoryTransactions.push({
        id: randomUUID(),
        userId: senderId,
        idempotencyKey: senderKey,
        itemId: fish.id,
        delta: -quantity,
        metadataJson: JSON.stringify({ type: 'P2P_ITEM_TRADE', tradeId, quantity, recipientId }),
        createdAt: new Date().toISOString(),
      })
    }

    if (!existingRecipient) {
      const recipientStack = this.state.playerInventory.find((item) => item.userId === recipientId && item.itemId === fish.id)
      if (recipientStack) {
        recipientStack.quantity += quantity
        recipientStack.updatedAt = new Date().toISOString()
      } else {
        this.state.playerInventory.push({ userId: recipientId, itemId: fish.id, quantity, updatedAt: new Date().toISOString() })
      }
      this.state.inventoryTransactions.push({
        id: randomUUID(),
        userId: recipientId,
        idempotencyKey: recipientKey,
        itemId: fish.id,
        delta: quantity,
        metadataJson: JSON.stringify({ type: 'P2P_ITEM_TRADE', tradeId, quantity, senderId }),
        createdAt: new Date().toISOString(),
      })
    }

    const receipt: InventoryTradeReceipt = {
      tradeId,
      itemId: fish.id,
      quantity,
      recipientName: recipient.displayName,
      progression: this.socialProgression(senderId),
      inventory: this.getInventory(studioId, senderId),
    }
    const senderTransaction = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === senderKey)
    const recipientTransaction = this.state.inventoryTransactions.find((transaction) => transaction.idempotencyKey === recipientKey)
    if (senderTransaction) senderTransaction.receiptJson = JSON.stringify(receipt)
    if (recipientTransaction) recipientTransaction.receiptJson = JSON.stringify(receipt)
    this.addActivity(studioId, 'SOCIAL_REWARD', senderId, `${sender.displayName} sent ${quantity} ${fish.id} to ${recipient.displayName}.`, { tradeId, itemId: fish.id, quantity, recipientId })
    recordSocialMetric('social_trade', { senderId, recipientId, itemId: fish.id, quantity, tradeId, duplicate: false })
    this.save()
    return receipt
  }

  private selectFishingFish(random?: () => number): FishDefinition {
    const totalWeight = FISH_DEFINITIONS.reduce((sum, definition) => sum + definition.weight, 0)
    const secureFraction = () => randomInt(0, 1_000_000_000) / 1_000_000_000
    const value = Math.min(0.999999999, Math.max(0, (random || secureFraction)())) * totalWeight
    let cursor = 0
    for (const definition of FISH_DEFINITIONS) {
      cursor += definition.weight
      if (value < cursor) return definition
    }
    return FISH_DEFINITIONS[FISH_DEFINITIONS.length - 1]
  }

  private propertySnapshot(studioId: string, property: DbProperty): PropertySnapshot {
    const owner = this.assertStudioUser(studioId, property.ownerId)
    return { ownerId: owner.id, ownerName: owner.displayName, templateId: property.templateId, layoutVersion: property.layoutVersion, furniture: cloneFurniture(property.furniture), visitCount: property.visitCount, likes: this.state.propertyLikes.filter((like) => like.ownerId === owner.id).length, updatedAt: property.updatedAt, styles: { ...(property.styles || DEFAULT_PROPERTY_STYLES) }, visibility: property.visibility || 'FRIENDS' }
  }

  canEnterProperty(studioId: string, ownerId: string, viewerId: string): boolean {
    this.assertStudioUser(studioId, ownerId)
    this.assertStudioUser(studioId, viewerId)
    if (ownerId === viewerId) return true
    if (this.isBlocked(studioId, ownerId, viewerId)) return false
    const property = this.getPropertyRecord(ownerId)
    if ((property.visibility || 'FRIENDS') === 'PUBLIC') return true
    return this.getFriendshipStatus(studioId, viewerId, ownerId) === 'FRIENDS'
  }

  getProperty(studioId: string, ownerId: string, viewerId?: string): PropertySnapshot {
    this.assertStudioUser(studioId, ownerId)
    if (viewerId && viewerId !== ownerId) this.recordPropertyVisit(studioId, viewerId, ownerId)
    return this.propertySnapshot(studioId, this.getPropertyRecord(ownerId))
  }

  getSocialSnapshot(studioId: string, userId: string): SocialSnapshot {
    this.assertStudioUser(studioId, userId)
    const titleProgress = this.getSocialTitleProgress(userId)
    return { progression: this.socialProgression(userId), gameQuests: this.gameQuestViews(userId), titleProgress, catalog: this.getSocialCatalog(), ownedCosmetics: this.getOwnedCosmetics(studioId, userId), loadout: this.getSocialLoadout(studioId, userId, titleProgress), property: this.getProperty(studioId, userId), inventory: this.getInventory(studioId, userId), fishingDailyCount: this.getFishingDailyCount(studioId, userId), identity: this.getAvatarSnapshot(studioId, userId) }
  }

  getSocialLeaderboard(studioId: string, presence: Map<string, Presence>): SocialLeaderboardEntry[] {
    const entries = this.state.members
      .filter((member) => member.studioId === studioId)
      .map((member) => {
        const user = this.getUserById(member.userId)!
        const live = presence.get(user.id)
        const progression = this.socialProgression(user.id)
        return {
          rank: 0,
          userId: user.id,
          displayName: user.displayName,
          avatarKey: this.getSocialLoadout(studioId, user.id).avatarKey,
          avatar: this.getAvatarSnapshot(studioId, user.id),
          gameLevel: progression.gameLevel,
          coinBalance: progression.coinBalance,
          online: Boolean(live?.online),
          currentRoom: live?.currentRoom || 'LOBBY',
        }
      })
      .sort((left, right) => right.coinBalance - left.coinBalance || right.gameLevel - left.gameLevel || left.displayName.localeCompare(right.displayName))

    return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
  }

  claimDailySocialReward(studioId: string, userId: string): SocialReward {
    const user = this.assertStudioUser(studioId, userId)
    const progression = this.getPlayerProgressionRecord(userId)
    const date = utcDate()
    const idempotencyKey = `daily:${userId}:${date}`
    const existing = this.findWalletTransaction(idempotencyKey)
    if (existing) {
      recordSocialMetric('social_daily_claim', { userId, duplicate: true })
      return { roundId: idempotencyKey, gameId: 'TAG', userId, coinDelta: 0, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId, date), reason: 'Daily reward already claimed.', duplicate: true, grantedAt: existing.createdAt }
    }
    const wallet = this.applyWalletDelta(userId, socialEconomy.dailyCoin, 'DAILY_CLAIM', date, idempotencyKey)
    const gameXpDelta = this.applyGameXp(progression, socialEconomy.dailyGameXp, date)
    progression.dailyClaimDate = date
    this.addActivity(studioId, 'SOCIAL_REWARD', userId, `${user.displayName} claimed the daily social reward.`, { coins: socialEconomy.dailyCoin, gameXp: gameXpDelta })
    recordSocialMetric('social_daily_claim', { userId, duplicate: false, coinDelta: wallet.transaction.delta, gameXpDelta })
    recordSocialMetric('social_reward_granted', { userId, source: 'DAILY_CLAIM', coinDelta: wallet.transaction.delta, gameXpDelta })
    this.save()
    return { roundId: idempotencyKey, gameId: 'TAG', userId, coinDelta: wallet.transaction.delta, gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId, date), reason: 'Daily social reward.', grantedAt: wallet.transaction.createdAt }
  }

  purchaseCosmetic(studioId: string, userId: string, itemId: string): { item: CosmeticCatalogItem; progression: SocialProgression; duplicate: boolean } {
    const user = this.assertStudioUser(studioId, userId)
    const item = socialCosmeticCatalog.find((candidate) => candidate.id === itemId)
    if (!item) throw new DomainError('COSMETIC_NOT_FOUND', 'Cosmetic not found.', 404)
    const alreadyOwned = this.state.ownedCosmetics.some((owned) => owned.userId === userId && owned.itemId === itemId)
    if (alreadyOwned) return { item: { ...item }, progression: this.socialProgression(userId), duplicate: true }
    const progression = this.getPlayerProgressionRecord(userId)
    if (progression.gameLevel < (item.unlockLevel || 1)) throw new DomainError('COSMETIC_LOCKED', `Reach social Level ${item.unlockLevel} to unlock this item.`, 409)
    const key = `purchase:${userId}:${itemId}`
    const wallet = this.applyWalletDelta(userId, -item.price, 'COSMETIC_PURCHASE', itemId, key, { itemId })
    if (!wallet.duplicate) {
      this.state.ownedCosmetics.push({ userId, itemId, source: 'COIN_SHOP', acquiredAt: new Date().toISOString() })
      this.addActivity(studioId, 'COSMETIC_PURCHASE', userId, `${user.displayName} unlocked ${item.name}.`, { itemId, price: item.price })
      recordSocialMetric('cosmetic_purchase', { userId, itemId, price: item.price })
      this.save()
    }
    return { item: { ...item }, progression: this.socialProgression(userId), duplicate: wallet.duplicate }
  }

  updateSocialLoadout(studioId: string, userId: string, patch: Partial<Omit<SocialLoadout, 'userId'>>): SocialLoadout {
    const user = this.assertStudioUser(studioId, userId)
    const loadout = this.getLoadoutRecord(userId)
    const allowedSlots: Array<keyof Omit<SocialLoadout, 'userId'>> = ['outfitId', 'nameplateId', 'borderId', 'emoteId']
    allowedSlots.forEach((slot) => {
      const itemId = patch[slot]
      if (itemId !== undefined) {
        const item = socialCosmeticCatalog.find((candidate) => candidate.id === itemId)
        if (!item || item.slot !== slot.replace('Id', '').toUpperCase()) throw new DomainError('INVALID_LOADOUT', 'Cosmetic does not match this loadout slot.')
        if (!this.state.ownedCosmetics.some((owned) => owned.userId === userId && owned.itemId === itemId)) throw new DomainError('COSMETIC_NOT_OWNED', 'You do not own this cosmetic.', 409)
      }
    })
    if (patch.titleId !== undefined) {
      if (patch.titleId) {
        const title = getSocialTitle(patch.titleId)
        if (!title) throw new DomainError('INVALID_TITLE', 'Danh hiệu không tồn tại.')
        const currentWork = this.workProgression(userId)
        const currentCareerId = currentWork.currentCareerId
        if (title.careerId && title.careerId !== currentCareerId) {
          throw new DomainError('TITLE_CAREER_MISMATCH', currentCareerId ? `Danh hiệu này dành cho career ${title.careerId}.` : 'Hãy chọn career trước để mở khóa danh hiệu này.', 409)
        }
        const titleProgress = this.getSocialTitleProgress(userId)
        if (!isSocialTitleUnlocked(title, titleProgress, currentCareerId, currentWork.currentRank)) {
          if (title.requiredCareerRank && title.careerId === currentCareerId) {
            throw new DomainError('TITLE_RANK_LOCKED', `Đạt cấp ${title.requiredCareerRank} trong career ${title.careerId} để mở khóa danh hiệu này.`, 409)
          }
          if (title.achievement) {
            throw new DomainError('TITLE_ACHIEVEMENT_LOCKED', `Thắng ròng ${title.achievement.target.toLocaleString()} Coin ở ${title.achievement.gameId} để mở khóa danh hiệu này.`, 409)
          }
        }
      } else {
        delete loadout.titleId
      }
    }
    if (patch.avatarKey !== undefined) validateAvatarKey(patch.avatarKey)
    let equippedOutfitConfig: CharacterConfig | undefined
    if (patch.outfitId) {
      const outfitItem = socialCosmeticCatalog.find((candidate) => candidate.id === patch.outfitId)
      if (!outfitItem?.outfit) throw new DomainError('INVALID_OUTFIT', 'Outfit asset bundle is invalid.')
      const currentConfig = normalizeCharacterConfig(user.characterConfig, patch.avatarKey || user.avatarKey)
      const outfitSlots = outfitItem.wardrobe
        ? { [outfitItem.wardrobe.slot]: outfitItem.wardrobe.itemId }
        : outfitItem.outfit.slots
      equippedOutfitConfig = normalizeCharacterConfig({
        ...currentConfig,
        slots: { ...currentConfig.slots, ...outfitSlots },
      }, patch.avatarKey || user.avatarKey)
    }
    const wardrobePatch = (Object.keys(WARDROBE_LOADOUT_KEYS) as WardrobeLoadoutKey[])
      .filter((key) => patch[key] !== undefined)
    if (wardrobePatch.length) {
      const ownedIds = new Set(this.getOwnedCosmetics(studioId, userId))
      const ownedOutfits = socialCosmeticCatalog.filter((item) => (item.wardrobe || item.outfit) && ownedIds.has(item.id))
      const currentConfig = equippedOutfitConfig || normalizeCharacterConfig(user.characterConfig, patch.avatarKey || user.avatarKey)
      const slots = { ...currentConfig.slots }
      wardrobePatch.forEach((key) => {
        const avatarSlot = WARDROBE_LOADOUT_KEYS[key]
        const layerId = patch[key] as string
        const ownedLayer = ownedOutfits.some((item) => cosmeticLayerId(item, avatarSlot) === layerId)
        if (!ownedLayer) throw new DomainError('WARDROBE_ITEM_NOT_OWNED', `You do not own this ${avatarSlot} layer.`, 409)
        slots[avatarSlot] = layerId
      })
      equippedOutfitConfig = normalizeCharacterConfig({ ...currentConfig, slots }, patch.avatarKey || user.avatarKey)
    }
    const { titleId, topId, bottomId, shoesId, hatId, neckId, armsId, shouldersId, ...cosmeticPatch } = patch
    const appearanceChanged = patch.avatarKey !== undefined || patch.outfitId !== undefined || wardrobePatch.length > 0
    Object.assign(loadout, cosmeticPatch)
    const requestedLayerIds: Partial<Record<WardrobeLoadoutKey, string | undefined>> = { topId, bottomId, shoesId, hatId, neckId, armsId, shouldersId }
    ;(Object.keys(requestedLayerIds) as WardrobeLoadoutKey[]).forEach((key) => {
      const layerId = requestedLayerIds[key]
      if (layerId !== undefined) loadout[key] = layerId
    })
    if (titleId) loadout.titleId = titleId
    if (patch.avatarKey) {
      user.avatarKey = patch.avatarKey
      if (!equippedOutfitConfig) user.characterConfig = normalizeCharacterConfig(user.characterConfig, patch.avatarKey)
    }
    if (equippedOutfitConfig) {
      user.characterConfig = equippedOutfitConfig
      user.avatarKey = characterConfigToLegacyAvatar(equippedOutfitConfig)
      ;(Object.keys(WARDROBE_LOADOUT_KEYS) as WardrobeLoadoutKey[]).forEach((key) => {
        loadout[key] = equippedOutfitConfig?.slots[WARDROBE_LOADOUT_KEYS[key]]
      })
      const ownedIds = new Set(this.getOwnedCosmetics(studioId, userId))
      const matchingOutfit = socialCosmeticCatalog.find((item) => !item.wardrobe && item.outfit && ownedIds.has(item.id)
        && item.outfit.slots.top === equippedOutfitConfig?.slots.top
        && item.outfit.slots.bottom === equippedOutfitConfig?.slots.bottom
        && item.outfit.slots.shoes === equippedOutfitConfig?.slots.shoes)
      if (matchingOutfit) loadout.outfitId = matchingOutfit.id
      else delete loadout.outfitId
    }
    if (appearanceChanged) {
      user.avatarRevision = Math.max(1, (user.avatarRevision || 0) + 1)
      user.avatarUpdatedAt = new Date().toISOString()
    }
    this.save()
    return { ...loadout }
  }

  updatePropertyLayout(studioId: string, userId: string, furniture: FurniturePlacement[], styles?: PropertyStyles): PropertySnapshot {
    this.assertStudioUser(studioId, userId)
    if (!Array.isArray(furniture) || furniture.length > Math.min(socialEconomy.propertyMaxFurniture, HOME_MAX_FURNITURE)) throw new DomainError('INVALID_PROPERTY_LAYOUT', 'Property has too many furniture items.')
    const owned = new Set(this.getOwnedCosmetics(studioId, userId))
    const occupied = new Set<string>()
    furniture.forEach((placement) => {
      const definition = getHousingItemDefinition(placement.itemId)
      if (!owned.has(placement.itemId) || socialCosmeticCatalog.find((item) => item.id === placement.itemId)?.slot !== 'FURNITURE' || definition?.kind !== 'FURNITURE') throw new DomainError('INVALID_PROPERTY_ITEM', 'Property furniture is not owned.')
      if (![0, 90, 180, 270].includes(placement.rotation)) throw new DomainError('INVALID_PROPERTY_ROTATION', 'Furniture rotation is invalid.')
      const width = placement.rotation === 90 || placement.rotation === 270 ? definition.height : definition.width
      const height = placement.rotation === 90 || placement.rotation === 270 ? definition.width : definition.height
      if (!Number.isInteger(placement.x) || !Number.isInteger(placement.y) || placement.x < 0 || placement.y < 0 || placement.x + width > Math.min(socialEconomy.propertyGridWidth, HOME_GRID_WIDTH) || placement.y + height > Math.min(socialEconomy.propertyGridHeight, HOME_GRID_HEIGHT)) throw new DomainError('INVALID_PROPERTY_POSITION', 'Furniture position is outside the room grid.')
      for (let dx = 0; dx < width; dx += 1) {
        for (let dy = 0; dy < height; dy += 1) {
          const cell = `${placement.x + dx}:${placement.y + dy}`
          if (occupied.has(cell)) throw new DomainError('INVALID_PROPERTY_OVERLAP', 'Furniture items cannot overlap.')
          occupied.add(cell)
        }
      }
    })
    if (styles !== undefined) {
      if (!isValidPropertyStyles(styles)) throw new DomainError('INVALID_PROPERTY_STYLE', 'Property wall or floor style is invalid.')
      const ownedStyles = new Set(this.getOwnedCosmetics(studioId, userId))
      if (!ownedStyles.has(styles.wallStyleId) || !ownedStyles.has(styles.floorStyleId)) throw new DomainError('PROPERTY_STYLE_NOT_OWNED', 'Property style is not owned.', 409)
    }
    const property = this.getPropertyRecord(userId)
    property.furniture = cloneFurniture(furniture)
    if (styles !== undefined) property.styles = { ...styles }
    property.layoutVersion += 1
    property.updatedAt = new Date().toISOString()
    this.save()
    return this.propertySnapshot(studioId, property)
  }

  updatePropertyVisibility(studioId: string, userId: string, visibility: PropertyVisibility): PropertySnapshot {
    this.assertStudioUser(studioId, userId)
    if (visibility !== 'FRIENDS' && visibility !== 'PUBLIC') throw new DomainError('INVALID_PROPERTY_VISIBILITY', 'Property visibility is invalid.')
    const property = this.getPropertyRecord(userId)
    property.visibility = visibility
    property.updatedAt = new Date().toISOString()
    this.save()
    return this.propertySnapshot(studioId, property)
  }

  private recordPropertyVisit(studioId: string, viewerId: string, ownerId: string) {
    const viewer = this.assertStudioUser(studioId, viewerId)
    const date = utcDate()
    if (this.state.propertyVisits.some((visit) => visit.ownerId === ownerId && visit.viewerId === viewerId && visit.date === date)) return
    this.state.propertyVisits.push({ ownerId, viewerId, date })
    this.getPropertyRecord(ownerId).visitCount += 1
    this.addActivity(studioId, 'PROPERTY_ACTIVITY', viewerId, `${viewer.displayName} visited a property.`, { ownerId, metric: 'property_visit' })
    recordSocialMetric('property_visit', { viewerId, ownerId })
    this.save()
  }

  likeProperty(studioId: string, viewerId: string, ownerId: string): PropertySnapshot {
    const viewer = this.assertStudioUser(studioId, viewerId)
    this.assertStudioUser(studioId, ownerId)
    if (viewerId === ownerId) throw new DomainError('INVALID_PROPERTY_LIKE', 'You cannot like your own property.')
    const date = utcDate()
    if (!this.state.propertyLikes.some((like) => like.ownerId === ownerId && like.viewerId === viewerId && like.date === date)) {
      this.state.propertyLikes.push({ ownerId, viewerId, date })
      this.addActivity(studioId, 'PROPERTY_ACTIVITY', viewerId, `${viewer.displayName} liked a property.`, { ownerId })
      recordSocialMetric('property_like', { viewerId, ownerId })
      this.save()
    }
    return this.propertySnapshot(studioId, this.getPropertyRecord(ownerId))
  }

  giftPropertyFurniture(studioId: string, senderId: string, recipientId: string, itemId: string, requestedGiftId?: string): { item: CosmeticCatalogItem; progression: SocialProgression; duplicate: boolean } {
    const sender = this.assertStudioUser(studioId, senderId)
    this.assertStudioUser(studioId, recipientId)
    if (senderId === recipientId) throw new DomainError('INVALID_PROPERTY_GIFT', 'You cannot gift your own property.')
    const item = socialCosmeticCatalog.find((candidate) => candidate.id === itemId)
    if (!item || item.slot !== 'FURNITURE' || item.price <= 0) throw new DomainError('INVALID_PROPERTY_GIFT', 'Only paid furniture can be gifted.')
    const giftId = requestedGiftId && /^[a-zA-Z0-9_-]{8,80}$/.test(requestedGiftId) ? requestedGiftId : randomUUID()
    const existingGift = this.state.propertyGifts.find((gift) => gift.id === giftId)
    if (existingGift) {
      if (existingGift.senderId !== senderId || existingGift.recipientId !== recipientId || existingGift.itemId !== itemId) throw new DomainError('INVALID_PROPERTY_GIFT', 'Gift id is already used for another gift.', 409)
      return { item: { ...item }, progression: this.socialProgression(senderId), duplicate: true }
    }
    const date = utcDate()
    const giftCount = this.state.propertyGifts.filter((gift) => gift.senderId === senderId && gift.createdAt.slice(0, 10) === date).length
    if (giftCount >= socialEconomy.propertyGiftDailyLimit) throw new DomainError('GIFT_LIMIT_REACHED', 'Daily gift limit reached.', 409)
    if (this.state.ownedCosmetics.some((owned) => owned.userId === recipientId && owned.itemId === itemId)) throw new DomainError('COSMETIC_ALREADY_OWNED', 'Recipient already owns this furniture.', 409)
    const wallet = this.applyWalletDelta(senderId, -item.price, 'PROPERTY_GIFT', giftId, `gift:${giftId}`, { recipientId, itemId })
    this.state.ownedCosmetics.push({ userId: recipientId, itemId, source: 'GIFT', acquiredAt: new Date().toISOString() })
    this.state.propertyGifts.push({ id: giftId, senderId, recipientId, itemId, createdAt: new Date().toISOString() })
    this.addActivity(studioId, 'PROPERTY_ACTIVITY', senderId, `${sender.displayName} gifted ${item.name}.`, { recipientId, itemId, coins: wallet.transaction.delta })
    recordSocialMetric('property_gift', { senderId, recipientId, itemId, coinDelta: wallet.transaction.delta })
    this.save()
    return { item: { ...item }, progression: this.socialProgression(senderId), duplicate: wallet.duplicate }
  }

  getPublicSocialProfile(studioId: string, userId: string, viewerId?: string, presence?: Map<string, Presence>): PublicSocialProfile {
    const user = this.assertStudioUser(studioId, userId)
    const progression = this.socialProgression(userId)
    const work = this.workProgression(userId)
    const workCareer = work.currentCareerId ? workCareerDefinitions.find((career) => career.id === work.currentCareerId) : undefined
    const loadout = this.getSocialLoadout(studioId, userId)
    const avatar = this.getAvatarSnapshot(studioId, userId)
    const equippedTitle = getSocialTitle(loadout.titleId)
    const owned = this.state.ownedCosmetics.filter((item) => item.userId === userId)
    const achievements = ['First Steps']
    if (progression.gameXp >= socialEconomy.freeParticipationXp) achievements.push('Social Player')
    if (progression.gameLevel >= 4) achievements.push('Room Maker')
    return { userId, displayName: user.displayName, avatar, avatarKey: avatar.avatarKey, gameLevel: progression.gameLevel, career: workCareer?.name, careerRank: work.currentCareerId ? work.currentRank : undefined, title: equippedTitle?.name || (progression.gameLevel >= 4 ? 'Room Maker' : progression.gameLevel >= 2 ? 'Social Player' : 'Newcomer'), nameplateId: loadout.nameplateId, achievements, club: 'Studio Commons', collectionCount: owned.length, collectionTotal: socialCosmeticCatalog.length, favoriteGame: undefined, property: this.getProperty(studioId, userId, viewerId), friendshipStatus: viewerId ? this.getFriendshipStatus(studioId, viewerId, userId) : undefined, presence: presence ? this.socialPresenceView(studioId, userId, presence) : undefined }
  }

  settleSocialRound(studioId: string, result: { roundId: string; gameId: SocialGameId; winnerIds: string[]; participants: SocialRoundParticipantResult[] }): SocialReward[] {
    this.assertStudioUser(studioId, result.participants[0]?.userId || result.winnerIds[0] || '')
    if (!this.state.socialRounds.some((round) => round.roundId === result.roundId && round.studioId === studioId)) {
      const round: DbSocialRound = { roundId: result.roundId, studioId, gameId: result.gameId, winnerIds: [...result.winnerIds], participants: result.participants.map((participant) => ({ ...participant })), finishedAt: new Date().toISOString() }
      this.state.socialRounds.push(round)
    }
    const rewards: SocialReward[] = []
    const date = utcDate()
    result.participants.forEach((participant) => {
      const user = this.assertStudioUser(studioId, participant.userId)
      const key = `round:${result.roundId}:${participant.userId}`
      const existingClaim = this.state.socialRewardClaims.find((claim) => claim.idempotencyKey === key)
      if (existingClaim) {
        recordSocialMetric('social_reward_duplicate', { userId: participant.userId, roundId: result.roundId, gameId: result.gameId })
        const progression = this.socialProgression(participant.userId)
        rewards.push({ roundId: result.roundId, gameId: result.gameId, userId: participant.userId, coinDelta: existingClaim.coinDelta, gameXpDelta: existingClaim.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: progression.xpForCurrentLevel, gameQuests: this.gameQuestViews(participant.userId, date), reason: 'Round reward already settled.', duplicate: true, grantedAt: existingClaim.grantedAt })
        return
      }
      const progressionRecord = this.getPlayerProgressionRecord(participant.userId)
      this.resetDailyCounters(progressionRecord, date)
      const canReward = participant.eligible !== false && progressionRecord.freeRoundsRewardedToday < socialEconomy.freeRewardRoundsPerDay
      const isWinner = result.winnerIds.includes(participant.userId)
      const coinDelta = canReward ? socialEconomy.freeParticipationCoin + (isWinner ? socialEconomy.freeWinnerBonusCoin : 0) : 0
      const wallet = this.applyWalletDelta(participant.userId, coinDelta, 'SOCIAL_ROUND', result.roundId, key)
      // Coin has a three-round daily limit, but eligible players still earn
      // character EXP from additional rounds until the separate anti-bot EXP
      // cap is reached.
      const gameAward = participant.eligible !== false
        ? this.awardCharacterXpForGame(studioId, participant.userId, result.gameId, isWinner ? 'WIN' : 'LOSS', { play: socialEconomy.freeParticipationXp, win: socialEconomy.freeWinnerBonusXp })
        : { gameXpDelta: 0, coinDelta: 0, quests: this.gameQuestViews(participant.userId, date), completedQuestIds: [] }
      const gameXpDelta = gameAward.gameXpDelta
      const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
      if (canReward) progressionRecord.freeRoundsRewardedToday += 1
      const claim: DbSocialRewardClaim = { idempotencyKey: key, roundId: result.roundId, gameId: result.gameId, userId: participant.userId, coinDelta: totalCoinDelta, gameXpDelta, grantedAt: wallet.transaction.createdAt }
      this.state.socialRewardClaims.push(claim)
      this.addActivity(studioId, 'SOCIAL_REWARD', user.id, `${user.displayName} received a ${result.gameId} reward.`, { roundId: result.roundId, coins: totalCoinDelta, gameXp: gameXpDelta })
      recordSocialMetric('social_reward_granted', { userId: participant.userId, roundId: result.roundId, gameId: result.gameId, coinDelta: totalCoinDelta, gameXpDelta })
      const progression = this.socialProgression(participant.userId)
      rewards.push({ roundId: result.roundId, gameId: result.gameId, userId: participant.userId, coinDelta: totalCoinDelta, gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: progression.xpForCurrentLevel, gameQuests: gameAward.quests, reason: isWinner ? 'Winner reward.' : 'Participation reward.', grantedAt: claim.grantedAt })
    })
    this.save()
    return rewards
  }

  settleDiceRoll(studioId: string, userId: string, roundId: string, rollNumber: number, outcome: 'WIN' | 'TIE' | 'LOSS'): SocialReward {
    const user = this.assertStudioUser(studioId, userId)
    if (rollNumber < 1 || rollNumber > socialEconomy.diceMaxRollsPerRound) throw new DomainError('DICE_ROLL_LIMIT', 'Dice roll limit reached for this round.', 409)
    const key = `dice:${roundId}:${userId}:${rollNumber}`
    const existing = this.findWalletTransaction(key)
    const progression = this.getPlayerProgressionRecord(userId)
    if (existing) {
      recordSocialMetric('social_reward_duplicate', { userId, roundId, gameId: 'DICE_DUEL' })
      return { roundId, gameId: 'DICE_DUEL', userId, coinDelta: existing.delta, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId), reason: 'Dice roll already settled.', duplicate: true, grantedAt: existing.createdAt }
    }
    const payout = outcome === 'WIN' ? socialEconomy.diceWinPayout : outcome === 'TIE' ? socialEconomy.diceTiePayout : 0
    const wallet = this.applyWalletDelta(userId, payout - socialEconomy.diceEntry, 'DICE_DUEL', roundId, key, { rollNumber, outcome })
    const gameAward = this.awardCharacterXpForGame(studioId, userId, 'DICE_DUEL', outcome)
    const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
    this.addActivity(studioId, 'SOCIAL_REWARD', user.id, `${user.displayName} played Dice Duel.`, { roundId, outcome, coins: totalCoinDelta, gameXp: gameAward.gameXpDelta })
    recordSocialMetric('social_reward_granted', { userId, roundId, gameId: 'DICE_DUEL', coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, outcome })
    this.save()
    return { roundId, gameId: 'DICE_DUEL', userId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: gameAward.quests, reason: outcome === 'WIN' ? 'Dice Duel win.' : outcome === 'TIE' ? 'Dice Duel tie refund.' : 'Dice Duel loss.', grantedAt: wallet.transaction.createdAt }
  }

  settleBaccaratBet(studioId: string, userId: string, roundId: string, betNumber: number, choice: 'PLAYER' | 'BANKER' | 'TIE', outcome: 'PLAYER' | 'BANKER' | 'TIE'): SocialReward {
    const user = this.assertStudioUser(studioId, userId)
    if (betNumber < 1) throw new DomainError('BACCARAT_BET_INVALID', 'Baccarat bet number is invalid.')
    const key = `baccarat:${roundId}:${userId}:${betNumber}`
    const existing = this.findWalletTransaction(key)
    const progression = this.getPlayerProgressionRecord(userId)
    if (existing) return { roundId, gameId: 'BACCARAT', userId, coinDelta: existing.delta, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId), reason: 'Baccarat bet already settled.', duplicate: true, grantedAt: existing.createdAt }
    const payout = choice === outcome ? outcome === 'TIE' ? socialEconomy.baccaratTiePayout : outcome === 'PLAYER' ? socialEconomy.baccaratPlayerPayout : socialEconomy.baccaratBankerPayout : 0
    const wallet = this.applyWalletDelta(userId, payout - socialEconomy.baccaratEntry, 'BACCARAT', roundId, key, { betNumber, choice, outcome })
    const gameAward = this.awardCharacterXpForGame(studioId, userId, 'BACCARAT', choice === outcome ? 'WIN' : 'LOSS')
    const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
    this.addActivity(studioId, 'SOCIAL_REWARD', user.id, `${user.displayName} played Baccarat mini.`, { roundId, choice, outcome, coins: totalCoinDelta, gameXp: gameAward.gameXpDelta })
    this.save()
    return { roundId, gameId: 'BACCARAT', userId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: gameAward.quests, reason: payout > 0 ? 'Baccarat win.' : 'Baccarat loss.', grantedAt: wallet.transaction.createdAt }
  }

  settleLuckyDraw(studioId: string, userId: string, roundId: string, drawNumber: number, reward: number): SocialReward {
    const user = this.assertStudioUser(studioId, userId)
    if (drawNumber < 1 || !socialEconomy.luckyDrawRewards.includes(reward as typeof socialEconomy.luckyDrawRewards[number])) throw new DomainError('LUCKY_DRAW_INVALID', 'Lucky Draw result is invalid.')
    const key = `lucky-draw:${roundId}:${userId}:${drawNumber}`
    const existing = this.findWalletTransaction(key)
    const progression = this.getPlayerProgressionRecord(userId)
    if (existing) return { roundId, gameId: 'LUCKY_DRAW', userId, coinDelta: existing.delta, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId), reason: 'Lucky Draw already settled.', duplicate: true, grantedAt: existing.createdAt }
    const wallet = this.applyWalletDelta(userId, reward - socialEconomy.luckyDrawEntry, 'LUCKY_DRAW', roundId, key, { drawNumber, reward })
    const outcome = reward > socialEconomy.luckyDrawEntry ? 'WIN' : reward === socialEconomy.luckyDrawEntry ? 'TIE' : 'LOSS'
    const gameAward = this.awardCharacterXpForGame(studioId, userId, 'LUCKY_DRAW', outcome)
    const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
    this.addActivity(studioId, 'SOCIAL_REWARD', user.id, `${user.displayName} played Lucky Draw.`, { roundId, reward, coins: totalCoinDelta, gameXp: gameAward.gameXpDelta })
    this.save()
    return { roundId, gameId: 'LUCKY_DRAW', userId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: gameAward.quests, reason: reward > 0 ? 'Lucky Draw reward.' : 'Lucky Draw loss.', grantedAt: wallet.transaction.createdAt }
  }

  settleTableBet(studioId: string, userId: string, gameId: SocialGameId, roundId: string, betNumber: number, stake: number, payout: number, metadata: Record<string, string | number | boolean> = {}): SocialReward {
    const user = this.assertStudioUser(studioId, userId)
    if (!Number.isInteger(betNumber) || betNumber < 1 || !Number.isInteger(stake) || stake < 1 || !Number.isInteger(payout) || payout < 0) throw new DomainError('TABLE_BET_INVALID', 'Table game bet is invalid.')
    const key = `table:${gameId}:${roundId}:${userId}:${betNumber}`
    const existing = this.findWalletTransaction(key)
    const progression = this.getPlayerProgressionRecord(userId)
    if (existing) return { roundId, gameId, userId, coinDelta: existing.delta, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId), reason: 'Table bet already settled.', duplicate: true, grantedAt: existing.createdAt }
    const wallet = this.applyWalletDelta(userId, payout - stake, gameId, roundId, key, { ...metadata, stake, payout })
    const gameAward = this.awardCharacterXpForGame(studioId, userId, gameId, this.settlementOutcome(payout, stake, metadata))
    const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
    this.addActivity(studioId, 'SOCIAL_REWARD', user.id, `${user.displayName} played ${gameId}.`, { roundId, gameId, coins: totalCoinDelta, gameXp: gameAward.gameXpDelta })
    recordSocialMetric('social_reward_granted', { userId, roundId, gameId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta })
    this.save()
    return { roundId, gameId, userId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: gameAward.quests, reason: payout > stake ? `${gameId} win.` : payout === stake ? `${gameId} tie refund.` : `${gameId} loss.`, grantedAt: wallet.transaction.createdAt }
  }

  placeCasinoWager(studioId: string, userId: string, gameId: SocialGameId, roundId: string, wagerKey: string, stake: number, metadata: Record<string, string | number | boolean> = {}): SocialReward {
    this.assertStudioUser(studioId, userId)
    if (!['BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'TIEN_LEN', 'RPS', 'DICE_DUEL', 'LUCKY_DRAW'].includes(gameId) || !Number.isInteger(stake) || stake < 1 || !/^[a-zA-Z0-9:_-]{1,120}$/.test(wagerKey)) {
      throw new DomainError('CASINO_WAGER_INVALID', 'Casino wager is invalid.')
    }
    const key = `casino:wager:${gameId}:${roundId}:${userId}:${wagerKey}`
    const progression = this.getPlayerProgressionRecord(userId)
    const wallet = this.applyWalletDelta(userId, -stake, gameId, roundId, key, { ...metadata, stake, stage: 'WAGER' })
    if (!wallet.duplicate) {
      this.addActivity(studioId, 'SOCIAL_REWARD', userId, `${gameId} wager placed.`, { roundId, gameId, stake })
      recordSocialMetric('casino_wager_placed', { userId, roundId, gameId, stake })
      this.save()
    }
    return { roundId, gameId, userId, coinDelta: wallet.transaction.delta, gameXpDelta: 0, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: this.gameQuestViews(userId), reason: `${gameId} wager accepted.`, duplicate: wallet.duplicate, grantedAt: wallet.transaction.createdAt }
  }

  settleCasinoPayout(studioId: string, userId: string, gameId: SocialGameId, roundId: string, payoutKey: string, payout: number, metadata: Record<string, string | number | boolean> = {}): SocialReward {
    this.assertStudioUser(studioId, userId)
    if (!['BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'TIEN_LEN', 'RPS', 'DICE_DUEL', 'LUCKY_DRAW'].includes(gameId) || !Number.isInteger(payout) || payout < 0 || !/^[a-zA-Z0-9:_-]{1,120}$/.test(payoutKey)) {
      throw new DomainError('CASINO_PAYOUT_INVALID', 'Casino payout is invalid.')
    }
    const key = `casino:payout:${gameId}:${roundId}:${userId}:${payoutKey}`
    const progression = this.getPlayerProgressionRecord(userId)
    const wallet = this.applyWalletDelta(userId, payout, gameId, roundId, key, { ...metadata, payout, stage: 'PAYOUT' })
    if (!wallet.duplicate) {
      this.addActivity(studioId, 'SOCIAL_REWARD', userId, `${gameId} round settled.`, { roundId, gameId, payout })
      recordSocialMetric('casino_round_settled', { userId, roundId, gameId, payout })
    }
    const gameAward = wallet.duplicate ? { gameXpDelta: 0, coinDelta: 0, quests: this.gameQuestViews(userId), completedQuestIds: [] } : this.awardCharacterXpForGame(studioId, userId, gameId, this.settlementOutcome(payout, Number(metadata.stake || 0), metadata))
    const totalCoinDelta = wallet.transaction.delta + gameAward.coinDelta
    if (!wallet.duplicate) this.save()
    return { roundId, gameId, userId, coinDelta: totalCoinDelta, gameXpDelta: gameAward.gameXpDelta, coinBalance: progression.coinBalance, gameXp: progression.gameXp, gameLevel: progression.gameLevel, xpForCurrentLevel: socialXpForCurrentLevel(progression.gameXp), gameQuests: gameAward.quests, reason: payout > 0 ? `${gameId} payout.` : `${gameId} loss.`, duplicate: wallet.duplicate, grantedAt: wallet.transaction.createdAt }
  }

  transferCoins(studioId: string, senderId: string, recipientId: string, amount: number, requestedTradeId?: string): { tradeId: string; amount: number; recipientName: string; progression: SocialProgression; duplicate: boolean } {
    const sender = this.assertStudioUser(studioId, senderId)
    const recipient = this.assertStudioUser(studioId, recipientId)
    if (senderId === recipientId) throw new DomainError('INVALID_TRADE', 'You cannot transfer Coin to yourself.')
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) throw new DomainError('INVALID_TRADE_AMOUNT', 'Trade amount must be between 1 and 100,000 Coin.')
    const tradeId = requestedTradeId && /^[a-zA-Z0-9_-]{8,80}$/.test(requestedTradeId) ? requestedTradeId : randomUUID()
    const senderKey = `trade:${tradeId}:sender`
    const recipientKey = `trade:${tradeId}:recipient`
    const existingSender = this.findWalletTransaction(senderKey)
    const existingRecipient = this.findWalletTransaction(recipientKey)
    if (!existingSender) this.applyWalletDelta(senderId, -amount, 'P2P_TRADE', tradeId, senderKey, { recipientId })
    if (!existingRecipient) this.applyWalletDelta(recipientId, amount, 'P2P_TRADE', tradeId, recipientKey, { senderId })
    if (!existingSender || !existingRecipient) {
      this.addActivity(studioId, 'SOCIAL_REWARD', senderId, `${sender.displayName} sent ${amount} Coin to ${recipient.displayName}.`, { tradeId, recipientId, amount })
      recordSocialMetric('social_trade', { senderId, recipientId, amount, duplicate: false })
      this.save()
    }
    return { tradeId, amount, recipientName: recipient.displayName, progression: this.socialProgression(senderId), duplicate: Boolean(existingSender && existingRecipient) }
  }

  createUser(input: { email: string; username?: string; passwordHash: string; displayName: string; avatarUrl?: string; avatarKey?: DbUser['avatarKey']; role: DbUser['role']; studioId: string }): User {
    if (this.getUserByEmail(input.email)) throw new DomainError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409)
    if (input.username && this.state.users.some((user) => user.username?.toLowerCase() === input.username?.toLowerCase())) throw new DomainError('USERNAME_ALREADY_EXISTS', 'An account with this username already exists.', 409)
    validateAvatarUrl(input.avatarUrl || '')
    const now = new Date().toISOString()
    const user: DbUser = { id: randomUUID(), ...input, characterConfig: normalizeCharacterConfig(undefined, input.avatarKey), avatarRevision: 1, avatarUpdatedAt: now, xp: 0, level: 1, createdAt: now }
    this.state.users.push(user)
    this.state.members.push({ id: `member-${user.id}`, studioId: input.studioId, userId: user.id, role: input.role, joinedAt: now })
    this.state.playerProgressions.push({ userId: user.id, gameXp: 0, gameLevel: 1, coinBalance: socialEconomy.startingCoin, freeRoundsRewardedToday: 0, gameXpEarnedToday: 0 })
    this.state.loadouts.push({ userId: user.id, avatarKey: user.avatarKey || 'adam', nameplateId: 'nameplate-basic' })
    socialCosmeticCatalog.filter((item) => item.starter).forEach((item) => this.state.ownedCosmetics.push({ userId: user.id, itemId: item.id, source: 'STARTER', acquiredAt: now }))
    this.state.properties.push({ ownerId: user.id, templateId: 'room_template_v1', layoutVersion: 1, furniture: [{ itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 }, { itemId: 'furniture-starter-plant', x: 5, y: 2, rotation: 0 }], visitCount: 0, updatedAt: now, styles: { ...DEFAULT_PROPERTY_STYLES }, visibility: 'FRIENDS' })
    this.state.workProfiles.push({ userId: user.id, tutorialCompleted: false, workStreak: 0 })
    WORK_CAREER_IDS.forEach((careerId) => this.state.workCareerProgress.push({ userId: user.id, careerId, careerXp: 0, rank: 'INTERN' }))
    this.addActivity(input.studioId, 'MEMBER_JOINED', user.id, `${user.displayName} joined the studio.`)
    this.save()
    return toUser(user)
  }

  updateUser(studioId: string, userId: string, patch: Partial<Pick<DbUser, 'displayName' | 'avatarUrl' | 'avatarKey' | 'characterConfig' | 'role' | 'passwordHash'>>): User {
    const user = this.getUserById(userId)
    if (!user || user.studioId !== studioId) throw new DomainError('MEMBER_NOT_FOUND', 'Member not found.', 404)
    if (patch.displayName !== undefined && !patch.displayName.trim()) throw new DomainError('INVALID_MEMBER', 'Display name is required.')
    if (patch.role !== undefined && !['OWNER', 'ADMIN', 'GAME_DESIGNER', 'DEVELOPER', 'ARTIST', 'QA', 'PRODUCER', 'MEMBER'].includes(patch.role)) throw new DomainError('INVALID_ROLE', 'Member role is invalid.')
    if (patch.role !== undefined && patch.role === 'OWNER' && user.role !== 'OWNER') throw new DomainError('INVALID_ROLE', 'Owner role cannot be assigned from the team editor.')
    if (patch.avatarUrl !== undefined) validateAvatarUrl(patch.avatarUrl)
    if (patch.avatarKey !== undefined) validateAvatarKey(patch.avatarKey)
    if (patch.characterConfig !== undefined) validateCharacterConfig(patch.characterConfig)
    const avatarChanged = patch.avatarKey !== undefined || patch.characterConfig !== undefined
    Object.assign(user, patch)
    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim()
    if (patch.avatarKey !== undefined) this.getLoadoutRecord(userId).avatarKey = patch.avatarKey
    // Legacy profile edits can still send only avatarKey. Keep the canonical
    // LPC identity in lockstep so public profiles, friend rows and the world
    // never fall back to the previous characterConfig-derived avatar.
    if (patch.avatarKey !== undefined && patch.characterConfig === undefined) {
      user.characterConfig = normalizeCharacterConfig(undefined, patch.avatarKey)
    }
    if (patch.characterConfig !== undefined) {
      const config = normalizeCharacterConfig(patch.characterConfig, patch.avatarKey || user.avatarKey)
      const owned = new Set(this.state.ownedCosmetics.filter((item) => item.userId === userId).map((item) => item.itemId))
      const matchingOutfit = socialCosmeticCatalog.find((item) => !item.wardrobe && item.outfit && owned.has(item.id) && item.outfit.slots.top === config.slots.top && item.outfit.slots.bottom === config.slots.bottom && item.outfit.slots.shoes === config.slots.shoes)
      const loadout = this.getLoadoutRecord(userId)
      ;(Object.keys(WARDROBE_LOADOUT_KEYS) as WardrobeLoadoutKey[]).forEach((key) => {
        loadout[key] = config.slots[WARDROBE_LOADOUT_KEYS[key]]
      })
      if (matchingOutfit) loadout.outfitId = matchingOutfit.id
      else delete loadout.outfitId
    }
    if (avatarChanged) {
      user.avatarRevision = Math.max(1, (user.avatarRevision || 0) + 1)
      user.avatarUpdatedAt = new Date().toISOString()
    }
    const member = this.getMember(studioId, userId)
    if (member && patch.role !== undefined) member.role = patch.role
    this.save()
    return toUser(user)
  }

  createProject(studioId: string, name: string, description: string): Project {
    const now = new Date().toISOString()
    const project: DbProject = { id: randomUUID(), studioId, name, description, status: 'PLANNING', createdAt: now, updatedAt: now }
    this.state.projects.push(project)
    this.addActivity(studioId, 'TASK_CREATED', undefined, `Project ${name} was created.`)
    this.save()
    return { ...project, progress: 0 }
  }

  createResource(studioId: string, actorId: string, input: { title: string; kind: ResourceKind; url: string; description?: string; tags?: string[] }): StudioResource {
    if (!input.title.trim() || !input.url.trim()) throw new DomainError('INVALID_RESOURCE', 'Resource title and URL are required.')
    if (!['LINK', 'DOC', 'BUILD', 'ASSET'].includes(input.kind)) throw new DomainError('INVALID_RESOURCE_KIND', 'Resource kind is invalid.')
    try { new URL(input.url.trim()) } catch { throw new DomainError('INVALID_RESOURCE_URL', 'Resource URL must be valid.') }
    const resource: DbResource = { id: randomUUID(), studioId, title: input.title.trim(), kind: input.kind, url: input.url.trim(), description: input.description?.trim() || '', tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8), createdById: actorId, createdAt: new Date().toISOString() }
    this.state.resources.push(resource)
    this.addActivity(studioId, 'RESOURCE_SHARED', actorId, `${input.title.trim()} was shared with the studio.`, { resourceId: resource.id })
    this.save()
    return { ...resource, tags: [...resource.tags] }
  }

  createTask(studioId: string, input: { projectId: string; sprintId?: string; title: string; description?: string; priority?: DbTask['priority']; assigneeId?: string; bossDamage?: number }): Task {
    const project = this.getProject(input.projectId)
    if (!project || project.studioId !== studioId) throw new DomainError('PROJECT_NOT_FOUND', 'Project does not belong to this studio.', 404)
    if (input.sprintId && !this.state.sprints.some((sprint) => sprint.id === input.sprintId && sprint.projectId === input.projectId)) throw new DomainError('SPRINT_NOT_FOUND', 'Sprint does not belong to this project.', 404)
    if (input.assigneeId && !this.getMember(studioId, input.assigneeId)) throw new DomainError('ASSIGNEE_NOT_FOUND', 'Assignee is not a member of this studio.', 400)
    const priority = input.priority || 'NORMAL'
    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(priority)) throw new DomainError('INVALID_PRIORITY', 'Task priority is invalid.')
    const questType = priority === 'CRITICAL' ? 'ELITE' : priority === 'HIGH' ? 'MAIN' : 'SIDE'
    const now = new Date().toISOString()
    const task: DbTask = { id: randomUUID(), projectId: input.projectId, sprintId: input.sprintId, title: input.title.trim(), description: input.description?.trim() || '', status: 'BACKLOG', priority, assigneeId: input.assigneeId, questXp: 100, studioXpReward: 50, bossDamage: input.bossDamage || defaultBossDamage(priority, questType), createdAt: now }
    const quest: DbQuest = { id: `quest-${task.id}`, taskId: task.id, questType, xpReward: task.questXp, studioXpReward: task.studioXpReward, bossDamage: task.bossDamage, completed: false }
    this.state.tasks.push(task)
    this.state.quests.push(quest)
    this.addActivity(studioId, 'TASK_CREATED', undefined, `Task “${task.title}” was created.`)
    if (task.assigneeId) this.addActivity(studioId, 'TASK_ASSIGNED', undefined, `Task “${task.title}” was assigned.`)
    this.save()
    return { ...task }
  }

  updateTask(studioId: string, taskId: string, patch: Partial<Pick<DbTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'bossDamage'>>): Task {
    const task = this.getTask(taskId)
    if (!task) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    const project = this.getProject(task.projectId)
    if (!project || project.studioId !== studioId) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    if (task.status === 'DONE' && patch.status && patch.status !== 'DONE') throw new DomainError('COMPLETED_TASK_IMMUTABLE', 'Completed tasks cannot move back to an active status.', 409)
    if (patch.assigneeId && !this.getMember(studioId, patch.assigneeId)) throw new DomainError('ASSIGNEE_NOT_FOUND', 'Assignee is not a member of this studio.', 400)
    if (patch.status && !['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'].includes(patch.status)) throw new DomainError('INVALID_STATUS', 'Task status is invalid.')
    if (patch.priority && !['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(patch.priority)) throw new DomainError('INVALID_PRIORITY', 'Task priority is invalid.')
    if (patch.title !== undefined && !patch.title.trim()) throw new DomainError('INVALID_TASK', 'Task title is required.')
    Object.assign(task, patch)
    const quest = this.getQuestByTaskId(task.id)
    if (quest) {
      if (patch.bossDamage !== undefined) quest.bossDamage = task.bossDamage
      if (patch.priority !== undefined) quest.questType = task.priority === 'CRITICAL' ? 'ELITE' : task.priority === 'HIGH' ? 'MAIN' : 'SIDE'
    }
    if (task.status === 'DONE' && !task.completedAt) task.completedAt = new Date().toISOString()
    this.save()
    return { ...task }
  }

  deleteTask(studioId: string, taskId: string): void {
    const task = this.getTask(taskId)
    if (!task) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    const project = this.getProject(task.projectId)
    if (!project || project.studioId !== studioId) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    if (task.status === 'DONE') throw new DomainError('COMPLETED_TASK_IMMUTABLE', 'Completed tasks cannot be deleted.', 409)
    this.state.tasks = this.state.tasks.filter((item) => item.id !== taskId)
    this.state.quests = this.state.quests.filter((quest) => quest.taskId !== taskId)
    this.save()
  }

  completeTask(studioId: string, taskId: string, actorId: string): CompletionResponse {
    const task = this.getTask(taskId)
    if (!task) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    const project = this.getProject(task.projectId)
    if (!project || project.studioId !== studioId) throw new DomainError('TASK_NOT_FOUND', 'Task not found.', 404)
    if (task.status === 'DONE') throw new DomainError('TASK_ALREADY_COMPLETED', 'Task has already been completed.', 409)
    const quest = this.getQuestByTaskId(task.id)
    if (!quest) throw new DomainError('QUEST_MISSING', 'Task does not have a quest.', 500)
    const actor = this.getUserById(actorId)
    if (!actor || actor.studioId !== studioId) throw new DomainError('UNAUTHORIZED', 'You are not a member of this studio.', 403)
    const sprint = task.sprintId ? this.state.sprints.find((item) => item.id === task.sprintId) : undefined
    const boss = sprint ? this.state.bosses.find((item) => item.id === sprint.sprintBossId) : undefined
    const events: ActivityEvent[] = []
    const now = new Date().toISOString()
    task.status = 'DONE'
    task.completedAt = now
    quest.completed = true
    actor.xp += quest.xpReward
    const previousUserLevel = actor.level
    actor.level = calculateLevel(actor.xp)
    const studio = this.state.studios.find((item) => item.id === studioId)!
    const previousStudioLevel = studio.level
    studio.xp += quest.studioXpReward
    studio.level = calculateLevel(studio.xp)
    // Production XP and character EXP are separate tracks. Completing a
    // studio mission grants the same base amount to the character track,
    // then advances the mission-based character quests once.
    const gameXpDate = now.slice(0, 10)
    const gameProgressionRecord = this.getPlayerProgressionRecord(actorId)
    const directGameXp = this.applyGameXp(gameProgressionRecord, quest.xpReward, gameXpDate)
    const missionQuestAward = this.advanceGameQuests(studioId, actorId, 'COMPLETE_MISSION', 1, gameXpDate)
    if (boss) {
      boss.currentHp = Math.max(0, boss.currentHp - quest.bossDamage)
      if (boss.currentHp === 0) boss.status = 'DEFEATED'
    }
    const gameXpDelta = directGameXp + missionQuestAward.gameXpDelta
    events.push(this.addActivity(studioId, 'TASK_COMPLETED', actorId, `${actor.displayName} completed “${task.title}”.`, { taskId: task.id, xp: quest.xpReward, gameXp: gameXpDelta }))
    if (boss) events.push(this.addActivity(studioId, 'BOSS_DAMAGED', actorId, `${boss.name} took ${quest.bossDamage} damage.`, { bossId: boss.id, damage: quest.bossDamage, currentHp: boss.currentHp }))
    if (boss?.status === 'DEFEATED') events.push(this.addActivity(studioId, 'BOSS_DEFEATED', actorId, `${boss.name} was defeated!`, { bossId: boss.id }))
    if (studio.level > previousStudioLevel) events.push(this.addActivity(studioId, 'STUDIO_LEVEL_UP', actorId, `Studio reached Level ${studio.level}.`, { level: studio.level }))
    if (actor.level > previousUserLevel) events.push(this.addActivity(studioId, 'STUDIO_LEVEL_UP', actorId, `${actor.displayName} reached Level ${actor.level}.`, { level: actor.level }))
    this.save()
    const personalProgress: StudioProgression = { userId: actor.id, xp: actor.xp, level: actor.level, xpToNextLevel: xpToNextLevel(actor.xp) }
    return { task: { ...task }, quest: { ...quest }, personalProgress, gameProgression: this.socialProgression(actorId), gameXpDelta, gameQuests: missionQuestAward.quests, studioProgress: { ...studio, xpToNextLevel: xpToNextLevel(studio.xp), unlocks: unlocksForLevel(studio.level) }, boss: boss ? { ...boss } : null, events }
  }

  private projectProgress(projectId: string): number {
    const tasks = this.state.tasks.filter((task) => task.projectId === projectId)
    return tasks.length ? Math.round(tasks.filter((task) => task.status === 'DONE').length / tasks.length * 100) : 0
  }

  private sprintProgress(sprintId: string): number {
    const tasks = this.state.tasks.filter((task) => task.sprintId === sprintId)
    return tasks.length ? Math.round(tasks.filter((task) => task.status === 'DONE').length / tasks.length * 100) : 0
  }

  private addActivity(studioId: string, type: DbActivity['type'], actorId: string | undefined, message: string, metadata?: Record<string, string | number | boolean>): ActivityEvent {
    const event: DbActivity = { id: randomUUID(), studioId, type, actorId, message, metadata, createdAt: new Date().toISOString() }
    this.state.activities.push(event)
    this.state.activities = this.state.activities.slice(-100)
    return event
  }

  snapshot(studioId: string, userId: string, presence: Map<string, Presence>, includeMemberEmails = false): { studio: Studio; activeSprint: Sprint | null; boss: SprintBoss | null; projects: Project[]; members: MemberView[]; quests: Quest[]; activity: ActivityEvent[]; onlineMembers: Presence[]; personalProgress: StudioProgression } {
    const user = this.getUserById(userId)
    if (!user || user.studioId !== studioId) throw new DomainError('UNAUTHORIZED', 'You are not a member of this studio.', 403)
    const activeSprint = this.getActiveSprint(studioId)
    const studio = this.getStudio(studioId)!
    return { studio, activeSprint, boss: activeSprint ? this.getBossBySprintId(activeSprint.id) : null, projects: this.getProjects(studioId), members: this.getMembers(studioId, presence, includeMemberEmails), quests: this.getQuests(studioId), activity: this.getActivities(studioId), onlineMembers: [...presence.values()].filter((item) => item.online && item.userId && this.getUserById(item.userId)?.studioId === studioId), personalProgress: { userId, xp: user.xp, level: user.level, xpToNextLevel: xpToNextLevel(user.xp) } }
  }
}

export const studioStore = new StudioStore()
