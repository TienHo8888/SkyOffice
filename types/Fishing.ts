import type { InventoryStack } from './Inventory'

export type FishingRarity = 'common' | 'uncommon' | 'rare'

export interface FishDefinition {
  id: string
  nameKey: string
  rarity: FishingRarity
  weight: number
  sellValue: number
  iconPath: string
}

export interface FishingTiming {
  castDelaySeconds: number
  biteDelaySeconds: number
  reelDelaySeconds: number
}

export type FishingPhase = 'IDLE' | 'CASTING' | 'WAITING' | 'NIBBLE' | 'BITE' | 'REELING' | 'MISSED'

export type FishingCastEvent = 'CASTED' | 'NIBBLE' | 'BITE' | 'MISSED'

export interface FishingCastState {
  requestId: string
  spotId: string
  state: FishingCastEvent
  sequence: number
  /** Reaction window sent only when the real bite starts. */
  windowMs?: number
  reason?: 'TOO_EARLY' | 'TOO_LATE' | 'TIMEOUT'
}

export interface FishingSpotDefinition {
  id: string
  nameKey: string
  x: number
  y: number
  interactionRadius: number
}

export interface FishingCatchReceipt {
  requestId: string
  catchNumber: number
  fishId: string
  rarity: FishingRarity
  quantityDelta: number
  quantityAfter: number
  inventory: InventoryStack[]
  /** Set when the server returned an earlier receipt for a retry. */
  duplicate?: boolean
}

export const FISHING_MAP_ID = 'fishing_riverbend_v1'
export const FISHING_MAP_WIDTH = 1536
export const FISHING_MAP_HEIGHT = 1024
export const FISHING_DAILY_LIMIT = 10
export const FISHING_COOLDOWN_MS = 2_000
export const FISHING_BITE_DELAY_MIN_MS = 1_600
export const FISHING_BITE_DELAY_MAX_MS = 4_800
export const FISHING_REEL_WINDOW_MIN_MS = 650
export const FISHING_REEL_WINDOW_MAX_MS = 1_000

export const FISHING_TIMING: FishingTiming = {
  castDelaySeconds: 0.35,
  biteDelaySeconds: 0.55,
  reelDelaySeconds: 0.35,
}

/**
 * Reference data ported from Pixel Social World's fishing.json. Runtime
 * authority remains in SkyOffice's server and store; the client only uses
 * this catalog for labels and animation timing.
 */
export const FISH_DEFINITIONS: readonly FishDefinition[] = [
  { id: 'pond_minnow', nameKey: 'fishing.fish.pond_minnow', rarity: 'common', weight: 60, sellValue: 3, iconPath: 'assets/world/fishing/fish/pond_minnow.png' },
  { id: 'leaf_carp', nameKey: 'fishing.fish.leaf_carp', rarity: 'uncommon', weight: 30, sellValue: 8, iconPath: 'assets/world/fishing/fish/leaf_carp.png' },
  { id: 'moon_koi', nameKey: 'fishing.fish.moon_koi', rarity: 'rare', weight: 10, sellValue: 25, iconPath: 'assets/world/fishing/fish/moon_koi.png' },
]

export const FISHING_SPOTS: readonly FishingSpotDefinition[] = [
  { id: 'town_pier', nameKey: 'fishing.spot.town_pier', x: 1090, y: 500, interactionRadius: 120 },
]

export function getFishingSpot(spotId: string): FishingSpotDefinition | undefined {
  return FISHING_SPOTS.find((spot) => spot.id === spotId)
}

/** Select one fish using a [0, 1) random value. This is injectable for tests. */
export function selectWeightedFish(fish: readonly FishDefinition[] = FISH_DEFINITIONS, random: () => number = Math.random): FishDefinition {
  const totalWeight = fish.reduce((total, definition) => total + Math.max(0, definition.weight), 0)
  if (totalWeight <= 0) throw new Error('Fishing catalog has no weighted fish.')
  const value = Math.min(0.999999999, Math.max(0, random())) * totalWeight
  let cursor = 0
  for (const definition of fish) {
    cursor += Math.max(0, definition.weight)
    if (value < cursor) return definition
  }
  return fish[fish.length - 1]
}
