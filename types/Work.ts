import type { StudioRoomId } from './StudioWorld'

export type WorkCareerId =
  | 'ART'
  | 'ANIMATION'
  | 'GAME_DESIGN'
  | 'FRONTEND'
  | 'BACKEND'
  | 'QA'
  | 'QC'
  | 'PM'
  | 'HR'

export type WorkRankId = 'INTERN' | 'APPRENTICE' | 'JUNIOR' | 'SPECIALIST' | 'SENIOR' | 'LEAD'

export type WorkJobId =
  | 'INBOX_TRIAGE'
  | 'PALETTE_MATCH'
  | 'KEYFRAME_TIMING'
  | 'MECHANIC_BLUEPRINT'
  | 'UI_COMPONENT_ASSEMBLY'
  | 'API_FLOW_ROUTING'
  | 'BUG_HUNT'
  | 'CHECKLIST_AUDIT'
  | 'SPRINT_PLANNING'
  | 'ONBOARDING_DESK'
  | 'ASSET_COMPOSITION'
  | 'STATE_TRANSITION'
  | 'BALANCE_CARDS'
  | 'RESPONSIVE_LAYOUT'
  | 'EVENT_SCHEMA_DEBUG'
  | 'REGRESSION_MATRIX'
  | 'EVIDENCE_VALIDATION'
  | 'RISK_TRIAGE'
  | 'TEAM_MATCH'
  | 'BUILD_VERIFICATION'
  | 'RELEASE_CHECK'
  | 'FEATURE_HANDOFF'
  | 'TEAM_KICKOFF'
  | 'ASSET_DELIVERY'

export type WorkGrade = 'S' | 'A' | 'B' | 'C'
export type WorkSessionMode = 'JOB' | 'CERTIFICATION'
export type WorkSessionStatus = 'STARTED' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED'

export interface WorkCareerDefinition {
  id: WorkCareerId
  name: string
  description: string
  fantasy: string
  roomId: StudioRoomId
  stationId: string
  certificationName: string
  accent: string
}

export interface WorkRankDefinition {
  id: WorkRankId
  name: string
  careerXpRequired: number
  dailySalary: number
}

export interface WorkJobDefinition {
  id: WorkJobId
  name: string
  description: string
  careerIds: WorkCareerId[]
  minRank: WorkRankId
  durationSeconds: number
  baseCoin: number
  baseCareerXp: number
  dailyLimit: number
  stationId: string
}

export interface CareerTrackProgress {
  careerId: WorkCareerId
  careerXp: number
  rank: WorkRankId
  certificationRank?: WorkRankId
  lastWorkedAt?: string
}

export interface WorkDailyStatus {
  date: string
  completedJobs: number
  paidJobs: number
  sessionCount: number
  careerXpEarned: number
  jobCounts: Record<string, number>
  salaryEligible: boolean
  salaryClaimed: boolean
}

export interface WorkSalaryStatus {
  date: string
  state: 'LOCKED' | 'READY' | 'CLAIMED' | 'EXPIRED'
  baseSalary: number
  streakBonus: number
  totalSalary: number
  requiredJobs: number
  completedJobs: number
  streak: number
}

export interface WorkProgression {
  userId: string
  currentCareerId?: WorkCareerId
  currentRank: WorkRankId
  careerXp: number
  careers: CareerTrackProgress[]
  workStreak: number
  dailyCompletedJobs: number
  dailyPaidJobs: number
  dailyWorkSessions: number
  dailyCareerXpEarned: number
  salaryEligible: boolean
  salaryClaimedToday: boolean
  lastSalaryClaimDate?: string
  lastCareerChangeAt?: string
}

export interface WorkSnapshot {
  progression: WorkProgression
  coinBalance: number
  tutorialCompleted: boolean
  careers: WorkCareerDefinition[]
  ranks: WorkRankDefinition[]
  jobs: WorkJobDefinition[]
  daily: WorkDailyStatus
  salary: WorkSalaryStatus
  history: WorkHistoryRecord[]
}

export interface WorkReward {
  mode?: 'JOB'
  sessionId: string
  jobId: WorkJobId
  careerId?: WorkCareerId
  grade: WorkGrade
  score: number
  coinDelta: number
  coinBalance: number
  careerXpDelta: number
  careerXp: number
  rank: WorkRankId
  promoted: boolean
  salaryProgress: number
  grantedAt: string
  practice?: boolean
  duplicate?: boolean
}

