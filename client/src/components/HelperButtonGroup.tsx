import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Fab from '@mui/material/Fab'
import Tooltip from '@mui/material/Tooltip'
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset'
import VideogameAssetOffIcon from '@mui/icons-material/VideogameAssetOff'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import InventoryIcon from '@mui/icons-material/Inventory'
import AssignmentIcon from '@mui/icons-material/Assignment'
import PersonIcon from '@mui/icons-material/Person'
import StorefrontIcon from '@mui/icons-material/Storefront'
import GroupIcon from '@mui/icons-material/Group'

import { setShowJoystick } from '../stores/UserStore'
import { useAppSelector, useAppDispatch } from '../hooks'
import LeaderboardPanel from './LeaderboardPanel'
import InventoryPanel from './InventoryPanel'
import QuestPanel from './QuestPanel'
import CharacterPanel from './CharacterPanel'
import StorePanel from './StorePanel'
import SocialPeoplePanel from './SocialPeoplePanel'
import { getActiveWorldScene } from '../utils/activeWorld'

const Backdrop = styled.div`
  position: fixed;
  display: flex;
  gap: 10px;
  bottom: 16px;
  right: 16px;
  align-items: flex-end;

  .wrapper-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`

const StyledFab = styled(Fab)<{ target?: string }>`
  &:hover {
    color: #1ea2df;
  }
`

