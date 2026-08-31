export type CombatWeapon = 'WATER_GUN' | 'BAT' | 'STONE' | 'SLIPPER'

export interface CombatWeaponDefinition {
  id: CombatWeapon
  slot: 1 | 2 | 3 | 4
  name: string
  icon: string
  actionLabel: string
  range: number
  cooldownMs: number
}

export const COMBAT_WEAPONS: CombatWeaponDefinition[] = [
  { id: 'WATER_GUN', slot: 1, name: 'Súng nước', icon: '🔫', actionLabel: 'BẮN', range: 320, cooldownMs: 480 },
  { id: 'BAT', slot: 2, name: 'Gậy xốp', icon: '🏏', actionLabel: 'ĐÁNH', range: 58, cooldownMs: 620 },
  { id: 'STONE', slot: 3, name: 'Đá xốp', icon: '🪨', actionLabel: 'NÉM', range: 230, cooldownMs: 820 },
  { id: 'SLIPPER', slot: 4, name: 'Dép tổ ong', icon: '🩴', actionLabel: 'NÉM', range: 190, cooldownMs: 720 },
]

export interface CombatActionPayload {
  weapon?: CombatWeapon
  directionX?: number
  directionY?: number
  actionId?: string
}

export interface CombatEventPayload {
  eventId: string
  attackerSessionId: string
  targetSessionId?: string
  weapon: CombatWeapon
  originX: number
  originY: number
  targetX: number
  targetY: number
  directionX: number
  directionY: number
  hit: boolean
  message: string
  createdAt: number
}
