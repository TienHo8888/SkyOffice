import React, { useEffect, useMemo, useRef, useState } from 'react'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import { MINI_GAME_CARD_RULES, MINI_GAME_MODES, MiniGameActionPayload, MiniGameEventPayload, MiniGameMode, MiniGameSnapshot } from '../../../types/MiniGame'
import { CASINO_GAME_MODES, CasinoGameMode } from '../../../types/Casino'
import CasinoTableOverlay from './CasinoTableOverlay'
import GameChannelChat from './GameChannelChat'

const idleMiniGame: MiniGameSnapshot = {
  mode: '',
  gameId: '',
  status: 'IDLE',
  roundId: '',
  startedBy: '',
  leaderSessionId: '',
  targetColor: '',
  turnTeam: '',
  teamRedScore: 0,
  teamBlueScore: 0,
  startedAt: 0,
  endsAt: 0,
  score: 0,
  totalTasks: 0,
  completedTasks: 0,
  minPlayers: 2,
  maxPlayers: 8,
  spectatorCount: 0,
  settlementStatus: 'NONE',
  winnerIds: [],
  resultMessage: '',
  notice: '',
  attendees: [],
  items: [],
  boardCells: [],
}

const modeHints: Record<MiniGameMode, string> = {
  THROWABLES: 'Chọn món đồ rồi bấm nút. Server sẽ ném vào người gần nhất.',
  HIDE_SEEK: 'Người tìm chạy quanh Studio Commons. Người trốn hãy di chuyển thật xa.',
  FREEZE_TAG: 'Người bắt chạm để đóng băng. Người khác chạm để giải cứu.',
  HOT_BOMB: 'Người cầm bom áp sát người khác rồi bấm chuyền bom.',
  CAPTURE_FLAG: 'Chạm cờ đối thủ để nhặt, về gần cờ nhà để ghi điểm.',
  PAINT_TILES: 'Di chuyển qua 9 ô giữa Studio Commons để sơn màu đội mình.',
  TREASURE_HUNT: 'Chạy tới các điểm kho báu sáng để tự động nhặt.',
  DODGE_FALLING: 'Né các vật rơi. Người còn sống cuối cùng sẽ thắng.',
  IMPOSTOR: 'Crew bấm làm nhiệm vụ; Impostor áp sát và bấm phá.',
  COLOR_CHASE: 'Người có màu mục tiêu chạy; các màu còn lại đuổi bắt.',
  BACCARAT: `Cược ${MINI_GAME_CARD_RULES.BACCARAT.cost} coin. Player/Banker trả ${MINI_GAME_CARD_RULES.BACCARAT.payouts.PLAYER}, Tie trả ${MINI_GAME_CARD_RULES.BACCARAT.payouts.TIE}.`,
  BLACKJACK: `Cược ${MINI_GAME_CARD_RULES.BLACKJACK.cost} coin. Điểm gần 21 nhất thắng.`,
  POKER: `Texas Hold’em No-Limit: buy-in ${MINI_GAME_CARD_RULES.POKER.buyIn} Coin, blind ${MINI_GAME_CARD_RULES.POKER.smallBlind}/${MINI_GAME_CARD_RULES.POKER.bigBlind}, đấu cùng ${MINI_GAME_CARD_RULES.POKER.bots} bot. Mở từ bàn LIVE.`,
  SICBO: `Cược ${MINI_GAME_CARD_RULES.SICBO.cost} coin. Chọn lớn, nhỏ, chẵn hoặc lẻ.`,
  BAU_CUA: `Cược ${MINI_GAME_CARD_RULES.BAU_CUA.cost} coin. Chọn linh vật và lắc 3 viên.`,
  CHESS: `Bàn cờ 1v1 realtime. Cược ${MINI_GAME_CARD_RULES.CHESS.cost} coin, thắng nhận ${MINI_GAME_CARD_RULES.CHESS.winPayout}.`,
  TIEN_LEN: 'Tiến Lên Miền Nam: chơi với 3 bot hoặc vào bàn chờ người khác. Ván đầu bắt buộc đánh 3♠.',
  DICE_DUEL: `Cược ${MINI_GAME_CARD_RULES.DICE_DUEL.cost} coin. Thắng trả ${MINI_GAME_CARD_RULES.DICE_DUEL.winPayout}, hòa hoàn ${MINI_GAME_CARD_RULES.DICE_DUEL.tiePayout}.`,
  LUCKY_DRAW: `Cược ${MINI_GAME_CARD_RULES.LUCKY_DRAW.cost} coin để rút ${MINI_GAME_CARD_RULES.LUCKY_DRAW.rewards.join(' / ')} coin.`,
}

