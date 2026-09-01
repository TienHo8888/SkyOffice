import React, { useEffect, useRef } from 'react'
import styled from 'styled-components'

import { useAppDispatch, useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import ComputerDialog from './components/ComputerDialog'
import WhiteboardDialog from './components/WhiteboardDialog'
import Chat from './components/Chat'
import HelperButtonGroup from './components/HelperButtonGroup'
import MobileVirtualJoystick from './components/MobileVirtualJoystick'
import StudioHub from './components/StudioHub'
import AuthDialog from './components/AuthDialog'
import TagGameOverlay from './components/TagGameOverlay'
import MiniGameOverlay from './components/MiniGameOverlay'
import CombatHotbar from './components/CombatHotbar'
import PlayerHud from './components/PlayerHud'
import CoinHud from './components/CoinHud'
import WorkPanel from './components/WorkPanel'
import RpsOverlay from './components/RpsOverlay'
import AudioDirector from './components/AudioDirector'
import NewPlayerGuide from './components/NewPlayerGuide'
import SocialContextCard from './components/SocialContextCard'
import PartyDock from './components/PartyDock'
import FishingPanel from './components/FishingPanel'
import HomeEditorPanel from './components/HomeEditorPanel'
import { studioApi } from './services/StudioApi'
import { clearAuthSession, setAuthHydrated, setAuthSession } from './stores/UserStore'
import { applySocialReward, clearSocialState, setSocialPeople, setSocialSnapshot } from './stores/SocialStore'
import { clearWorkState } from './stores/WorkStore'
import { setWorldError } from './stores/WorldStore'
import { canAccessStudioHub, CompletionResponse } from '../../types/Studio'
import { Event, phaserEvents } from './events/EventCenter'
import { SocialReward } from '../../types/Social'
import phaserGame from './PhaserGame'
import Game from './scenes/Game'
import Bootstrap from './scenes/Bootstrap'

const Backdrop = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
`

function App() {
  const dispatch = useAppDispatch()
  const authToken = useAppSelector((state) => state.user.authToken)
  const authHydrated = useAppSelector((state) => state.user.authHydrated)
  const authUser = useAppSelector((state) => state.user.authUser)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const social = useAppSelector((state) => state.social.snapshot)
  const computerDialogOpen = useAppSelector((state) => state.computer.computerDialogOpen)
  const whiteboardDialogOpen = useAppSelector((state) => state.whiteboard.whiteboardDialogOpen)
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const activeWorld = useAppSelector((state) => state.world.worldId)
  const worldError = useAppSelector((state) => state.world.worldError)
  const previousAuthToken = useRef(authToken)

  useEffect(() => {
    if (!authToken) {
      if (previousAuthToken.current) {
        const game = phaserGame.scene.keys.game as Game | undefined
        const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap | undefined
        if (game && phaserGame.scene.isActive('game')) phaserGame.scene.stop('game')
        if (phaserGame.scene.isActive('fishing-world')) phaserGame.scene.stop('fishing-world')
        if (phaserGame.scene.isActive('home-world')) phaserGame.scene.stop('home-world')
        void (game?.network || bootstrap?.network)?.disconnect()
      }
      previousAuthToken.current = authToken
      dispatch(clearSocialState())
      dispatch(clearWorkState())
      dispatch(setAuthHydrated(true))
      return
    }
    previousAuthToken.current = authToken
    studioApi.me(authToken)
      .then(({ user }) => dispatch(setAuthSession({ token: authToken, user })))
      .catch(() => dispatch(clearAuthSession()))
      .finally(() => dispatch(setAuthHydrated(true)))
  }, [authToken, dispatch])

  useEffect(() => {
    const handleLogoutShortcut = (event: KeyboardEvent) => {
      const target = event.target
      const isEditing = target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
      const isLogoutShortcut = event.code === 'KeyL' && event.shiftKey && (event.ctrlKey || event.metaKey) && !event.altKey
      if (!authToken || !loggedIn || isEditing || !isLogoutShortcut) return

      event.preventDefault()
      dispatch(clearAuthSession())
    }

    window.addEventListener('keydown', handleLogoutShortcut)
    return () => window.removeEventListener('keydown', handleLogoutShortcut)
  }, [authToken, dispatch, loggedIn])

  useEffect(() => {
    const handleStudioEvent = (payload: { type?: string; actorId?: string; completion?: CompletionResponse }) => {
      if (payload.type !== 'TASK_COMPLETED' || payload.actorId !== authUser?.id || !payload.completion || !social) return
      dispatch(setSocialSnapshot({ ...social, progression: payload.completion.gameProgression, gameQuests: payload.completion.gameQuests }))
    }
    phaserEvents.on(Event.STUDIO_EVENT, handleStudioEvent)
    return () => { phaserEvents.off(Event.STUDIO_EVENT, handleStudioEvent) }
  }, [authUser?.id, dispatch, social])

  useEffect(() => {
    if (!authToken) return
    studioApi.social(authToken)
      .then((snapshot) => dispatch(setSocialSnapshot(snapshot)))
      .catch(() => dispatch(clearSocialState()))
  }, [authToken, dispatch])

  useEffect(() => {
    if (!authToken) {
      dispatch(setSocialPeople(null))
      return
    }
    let active = true
    const refreshPeople = () => studioApi.socialPeople(authToken).then((snapshot) => {
      if (active) dispatch(setSocialPeople(snapshot))
    }).catch(() => undefined)
    void refreshPeople()
    const interval = window.setInterval(refreshPeople, 15000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [authToken, dispatch])

  useEffect(() => {
    const handleSocialReward = (payload: SocialReward) => {
      dispatch(applySocialReward(payload))
      // A reward may also complete a daily/weekly mission. Pull the canonical
      // snapshot so the quest log and character panel update immediately.
      if (authToken) studioApi.social(authToken).then((snapshot) => dispatch(setSocialSnapshot(snapshot))).catch(() => undefined)
    }
    phaserEvents.on(Event.SOCIAL_REWARD, handleSocialReward)
    return () => { phaserEvents.off(Event.SOCIAL_REWARD, handleSocialReward) }
  }, [authToken, dispatch])

  if (!authHydrated) return <Backdrop><div className="auth-loading">Syncing studio session…</div></Backdrop>

  let ui: JSX.Element
  if (!authToken) {
    ui = <AuthDialog />
  } else if (loggedIn) {
    if (computerDialogOpen) {
      /* Render ComputerDialog if user is using a computer. */
      ui = <ComputerDialog />
    } else if (whiteboardDialogOpen) {
      /* Render WhiteboardDialog if user is using a whiteboard. */
      ui = <WhiteboardDialog />
    } else {
      ui = (
        /* Render the in-world UI when no dialogs are opened. */
        <>
          <Chat />
          <FishingPanel />
          <HomeEditorPanel />
          {canAccessStudioHub(authUser?.role) && <StudioHub />}
          {activeWorld === 'PUBLIC' && <TagGameOverlay />}
          {activeWorld === 'PUBLIC' && <MiniGameOverlay />}
          {activeWorld === 'PUBLIC' && <RpsOverlay />}
          <SocialContextCard />
          <PartyDock />
          <PlayerHud />
          <CoinHud />
          {activeWorld === 'PUBLIC' && <CombatHotbar />}
          <MobileVirtualJoystick />
          {activeWorld === 'PUBLIC' && <NewPlayerGuide />}
        </>
      )
    }
  } else if (roomJoined) {
    /* Render LoginDialog if not logged in but selected a room. */
    ui = <LoginDialog />
  } else {
    /* Render RoomSelectionDialog if yet selected a room. */
    ui = <RoomSelectionDialog />
  }

  return (
    <Backdrop>
      {ui}
      {authToken && loggedIn && worldError && <div className="world-transition-error" role="alert">
        <div><span className="world-transition-error-kicker">WORLD TRANSITION / {worldError.code}</span><strong>{worldError.code === 'WORLD_FULL' ? 'Fishing world đang đầy' : 'Không thể chuyển world'}</strong><p>{worldError.message}</p></div>
        <button type="button" onClick={() => dispatch(setWorldError(null))} aria-label="Đóng thông báo">×</button>
      </div>}
      {authToken && loggedIn && activeWorld === 'PUBLIC' && !computerDialogOpen && !whiteboardDialogOpen && <WorkPanel />}
      {/* Render HelperButtonGroup if no dialogs are opened. */}
      {!computerDialogOpen && !whiteboardDialogOpen && <HelperButtonGroup />}
      <AudioDirector />
    </Backdrop>
  )
}

export default App
