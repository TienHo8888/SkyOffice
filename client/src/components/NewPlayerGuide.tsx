import React, { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { StudioRoomId, studioRoomName } from '../../../types/StudioWorld'
import { studioApi } from '../services/StudioApi'
import { applySocialReward, setSocialSnapshot } from '../stores/SocialStore'

type GuideStep = { id: string; title: string; detail: string; room: StudioRoomId; done: boolean }

export default function NewPlayerGuide() {
  const dispatch = useAppDispatch()
  const work = useAppSelector((state) => state.work.snapshot)
  const token = useAppSelector((state) => state.user.authToken)
  const dailyClaimDate = useAppSelector((state) => state.social.snapshot?.progression.dailyClaimDate)
  const gameQuests = useAppSelector((state) => state.social.snapshot?.gameQuests || [])
  const room = useAppSelector((state) => state.user.currentRoom || 'LOBBY')
  const [open, setOpen] = useState(() => window.localStorage.getItem('skyoffice:guide-dismissed') !== 'yes')
  // Start in compact mode so the guide does not take over the playable map.
  // The complete checklist remains one tap away via the header toggle.
  const [expanded, setExpanded] = useState(false)
  const [dailyBusy, setDailyBusy] = useState(false)
  const [dailyNotice, setDailyNotice] = useState('')

  const steps = useMemo<GuideStep[]>(() => {
    if (!work) return []
    const career = work.progression.currentCareerId
    const careerDefinition = work.careers.find((entry) => entry.id === career)
    return [
      { id: 'tutorial', title: 'Làm job đầu tiên', detail: 'Mở Job Board để bắt đầu tutorial 4 câu ngay tại chỗ.', room: 'LOBBY', done: work.tutorialCompleted },
      { id: 'career', title: 'Chọn nghề bạn thích', detail: 'Mở Work Hub và chọn nghề ngay tại chỗ; không cần chạy tới workstation.', room: 'LOBBY', done: Boolean(career) },
      { id: 'jobs', title: 'Làm đủ 3 Career Jobs', detail: careerDefinition ? `Bạn đang theo ${careerDefinition.name}. Bấm “Làm job” để mở challenge ngay.` : 'Hãy chọn nghề trước, sau đó bấm “Làm job” để bắt đầu.', room: careerDefinition?.roomId || 'LOBBY', done: work.daily.completedJobs >= 3 },
      { id: 'salary', title: 'Nhận lương ngày', detail: `Đã hoàn thành ${work.daily.completedJobs}/3 job. Đủ 3 job thì đi tới Payroll Office và nhấn E để nhận lương.`, room: 'MEETING', done: work.salary.state === 'CLAIMED' },
      { id: 'play', title: 'Chơi game để kiếm thêm', detail: 'Đi bộ qua Social Connector tới Play Wing, tới gần bàn/máy rồi nhấn E. Game Coin có phí và rủi ro.', room: 'GAME_LOUNGE', done: room === 'GAME_LOUNGE' || room === 'ARCADE' || room === 'CARD_ROOM' },
    ]
  }, [room, work])

  if (!work) return null
  const next = steps.find((step) => !step.done)
  const completed = steps.filter((step) => step.done).length
  const dismiss = () => {
    window.localStorage.setItem('skyoffice:guide-dismissed', 'yes')
    setOpen(false)
  }
  const today = new Date().toISOString().slice(0, 10)
  const dailyClaimed = dailyClaimDate === today
  const nextGameQuest = gameQuests.find((quest) => quest.category === 'DAILY' && quest.metric === 'PLAY_ROUND' && !quest.completed)
    || gameQuests.find((quest) => quest.category === 'DAILY' && !quest.completed)
  const claimDaily = async () => {
    if (!token || dailyBusy || dailyClaimed) return
    setDailyBusy(true)
    try {
      const reward = await studioApi.claimDailySocialReward(token)
      dispatch(applySocialReward(reward))
      const snapshot = await studioApi.social(token)
      dispatch(setSocialSnapshot(snapshot))
      setDailyNotice(reward.duplicate ? 'Hôm nay đã nhận rồi.' : `Đã nhận +${reward.coinDelta} Coin!`)
    } catch {
      setDailyNotice('Chưa nhận được, hãy thử lại sau.')
    } finally { setDailyBusy(false) }
  }

  if (!open) return <button className="guide-reopen" onClick={() => setOpen(true)}><span>!</span> LÀM GÌ TIẾP?</button>
  return <aside className={`new-player-guide ${expanded ? 'is-expanded' : ''}`}>
    <header><div><span>NEW PLAYER FLOW</span><strong>{completed}/{steps.length} bước</strong></div><div className="new-player-guide-actions"><button aria-label={expanded ? 'Thu gọn hướng dẫn' : 'Mở rộng hướng dẫn'} onClick={() => setExpanded(!expanded)}>{expanded ? '–' : '+'}</button><button className="new-player-guide-dismiss" aria-label="Ẩn hướng dẫn" onClick={dismiss}>×</button></div></header>
    <div className="guide-progress"><i style={{ width: `${Math.round(completed / steps.length * 100)}%` }} /></div>
    {next && <div className="guide-next"><small>VIỆC CẦN LÀM NGAY</small><strong>{next.title}</strong><p>{next.detail}<span className="guide-walk-hint">WASD → {studioRoomName(next.room)} · E TƯƠNG TÁC</span></p></div>}
    {expanded && <ol>{steps.map((step, index) => <li className={step.done ? 'done' : step.id === next?.id ? 'current' : ''} key={step.id}><b>{step.done ? '✓' : index + 1}</b><div><strong>{step.title}</strong><small>{step.done ? 'Đã hoàn thành' : studioRoomName(step.room)}</small></div></li>)}</ol>}
    {expanded && nextGameQuest && <div className="guide-quest"><span>NHIỆM VỤ GAME TỰ ĐỘNG</span><strong>{nextGameQuest.title}</strong><p>{nextGameQuest.description}</p><div><i style={{ width: `${Math.min(100, nextGameQuest.progress / Math.max(1, nextGameQuest.target) * 100)}%` }} /></div><small>{nextGameQuest.progress}/{nextGameQuest.target} · +{nextGameQuest.xpReward} EXP · Không cần bấm nhận</small></div>}
    {expanded && <div className="guide-money"><strong>KIẾM COIN Ở ĐÂU?</strong><p><b>① Career Jobs</b> · 30–75 Coin/job<br/><b>② Paycheck</b> · đủ 3 job/ngày<br/><b>③ Daily Reward</b> · 100 Coin/ngày<br/><b>④ Game bàn</b> · có phí và rủi ro</p><button disabled={dailyClaimed || dailyBusy} onClick={claimDaily}>{dailyClaimed ? '✓ ĐÃ NHẬN 100 COIN HÔM NAY' : dailyBusy ? 'ĐANG NHẬN…' : 'NHẬN DAILY 100 COIN →'}</button>{dailyNotice && <em>{dailyNotice}</em>}<small>Production Task = việc của team, cho Production XP/Boss damage và không trả Coin. Nhiệm vụ Game = mục tiêu tự tăng khi chơi.</small></div>}
    {expanded && <footer><span>WASD di chuyển · E tương tác · Enter chat · Esc đóng</span><button onClick={dismiss}>Ẩn hướng dẫn</button></footer>}
  </aside>
}