const modeTutorials: Partial<Record<MiniGameMode, readonly string[]>> = {
  THROWABLES: ['Chọn một món đồ vui.', 'Đứng gần người chơi khác.', 'Bấm ném và chờ server xác nhận.'],
  HIDE_SEEK: ['Xem vai Seeker hay Hider.', 'Seeker tìm và chạm người trốn.', 'Hider đổi vị trí, sống sót tới hết giờ.'],
  FREEZE_TAG: ['Tránh người bắt nếu chưa bị đóng băng.', 'Chạm đồng đội bị đóng băng để cứu.', 'Còn tự do khi hết giờ để thắng.'],
  HOT_BOMB: ['Người giữ bom tìm người gần nhất.', 'Bấm Chuyền bom trước khi hết giờ.', 'Giữ khoảng cách khi không có bom.'],
  CAPTURE_FLAG: ['Chọn đường tới cờ đối thủ.', 'Nhặt cờ rồi quay về căn cứ.', 'Bảo vệ người đang cầm cờ.'],
  PAINT_TILES: ['Đi qua lưới 3×3 ở Commons.', 'Mỗi ô nhận màu đội của bạn.', 'Chiếm nhiều ô nhất khi hết giờ.'],
  TREASURE_HUNT: ['Tìm điểm kho báu sáng trên map.', 'Đi chạm để tự nhặt.', 'Theo dõi điểm cá nhân và thời gian.'],
  DODGE_FALLING: ['Quan sát vùng cảnh báo.', 'Di chuyển ra khỏi điểm rơi.', 'Người sống cuối cùng thắng.'],
  IMPOSTOR: ['Đọc vai bí mật.', 'Crew làm task; Impostor phá khi ở gần.', 'Crew bỏ phiếu dựa trên hành vi.'],
  COLOR_CHASE: ['Xem màu mục tiêu của round.', 'Màu mục tiêu chạy, màu khác đuổi.', 'Vai đổi theo round.'],
}

function MiniGameGuide({ mode }: { mode: MiniGameMode | '' }) {
  const steps = mode ? modeTutorials[mode] : undefined
  if (!steps) return null
  return <details className="mini-game-guide" open><summary>CÁCH CHƠI · 3 BƯỚC</summary><ol>{steps.map((step, index) => <li key={step}><b>{index + 1}</b>{step}</li>)}</ol></details>
}

function gameTitle(mode: MiniGameMode | '') {
  return MINI_GAME_MODES.find((definition) => definition.id === mode)?.name || 'Studio Commons Mini Game'
}

type GameStation = { id: string; label: string; gameMode: MiniGameMode }

