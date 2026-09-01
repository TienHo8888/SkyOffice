import express, { NextFunction, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { DbTask } from './seed'
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from './auth'
import { DomainError, StudioStore, studioStore, toUser } from './store'
import { getPresence } from './presence'
import { publishStudioCompletion } from './events'
import { StudioAvatarKey, StudioRole } from '../../types/Studio'
import { characterConfigToLegacyAvatar, normalizeCharacterConfig } from '../../types/Avatar'
import type { CharacterConfig } from '../../types/Avatar'
import { FurniturePlacement, SocialLoadout } from '../../types/Social'
import type { PropertyStyles, PropertyVisibility } from '../../types/Housing'
import { WorkCareerId } from '../../types/Work'
import { workStationDefinitions } from './work-config'
import { worldRoomRegistry } from '../rooms/world-room-registry'

interface AuthenticatedRequest extends Request {
  studioUser?: ReturnType<typeof toUser>
}

const allowedRoles: StudioRole[] = ['OWNER', 'ADMIN', 'GAME_DESIGNER', 'DEVELOPER', 'ARTIST', 'QA', 'PRODUCER', 'MEMBER']
const taskManagerRoles: StudioRole[] = ['OWNER', 'ADMIN', 'PRODUCER', 'GAME_DESIGNER']

function sendError(res: Response, error: unknown) {
  if (error instanceof DomainError) return res.status(error.status).json({ code: error.code, message: error.message })
  console.error(error)
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong.' })
}

function requireAuth(store: StudioStore) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const session = verifySessionToken(token)
    const user = session ? store.getUserById(session.userId) : undefined
    if (!session || !user || user.studioId !== session.studioId) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'A valid studio session is required.' })
    req.studioUser = toUser(user)
    next()
  }
}

function requireRole(...roles: StudioRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.studioUser || !roles.includes(req.studioUser.role)) return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not have permission for this action.' })
    next()
  }
}

function currentUser(req: AuthenticatedRequest) {
  if (!req.studioUser) throw new DomainError('UNAUTHORIZED', 'A valid studio session is required.', 401)
  return req.studioUser
}

function assertNearWorkStation(userId: string, stationId: string, errorCode = 'WORK_LOCATION_REQUIRED') {
  const presence = getPresence().get(userId)
  const station = workStationDefinitions.find((candidate) => candidate.id === stationId)
  if (!presence?.online || !station || presence.currentRoom !== station.roomId || Math.hypot(presence.x - station.x, presence.y - station.y) > station.interactionRadius) {
    throw new DomainError(errorCode, `Bạn cần đứng gần ${station?.label || 'work station'} để thực hiện thao tác này.`, 409)
  }
}

