import React, { useEffect, useMemo, useState } from 'react'

import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { getActiveWorldNetwork, getActiveWorldScene } from '../utils/activeWorld'
import { normalizeCharacterConfig } from '../../../types/Avatar'
import type { CharacterConfig } from '../../../types/Avatar'
import type { PublicSocialProfile, SocialPartyState } from '../../../types/Social'
import type { StudioAvatarKey } from '../../../types/Studio'
import LpcAvatarPreview from './LpcAvatarPreview'

interface PlayerContextTarget {
  sessionId: string
  userId: string
  displayName: string
  distance: number
  avatarKey: string
  characterConfig?: CharacterConfig
}

function actionId(prefix: string) {
  return `context:${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

export default function SocialContextCard() {
  const token = useAppSelector((state) => state.user.authToken)
  const currentUserId = useAppSelector((state) => state.user.authUser?.id)
  const activeWorld = useAppSelector((state) => state.world.worldId)
  const people = useAppSelector((state) => state.social.people)
  const [target, setTarget] = useState<PlayerContextTarget | null>(null)
  const [profile, setProfile] = useState<PublicSocialProfile | null>(null)
  const [party, setParty] = useState<SocialPartyState | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleContext = (nextTarget: PlayerContextTarget) => {
      setTarget(nextTarget)
      setProfile(null)
      setNotice('')
      setError('')
    }
    phaserEvents.on(Event.PLAYER_CONTEXT, handleContext)
    return () => { phaserEvents.off(Event.PLAYER_CONTEXT, handleContext) }
  }, [])

  useEffect(() => {
    const handlePartyState = (nextParty: SocialPartyState | null) => setParty(nextParty)
    phaserEvents.on(Event.PARTY_STATE, handlePartyState)
    return () => { phaserEvents.off(Event.PARTY_STATE, handlePartyState) }
  }, [])

  useEffect(() => {
    if (!target) return
    const game = getActiveWorldScene()
    game?.disableKeys('social-context')
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTarget(null)
        setProfile(null)
        setNotice('')
        setError('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      game?.enableKeys('social-context')
    }
  // `close` is intentionally declared below; the effect only runs after the
  // component has rendered a target and the callback identity is not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  useEffect(() => {
    if (!notice && !error) return
    const timer = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [error, notice])

  const avatarConfig = useMemo(() => normalizeCharacterConfig(target?.characterConfig, target?.avatarKey as StudioAvatarKey | undefined), [target?.avatarKey, target?.characterConfig])
  const friendship = target && people ? (
    people.friends.some((friend) => friend.userId === target.userId) ? 'FRIENDS' :
      people.incomingRequests.some((friend) => friend.userId === target.userId) ? 'INCOMING' :
        people.outgoingRequests.some((friend) => friend.userId === target.userId) ? 'OUTGOING' : 'NONE'
  ) : 'NONE'

  if (!target) return null

  const game = getActiveWorldScene()
  const close = () => {
    setTarget(null)
    setProfile(null)
    setNotice('')
    setError('')
  }

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    setError('')
    try { await task() } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Social action failed.') } finally { setBusy('') }
  }

  const wave = (emoteId: 'WAVE' | 'HEART' | 'CLAP') => {
    const network = getActiveWorldNetwork()
    if (!network) { setError('Kết nối game chưa sẵn sàng.'); return }
    network.socialEmote(emoteId)
    setNotice(emoteId === 'WAVE' ? 'Đã vẫy tay chào.' : 'Đã gửi reaction.')
  }

  const addFriend = () => run('friend', async () => {
    if (!token || !target) return
    await studioApi.requestFriend(token, target.userId)
    setNotice(`Đã gửi lời mời kết bạn cho ${target.displayName}.`)
  })

  const inviteParty = () => {
    const network = getActiveWorldNetwork()
    if (!network) { setError('Kết nối game chưa sẵn sàng.'); return }
    if (!party) { setError('Hãy tạo party trong People & Friends trước.'); return }
    network.partyAction({ action: 'INVITE', requestId: actionId('invite'), partyId: party.partyId, targetUserId: target.userId, targetSessionId: target.sessionId })
    setNotice(`Đã gửi lời mời party cho ${target.displayName}.`)
  }

  const challenge = () => {
    phaserEvents.emit(Event.PLAYER_INTERACTION, { sessionId: target.sessionId, displayName: target.displayName, distance: target.distance })
    close()
  }

  const inspect = () => run('profile', async () => {
    if (!token || !target) return
    setProfile(await studioApi.socialProfile(token, target.userId))
  })

  const visitHome = () => run('home', async () => {
    if (!target) return
    const network = getActiveWorldNetwork()
    if (!network) throw new Error('Kết nối game chưa sẵn sàng.')
    await network.joinHome(target.userId)
    setNotice(`Đang mở Home của ${target.displayName}.`)
    close()
  })

  return (
    <div className="social-context-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && close()}>
      <section className="social-context-card" role="dialog" aria-modal="true" aria-labelledby="social-context-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="social-context-header"><div><span className="studio-kicker">NEARBY PLAYER / SOCIAL CONTEXT</span><h2 id="social-context-title">{target.displayName}</h2><small>{Math.round(target.distance)} px away</small></div><button className="game-feature-close" aria-label="Đóng menu người chơi" onClick={close}>×</button></header>
        <div className="social-context-identity"><LpcAvatarPreview className="social-context-avatar" config={avatarConfig} animation="idle" direction="down" showWeapon={false} /><div><span className="social-context-status"><i /> {activeWorld === 'FISHING' ? 'AT RIVERBEND' : activeWorld === 'HOME' ? 'AT HOME' : 'IN THE OFFICE'}</span><p>Gặp nhau trong cùng destination là điểm bắt đầu của mọi kết nối.</p></div></div>
        {(notice || error) && <div className={`social-inline-feedback ${error ? 'is-error' : 'is-notice'}`}>{error || notice}</div>}
        {!profile ? <div className="social-context-actions"><button className="studio-primary" onClick={() => wave('WAVE')}>👋 Wave</button><button className="studio-secondary" onClick={() => wave('HEART')}>♥ React</button>{friendship === 'NONE' && target.userId !== currentUserId && <button className="studio-secondary" disabled={busy === 'friend'} onClick={addFriend}>{busy === 'friend' ? 'Sending…' : 'Add friend'}</button>}{friendship === 'FRIENDS' && <span className="social-context-chip">FRIENDS</span>}<button className="studio-secondary" disabled={busy === 'profile'} onClick={inspect}>{busy === 'profile' ? 'Loading…' : 'View profile'}</button><button className="studio-secondary" disabled={busy === 'home'} onClick={() => void visitHome()}>Visit Home</button><button className="studio-secondary" disabled={!party} onClick={inviteParty} title={party ? 'Mời vào party hiện tại' : 'Tạo party trong People & Friends trước'}>Invite party</button><button className="studio-primary" onClick={challenge}>Challenge RPS</button></div> : <div className="social-context-profile"><LpcAvatarPreview className="social-context-profile-avatar" config={profile.avatar.characterConfig} animation="idle" direction="down" showWeapon={false} /><div><strong>{profile.displayName}</strong><span>{profile.title} · Level {profile.gameLevel}</span><span>{profile.career || 'Chưa chọn nghề'} · {profile.club}</span><small>{profile.achievements.length} achievements · {profile.collectionCount}/{profile.collectionTotal} cosmetics</small></div><button className="studio-quiet" onClick={() => setProfile(null)}>Back</button></div>}
      </section>
    </div>
  )
}
