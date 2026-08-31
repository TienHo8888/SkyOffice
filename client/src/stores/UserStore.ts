import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { sanitizeId } from '../util'
import { BackgroundMode } from '../../../types/BackgroundMode'
import { User } from '../../../types/Studio'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

export function getInitialBackgroundMode() {
  const currentHour = new Date().getHours()
  return currentHour > 6 && currentHour <= 18 ? BackgroundMode.DAY : BackgroundMode.NIGHT
}

function getStoredAuthToken() {
  return typeof window !== 'undefined' ? window.localStorage.getItem('studio-os-token') || '' : ''
}

export const userSlice = createSlice({
  name: 'user',
  initialState: {
    backgroundMode: getInitialBackgroundMode(),
    sessionId: '',
    displayName: '',
    currentRoom: 'LOBBY',
    authToken: getStoredAuthToken(),
    authUser: null as User | null,
    authHydrated: false,
    videoConnected: false,
    loggedIn: false,
    playerNameMap: new Map<string, string>(),
    showJoystick: window.innerWidth < 650,
  },
  reducers: {
    toggleBackgroundMode: (state) => {
      const newMode =
        state.backgroundMode === BackgroundMode.DAY ? BackgroundMode.NIGHT : BackgroundMode.DAY

      state.backgroundMode = newMode
      const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
      bootstrap.changeBackgroundMode(newMode)
    },
    setSessionId: (state, action: PayloadAction<string>) => {
      state.sessionId = action.payload
    },
    setDisplayName: (state, action: PayloadAction<string>) => {
      state.displayName = action.payload
    },
    setCurrentRoom: (state, action: PayloadAction<string>) => {
      state.currentRoom = action.payload
    },
    setAuthSession: (state, action: PayloadAction<{ token: string; user: User }>) => {
      state.authToken = action.payload.token
      state.authUser = action.payload.user
      state.displayName = action.payload.user.displayName
      if (typeof window !== 'undefined') window.localStorage.setItem('studio-os-token', action.payload.token)
    },
    clearAuthSession: (state) => {
      state.authToken = ''
      state.authUser = null
      state.authHydrated = true
      state.loggedIn = false
      if (typeof window !== 'undefined') window.localStorage.removeItem('studio-os-token')
    },
    setAuthHydrated: (state, action: PayloadAction<boolean>) => {
      state.authHydrated = action.payload
    },
    setVideoConnected: (state, action: PayloadAction<boolean>) => {
      state.videoConnected = action.payload
    },
    setLoggedIn: (state, action: PayloadAction<boolean>) => {
      state.loggedIn = action.payload
    },
    setPlayerNameMap: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.playerNameMap.set(sanitizeId(action.payload.id), action.payload.name)
    },
    removePlayerNameMap: (state, action: PayloadAction<string>) => {
      state.playerNameMap.delete(sanitizeId(action.payload))
    },
    setShowJoystick: (state, action: PayloadAction<boolean>) => {
      state.showJoystick = action.payload
    },
  },
})

export const {
  toggleBackgroundMode,
  setSessionId,
  setDisplayName,
  setCurrentRoom,
  setAuthSession,
  clearAuthSession,
  setAuthHydrated,
  setVideoConnected,
  setLoggedIn,
  setPlayerNameMap,
  removePlayerNameMap,
  setShowJoystick,
} = userSlice.actions

export default userSlice.reducer
