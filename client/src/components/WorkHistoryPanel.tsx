import React from 'react'
import { WorkSnapshot } from '../../../types/Work'

export default function WorkHistoryPanel({ snapshot }: { snapshot: WorkSnapshot }) {
  return <div className="work-page"><div className="work-page-title"><div><span className="work-kicker">PERSONAL LOG / PRIVATE</span><h2>Work history</h2><p>Chỉ bạn nhìn thấy record cá nhân này. Không có productivity leaderboard.</p></div><div className="work-cap-pill">LAST {snapshot.history.length} RECORDS</div></div><div className="work-history-card">{snapshot.history.length === 0 ? <div className="work-empty">Chưa có shift nào. Tới Job Board để bắt đầu.</div> : snapshot.history.map((entry) => <div className="work-history-row" key={entry.sessionId}><div className="work-history-icon">{entry.status === 'COMPLETED' ? '✓' : '×'}</div><div><strong>{entry.jobName}</strong><small>{entry.careerId || 'TUTORIAL'} · {new Date(entry.createdAt).toLocaleString()}</small></div><span>{entry.status}</span><b>{entry.grade || '—'}</b><em>{entry.coinDelta > 0 ? `+${entry.coinDelta}` : '0'} Coin<br />{entry.careerXpDelta > 0 ? `+${entry.careerXpDelta}` : '0'} XP</em></div>)}</div></div>
}
