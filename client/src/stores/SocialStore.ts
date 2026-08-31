import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { characterXpForCurrentLevel, characterXpToNextLevel, SocialLoadout, SocialPeopleSnapshot, SocialReward, SocialSnapshot } from '../../../types/Social'
import type { InventoryStack } from '../../../types/Inventory'

interface SocialState {
  snapshot: SocialSnapshot | null
  people: SocialPeopleSnapshot | null
  lastReward: SocialReward | null
  lastLevelUp: { from: number; to: number } | null
}

const initialState: SocialState = { snapshot: null, people: null, lastReward: null, lastLevelUp: null }

const socialSlice = createSlice({
  name: 'social',
  initialState,
  reducers: {
    setSocialSnapshot: (state, action: PayloadAction<SocialSnapshot | null>) => {
      const previousLevel = state.snapshot?.progression.gameLevel
      state.snapshot = action.payload ? { ...action.payload, gameQuests: action.payload.gameQuests || [], titleProgress: action.payload.titleProgress || [], inventory: action.payload.inventory || [], fishingDailyCount: action.payload.fishingDailyCount || 0 } : null
      const nextLevel = action.payload?.progression.gameLevel
      if (previousLevel !== undefined && nextLevel !== undefined && nextLevel > previousLevel) state.lastLevelUp = { from: previousLevel, to: nextLevel }
    },
    setSocialPeople: (state, action: PayloadAction<SocialPeopleSnapshot | null>) => {
      state.people = action.payload
    },
    setSocialLoadout: (state, action: PayloadAction<SocialLoadout>) => {
      if (state.snapshot) state.snapshot.loadout = action.payload
    },
    applySocialReward: (state, action: PayloadAction<SocialReward>) => {
      state.lastReward = action.payload
      if (!state.snapshot) return
      const previousLevel = state.snapshot.progression.gameLevel
      state.snapshot.progression.coinBalance = action.payload.coinBalance
      state.snapshot.progression.gameXp = action.payload.gameXp
      state.snapshot.progression.gameLevel = action.payload.gameLevel
      state.snapshot.progression.xpForCurrentLevel = action.payload.xpForCurrentLevel ?? characterXpForCurrentLevel(action.payload.gameXp)
      state.snapshot.progression.xpToNextLevel = characterXpToNextLevel(action.payload.gameXp)
      if (action.payload.gameQuests) state.snapshot.gameQuests = action.payload.gameQuests
      if (action.payload.gameLevel > previousLevel) state.lastLevelUp = { from: previousLevel, to: action.payload.gameLevel }
    },
    applyWorkCoinBalance: (state, action: PayloadAction<number>) => {
      if (state.snapshot) state.snapshot.progression.coinBalance = action.payload
    },
    applyInventory: (state, action: PayloadAction<InventoryStack[]>) => {
      if (state.snapshot) state.snapshot.inventory = action.payload.map((stack) => ({ ...stack }))
    },
    clearLevelUpNotice: (state) => {
      state.lastLevelUp = null
    },
    clearSocialState: (state) => {
      state.snapshot = null
      state.people = null
      state.lastReward = null
      state.lastLevelUp = null
    },
  },
})

export const { setSocialSnapshot, setSocialPeople, setSocialLoadout, applySocialReward, applyWorkCoinBalance, applyInventory, clearLevelUpNotice, clearSocialState } = socialSlice.actions
export default socialSlice.reducer
