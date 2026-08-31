import React, { useEffect, useMemo, useState } from 'react'

import { COMBAT_WEAPONS, CombatEventPayload, CombatWeapon } from '../../../types/Combat'
import { Event, phaserEvents } from '../events/EventCenter'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

export default function CombatHotbar() {
  const [selected, setSelected] = useState<CombatWeapon>('WATER_GUN')
  const [cooldowns, setCooldowns] = useState<Partial<Record<CombatWeapon, number>>>({})
  const [now, setNow] = useState(Date.now())
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const selection = (weapon: CombatWeapon) => setSelected(weapon)
    const combatEvent = (payload: CombatEventPayload) => {
      const game = phaserGame.scene.keys.game as Game | undefined
      if (payload.attackerSessionId === game?.network?.mySessionId) {
        const definition = COMBAT_WEAPONS.find((candidate) => candidate.id === payload.weapon)
        if (definition) setCooldowns((current) => ({ ...current, [payload.weapon]: payload.createdAt + definition.cooldownMs }))
        setNotice(payload.hit ? payload.message : `${definition?.name || 'Vật phẩm'} trượt mục tiêu`)
      } else if (payload.targetSessionId === game?.network?.mySessionId) setNotice(payload.message)
    }
    const combatError = (payload: { message: string }) => setNotice(payload.message)
    phaserEvents.on(Event.COMBAT_SELECTION_CHANGED, selection)
    phaserEvents.on(Event.COMBAT_EVENT, combatEvent)
    phaserEvents.on(Event.COMBAT_ERROR, combatError)
    return () => {
      phaserEvents.off(Event.COMBAT_SELECTION_CHANGED, selection)
      phaserEvents.off(Event.COMBAT_EVENT, combatEvent)
      phaserEvents.off(Event.COMBAT_ERROR, combatError)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      const byCode: Record<string, CombatWeapon> = { Digit1: 'WATER_GUN', Digit2: 'BAT', Digit3: 'STONE', Digit4: 'SLIPPER' }
      const weapon = byCode[event.code] || ({ '1': 'WATER_GUN', '2': 'BAT', '3': 'STONE', '4': 'SLIPPER' } as Record<string, CombatWeapon>)[event.key]
      const game = phaserGame.scene.keys.game as Game | undefined
      if (weapon) {
        game?.selectCombatWeapon(weapon)
        return
      }
      if (event.code === 'KeyF' || event.code === 'Space') {
        event.preventDefault()
        game?.useSelectedCombatWeapon()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const active = useMemo(() => COMBAT_WEAPONS.find((weapon) => weapon.id === selected) || COMBAT_WEAPONS[0], [selected])
  const select = (weapon: CombatWeapon) => (phaserGame.scene.keys.game as Game | undefined)?.selectCombatWeapon(weapon)
  const use = () => (phaserGame.scene.keys.game as Game | undefined)?.useSelectedCombatWeapon()

  return <aside className="combat-hotbar" aria-label="Thanh vật phẩm chiến đấu">
    {notice && <div className="combat-notice">{notice}</div>}
    <div className="combat-hotbar-title"><span>ITEM HOTBAR</span><b>{active.actionLabel}: F / SPACE</b></div>
    <div className="combat-slots">{COMBAT_WEAPONS.map((weapon) => {
      const remaining = Math.max(0, (cooldowns[weapon.id] || 0) - now)
      const progress = remaining / weapon.cooldownMs
      return <button className={`combat-slot ${selected === weapon.id ? 'selected' : ''}`} aria-label={`${weapon.slot} ${weapon.name}`} onClick={() => select(weapon.id)} key={weapon.id}>
        <i>{weapon.slot}</i><strong>{weapon.icon}</strong><span>{weapon.name}</span>{remaining > 0 && <em style={{ transform: `scaleY(${progress})` }} />}
      </button>
    })}</div>
    <button className="combat-use" aria-label={`Dùng ${active.name}`} onClick={use}><span>{active.icon}</span><b>{active.actionLabel}</b><small>F</small></button>
  </aside>
}
