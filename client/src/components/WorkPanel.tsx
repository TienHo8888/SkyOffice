import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { Event, phaserEvents } from '../events/EventCenter'
import { studioApi, StudioApiError } from '../services/StudioApi'
import { applyWorkCoinBalance, setSocialSnapshot } from '../stores/SocialStore'
import { applyCertificationResult, applySalaryReceipt, applyWorkReward, clearWorkError, clearWorkReceipt, clearWorkSession, setWorkError, setWorkLoading, setWorkSnapshot, startWorkSession, updateWorkSession } from '../stores/WorkStore'
import { isWorkInteractiveObject, StudioInteractiveObject, studioRoomName } from '../../../types/StudioWorld'
import { WorkCertificationResult, WorkChallengePublic, WorkJobDefinition, WorkReward, WorkSnapshot } from '../../../types/Work'
import WorkGameOverlay from './WorkGameOverlay'
import WorkJobBoard from './WorkJobBoard'
import CareerPanel from './CareerPanel'
import PaycheckPanel from './PaycheckPanel'
import WorkHistoryPanel from './WorkHistoryPanel'
import WorkResultReceipt from './WorkResultReceipt'
import CertificationOverlay from './CertificationOverlay'

type WorkTab = 'jobs' | 'career' | 'paycheck' | 'history'

function actionId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

