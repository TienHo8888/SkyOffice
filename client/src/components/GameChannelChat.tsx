import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

import { GameChatChannel, GameChatMessage, GameChatServerPayload } from '../../../types/GameChat'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const CHAT_LABELS: Partial<Record<GameChatChannel, string>> = {
  BACCARAT: 'Baccarat', BLACKJACK: 'Xì dách', POKER: "Texas Hold'em", SICBO: 'Sic Bo',
  BAU_CUA: 'Bầu Cua', CHESS: 'Cờ', TIEN_LEN: 'Tiến Lên', DICE_DUEL: 'Dice Duel',
  LUCKY_DRAW: 'Lucky Draw', TAG: 'Đuổi bắt', RPS: 'Oản Tù Xì', THROWABLES: 'Ném đồ',
  HIDE_SEEK: 'Trốn tìm', FREEZE_TAG: 'Đóng băng', HOT_BOMB: 'Bom hẹn giờ',
  CAPTURE_FLAG: 'Cướp cờ', PAINT_TILES: 'Chiếm ô', TREASURE_HUNT: 'Săn kho báu',
  DODGE_FALLING: 'Né vật rơi', IMPOSTOR: 'Kẻ giả mạo', COLOR_CHASE: 'Đuổi màu',
}

export default function GameChannelChat({ channel, defaultOpen = false }: { channel: GameChatChannel; defaultOpen?: boolean }) {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const [messages, setMessages] = useState<GameChatMessage[]>([])
  const [content, setContent] = useState('')
  const [open, setOpen] = useState(defaultOpen)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef(open)
  const game = phaserGame.scene.keys.game as Game | undefined

  useEffect(() => { openRef.current = open; if (open) setUnread(0) }, [open])

  useEffect(() => {
    if (!game?.network) return
    setMessages([])
    setError('')
    const receive = (payload: GameChatServerPayload) => {
      if (payload.channel !== channel) return
      if (payload.action === 'HISTORY') {
        setMessages(payload.messages)
        return
      }
      if (payload.action === 'ERROR') {
        setError(payload.message)
        return
      }
      setMessages((current) => current.some((message) => message.id === payload.message.id) ? current : [...current, payload.message].slice(-60))
      if (!openRef.current && payload.message.sessionId !== sessionId) setUnread((current) => current + 1)
    }
    game.network.onGameChat(receive)
    game.network.gameChat({ action: 'LOAD', channel })
    return () => { phaserEvents.off(Event.GAME_CHAT, receive) }
  }, [channel, game, sessionId])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, open])

  useEffect(() => () => game?.enableKeys('game-channel-chat-input'), [game])

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const message = content.trim()
    if (!message || !game?.network) return
    game.network.gameChat({ action: 'SEND', channel, content: message })
    setContent('')
    setError('')
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }
  const label = useMemo(() => CHAT_LABELS[channel] || channel.replace(/_/g, ' '), [channel])

  if (!open) return <button className="game-chat-dock" onClick={() => setOpen(true)}><span>💬</span><strong>CHAT {label}</strong>{unread > 0 && <b>{Math.min(unread, 99)}</b>}</button>

  return <aside className="game-channel-chat" aria-label={`Kênh chat ${label}`}>
    <header><div><span className="game-chat-live-dot" /><strong>CHAT TRỰC TIẾP</strong><small>#{channel.toLowerCase()}</small></div><button aria-label="Thu gọn chat" onClick={() => setOpen(false)}>—</button></header>
    <div className="game-chat-messages" ref={listRef}>
      {messages.length === 0 && <div className="game-chat-empty"><span>💬</span><strong>Chưa có tin nhắn</strong><small>Chào mọi người trong kênh {label}!</small></div>}
      {messages.map((message) => <article className={message.sessionId === sessionId ? 'is-mine' : ''} key={message.id}><div><b>{message.author}</b><time>{new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content}</p></article>)}
    </div>
    <div className={`game-chat-error ${error ? '' : 'is-empty'}`} role="alert" aria-live="polite"><span>{error || ' '}</span></div>
    <form onSubmit={send}><input maxLength={180} value={content} placeholder={`Nhắn trong #${channel.toLowerCase()}…`} onChange={(event) => setContent(event.target.value)} onFocus={() => game?.disableKeys('game-channel-chat-input')} onBlur={() => game?.enableKeys('game-channel-chat-input')} onKeyDown={handleKeyDown} /><button disabled={!content.trim()} type="submit">GỬI</button></form>
  </aside>
}
