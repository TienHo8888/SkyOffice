import React from 'react'
import { WorkReward } from '../../../types/Work'

export default function WorkResultReceipt({ reward, onDismiss }: { reward: WorkReward; onDismiss: () => void }) {
  return <div className="work-result-toast" role="status" aria-live="polite">
    <strong>SHIFT SETTLED</strong>
    <span>Grade {reward.grade}</span>
    <b>+{reward.coinDelta} Coin · +{reward.careerXpDelta} Career XP</b>
    <button onClick={onDismiss}>DISMISS</button>
  </div>
}
