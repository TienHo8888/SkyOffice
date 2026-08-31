import React, { useEffect, useRef, useState } from 'react'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { Event, phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import { RpsMove, RpsPrivateState } from '../../../types/Rps'
import GameChannelChat from './GameChannelChat'

const RPS_MOVES: Array<{ id: RpsMove; label: string; icon: string; helper: string }> = [
  { id: 'ROCK', label: 'BÚA', icon: '✊', helper: 'Đập KÉO' },
  { id: 'PAPER', label: 'BAO', icon: '✋', helper: 'Bọc BÚA' },
  { id: 'SCISSORS', label: 'KÉO', icon: '✌', helper: 'Cắt BAO' },
]

const WAGER_OPTIONS = [10, 25, 50, 100]

function moveDefinition(move?: RpsMove) {
  return RPS_MOVES.find((candidate) => candidate.id === move)
}

type RpsResultKind = 'win' | 'push' | 'loss'
type RpsMoveResultState = 'winner' | 'push' | 'loser'

interface RpsRewardToastState {
  kind: RpsResultKind
  result: string
  net: number
  payout: number
  stake: number
  roundId: string
}

function rpsRewardToastFromChallenge(challenge: RpsPrivateState, sessionId: string, roundId: string) {
  const tied = !challenge.winnerSessionId
  const won = challenge.winnerSessionId === sessionId
  const stake = Math.max(0, Math.floor(challenge.wager))
  const payout = tied ? stake : won ? stake * 2 : 0
  const net = payout - stake
  return {
    kind: won ? 'win' : tied ? 'push' : 'loss',
    result: challenge.resultText || 'Trận đấu đã kết thúc.',
    net,
    payout,
    stake,
    roundId,
  } satisfies RpsRewardToastState
}

function RpsRewardToast({ notice }: { notice: RpsRewardToastState }) {
  const copy = notice.kind === 'win'
    ? { eyebrow: 'PAYOUT CONFIRMED', title: 'BẠN THẮNG', icon: '★' }
    : notice.kind === 'push'
      ? { eyebrow: 'STAKE RETURNED', title: 'HOÀN CƯỢC', icon: '◆' }
      : { eyebrow: 'ROUND SETTLED', title: 'BẠN THUA', icon: '×' }
  const netLabel = `${notice.net > 0 ? '+' : ''}${notice.net.toLocaleString()}`
  const payoutLabel = notice.kind === 'loss'
    ? `MẤT ${notice.stake.toLocaleString()} COIN`
    : `${notice.kind === 'push' ? 'HOÀN' : 'NHẬN'} ${notice.payout.toLocaleString()} COIN`
  return <div className={`rps-reward-toast is-${notice.kind}`} role="status" aria-live="assertive">
    <div className="rps-reward-emblem" aria-hidden="true"><span>{copy.icon}</span><i /></div>
    <div className="rps-reward-copy"><small>{copy.eyebrow}</small><strong>{copy.title}</strong><p>{notice.result}</p></div>
    <div className="rps-reward-value"><b>{netLabel}</b><span>COIN NET</span><small>{payoutLabel}</small></div>
  </div>
}

const RPS_RESULT_PARTICLES = Array.from({ length: 22 }, (_, index) => {
  const angle = (index / 22) * Math.PI * 2
  const distance = 85 + (index % 5) * 26
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.72,
    delay: (index % 6) * 45,
    rotate: (index * 43) % 360,
  }
})

function RpsResultVfx({ kind }: { kind: RpsResultKind }) {
  return <div className={`rps-result-vfx is-${kind}`} aria-hidden="true">
    <div className="rps-result-flash" />
    <div className="rps-result-rays" />
    <div className="rps-result-ring" />
    <div className="rps-result-core"><span>{kind === 'win' ? '★' : kind === 'push' ? '◆' : '×'}</span></div>
    <div className="rps-result-particles">{RPS_RESULT_PARTICLES.map((particle, index) => <i key={index} style={{ '--rps-particle-x': `${particle.x}px`, '--rps-particle-y': `${particle.y}px`, '--rps-particle-delay': `${particle.delay}ms`, '--rps-particle-rotate': `${particle.rotate}deg` } as React.CSSProperties} />)}</div>
  </div>
}

