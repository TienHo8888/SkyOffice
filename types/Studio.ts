import type { CharacterConfig } from './Avatar'
import type { GameQuest, SocialProgression } from './Social'

export type StudioRole =
  | 'OWNER'
  | 'ADMIN'
  | 'GAME_DESIGNER'
  | 'DEVELOPER'
  | 'ARTIST'
  | 'QA'
  | 'PRODUCER'
  | 'MEMBER'

export const STUDIO_HUB_ADMIN_ROLES: readonly StudioRole[] = ['OWNER', 'ADMIN']

export function canAccessStudioHub(role?: string): boolean {
  return Boolean(role && (STUDIO_HUB_ADMIN_ROLES as readonly string[]).includes(role))
}

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
export type QuestType = 'MAIN' | 'SIDE' | 'BUG' | 'ELITE'
export type BossStatus = 'LOCKED' | 'ACTIVE' | 'DEFEATED' | 'FAILED'
export type ResourceKind = 'LINK' | 'DOC' | 'BUILD' | 'ASSET'
export type StudioAvatarKey = 'adam' | 'ash' | 'lucy' | 'nancy'

export interface User {
  id: string
  email: string
  username?: string
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

export interface Studio {
  id: string
  name: string
  level: number
  xp: number
  xpToNextLevel: number
  unlocks: string[]
  createdAt: string
}

export interface StudioMember {
  id: string
  studioId: string
  userId: string
  role: StudioRole
  joinedAt: string
}

export interface MemberView extends User {
  memberId: string
  online: boolean
  currentRoom: string
}

export interface Project {
  id: string
  studioId: string
  name: string
  description: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  progress: number
}

export interface Sprint {
  id: string
  projectId: string
  name: string
  startDate: string
  endDate: string
  status: SprintStatus
  sprintBossId: string
  progress: number
}

export interface Task {
  id: string
  projectId: string
  sprintId?: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId?: string
  questXp: number
  studioXpReward: number
  bossDamage: number
  createdAt: string
  completedAt?: string
}

export interface Quest {
  id: string
  taskId: string
  questType: QuestType
  xpReward: number
  studioXpReward: number
  bossDamage: number
  completed: boolean
}

export interface SprintBoss {
  id: string
  sprintId: string
  name: string
  maxHp: number
  currentHp: number
  status: BossStatus
}

export interface StudioResource {
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

export interface StudioProgression {
  userId: string
  xp: number
  level: number
  xpToNextLevel: number
}

export interface Presence {
  userId: string
  displayName: string
  role: StudioRole
  currentRoom: string
  online: boolean
  x: number
  y: number
  sessionId?: string
  status?: 'ONLINE' | 'AWAY' | 'BUSY' | 'IN_ACTIVITY'
  activity?: string
  partyId?: string
  lastSeenAt?: string
}

export type ActivityEventType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'BOSS_DAMAGED'
  | 'BOSS_DEFEATED'
  | 'STUDIO_LEVEL_UP'
  | 'MEMBER_JOINED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_ROOM_CHANGED'
  | 'RESOURCE_SHARED'
  | 'SOCIAL_REWARD'
  | 'COSMETIC_PURCHASE'
  | 'PROPERTY_ACTIVITY'
  | 'WORK_COMPLETED'
  | 'WORK_SALARY'

export interface ActivityEvent {
  id: string
  studioId: string
  type: ActivityEventType
  actorId?: string
  message: string
  metadata?: Record<string, string | number | boolean>
  createdAt: string
}

export interface StudioSnapshot {
  studio: Studio
  activeSprint: Sprint | null
  boss: SprintBoss | null
  projects: Project[]
  members: MemberView[]
  quests: Quest[]
  activity: ActivityEvent[]
  onlineMembers: Presence[]
  personalProgress: StudioProgression
}

export interface CompletionResponse {
  task: Task
  quest: Quest
  personalProgress: StudioProgression
  gameProgression: SocialProgression
  gameXpDelta: number
  gameQuests: GameQuest[]
  studioProgress: Studio
  boss: SprintBoss | null
  events: ActivityEvent[]
}

export interface AuthSession {
  token: string
  user: User
}

export interface ApiErrorShape {
  code: string
  message: string
}