export default function WorkPanel() {
  const dispatch = useAppDispatch()
  const token = useAppSelector((state) => state.user.authToken)
  const currentRoom = useAppSelector((state) => state.user.currentRoom)
  const work = useAppSelector((state) => state.work)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<WorkTab>('jobs')
  const [careerFocusId, setCareerFocusId] = useState<WorkSnapshot['careers'][number]['id']>()
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const refresh = async () => {
    if (!token) return
    dispatch(setWorkLoading(true))
    try {
      dispatch(setWorkSnapshot(await studioApi.work(token)))
    } catch (error) {
      dispatch(setWorkError({ code: error instanceof StudioApiError ? error.code : undefined, message: error instanceof StudioApiError ? error.message : 'Không thể tải Work District.' }))
    } finally {
      dispatch(setWorkLoading(false))
    }
  }

  useEffect(() => { refresh() }, [token])

  useEffect(() => {
    const interaction = (object: StudioInteractiveObject) => {
      if (!isWorkInteractiveObject(object.type)) return
      setOpen(true)
      if (object.type === 'CAREER_CENTER') {
        setCareerFocusId(undefined)
        setTab('career')
      } else if (object.type === 'WORK_STATION') {
        const stationCareer = work.snapshot?.careers.find((career) => career.stationId === object.stationId)
        if (stationCareer && stationCareer.id !== work.snapshot?.progression.currentCareerId) {
          setCareerFocusId(stationCareer.id)
          setTab('career')
        } else {
          setCareerFocusId(undefined)
          setTab('jobs')
        }
      } else if (object.type === 'PAYROLL_OFFICE') setTab('paycheck')
      else setTab('jobs')
    }
    const started = (payload: { sessionId: string; challenge: WorkChallengePublic; startedAt: number; endsAt: number }) => dispatch(startWorkSession(payload))
    const stateUpdate = (payload: { sessionId: string; answeredSteps: number; totalSteps: number; endsAt: number }) => dispatch(updateWorkSession(payload))
    const result = (payload: WorkReward | WorkCertificationResult) => {
      if (payload.mode === 'CERTIFICATION') {
        dispatch(applyCertificationResult(payload))
        setNotice(payload.passed ? `Promotion unlocked · ${payload.currentRank}` : `Certification chưa đạt · ${payload.score}/100`)
      } else {
        dispatch(applyWorkReward(payload))
        dispatch(applyWorkCoinBalance(payload.coinBalance))
        const cancelled = payload.score === 0 && payload.coinDelta === 0 && payload.careerXpDelta === 0
        if (cancelled) {
          dispatch(clearWorkReceipt())
          setNotice('Đã hủy ca làm. Không mất Coin và không tính vào tiến độ 3 job.')
          setTab('jobs')
        } else {
          setNotice(payload.duplicate ? 'Reward đã được ghi nhận trước đó.' : `Grade ${payload.grade} · +${payload.coinDelta} Coin · +${payload.careerXpDelta} Career XP`)
          if (payload.jobId === 'INBOX_TRIAGE' && !payload.careerId && payload.coinDelta > 0) {
            setCareerFocusId(undefined)
            setTab('career')
          }
        }
      }
      setOpen(true)
      refresh()
      if (token) studioApi.social(token).then((snapshot) => dispatch(setSocialSnapshot(snapshot))).catch(() => undefined)
    }
    const error = (payload: { code?: string; message: string }) => {
      dispatch(setWorkError(payload))
      setNotice(payload.message)
      setOpen(true)
    }
    phaserEvents.on(Event.WORK_INTERACTION, interaction)
    phaserEvents.on(Event.WORK_SESSION_STARTED, started)
    phaserEvents.on(Event.WORK_STATE, stateUpdate)
    phaserEvents.on(Event.WORK_RESULT, result)
    phaserEvents.on(Event.WORK_ERROR, error)
    return () => {
      phaserEvents.off(Event.WORK_INTERACTION, interaction)
      phaserEvents.off(Event.WORK_SESSION_STARTED, started)
      phaserEvents.off(Event.WORK_STATE, stateUpdate)
      phaserEvents.off(Event.WORK_RESULT, result)
      phaserEvents.off(Event.WORK_ERROR, error)
    }
  }, [dispatch, token, work.snapshot])

  useEffect(() => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game) return
    // Keep the job browser non-blocking. Only an active timed challenge owns
    // the keyboard; this prevents a stale/open panel from freezing WASD.
    if (work.activeSession) game.disableKeys('work-panel')
    else game.enableKeys('work-panel')
    return () => game.enableKeys('work-panel')
  }, [work.activeSession])

  const startJob = (job: WorkJobDefinition) => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game?.network) { setNotice('World chưa kết nối. Hãy vào office trước.'); setOpen(true); return }
    dispatch(clearWorkError())
    dispatch(clearWorkReceipt())
    setBusy(job.id)
    setNotice('Đang mở challenge nghề…')
    // The server still validates proximity to the Job Board or matching workstation.
    // The panel only opens the private challenge after the player reaches that point.
    game.network.startWork({ jobId: job.id, stationId: job.stationId, actionId: actionId(`start:${job.id}`), careerId: work.snapshot?.progression.currentCareerId })
    setBusy((current) => current === job.id ? '' : current)
  }

  const selectCareer = async (careerId: WorkSnapshot['careers'][number]['id'], changing = false) => {
    if (!token) return
    setBusy(careerId)
    try {
      const progression = changing ? await studioApi.changeCareer(token, careerId) : await studioApi.selectCareer(token, careerId)
      if (work.snapshot) dispatch(setWorkSnapshot({ ...work.snapshot, progression }))
      setCareerFocusId(undefined)
      setNotice(changing ? `Đã chuyển sang ${careerId}.` : `Career ${careerId} đã được chọn.`)
      await refresh()
      // A career title is valid only for the active career. Refresh the
      // social loadout too so switching career immediately updates the
      // character label and title collection.
      try {
        const socialSnapshot = await studioApi.social(token)
        dispatch(setSocialSnapshot(socialSnapshot))
        phaserEvents.emit(Event.MY_PLAYER_TITLE_CHANGE, socialSnapshot.loadout.titleId || '')
      } catch { /* Work update already succeeded. */ }
    } catch (error) {
      setNotice(error instanceof StudioApiError ? error.message : 'Không thể cập nhật career.')
    } finally { setBusy('') }
  }

  const startCertification = (targetRank: WorkSnapshot['ranks'][number]) => {
    const game = phaserGame.scene.keys.game as Game | undefined
    const careerId = work.snapshot?.progression.currentCareerId
    if (!game?.network || !careerId) return
    dispatch(clearWorkReceipt())
    setBusy(`cert:${targetRank.id}`)
    setNotice('Đang mở bài thi certification…')
    game.network.startWork({ mode: 'CERTIFICATION', careerId, targetRank: targetRank.id, stationId: 'CAREER_CENTER', actionId: actionId(`cert:${careerId}:${targetRank.id}`) })
    setBusy('')
  }

  const claimSalary = async () => {
    if (!token) return
    setBusy('salary')
    try {
      setNotice('Đang mở Paycheck…')
      const receipt = await studioApi.claimDailySalary(token)
      dispatch(applySalaryReceipt(receipt))
      dispatch(applyWorkCoinBalance(receipt.coinBalance))
      setNotice(`Paycheck received · +${receipt.coinDelta} Coin`)
      await refresh()
      await studioApi.social(token).then((snapshot) => dispatch(setSocialSnapshot(snapshot))).catch(() => undefined)
    } catch (error) { setNotice(error instanceof StudioApiError ? error.message : 'Không thể nhận paycheck.') }
    finally { setBusy('') }
  }

  const submit = () => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (game?.network && work.activeSession) game.network.submitWork({ sessionId: work.activeSession.sessionId, actionId: actionId('submit') })
  }

  const cancel = () => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (game?.network && work.activeSession) game.network.cancelWork({ sessionId: work.activeSession.sessionId, actionId: actionId('cancel') })
    else dispatch(clearWorkSession())
  }

  const sendAction = (stepId: string, optionId: string) => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (game?.network && work.activeSession) game.network.workAction({ sessionId: work.activeSession.sessionId, actionId: actionId(`step:${stepId}`), actionType: 'SELECT_OPTION', payload: { stepId, optionId } })
  }

  if (!token || !work.snapshot) return null
  const snapshot = work.snapshot
  const result = work.lastReward
  return <>
   {!open && <button className="work-closed-dock" onClick={() => setOpen(true)}><span>◆</span><strong>{!snapshot.tutorialCompleted ? 'BẮT ĐẦU KIẾM COIN' : snapshot.progression.currentCareerId ? 'CAREER JOBS' : 'CHỌN NGHỀ'}</strong><small>{snapshot.coinBalance.toLocaleString()} Coin · {!snapshot.tutorialCompleted ? 'Làm tutorial đầu tiên' : snapshot.progression.currentCareerId || 'Chọn trực tiếp trong Work Hub'}</small><b>↗</b></button>}
   {open && <div className="work-layer"><section className="work-shell"><header className="work-topbar"><div className="work-brand"><span>◆</span><div><strong>WORK DISTRICT</strong><small>CAREER LIFE SIM</small></div></div><div className="work-location"><i />{studioRoomName(currentRoom || 'LOBBY')} <small>· {snapshot.progression.currentCareerId || 'TUTORIAL'}</small></div><div className="work-top-actions"><span className="work-coin">✦ {snapshot.coinBalance.toLocaleString()} COIN</span><button className="work-close" onClick={() => setOpen(false)}>×</button></div></header><div className="work-body"><aside className="work-sidebar"><button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}><span>▦</span> Job Board</button><button className={tab === 'career' ? 'active' : ''} onClick={() => { setCareerFocusId(undefined); setTab('career') }}><span>◆</span> Career</button><button className={tab === 'paycheck' ? 'active' : ''} onClick={() => setTab('paycheck')}><span>✦</span> Paycheck</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><span>◷</span> History</button><div className="work-sidebar-bottom"><small>WORK STREAK</small><strong>♨ {snapshot.progression.workStreak}</strong><p>{snapshot.daily.completedJobs} / 3 valid jobs<br />{snapshot.salary.state}</p><button onClick={() => setOpen(false)}>← BACK TO OFFICE</button></div></aside><main className="work-main">{(notice || work.error) && <div className={`work-notice ${work.error ? 'is-error' : ''}`}>{work.error?.message || notice}<button onClick={() => { setNotice(''); dispatch(clearWorkError()) }}>×</button></div>}{tab === 'jobs' && <WorkJobBoard snapshot={snapshot} onStart={startJob} busyJobId={busy} />}{tab === 'career' && <CareerPanel snapshot={snapshot} focusCareerId={careerFocusId} onSelect={(careerId) => selectCareer(careerId)} onChange={(careerId) => selectCareer(careerId, true)} onCertify={startCertification} />}{tab === 'paycheck' && <PaycheckPanel snapshot={snapshot} onClaim={claimSalary} busy={busy === 'salary'} receipt={work.lastSalaryReceipt} />}{tab === 'history' && <WorkHistoryPanel snapshot={snapshot} />}</main></div></section></div>}
    {work.activeSession && work.activeChallenge && <WorkGameOverlay challenge={work.activeChallenge} sessionId={work.activeSession.sessionId} endsAt={work.activeSession.endsAt} answeredSteps={work.answeredSteps} totalSteps={work.totalSteps} onAction={sendAction} onSubmit={submit} onCancel={cancel} error={work.error} />}
    {!work.activeSession && result && open && <WorkResultReceipt reward={result} onDismiss={() => dispatch(clearWorkReceipt())} />}
    {!work.activeSession && work.lastCertification && open && <CertificationOverlay result={work.lastCertification} onDismiss={() => dispatch(clearWorkReceipt())} />}
  </>
}