export default function MiniGameOverlay() {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const authUser = useAppSelector((state) => state.user.authUser)
  const coinBalance = useAppSelector((state) => state.social.snapshot?.progression.coinBalance || 0)
  const lastReward = useAppSelector((state) => state.social.lastReward)
  const [game, setGame] = useState<MiniGameSnapshot>(idleMiniGame)
  const [now, setNow] = useState(Date.now())
  const [lastEvent, setLastEvent] = useState('')
  const [station, setStation] = useState<GameStation | null>(null)
  const [open, setOpen] = useState(false)
  const lastRoundRef = useRef('')
  const eventTimerRef = useRef<number>()

  useEffect(() => {
    const activeGame = phaserGame.scene.keys.game as Game | undefined
    if (!activeGame?.network) return
    const handleUpdate = (payload: MiniGameSnapshot) => {
      setGame(payload)
      if ((payload.status === 'COUNTDOWN' || payload.status === 'PLAYING') && payload.roundId !== lastRoundRef.current) {
        lastRoundRef.current = payload.roundId
        setOpen(true)
      }
    }
    const handleEvent = (payload: MiniGameEventPayload) => {
      setLastEvent(payload.message)
      if (eventTimerRef.current) window.clearTimeout(eventTimerRef.current)
      eventTimerRef.current = window.setTimeout(() => {
        setLastEvent('')
        eventTimerRef.current = undefined
      }, 1600)
    }
    const handleStationOpen = (payload: GameStation) => {
      if (!payload?.gameMode) return
      setStation(payload)
      setOpen(true)
    }
    activeGame.network.onMiniGameUpdated(handleUpdate)
    activeGame.network.onMiniGameEvent(handleEvent)
    phaserEvents.on(Event.GAME_TABLE_OPEN, handleStationOpen)
    return () => {
      if (eventTimerRef.current) window.clearTimeout(eventTimerRef.current)
      phaserEvents.off(Event.MINI_GAME_UPDATED, handleUpdate)
      phaserEvents.off(Event.MINI_GAME_EVENT, handleEvent)
      phaserEvents.off(Event.GAME_TABLE_OPEN, handleStationOpen)
    }
  }, [])

  useEffect(() => {
    if (game.status === 'IDLE' || game.status === 'RESULT') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [game.status, game.roundId])

  const activeGame = phaserGame.scene.keys.game as Game | undefined
  const myParticipant = useMemo(() => game.attendees.find((attendee) => attendee.sessionId === sessionId), [game.attendees, sessionId])
  const displayMode = (station?.gameMode || game.mode) as MiniGameMode | ''
  const definition = MINI_GAME_MODES.find((item) => item.id === displayMode)
  const showingGame = Boolean(game.mode && game.status !== 'IDLE' && (!station || station.gameMode === game.mode))
  const shouldLockInput = open && (Boolean(station) || showingGame)
  useEffect(() => {
    if (!activeGame) return
    if (shouldLockInput) activeGame.disableKeys('mini-game-modal')
    else activeGame.enableKeys('mini-game-modal')
    return () => activeGame.enableKeys('mini-game-modal')
  }, [activeGame, shouldLockInput])

  if (!open || (!station && !showingGame)) return null

  if (station && (CASINO_GAME_MODES as readonly string[]).includes(displayMode)) {
    return <CasinoTableOverlay mode={displayMode as CasinoGameMode} stationLabel={station.label} onClose={() => setOpen(false)} />
  }

  const secondsLeft = game.status === 'COUNTDOWN'
    ? Math.max(0, Math.ceil((game.startedAt - now) / 1000))
    : Math.max(0, Math.ceil((game.endsAt - now) / 1000))
  const action = (name: string, payload: Omit<MiniGameActionPayload, 'action'> = {}) => activeGame?.network.miniGameAction(name, payload)
  const isCardRoomGame = definition?.category === 'CARD_ROOM'
  const currentCoinBalance = coinBalance
  const gameHint = game.notice || (game.mode ? modeHints[game.mode] : '')
  const ownScore = myParticipant?.score ?? game.score
  const topScorers = [...game.attendees].sort((left, right) => right.score - left.score).slice(0, 5)
  const canStart = authUser?.role === 'OWNER' || authUser?.role === 'ADMIN'
  const startStationGame = () => {
    if (!displayMode || !activeGame?.network) return
    activeGame.network.startMiniGame(displayMode)
    setLastEvent(`Đang mở ${gameTitle(displayMode)} tại ${station?.label || 'bàn chơi'}…`)
  }

  return (
    <div className="mini-game-modal-backdrop" aria-live="polite">
      <section className={`mini-game-panel mini-game-${game.status.toLowerCase()} ${showingGame ? 'is-playing-station' : 'is-station-lobby'}`}>
        <div className="mini-game-panel-head">
          <div><span className="mini-game-kicker">{showingGame ? (isCardRoomGame ? 'VIP GAMES / LIVE TABLE' : 'STUDIO COMMONS / REALTIME') : 'GAME STATION / DIRECT PLAY'}</span><h2>{definition?.icon} {station?.label || gameTitle(displayMode)}</h2></div>
          <div className="mini-game-head-actions"><strong>{showingGame ? `${game.attendees.length} người` : 'READY'}</strong><button className="mini-game-close" aria-label="Đóng game popup" onClick={() => setOpen(false)}>×</button></div>
        </div>

        {!showingGame && <div className="mini-game-station-lobby"><div className="mini-game-station-art"><span>{definition?.icon || '✦'}</span><small>PIXEL STATION</small></div><div><span className="mini-game-kicker">{definition?.category === 'CARD_ROOM' ? 'COIN TABLE' : 'ARCADE PLAY'}</span><h3>{gameTitle(displayMode)}</h3><p>{definition?.description || 'Chạm bàn để mở game.'}</p><MiniGameGuide mode={displayMode} /><div className="mini-game-station-meta"><b>{isCardRoomGame ? `${definition?.id === 'CHESS' ? 10 : 'Coin bet'}` : 'Realtime'}</b><span>{game.status === 'COUNTDOWN' || game.status === 'PLAYING' ? `Đang có ${gameTitle(game.mode)} khác` : 'Popup game độc lập'}</span></div>{game.status === 'COUNTDOWN' || game.status === 'PLAYING' ? <div className="mini-game-station-wait">Một ván khác đang chạy. Bạn có thể đóng popup hoặc xem ván hiện tại bằng cách tới đúng bàn.</div> : <button className="mini-game-start-button" disabled={!canStart} onClick={startStationGame}>{canStart ? `Mở ${gameTitle(displayMode)} & điểm danh →` : 'Chờ Owner / Admin mở ván'}</button>}</div></div>}

        {showingGame && game.status === 'COUNTDOWN' && <div className="mini-game-countdown"><strong>{secondsLeft || 1}</strong><span>Chuẩn bị chơi!</span></div>}

        {showingGame && game.status === 'PLAYING' && <>
          <div className="mini-game-live-status"><div><span>THỜI GIAN</span><strong>{secondsLeft}s</strong></div><div><span>ĐIỂM ROUND</span><strong>{ownScore}</strong></div><div><span>{isCardRoomGame ? 'VÍ RIÊNG' : 'ĐỘI'}</span><strong>{isCardRoomGame ? `${currentCoinBalance.toLocaleString()} Coin` : myParticipant?.team || '—'}</strong></div></div>
          <div className="mini-game-hint" title={gameHint}>{gameHint}</div>
          <div className={`mini-game-role ${myParticipant ? '' : 'is-empty'}`}>
            {myParticipant ? <>Vai của bạn: <strong>{game.mode === 'HIDE_SEEK' && myParticipant.role === 'HIDER' && !myParticipant.found ? 'ĐANG ẨN' : myParticipant.role || 'NGƯỜI CHƠI'}</strong>{myParticipant.color && <span className={`mini-game-color mini-game-color-${myParticipant.color.toLowerCase()}`} />}</> : <span aria-hidden="true">&nbsp;</span>}
          </div>
          {isCardRoomGame && <CardGameStage mode={displayMode} />}
          <div className={`mini-game-action-slot mini-game-action-slot-${game.mode.toLowerCase()}`}>
            <ModeActions game={game} myParticipant={myParticipant} coinBalance={currentCoinBalance} onAction={action} />
          </div>
          {game.mode === 'PAINT_TILES' && <div className="mini-game-board">{game.boardCells.map((cell) => <i className={`mini-game-cell ${cell.team ? `team-${cell.team.toLowerCase()}` : ''}`} key={cell.index} />)}</div>}
        </>}

        {showingGame && game.status === 'RESULT' && <div className="mini-game-result"><strong>Hết giờ!</strong><span>{game.resultMessage}</span></div>}
        {showingGame && (game.status === 'COUNTDOWN' || game.status === 'PLAYING') && <div className="mini-game-spectator-tools"><span>{game.spectatorCount} spectator · cheer không đổi score</span><button onClick={() => activeGame?.network.miniGameCheer()}>👏 Cheer</button></div>}
        {showingGame && <div className={`mini-game-reward-receipt ${lastReward?.roundId === game.roundId ? '' : 'is-empty'}`} aria-live="polite">
          {lastReward?.roundId === game.roundId ? <>✦ {lastReward.reason} · {lastReward.coinDelta >= 0 ? '+' : ''}{lastReward.coinDelta} Coin · +{lastReward.gameXpDelta} Character EXP</> : <span aria-hidden="true">&nbsp;</span>}
        </div>}
        <div className={`mini-game-event ${lastEvent ? '' : 'is-empty'}`} aria-live="polite">
          {lastEvent ? <>✦ {lastEvent}</> : <span aria-hidden="true">&nbsp;</span>}
        </div>

        {showingGame && <div className="mini-game-scoreboard"><span>BẢNG ĐIỂM / ĐIỂM DANH</span>{topScorers.map((participant, index) => <div key={participant.sessionId}><b>{index + 1}</b><strong>{participant.displayName}</strong><small>{participant.alive ? participant.score : 'OUT'} điểm{participant.team ? ` · ${participant.team}` : ''}</small></div>)}</div>}
        {displayMode && <GameChannelChat channel={displayMode} />}
      </section>
    </div>
  )
}

function CardGameStage({ mode }: { mode: MiniGameMode | '' }) {
  const stage = {
    BACCARAT: { label: 'PLAYER · BANKER · TIE', tokens: ['♠', '♦', '♣', '♥'] },
    BLACKJACK: { label: 'DEAL · HIT · 21', tokens: ['A', '7', 'K', '♣'] },
    POKER: { label: 'SHOWDOWN TABLE', tokens: ['A', 'K', 'Q', 'J', '10'] },
    SICBO: { label: 'BIG · SMALL · ODD · EVEN', tokens: ['⚄', '⚂', '⚅'] },
    BAU_CUA: { label: 'LẮC 3 MẶT XÚC XẮC', tokens: ['🦌', '🎃', '🦀', '🐟', '🐓', '🦐'] },
    CHESS: { label: 'REALTIME BOARD · 1V1', tokens: ['♚', '♛', '♜', '♟'] },
    DICE_DUEL: { label: 'ROLL VS HOUSE', tokens: ['⚄', '⚂', '✦'] },
    LUCKY_DRAW: { label: 'RÚT THƯỞNG RNG', tokens: ['★', '✦', '◆'] },
  }[mode as 'BACCARAT' | 'BLACKJACK' | 'POKER' | 'SICBO' | 'BAU_CUA' | 'CHESS' | 'DICE_DUEL' | 'LUCKY_DRAW'] || { label: 'LIVE SERVER GAME', tokens: ['✦'] }
  return <div className="mini-game-table-stage"><div className="mini-game-felt"><span className="mini-game-table-label">LIVE TABLE · SERVER ACTION</span><strong>{stage.label}</strong><div>{stage.tokens.map((token, index) => <i key={`${token}-${index}`}>{token}</i>)}</div></div></div>
}

function ModeActions({ game, myParticipant, coinBalance, onAction }: { game: MiniGameSnapshot; myParticipant?: MiniGameSnapshot['attendees'][number]; coinBalance: number; onAction: (action: string, payload?: Omit<MiniGameActionPayload, 'action'>) => void }) {
  if (!myParticipant) return null
  if (game.mode === 'THROWABLES') return <div className="mini-game-actions"><span>Chọn đồ ném:</span>{[['STONE', '🪨 Đá'], ['SLIPPER', '🩴 Dép'], ['WATER_GUN', '💦 Súng nước'], ['FOAM_BAT', '🔨 Búa xốp'], ['PILLOW', '🛏️ Gối']].map(([item, label]) => <button key={item} onClick={() => onAction('THROW', { item })}>{label}</button>)}</div>
  if (game.mode === 'HOT_BOMB' && myParticipant.hasBomb) return <div className="mini-game-actions"><button onClick={() => onAction('PASS_BOMB')}>💣 Chuyền bom</button></div>
  if (game.mode === 'FREEZE_TAG' && !myParticipant.frozen) return <div className="mini-game-actions"><button onClick={() => onAction('UNFREEZE')}>❄️ Chạm để cứu người gần nhất</button></div>
  if (game.mode === 'CAPTURE_FLAG') return <div className="mini-game-actions"><button onClick={() => onAction('PICKUP_FLAG')}>🚩 Nhặt cờ đối thủ</button><button onClick={() => onAction('RETURN_FLAG')}>🏠 Ghi điểm về căn cứ</button></div>
  if (game.mode === 'IMPOSTOR') return <div className="mini-game-actions"><span>Hành động:</span>{myParticipant.role === 'CREW' && <button disabled={!myParticipant.alive} onClick={() => onAction('TASK')}>✓ Làm nhiệm vụ</button>}{myParticipant.role === 'IMPOSTOR' && <button disabled={!myParticipant.alive} onClick={() => onAction('SABOTAGE')}>🕵️ Phá người gần nhất</button>}{myParticipant.role === 'CREW' && <div className="mini-game-vote"><span>Bỏ phiếu ai là Impostor:</span>{game.attendees.filter((candidate) => candidate.alive && candidate.sessionId !== myParticipant.sessionId).map((candidate) => <button className={myParticipant.choice === candidate.sessionId ? 'selected' : ''} disabled={!myParticipant.alive} key={candidate.sessionId} onClick={() => onAction('VOTE', { targetSessionId: candidate.sessionId })}>🗳️ {candidate.displayName}</button>)}</div>}</div>
  if (game.mode === 'BACCARAT') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.BACCARAT.cost} coin:</span>{MINI_GAME_CARD_RULES.BACCARAT.choices.map((choice) => <button disabled={coinBalance < MINI_GAME_CARD_RULES.BACCARAT.cost} key={choice} onClick={() => onAction('BET', { choice })}>{choice} · trả {MINI_GAME_CARD_RULES.BACCARAT.payouts[choice]}</button>)}</div>
  if (game.mode === 'BLACKJACK') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.BLACKJACK.cost} coin:</span><button disabled={coinBalance < MINI_GAME_CARD_RULES.BLACKJACK.cost} onClick={() => onAction('BET')}>🂡 Chia bài · thắng trả {MINI_GAME_CARD_RULES.BLACKJACK.winPayout}</button></div>
  if (game.mode === 'SICBO') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.SICBO.cost} coin:</span>{MINI_GAME_CARD_RULES.SICBO.choices.map((choice) => <button disabled={coinBalance < MINI_GAME_CARD_RULES.SICBO.cost} key={choice} onClick={() => onAction('BET', { choice })}>{choice}</button>)}</div>
  if (game.mode === 'BAU_CUA') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.BAU_CUA.cost} coin:</span>{[['DEER', '🦌'], ['GOURD', '🎃'], ['ROOSTER', '🐓'], ['FISH', '🐟'], ['CRAB', '🦀'], ['SHRIMP', '🦐']].map(([choice, icon]) => <button disabled={coinBalance < MINI_GAME_CARD_RULES.BAU_CUA.cost} key={choice} onClick={() => onAction('BET', { choice })}>{icon} {choice}</button>)}</div>
  if (game.mode === 'CHESS') return <ChessActions game={game} myParticipant={myParticipant} onAction={onAction} />
  if (game.mode === 'DICE_DUEL') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.DICE_DUEL.cost} coin:</span><button disabled={coinBalance < MINI_GAME_CARD_RULES.DICE_DUEL.cost} onClick={() => onAction('ROLL')}>🎲 Roll · trả {MINI_GAME_CARD_RULES.DICE_DUEL.winPayout}</button></div>
  if (game.mode === 'LUCKY_DRAW') return <div className="mini-game-actions"><span>Cược {MINI_GAME_CARD_RULES.LUCKY_DRAW.cost} coin:</span><button disabled={coinBalance < MINI_GAME_CARD_RULES.LUCKY_DRAW.cost} onClick={() => onAction('DRAW')}>🎟️ Rút thưởng · tối đa {Math.max(...MINI_GAME_CARD_RULES.LUCKY_DRAW.rewards)}</button></div>
  return null
}

