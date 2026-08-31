import { randomBytes } from 'crypto'
import { ResourceKind, StudioAvatarKey, StudioRole } from '../../types/Studio'
import type { CharacterConfig } from '../../types/Avatar'
import { SocialGameId, SocialRoundParticipantResult, WalletTransaction, FurniturePlacement } from '../../types/Social'
import type { PropertyStyles, PropertyVisibility } from '../../types/Housing'
import type { DbInventoryItem, DbInventoryTransaction } from '../../types/Inventory'
import { CareerTrackProgress, WorkCareerId, WorkGrade, WorkJobId, WorkRankId, WorkSessionStatus } from '../../types/Work'
import { calculateLevel, calculateSocialLevel, defaultBossDamage, socialCosmeticCatalog } from './config'
import { hashPassword } from './auth'

export interface DbUser {
  id: string
  email: string
  username?: string
  passwordHash: string
  displayName: string
  avatarUrl?: string
  avatarKey?: StudioAvatarKey
  characterConfig?: CharacterConfig
  avatarRevision?: number
  avatarUpdatedAt?: string
  role: StudioRole
  studioId: string
  xp: number
  level: number
  createdAt: string
}

export interface DbPlayerProgression {
  userId: string
  gameXp: number
  gameLevel: number
  coinBalance: number
  dailyClaimDate?: string
  freeRewardDate?: string
  freeRoundsRewardedToday: number
  gameXpDate?: string
  gameXpEarnedToday: number
}

export interface DbGameQuestProgress {
  userId: string
  questId: string
  periodKey: string
  progress: number
  completed: boolean
  claimed: boolean
  completedAt?: string
  claimedAt?: string
}

export interface DbOwnedCosmetic {
  userId: string
  itemId: string
  source: string
  acquiredAt: string
}