export interface DailySalaryReceipt {
  userId: string
  date: string
  baseSalary: number
  streakBonus: number
  coinDelta: number
  coinBalance: number
  rank: WorkRankId
  streak: number
  duplicate?: boolean
  grantedAt: string
}

export interface WorkCertificationResult {
  mode: 'CERTIFICATION'
  sessionId: string
  careerId: WorkCareerId
  targetRank: WorkRankId
  score: number
  passed: boolean
  promoted: boolean
  currentRank: WorkRankId
  careerXp: number
  grantedAt: string
  duplicate?: boolean
}

export interface WorkHistoryRecord {
  sessionId: string
  jobId: WorkJobId
  jobName: string
  careerId?: WorkCareerId
  status: WorkSessionStatus
  score: number
  grade?: WorkGrade
  coinDelta: number
  careerXpDelta: number
  createdAt: string
}

export interface WorkChallengeOption {
  id: string
  label: string
  detail?: string
}

export interface WorkChallengeStep {
  id: string
  title: string
  prompt: string
  options: WorkChallengeOption[]
  image?: WorkChallengeImage
}

export interface WorkChallengeImage {
  src: string
  alt: string
  caption?: string
}

export interface WorkChallengePublic {
  mode: WorkSessionMode
  sessionId: string
  jobId?: WorkJobId
  careerId?: WorkCareerId
  targetRank?: WorkRankId
  title: string
  instruction: string
  difficulty?: 1 | 2 | 3 | 4 | 5 | 6
  difficultyLabel?: string
  questionBankSize?: number
  challengeSeed?: string
  durationSeconds: number
  steps: WorkChallengeStep[]
}

export interface WorkActionRecord {
  actionId: string
  stepId: string
  optionId: string
  receivedAt: number
}

export interface WorkStartPayload {
  jobId?: WorkJobId
  stationId?: string
  actionId: string
  mode?: WorkSessionMode
  careerId?: WorkCareerId
  targetRank?: WorkRankId
}

export interface WorkActionPayload {
  sessionId: string
  actionId: string
  actionType: 'SELECT_OPTION'
  payload: {
    stepId?: string
    optionId?: string
  }
}

export interface WorkSubmitPayload {
  sessionId: string
  actionId: string
}

export interface WorkCancelPayload {
  sessionId: string
  actionId: string
}

export const WORK_CAREER_DEFINITIONS: readonly WorkCareerDefinition[] = [
  { id: 'ART', name: 'Art', description: 'Tạo hình ảnh, màu sắc và asset tĩnh.', fantasy: 'Visual maker', roomId: 'ART', stationId: 'ART_STATION', certificationName: 'Color & Composition Review', accent: '#f28bb4' },
  { id: 'ANIMATION', name: 'Animation', description: 'Điều khiển timing, keyframe và chuyển động.', fantasy: 'Motion maker', roomId: 'ART', stationId: 'ANIMATION_STATION', certificationName: 'Timing & Keyframe Review', accent: '#ff9d6c' },
  { id: 'GAME_DESIGN', name: 'Game Design', description: 'Tạo mechanic, flow và balance.', fantasy: 'System architect', roomId: 'DESIGN', stationId: 'GAME_DESIGN_STATION', certificationName: 'Mechanic Brief Review', accent: '#ae91ff' },
  { id: 'FRONTEND', name: 'Frontend', description: 'Ghép UI, component và interaction state.', fantasy: 'Interface builder', roomId: 'DEVELOPMENT', stationId: 'FRONTEND_STATION', certificationName: 'UI State Assembly Review', accent: '#78d8ff' },
  { id: 'BACKEND', name: 'Backend', description: 'Xử lý event, API flow và server logic.', fantasy: 'World systems engineer', roomId: 'DEVELOPMENT', stationId: 'BACKEND_STATION', certificationName: 'Event Flow Review', accent: '#6fe0b0' },
  { id: 'QA', name: 'QA', description: 'Tìm bug và kiểm tra hành vi runtime.', fantasy: 'Bug hunter', roomId: 'QA', stationId: 'QA_STATION', certificationName: 'Regression Investigation', accent: '#94a0ff' },
  { id: 'QC', name: 'QC', description: 'Kiểm soát tiêu chuẩn, evidence và chất lượng đầu ra.', fantasy: 'Quality gatekeeper', roomId: 'QA', stationId: 'QC_STATION', certificationName: 'Quality Gate Audit', accent: '#c8f267' },
  { id: 'PM', name: 'PM', description: 'Điều phối sprint, deadline, risk và dependency.', fantasy: 'Mission coordinator', roomId: 'MEETING', stationId: 'PM_STATION', certificationName: 'Sprint Planning Review', accent: '#ffb86c' },
  { id: 'HR', name: 'HR', description: 'Onboarding, people support và kết nối thành viên.', fantasy: 'People connector', roomId: 'MEETING', stationId: 'HR_STATION', certificationName: 'Onboarding Flow Review', accent: '#ff91c8' },
]