export default function RpsOverlay() {
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const coinBalance = useAppSelector((state) => state.social.snapshot?.progression.coinBalance || 0)
  const [interactionTarget, setInteractionTarget] = useState<{ sessionId: string; displayName: string; distance: number } | null>(null)
  const [challenge, setChallenge] = useState<RpsPrivateState | null>(null)
  const [wager, setWager] = useState(10)
  const [error, setError] = useState('')
  const [rewardToast, setRewardToast] = useState<RpsRewardToastState | null>(null)
  const [resultVfx, setResultVfx] = useState<RpsResultKind | null>(null)
  const actionSequence = useRef(0)
  const challengeRef = useRef<RpsPrivateState | null>(null)
  const resultRound = useRef('')

  useEffect(() => {
    challengeRef.current = challenge
  }, [challenge])

  useEffect(() => {
    const activeGame = phaserGame.scene.keys.game as Game | undefined
    if (!activeGame?.network) return

    const handlePlayerInteraction = (target: { sessionId: string; displayName: string; distance: number }) => {
      if (!challengeRef.current) setInteractionTarget(target)
    }
    const handleRpsState = (payload: RpsPrivateState) => {
      challengeRef.current = payload
      setChallenge(payload)
      setInteractionTarget(null)
      setError('')
    }
    const handleRpsError = (payload: { message: string }) => setError(payload.message)

    phaserEvents.on(Event.PLAYER_INTERACTION, handlePlayerInteraction)
    activeGame.network.onRpsState(handleRpsState)
    activeGame.network.onRpsError(handleRpsError)
    return () => {
      phaserEvents.off(Event.PLAYER_INTERACTION, handlePlayerInteraction)
      phaserEvents.off(Event.RPS_STATE, handleRpsState)
      phaserEvents.off(Event.RPS_ERROR, handleRpsError)
    }
  }, [])

  const send = (payload: { action: 'CREATE' | 'ACCEPT' | 'DECLINE' | 'SELECT_MOVE' | 'READY' | 'CANCEL'; targetSessionId?: string; challengeId?: string; wager?: number; move?: RpsMove }) => {
    const activeGame = phaserGame.scene.keys.game as Game | undefined
    if (!activeGame?.network) {
      setError('Kết nối game chưa sẵn sàng.')
      return
    }
    actionSequence.current += 1
    activeGame.network.rpsAction({
      ...payload,
      actionId: `rps:${sessionId || 'player'}:${Date.now()}:${actionSequence.current}`,
    })
  }

  if (!challenge && !interactionTarget) return null

  const close = () => {
    if (challenge?.challengeId && (challenge.status === 'PENDING' || challenge.status === 'READY')) {
      send({ action: 'CANCEL', challengeId: challenge.challengeId })
    }
    setInteractionTarget(null)
    setChallenge(null)
    setError('')
  }

  const selectWager = (value: number) => {
    setWager(value)
    setChallenge((current) => current && current.challengeId === '' ? { ...current, wager: value } : current)
    setError('')
  }

  const openRpsWager = () => {
    if (!interactionTarget) return
    if (coinBalance < 10) {
      setError('Bạn cần ít nhất 10 Coin để thách đấu.')
      return
    }
    setChallenge({
      challengeId: '',
      status: 'PENDING',
      role: 'CHALLENGER',
      opponentSessionId: interactionTarget.sessionId,
      opponentName: interactionTarget.displayName,
      wager,
      myReady: false,
      opponentReady: false,
      createdAt: Date.now(),
    })
    setInteractionTarget(null)
  }

  const createChallenge = () => {
    if (!challenge?.opponentSessionId || coinBalance < wager) return
    send({ action: 'CREATE', targetSessionId: challenge.opponentSessionId, wager })
  }

  const chooseMove = (move: RpsMove) => {
    if (!challenge || challenge.status !== 'READY') return
    send({ action: 'SELECT_MOVE', challengeId: challenge.challengeId, move })
  }

  const isPending = challenge?.status === 'PENDING'
  const isReady = challenge?.status === 'READY'
  const isResult = challenge?.status === 'RESOLVED' || challenge?.status === 'DECLINED' || challenge?.status === 'CANCELLED'
  const isIncoming = isPending && challenge?.role === 'CHALLENGED'
  const resultIsTie = challenge?.status === 'RESOLVED' && !challenge.winnerSessionId
  const resultIsWin = challenge?.status === 'RESOLVED' && challenge.winnerSessionId === sessionId
  const payout = challenge?.status === 'RESOLVED' ? resultIsTie ? challenge.wager : resultIsWin ? challenge.wager * 2 : 0 : 0
  const resultKind: RpsResultKind | null = challenge?.status === 'RESOLVED' ? resultIsWin ? 'win' : resultIsTie ? 'push' : 'loss' : null
  const myMoveResult: RpsMoveResultState = resultIsTie ? 'push' : resultIsWin ? 'winner' : 'loser'
  const opponentMoveResult: RpsMoveResultState = resultIsTie ? 'push' : resultIsWin ? 'loser' : 'winner'
  const selectedMove = moveDefinition(challenge?.myMove)
  const opponentMove = moveDefinition(challenge?.opponentMove)

  useEffect(() => {
    if (!challenge || challenge.status !== 'RESOLVED' || !challenge.challengeId || !resultKind || resultRound.current === challenge.challengeId) {
      if (challenge?.status !== 'RESOLVED') {
        resultRound.current = ''
        setRewardToast(null)
        setResultVfx(null)
      }
      return
    }
    resultRound.current = challenge.challengeId
    setRewardToast(rpsRewardToastFromChallenge(challenge, sessionId, challenge.challengeId))
    setResultVfx(resultKind)
  }, [challenge, resultKind, sessionId])

  useEffect(() => {
    if (!rewardToast) return
    const timer = window.setTimeout(() => setRewardToast(null), 5600)
    return () => window.clearTimeout(timer)
  }, [rewardToast])

  useEffect(() => {
    if (!resultVfx) return
    const timer = window.setTimeout(() => setResultVfx(null), 2200)
    return () => window.clearTimeout(timer)
  }, [resultVfx])

  return (
    <div className={`rps-layer ${resultKind ? `has-result-${resultKind}` : ''}`} aria-live="polite">
      {resultVfx && <RpsResultVfx kind={resultVfx} />}
      {!challenge?.challengeId && interactionTarget && (
        <section className="rps-panel rps-interaction-panel">
          <div className="rps-kicker">TƯƠNG TÁC NGƯỜI CHƠI</div>
          <div className="rps-panel-heading">
            <div>
              <h2>{interactionTarget.displayName}</h2>
              <p>Đang đứng gần bạn · chọn một trò chơi để bắt đầu.</p>
            </div>
            <button className="rps-close" aria-label="Đóng tương tác" onClick={close}>×</button>
          </div>
          <button className="rps-game-choice" onClick={openRpsWager}>
            <span className="rps-game-choice-icon">✊</span>
            <span><strong>OẢN TÙ XÌ</strong><small>Thách đấu 1v1 bằng Coin</small></span>
            <b>→</b>
          </button>
        </section>
      )}

      {challenge?.challengeId === '' && !interactionTarget && (
        <section className="rps-panel rps-wager-panel">
          <div className="rps-kicker">OẢN TÙ XÌ / TẠO THÁCH ĐẤU</div>
          <div className="rps-panel-heading">
            <div>
              <h2>Thách đấu {challenge.opponentName}</h2>
              <p>Cả hai sẽ cược cùng một mức. Người thắng nhận toàn bộ pot.</p>
            </div>
            <button className="rps-close" aria-label="Đóng bảng cược" onClick={close}>×</button>
          </div>
          <div className="rps-balance-line"><span>COIN CỦA BẠN</span><strong>✦ {coinBalance.toLocaleString()}</strong></div>
          <div className="rps-wager-grid" aria-label="Chọn mức cược">
            {WAGER_OPTIONS.map((value) => <button className={`rps-wager-button ${wager === value ? 'is-selected' : ''}`} disabled={value > coinBalance} key={value} onClick={() => selectWager(value)}>{value}<small>COIN</small></button>)}
          </div>
          <div className="rps-action-row">
            <button className="rps-secondary" onClick={close}>Hủy</button>
            <button className="rps-primary" disabled={coinBalance < wager} onClick={createChallenge}>GỬI THÁCH ĐẤU · {wager} COIN</button>
          </div>
        </section>
      )}

      {challenge?.challengeId && (
        <section className={`rps-panel ${isIncoming ? 'is-incoming' : ''} ${isResult ? 'is-result' : ''} ${resultKind ? `is-result-${resultKind}` : ''}`}>
          <div className="rps-panel-topline"><span className="rps-kicker">OẢN TÙ XÌ / 1V1</span><button className="rps-close" aria-label="Đóng bảng Oản Tù Xì" onClick={close}>×</button></div>
          <div className="rps-panel-heading">
            <div><h2>{isIncoming ? 'Có người thách đấu!' : isResult ? 'Kết quả trận đấu' : 'Đấu với ' + challenge.opponentName}</h2><p>{challenge.opponentName} · cược <strong>{challenge.wager} Coin</strong></p></div>
            <div className="rps-pot"><span>POT</span><strong>{challenge.wager * 2}</strong><small>COIN</small></div>
          </div>

          {isIncoming && <div className="rps-incoming-copy"><span className="rps-incoming-icon">✦</span><div><strong>{challenge.opponentName} muốn đấu Oản Tù Xì</strong><p>Đồng ý để khóa {challenge.wager} Coin mỗi bên và vào bàn.</p></div></div>}
          {isPending && !isIncoming && <div className="rps-waiting"><span className="rps-pulse-dot" /><div><strong>Đã gửi lời thách đấu</strong><p>Đang chờ {challenge.opponentName} đồng ý…</p></div></div>}

          {isReady && <>
            <div className="rps-turn-banner"><span className="rps-pulse-dot" />CHỌN NƯỚC ĐI · BẤM READY ĐỂ SO</div>
            <div className="rps-ready-status"><span className={challenge.myReady ? 'is-ready' : ''}>{challenge.myReady ? '✓ BẠN ĐÃ READY' : 'BẠN CHƯA READY'}</span><i>VS</i><span className={challenge.opponentReady ? 'is-ready' : ''}>{challenge.opponentReady ? '✓ ĐỐI THỦ ĐÃ READY' : 'ĐỐI THỦ ĐANG CHỌN'}</span></div>
            <div className="rps-move-grid" aria-label="Chọn Búa Kéo Bao">
              {RPS_MOVES.map((move) => <button className={`rps-move-button ${challenge.myMove === move.id ? 'is-selected' : ''}`} aria-pressed={challenge.myMove === move.id} disabled={challenge.myReady} key={move.id} onClick={() => chooseMove(move.id)}><strong>{move.icon}</strong><span>{move.label}</span><small>{move.helper}</small></button>)}
            </div>
            <div className="rps-action-row rps-ready-action"><span>{selectedMove ? `${selectedMove.icon} ${selectedMove.label} đã chọn` : 'Chọn một nước đi'}</span><button className="rps-primary" disabled={!challenge.myMove || challenge.myReady} onClick={() => send({ action: 'READY', challengeId: challenge.challengeId })}>{challenge.myReady ? 'ĐANG CHỜ ĐỐI THỦ' : 'READY · SO NGAY'}</button></div>
            <p className="rps-safe-note">Nước đi của đối thủ sẽ được giữ kín cho tới khi cả hai Ready.</p>
          </>}

          {isResult && <div className={`rps-result-card ${resultIsWin ? 'is-win' : resultIsTie ? 'is-tie' : 'is-loss'}`}>
            <span className="rps-result-badge">{resultIsWin ? 'BẠN THẮNG' : resultIsTie ? 'HÒA VÁN' : challenge.status === 'DECLINED' ? 'ĐÃ TỪ CHỐI' : challenge.status === 'CANCELLED' ? 'ĐÃ HỦY' : 'BẠN THUA'}</span>
            <strong>{challenge.resultText || 'Trận đấu đã kết thúc.'}</strong>
            {challenge.status === 'RESOLVED' && <div className="rps-revealed-moves"><div className={`is-${myMoveResult}`}><small>{selectedMove?.icon} BẠN</small><b>{selectedMove?.label || '—'}</b><em>{myMoveResult === 'winner' ? '★ THẮNG' : myMoveResult === 'push' ? '◆ HÒA' : '— THUA'}</em></div><i>VS</i><div className={`is-${opponentMoveResult}`}><small>{opponentMove?.icon} {challenge.opponentName}</small><b>{opponentMove?.label || '—'}</b><em>{opponentMoveResult === 'winner' ? '★ THẮNG' : opponentMoveResult === 'push' ? '◆ HÒA' : '— THUA'}</em></div></div>}
            {challenge.status === 'RESOLVED' && <div className="rps-payout">{payout > 0 ? `✦ +${payout} Coin đã trả về ví của bạn` : 'Pot đã chuyển cho người thắng.'}</div>}
          </div>}

          <div className={`rps-error ${error ? '' : 'is-empty'}`} role="alert" aria-live="polite"><span>{error || ' '}</span></div>
          {isIncoming && <div className="rps-action-row"><button className="rps-secondary" onClick={() => send({ action: 'DECLINE', challengeId: challenge.challengeId })}>TỪ CHỐI</button><button className="rps-primary" disabled={coinBalance < challenge.wager} onClick={() => send({ action: 'ACCEPT', challengeId: challenge.challengeId })}>{coinBalance < challenge.wager ? 'KHÔNG ĐỦ COIN' : 'ĐỒNG Ý · VÀO TRẬN'}</button></div>}
          {isPending && !isIncoming && <div className="rps-action-row"><button className="rps-secondary" onClick={close}>HỦY LỜI MỜI</button></div>}
          {isResult && <div className="rps-action-row"><button className="rps-primary" onClick={close}>ĐÓNG KẾT QUẢ</button></div>}
        </section>
      )}
      {rewardToast && <RpsRewardToast notice={rewardToast} />}
      {challenge?.challengeId && <GameChannelChat channel="RPS" />}
    </div>
  )
}
