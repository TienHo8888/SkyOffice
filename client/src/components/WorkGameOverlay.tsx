import React, { useMemo, useState } from 'react'
import { WorkChallengePublic } from '../../../types/Work'

interface WorkGameOverlayProps {
  challenge: WorkChallengePublic
  sessionId: string
  endsAt: number
  answeredSteps: number
  totalSteps: number
  onAction: (stepId: string, optionId: string) => void
  onSubmit: () => void
  onCancel: () => void
  error?: { code?: string; message: string } | null
}

export default function WorkGameOverlay({ challenge, sessionId, endsAt, answeredSteps, totalSteps, onAction, onSubmit, onCancel, error }: WorkGameOverlayProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const progress = totalSteps ? answeredSteps / totalSteps * 100 : 0
  const selectedCount = useMemo(() => Object.keys(answers).length, [answers])

  const choose = (stepId: string, optionId: string) => {
    setAnswers((current) => ({ ...current, [stepId]: optionId }))
    onAction(stepId, optionId)
  }

  return <div className="work-game-layer" role="dialog" aria-modal="true" aria-label={`${challenge.title} work session`}>
    <section className="work-game-panel">
      <header className="work-game-header">
        <div>
          <span className="work-kicker">CAREER JOB / {challenge.difficultyLabel?.toUpperCase() || 'LIVE SESSION'} · LEVEL {challenge.difficulty || 1}/6</span>
          <h2>{challenge.title}</h2>
          <p>{challenge.instruction}</p>
        </div>
        <div className={`work-game-timer ${secondsLeft <= 10 ? 'is-warning' : ''}`}><small>TIME LEFT</small><strong>{secondsLeft}s</strong></div>
      </header>
      <div className="work-game-meta"><span>SESSION {sessionId.slice(-8)}</span><span>{answeredSteps} / {totalSteps} steps synced</span>{challenge.questionBankSize && <span>NGÂN HÀNG {challenge.questionBankSize.toLocaleString()} CÂU / NGHỀ</span>}<div className="work-progress"><i style={{ width: `${Math.max(progress, selectedCount / Math.max(1, challenge.steps.length) * 100)}%` }} /></div></div>
      <div className={`work-game-error ${error ? '' : 'is-empty'}`} role="alert" aria-live="polite"><span>{error?.message || ' '}</span></div>
      <div className="work-challenge-list">
        {challenge.steps.map((step, index) => <article className="work-challenge-card" key={step.id}>
          <div className="work-challenge-card-head"><span>0{index + 1}</span><div><strong>{step.title}</strong><p>{step.prompt}</p></div><b className={`work-answered ${answers[step.id] ? '' : 'is-empty'}`}>SYNCED</b></div>
          {step.image && <figure className="work-question-visual"><img src={step.image.src} alt={step.image.alt} /><figcaption>{step.image.caption}</figcaption></figure>}
          <div className="work-option-grid">{step.options.map((option) => <button className={answers[step.id] === option.id ? 'is-selected' : ''} key={option.id} onClick={() => choose(step.id, option.id)}><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</button>)}</div>
        </article>)}
      </div>
      <footer className="work-game-footer">
        {confirmCancel ? <div className="work-confirm"><span>Bỏ job sẽ không nhận Coin và chỉ có participation XP.</span><button className="work-danger" onClick={onCancel}>XÁC NHẬN BỎ</button><button className="work-quiet" onClick={() => setConfirmCancel(false)}>TIẾP TỤC</button></div> : <><button className="work-quiet" onClick={() => setConfirmCancel(true)}>ABANDON</button><button className="work-primary" disabled={!answeredSteps && !selectedCount} onClick={onSubmit}>SUBMIT JOB →</button></>}
      </footer>
    </section>
  </div>
}
