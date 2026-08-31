import React, { useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppSelector } from '../hooks'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { Event, phaserEvents } from '../events/EventCenter'
import { clearAuthSession, setDisplayName } from '../stores/UserStore'
import { applySocialReward, setSocialSnapshot } from '../stores/SocialStore'
import SocialHubPanel from './SocialHubPanel'
import TaskBoard from './TaskBoard'
import Adam from '../images/login/Adam_login.png'
import Ash from '../images/login/Ash_login.png'
import Lucy from '../images/login/Lucy_login.png'
import Nancy from '../images/login/Nancy_login.png'
import { CompletionResponse, MemberView, StudioResource, StudioRole, StudioSnapshot, Task } from '../../../types/Studio'
import { studioRoomName, studioRoomZones } from '../../../types/StudioWorld'
import { TagGameSnapshot } from '../../../types/TagGame'
import { MINI_GAME_CARD_RULES, MINI_GAME_MODES, MINI_GAME_STARTING_COINS, MiniGameMode, MiniGameSnapshot, SOCIAL_MVP_GAME_MODES } from '../../../types/MiniGame'
import { CASINO_GAME_MODES } from '../../../types/Casino'

type Tab = 'dashboard' | 'projects' | 'tasks' | 'resources' | 'ideas' | 'quests' | 'world' | 'minigame' | 'rewards' | 'ranking' | 'team' | 'social'
type AvatarTone = 'pink' | 'blue' | 'purple' | 'lime' | 'orange'

interface AvatarData {
  name: string
  initials: string
  role: string
  email?: string
  online?: boolean
  currentRoom?: string
  xp?: number
  avatar: string
  tone: AvatarTone
}

const avatarImages = [Adam, Ash, Lucy, Nancy]
const avatarTones: AvatarTone[] = ['pink', 'blue', 'purple', 'lime', 'orange']
const miniGameQuestions = [
  { title: 'Evidence nào quan trọng nhất trước Final Build?', options: ['Thêm concept art', 'Build ID + config hash', 'Đổi tên project'], answer: 1 },
  { title: 'Feedback Yellow / For Consideration nên làm gì?', options: ['Luôn block release', 'Xóa khỏi review log', 'Ghi disposition rõ ràng'], answer: 2 },
  { title: 'Một idea tốt cần gì ngoài novelty?', options: ['Feasibility và scope rõ', 'Càng nhiều text càng tốt', 'Không cần owner'], answer: 0 },
]

const idleTagGame: TagGameSnapshot = {
  status: 'IDLE',
  gameId: 'tag',
  roundId: '',
  startedBy: '',
  taggerSessionId: '',
  score: 0,
  settlementStatus: 'NONE',
  winnerIds: [],
  startedAt: 0,
  endsAt: 0,
  resultMessage: '',
  attendees: [],
}

const idleMiniGame: MiniGameSnapshot = {
  mode: '',
  gameId: '',
  status: 'IDLE',
  roundId: '',
  startedBy: '',
  leaderSessionId: '',
  targetColor: '',
  turnTeam: '',
  teamRedScore: 0,
  teamBlueScore: 0,
  startedAt: 0,
  endsAt: 0,
  score: 0,
  totalTasks: 0,
  completedTasks: 0,
  minPlayers: 2,
  maxPlayers: 8,
  spectatorCount: 0,
  settlementStatus: 'NONE',
  winnerIds: [],
  resultMessage: '',
  notice: '',
  attendees: [],
  items: [],
  boardCells: [],
}

function memberAvatar(member: MemberView | undefined, index: number): AvatarData {
  const name = member?.displayName || 'Studio Maker'
  return {
    name,
    initials: name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'ST',
    role: member?.role || 'MEMBER',
    email: member?.email,
    online: member?.online,
    currentRoom: member?.currentRoom,
    xp: member?.xp,
    avatar: member?.avatarUrl || avatarImages[index % avatarImages.length],
    tone: avatarTones[index % avatarTones.length],
  }
}

function Avatar({ member, large = false }: { member: AvatarData; large?: boolean }) {
  return <span className={`studio-avatar tone-${member.tone} ${large ? 'studio-avatar-large' : ''}`}><img src={member.avatar} alt="" /><b>{member.initials}</b></span>
}

