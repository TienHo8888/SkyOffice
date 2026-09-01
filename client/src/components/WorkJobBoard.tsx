import React, { useState } from 'react'
import { WorkJobDefinition, WorkRankDefinition, WorkSnapshot } from '../../../types/Work'

interface WorkJobBoardProps {
  snapshot: WorkSnapshot
  onStart: (job: WorkJobDefinition) => void
  busyJobId?: string
}

function rankIndex(ranks: WorkRankDefinition[], rank: string) {
  return ranks.findIndex((entry) => entry.id === rank)
}

export default function WorkJobBoard({ snapshot, onStart, busyJobId }: WorkJobBoardProps) {
  const currentCareer = snapshot.progression.currentCareerId
  const currentRank = snapshot.progression.currentRank
  const [showLocked, setShowLocked] = useState(false)
  const relevantJobs = snapshot.jobs.filter((job) => job.careerIds.length === 0 || Boolean(currentCareer && job.careerIds.includes(currentCareer)))
  const lockedJobCount = relevantJobs.filter((job) => rankIndex(snapshot.ranks, currentRank) < rankIndex(snapshot.ranks, job.minRank)).length
  const visibleJobs = relevantJobs.filter((job) => showLocked || rankIndex(snapshot.ranks, currentRank) >= rankIndex(snapshot.ranks, job.minRank))
  return <div className="work-page">
    <div className="work-page-title"><div><span className="work-kicker">WORK DISTRICT / JOB KIẾM COIN</span><h2>Chọn một ca làm ngắn</h2><p>Bấm “Làm job” để mở challenge ngay tại chỗ. Làm puzzle 45–75 giây để nhận Coin và Career XP.</p></div><div className="work-cap-pill">{snapshot.daily.paidJobs} / 8 JOB TRẢ COIN · {snapshot.daily.sessionCount} / 12 LƯỢT</div></div>
    {!currentCareer && <div className="work-onboarding-banner"><span>✦</span><div><strong>Bước 1 · Làm Inbox Triage</strong><p>Đây là tutorial đầu tiên. Hoàn thành xong, mở tab Career trong Work Hub để chọn nghề ngay; không cần đi tới workstation trong map.</p></div></div>}
    {currentCareer && <div className="work-flow-banner"><b>FLOW KIẾM TIỀN HÔM NAY</b><span>Chọn job → giải puzzle → nhận Coin ngay → đủ 3 job → vào Paycheck nhận thêm lương</span></div>}
    <div className="work-stat-grid"><div><small>COIN WALLET</small><strong>✦ {snapshot.coinBalance.toLocaleString()}</strong><em>Shared social currency</em></div><div><small>CAREER</small><strong>{currentCareer ? snapshot.careers.find((career) => career.id === currentCareer)?.name : 'Tutorial'}</strong><em>{currentCareer ? `${snapshot.progression.currentRank} · ${snapshot.progression.careerXp} XP` : 'Inbox Triage first'}</em></div><div><small>SALARY PROGRESS</small><strong>{snapshot.daily.completedJobs} / 3</strong><em>{snapshot.salary.state === 'READY' ? 'Paycheck ready' : 'Valid jobs today'}</em></div><div><small>WORK STREAK</small><strong>♨ {snapshot.progression.workStreak}</strong><em>{snapshot.salary.streak >= 7 ? '+10% salary bonus' : snapshot.salary.streak >= 3 ? '+5% salary bonus' : 'Keep working to build it'}</em></div></div>
    <div className="work-section-head"><div><span className="work-kicker">AVAILABLE CONTRACTS</span><h3>{currentCareer ? `${snapshot.careers.find((career) => career.id === currentCareer)?.name} Jobs` : 'Tutorial Job'}</h3></div>{lockedJobCount > 0 && <button className="work-filter-toggle" onClick={() => setShowLocked(!showLocked)}>{showLocked ? 'Ẩn job chưa mở' : `Xem ${lockedJobCount} job sắp mở`}</button>}</div>
    <div className="work-job-grid">{visibleJobs.map((job) => {
      const isGeneral = job.careerIds.length === 0
      const careerAllowed = isGeneral || Boolean(currentCareer && job.careerIds.includes(currentCareer))
      const rankAllowed = rankIndex(snapshot.ranks, currentRank) >= rankIndex(snapshot.ranks, job.minRank)
      const count = snapshot.daily.jobCounts[job.id] || 0
      const available = careerAllowed && rankAllowed && count < job.dailyLimit && snapshot.daily.sessionCount < 12
      const careerLabel = isGeneral ? 'ALL CAREERS' : job.careerIds.map((id) => snapshot.careers.find((career) => career.id === id)?.name || id).join(' · ')
      return <article className={`work-job-card ${available ? '' : 'is-locked'}`} key={job.id}><div className="work-job-icon">{isGeneral ? '▦' : job.careerIds[0] === 'QA' ? '⌕' : job.careerIds[0] === 'QC' ? '✓' : job.careerIds[0] === 'PM' ? '◈' : job.careerIds[0] === 'HR' ? '♡' : '◆'}</div><div className="work-job-copy"><div className="work-job-title"><strong>{job.name}</strong><span>{job.durationSeconds}s</span></div><small>{careerLabel} · RANK {job.minRank} · CHALLENGE NGAY</small><p>{job.description}</p><div className="work-job-reward"><span>✦ +{job.baseCoin} Coin</span><span>✧ +{job.baseCareerXp} XP</span><span>{count} / {job.dailyLimit} hôm nay</span></div></div><button className="work-primary work-job-start" disabled={!available || busyJobId === job.id} onClick={() => onStart(job)}>{busyJobId === job.id ? 'ĐANG BẮT ĐẦU…' : !careerAllowed ? 'KHÔNG ĐÚNG NGHỀ' : !rankAllowed ? `CẦN RANK ${job.minRank}` : count >= job.dailyLimit ? 'ĐÃ HẾT LƯỢT HÔM NAY' : `LÀM JOB · +${job.baseCoin} COIN →`}</button></article>
    })}</div>
  </div>
}