export interface DbLoadout {
  userId: string
  avatarKey: StudioAvatarKey
  outfitId?: string
  /** Individually equipped LPC wardrobe layers from owned outfit products or bundles. */
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

export interface DbProperty {
  ownerId: string
  templateId: string
  layoutVersion: number
  furniture: FurniturePlacement[]
  visitCount: number
  updatedAt: string
  styles?: PropertyStyles
  visibility?: PropertyVisibility
}

export interface DbPropertyVisit {
  ownerId: string
  viewerId: string
  date: string
}

export interface DbPropertyLike {
  ownerId: string
  viewerId: string
  date: string
}

export interface DbPropertyGift {
  id: string
  senderId: string
  recipientId: string
  itemId: string
  createdAt: string
}

export interface DbSocialRewardClaim {
  idempotencyKey: string
  roundId: string
  gameId: SocialGameId
  userId: string
  coinDelta: number
  gameXpDelta: number
  grantedAt: string
}

export interface DbSocialRound {
  roundId: string
  studioId: string
  gameId: SocialGameId
  winnerIds: string[]
  participants: SocialRoundParticipantResult[]
  finishedAt: string
}

export interface DbFriendship {
  id: string
  studioId: string
  requesterId: string
  addresseeId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED'
  createdAt: string
  updatedAt: string
}

export interface DbBlock {
  id: string
  studioId: string
  blockerId: string
  blockedId: string
  createdAt: string
}

export interface DbSocialNotification {
  id: string
  studioId: string
  userId: string
  type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'PARTY_INVITE' | 'ROOM_LIKED' | 'GIFT_RECEIVED' | 'EVENT_REMINDER'
  actorId?: string
  payload: Record<string, string | number | boolean>
  readAt?: string
  createdAt: string
}

export interface DbWorkProfile {
  userId: string
  currentCareerId?: WorkCareerId
  tutorialCompleted: boolean
  workStreak: number
  lastWorkedDate?: string
  lastSalaryClaimDate?: string
  lastCareerChangeAt?: string
}

export interface DbWorkCareerProgress extends CareerTrackProgress {
  userId: string
}

export interface DbWorkDailyStats {
  userId: string
  date: string
  completedJobs: number
  paidJobs: number
  sessionCount: number
  careerXpEarned: number
  jobCounts: Record<string, number>
  salaryClaimed: boolean
}

export interface DbWorkSession {
  sessionId: string
  userId: string
  jobId: WorkJobId
  careerId?: WorkCareerId
  status: WorkSessionStatus
  startedAt: string
  completedAt?: string
  score: number
  grade?: WorkGrade
  coinDelta: number
  careerXpDelta: number
  idempotencyKey: string
  receiptJson?: string
}

export interface DbWorkRewardClaim {
  idempotencyKey: string
  userId: string
  kind: 'JOB' | 'SALARY' | 'CERTIFICATION'
  sessionId?: string
  receiptJson: string
  grantedAt: string
}

export interface DbWalletTransaction extends WalletTransaction {}

export interface DbStudio {
  id: string
  name: string
  level: number
  xp: number
  createdAt: string
}

export interface DbMember {
  id: string
  studioId: string
  userId: string
  role: StudioRole
  joinedAt: string
}

export interface DbProject {
  id: string
  studioId: string
  name: string
  description: string
  status: 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

export interface DbSprint {
  id: string
  projectId: string
  name: string
  startDate: string
  endDate: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  sprintBossId: string
}

export interface DbTask {
  id: string
  projectId: string
  sprintId?: string
  title: string
  description: string
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  assigneeId?: string
  questXp: number
  studioXpReward: number
  bossDamage: number
  createdAt: string
  completedAt?: string
}

export interface DbQuest {
  id: string
  taskId: string
  questType: 'MAIN' | 'SIDE' | 'BUG' | 'ELITE'
  xpReward: number
  studioXpReward: number
  bossDamage: number
  completed: boolean
}

export interface DbBoss {
  id: string
  sprintId: string
  name: string
  maxHp: number
  currentHp: number
  status: 'LOCKED' | 'ACTIVE' | 'DEFEATED' | 'FAILED'
}

export interface DbResource {
  id: string
  studioId: string
  title: string
  kind: ResourceKind
  url: string
  description: string
  tags: string[]
  createdById?: string
  createdAt: string
}

export interface DbActivity {
  id: string
  studioId: string
  type: 'TASK_CREATED' | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | 'BOSS_DAMAGED' | 'BOSS_DEFEATED' | 'STUDIO_LEVEL_UP' | 'MEMBER_JOINED' | 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'PLAYER_ROOM_CHANGED' | 'RESOURCE_SHARED' | 'SOCIAL_REWARD' | 'COSMETIC_PURCHASE' | 'PROPERTY_ACTIVITY' | 'WORK_COMPLETED' | 'WORK_SALARY'
  actorId?: string
  message: string
  metadata?: Record<string, string | number | boolean>
  createdAt: string
}

export interface StudioDbState {
  users: DbUser[]
  studios: DbStudio[]
  members: DbMember[]
  projects: DbProject[]
  sprints: DbSprint[]
  tasks: DbTask[]
  quests: DbQuest[]
  bosses: DbBoss[]
  resources: DbResource[]
  activities: DbActivity[]
  playerProgressions: DbPlayerProgression[]
  gameQuestProgress: DbGameQuestProgress[]
  walletTransactions: DbWalletTransaction[]
  ownedCosmetics: DbOwnedCosmetic[]
  loadouts: DbLoadout[]
  properties: DbProperty[]
  propertyVisits: DbPropertyVisit[]
  propertyLikes: DbPropertyLike[]
  propertyGifts: DbPropertyGift[]
  socialRounds: DbSocialRound[]
  socialRewardClaims: DbSocialRewardClaim[]
  friendships: DbFriendship[]
  blocks: DbBlock[]
  socialNotifications: DbSocialNotification[]
  workProfiles: DbWorkProfile[]
  workCareerProgress: DbWorkCareerProgress[]
  workDailyStats: DbWorkDailyStats[]
  workSessions: DbWorkSession[]
  workRewardClaims: DbWorkRewardClaim[]
  playerInventory: DbInventoryItem[]
  inventoryTransactions: DbInventoryTransaction[]
}

const now = '2026-08-28T00:00:00.000Z'
const localGeneratedAdminPassword = randomBytes(24).toString('base64url')
const localGeneratedTestPassword = randomBytes(24).toString('base64url')

export function getDefaultAdminEmail(): string {
  const configured = (process.env.STUDIO_ADMIN_EMAIL || '').trim().toLowerCase()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production requires STUDIO_ADMIN_EMAIL.')
  }
  return 'admin@localhost.invalid'
}

export function getDefaultAdminUsername(): string {
  const configured = (process.env.STUDIO_ADMIN_USERNAME || '').trim().toLowerCase()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production requires STUDIO_ADMIN_USERNAME.')
  }
  return 'tohi'
}

export function getDefaultAdminPassword(): string {
  const configured = process.env.STUDIO_ADMIN_PASSWORD || ''
  if (configured) {
    if (process.env.NODE_ENV === 'production' && configured.length < 16) {
      throw new Error('Production requires STUDIO_ADMIN_PASSWORD with at least 16 characters.')
    }
    return configured
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production requires STUDIO_ADMIN_PASSWORD; no default admin password is available.')
  }
  return localGeneratedAdminPassword
}

export function getTestAccountPassword(): string {
  return process.env.STUDIO_TEST_PASSWORD || localGeneratedTestPassword
}

