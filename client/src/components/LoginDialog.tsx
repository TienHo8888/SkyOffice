import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import Avatar from '@mui/material/Avatar'
import Alert from '@mui/material/Alert'
import ArrowRightIcon from '@mui/icons-material/ArrowRight'

import { useAppSelector, useAppDispatch } from '../hooks'
import { setAuthSession, setDisplayName, setLoggedIn } from '../stores/UserStore'
import { getAvatarString, getColorByString } from '../util'
import { studioApi, StudioApiError } from '../services/StudioApi'
import {
  characterConfigToLegacyAvatar,
  normalizeCharacterConfig,
} from '../../../types/Avatar'
import type { CharacterConfig } from '../../../types/Avatar'
import AvatarCreator from './AvatarCreator'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const Wrapper = styled.form`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(980px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  box-sizing: border-box;
  background: #222639;
  border-radius: 16px;
  padding: 28px 34px;
  box-shadow: 0px 0px 5px #0000006f;
`

const Title = styled.p`
  margin: 4px 0 18px;
  font-size: 20px;
  color: #c2c2c2;
  text-align: center;
`

const RoomName = styled.div`
  max-width: 500px;
  max-height: 120px;
  margin: 0 auto;
  overflow-wrap: anywhere;
  overflow-y: auto;
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;

  h3 {
    font-size: 24px;
    color: #eee;
  }
`

const RoomDescription = styled.div`
  max-width: 620px;
  max-height: 80px;
  margin: 0 auto;
  overflow-wrap: anywhere;
  overflow-y: auto;
  font-size: 16px;
  color: #c2c2c2;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Content = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 20px;
  margin: 24px 0;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const Right = styled.div`
  min-width: 0;

  .account-preview {
    padding: 18px;
    border: 1px solid #434a63;
    border-radius: 10px;
    color: #c2c2c2;
    background: #171b2a;
  }

  .account-preview strong {
    display: block;
    margin-bottom: 6px;
    color: #eee;
    font-size: 20px;
  }

  .account-preview small {
    color: #8f98b4;
  }

  .account-preview p {
    line-height: 1.5;
  }
`

const Bottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 2px;
`

const Warning = styled.div`
  margin-top: 18px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

export default function LoginDialog() {
  const [characterName, setCharacterName] = useState('')
  const [characterConfig, setCharacterConfig] = useState<CharacterConfig>(() => normalizeCharacterConfig(undefined))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const joinStarted = useRef(false)
  const dispatch = useAppDispatch()
  const authToken = useAppSelector((state) => state.user.authToken)
  const authUser = useAppSelector((state) => state.user.authUser)
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const roomName = useAppSelector((state) => state.room.roomName)
  const roomDescription = useAppSelector((state) => state.room.roomDescription)

  useEffect(() => {
    if (authUser?.displayName) setCharacterName(authUser.displayName)
    setCharacterConfig(normalizeCharacterConfig(authUser?.characterConfig, authUser?.avatarKey))
  }, [authUser?.id])

  useEffect(() => {
    const savedConfig = authUser?.characterConfig
    if (!roomJoined || !savedConfig || joinStarted.current) return
    let cancelled = false
    let animationFrame = 0
    const joinWhenReady = () => {
      if (cancelled || joinStarted.current) return
      const game = phaserGame.scene.keys.game as Game | undefined
      if (!game?.myPlayer || !game.network) {
        animationFrame = window.requestAnimationFrame(joinWhenReady)
        return
      }
      joinStarted.current = true
      game.registerKeys()
      game.myPlayer.setPlayerName(authUser.displayName)
      game.myPlayer.setPlayerTexture(authUser.avatarKey || characterConfigToLegacyAvatar(savedConfig))
      game.myPlayer.setCharacterConfig(savedConfig)
      game.network.readyToConnect()
      dispatch(setDisplayName(authUser.displayName))
      dispatch(setLoggedIn(true))
    }
    joinWhenReady()
    return () => {
      cancelled = true
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [authUser?.avatarKey, authUser?.characterConfig, authUser?.displayName, dispatch, roomJoined])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authToken || !authUser || !roomJoined) return
    setSaving(true)
    setError('')
    try {
      const normalizedConfig = normalizeCharacterConfig(characterConfig, authUser.avatarKey)
      const legacyAvatarKey = characterConfigToLegacyAvatar(normalizedConfig)
      const { user } = await studioApi.updateProfile(authToken, {
        displayName: characterName.trim(),
        avatarKey: legacyAvatarKey,
        characterConfig: normalizedConfig,
      })
      dispatch(setAuthSession({ token: authToken, user }))

      const game = phaserGame.scene.keys.game as Game | undefined
      game?.myPlayer?.setPlayerTexture(user.avatarKey || legacyAvatarKey)
      game?.myPlayer?.setCharacterConfig(user.characterConfig || normalizedConfig)
      game?.network?.updatePlayerCharacterConfig(user.characterConfig || normalizedConfig)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể lưu ngoại hình nhân vật.')
    } finally { setSaving(false) }
  }

  if (authUser?.characterConfig) {
    return <Wrapper as="div"><Title>Đang vào Tohi Studio…</Title></Wrapper>
  }

  return (
    <Wrapper onSubmit={handleSubmit}>
      <Title>Joining</Title>
      <RoomName>
        <Avatar style={{ background: getColorByString(roomName) }}>
          {getAvatarString(roomName)}
        </Avatar>
        <h3>{roomName}</h3>
      </RoomName>
      <RoomDescription>
        <ArrowRightIcon /> {roomDescription}
      </RoomDescription>
      <Content>
        <AvatarCreator config={characterConfig} onChange={setCharacterConfig} />
        <Right>
          <div className="account-preview">
            <strong>{authUser?.displayName || 'Studio member'}</strong>
            <small>@{authUser?.username || authUser?.email.split('@')[0]}</small>
            <p>Chọn ngoại hình cho nhân vật của bạn. Các layer LPC sẽ được lưu theo tài khoản và đồng bộ với người chơi khác.</p>
          </div>
          <label className="character-name-field">Tên hiển thị<input required minLength={2} maxLength={24} value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="Tên trong thế giới" /></label>
          {error && <Warning><Alert variant="outlined" severity="error">{error}</Alert></Warning>}
        </Right>
      </Content>
      <Bottom>
        <Button disabled={saving} variant="contained" color="secondary" size="large" type="submit">
          {saving ? 'Đang lưu…' : 'Lưu ngoại hình & vào studio'}
        </Button>
      </Bottom>
    </Wrapper>
  )
}
