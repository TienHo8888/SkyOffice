import React, { useEffect, useMemo, useState } from 'react'

import { Event, phaserEvents } from '../events/EventCenter'
import { useAppDispatch, useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { setSocialPeople } from '../stores/SocialStore'
import { getActiveWorldNetwork, getActiveWorldScene } from '../utils/activeWorld'
import type {
  FriendshipView,
  SocialNotification,
  SocialPartyActionPayload,
  SocialPartyState,
  SocialPeopleSearchEntry,
} from '../../../types/Social'
import LpcAvatarPreview from './LpcAvatarPreview'

type PeopleTab = 'friends' | 'requests' | 'discover' | 'notifications'

interface Props {
  open: boolean
  onClose: () => void
}

function requestId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 9)
  return `social:${prefix}:${Date.now()}:${random}`
}

function displayPresence(friend: FriendshipView) {
  if (!friend.presence?.online) return 'OFFLINE'
  if (friend.presence.status === 'IN_ACTIVITY') return 'IN ACTIVITY'
  if (friend.presence.status === 'AWAY') return 'AWAY'
  if (friend.presence.status === 'BUSY') return 'BUSY'
  return 'ONLINE'
}

function presenceRoomLabel(room?: string) {
  if (room === 'FISHING') return 'Fishing · Riverbend'
  if (room === 'HOME') return 'Home'
  return room?.replace(/_/g, ' ') || ''
}

function notificationCopy(notification: SocialNotification) {
  const actor = notification.actorName || 'Một người chơi'
  if (notification.type === 'FRIEND_REQUEST') return `${actor} đã gửi lời mời kết bạn.`
  if (notification.type === 'FRIEND_ACCEPTED') return `${actor} đã chấp nhận lời mời kết bạn.`
  if (notification.type === 'PARTY_INVITE') return `${actor} đã mời bạn vào party.`
  if (notification.type === 'ROOM_LIKED') return `${actor} đã thích Personal Room của bạn.`
  if (notification.type === 'GIFT_RECEIVED') return `${actor} đã gửi tặng bạn một món đồ.`
  return 'Bạn có một hoạt động mới trong Studio Commons.'
}

function sendPartyAction(payload: Omit<SocialPartyActionPayload, 'requestId'>) {
  const network = getActiveWorldNetwork()
  if (!network) return false
  network.partyAction({ ...payload, requestId: requestId(payload.action.toLowerCase()) })
  return true
}

function Avatar({ config, className = '' }: { config: FriendshipView['avatar']; className?: string }) {
  return <LpcAvatarPreview className={`social-mini-avatar ${className}`} config={config.characterConfig} animation="idle" direction="down" showWeapon={false} />
}

function FriendRow({
  friend,
  onInvite,
  onRemove,
  onBlock,
  onVisit,
  canInvite,
  busy,
}: {
  friend: FriendshipView
  onInvite: (friend: FriendshipView) => void
  onRemove: (friend: FriendshipView) => void
  onBlock: (friend: FriendshipView) => void
  onVisit: (friend: FriendshipView) => void
  canInvite: boolean
  busy: string
}) {
  const online = Boolean(friend.presence?.online)
  return (
    <article className="social-person-row">
      <Avatar config={friend.avatar} />
      <div className="social-person-copy">
        <strong>{friend.displayName}</strong>
        <span className={`social-presence ${online ? 'is-online' : 'is-offline'}`}><i />{displayPresence(friend)}{friend.presence?.currentRoom ? ` · ${presenceRoomLabel(friend.presence.currentRoom)}` : ''}</span>
      </div>
      <div className="social-person-actions">
        <button className="studio-secondary" disabled={busy === `visit:${friend.userId}`} onClick={() => onVisit(friend)}>Home</button>
        <button className="studio-secondary" disabled={!canInvite || busy === `invite:${friend.userId}`} onClick={() => onInvite(friend)}>{busy === `invite:${friend.userId}` ? '…' : 'Party'}</button>
        <button className="studio-quiet" disabled={busy === `remove:${friend.userId}`} onClick={() => onRemove(friend)} aria-label={`Xóa ${friend.displayName} khỏi danh sách bạn bè`}>Remove</button>
        <button className="studio-quiet is-danger" disabled={busy === `block:${friend.userId}`} onClick={() => onBlock(friend)}>Block</button>
      </div>
    </article>
  )
}