export function createDefaultAdminUser(studioId: string): DbUser {
  return { id: 'user-tohi', email: getDefaultAdminEmail(), username: getDefaultAdminUsername(), passwordHash: hashPassword(getDefaultAdminPassword()), displayName: 'Tohi', role: 'ADMIN', studioId, xp: 0, level: 1, createdAt: now }
}

export function createDefaultTestUsers(studioId: string): DbUser[] {
  if (process.env.NODE_ENV === 'production') return []
  const accounts = [
    { id: 'user-demo', username: 'demo', email: 'demo@tohi.studio', displayName: 'Demo Player', role: 'MEMBER' as const, avatarKey: 'ash' as const },
    { id: 'user-dealer', username: 'dealer', email: 'dealer@tohi.studio', displayName: 'Dealer Bot', role: 'MEMBER' as const, avatarKey: 'nancy' as const },
    { id: 'user-designer', username: 'designer', email: 'designer@tohi.studio', displayName: 'Game Designer', role: 'GAME_DESIGNER' as const, avatarKey: 'lucy' as const },
    { id: 'user-qa', username: 'qa', email: 'qa@tohi.studio', displayName: 'QA Player', role: 'QA' as const, avatarKey: 'adam' as const },
  ]
  return accounts.map((account) => ({ ...account, passwordHash: hashPassword(getTestAccountPassword()), studioId, xp: 0, level: 1, createdAt: now }))
}

function starterProgression(user: DbUser): DbPlayerProgression {
  return { userId: user.id, gameXp: 0, gameLevel: calculateSocialLevel(0), coinBalance: 1000, freeRoundsRewardedToday: 0, gameXpEarnedToday: 0 }
}

function starterOwnedCosmetics(user: DbUser): DbOwnedCosmetic[] {
  return socialCosmeticCatalog.filter((item) => item.starter).map((item) => ({ userId: user.id, itemId: item.id, source: 'STARTER', acquiredAt: now }))
}

function starterLoadout(user: DbUser): DbLoadout {
  return { userId: user.id, avatarKey: user.avatarKey || 'adam', nameplateId: 'nameplate-basic' }
}

function starterProperty(user: DbUser): DbProperty {
  return {
    ownerId: user.id,
    templateId: 'room_template_v1',
    layoutVersion: 1,
    furniture: [
      { itemId: 'furniture-starter-chair', x: 2, y: 3, rotation: 0 },
      { itemId: 'furniture-starter-plant', x: 5, y: 2, rotation: 0 },
    ],
    visitCount: 0,
    updatedAt: now,
    styles: { wallStyleId: 'starter_wallpaper', floorStyleId: 'wooden_floor' },
    visibility: 'FRIENDS',
  }
}

function starterWorkProfile(user: DbUser): DbWorkProfile {
  return { userId: user.id, tutorialCompleted: false, workStreak: 0 }
}

function starterWorkCareerProgress(user: DbUser): DbWorkCareerProgress[] {
  const careerIds: WorkCareerId[] = ['ART', 'ANIMATION', 'GAME_DESIGN', 'FRONTEND', 'BACKEND', 'QA', 'QC', 'PM', 'HR']
  return careerIds.map((careerId) => ({ userId: user.id, careerId, careerXp: 0, rank: 'INTERN' as WorkRankId }))
}