function ProgressBar({ value, tone = '' }: { value: number; tone?: string }) {
  return <div className={`studio-progress ${tone}`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function StudioHub() {
  const dispatch = useAppDispatch()
  const authToken = useAppSelector((state) => state.user.authToken)
  const authUser = useAppSelector((state) => state.user.authUser)
  const roomName = useAppSelector((state) => state.room.roomName)
  const currentRoom = useAppSelector((state) => state.user.currentRoom)
  const social = useAppSelector((state) => state.social.snapshot)
  const playerName = useAppSelector((state) => state.user.displayName) || authUser?.displayName || 'Studio Maker'
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [resourceItems, setResourceItems] = useState<StudioResource[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiReply, setAiReply] = useState('Pixel sẵn sàng. Hỏi mình về project, sprint, task hoặc một ý tưởng mới nhé.')
  const [ideaPrompt, setIdeaPrompt] = useState('')
  const [ideaDraft, setIdeaDraft] = useState<{ title: string; summary: string; nextSteps: string[] } | null>(null)
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [challengeAnswer, setChallengeAnswer] = useState<number | null>(null)
  const [challengeXp, setChallengeXp] = useState(0)
  const [tagGame, setTagGame] = useState<TagGameSnapshot>(idleTagGame)
  const [miniGame, setMiniGame] = useState<MiniGameSnapshot>(idleMiniGame)
  const [selectedMiniGameMode, setSelectedMiniGameMode] = useState<MiniGameMode>('TREASURE_HUNT')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberUsername, setNewMemberUsername] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('PRODUCER')
  const [newMemberPassword, setNewMemberPassword] = useState('')
  const [newMemberAvatarUrl, setNewMemberAvatarUrl] = useState('')
  const [editingMemberId, setEditingMemberId] = useState('')
  const [editMemberName, setEditMemberName] = useState('')
  const [editMemberRole, setEditMemberRole] = useState<StudioRole>('MEMBER')
  const [editMemberAvatarUrl, setEditMemberAvatarUrl] = useState('')
  const [editMemberPassword, setEditMemberPassword] = useState('')
  const [projectCreateOpen, setProjectCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [resourceCreateOpen, setResourceCreateOpen] = useState(false)
  const [newResourceTitle, setNewResourceTitle] = useState('')
  const [newResourceUrl, setNewResourceUrl] = useState('')
  const [newResourceDescription, setNewResourceDescription] = useState('')
  const [newResourceKind, setNewResourceKind] = useState('LINK')
  const [newResourceTags, setNewResourceTags] = useState('')

  const refresh = async () => {
    if (!authToken) return
    setLoading(true)
    try {
      const [nextSnapshot, nextTasks, nextResources, nextSocial] = await Promise.all([studioApi.snapshot(authToken), studioApi.tasks(authToken), studioApi.resources(authToken), studioApi.social(authToken)])
      setSnapshot(nextSnapshot)
      setTasks(nextTasks)
      setResourceItems(nextResources)
      dispatch(setSocialSnapshot(nextSocial))
      phaserEvents.emit(Event.MY_PLAYER_NAMEPLATE_CHANGE, nextSocial.loadout.nameplateId)
      phaserEvents.emit(Event.MY_PLAYER_TITLE_CHANGE, nextSocial.loadout.titleId || '')
      setError('')
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải studio workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [authToken, refreshKey])

  useEffect(() => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game) return
    if (open) game.disableKeys()
    else game.enableKeys()
    return () => game.enableKeys()
  }, [open])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const currentMember = useMemo(() => snapshot?.members.find((member) => member.id === authUser?.id) || snapshot?.members[0], [snapshot, authUser?.id])
  const currentAvatar = memberAvatar(currentMember, 0)
  const canManageStudio = Boolean(currentMember && ['OWNER', 'ADMIN', 'PRODUCER'].includes(currentMember.role))
  const canStartTagGame = Boolean(currentMember && ['OWNER', 'ADMIN'].includes(currentMember.role))
  const canEditMembers = Boolean(currentMember && ['OWNER', 'ADMIN'].includes(currentMember.role))
  const currentChallenge = miniGameQuestions[challengeIndex]
  const activeProject = snapshot?.projects.find((project) => project.status === 'ACTIVE') || snapshot?.projects[0]
  const activeSprintTasks = tasks.filter((task) => task.sprintId === snapshot?.activeSprint?.id)
  const completedTasks = activeSprintTasks.filter((task) => task.status === 'DONE').length
  const liveMembers = snapshot?.members || []
  const bossProgress = snapshot?.boss ? snapshot.boss.currentHp / snapshot.boss.maxHp * 100 : 0

  const navigate = (nextTab: Tab) => { setTab(nextTab); setOpen(true) }

  useEffect(() => {
    const handleInteraction = (type: string) => {
      if (type === 'TASK_BOARD') navigate('tasks')
      else if (type === 'PROJECT_BOARD' || type === 'BUILD_MACHINE') navigate('projects')
      else if (type === 'ASSET_BOARD') navigate('resources')
      else if (type === 'ARCADE_MACHINE') setNotice('Arcade station ready — chọn game ngay trong popup bàn chơi.')
      else if (type === 'CARD_TABLE') {
        setNotice('Bàn chơi ready — game sẽ mở ngay trong popup lớn.')
      }
      else if (type === 'MEETING_TABLE') setNotice('Meeting Table ready. Voice/video provider can be connected in the next milestone.')
    }
    phaserEvents.on(Event.GAME_INTERACTION, handleInteraction)
    return () => { phaserEvents.off(Event.GAME_INTERACTION, handleInteraction) }
  }, [])

  useEffect(() => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game?.network) return

    const handleTagGameUpdated = (payload: TagGameSnapshot) => {
      setTagGame(payload)
      if (payload.status === 'COUNTDOWN' || payload.status === 'PLAYING') setOpen(false)
    }
    const handleTagGameError = (payload: { message: string }) => {
      setError(payload.message)
      setTab('minigame')
      setOpen(true)
    }

    game.network.onTagGameUpdated(handleTagGameUpdated)
    game.network.onTagGameError(handleTagGameError)
    const handleMiniGameUpdated = (payload: MiniGameSnapshot) => {
      setMiniGame(payload)
      if (payload.status === 'COUNTDOWN' || payload.status === 'PLAYING') setOpen(false)
    }
    const handleMiniGameError = (payload: { message: string }) => {
      setError(payload.message)
      setTab('minigame')
      setOpen(true)
    }
    game.network.onMiniGameUpdated(handleMiniGameUpdated)
    game.network.onMiniGameError(handleMiniGameError)
    return () => {
      phaserEvents.off(Event.TAG_GAME_UPDATED, handleTagGameUpdated)
      phaserEvents.off(Event.TAG_GAME_ERROR, handleTagGameError)
      phaserEvents.off(Event.MINI_GAME_UPDATED, handleMiniGameUpdated)
      phaserEvents.off(Event.MINI_GAME_ERROR, handleMiniGameError)
    }
  }, [])

  useEffect(() => {
    const handleStudioEvent = (payload: { type?: string }) => {
      if (payload.type === 'TASK_COMPLETED') setRefreshKey((value) => value + 1)
      if (payload.type === 'BOSS_DEFEATED') setNotice('SPRINT BOSS DEFEATED · cả studio vừa clear chapter objective!')
      if (payload.type === 'STUDIO_LEVEL_UP') setNotice('STUDIO LEVEL UP · một world unlock mới đã mở!')
    }
    phaserEvents.on(Event.STUDIO_EVENT, handleStudioEvent)
    return () => { phaserEvents.off(Event.STUDIO_EVENT, handleStudioEvent) }
  }, [])

  const askPixel = async () => {
    if (!authToken || !aiPrompt.trim()) return
    try { setAiReply((await studioApi.assist(authToken, aiPrompt)).reply); setAiPrompt('') } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Pixel không phản hồi.') }
  }

  const generateIdea = async () => {
    if (!authToken || !ideaPrompt.trim()) return
    try { setIdeaDraft(await studioApi.brainstorm(authToken, ideaPrompt)); setNotice('Idea draft đã được Pixel tạo. +20 XP sẽ được ghi khi lưu thành task.') } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tạo concept.') }
  }

  const handleCompletion = (completion: CompletionResponse) => {
    setSnapshot((current) => current ? { ...current, studio: completion.studioProgress, boss: completion.boss, personalProgress: completion.personalProgress, activity: [...completion.events, ...current.activity] } : current)
    setTasks((current) => current.map((task) => task.id === completion.task.id ? completion.task : task))
    if (social) dispatch(setSocialSnapshot({ ...social, progression: completion.gameProgression, gameQuests: completion.gameQuests }))
    else if (authToken) studioApi.social(authToken).then((nextSocial) => dispatch(setSocialSnapshot(nextSocial))).catch(() => undefined)
    const characterReward = completion.gameXpDelta > 0 ? ` · +${completion.gameXpDelta} Character EXP` : ''
    setNotice(`Task completed · +${completion.quest.xpReward} Work XP${characterReward} · ${completion.boss?.name || 'Sprint Boss'} -${completion.quest.bossDamage} HP`)
    setRefreshKey((value) => value + 1)
  }

  const answerChallenge = (answer: number) => {
    if (challengeAnswer !== null) return
    setChallengeAnswer(answer)
    if (answer === currentChallenge.answer) setChallengeXp((value) => value + 40)
    window.setTimeout(() => { setChallengeIndex((value) => (value + 1) % miniGameQuestions.length); setChallengeAnswer(null) }, 850)
  }

  const startTagGame = () => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game?.network) {
      setError('Chưa kết nối tới phòng realtime.')
      return
    }
    game.network.startTagGame()
    setNotice('Đã mở game mới và điểm danh những người đang ở Studio Commons.')
    setOpen(false)
  }

  const startSelectedMiniGame = () => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game?.network) {
      setError('Chưa kết nối tới phòng realtime.')
      return
    }
    game.network.startMiniGame(selectedMiniGameMode)
    const selectedDefinition = MINI_GAME_MODES.find((definition) => definition.id === selectedMiniGameMode)
    setNotice(`Đã mở ${selectedDefinition?.name || 'mini game'} và điểm danh ${selectedDefinition?.category === 'CARD_ROOM' ? 'VIP Games' : 'Studio Commons'}.`)
    setOpen(false)
  }

  const openCasinoTable = (mode: MiniGameMode) => {
    const definition = MINI_GAME_MODES.find((candidate) => candidate.id === mode)
    setOpen(false)
    phaserEvents.emit(Event.GAME_TABLE_OPEN, {
      id: `hub-${mode.toLowerCase()}`,
      label: definition?.name || mode,
      gameMode: mode,
    })
  }

  const claimDailyReward = async () => {
    if (!authToken) return
    try {
      const reward = await studioApi.claimDailySocialReward(authToken)
      dispatch(applySocialReward(reward))
      setNotice(reward.duplicate ? 'Daily reward đã nhận rồi.' : `Daily reward · +${reward.coinDelta} Coin · +${reward.gameXpDelta} Character EXP`)
      setRefreshKey((value) => value + 1)
    } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể nhận daily reward.') }
  }

  const renderMiniGameLaunchPad = () => {
    const gameActive = miniGame.status === 'COUNTDOWN' || miniGame.status === 'PLAYING'
    const selectedDefinition = MINI_GAME_MODES.find((definition) => definition.id === selectedMiniGameMode)
    const selectedCasino = Boolean(selectedDefinition && (CASINO_GAME_MODES as readonly string[]).includes(selectedDefinition.id))
    return <>
      <PageTitle kicker="STUDIO LIFE / MINI GAME HUB" title={selectedCasino ? 'Live dealer luôn hoạt động' : 'Chọn game để mở'} subtitle={selectedCasino ? 'Không báo danh, không chờ Admin. Mở popup bàn đã chọn và chơi bất kỳ lúc nào.' : 'Game vận động tại Studio Commons vẫn dùng lượt nhóm; các bàn betting phía trên chạy tự động 24/7.'} action={selectedCasino ? 'Mở bàn chơi' : gameActive ? 'Game đang chạy' : canStartTagGame ? 'Mở game tại Commons' : 'Chỉ Admin mở game'} onAction={selectedCasino ? () => openCasinoTable(selectedMiniGameMode) : !gameActive && canStartTagGame ? startSelectedMiniGame : undefined} />
      <section className="studio-card studio-mini-game-launcher">
        <div className="studio-mini-game-select"><label>PLAY WING / LIVE TABLE<select value={selectedMiniGameMode} disabled={gameActive && !selectedCasino} onChange={(event) => setSelectedMiniGameMode(event.target.value as MiniGameMode)}>{MINI_GAME_MODES.map((definition) => <option value={definition.id} key={definition.id}>{(CASINO_GAME_MODES as readonly string[]).includes(definition.id) ? '● LIVE ' : definition.category === 'CARD_ROOM' ? '♠ ' : '✦ '}{definition.name}</option>)}</select></label><div><strong>{selectedDefinition?.icon} {selectedDefinition?.name}</strong><p>{selectedCasino ? 'Dealer AI tự chia vòng, khóa cược, mở kết quả và trả Coin liên tục.' : selectedDefinition?.description}</p></div></div>
        <div className="studio-mini-game-grid">{MINI_GAME_MODES.map((definition) => { const casino = (CASINO_GAME_MODES as readonly string[]).includes(definition.id); return <button className={selectedMiniGameMode === definition.id ? 'selected' : ''} disabled={!casino && (gameActive || !canStartTagGame)} onClick={() => setSelectedMiniGameMode(definition.id)} key={definition.id}><span>{definition.icon}</span><strong>{definition.name}</strong><small>{casino ? '● LIVE 24/7' : definition.category === 'CARD_ROOM' ? 'TABLE / MACHINE' : 'COMMONS ROUND'}</small></button> })}</div>
        <small className="studio-mini-game-note">Baccarat, Blackjack, Texas Hold’em, Sic Bo và Bầu Cua chạy song song trên server. Mở popup bàn hoặc đứng gần bàn/máy trong map rồi nhấn E.</small>
      </section>
    </>
  }

  const renderLiveMiniGame = () => {
    const gameActive = tagGame.status === 'COUNTDOWN' || tagGame.status === 'PLAYING'
    const actionLabel = gameActive ? 'Game đang chạy' : canStartTagGame ? 'Mở game & điểm danh' : 'Chỉ Admin có thể mở game'
    return <>
      <PageTitle kicker="STUDIO LIFE / STUDIO COMMONS GAME" title="Đuổi bắt đổi vai" subtitle="Game trực tiếp trong Studio Commons. Di chuyển bằng WASD, chạm người khác để đổi vai Người bắt." action={actionLabel} onAction={!gameActive && canStartTagGame ? startTagGame : undefined} />
      <section className="studio-card studio-live-game-card">
        <div className="studio-live-game-copy">
          <span className="studio-kicker">LIVE FEATURE / ATTENDANCE</span>
          <h2>Chạy đi, Người bắt đến rồi!</h2>
          <p>Admin mở một lượt mới sẽ tự động điểm danh những người đang ở Studio Commons. Game bắt đầu sau 3 giây và kéo dài 60 giây.</p>
          <div className="studio-live-game-actions">
            {canStartTagGame && <button className="studio-primary" disabled={gameActive} onClick={startTagGame}>{gameActive ? 'Đang diễn ra…' : 'Mở game mới & điểm danh'}</button>}
            {!canStartTagGame && <span className="studio-game-permission">Chỉ Owner hoặc Admin mới có quyền mở game.</span>}
          </div>
        </div>
        <div className="studio-live-game-art"><span>⚡</span><strong>{tagGame.status === 'IDLE' ? 'READY' : tagGame.status}</strong><small>{tagGame.attendees.length} người đã điểm danh</small></div>
      </section>
      <div className="studio-live-game-details">
        <section className="studio-card studio-game-rules">
          <div className="studio-card-header"><h3>Luật chơi</h3><span>WASD + proximity</span></div>
          <p>1 người được chọn làm Người bắt.</p>
          <p>Chạm người khác để chuyển vai.</p>
          <p>Hết 60 giây, lượt chơi kết thúc.</p>
          <p>Không loại người chơi, không ảnh hưởng XP công việc.</p>
        </section>
        <section className="studio-card studio-attendance-card">
          <div className="studio-card-header"><h3>Điểm danh lượt hiện tại</h3><span>{tagGame.attendees.length} người</span></div>
          {tagGame.attendees.length === 0 ? <p className="studio-empty-note">Chưa có lượt game nào đang mở.</p> : <div className="studio-attendance-list">{tagGame.attendees.map((attendee) => <span className={attendee.connected ? '' : 'is-offline'} key={attendee.sessionId}>{attendee.displayName}{attendee.connected ? '' : ' · offline'}</span>)}</div>}
        </section>
      </div>
    </>
  }

  const createMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authToken || !newMemberName.trim() || !newMemberEmail.trim()) return
    try {
      const result = await studioApi.register(authToken, { displayName: newMemberName.trim(), username: newMemberUsername.trim().toLowerCase(), email: newMemberEmail.trim(), role: newMemberRole, password: newMemberPassword || undefined, avatarUrl: newMemberAvatarUrl.trim() || undefined })
      setNotice(`Đã tạo account cho ${result.user.displayName}. Password tạm thời: ${result.temporaryPassword}`)
      setNewMemberName(''); setNewMemberUsername(''); setNewMemberEmail(''); setNewMemberRole('PRODUCER'); setNewMemberPassword(''); setNewMemberAvatarUrl(''); setInviteOpen(false); setRefreshKey((value) => value + 1)
    } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tạo account.') }
  }

  const beginMemberEdit = (member: MemberView) => {
    setEditingMemberId(member.id)
    setEditMemberName(member.displayName)
    setEditMemberRole(member.role)
    setEditMemberAvatarUrl(member.avatarUrl || '')
    setEditMemberPassword('')
  }

  const cancelMemberEdit = () => {
    setEditingMemberId('')
    setEditMemberName('')
    setEditMemberRole('MEMBER')
    setEditMemberAvatarUrl('')
    setEditMemberPassword('')
  }

  const updateMember = async (event: React.FormEvent<HTMLFormElement>, memberId: string) => {
    event.preventDefault()
    if (!authToken || !editMemberName.trim()) return
    try {
      const result = await studioApi.updateMember(authToken, memberId, { displayName: editMemberName.trim(), role: editMemberRole, avatarUrl: editMemberAvatarUrl.trim(), password: editMemberPassword || undefined })
      if (authUser?.id === memberId) dispatch(setDisplayName(result.user.displayName))
      setNotice(`Đã cập nhật hồ sơ ${result.user.displayName}.`)
      cancelMemberEdit()
      setRefreshKey((value) => value + 1)
    } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể cập nhật thành viên.') }
  }

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authToken || !newProjectName.trim()) return
    try {
      const project = await studioApi.createProject(authToken, { name: newProjectName.trim(), description: newProjectDescription.trim() })
      setNotice(`Đã tạo project “${project.name}”.`)
      setNewProjectName('')
      setNewProjectDescription('')
      setProjectCreateOpen(false)
      setRefreshKey((value) => value + 1)
    } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tạo project.') }
  }

  const createResource = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authToken || !newResourceTitle.trim() || !newResourceUrl.trim()) return
    try {
      const resource = await studioApi.createResource(authToken, { title: newResourceTitle.trim(), kind: newResourceKind, url: newResourceUrl.trim(), description: newResourceDescription.trim(), tags: newResourceTags.split(',').map((tag) => tag.trim()).filter(Boolean) })
      setResourceItems((current) => [resource, ...current])
      setNewResourceTitle('')
      setNewResourceUrl('')
      setNewResourceDescription('')
      setNewResourceTags('')
      setNewResourceKind('LINK')
      setResourceCreateOpen(false)
      setNotice(`Đã share resource “${resource.title}” cho studio.`)
    } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể share resource.') }
  }

  const renderDashboard = () => <>
    <section className="studio-welcome-card"><div className="studio-welcome-copy"><span className="studio-kicker">YOUR STUDIO QUEST / ACTIVE CHAPTER</span><h2>Ship the idea.<br /><em>Level up the studio.</em></h2><p>{snapshot?.activeSprint ? `${snapshot.activeSprint.name} đang ở ${snapshot.activeSprint.progress}% completion.` : 'Pixel đang chuẩn bị workspace cho sprint đầu tiên.'} Mỗi task nhỏ giúp team tiến gần hơn tới một game tuyệt vời.</p><div className="studio-actions"><button className="studio-primary" onClick={() => navigate('tasks')}>Open task board <span>→</span></button><button className="studio-ghost-link" onClick={() => navigate('world')}>Enter pixel studio ↗</button></div></div><div className="studio-pixel-stage"><div className="studio-orbit" /><div className="studio-speech">{snapshot?.boss ? `${snapshot.boss.currentHp.toLocaleString()} HP` : 'SYNCING'}</div><img src={Adam} alt="Pixel studio guide" /><span>PIXEL / studio guide</span></div></section>
    <div className="studio-stat-row"><div><span>SPRINT PROGRESS</span><strong>{snapshot?.activeSprint?.progress ?? 0}<small>%</small></strong><em>{completedTasks}/{activeSprintTasks.length || 0} tasks done</em></div><div><span>PERSONAL XP</span><strong>{snapshot?.personalProgress.xp.toLocaleString() ?? '—'}</strong><em>Level {snapshot?.personalProgress.level ?? 1}</em></div><div><span>STUDIO XP</span><strong>{snapshot?.studio.xp.toLocaleString() ?? '—'}</strong><em className="orange-text">Level {snapshot?.studio.level ?? 1}</em></div><div><span>ONLINE MEMBERS</span><strong>{snapshot?.onlineMembers.length ?? 0}</strong><em className="purple-text">Live in studio</em></div></div>
    <section className="studio-boss-banner"><div><span className="studio-kicker">SPRINT BOSS · {snapshot?.activeSprint?.name || 'Current chapter'}</span><h3>{snapshot?.boss?.name || 'Release Dragon'}</h3><p>{snapshot?.boss?.status || 'Loading'} · Task completion damages the boss.</p></div><div className="studio-boss-hp"><strong>{snapshot?.boss?.currentHp.toLocaleString() || '—'} <small>/ {snapshot?.boss?.maxHp.toLocaleString() || '—'} HP</small></strong><ProgressBar value={bossProgress} /><span>{snapshot?.activeSprint?.progress ?? 0}% sprint progress</span></div></section>
    <div className="studio-column-grid"><section className="studio-card"><div className="studio-card-header"><h3>Project pulse</h3><button onClick={() => navigate('projects')}>View all →</button></div><div className="studio-project-list">{(snapshot?.projects || []).map((project, index) => <div className="studio-project-row" key={project.id}><span className={`studio-game-icon game-${['purple', 'yellow', 'blue', 'green'][index % 4]}`}>{project.name[0]}</span><div className="studio-project-name"><strong>{project.name}</strong><small>{project.status}</small></div><div className="studio-stage"><strong>{project.progress}% complete</strong><small>{project.status === 'ACTIVE' ? 'Active project' : 'Next project'}</small></div><div className="studio-project-progress"><ProgressBar value={project.progress} /><small>{project.progress}%</small></div><span className={`studio-health ${project.progress >= 70 ? 'green' : project.progress >= 40 ? 'yellow' : 'red'}`}><i />{project.progress >= 70 ? 'On track' : project.progress >= 40 ? 'Attention' : 'At risk'}</span></div>)}</div></section><section className="studio-card studio-mission-card"><div className="studio-card-header"><h3>Current quests</h3><span className="studio-xp-label">{snapshot?.quests.filter((quest) => !quest.completed).length || 0} open</span></div><div className="studio-missions">{snapshot?.quests.filter((quest) => !quest.completed).slice(0, 3).map((quest) => { const task = tasks.find((item) => item.id === quest.taskId); return <div className="studio-mission-row" key={quest.id}><span className="mission-checkbox">✦</span><div><strong>{task?.title || quest.taskId}</strong><small>{quest.questType} quest · {quest.bossDamage} boss damage</small></div><button className="studio-claim" onClick={() => navigate('tasks')}>OPEN</button></div> })}</div><button className="studio-secondary full" onClick={() => navigate('quests')}>Open quest board →</button></section></div>
    <div className="studio-bottom-grid"><section className="studio-card studio-activity-card"><div className="studio-card-header"><h3>Recent activity</h3><span>Live domain events</span></div>{(snapshot?.activity || []).slice(0, 4).map((event) => <div className="studio-activity" key={event.id}><span className="studio-event-icon">{event.type === 'BOSS_DEFEATED' ? '♛' : event.type === 'TASK_COMPLETED' ? '✓' : '✦'}</span><p><strong>{event.message}</strong><small>{event.type} · {new Date(event.createdAt).toLocaleString()}</small></p></div>)}</section><section className="studio-card"><div className="studio-card-header"><h3>Team presence</h3><button onClick={() => navigate('world')}>Open world →</button></div>{liveMembers.slice(0, 4).map((member, index) => <div className="studio-rank-row" key={member.id}><Avatar member={memberAvatar(member, index)} /><div><strong>{member.displayName}</strong><small>{roleLabel(member.role)} · {studioRoomName(member.currentRoom || 'LOBBY')}</small></div><b className={member.online ? 'online-label' : 'offline-label'}>{member.online ? 'ONLINE' : 'OFFLINE'}</b></div>)}</section></div>
  </>

  const renderProjects = () => <><PageTitle kicker="WORKSPACE / PROJECTS" title="Project control tower" subtitle="Mọi game, mọi gate, cùng một nhịp nhìn." action="+ New project" onAction={() => setProjectCreateOpen((value) => !value)} />{projectCreateOpen && <form className="studio-project-create" onSubmit={createProject}><label>Project name<input required autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Ví dụ: Baccarat Bloom" /></label><label>Description<input value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="Mục tiêu và scope của project" /></label><button className="studio-primary" type="submit">Create project →</button></form>}<section className="studio-card studio-table-card"><div className="studio-filter-row"><button className="studio-filter active">All lifecycle</button><button className="studio-filter">Active</button><button className="studio-filter">Planning</button><span className="studio-table-note">{snapshot?.projects.length || 0} projects · progress tính từ task thật</span></div><div className="studio-table"><div className="studio-table-head"><span>PROJECT</span><span>STATUS</span><span>DESCRIPTION</span><span>HEALTH</span><span>PROGRESS</span></div>{(snapshot?.projects || []).map((project, index) => <div className="studio-table-row" key={project.id}><div className="studio-table-game"><span className={`studio-game-icon game-${['purple', 'yellow', 'blue', 'green'][index % 4]}`}>{project.name[0]}</span><div><strong>{project.name}</strong><small>{project.id}</small></div></div><span>{project.status}<small>{project.status === 'ACTIVE' ? 'Current project' : 'Queued'}</small></span><span>{project.description}</span><span className={`studio-health ${project.progress >= 70 ? 'green' : project.progress >= 40 ? 'yellow' : 'red'}`}><i />{project.progress >= 70 ? 'On track' : project.progress >= 40 ? 'Attention' : 'At risk'}</span><div className="studio-table-progress"><ProgressBar value={project.progress} /><small>{project.progress}% complete</small></div></div>)}</div></section></>

  const renderResources = () => <><PageTitle kicker="KNOWLEDGE BASE / RESOURCES" title="Resource hub" subtitle="Share link, GDD, build evidence và art reference trong cùng một nơi." action="+ Add resource" onAction={() => setResourceCreateOpen((value) => !value)} />{resourceCreateOpen && <form className="studio-project-create" onSubmit={createResource}><label>Title<input required autoFocus value={newResourceTitle} onChange={(event) => setNewResourceTitle(event.target.value)} placeholder="Ví dụ: Baccarat math sheet" /></label><label>URL<input required type="url" value={newResourceUrl} onChange={(event) => setNewResourceUrl(event.target.value)} placeholder="https://..." /></label><label>Kind<select value={newResourceKind} onChange={(event) => setNewResourceKind(event.target.value)}><option value="LINK">Link</option><option value="DOC">Doc / GDD</option><option value="BUILD">Build / QA</option><option value="ASSET">Art / Asset</option></select></label><label>Tags<input value={newResourceTags} onChange={(event) => setNewResourceTags(event.target.value)} placeholder="design, qa, table-game" /></label><button className="studio-primary" type="submit">Share resource →</button></form>}<div className="studio-resource-toolbar"><div className="studio-search-field">⌕ <input placeholder="Search concept, game, tag..." /></div><button className="studio-secondary" onClick={() => setAiReply('AI search sẽ tìm theo project, version, gate và permission khi kết nối provider tài nguyên.')}>✦ Ask Pixel</button></div><div className="studio-resource-grid">{resourceItems.map((resource) => <article className="studio-resource-card" key={resource.id}><div className="studio-resource-icon">{resource.kind === 'ASSET' ? '✣' : resource.kind === 'BUILD' ? '⌁' : resource.kind === 'DOC' ? '✎' : '▤'}</div><span>{resource.kind} · {resource.tags.join(' · ') || 'SHARED'}</span><h3>{resource.title}</h3><p>{resource.description || 'Shared studio resource.'}</p><a href={resource.url} target="_blank" rel="noreferrer">Open ↗</a></article>)}</div></>

  const renderIdeas = () => <><PageTitle kicker="CREATIVE ENGINE / IDEAS" title="Brainstorm Lab" subtitle="Từ một tia sáng đến một concept có thể ship." action="+ Idea card" /><div className="studio-idea-layout"><section className="studio-card studio-idea-composer"><span className="studio-kicker">AI CONCEPT GENERATOR</span><h2>What should we make next?</h2><p>Viết một constraint, một fantasy hoặc chỉ một câu hỏi. Pixel sẽ giúp team mở rộng hướng đi.</p><textarea value={ideaPrompt} onChange={(event) => setIdeaPrompt(event.target.value)} placeholder="Ví dụ: Một side bet cho baccarat, session ngắn, scope art thấp..." /><div className="studio-idea-suggestions"><button onClick={() => setIdeaPrompt('Một mechanic mới cho table game có social moment')}>+ Social mechanic</button><button onClick={() => setIdeaPrompt('Một side bet dễ hiểu, volatility vừa, art budget thấp')}>+ Low-scope side bet</button><button onClick={() => setIdeaPrompt('Một progression loop giữ người chơi quay lại mỗi ngày')}>+ Daily progression</button></div><button className="studio-primary" onClick={generateIdea}>✦ Generate concept</button>{ideaDraft && <div className="studio-generated-idea"><span>NEW IDEA</span><h3>{ideaDraft.title}</h3><p>{ideaDraft.summary}</p><ul>{ideaDraft.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul><button className="studio-ghost-link" onClick={() => navigate('tasks')}>Turn into task →</button></div>}</section><aside className="studio-card studio-prompt-card"><h3>Prompt library</h3><button onClick={() => setIdeaPrompt('Hãy đề xuất 3 hướng revamp cho một roulette game đang có retention thấp')}><b>01</b><span>Revamp game đang có retention thấp</span></button><button onClick={() => setIdeaPrompt('Tạo một bonus round cho baccarat, không làm chậm core loop')}><b>02</b><span>Bonus round không làm chậm core loop</span></button><button onClick={() => setIdeaPrompt('So sánh 3 hướng art cho table game premium, dễ localize')}><b>03</b><span>Art direction cho table game premium</span></button></aside></div></>

  const renderQuests = () => <><PageTitle kicker="STUDIO LIFE / QUESTS" title="Quest board" subtitle="Task status được chuyển thành quest type và boss damage." action="Open task board" onAction={() => navigate('tasks')} /><div className="studio-quest-layout"><section className="studio-quest-list">{(snapshot?.quests || []).map((quest) => { const task = tasks.find((item) => item.id === quest.taskId); return <article className={`studio-quest-card ${quest.completed ? 'quest-complete' : ''}`} key={quest.id}><div className="studio-quest-icon">{quest.questType === 'ELITE' ? '⚡' : quest.questType === 'MAIN' ? '♛' : '✦'}</div><div><h3>{task?.title || quest.taskId}</h3><p>{quest.questType} quest · {quest.completed ? 'Rewards claimed' : 'Open in Task Board'}</p><ProgressBar value={quest.completed ? 100 : task?.status === 'IN_PROGRESS' ? 50 : task?.status === 'REVIEW' ? 80 : 0} /></div><strong>+{quest.xpReward} XP<small>{quest.bossDamage} dmg</small></strong><button onClick={() => navigate('tasks')}>{quest.completed ? 'DONE' : 'OPEN'}</button></article> })}</section><aside className="studio-streak-card"><span className="studio-kicker">TEAM PROGRESSION</span><h2>{snapshot?.studio.level ? `Level ${snapshot.studio.level}` : 'Level 1'}</h2><p>Studio unlocks dựa trên Studio XP, không xếp hạng hiệu suất cá nhân.</p><div className="studio-streak-dots">{Array.from({ length: 7 }, (_, index) => <i className={index <= (snapshot?.studio.level || 1) ? 'active' : ''} key={index} />)}</div><div className="studio-chest"><span>✦</span><div><strong>Next studio unlock</strong><small>{snapshot?.studio.xpToNextLevel || 1000} XP threshold</small></div></div></aside></div></>

  const renderWorld = () => {
    const workRooms = studioRoomZones.filter((zone) => zone.group === 'WORK')
    const playRooms = studioRoomZones.filter((zone) => zone.group === 'PLAY')
    const renderRoom = (zone: typeof studioRoomZones[number]) => {
      const members = liveMembers.filter((member) => member.currentRoom === zone.id).length
      const access = zone.accessPoints.slice(0, 3).join(' · ')
      const extraAccess = zone.accessPoints.length > 3 ? ` · +${zone.accessPoints.length - 3}` : ''
      return <article className={`studio-map-room room-${zone.id.toLowerCase()}`} key={zone.id}><span className="studio-map-room-kicker">{zone.id === 'LOBBY' ? 'RECEPTION' : zone.group === 'PLAY' ? 'SOCIAL ACCESS' : 'WORK ACCESS'}</span><strong>{zone.name}</strong><small>{zone.subtitle}</small><em>{access}{extraAccess}</em><b>{members} online · WALK TO ENTER</b></article>
    }
    return <><PageTitle kicker="WORLD / STUDIO DIRECTORY" title="Studio world" subtitle="Các phòng được gom theo tuyến đi bộ: Work Wing ở phía trái, Play Wing ở phía phải." action="Close hub" onAction={() => setOpen(false)} /><div className="studio-world-layout"><section className="studio-card studio-world-map"><div className="studio-world-map-heading"><span>01 · WORK WING</span><small>6 rooms · daily work & studio operations</small></div><div className="studio-map-grid studio-map-grid-work">{workRooms.map(renderRoom)}</div><div className="studio-world-map-heading"><span>02 · PLAY WING</span><small>3 rooms · social entertainment</small></div><div className="studio-map-grid studio-map-grid-play">{playRooms.map(renderRoom)}</div><div className="studio-world-wayfinding"><strong>WALKING ROUTE</strong><span>Studio Commons → People Ops → Social Connector → Play Wing</span></div><div className="studio-world-legend"><span><i className="legend-online" /> Online presence</span><span><i className="legend-unlock" /> Đi bộ tới phòng rồi nhấn E tại điểm tương tác</span></div></section><aside className="studio-card studio-world-people"><div className="studio-card-header"><h3>Live presence</h3><span>{snapshot?.onlineMembers.length || 0} online</span></div>{liveMembers.map((member, index) => <div className="studio-world-person" key={member.id}><Avatar member={memberAvatar(member, index)} /><div><strong>{member.displayName}</strong><small>{roleLabel(member.role)}</small></div><span className={member.online ? 'online-label' : 'offline-label'}>{member.online ? studioRoomName(member.currentRoom || 'LOBBY') : 'OFFLINE'}</span></div>)}</aside></div></>
  }

  const renderCardRoom = () => {
    const cardGames = [
      { mode: 'BACCARAT' as MiniGameMode, icon: '♣', name: 'Live Baccarat', detail: 'Player 1:1 · Banker 0.95:1 · Tie 8:1', enabled: true },
      { mode: 'BLACKJACK' as MiniGameMode, icon: '🂡', name: 'Classic Blackjack', detail: 'Hit · Stand · Double · Blackjack 3:2', enabled: true },
      { mode: 'POKER' as MiniGameMode, icon: '♣', name: "Texas Hold'em", detail: 'No-Limit 4 ghế · Blind 5/10 · 3 bot chiến thuật', enabled: true },
      { mode: 'SICBO' as MiniGameMode, icon: '🎲', name: 'Sic Bo', detail: 'Big/Small · totals · triples · single dice', enabled: true },
      { mode: 'BAU_CUA' as MiniGameMode, icon: '🦀', name: 'Bầu Cua Tôm Cá', detail: '6 linh vật · trả theo số mặt trúng', enabled: true },
      { mode: 'CHESS' as MiniGameMode, icon: '♜', name: 'Bàn cờ 1v1', detail: `Cược ${MINI_GAME_CARD_RULES.CHESS.cost} coin · thắng trả ${MINI_GAME_CARD_RULES.CHESS.winPayout}`, enabled: true },
      { mode: 'TIEN_LEN' as MiniGameMode, icon: '🃏', name: 'Tiến Lên Miền Nam', detail: '3 bot chiến thuật hoặc bàn chờ 2–4 người · không cược Coin', enabled: true },
      { mode: 'DICE_DUEL' as MiniGameMode, icon: '♦', name: 'Dice duel', detail: `Cược ${MINI_GAME_CARD_RULES.DICE_DUEL.cost} coin · thắng trả ${MINI_GAME_CARD_RULES.DICE_DUEL.winPayout}`, enabled: SOCIAL_MVP_GAME_MODES.includes('DICE_DUEL') },
      { mode: 'LUCKY_DRAW' as MiniGameMode, icon: '★', name: 'Lucky draw', detail: `Cược ${MINI_GAME_CARD_RULES.LUCKY_DRAW.cost} coin · tối đa ${Math.max(...MINI_GAME_CARD_RULES.LUCKY_DRAW.rewards)}`, enabled: true },
    ]
    return <section className="studio-card studio-card-room-card"><div className="studio-card-room-head"><div><span className="studio-kicker">TABLE GAMES / ALWAYS-ON FLOOR</span><h2>Play Lounge · Live 24/7</h2><p>Các dealer table chạy song song theo luật riêng. Không cần Admin mở ván hay điểm danh; chọn bàn là vào chơi ngay.</p></div><span className="studio-card-room-mark">●</span></div><div className="studio-card-room-games">{cardGames.map((cardGame) => { const live = (CASINO_GAME_MODES as readonly string[]).includes(cardGame.mode); return <button className={`studio-card-room-game ${selectedMiniGameMode === cardGame.mode ? 'selected' : ''} ${cardGame.enabled ? '' : 'is-locked'}`} disabled={!cardGame.enabled} onClick={() => { setSelectedMiniGameMode(cardGame.mode); if (live) openCasinoTable(cardGame.mode) }} key={cardGame.mode}><b>{cardGame.enabled ? cardGame.icon : '🔒'}</b><strong>{cardGame.name}</strong><small>{cardGame.detail}</small><em>{!cardGame.enabled ? 'MILESTONE SAU' : live ? '● DEALER LIVE · ENTER' : 'MÁY / BÀN RIÊNG'}</em></button> })}</div><small className="studio-card-room-note">Coin chỉ là tiền tệ ảo trong game, không có nạp/rút hay quy đổi tiền thật.</small></section>
  }

  const renderMiniGame = () => <><PageTitle kicker="STUDIO LIFE / DAILY MINI GAME" title="Mechanic Sprint" subtitle="3 câu hỏi production. XP cá nhân chỉ là phần thưởng phụ." action={`+${challengeXp} XP`} /><div className="studio-minigame-layout"><section className="studio-card studio-game-card"><span className="studio-kicker">DAILY CHALLENGE {challengeIndex + 1} / 3</span><h2>Ship sense check</h2><p>Chọn action đúng nhất cho tình huống production.</p><div className="studio-game-progress">{[0, 1, 2].map((index) => <i className={index <= challengeIndex ? 'active' : ''} key={index} />)}</div><div className="studio-challenge"><span className="studio-kicker">SCENARIO</span><h3>{currentChallenge.title}</h3><div className="studio-game-options">{currentChallenge.options.map((option, index) => <button className={challengeAnswer === currentChallenge.answer && index === currentChallenge.answer ? 'correct' : challengeAnswer === index ? 'wrong' : ''} disabled={challengeAnswer !== null} onClick={() => answerChallenge(index)} key={option}>{option}</button>)}</div><small>{challengeAnswer === null ? 'Chọn một đáp án để nhận XP' : challengeAnswer === currentChallenge.answer ? 'Đúng rồi. Production instinct +40 XP.' : 'Đáp án xanh là lựa chọn tốt nhất.'}</small></div></section><aside className="studio-game-side"><section className="studio-card"><div className="studio-card-header"><h3>Today’s reward</h3><span>OPTIONAL</span></div><div className="studio-game-reward"><b>✦</b><strong>{challengeXp} XP</strong></div><p>Mini game không ảnh hưởng task/boss business logic.</p></section><section className="studio-card studio-game-rules"><h3>How to play</h3><p>Chọn một đáp án cho mỗi scenario.</p><p>Đúng nhận XP local cho phiên hiện tại.</p><p>Task completion mới damage Sprint Boss.</p></section></aside></div></>

  const renderRewards = () => <><PageTitle kicker="STUDIO LIFE / REWARDS" title="Studio unlocks" subtitle="Progression tập thể, cosmetic rewards và world upgrades." action="Play mini game" onAction={() => navigate('minigame')} /><div className="studio-reward-layout"><section className="studio-badge-grid">{[{ icon: '♨', name: 'Chapter Starter', detail: 'Studio Level 1', tone: 'orange', unlock: true }, { icon: '✦', name: 'Idea Machine', detail: 'Brainstorm Lab online', tone: '', unlock: true }, { icon: '✓', name: 'Gate Keeper', detail: 'Task → quest pipeline', tone: 'purple', unlock: true }, { icon: '♛', name: 'QA Trophy', detail: 'Studio Level 3', tone: 'blue', unlock: (snapshot?.studio.level || 1) >= 3 }, { icon: '◈', name: 'Arcade Machine', detail: 'Studio Level 4', tone: 'purple', unlock: (snapshot?.studio.level || 1) >= 4 }, { icon: '⚡', name: 'Trophy Room', detail: 'Studio Level 5', tone: 'orange', unlock: (snapshot?.studio.level || 1) >= 5 }].map((badge) => <article className={`studio-badge-card ${badge.unlock ? '' : 'locked'}`} key={badge.name}><span className={`studio-badge-art ${badge.tone}`}>{badge.icon}</span><h3>{badge.name}</h3><p>{badge.detail}</p><b>{badge.unlock ? 'UNLOCKED' : 'LOCKED'}</b></article>)}</section><section className="studio-card studio-level-card"><h3>Studio progression</h3><div className="studio-level-row"><strong>{String(snapshot?.studio.level || 1).padStart(2, '0')}</strong><div><b>{snapshot?.studio.name || 'RNG Game Studio'}</b><small>{snapshot?.studio.xp || 0} / {snapshot?.studio.xpToNextLevel || 1000} Studio XP</small></div></div><ProgressBar value={(snapshot?.studio.xp || 0) / (snapshot?.studio.xpToNextLevel || 1000) * 100} /><div className="studio-profile-stats"><div><strong>{snapshot?.members.length || 0}</strong><small>members</small></div><div><strong>{snapshot?.projects.length || 0}</strong><small>projects</small></div><div><strong>{snapshot?.quests.filter((quest) => quest.completed).length || 0}</strong><small>quests done</small></div><div><strong>{snapshot?.studio.level || 1}</strong><small>studio level</small></div></div></section></div></>

  const renderRanking = () => <><PageTitle kicker="STUDIO LIFE / SCOREBOARD" title="Studio scoreboard" subtitle="Theo dõi collective progress, không xếp hạng nhân viên." action="Open quests" onAction={() => navigate('quests')} /><div className="studio-ranking-layout"><section className="studio-card studio-ranking-card"><div className="studio-card-header"><h3>Current chapter · {snapshot?.activeSprint?.name || '—'}</h3><span>{completedTasks}/{activeSprintTasks.length || 0} tasks done</span></div><div className="studio-scoreboard-row"><div><span>PROJECT PROGRESS</span><strong>{activeProject?.progress || 0}%</strong><ProgressBar value={activeProject?.progress || 0} /></div><div><span>BOSS HP REMAINING</span><strong>{snapshot?.boss?.currentHp.toLocaleString() || '—'}</strong><ProgressBar value={bossProgress} tone="orange" /></div></div><div className="studio-team-goal"><span className="studio-kicker">TEAM GOAL</span><h3>Defeat {snapshot?.boss?.name || 'the Sprint Boss'}</h3><p>{snapshot?.boss?.currentHp || 0} HP remaining · mọi completion đều được broadcast cho connected clients.</p><button className="studio-primary" onClick={() => navigate('tasks')}>Continue shipping →</button></div></section><aside className="studio-rank-banner"><span className="studio-kicker">STUDIO LEVEL</span><h2>{snapshot?.studio.level || 1}</h2><p>{snapshot?.studio.xp || 0} Studio XP. Next unlock tại {snapshot?.studio.xpToNextLevel || 1000} XP.</p><div className="studio-current-rank"><span className="studio-event-icon">✦</span><div><strong>Shared progression</strong><small>Team wins together</small></div></div></aside></div></>

  const renderTeam = () => <><div className="studio-page-title"><div><span className="studio-kicker">WORKSPACE / PEOPLE</span><h2>Studio team</h2><p>Tài khoản, role, avatar và presence của từng thành viên.</p></div><div className="studio-team-actions">{canManageStudio && <button className="studio-primary" onClick={() => setInviteOpen((value) => !value)}>+ Create account</button>}<button className="studio-ghost-link" onClick={() => dispatch(clearAuthSession())}>Sign out</button></div></div>{inviteOpen && canManageStudio && <form className="studio-invite-form" onSubmit={createMember}><label>Full name<input required value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} placeholder="Tên thành viên" /></label><label>Username<input required pattern="[a-z0-9][a-z0-9._-]{1,31}" value={newMemberUsername} onChange={(event) => setNewMemberUsername(event.target.value.toLowerCase())} placeholder="username" /></label><label>Studio email<input required type="email" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="member@studio.local" /></label><label>Password<input type="password" minLength={12} value={newMemberPassword} onChange={(event) => setNewMemberPassword(event.target.value)} placeholder="Tối thiểu 12 ký tự; bỏ trống để sinh tự động" /></label><label>Role<select value={newMemberRole} onChange={(event) => setNewMemberRole(event.target.value)}><option value="ADMIN">Administrator</option><option value="PRODUCER">Producer</option><option value="GAME_DESIGNER">Game Designer</option><option value="ARTIST">Artist</option><option value="DEVELOPER">Developer</option><option value="QA">QA</option><option value="MEMBER">Member</option></select></label><label>Avatar image URL<input type="url" value={newMemberAvatarUrl} onChange={(event) => setNewMemberAvatarUrl(event.target.value)} placeholder="https://.../avatar.png" /></label><button className="studio-primary" type="submit">Create account →</button></form>}<div className="studio-team-layout"><section className="studio-card studio-team-card"><div className="studio-card-header"><h3>All members · {liveMembers.length}</h3><span>{snapshot?.onlineMembers.length || 0} online now</span></div>{liveMembers.map((member, index) => <React.Fragment key={member.id}><div className="studio-team-row"><Avatar member={memberAvatar(member, index)} /><div><strong>{member.displayName}</strong><small>{member.username ? `@${member.username} · ` : ''}{roleLabel(member.role)}</small></div><span>{member.email}</span><i className={member.online ? '' : 'offline'} />{member.online ? 'ONLINE' : 'OFFLINE'}{canEditMembers && <button className="studio-team-edit" type="button" onClick={() => beginMemberEdit(member)}>Edit</button>}</div>{editingMemberId === member.id && canEditMembers && <form className="studio-member-edit-form" onSubmit={(event) => updateMember(event, member.id)}><label>Full name<input required value={editMemberName} onChange={(event) => setEditMemberName(event.target.value)} /></label><label>Role<select value={editMemberRole} disabled={member.role === 'OWNER'} onChange={(event) => setEditMemberRole(event.target.value as StudioRole)}><option value="OWNER">Owner (locked)</option><option value="ADMIN">Administrator</option><option value="PRODUCER">Producer</option><option value="GAME_DESIGNER">Game Designer</option><option value="ARTIST">Artist</option><option value="DEVELOPER">Developer</option><option value="QA">QA</option><option value="MEMBER">Member</option></select></label><label>Avatar image URL<input type="url" value={editMemberAvatarUrl} onChange={(event) => setEditMemberAvatarUrl(event.target.value)} placeholder="https://.../avatar.png" /></label><label>New password<input type="password" minLength={12} value={editMemberPassword} onChange={(event) => setEditMemberPassword(event.target.value)} placeholder="Để trống nếu không đổi" /></label><div className="studio-member-edit-actions"><button className="studio-primary" type="submit">Save changes</button><button className="studio-team-edit" type="button" onClick={cancelMemberEdit}>Cancel</button></div></form>}</React.Fragment>)}</section><aside className="studio-card studio-team-pulse"><h3>Studio pulse</h3><strong>{snapshot?.activeSprint?.progress || 0}%</strong><small>current sprint completion</small><ProgressBar value={snapshot?.activeSprint?.progress || 0} /><p>Progress lấy từ task thật trong chapter hiện tại.</p><button className="studio-secondary full" onClick={() => navigate('world')}>View live presence →</button></aside></div></>

  const content = { dashboard: renderDashboard(), projects: renderProjects(), tasks: <TaskBoard token={authToken} snapshot={snapshot} refreshKey={refreshKey} onCompletion={handleCompletion} onNotice={setNotice} />, resources: renderResources(), ideas: renderIdeas(), quests: renderQuests(), world: renderWorld(), minigame: <>{renderCardRoom()}{renderMiniGameLaunchPad()}{renderLiveMiniGame()}{renderMiniGame()}</>, rewards: renderRewards(), ranking: renderRanking(), team: renderTeam(), social: <SocialHubPanel token={authToken} social={social} onRefresh={() => setRefreshKey((value) => value + 1)} onNotice={setNotice} onError={setError} /> }[tab]
  const nav = [{ id: 'dashboard' as Tab, icon: '◈', label: 'Overview' }, { id: 'projects' as Tab, icon: '▦', label: 'Projects' }, { id: 'tasks' as Tab, icon: '☷', label: 'Tasks' }, { id: 'resources' as Tab, icon: '◌', label: 'Resources' }, { id: 'ideas' as Tab, icon: '✦', label: 'Brainstorm Lab' }, { id: 'world' as Tab, icon: '◎', label: 'Pixel World' }, { id: 'social' as Tab, icon: '◉', label: 'My World' }, { id: 'quests' as Tab, icon: '⚑', label: 'Quests' }, { id: 'minigame' as Tab, icon: '✹', label: 'Mini game' }, { id: 'rewards' as Tab, icon: '◇', label: 'Unlocks' }, { id: 'ranking' as Tab, icon: '♛', label: 'Scoreboard' }, { id: 'team' as Tab, icon: '☻', label: 'Team' }]

  return <div className={`studio-hub ${open ? 'is-open' : 'is-closed'}`}>{open ? <div className="studio-overlay"><div className="studio-shell"><header className="studio-topbar"><div className="studio-brand"><span className="studio-brand-mark"><i /><i /><i /></span><div><strong>STU<span>/</span>AI</strong><small>GAME STUDIO OS</small></div></div><div className="studio-room"><span className="studio-live-dot" />{roomName || 'RNG Studio'} <small>· {studioRoomName(currentRoom || 'LOBBY')}</small></div><div className="studio-top-actions"><span className="studio-streak">♨ <b>{snapshot?.studio.level || 1}</b> studio level</span><span className="studio-streak social-coin-hud">✦ <b>{social?.progression.coinBalance.toLocaleString() || '—'}</b> Coin</span><button className="studio-top-user" onClick={() => navigate('team')}><Avatar member={currentAvatar} /><span><strong>{playerName}</strong><small>{roleLabel(currentAvatar.role)} · <b className="studio-player-level">LV {social?.progression.gameLevel || 1}</b></small></span></button><button className="studio-close" aria-label="Back to office" onClick={() => setOpen(false)}>×</button></div></header><div className="studio-body"><aside className="studio-sidebar"><span className="studio-nav-label">WORKSPACE</span>{nav.slice(0, 6).map((item) => <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label} onClick={() => navigate(item.id)} />)}<span className="studio-nav-label studio-nav-life">STUDIO LIFE</span>{nav.slice(6).map((item) => <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label} badge={item.id === 'quests' ? String(snapshot?.quests.filter((quest) => !quest.completed).length || 0) : undefined} onClick={() => navigate(item.id)} />)}<div className="studio-sidebar-bottom"><div className="studio-sidebar-xp"><img src={currentAvatar.avatar} alt="" /><div><span>LEVEL {snapshot?.personalProgress.level || 1}</span><strong>{snapshot?.personalProgress.xp.toLocaleString() || 0} <small>/ {snapshot?.personalProgress.xpToNextLevel.toLocaleString() || 1000} XP</small></strong><ProgressBar value={(snapshot?.personalProgress.xp || 0) / (snapshot?.personalProgress.xpToNextLevel || 1000) * 100} /></div></div><button className="studio-back-office" onClick={() => setOpen(false)}>← Back to office</button></div></aside><main className="studio-main"><div className="studio-main-head"><div><span className="studio-kicker">{tab === 'dashboard' ? 'LIVE STUDIO / ACTIVE CHAPTER' : 'RNG STUDIO / WORKSPACE'}</span>{tab === 'dashboard' && <h1>Good morning, {playerName.split(' ')[0]} <em>✦</em></h1>}</div><div className="studio-ai-bar"><span>✦</span><input value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') askPixel() }} placeholder="Ask Pixel about your studio..." /><button onClick={askPixel}>Ask</button></div></div>{(notice || error) && <div className={`studio-notice ${error ? 'is-error' : ''}`}>{error || notice}<button onClick={() => { setError(''); setNotice('') }}>×</button></div>}{tab === 'dashboard' && <div className="studio-ai-reply"><span>✦ Pixel says</span><p>{aiReply}</p></div>}<div className="studio-content">{loading && !snapshot ? <div className="studio-loading">Loading studio workspace…</div> : content}</div></main></div></div></div> : <button className="studio-closed-dock" onClick={() => setOpen(true)}><span className="studio-dock-avatar"><img src={currentAvatar.avatar} alt="" /></span><span><strong>STU / AI HUB</strong><small>{social ? `${social.progression.coinBalance.toLocaleString()} Coin · ` : ''}{snapshot?.studio.name || 'offline'}</small></span><b>↗</b></button>}</div>
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: string; onClick: () => void }) {
  return <button className={`studio-nav-button ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}{badge && <b>{badge}</b>}</button>
}

function PageTitle({ kicker, title, subtitle, action, onAction }: { kicker: string; title: string; subtitle: string; action: string; onAction?: () => void }) {
  return <div className="studio-page-title"><div><span className="studio-kicker">{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div><button className="studio-primary" onClick={onAction}>{action}</button></div>
}
