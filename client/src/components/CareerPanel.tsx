import React from 'react'
import { WorkRankDefinition, WorkSnapshot } from '../../../types/Work'

interface CareerPanelProps {
  snapshot: WorkSnapshot
  focusCareerId?: WorkSnapshot['careers'][number]['id']
  onSelect: (careerId: WorkSnapshot['careers'][number]['id']) => void
  onChange: (careerId: WorkSnapshot['careers'][number]['id']) => void
  onCertify: (rank: WorkRankDefinition) => void
}

const careerChoiceHelp: Record<string, string> = {
  ART: 'Bạn thích màu sắc, bố cục và hình ảnh.',
  ANIMATION: 'Bạn thích chuyển động, nhịp và keyframe.',
  GAME_DESIGN: 'Bạn thích luật chơi, flow và cân bằng.',
  FRONTEND: 'Bạn thích giao diện và tương tác nhìn thấy được.',
  BACKEND: 'Bạn thích logic, event và luồng dữ liệu.',
  QA: 'Bạn thích săn bug và thử tình huống lạ.',
  QC: 'Bạn thích checklist và tiêu chuẩn chất lượng.',
  PM: 'Bạn thích sắp xếp ưu tiên, rủi ro và kế hoạch.',
  HR: 'Bạn thích onboarding và kết nối con người.',
}

export default function CareerPanel({ snapshot, focusCareerId, onSelect, onChange, onCertify }: CareerPanelProps) {
  const current = snapshot.progression.currentCareerId
  const currentCareer = snapshot.careers.find((career) => career.id === current)
  const focusedCareer = focusCareerId ? snapshot.careers.find((career) => career.id === focusCareerId) : undefined
  const currentTrack = current ? snapshot.progression.careers.find((entry) => entry.careerId === current) : undefined
  const currentRankIndex = snapshot.ranks.findIndex((rank) => rank.id === (currentTrack?.rank || 'INTERN'))
  const nextRank = snapshot.ranks[currentRankIndex + 1]
  const canCertify = Boolean(nextRank && currentTrack && currentTrack.careerXp >= nextRank.careerXpRequired)
  const careerChoices = !current && !focusedCareer ? snapshot.careers : focusedCareer ? [focusedCareer] : []
  const panelTitle = focusedCareer ? `Chọn nghề · ${focusedCareer.name}` : current ? 'Nghề hiện tại & chứng chỉ' : 'Chọn nghề trực tiếp trong Work Hub'
  const panelDescription = focusedCareer
    ? `Bạn đang xem ${focusedCareer.name}. Chọn nghề này để mở job và tiến cấp theo đúng trạm.`
    : current
      ? 'Career Center hiển thị nghề hiện tại và chứng chỉ. Bạn vẫn có thể đổi nghề khi hết thời gian chờ.'
      : 'Chọn một trong 9 nghề ngay tại đây — không cần chạy tới từng workstation trong map.'

  return <div className="work-page">
    <div className="work-page-title"><div><span className="work-kicker">CAREER CENTER</span><h2>{panelTitle}</h2><p>{panelDescription}</p></div>{currentCareer && <div className="work-cap-pill">NGHỀ HIỆN TẠI · {currentCareer.name.toUpperCase()}</div>}</div>
    {!current && <div className="work-onboarding-banner"><span>{snapshot.tutorialCompleted ? '✦' : '01'}</span><div><strong>{focusedCareer ? `Chọn ${focusedCareer.name}` : snapshot.tutorialCompleted ? 'Chọn nghề ngay trong Work Hub' : 'Làm tutorial rồi chọn nghề'}</strong><p>{focusedCareer ? `Chọn nghề để mở các job tương ứng; bạn có thể đổi nghề sau 24 giờ.` : snapshot.tutorialCompleted ? 'Không cần chạy tới workstation. Chọn một thẻ nghề bên dưới và bắt đầu career ngay.' : 'Hoàn thành Inbox Triage một lần trong tab Job Board, ngay trong cửa sổ này; sau đó quay lại đây để chọn nghề.'}</p></div></div>}
    {current && currentTrack && currentCareer && <div className="work-career-hero"><div><span className="work-kicker">CURRENT CAREER</span><h3>{currentCareer.name} <small>{currentTrack.rank}</small></h3><p>{currentCareer.description}</p></div><div className="work-career-hero-stat"><strong>{currentTrack.careerXp.toLocaleString()}</strong><small>CAREER XP</small>{nextRank ? <><div className="work-progress"><i style={{ width: `${Math.min(100, currentTrack.careerXp / Math.max(1, nextRank.careerXpRequired) * 100)}%` }} /></div><span>{nextRank.name} at {nextRank.careerXpRequired.toLocaleString()} XP</span></> : <span>Highest rank reached</span>}</div>{canCertify && nextRank && <button className="work-primary" onClick={() => onCertify(nextRank)}>TAKE {nextRank.name.toUpperCase()} CERT →</button>}</div>}
    {careerChoices.length > 0 && <div className={`work-career-choice-grid ${focusedCareer ? 'is-focused' : ''}`}>
      {careerChoices.map((career) => {
        const track = snapshot.progression.careers.find((entry) => entry.careerId === career.id)
        const rank = track?.rank || 'INTERN'
        const careerXp = track?.careerXp || 0
        const isActive = career.id === current
        const rankXp = snapshot.ranks.find((entry) => entry.id === rank)?.careerXpRequired || 0
        return <article className={`work-career-card ${isActive ? 'is-active' : ''}`} key={career.id} style={{ borderColor: isActive ? career.accent : undefined }}>
          <div className="work-career-card-head"><span style={{ color: career.accent }}>{career.id.replace('_', ' ')}</span><b>{rank}</b></div>
          <h3>{career.name}</h3>
          <p>{career.description}</p>
          <div className="career-fit"><b>HỢP NẾU</b>{careerChoiceHelp[career.id]}</div>
          <small>2 job mở ngay · {careerXp.toLocaleString()} XP</small>
          <div className="work-progress"><i style={{ width: `${Math.min(100, careerXp / Math.max(1, rankXp + 300) * 100)}%`, background: career.accent }} /></div>
          {isActive ? <button className="work-quiet" disabled>ĐANG THEO NGHỀ NÀY</button> : current ? <button className="work-quiet" onClick={() => onChange(career.id)}>ĐỔI SANG {career.name.toUpperCase()}</button> : <button className="work-primary" disabled={!snapshot.tutorialCompleted} onClick={() => onSelect(career.id)}>{snapshot.tutorialCompleted ? `CHỌN ${career.name.toUpperCase()} →` : 'LÀM TUTORIAL TRƯỚC'}</button>}
        </article>
      })}
    </div>}
  </div>
}