export function createSeedState(): StudioDbState {
  const studioId = 'studio-rng-1'
  const projectId = 'project-hero-battle-h5'
  const sprintId = 'sprint-combat-prototype'
  const bossId = 'boss-release-dragon'
  const users: DbUser[] = [createDefaultAdminUser(studioId), ...createDefaultTestUsers(studioId)]
  const tasksInput: Array<{ id: string; title: string; damage: number; priority: DbTask['priority']; status: DbTask['status']; assigneeId?: string }> = [
    { id: 'task-combat-engine', title: 'Combat Engine', damage: 3000, priority: 'CRITICAL', status: 'TODO', assigneeId: 'user-tohi' },
    { id: 'task-formation-system', title: 'Formation System', damage: 2500, priority: 'HIGH', status: 'TODO', assigneeId: 'user-tohi' },
    { id: 'task-skill-resolver', title: 'Skill Resolver', damage: 2500, priority: 'HIGH', status: 'IN_PROGRESS', assigneeId: 'user-tohi' },
    { id: 'task-buff-system', title: 'Buff System', damage: 2000, priority: 'NORMAL', status: 'BACKLOG' },
    { id: 'task-battle-ui', title: 'Battle UI', damage: 2000, priority: 'NORMAL', status: 'TODO', assigneeId: 'user-tohi' },
    { id: 'task-vfx-integration', title: 'VFX Integration', damage: 1500, priority: 'NORMAL', status: 'BACKLOG', assigneeId: 'user-tohi' },
    { id: 'task-qa-pass', title: 'QA Pass', damage: 1500, priority: 'HIGH', status: 'REVIEW', assigneeId: 'user-tohi' },
    { id: 'task-mobile-optimization', title: 'Mobile Optimization', damage: 1000, priority: 'LOW', status: 'BACKLOG' },
    { id: 'task-documentation', title: 'Documentation', damage: 1000, priority: 'LOW', status: 'TODO', assigneeId: 'user-tohi' },
    { id: 'task-build-release', title: 'Build Release', damage: 3000, priority: 'CRITICAL', status: 'BACKLOG', assigneeId: 'user-tohi' },
  ]
  const tasks: DbTask[] = tasksInput.map((input) => ({
    id: input.id,
    projectId,
    sprintId,
    title: input.title,
    description: `Production task for the ${input.title.toLowerCase()} milestone.`,
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    questXp: 100,
    studioXpReward: 50,
    bossDamage: input.damage,
    createdAt: now,
    completedAt: input.status === 'DONE' ? now : undefined,
  }))
  const quests: DbQuest[] = tasks.map((task) => ({ id: `quest-${task.id}`, taskId: task.id, questType: task.priority === 'CRITICAL' ? 'ELITE' : task.priority === 'HIGH' ? 'MAIN' : 'SIDE', xpReward: task.questXp, studioXpReward: task.studioXpReward, bossDamage: task.bossDamage, completed: task.status === 'DONE' }))
  const studioXp = tasks.filter((task) => task.status === 'DONE').reduce((sum, task) => sum + task.studioXpReward, 0)
  return {
    users,
    studios: [{ id: studioId, name: 'RNG Game Studio', level: calculateLevel(studioXp), xp: studioXp, createdAt: now }],
    members: users.map((user) => ({ id: `member-${user.id}`, studioId, userId: user.id, role: user.role, joinedAt: now })),
    projects: [
      { id: projectId, studioId, name: 'Hero Battle H5', description: 'First playable production slice for the game studio OS.', status: 'ACTIVE', createdAt: now, updatedAt: now },
      { id: 'project-neon-roulette', studioId, name: 'Neon Roulette', description: 'Table betting game concept lab and live-ops experiments.', status: 'PLANNING', createdAt: now, updatedAt: now },
    ],
    sprints: [{ id: sprintId, projectId, name: 'Combat Prototype', startDate: '2026-08-24', endDate: '2026-09-04', status: 'ACTIVE', sprintBossId: bossId }],
    tasks,
    quests,
    bosses: [{ id: bossId, sprintId, name: 'Release Dragon', maxHp: 20000, currentHp: 20000, status: 'ACTIVE' }],
    resources: [
      { id: 'resource-workflow', studioId, title: 'RNG Studio Workflow', kind: 'DOC', url: 'https://example.com/studio-workflow', description: 'Gate tracker và review workflow cho studio.', tags: ['workflow', 'production'], createdById: 'user-tohi', createdAt: now },
      { id: 'resource-gdd', studioId, title: 'Production GDD', kind: 'DOC', url: 'https://example.com/production-gdd', description: 'Mechanic flow, table rules và feature spec.', tags: ['gdd', 'design'], createdById: 'user-tohi', createdAt: now },
      { id: 'resource-art-review', studioId, title: 'Static Art Review Board', kind: 'ASSET', url: 'https://example.com/art-review', description: 'Concept, UI state và feedback mới nhất.', tags: ['art', 'review'], createdById: 'user-tohi', createdAt: now },
      { id: 'resource-build-evidence', studioId, title: 'Simulation Evidence', kind: 'BUILD', url: 'https://example.com/simulation-evidence', description: 'Observed vs expected metrics của final build.', tags: ['qa', 'build'], createdById: 'user-tohi', createdAt: now },
    ],
    activities: [{ id: 'activity-seed', studioId, type: 'TASK_CREATED', actorId: 'user-tohi', message: 'Studio workspace seeded with Combat Prototype sprint.', createdAt: now }],
    playerProgressions: users.map(starterProgression),
    gameQuestProgress: [],
    walletTransactions: [],
    ownedCosmetics: users.flatMap(starterOwnedCosmetics),
    loadouts: users.map(starterLoadout),
    properties: users.map(starterProperty),
    propertyVisits: [],
    propertyLikes: [],
    propertyGifts: [],
    socialRounds: [],
    socialRewardClaims: [],
    friendships: [],
    blocks: [],
    socialNotifications: [],
    workProfiles: users.map(starterWorkProfile),
    workCareerProgress: users.flatMap(starterWorkCareerProgress),
    workDailyStats: [],
    workSessions: [],
    workRewardClaims: [],
    playerInventory: [],
    inventoryTransactions: [],
  }
}
