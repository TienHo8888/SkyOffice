import React, { useEffect, useState } from 'react'

import { useAppSelector } from '../hooks'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { normalizeCharacterConfig } from '../../../types/Avatar'
import LpcAvatarPreview from './LpcAvatarPreview'
import { SocialLeaderboardEntry } from '../../../types/Social'
import { studioRoomName } from '../../../types/StudioWorld'

interface Props {
  open: boolean
  onClose: () => void
}

export default function LeaderboardPanel({ open, onClose }: Props) {
  const token = useAppSelector((state) => state.user.authToken)
  const currentUserId = useAppSelector((state) => state.user.authUser?.id)
  const [entries, setEntries] = useState<SocialLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !token) return
    let cancelled = false

    const refresh = async () => {
      setLoading(true)
      try {
        const nextEntries = await studioApi.leaderboard(token)
        if (!cancelled) {
          setEntries(nextEntries)
          setError('')
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải bảng xếp hạng.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, token])

  if (!open) return null

  return (
    <div className="leaderboard-layer" role="presentation" onMouseDown={onClose}>
      <section className="leaderboard-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="leaderboard-header">
          <div>
            <span className="leaderboard-kicker">STUDIO LIFE / TOP COIN</span>
            <h2 id="leaderboard-title">Bảng xếp hạng người chơi</h2>
            <p>Xếp theo số Coin hiện có trong studio.</p>
          </div>
          <button className="leaderboard-close" aria-label="Đóng bảng xếp hạng" onClick={onClose}>×</button>
        </header>

        <div className="leaderboard-meta"><span><i /> LIVE WALLET</span><small>{loading ? 'Đang cập nhật…' : `${entries.length} người chơi`}</small></div>
        {error && <div className="leaderboard-error">{error}</div>}
        {!entries.length && loading && <div className="leaderboard-empty">Đang tải dữ liệu Coin…</div>}
        {!entries.length && !loading && !error && <div className="leaderboard-empty">Chưa có dữ liệu xếp hạng.</div>}
        {entries.length > 0 && <div className="leaderboard-list">
          {entries.map((entry) => <article className={`leaderboard-row ${entry.userId === currentUserId ? 'is-me' : ''} ${entry.rank <= 3 ? `is-top-${entry.rank}` : ''}`} key={entry.userId}>
            <div className="leaderboard-rank">{entry.rank <= 3 ? ['♛', '◆', '◇'][entry.rank - 1] : String(entry.rank).padStart(2, '0')}</div>
            <div className="leaderboard-avatar"><LpcAvatarPreview config={entry.avatar?.characterConfig || normalizeCharacterConfig(undefined, entry.avatarKey)} animation="idle" direction="down" showWeapon={false} />{entry.online && <i />}</div>
            <div className="leaderboard-player"><strong>{entry.displayName}{entry.userId === currentUserId && <b>BẠN</b>}</strong><small>LV {entry.gameLevel} · {entry.online ? studioRoomName(entry.currentRoom) : 'OFFLINE'}</small></div>
            <div className="leaderboard-coins"><strong>✦ {entry.coinBalance.toLocaleString()}</strong><small>COIN</small></div>
          </article>)}
        </div>}
        <footer className="leaderboard-footer">Coin là tiền tệ ảo dùng trong các game của STU / AI HUB.</footer>
      </section>
    </div>
  )
}
