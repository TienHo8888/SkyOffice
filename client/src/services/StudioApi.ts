import { AuthSession, CompletionResponse, StudioAvatarKey, StudioResource, StudioSnapshot, Task, User } from '../../../types/Studio'
import type { CharacterConfig } from '../../../types/Avatar'
import { CosmeticCatalogItem, FurniturePlacement, FriendshipView, GameQuest, PropertySnapshot, PublicSocialProfile, SocialLeaderboardEntry, SocialPeopleSearchEntry, SocialPeopleSnapshot, SocialLoadout, SocialReward, SocialSnapshot } from '../../../types/Social'
import { CareerTrackProgress, DailySalaryReceipt, WorkCareerId, WorkHistoryRecord, WorkProgression, WorkSnapshot } from '../../../types/Work'
import type { PropertyStyles, PropertyVisibility } from '../../../types/Housing'

export class StudioApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message)
  }
}

function getApiBase() {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
  if (configuredApiUrl) return configuredApiUrl.replace(/\/$/, '')

  const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim()
  if (configuredServerUrl) {
    const apiUrl = configuredServerUrl.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/$/, '')
    return `${apiUrl}/api`
  }

  if (import.meta.env.DEV || window.location.port === '3001' || window.location.port === '4173') return `${window.location.protocol}//${window.location.hostname}:2567/api`
  throw new Error('VITE_API_URL or VITE_SERVER_URL is required for the deployed client.')
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(`${getApiBase()}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new StudioApiError(payload.code || 'REQUEST_FAILED', payload.message || 'Request failed.', response.status)
  return payload as T
}

export const studioApi = {
  login(identifier: string, password: string) {
    return request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
  },
  me(token: string) {
    return request<{ user: User }>('/auth/me', {}, token)
  },
  register(token: string, input: { displayName: string; email: string; username?: string; role: string; password?: string; avatarUrl?: string }) {
    return request<{ user: User; temporaryPassword: string }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }, token)
  },
  updateMember(token: string, memberId: string, input: { displayName?: string; role?: string; avatarUrl?: string; password?: string }) {
    return request<{ user: User }>(`/auth/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(input) }, token)
  },
  saveAvatar(token: string, avatarKey: StudioAvatarKey) {
    return request<{ user: User }>('/auth/avatar', { method: 'PATCH', body: JSON.stringify({ avatarKey }) }, token)
  },
  updateProfile(token: string, input: { displayName?: string; avatarKey?: StudioAvatarKey; characterConfig?: CharacterConfig }) {
    return request<{ user: User }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(input) }, token)
  },
  snapshot(token: string) {
    return request<StudioSnapshot>('/studio', {}, token)
  },
  createProject(token: string, input: { name: string; description?: string }) {
    return request<{ id: string; name: string }>('/projects', { method: 'POST', body: JSON.stringify(input) }, token)
  },
  resources(token: string) {
    return request<StudioResource[]>('/resources', {}, token)
  },
  createResource(token: string, input: { title: string; kind: string; url: string; description?: string; tags?: string[] }) {
    return request<StudioResource>('/resources', { method: 'POST', body: JSON.stringify(input) }, token)
  },
  tasks(token: string) {
    return request<Task[]>('/tasks', {}, token)
  },
  createTask(token: string, input: { projectId: string; sprintId?: string; title: string; description?: string; priority?: string; assigneeId?: string; bossDamage?: number }) {
    return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }, token)
  },
  updateTask(token: string, taskId: string, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'bossDamage'>>) {
    return request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) }, token)
  },
  deleteTask(token: string, taskId: string) {
    return request<void>(`/tasks/${taskId}`, { method: 'DELETE' }, token)
  },
  completeTask(token: string, taskId: string) {
    return request<CompletionResponse>(`/tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  assist(token: string, prompt: string) {
    return request<{ reply: string }>('/ai/assist', { method: 'POST', body: JSON.stringify({ prompt }) }, token)
  },
  brainstorm(token: string, prompt: string) {
    return request<{ title: string; summary: string; nextSteps: string[] }>('/ai/brainstorm', { method: 'POST', body: JSON.stringify({ prompt }) }, token)
  },
  social(token: string) {
    return request<SocialSnapshot>('/social/me', {}, token)
  },
  socialPeople(token: string) {
    return request<SocialPeopleSnapshot>('/social/friends', {}, token)
  },
  searchSocialPeople(token: string, query: string) {
    return request<SocialPeopleSearchEntry[]>(`/social/people?q=${encodeURIComponent(query)}`, {}, token)
  },
  requestFriend(token: string, userId: string) {
    return request<FriendshipView>(`/social/friends/${encodeURIComponent(userId)}/request`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  acceptFriendRequest(token: string, friendshipId: string) {
    return request<FriendshipView>(`/social/friends/requests/${encodeURIComponent(friendshipId)}/accept`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  declineFriendRequest(token: string, friendshipId: string) {
    return request<FriendshipView>(`/social/friends/requests/${encodeURIComponent(friendshipId)}/decline`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  removeFriend(token: string, userId: string) {
    return request<void>(`/social/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token)
  },
  blockUser(token: string, userId: string) {
    return request<void>(`/social/blocks/${encodeURIComponent(userId)}`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  unblockUser(token: string, userId: string) {
    return request<void>(`/social/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token)
  },
  markSocialNotificationRead(token: string, notificationId: string) {
    return request<void>(`/social/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  markAllSocialNotificationsRead(token: string) {
    return request<void>('/social/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }, token)
  },
  work(token: string) {
    return request<WorkSnapshot>('/work', {}, token)
  },
  workHistory(token: string, limit = 50) {
    return request<WorkHistoryRecord[]>(`/work/history?limit=${limit}`, {}, token)
  },
  selectCareer(token: string, careerId: WorkCareerId) {
    return request<WorkProgression>('/work/career/select', { method: 'POST', body: JSON.stringify({ careerId }) }, token)
  },
  changeCareer(token: string, careerId: WorkCareerId) {
    return request<WorkProgression>('/work/career/change', { method: 'POST', body: JSON.stringify({ careerId }) }, token)
  },
  claimDailySalary(token: string) {
    return request<DailySalaryReceipt>('/work/salary/claim', { method: 'POST', body: JSON.stringify({}) }, token)
  },
  gameQuests(token: string) {
    return request<GameQuest[]>('/social/quests', {}, token)
  },
  leaderboard(token: string) {
    return request<SocialLeaderboardEntry[]>('/social/leaderboard', {}, token)
  },
  claimDailySocialReward(token: string) {
    return request<SocialReward>('/social/daily-claim', { method: 'POST', body: JSON.stringify({}) }, token)
  },
  transferCoins(token: string, input: { recipient: string; amount: number; tradeId?: string }) {
    return request<{ tradeId: string; amount: number; recipientName: string; progression: SocialSnapshot['progression']; duplicate: boolean }>('/social/trade', { method: 'POST', body: JSON.stringify(input) }, token)
  },
  socialCatalog(token: string) {
    return request<CosmeticCatalogItem[]>('/social/catalog', {}, token)
  },
  purchaseCosmetic(token: string, itemId: string) {
    return request<{ item: CosmeticCatalogItem; progression: SocialSnapshot['progression']; duplicate: boolean }>(`/social/catalog/${itemId}/purchase`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  updateSocialLoadout(token: string, patch: Partial<Omit<SocialLoadout, 'userId'>>) {
    return request<SocialLoadout>('/social/loadout', { method: 'PATCH', body: JSON.stringify(patch) }, token)
  },
  socialProfile(token: string, userId: string) {
    return request<PublicSocialProfile>(`/social/profiles/${encodeURIComponent(userId)}`, {}, token)
  },
  property(token: string, userId?: string) {
    return request<PropertySnapshot>(userId ? `/social/property/${userId}` : '/social/property/me', {}, token)
  },
  updateProperty(token: string, furniture: FurniturePlacement[], styles?: PropertyStyles) {
    return request<PropertySnapshot>('/social/property/me/layout', { method: 'PATCH', body: JSON.stringify({ furniture, styles }) }, token)
  },
  updatePropertyAccess(token: string, visibility: PropertyVisibility) {
    return request<PropertySnapshot>('/social/property/me/access', { method: 'PATCH', body: JSON.stringify({ visibility }) }, token)
  },
  likeProperty(token: string, userId: string) {
    return request<PropertySnapshot>(`/social/property/${userId}/like`, { method: 'POST', body: JSON.stringify({}) }, token)
  },
  giftPropertyFurniture(token: string, userId: string, itemId: string, giftId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    return request<{ item: CosmeticCatalogItem; progression: SocialSnapshot['progression']; duplicate: boolean }>(`/social/property/${userId}/gift`, { method: 'POST', body: JSON.stringify({ itemId, giftId }) }, token)
  },
}