export default function HelperButtonGroup() {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [featurePanel, setFeaturePanel] = useState<'character' | 'inventory' | 'quests' | 'store' | 'people' | null>(null)
  const [featureButtonsStacked, setFeatureButtonsStacked] = useState(false)
  const featureButtonsStackedRef = useRef(false)
  const buttonGroupRef = useRef<HTMLDivElement>(null)
  const showJoystick = useAppSelector((state) => state.user.showJoystick)
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const unreadNotifications = useAppSelector((state) => state.social.people?.unreadNotifications || 0)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!roomJoined || !loggedIn) {
      featureButtonsStackedRef.current = false
      setFeatureButtonsStacked(false)
      return
    }

    let measureFrame = 0
    let settleFrame = 0

    const setStacked = (stacked: boolean) => {
      if (featureButtonsStackedRef.current === stacked) return
      featureButtonsStackedRef.current = stacked
      setFeatureButtonsStacked(stacked)
    }

    const rectanglesOverlap = (first: DOMRect, second: DOMRect, padding: number) => (
      first.left < second.right + padding &&
      first.right > second.left - padding &&
      first.top < second.bottom + padding &&
      first.bottom > second.top - padding
    )

    const measureLayout = () => {
      measureFrame = 0
      const group = buttonGroupRef.current
      if (!group || featureButtonsStackedRef.current) return

      const groupRect = group.getBoundingClientRect()
      const viewportCollision = (
        groupRect.left < 8 ||
        groupRect.right > window.innerWidth - 8 ||
        groupRect.top < 8 ||
        groupRect.bottom > window.innerHeight - 8
      )
      const blockers = Array.from(document.querySelectorAll<HTMLElement>(
        [
          '.player-hud',
          '.new-player-guide',
          '.guide-reopen',
          '.combat-hotbar',
          '.game-channel-chat',
          '.game-chat-dock',
          '.work-closed-dock',
          '.audio-dock',
        ].join(', '),
      )).filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      const blockedByGameUi = blockers.some((element) => (
        rectanglesOverlap(groupRect, element.getBoundingClientRect(), 8)
      ))

      setStacked(viewportCollision || blockedByGameUi)
    }

    const scheduleMeasure = (afterLayout = false) => {
      if (measureFrame) window.cancelAnimationFrame(measureFrame)
      if (settleFrame) window.cancelAnimationFrame(settleFrame)

      if (afterLayout) {
        measureFrame = window.requestAnimationFrame(() => {
          measureFrame = 0
          settleFrame = window.requestAnimationFrame(() => {
            settleFrame = 0
            measureLayout()
          })
        })
        return
      }

      measureFrame = window.requestAnimationFrame(measureLayout)
    }

    const handleViewportChange = () => {
      // Measure the current layout in-place. Toggling the class before every
      // measurement caused a ResizeObserver feedback loop and visible jitter.
      scheduleMeasure(true)
    }

    scheduleMeasure()
    window.addEventListener('resize', handleViewportChange)

    let hotbarObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      hotbarObserver = new ResizeObserver(handleViewportChange)
      document.querySelectorAll<HTMLElement>([
        '.player-hud',
        '.new-player-guide',
        '.guide-reopen',
        '.combat-hotbar',
        '.game-channel-chat',
        '.game-chat-dock',
        '.work-closed-dock',
        '.audio-dock',
      ].join(', '))
        .forEach((element) => hotbarObserver?.observe(element))
    }

    let layoutObserver: MutationObserver | undefined
    if (typeof MutationObserver !== 'undefined' && document.body) {
      layoutObserver = new MutationObserver(handleViewportChange)
      layoutObserver.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      if (measureFrame) window.cancelAnimationFrame(measureFrame)
      if (settleFrame) window.cancelAnimationFrame(settleFrame)
      hotbarObserver?.disconnect()
      layoutObserver?.disconnect()
    }
  }, [loggedIn, roomJoined])

  useEffect(() => {
    const game = getActiveWorldScene()
    if (!featurePanel) return
    game?.disableKeys('game-feature-panel')
    return () => game?.enableKeys('game-feature-panel')
  }, [featurePanel])

  const openFeature = (panel: 'character' | 'inventory' | 'quests' | 'store' | 'people') => {
    setFeaturePanel((current) => current === panel ? null : panel)
    setShowLeaderboard(false)
  }

  return (
    <>
      <LeaderboardPanel open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      <CharacterPanel open={featurePanel === 'character'} onClose={() => setFeaturePanel(null)} />
      <InventoryPanel open={featurePanel === 'inventory'} onClose={() => setFeaturePanel(null)} />
      <QuestPanel open={featurePanel === 'quests'} onClose={() => setFeaturePanel(null)} />
      <StorePanel open={featurePanel === 'store'} onClose={() => setFeaturePanel(null)} />
      <SocialPeoplePanel open={featurePanel === 'people'} onClose={() => setFeaturePanel(null)} />
      <Backdrop className="helper-button-backdrop">
      <div className="wrapper-group">
        {roomJoined && (
          <Tooltip title={showJoystick ? 'Disable virtual joystick' : 'Enable virtual joystick'}>
            <StyledFab size="small" onClick={() => dispatch(setShowJoystick(!showJoystick))}>
              {showJoystick ? <VideogameAssetOffIcon /> : <VideogameAssetIcon />}
            </StyledFab>
          </Tooltip>
        )}
      </div>
      <ButtonGroup
        ref={buttonGroupRef}
        className={`helper-button-group${featureButtonsStacked ? ' is-stacked' : ''}`}
      >
        {roomJoined && (
          <>
            {loggedIn && <Tooltip title="People & Friends">
              <StyledFab
                className="helper-feature-fab people"
                size="small"
                aria-label="Mở People & Friends"
                aria-pressed={featurePanel === 'people'}
                onClick={() => openFeature('people')}
              >
                <span className="helper-fab-icon-wrap"><GroupIcon />{unreadNotifications > 0 && <b className="helper-feature-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</b>}</span>
              </StyledFab>
            </Tooltip>}
            <Tooltip title="Nhân vật">
              <StyledFab
                className="helper-feature-fab character"
                size="small"
                aria-label="Mở thông tin nhân vật"
                aria-pressed={featurePanel === 'character'}
                onClick={() => openFeature('character')}
              >
                <PersonIcon />
              </StyledFab>
            </Tooltip>
            <Tooltip title="Túi đồ">
              <StyledFab
                className="helper-feature-fab inventory"
                size="small"
                aria-label="Mở túi đồ"
                aria-pressed={featurePanel === 'inventory'}
                onClick={() => openFeature('inventory')}
              >
                <InventoryIcon />
              </StyledFab>
            </Tooltip>
            <StyledFab
              className="helper-feature-fab store"
              size="small"
              title="Cửa hàng"
              aria-label="Mở cửa hàng"
              aria-pressed={featurePanel === 'store'}
              onClick={() => openFeature('store')}
            >
              <StorefrontIcon />
            </StyledFab>
            <Tooltip title="Nhiệm vụ">
              <StyledFab
                className="helper-feature-fab quests"
                size="small"
                aria-label="Mở bảng nhiệm vụ"
                aria-pressed={featurePanel === 'quests'}
                onClick={() => openFeature('quests')}
              >
                <AssignmentIcon />
              </StyledFab>
            </Tooltip>
            <Tooltip title="Bảng xếp hạng">
              <StyledFab
                size="small"
                aria-label="Bảng xếp hạng"
                onClick={() => {
                  setShowLeaderboard(!showLeaderboard)
                }}
              >
                <EmojiEventsIcon />
              </StyledFab>
            </Tooltip>
          </>
        )}
      </ButtonGroup>
      </Backdrop>
    </>
  )
}
