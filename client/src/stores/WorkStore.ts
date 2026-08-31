import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { DailySalaryReceipt, WorkChallengePublic, WorkCertificationResult, WorkReward, WorkSnapshot } from '../../../types/Work'

interface WorkState {
  snapshot: WorkSnapshot | null
  activeSession: { sessionId: string; endsAt: number; startedAt: number } | null
  activeChallenge: WorkChallengePublic | null
  answeredSteps: number
  totalSteps: number
  lastReward: WorkReward | null
  lastSalaryReceipt: DailySalaryReceipt | null
  lastCertification: WorkCertificationResult | null
  loading: boolean
  error: { code?: string; message: string } | null
}

const initialState: WorkState = {
  snapshot: null,
  activeSession: null,
  activeChallenge: null,
  answeredSteps: 0,
  totalSteps: 0,
  lastReward: null,
  lastSalaryReceipt: null,
  lastCertification: null,
  loading: false,
  error: null,
}

const workSlice = createSlice({
  name: 'work',
  initialState,
  reducers: {
    setWorkSnapshot: (state, action: PayloadAction<WorkSnapshot | null>) => {
      state.snapshot = action.payload
      state.error = null
    },
    setWorkLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    startWorkSession: (state, action: PayloadAction<{ sessionId: string; challenge: WorkChallengePublic; startedAt: number; endsAt: number }>) => {
      state.activeSession = { sessionId: action.payload.sessionId, startedAt: action.payload.startedAt, endsAt: action.payload.endsAt }
      state.activeChallenge = action.payload.challenge
      state.answeredSteps = 0
      state.totalSteps = action.payload.challenge.steps.length
      state.error = null
    },
    updateWorkSession: (state, action: PayloadAction<{ sessionId: string; answeredSteps: number; totalSteps: number }>) => {
      if (!state.activeSession || state.activeSession.sessionId !== action.payload.sessionId) return
      state.answeredSteps = action.payload.answeredSteps
      state.totalSteps = action.payload.totalSteps
    },
    applyWorkReward: (state, action: PayloadAction<WorkReward>) => {
      state.lastReward = action.payload
      state.activeSession = null
      state.activeChallenge = null
      state.answeredSteps = 0
      state.totalSteps = 0
      state.error = null
      if (state.snapshot) state.snapshot.coinBalance = action.payload.coinBalance
    },
    applySalaryReceipt: (state, action: PayloadAction<DailySalaryReceipt>) => {
      state.lastSalaryReceipt = action.payload
      state.error = null
      if (state.snapshot) {
        state.snapshot.coinBalance = action.payload.coinBalance
        state.snapshot.salary.state = 'CLAIMED'
        state.snapshot.salary.totalSalary = action.payload.coinDelta
        state.snapshot.salary.baseSalary = action.payload.baseSalary
        state.snapshot.salary.streakBonus = action.payload.streakBonus
        state.snapshot.salary.streak = action.payload.streak
        state.snapshot.progression.salaryClaimedToday = true
      }
    },
    applyCertificationResult: (state, action: PayloadAction<WorkCertificationResult>) => {
      state.lastCertification = action.payload
      state.activeSession = null
      state.activeChallenge = null
      state.answeredSteps = 0
      state.totalSteps = 0
      state.error = null
    },
    setWorkError: (state, action: PayloadAction<{ code?: string; message: string }>) => {
      state.error = action.payload
      // An invalid answer/action is recoverable: keep the live challenge so
      // the player can correct the step. Only terminal protocol errors should
      // tear down the local overlay; the server remains the authority on
      // whether the session is actually gone.
      if (['WORK_SESSION_NOT_FOUND', 'WORK_SESSION_INVALID', 'WORK_SETTLEMENT_FAILED'].includes(action.payload.code || '')) {
        state.activeSession = null
        state.activeChallenge = null
        state.answeredSteps = 0
        state.totalSteps = 0
      }
    },
    clearWorkSession: (state) => {
      state.activeSession = null
      state.activeChallenge = null
      state.answeredSteps = 0
      state.totalSteps = 0
    },
    clearWorkError: (state) => {
      state.error = null
    },
    clearWorkReceipt: (state) => {
      state.lastReward = null
      state.lastCertification = null
    },
    clearWorkState: (state) => {
      Object.assign(state, initialState)
    },
  },
})

export const { setWorkSnapshot, setWorkLoading, startWorkSession, updateWorkSession, applyWorkReward, applySalaryReceipt, applyCertificationResult, setWorkError, clearWorkSession, clearWorkError, clearWorkReceipt, clearWorkState } = workSlice.actions
export default workSlice.reducer