export function createStudioApi(store: StudioStore = studioStore) {
  const router = express.Router()
  const auth = requireAuth(store)
  const socialActionHits = new Map<string, number[]>()
  const accountPasswordMinimum = process.env.NODE_ENV === 'production' ? 12 : 4
  const socialRateLimit = (action: string, max: number, windowMs = 60_000) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const actor = req.studioUser
    const key = `${action}:${actor?.id || req.ip}`
    const now = Date.now()
    const recent = (socialActionHits.get(key) || []).filter((timestamp) => now - timestamp < windowMs)
    if (recent.length >= max) return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many social actions. Please try again shortly.' })
    recent.push(now)
    socialActionHits.set(key, recent)
    next()
  }

  router.get('/health', (_req, res) => {
    const persistence = store.getPersistenceStatus()
    const ok = persistence.ready && !persistence.error
    return res.status(ok ? 200 : 503).json({ ok, service: 'studio-api', persistence, time: new Date().toISOString() })
  })

  router.post('/auth/login', (req, res) => {
    const identifier = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!identifier || password.length < 4) return res.status(400).json({ code: 'INVALID_CREDENTIALS', message: 'Account and password are required.' })
    const user = store.getUserByLogin(identifier)
    let passwordValid = false
    try { passwordValid = Boolean(user && verifyPassword(password, user.passwordHash)) } catch { passwordValid = false }
    if (!passwordValid) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
    }
    return res.json({ token: createSessionToken(toUser(user)), user: toUser(user) })
  })

  router.post('/auth/register', auth, requireRole('OWNER', 'ADMIN', 'PRODUCER'), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const email = String(req.body?.email || '').trim().toLowerCase()
      const username = String(req.body?.username || email.split('@')[0] || '').trim().toLowerCase()
      const password = req.body?.password === undefined || req.body?.password === ''
        ? randomBytes(18).toString('base64url')
        : String(req.body.password)
      const displayName = String(req.body?.displayName || '').trim()
      const role = String(req.body?.role || 'MEMBER').toUpperCase() as StudioRole
      const avatarUrl = String(req.body?.avatarUrl || '').trim()
      if (!email || !displayName || !email.includes('@') || !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username) || password.length < accountPasswordMinimum) return res.status(400).json({ code: 'INVALID_MEMBER', message: `Name, username, valid email and a password of at least ${accountPasswordMinimum} characters are required.` })
      if (!allowedRoles.includes(role) || role === 'OWNER') return res.status(400).json({ code: 'INVALID_ROLE', message: 'This role cannot be assigned from the invite form.' })
      const user = store.createUser({ email, username, passwordHash: hashPassword(password), displayName, avatarUrl: avatarUrl || undefined, role, studioId: actor.studioId })
      return res.status(201).json({ user, temporaryPassword: password })
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/auth/members/:id', auth, requireRole('OWNER', 'ADMIN'), (req: AuthenticatedRequest, res) => {
    try {
      const patch: Parameters<StudioStore['updateUser']>[2] = {}
      if (req.body?.displayName !== undefined) patch.displayName = String(req.body.displayName).trim()
      if (req.body?.role !== undefined) patch.role = String(req.body.role).toUpperCase() as StudioRole
      if (req.body?.avatarUrl !== undefined) patch.avatarUrl = String(req.body.avatarUrl).trim()
      if (req.body?.password !== undefined && String(req.body.password)) {
        const password = String(req.body.password)
        if (password.length < accountPasswordMinimum) return res.status(400).json({ code: 'INVALID_MEMBER_PASSWORD', message: `Password must be at least ${accountPasswordMinimum} characters.` })
        patch.passwordHash = hashPassword(password)
      }
      if (!Object.keys(patch).length) return res.status(400).json({ code: 'INVALID_MEMBER', message: 'At least one member field is required.' })
      return res.json({ user: store.updateUser(currentUser(req).studioId, req.params.id, patch) })
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/auth/avatar', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const avatarKey = String(req.body?.avatarKey || '').toLowerCase() as StudioAvatarKey
      const characterConfig = normalizeCharacterConfig(undefined, avatarKey)
      return res.json({ user: store.updateUser(actor.studioId, actor.id, { avatarKey, characterConfig }) })
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/auth/profile', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const patch: Parameters<StudioStore['updateUser']>[2] = {}
      if (req.body?.displayName !== undefined) {
        const displayName = String(req.body.displayName).trim()
        if (displayName.length < 2 || displayName.length > 24) return res.status(400).json({ code: 'INVALID_DISPLAY_NAME', message: 'Display name must be between 2 and 24 characters.' })
        patch.displayName = displayName
      }
      if (req.body?.avatarKey !== undefined) patch.avatarKey = String(req.body.avatarKey).toLowerCase() as StudioAvatarKey
      if (req.body?.characterConfig !== undefined) {
        const characterConfig = normalizeCharacterConfig(req.body.characterConfig, patch.avatarKey || actor.avatarKey)
        patch.characterConfig = characterConfig as CharacterConfig
        patch.avatarKey = characterConfigToLegacyAvatar(characterConfig)
      } else if (req.body?.avatarKey !== undefined) {
        patch.characterConfig = normalizeCharacterConfig(undefined, patch.avatarKey || actor.avatarKey)
      }
      if (!Object.keys(patch).length) return res.status(400).json({ code: 'INVALID_PROFILE', message: 'Display name or avatar is required.' })
      return res.json({ user: store.updateUser(actor.studioId, actor.id, patch) })
    } catch (error) { return sendError(res, error) }
  })

  router.get('/auth/me', auth, (req: AuthenticatedRequest, res) => res.json({ user: currentUser(req) }))

  router.get('/studio', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const canViewMemberEmails = actor.role === 'OWNER' || actor.role === 'ADMIN'
      return res.json(store.snapshot(actor.studioId, actor.id, getPresence(), canViewMemberEmails))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/me', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getSocialSnapshot(actor.studioId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/work', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getWorkSnapshot(actor.studioId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/work/history', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50
      return res.json(store.getWorkHistory(actor.studioId, actor.id, Number.isFinite(limit) ? limit : 50))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/work/career/select', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const careerId = String(req.body?.careerId || '').toUpperCase() as WorkCareerId
      return res.json(store.selectCareer(actor.studioId, actor.id, careerId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/work/career/change', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const careerId = String(req.body?.careerId || '').toUpperCase() as WorkCareerId
      return res.json(store.changeCareer(actor.studioId, actor.id, careerId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/work/salary/claim', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      assertNearWorkStation(actor.id, 'PAYROLL_OFFICE', 'PAYROLL_LOCATION_REQUIRED')
      return res.json(store.claimDailySalary(actor.studioId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/quests', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getGameQuests(actor.studioId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/leaderboard', auth, socialRateLimit('leaderboard', 60), (req: AuthenticatedRequest, res) => {
    try {
      return res.json(store.getSocialLeaderboard(currentUser(req).studioId, getPresence()))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/daily-claim', auth, socialRateLimit('daily-claim', 5), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.claimDailySocialReward(actor.studioId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/trade', auth, socialRateLimit('trade', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const recipientIdentifier = String(req.body?.recipientId || req.body?.recipient || '').trim()
      const recipient = store.getUserByLogin(recipientIdentifier) || store.getUserById(recipientIdentifier)
      if (!recipient || recipient.studioId !== actor.studioId) throw new DomainError('RECIPIENT_NOT_FOUND', 'Không tìm thấy người nhận trong studio.')
      const amount = Number(req.body?.amount)
      const tradeId = String(req.body?.tradeId || '')
      return res.json(store.transferCoins(actor.studioId, actor.id, recipient.id, amount, tradeId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/inventory/sell', auth, socialRateLimit('inventory-sell', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const itemId = String(req.body?.itemId || '').trim()
      const quantity = Number(req.body?.quantity)
      const saleId = String(req.body?.saleId || '')
      return res.json(store.sellInventoryItem(actor.studioId, actor.id, itemId, quantity, saleId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/inventory/trade', auth, socialRateLimit('inventory-trade', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const recipientIdentifier = String(req.body?.recipientId || req.body?.recipient || '').trim()
      const recipient = store.getUserByLogin(recipientIdentifier) || store.getUserById(recipientIdentifier)
      if (!recipient || recipient.studioId !== actor.studioId) throw new DomainError('RECIPIENT_NOT_FOUND', 'Không tìm thấy người nhận trong studio.')
      const itemId = String(req.body?.itemId || '').trim()
      const quantity = Number(req.body?.quantity)
      const tradeId = String(req.body?.tradeId || '')
      return res.json(store.transferInventoryItem(actor.studioId, actor.id, recipient.id, itemId, quantity, tradeId))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/catalog', auth, (_req: AuthenticatedRequest, res) => res.json(store.getSocialCatalog()))

  router.post('/social/catalog/:itemId/purchase', auth, socialRateLimit('purchase', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.purchaseCosmetic(actor.studioId, actor.id, req.params.itemId))
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/social/loadout', auth, socialRateLimit('loadout', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const patch: Partial<Omit<SocialLoadout, 'userId'>> = {}
      for (const key of ['avatarKey', 'outfitId', 'topId', 'bottomId', 'shoesId', 'hatId', 'neckId', 'armsId', 'shouldersId', 'nameplateId', 'titleId', 'borderId', 'emoteId'] as const) {
        if (req.body?.[key] !== undefined) (patch as any)[key] = String(req.body[key])
      }
      return res.json(store.updateSocialLoadout(actor.studioId, actor.id, patch))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/profiles/:userId', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getPublicSocialProfile(actor.studioId, req.params.userId, actor.id, getPresence()))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/people', auth, socialRateLimit('people-search', 60), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.searchSocialPeople(actor.studioId, actor.id, String(req.query.q || ''), getPresence()))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/friends', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getSocialPeopleSnapshot(actor.studioId, actor.id, getPresence()))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/friends/:userId/request', auth, socialRateLimit('friend-request', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.status(201).json(store.requestFriend(actor.studioId, actor.id, req.params.userId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/friends/requests/:id/accept', auth, socialRateLimit('friend-accept', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.acceptFriendRequest(actor.studioId, actor.id, req.params.id))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/friends/requests/:id/decline', auth, socialRateLimit('friend-decline', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.declineFriendRequest(actor.studioId, actor.id, req.params.id))
    } catch (error) { return sendError(res, error) }
  })

  router.delete('/social/friends/:userId', auth, socialRateLimit('friend-remove', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      store.removeFriend(actor.studioId, actor.id, req.params.userId)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/blocks/:userId', auth, socialRateLimit('social-block', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      store.blockUser(actor.studioId, actor.id, req.params.userId)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.delete('/social/blocks/:userId', auth, socialRateLimit('social-unblock', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      store.unblockUser(actor.studioId, actor.id, req.params.userId)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/notifications/:id/read', auth, socialRateLimit('notification-read', 120), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      store.markSocialNotificationRead(actor.studioId, actor.id, req.params.id)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/notifications/read-all', auth, socialRateLimit('notification-read-all', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      store.markAllSocialNotificationsRead(actor.studioId, actor.id)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/property/me', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getProperty(actor.studioId, actor.id, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/social/property/:userId', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.getProperty(actor.studioId, req.params.userId, actor.id))
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/social/property/me/layout', auth, socialRateLimit('property-layout', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const furniture = Array.isArray(req.body?.furniture) ? req.body.furniture as FurniturePlacement[] : []
      const styles = req.body?.styles && typeof req.body.styles === 'object' ? req.body.styles as PropertyStyles : undefined
      const property = store.updatePropertyLayout(actor.studioId, actor.id, furniture, styles)
      worldRoomRegistry.broadcastHomeLayout(property)
      return res.json(property)
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/social/property/me/access', auth, socialRateLimit('property-access', 20), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const visibility = String(req.body?.visibility || '') as PropertyVisibility
      const property = store.updatePropertyVisibility(actor.studioId, actor.id, visibility)
      worldRoomRegistry.broadcastHomeLayout(property)
      return res.json(property)
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/property/:userId/like', auth, socialRateLimit('property-like', 30), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      return res.json(store.likeProperty(actor.studioId, actor.id, req.params.userId))
    } catch (error) { return sendError(res, error) }
  })

  router.post('/social/property/:userId/gift', auth, socialRateLimit('property-gift', 10), (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const itemId = String(req.body?.itemId || '')
      if (!itemId) return res.status(400).json({ code: 'INVALID_PROPERTY_GIFT', message: 'A furniture item is required.' })
      const giftId = req.body?.giftId === undefined ? undefined : String(req.body.giftId)
      return res.json(store.giftPropertyFurniture(actor.studioId, actor.id, req.params.userId, itemId, giftId))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/studio/members', auth, (req: AuthenticatedRequest, res) => {
    const actor = currentUser(req)
    const canViewMemberEmails = actor.role === 'OWNER' || actor.role === 'ADMIN'
    return res.json(store.getMembers(actor.studioId, getPresence(), canViewMemberEmails))
  })
  router.get('/resources', auth, (req: AuthenticatedRequest, res) => res.json(store.getResources(currentUser(req).studioId)))
  router.post('/resources', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((tag: unknown) => String(tag)) : String(req.body?.tags || '').split(',')
      return res.status(201).json(store.createResource(actor.studioId, actor.id, { title: String(req.body?.title || ''), kind: String(req.body?.kind || 'LINK').toUpperCase() as any, url: String(req.body?.url || ''), description: String(req.body?.description || ''), tags }))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/projects', auth, (req: AuthenticatedRequest, res) => res.json(store.getProjects(currentUser(req).studioId)))

  router.post('/projects', auth, requireRole('OWNER', 'ADMIN', 'PRODUCER'), (req: AuthenticatedRequest, res) => {
    try {
      const name = String(req.body?.name || '').trim()
      if (!name) return res.status(400).json({ code: 'INVALID_PROJECT', message: 'Project name is required.' })
      return res.status(201).json(store.createProject(currentUser(req).studioId, name, String(req.body?.description || '')))
    } catch (error) { return sendError(res, error) }
  })

  router.get('/projects/:id', auth, (req: AuthenticatedRequest, res) => {
    const project = store.getProject(req.params.id)
    if (!project || project.studioId !== currentUser(req).studioId) return res.status(404).json({ code: 'PROJECT_NOT_FOUND', message: 'Project not found.' })
    return res.json({ ...project, progress: store.getProjects(project.studioId).find((item) => item.id === project.id)?.progress || 0, sprints: store.getSprints(project.id), tasks: store.getTasks(project.studioId).filter((task) => task.projectId === project.id) })
  })

  router.get('/sprints/:id', auth, (req: AuthenticatedRequest, res) => {
    const sprint = store.getSprint(req.params.id)
    if (!sprint) return res.status(404).json({ code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' })
    const project = store.getProject(sprint.projectId)
    if (!project || project.studioId !== currentUser(req).studioId) return res.status(404).json({ code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' })
    return res.json({ ...sprint, boss: store.getBossBySprintId(sprint.sprintBossId), tasks: store.getTasks(project.studioId, sprint.id) })
  })

  router.get('/tasks', auth, (req: AuthenticatedRequest, res) => res.json(store.getTasks(currentUser(req).studioId, typeof req.query.sprintId === 'string' ? req.query.sprintId : undefined)))

  router.post('/tasks', auth, requireRole('OWNER', 'ADMIN', 'PRODUCER', 'GAME_DESIGNER'), (req: AuthenticatedRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim()
      if (!title) return res.status(400).json({ code: 'INVALID_TASK', message: 'Task title is required.' })
      const task = store.createTask(currentUser(req).studioId, {
        projectId: String(req.body?.projectId || ''),
        sprintId: req.body?.sprintId ? String(req.body.sprintId) : undefined,
        title,
        description: String(req.body?.description || ''),
        priority: req.body?.priority as DbTask['priority'],
        assigneeId: req.body?.assigneeId ? String(req.body.assigneeId) : undefined,
        bossDamage: req.body?.bossDamage ? Number(req.body.bossDamage) : undefined,
      })
      return res.status(201).json(task)
    } catch (error) { return sendError(res, error) }
  })

  router.patch('/tasks/:id', auth, (req: AuthenticatedRequest, res) => {
    try {
      const patch: Partial<Pick<DbTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'bossDamage'>> = {}
      for (const key of ['title', 'description', 'status', 'priority', 'assigneeId', 'bossDamage'] as const) if (req.body?.[key] !== undefined) (patch as any)[key] = key === 'bossDamage' ? Number(req.body[key]) : req.body[key]
      const needsManagerRole = Object.keys(patch).some((key) => key !== 'status')
      if (needsManagerRole && !taskManagerRoles.includes(currentUser(req).role)) return res.status(403).json({ code: 'FORBIDDEN', message: 'Only studio managers can edit task details.' })
      return res.json(store.updateTask(currentUser(req).studioId, req.params.id, patch))
    } catch (error) { return sendError(res, error) }
  })

  router.delete('/tasks/:id', auth, requireRole('OWNER', 'ADMIN', 'PRODUCER', 'GAME_DESIGNER'), (req: AuthenticatedRequest, res) => {
    try {
      store.deleteTask(currentUser(req).studioId, req.params.id)
      return res.status(204).send()
    } catch (error) { return sendError(res, error) }
  })

  router.post('/tasks/:id/complete', auth, (req: AuthenticatedRequest, res) => {
    try {
      const actor = currentUser(req)
      const completion = store.completeTask(actor.studioId, req.params.id, actor.id)
      publishStudioCompletion(actor.studioId, actor.id, completion)
      return res.json(completion)
    } catch (error) { return sendError(res, error) }
  })

  router.get('/quests', auth, (req: AuthenticatedRequest, res) => res.json(store.getQuests(currentUser(req).studioId)))
  router.get('/boss/:sprintId', auth, (req: AuthenticatedRequest, res) => {
    const sprint = store.getSprint(req.params.sprintId)
    if (!sprint) return res.status(404).json({ code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' })
    const project = store.getProject(sprint.projectId)
    if (!project || project.studioId !== currentUser(req).studioId) return res.status(404).json({ code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' })
    return res.json(store.getBossBySprintId(sprint.id))
  })
  router.get('/activity', auth, (req: AuthenticatedRequest, res) => res.json(store.getActivities(currentUser(req).studioId)))

  router.post('/ai/assist', auth, (req: AuthenticatedRequest, res) => {
    const prompt = String(req.body?.prompt || '').toLowerCase()
    const reply = prompt.includes('risk') || prompt.includes('block') ? 'Pixel thấy nên ưu tiên task Critical, kiểm tra boss HP và clear các item đang ở Review trước daily standup.' : prompt.includes('idea') || prompt.includes('concept') ? 'Bắt đầu từ player moment, chốt core loop, scope art và cách test trong một sprint. Sau đó lưu thành task để team cùng ship.' : 'Pixel đã đọc studio context. Hãy hỏi về project, sprint, task, boss hoặc một concept table game mới.'
    return res.json({ reply })
  })

  router.post('/ai/brainstorm', auth, (req: AuthenticatedRequest, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) return res.status(400).json({ code: 'INVALID_PROMPT', message: 'A brainstorm prompt is required.' })
    return res.json({ title: 'Signal Table', summary: `Một concept dựa trên “${prompt}”, tập trung vào nhịp chơi nhanh, tín hiệu rõ ràng và một khoảnh khắc quyết định dễ nhớ.`, nextSteps: ['Chốt core loop trong 1 trang', 'Chọn owner và scope art', 'Tạo test plan cho sprint tiếp theo'] })
  })

  return router
}
