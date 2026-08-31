import React from 'react'
import { WorkCertificationResult } from '../../../types/Work'

export default function CertificationOverlay({ result, onDismiss }: { result: WorkCertificationResult; onDismiss: () => void }) {
  return <div className={`work-certification-toast ${result.passed ? 'is-passed' : 'is-failed'}`} role="status" aria-live="polite">
    <span className="work-kicker">CAREER CENTER / CERTIFICATION RESULT</span>
    <strong>{result.passed ? 'PROMOTION UNLOCKED' : 'TRY AGAIN'}</strong>
    <b>{result.careerId} · {result.targetRank} · {result.score}/100</b>
    <p>{result.passed ? `Bạn đã đạt rank ${result.currentRank}. Career XP được giữ nguyên.` : 'Chưa đạt 70/100. Không mất Career XP; bạn có thể thi lại sau.'}</p>
    <button className="work-quiet" onClick={onDismiss}>CLOSE RECEIPT</button>
  </div>
}
