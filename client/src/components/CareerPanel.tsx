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
  const panelTitle = focusedCareer ? `Chọn nghề tại ${focusedCareer.name}` : current ? 'Nghề hiện tại & chứng chỉ' : 'Chọn nghề tại workstation'
  const panelDescription = focusedCareer
    ? `Bạn đang ở workstation ${focusedCareer.name}. Chọn nghề này để mở job và tiến cấp theo đúng trạm.`
    : current
      ? 'Career Center chỉ hiển thị nghề hiện tại và chứng chỉ. Muốn đổi nghề, hãy đi tới workstation của nghề mới.'
      : 'Bảng tổng hợp nghề đã được bỏ. Hãy đi tới workstation của nghề bạn muốn rồi nhấn E để chọn.'
  const focusedTrack = focusedCareer ? snapshot.progression.careers.find((entry) => entry.careerId === focusedCareer.id) : undefined
  const focusedActive = focusedCareer?.id === current

  return <div className="work-page"><div className="work-page-title"><div><span className="work-kicker">CAREER CENTER</span><h2>{panelTitle}</h2><p>{panelDescription}</p></div>{currentCareer && <div className="work-cap-pill">NGHỀ HIỆN TẠI · {currentCareer.name.toUpperCase()}</div>}</div>
    {!current && <div className="work-onboarding-banner"><span>01</span><div><strong>{focusedCareer ? `Chọn ${focusedCareer.name}` : 'Đi tới workstation để chọn nghề'}</strong><p>{focusedCareer ? `Đây là workstation của ${focusedCareer.name}. Chọn nghề để mở các job tương ứng; bạn có thể đổi nghề sau 24 giờ.` : 'Mỗi nghề có một workstation riêng trong văn phòng. Đi tới đúng trạm rồi nhấn E; Career Center không còn là bảng chọn tất cả nghề.'}</p></div></div>}
    {current && currentTrack && currentCareer && <div className="work-career-hero"><div><span className="work-kicker">CURRENT CAREER</span><h3>{currentCareer.name} <small>{currentTrack.rank}</small></h3><p>{currentCareer.description}</p></div><div className="work-career-hero-stat"><strong>{currentTrack.careerXp.toLocaleString()}</strong><small>CAREER XP</small>{nextRank ? <><div className="work-progress"><i style={{ width: `${Math.min(100, currentTrack.careerXp / Math.max(1, nextRank.careerXpRequired) * 100)}%` }} /></div><span>{nextRank.name} at {nextRank.careerXpRequired.toLocaleString()} XP</span></> : <span>Highest rank reached</span>}</div>{canCertify && nextRank && <button className="work-primary" onClick={() => onCertify(nextRank)}>TAKE {nextRank.name.toUpperCase()} CERT →</button>}</div>}
    {focusedCareer && focusedTrack && <div className="work-career-station-choice"><article className={`work-career-card work-career-station-card ${focusedActive ? 'is-active' : ''}`} style={{ borderColor: focusedActive ? focusedCareer.accent : undefined }}><div className="work-career-card-head"><span style={{ color: focusedCareer.accent }}>{focusedCareer.id.replace('_', ' ')}</span><b>{focusedTrack.rank}</b></div><h3>{focusedCareer.name}</h3><p>{focusedCareer.description}</p><div className="career-fit"><b>HỢP NẾU</b>{careerChoiceHelp[focusedCareer.id]}</div><small>2 job mở ngay · {focusedTrack.careerXp.toLocaleString()} XP</small><div className="work-progress"><i style={{ width: `${Math.min(100, focusedTrack.careerXp / Math.max(1, (snapshot.ranks.find((rank) => rank.id === focusedTrack.rank)?.careerXpRequired || 0) + 300) * 100)}%`, background: focusedCareer.accent }} /></div>{focusedActive ? <button className="work-quiet" disabled>ĐANG THEO NGHỀ NÀY</button> : current ? <button className="work-quiet" onClick={() => onChange(focusedCareer.id)}>ĐỔI SANG {focusedCareer.name.toUpperCase()}</button> : <button className="work-primary" disabled={!snapshot.tutorialCompleted} onClick={() => onSelect(focusedCareer.id)}>{snapshot.tutorialCompleted ? `CHỌN ${focusedCareer.name.toUpperCase()} →` : 'LÀM TUTORIAL TRƯỚC'}</button>}</article></div>}
  </div>
}
