import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { WorldId } from '../../../types/IWorldState'

export type ActiveWorldId = 'PUBLIC' | WorldId

interface WorldStoreState {
  worldId: ActiveWorldId
  ownerId: string
  transitionStatus: 'IDLE' | 'LEAVING' | 'JOINING' | 'READY' | 'ERROR'
  mapLoading: 'IDLE' | 'LOADING' | 'READY' | 'ERROR'
  worldError: { code: string; message: string } | null
  nearFishingSpot: boolean
  nearFishingSpotId: string | null
}

const initialState: WorldStoreState = {
  worldId: 'PUBLIC',
  ownerId: '',
  transitionStatus: 'IDLE',
  mapLoading: 'IDLE',
  worldError: null,
  nearFishingSpot: false,
  nearFishingSpotId: null,
}

export const worldSlice = createSlice({
  name: 'world',
  initialState,
  reducers: {
    setWorldTransition: (state, action: PayloadAction<WorldStoreState['transitionStatus']>) => {
      state.transitionStatus = action.payload
      if (action.payload !== 'ERROR') state.worldError = null
    },
    setActiveWorld: (state, action: PayloadAction<{ worldId: ActiveWorldId; ownerId?: string }>) => {
      state.worldId = action.payload.worldId
      state.ownerId = action.payload.ownerId || ''
      state.transitionStatus = 'READY'
      state.mapLoading = 'LOADING'
      state.worldError = null
      state.nearFishingSpot = false
      state.nearFishingSpotId = null
    },
    setWorldOwner: (state, action: PayloadAction<string>) => {
      state.ownerId = action.payload
    },
    setWorldMapLoading: (state, action: PayloadAction<WorldStoreState['mapLoading']>) => {
      state.mapLoading = action.payload
    },
    setWorldError: (state, action: PayloadAction<{ code: string; message: string } | null>) => {
      state.worldError = action.payload
      state.transitionStatus = action.payload ? 'ERROR' : 'IDLE'
      if (action.payload) state.mapLoading = 'ERROR'
    },
    setNearFishingSpot: (state, action: PayloadAction<boolean>) => {
      state.nearFishingSpot = action.payload
      if (!action.payload) state.nearFishingSpotId = null
    },
    setNearbyFishingSpot: (state, action: PayloadAction<string | null>) => {
      state.nearFishingSpotId = action.payload
      state.nearFishingSpot = Boolean(action.payload)
    },
  },
})

export const { setWorldTransition, setActiveWorld, setWorldOwner, setWorldMapLoading, setWorldError, setNearFishingSpot, setNearbyFishingSpot } = worldSlice.actions

export default worldSlice.reducer