export const WORK_RANK_DEFINITIONS: readonly WorkRankDefinition[] = [
  { id: 'INTERN', name: 'Intern', careerXpRequired: 0, dailySalary: 100 },
  { id: 'APPRENTICE', name: 'Apprentice', careerXpRequired: 300, dailySalary: 125 },
  { id: 'JUNIOR', name: 'Junior', careerXpRequired: 900, dailySalary: 160 },
  { id: 'SPECIALIST', name: 'Specialist', careerXpRequired: 1800, dailySalary: 210 },
  { id: 'SENIOR', name: 'Senior', careerXpRequired: 3200, dailySalary: 275 },
  { id: 'LEAD', name: 'Lead', careerXpRequired: 5200, dailySalary: 350 },
]

export const WORK_JOB_DEFINITIONS: readonly WorkJobDefinition[] = [
  { id: 'INBOX_TRIAGE', name: 'Inbox Triage', description: 'Tutorial 4 câu: phân loại request vào đúng lane của studio.', careerIds: [], minRank: 'INTERN', durationSeconds: 60, baseCoin: 30, baseCareerXp: 30, dailyLimit: 2, stationId: 'JOB_BOARD' },
  { id: 'PALETTE_MATCH', name: 'Palette Match', description: 'Ghép swatch với target màu trong mockup.', careerIds: ['ART'], minRank: 'INTERN', durationSeconds: 45, baseCoin: 35, baseCareerXp: 35, dailyLimit: 2, stationId: 'ART_STATION' },
  { id: 'KEYFRAME_TIMING', name: 'Keyframe Timing', description: 'Đặt keyframe và timing cho một chuyển động.', careerIds: ['ANIMATION'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 40, baseCareerXp: 40, dailyLimit: 2, stationId: 'ANIMATION_STATION' },
  { id: 'MECHANIC_BLUEPRINT', name: 'Mechanic Blueprint', description: 'Chọn mechanic đáp ứng brief và constraint.', careerIds: ['GAME_DESIGN'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 45, baseCareerXp: 50, dailyLimit: 2, stationId: 'GAME_DESIGN_STATION' },
  { id: 'UI_COMPONENT_ASSEMBLY', name: 'UI Component Assembly', description: 'Ghép component với interaction state đúng.', careerIds: ['FRONTEND'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 45, baseCareerXp: 50, dailyLimit: 2, stationId: 'FRONTEND_STATION' },
  { id: 'API_FLOW_ROUTING', name: 'API Flow Routing', description: 'Sắp xếp event, validation và response đúng flow.', careerIds: ['BACKEND'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 45, baseCareerXp: 50, dailyLimit: 2, stationId: 'BACKEND_STATION' },
  { id: 'BUG_HUNT', name: 'Bug Hunt', description: 'Tìm bug runtime, loại lỗi và severity.', careerIds: ['QA'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 45, baseCareerXp: 50, dailyLimit: 2, stationId: 'QA_STATION' },
  { id: 'CHECKLIST_AUDIT', name: 'Checklist Audit', description: 'Đối chiếu deliverable với quality gate.', careerIds: ['QC'], minRank: 'INTERN', durationSeconds: 45, baseCoin: 40, baseCareerXp: 45, dailyLimit: 2, stationId: 'QC_STATION' },
  { id: 'SPRINT_PLANNING', name: 'Sprint Planning', description: 'Xếp task theo dependency, deadline và capacity.', careerIds: ['PM'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 40, baseCareerXp: 45, dailyLimit: 2, stationId: 'PM_STATION' },
  { id: 'ONBOARDING_DESK', name: 'Onboarding Desk', description: 'Ghép onboarding flow cho NPC mới.', careerIds: ['HR'], minRank: 'INTERN', durationSeconds: 45, baseCoin: 35, baseCareerXp: 40, dailyLimit: 2, stationId: 'HR_STATION' },
  { id: 'ASSET_COMPOSITION', name: 'Asset Composition', description: 'Sắp xếp asset vào layout đúng brief.', careerIds: ['ART'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 55, baseCareerXp: 65, dailyLimit: 2, stationId: 'ART_STATION' },
  { id: 'STATE_TRANSITION', name: 'State Transition', description: 'Nối animation state vào đúng transition.', careerIds: ['ANIMATION'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 60, baseCareerXp: 70, dailyLimit: 2, stationId: 'ANIMATION_STATION' },
  { id: 'BALANCE_CARDS', name: 'Balance Cards', description: 'Chọn cost, reward và trigger đáp ứng constraint.', careerIds: ['GAME_DESIGN'], minRank: 'INTERN', durationSeconds: 75, baseCoin: 65, baseCareerXp: 75, dailyLimit: 2, stationId: 'GAME_DESIGN_STATION' },
  { id: 'RESPONSIVE_LAYOUT', name: 'Responsive Layout', description: 'Đặt component đúng breakpoint.', careerIds: ['FRONTEND'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 60, baseCareerXp: 70, dailyLimit: 2, stationId: 'FRONTEND_STATION' },
  { id: 'EVENT_SCHEMA_DEBUG', name: 'Event Schema Debug', description: 'Sửa thứ tự event và payload schema.', careerIds: ['BACKEND'], minRank: 'INTERN', durationSeconds: 75, baseCoin: 65, baseCareerXp: 75, dailyLimit: 2, stationId: 'BACKEND_STATION' },
  { id: 'REGRESSION_MATRIX', name: 'Regression Matrix', description: 'Chọn test case bị ảnh hưởng bởi change.', careerIds: ['QA'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 60, baseCareerXp: 70, dailyLimit: 2, stationId: 'QA_STATION' },
  { id: 'EVIDENCE_VALIDATION', name: 'Evidence Validation', description: 'Đối chiếu build, config, document và evidence.', careerIds: ['QC'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 55, baseCareerXp: 65, dailyLimit: 2, stationId: 'QC_STATION' },
  { id: 'RISK_TRIAGE', name: 'Risk Triage', description: 'Phân loại risk theo impact, urgency và dependency.', careerIds: ['PM'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 55, baseCareerXp: 65, dailyLimit: 2, stationId: 'PM_STATION' },
  { id: 'TEAM_MATCH', name: 'Team Match', description: 'Ghép NPC, role và onboarding step đúng bối cảnh.', careerIds: ['HR'], minRank: 'INTERN', durationSeconds: 60, baseCoin: 50, baseCareerXp: 60, dailyLimit: 2, stationId: 'HR_STATION' },
  { id: 'BUILD_VERIFICATION', name: 'Build Verification', description: 'Kiểm tra một build qua các gate liên tiếp.', careerIds: ['BACKEND', 'QA', 'QC'], minRank: 'APPRENTICE', durationSeconds: 75, baseCoin: 75, baseCareerXp: 85, dailyLimit: 2, stationId: 'QA_STATION' },
  { id: 'RELEASE_CHECK', name: 'Release Check', description: 'Kiểm tra release readiness theo checklist.', careerIds: ['QA', 'QC', 'PM'], minRank: 'APPRENTICE', durationSeconds: 75, baseCoin: 75, baseCareerXp: 85, dailyLimit: 2, stationId: 'PM_STATION' },
  { id: 'FEATURE_HANDOFF', name: 'Feature Handoff', description: 'Ghép brief và deliverable giữa các discipline.', careerIds: ['GAME_DESIGN', 'FRONTEND', 'BACKEND', 'ART', 'ANIMATION'], minRank: 'APPRENTICE', durationSeconds: 75, baseCoin: 75, baseCareerXp: 85, dailyLimit: 2, stationId: 'JOB_BOARD' },
  { id: 'TEAM_KICKOFF', name: 'Team Kickoff', description: 'Chuẩn bị kickoff cho nhóm NPC giả lập.', careerIds: ['PM', 'HR'], minRank: 'APPRENTICE', durationSeconds: 75, baseCoin: 70, baseCareerXp: 80, dailyLimit: 2, stationId: 'PM_STATION' },
  { id: 'ASSET_DELIVERY', name: 'Asset Delivery', description: 'Kiểm tra asset package trước khi handoff.', careerIds: ['ART', 'ANIMATION', 'QC'], minRank: 'APPRENTICE', durationSeconds: 75, baseCoin: 70, baseCareerXp: 80, dailyLimit: 2, stationId: 'ART_STATION' },
]