export default function SocialPeoplePanel({ open, onClose }: Props) {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.user.authToken)
  const people = useAppSelector((state) => state.social.people)
  const [tab, setTab] = useState<PeopleTab>('friends')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SocialPeopleSearchEntry[]>([])
  const [party, setParty] = useState<SocialPartyState | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    if (!token) return
    try {
      dispatch(setSocialPeople(await studioApi.socialPeople(token)))
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải danh sách social.')
    }
  }

  useEffect(() => {
    if (!open || !token) return
    let active = true
    studioApi.socialPeople(token)
      .then((snapshot) => { if (active) dispatch(setSocialPeople(snapshot)) })
      .catch((requestError) => { if (active) setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải danh sách social.') })
    return () => { active = false }
  }, [dispatch, open, token])

  useEffect(() => {
    if (!open) return
    const game = getActiveWorldScene()
    game?.disableKeys('social-people')
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      game?.enableKeys('social-people')
    }
  }, [onClose, open])

  useEffect(() => {
    const handlePartyState = (nextParty: SocialPartyState | null) => setParty(nextParty)
    const game = getActiveWorldScene()
    if (game?.network) game.network.onPartyState(handlePartyState)
    else phaserEvents.on(Event.PARTY_STATE, handlePartyState)
    return () => { phaserEvents.off(Event.PARTY_STATE, handlePartyState) }
  }, [])

  useEffect(() => {
    if (!open || !token || tab !== 'discover' || query.trim().length < 2) {
      setSearchResults([])
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      studioApi.searchSocialPeople(token, query.trim())
        .then((results) => { if (active) setSearchResults(results) })
        .catch((requestError) => { if (active) setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tìm người chơi.') })
    }, 240)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, query, tab, token])

  useEffect(() => {
    if (!error && !notice) return
    const timer = window.setTimeout(() => {
      setError('')
      setNotice('')
    }, 3600)
    return () => window.clearTimeout(timer)
  }, [error, notice])

  const incoming = people?.incomingRequests || []
  const outgoing = people?.outgoingRequests || []
  const friends = people?.friends || []
  const unread = people?.unreadNotifications || 0
  const sortedFriends = useMemo(() => [...friends].sort((left, right) => Number(Boolean(right.presence?.online)) - Number(Boolean(left.presence?.online)) || left.displayName.localeCompare(right.displayName)), [friends])

  if (!open) return null

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    setError('')
    try { await task() } catch (requestError) { setError(requestError instanceof StudioApiError ? requestError.message : 'Social action failed.') } finally { setBusy('') }
  }

  const createParty = () => {
    if (!sendPartyAction({ action: 'CREATE' })) setError('Kết nối game chưa sẵn sàng.')
  }

  const invite = (friend: FriendshipView) => {
    if (!party) {
      setError('Hãy tạo party trước khi mời bạn.')
      return
    }
    if (!sendPartyAction({ action: 'INVITE', partyId: party.partyId, targetUserId: friend.userId, targetSessionId: friend.presence?.sessionId })) {
      setError('Kết nối game chưa sẵn sàng.')
      return
    }
    setNotice(`Đã gửi lời mời party cho ${friend.displayName}.`)
  }

  const accept = (friendshipId: string) => run(`accept:${friendshipId}`, async () => {
    if (!token) return
    await studioApi.acceptFriendRequest(token, friendshipId)
    await refresh()
    setNotice('Đã kết bạn.')
  })

  const decline = (friendshipId: string) => run(`decline:${friendshipId}`, async () => {
    if (!token) return
    await studioApi.declineFriendRequest(token, friendshipId)
    await refresh()
    setNotice('Đã bỏ qua lời mời.')
  })

  const remove = (friend: FriendshipView) => run(`remove:${friend.userId}`, async () => {
    if (!token) return
    await studioApi.removeFriend(token, friend.userId)
    await refresh()
    setNotice(`Đã xóa ${friend.displayName} khỏi danh sách bạn bè.`)
  })

  const block = (friend: FriendshipView) => run(`block:${friend.userId}`, async () => {
    if (!token) return
    await studioApi.blockUser(token, friend.userId)
    await refresh()
    setNotice(`Đã chặn ${friend.displayName}.`)
  })

  const visitHome = (person: { userId: string; displayName: string }) => run(`visit:${person.userId}`, async () => {
    const network = getActiveWorldNetwork()
    if (!network) throw new Error('Kết nối game chưa sẵn sàng.')
    try {
      await network.joinHome(person.userId)
      setNotice(`Đang mở Home của ${person.displayName}.`)
      onClose()
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : requestError instanceof Error ? requestError.message : 'Không thể vào Home này.')
    }
  })

  const request = (entry: SocialPeopleSearchEntry) => run(`request:${entry.userId}`, async () => {
    if (!token) return
    await studioApi.requestFriend(token, entry.userId)
    await refresh()
    setSearchResults((current) => current.map((candidate) => candidate.userId === entry.userId ? { ...candidate, friendshipStatus: 'OUTGOING' } : candidate))
    setNotice(`Đã gửi lời mời cho ${entry.displayName}.`)
  })

  const blockSearchResult = (entry: SocialPeopleSearchEntry) => run(`search-block:${entry.userId}`, async () => {
    if (!token) return
    await studioApi.blockUser(token, entry.userId)
    setSearchResults((current) => current.filter((candidate) => candidate.userId !== entry.userId))
    await refresh()
    setNotice(`Đã chặn ${entry.displayName}.`)
  })

  const markRead = (notification: SocialNotification) => {
    if (!token || notification.readAt) return
    void run(`notification:${notification.id}`, async () => {
      await studioApi.markSocialNotificationRead(token, notification.id)
      await refresh()
    })
  }

  const markAllRead = () => run('notifications-all', async () => {
    if (!token) return
    await studioApi.markAllSocialNotificationsRead(token)
    await refresh()
  })

  const renderFriends = () => (
    <div className="social-people-list">
      {!friends.length && <div className="social-people-empty">Chưa có bạn bè. Mở tab Discover để tìm đồng đội trong Studio Commons.</div>}
      {sortedFriends.map((friend) => <FriendRow key={friend.id} friend={friend} onInvite={invite} onRemove={remove} onBlock={block} onVisit={visitHome} canInvite={Boolean(party && party.status === 'OPEN' && party.members.length < 4)} busy={busy} />)}
    </div>
  )

  const renderRequests = () => (
    <div className="social-people-list">
      {incoming.length > 0 && <div className="social-list-label">INCOMING REQUESTS</div>}
      {!incoming.length && !outgoing.length && <div className="social-people-empty">Không có lời mời kết bạn đang chờ.</div>}
      {incoming.map((friend) => <article className="social-person-row" key={friend.id}><Avatar config={friend.avatar} /><div className="social-person-copy"><strong>{friend.displayName}</strong><span>Muốn kết nối với bạn trong văn phòng.</span></div><div className="social-person-actions"><button className="studio-primary" disabled={busy === `accept:${friend.id}`} onClick={() => accept(friend.id)}>Accept</button><button className="studio-quiet" disabled={busy === `decline:${friend.id}`} onClick={() => decline(friend.id)}>Decline</button></div></article>)}
      {outgoing.length > 0 && <div className="social-list-label">OUTGOING REQUESTS</div>}
      {outgoing.map((friend) => <article className="social-person-row is-muted" key={friend.id}><Avatar config={friend.avatar} /><div className="social-person-copy"><strong>{friend.displayName}</strong><span>Đang chờ người chơi chấp nhận.</span></div><span className="social-request-state">PENDING</span></article>)}
    </div>
  )

  const renderDiscover = () => (
    <div className="social-people-list">
      {query.trim().length < 2 && <div className="social-people-empty">Nhập ít nhất 2 ký tự để tìm theo username hoặc tên hiển thị.</div>}
      {query.trim().length >= 2 && !searchResults.length && <div className="social-people-empty">Không tìm thấy người chơi phù hợp.</div>}
      {searchResults.map((entry) => <article className="social-person-row" key={entry.userId}><Avatar config={entry.avatar} /><div className="social-person-copy"><strong>{entry.displayName}</strong><span>@{entry.username || 'player'} · {entry.presence.online ? 'ONLINE' : 'OFFLINE'}</span></div><div className="social-person-actions"><button className="studio-secondary" disabled={busy === `visit:${entry.userId}`} onClick={() => visitHome(entry)}>Home</button>{entry.friendshipStatus === 'NONE' && <button className="studio-primary" disabled={busy === `request:${entry.userId}`} onClick={() => request(entry)}>Add friend</button>}{entry.friendshipStatus === 'INCOMING' && <span className="social-request-state">INCOMING</span>}{entry.friendshipStatus === 'OUTGOING' && <span className="social-request-state">PENDING</span>}{entry.friendshipStatus === 'FRIENDS' && <span className="social-request-state is-good">FRIENDS</span>}<button className="studio-quiet is-danger" disabled={busy === `search-block:${entry.userId}`} onClick={() => blockSearchResult(entry)}>Block</button></div></article>)}
    </div>
  )

  const notifications = people?.notifications || []
  const renderNotifications = () => (
    <div className="social-people-list">
      <div className="social-notification-toolbar"><span>{unread ? `${unread} chưa đọc` : 'Đã đọc hết'}</span>{unread > 0 && <button className="studio-quiet" disabled={busy === 'notifications-all'} onClick={markAllRead}>Mark all read</button>}</div>
      {!notifications.length && <div className="social-people-empty">Chưa có thông báo social.</div>}
      {notifications.map((notification) => <button className={`social-notification-row ${notification.readAt ? '' : 'is-unread'}`} key={notification.id} onClick={() => markRead(notification)}><span className="social-notification-icon">{notification.type === 'PARTY_INVITE' ? '✦' : notification.type === 'FRIEND_REQUEST' ? '♧' : '•'}</span><span><strong>{notificationCopy(notification)}</strong><small>{new Date(notification.createdAt).toLocaleString('vi-VN')}</small></span></button>)}
    </div>
  )

  return (
    <div className="social-people-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="social-people-panel" role="dialog" aria-modal="true" aria-labelledby="social-people-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="social-people-header">
          <div><span className="studio-kicker">SOCIAL IDENTITY / PEOPLE GRAPH</span><h2 id="social-people-title">People & Friends</h2><p>Kết nối, tạo party và giữ liên lạc trong Studio Commons.</p></div>
          <button className="game-feature-close" aria-label="Đóng People & Friends" onClick={onClose}>×</button>
        </header>
        <div className="social-people-toolbar"><span className="social-party-status">{party ? `Party ${party.members.length}/4 · ${party.status}` : 'Chưa ở trong party'}</span>{!party && <button className="studio-primary" onClick={createParty}>+ Create party</button>}{party && <button className="studio-secondary" onClick={() => sendPartyAction({ action: 'LEAVE', partyId: party.partyId })}>Leave party</button>}</div>
        <nav className="social-people-tabs" aria-label="Social people tabs"><button className={tab === 'friends' ? 'is-active' : ''} onClick={() => setTab('friends')}>Friends <b>{friends.length}</b></button><button className={tab === 'requests' ? 'is-active' : ''} onClick={() => setTab('requests')}>Requests <b>{incoming.length}</b></button><button className={tab === 'discover' ? 'is-active' : ''} onClick={() => setTab('discover')}>Discover</button><button className={tab === 'notifications' ? 'is-active' : ''} onClick={() => setTab('notifications')}>Alerts <b>{unread}</b></button></nav>
        {tab === 'discover' && <div className="social-people-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm username hoặc tên hiển thị…" aria-label="Tìm người chơi" /></div>}
        {(error || notice) && <div className={`social-inline-feedback ${error ? 'is-error' : 'is-notice'}`}>{error || notice}</div>}
        {!people ? <div className="social-people-empty">Đang đồng bộ danh sách social…</div> : tab === 'friends' ? renderFriends() : tab === 'requests' ? renderRequests() : tab === 'discover' ? renderDiscover() : renderNotifications()}
      </section>
    </div>
  )
}
