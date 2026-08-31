import React, { useEffect, useState } from 'react'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import { TagGameSnapshot } from '../../../types/TagGame'
import GameChannelChat from './GameChannelChat'

const idleGame: TagGameSnapshot = {
  status: 'IDLE',
  gameId: 'tag',
  roundId: '',
  startedBy: '',
  taggerSessionId: '',
  score: 0,
  settlementStatus: 'NONE',
  winnerIds: [],
  startedAt: 0,
  endsAt: 0,
  resultMessage: '',
  attendees: [],
}

export default function TagGameOverlay() {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const [game, setGame] = useState<TagGameSnapshot>(idleGame)
  const [now, setNow] = useState(Date.now())
  const [tagFlash, setTagFlash] = useState('')
  const tagFlashTimerRef = React.useRef<number>()

  useEffect(() => {
    const activeGame = phaserGame.scene.keys.game as Game | undefined
    if (!activeGame?.network) return

    const handleUpdate = (payload: TagGameSnapshot) => setGame(payload)
    const handleTagged = (payload: { displayName: string; score: number }) => {
      setTagFlash(`${payload.displayName} đang là Người bắt!`)
      if (tagFlashTimerRef.current) window.clearTimeout(tagFlashTimerRef.current)
      tagFlashTimerRef.current = window.setTimeout(() => {
        setTagFlash('')
        tagFlashTimerRef.current = undefined
      }, 1000)
    }

    activeGame.network.onTagGameUpdated(handleUpdate)
    activeGame.network.onTagGameTagged(handleTagged)
    return () => {
      if (tagFlashTimerRef.current) window.clearTimeout(tagFlashTimerRef.current)
      phaserEvents.off(Event.TAG_GAME_UPDATED, handleUpdate)
      phaserEvents.off(Event.TAG_GAME_TAGGED, handleTagged)
    }
  }, [])

  useEffect(() => {
    if (game.status === 'IDLE' || game.status === 'RESULT') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [game.status, game.roundId])

  if (game.status === 'IDLE') return null

  const isCountdown = game.status === 'COUNTDOWN'
  const isPlaying = game.status === 'PLAYING'
  const secondsLeft = isCountdown
    ? Math.max(0, Math.ceil((game.startedAt - now) / 1000))
    : Math.max(0, Math.ceil((game.endsAt - now) / 1000))
  const tagger = game.attendees.find((attendee) => attendee.sessionId === game.taggerSessionId)

  return (
    <div className="tag-game-overlay" aria-live="polite">
      <section className={`tag-game-panel tag-game-${game.status.toLowerCase()}`}>
        <div className="tag-game-panel-head">
          <div>
            <span className="tag-game-kicker">STUDIO COMMONS / ĐIỂM DANH</span>
            <h2>Đuổi bắt đổi vai</h2>
          </div>
          <strong>{game.attendees.length} người</strong>
        </div>

        {isCountdown && (
          <div className="tag-game-countdown">
            <strong>{secondsLeft || 1}</strong>
            <span>Chuẩn bị chạy!</span>
          </div>
        )}

        {isPlaying && (
          <div className="tag-game-live-status">
            <div><span>NGƯỜI BẮT</span><strong>{tagger?.displayName || 'Đang chọn…'}</strong></div>
            <div><span>LƯỢT BẮT</span><strong>{game.score}</strong></div>
            <div><span>CÒN LẠI</span><strong>{secondsLeft}s</strong></div>
          </div>
        )}

        {game.status === 'RESULT' && (
          <div className="tag-game-result">
            <strong>Hết giờ!</strong>
            <span>{game.resultMessage}</span>
          </div>
        )}

        <div className={`tag-game-callout-slot ${isPlaying && sessionId === game.taggerSessionId ? '' : 'is-empty'}`}>
          {isPlaying && sessionId === game.taggerSessionId ? <div className="tag-game-player-callout">⚡ BẠN ĐANG LÀ NGƯỜI BẮT — chạm người khác!</div> : <span aria-hidden="true">&nbsp;</span>}
        </div>
        <div className={`tag-game-flash-slot ${tagFlash ? '' : 'is-empty'}`} aria-live="polite">
          {tagFlash ? <div className="tag-game-flash">✦ {tagFlash}</div> : <span aria-hidden="true">&nbsp;</span>}
        </div>

        <div className="tag-game-attendance">
          <span>ĐIỂM DANH</span>
          <div>{game.attendees.map((attendee) => <b className={attendee.connected ? '' : 'is-offline'} key={attendee.sessionId}>{attendee.displayName}</b>)}</div>
        </div>
        <GameChannelChat channel="TAG" defaultOpen={false} />
      </section>
    </div>
  )
}