function ChessActions({ game, myParticipant, onAction }: { game: MiniGameSnapshot; myParticipant: MiniGameSnapshot['attendees'][number]; onAction: (action: string, payload?: Omit<MiniGameActionPayload, 'action'>) => void }) {
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null)
  const pieceGlyph: Record<string, string> = { KING: '♚', QUEEN: '♛', ROOK: '♜', BISHOP: '♝', KNIGHT: '♞', PAWN: '♟' }
  const pieceAt = (x: number, y: number) => game.items.find((item) => item.active && item.x === x && item.y === y)
  const clickCell = (x: number, y: number) => {
    const piece = pieceAt(x, y)
    if (!selected) {
      if (piece?.team === myParticipant.team && game.turnTeam === myParticipant.team) setSelected({ x, y })
      return
    }
    if (piece?.team === myParticipant.team) {
      setSelected({ x, y })
      return
    }
    onAction('MOVE', { fromX: selected.x, fromY: selected.y, toX: x, toY: y })
    setSelected(null)
  }
  return <div className="mini-game-chess-wrap"><div className="mini-game-chess-meta"><span>Bạn: <b>{myParticipant.team}</b></span><span>Lượt: <b>{game.turnTeam || '—'}</b></span></div><div className="mini-game-chess-board">{Array.from({ length: 64 }, (_, index) => { const x = index % 8; const y = Math.floor(index / 8); const piece = pieceAt(x, y); return <button className={`${(x + y) % 2 ? 'dark' : 'light'} ${selected?.x === x && selected?.y === y ? 'selected' : ''}`} key={`${x}-${y}`} onClick={() => clickCell(x, y)}>{piece ? <span className={piece.team === 'WHITE' ? 'white-piece' : 'black-piece'}>{pieceGlyph[piece.kind] || '•'}</span> : ''}</button> })}</div><small className="mini-game-chess-help">Chọn quân của bạn rồi chọn ô đích. Luật cơ bản, không check/checkmate.</small></div>
}
