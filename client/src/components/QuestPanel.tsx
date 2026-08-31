import React, { useEffect, useMemo, useState } from 'react'

import { useAppSelector } from '../hooks'
import { GAME_QUEST_DEFINITIONS, GameQuest, GameQuestCategory } from '../../../types/Social'

const categoryMeta: Record<GameQuestCategory, { label: string; short: string; description: string }> = {
  DAILY: { label: 'Hằng ngày', short: 'DAILY', description: 'Reset theo ngày · phần thưởng nhỏ, nhịp chơi đều' },
  WEEKLY: { label: 'Hàng tuần', short: 'WEEKLY', description: 'Mục tiêu dài hơi · phần thưởng lớn hơn' },
  SPECIAL: { label: 'Đặc biệt', short: 'SPECIAL', description: 'Event mùa hiện tại · theo dõi tiến độ cùng studio' },
}

interface QuestPanelProps {
  open: boolean
  onClose: () => void
}

function questReward(quest: GameQuest) {
  const rewards = [`+${quest.xpReward.toLocaleString('vi-VN')} EXP`]
  if (quest.coinReward > 0) rewards.push(`+${quest.coinReward.toLocaleString('vi-VN')} Coin`)
  return rewards.join(' · ')
}

function questDeadline(category: GameQuestCategory) {
  if (category === 'DAILY') return 'Reset mỗi ngày'
  if (category === 'WEEKLY') return 'Reset thứ hai'
  return 'Event mùa 1'
}

function previewQuests(): GameQuest[] {
  return GAME_QUEST_DEFINITIONS.map((quest) => ({ ...quest, progress: 0, completed: false, claimed: false, periodKey: 'preview' }))
}

export default function QuestPanel({ open, onClose }: QuestPanelProps) {
  const [category, setCategory] = useState<GameQuestCategory>('DAILY')
  const [trackedId, setTrackedId] = useState('')
  const [feedback, setFeedback] = useState('')
  const social = useAppSelector((state) => state.social.snapshot)

  const quests = social?.gameQuests?.length ? social.gameQuests : previewQuests()
  const visibleQuests = useMemo(() => quests.filter((quest) => quest.category === category), [category, quests])
  const categoryCount = (key: GameQuestCategory) => quests.filter((quest) => quest.category === key && !quest.claimed).length
  const totalProgress = visibleQuests.reduce((sum, quest) => sum + quest.progress, 0)
  const totalTarget = visibleQuests.reduce((sum, quest) => sum + quest.target, 0)
  const gameXp = social?.progression.gameXp || 0
  const gameLevel = social?.progression.gameLevel || 1
  const xpForCurrentLevel = social?.progression.xpForCurrentLevel || 0
  const xpToNextLevel = social?.progression.xpToNextLevel || 100
  const levelXp = Math.max(0, gameXp - xpForCurrentLevel)
  const levelXpTarget = Math.max(1, xpToNextLevel - xpForCurrentLevel)
  const xpProgress = Math.max(0, Math.min(100, levelXp / levelXpTarget * 100))

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  if (!open) return null

  const toggleTracked = (quest: GameQuest) => {
    const nextTrackedId = trackedId === quest.id ? '' : quest.id
    setTrackedId(nextTrackedId)
    setFeedback(nextTrackedId ? `Đã theo dõi nhiệm vụ “${quest.title}”.` : 'Đã bỏ theo dõi nhiệm vụ.')
  }

  return (
    <div className="game-feature-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="quest-panel" role="dialog" aria-modal="true" aria-labelledby="quest-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="game-feature-header">
          <div>
            <span className="game-feature-kicker">QUEST LOG / CHARACTER EXP</span>
            <h2 id="quest-title">Nhiệm vụ</h2>
            <p>Chơi game và hoàn thành mission để tích EXP nhân vật. Phần thưởng được server tự động ghi nhận.</p>
          </div>
          <button className="game-feature-close" aria-label="Đóng bảng nhiệm vụ" onClick={onClose}>×</button>
        </header>

        <section className="quest-character-progress" aria-label="Tiến độ EXP nhân vật">
          <div><span>CHARACTER LEVEL {gameLevel}</span><strong>{levelXp.toLocaleString('vi-VN')} <small>/ {levelXpTarget.toLocaleString('vi-VN')} EXP cấp này</small></strong></div>
          <div className="quest-character-progress-bar"><i style={{ width: `${xpProgress}%` }} /></div>
        </section>

        <nav className="quest-tabs" aria-label="Loại nhiệm vụ">
          {(Object.keys(categoryMeta) as GameQuestCategory[]).map((key) => <button className={category === key ? 'is-active' : ''} key={key} onClick={() => { setCategory(key); setFeedback('') }}>
            <span>{categoryMeta[key].short}</span><strong>{categoryMeta[key].label}</strong><b>{categoryCount(key)}</b>
          </button>)}
        </nav>

        <div className="quest-summary">
          <div><span>{categoryMeta[category].short} TRACKER</span><strong>{totalProgress} <small>/ {totalTarget} progress</small></strong></div>
          <p>{categoryMeta[category].description}</p>
        </div>

        <div className="quest-list">
          {visibleQuests.map((quest) => {
            const progressPercent = Math.max(0, Math.min(100, quest.progress / Math.max(1, quest.target) * 100))
            const isTracked = trackedId === quest.id
            return <article className={`quest-card ${isTracked ? 'is-tracked' : ''} ${quest.category === 'SPECIAL' ? 'is-special' : ''} ${quest.completed ? 'is-complete' : ''}`} key={quest.id}>
              <div className={`quest-icon quest-icon-${quest.category.toLowerCase()}`}>{quest.icon}</div>
              <div className="quest-card-content">
                <div className="quest-card-title"><div><span className="quest-card-type">{categoryMeta[quest.category].short}</span><h3>{quest.title}</h3></div><small>{questDeadline(quest.category)}</small></div>
                <p>{quest.description}</p>
                <div className="quest-progress-meta"><span>{quest.completed ? 'COMPLETED' : 'PROGRESS'}</span><strong>{quest.progress} / {quest.target}</strong></div>
                <div className="quest-progress"><i style={{ width: `${progressPercent}%` }} /></div>
                <div className="quest-card-footer"><b>{questReward(quest)}</b><button className={isTracked ? 'is-active' : ''} disabled={quest.claimed} onClick={() => toggleTracked(quest)}>{quest.claimed ? 'Đã nhận' : isTracked ? 'Đang theo dõi' : 'Theo dõi'}</button></div>
              </div>
            </article>
          })}
        </div>

        {feedback && <div className="game-feature-feedback"><span>✦</span>{feedback}</div>}
        <footer className="game-feature-footer">EXP ván chơi và nhiệm vụ được xác nhận ở server · nhiệm vụ tự nhận thưởng khi chạm mốc.</footer>
      </section>
    </div>
  )
}
