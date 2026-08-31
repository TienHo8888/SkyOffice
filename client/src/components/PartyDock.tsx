import React, { useEffect, useMemo, useState } from 'react'

import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import { getActiveWorldNetwork, getActiveWorldScene } from '../utils/activeWorld'
import type { SocialGameId, SocialPartyError, SocialPartyInvite, SocialPartyMember, SocialPartyState } from '../../../types/Social'
import LpcAvatarPreview from './LpcAvatarPreview'

function actionId(prefix: string) {
  return `party-ui:${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function memberStatus(member: SocialPartyMember) {
  if (member.status === 'IN_ACTIVITY') return 'IN GAME'
  if (member.status === 'READY') return 'READY'
  if (member.status === 'DISCONNECTED') return 'OFFLINE'
  return 'IN PARTY'
}

function sendPartyAction(payload: { action: 'ACCEPT' | 'DECLINE' | 'LEAVE' | 'KICK' | 'READY' | 'ACTIVITY_REQUEST'; partyId?: string; inviteId?: string; targetUserId?: string; mode?: SocialGameId }) {
  const network = getActiveWorldNetwork()
  if (!network) return false
  network.partyAction({ ...payload, requestId: actionId(payload.action.toLowerCase()), ...(payload.mode ? { activityType: 'SOCIAL_GAME' as const } : {}) })
  return true
}

function PartyMemberRow({ member, isLeader, currentUserId, onKick }: { member: SocialPartyMember; isLeader: boolean; currentUserId?: string; onKick: (member: SocialPartyMember) => void }) {
  return <div className="party-member-row"><LpcAvatarPreview className="party-member-avatar" config={member.avatar.characterConfig} animation="idle" direction="down" showWeapon={false} /><div className="party-member-copy"><strong>{member.displayName}</strong><span className={member.status === 'READY' ? 'is-ready' : ''}>{memberStatus(member)}</span></div>{member.userId === currentUserId && <b className="party-you-tag">YOU</b>}{isLeader && member.userId !== currentUserId && <button className="studio-quiet is-danger" onClick={() => onKick(member)}>Kick</button>}</div>
}

export default function PartyDock() {
  const currentUserId = useAppSelector((state) => state.user.authUser?.id)
  const [party, setParty] = useState<SocialPartyState | null>(null)
  const [invites, setInvites] = useState<SocialPartyInvite[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handlePartyState = (nextParty: SocialPartyState | null) => setParty(nextParty)
    const handlePartyInvite = (invite: SocialPartyInvite) => {
      setInvites((current) => [...current.filter((item) => item.inviteId !== invite.inviteId), invite])
      setNotice(`Bạn được mời vào party bởi ${invite.inviterName}.`)
    }
    const handlePartyError = (payload: SocialPartyError) => setError(payload.message)
    const handlePartyEvent = (payload: { type?: string; reason?: string }) => {
      if (payload.type === 'DISBANDED') setNotice('Party đã kết thúc.')
      if (payload.type === 'MEMBER_JOINED') setNotice('Một người bạn đã vào party.')
      if (payload.type === 'MEMBER_LEFT') setNotice(payload.reason === 'kicked' ? 'Một thành viên đã bị kick.' : 'Một thành viên đã rời party.')
    }

    const game = getActiveWorldScene()
    if (game?.network) game.network.onPartyState(handlePartyState)
    else phaserEvents.on(Event.PARTY_STATE, handlePartyState)
    phaserEvents.on(Event.PARTY_INVITE, handlePartyInvite)
    phaserEvents.on(Event.PARTY_ERROR, handlePartyError)
    phaserEvents.on(Event.PARTY_EVENT, handlePartyEvent)
    return () => {
      phaserEvents.off(Event.PARTY_STATE, handlePartyState)
      phaserEvents.off(Event.PARTY_INVITE, handlePartyInvite)
      phaserEvents.off(Event.PARTY_ERROR, handlePartyError)
      phaserEvents.off(Event.PARTY_EVENT, handlePartyEvent)
    }
  }, [])

  useEffect(() => {
    if (!invites.length) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setInvites((current) => current.filter((invite) => new Date(invite.expiresAt).getTime() > now))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [invites.length])

  useEffect(() => {
    if (!notice && !error) return
    const timer = window.setTimeout(() => {
      setNotice('')
      setError('')
    }, 3600)
    return () => window.clearTimeout(timer)
  }, [error, notice])

  const isLeader = Boolean(party && party.leaderId === currentUserId)
  const canStart = Boolean(isLeader && party?.status === 'OPEN' && party.members.length > 0)
  const visibleMembers = useMemo(() => party?.members || [], [party?.members])

  const acceptInvite = (invite: SocialPartyInvite) => {
    if (!sendPartyAction({ action: 'ACCEPT', inviteId: invite.inviteId, partyId: invite.partyId })) { setError('Kết nối game chưa sẵn sàng.'); return }
    setInvites((current) => current.filter((item) => item.inviteId !== invite.inviteId))
  }

  const declineInvite = (invite: SocialPartyInvite) => {
    if (!sendPartyAction({ action: 'DECLINE', inviteId: invite.inviteId, partyId: invite.partyId })) { setError('Kết nối game chưa sẵn sàng.'); return }
    setInvites((current) => current.filter((item) => item.inviteId !== invite.inviteId))
  }

  const toggleReady = () => {
    if (!party || !sendPartyAction({ action: 'READY', partyId: party.partyId })) setError('Kết nối game chưa sẵn sàng.')
  }

  const leave = () => {
    if (!party || !sendPartyAction({ action: 'LEAVE', partyId: party.partyId })) setError('Kết nối game chưa sẵn sàng.')
  }

  const kick = (member: SocialPartyMember) => {
    if (!party || !sendPartyAction({ action: 'KICK', partyId: party.partyId, targetUserId: member.userId })) setError('Kết nối game chưa sẵn sàng.')
  }

  const startActivity = (mode: SocialGameId) => {
    if (!party || !sendPartyAction({ action: 'ACTIVITY_REQUEST', partyId: party.partyId, mode })) setError('Kết nối game chưa sẵn sàng.')
  }

  if (!party && !invites.length) return null

  return <aside className="party-dock" aria-label="Party social"><div className="party-dock-head"><div><span className="studio-kicker">SOCIAL PARTY</span><strong>{party ? `Party ${party.members.length}/4` : 'Party invite'}</strong></div>{party && <span className={`party-dock-state is-${party.status.toLowerCase()}`}>{party.status}</span>}</div>{(notice || error) && <div className={`social-inline-feedback ${error ? 'is-error' : 'is-notice'}`}>{error || notice}</div>}{invites.length > 0 && <div className="party-invite-list">{invites.map((invite) => <article className="party-invite" key={invite.inviteId}><LpcAvatarPreview className="party-invite-avatar" config={invite.inviterAvatar.characterConfig} animation="idle" direction="down" showWeapon={false} /><div><strong>{invite.inviterName}</strong><span>Mời bạn vào party · còn {Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / 1000))}s</span></div><div className="party-invite-actions"><button className="studio-primary" onClick={() => acceptInvite(invite)}>Join</button><button className="studio-quiet" onClick={() => declineInvite(invite)}>×</button></div></article>)}</div>}{party && <><div className="party-member-list">{visibleMembers.map((member) => <PartyMemberRow key={member.userId} member={member} isLeader={isLeader} currentUserId={currentUserId} onKick={kick} />)}</div><div className="party-dock-actions"><button className="studio-secondary" onClick={toggleReady}>{party.members.find((member) => member.userId === currentUserId)?.status === 'READY' ? 'Unready' : 'Ready'}</button>{canStart && <><button className="studio-primary" onClick={() => startActivity('PAINT_TILES')}>Paint</button><button className="studio-primary" onClick={() => startActivity('TREASURE_HUNT')}>Treasure</button></>}<button className="studio-quiet is-danger" onClick={leave}>Leave</button></div></>}</aside>
}
