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
  /** Compact label rendered next to the shoreline marker. */
  label: string
  /** Position where the player stands to start a cast. */
  x: number
  y: number
  /** Water position where the line and bobber land after the cast. */
  castX: number
  castY: number
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

export interface FishingMapRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The source map is a painted backdrop rather than a tilemap with a native
 * collision layer. These are the interior water cells traced from the
 * Riverbend artwork. They intentionally stop before the shoreline so the
 * avatar can stand on paths, docks and bridges while casting into the water.
 */
export const FISHING_WATER_BLOCKERS: readonly FishingMapRect[] = [
  { x: 504, y: 24, width: 72, height: 24 },
  { x: 480, y: 48, width: 120, height: 24 },
  { x: 480, y: 72, width: 24, height: 24 },
  { x: 552, y: 72, width: 48, height: 72 },
  { x: 480, y: 96, width: 48, height: 24 },
  { x: 504, y: 120, width: 24, height: 24 },
  { x: 504, y: 144, width: 120, height: 24 },
  { x: 384, y: 168, width: 24, height: 24 },
  { x: 456, y: 168, width: 192, height: 24 },
  { x: 360, y: 192, width: 312, height: 24 },
  { x: 408, y: 216, width: 96, height: 24 },
  { x: 528, y: 216, width: 48, height: 24 },
  { x: 600, y: 216, width: 96, height: 24 },
  { x: 432, y: 240, width: 408, height: 24 },
  { x: 432, y: 264, width: 72, height: 24 },
  { x: 552, y: 264, width: 336, height: 24 },
  { x: 432, y: 288, width: 48, height: 72 },
  { x: 648, y: 288, width: 168, height: 24 },
  { x: 960, y: 288, width: 72, height: 24 },
  { x: 984, y: 312, width: 96, height: 48 },
  { x: 432, y: 360, width: 24, height: 24 },
  { x: 1008, y: 360, width: 72, height: 24 },
  { x: 432, y: 384, width: 48, height: 24 },
  { x: 1032, y: 384, width: 48, height: 24 },
  { x: 456, y: 408, width: 24, height: 24 },
  { x: 1056, y: 408, width: 72, height: 24 },
  { x: 1464, y: 408, width: 72, height: 24 },
  { x: 336, y: 432, width: 72, height: 24 },
  { x: 1056, y: 432, width: 144, height: 24 },
  { x: 1320, y: 432, width: 24, height: 24 },
  { x: 1392, y: 432, width: 144, height: 24 },
  { x: 312, y: 456, width: 120, height: 48 },
  { x: 1080, y: 456, width: 144, height: 24 },
  { x: 1320, y: 456, width: 216, height: 24 },
  { x: 1080, y: 480, width: 168, height: 24 },
  { x: 1296, y: 480, width: 72, height: 24 },
  { x: 1392, y: 480, width: 144, height: 24 },
  { x: 312, y: 504, width: 144, height: 24 },
  { x: 1128, y: 504, width: 408, height: 24 },
  { x: 288, y: 528, width: 120, height: 24 },
  { x: 432, y: 528, width: 24, height: 24 },
  { x: 1152, y: 528, width: 360, height: 24 },
  { x: 312, y: 552, width: 120, height: 24 },
  { x: 1152, y: 552, width: 216, height: 24 },
  { x: 1392, y: 552, width: 48, height: 24 },
  { x: 288, y: 576, width: 120, height: 48 },
  { x: 1128, y: 576, width: 240, height: 24 },
  { x: 1392, y: 576, width: 24, height: 24 },
  { x: 1104, y: 600, width: 264, height: 48 },
  { x: 240, y: 624, width: 192, height: 24 },
  { x: 1032, y: 624, width: 24, height: 24 },
  { x: 288, y: 648, width: 168, height: 24 },
  { x: 1032, y: 648, width: 264, height: 24 },
  { x: 312, y: 672, width: 192, height: 24 },
  { x: 1008, y: 672, width: 264, height: 24 },
  { x: 312, y: 696, width: 240, height: 24 },
  { x: 1056, y: 696, width: 216, height: 24 },
  { x: 336, y: 720, width: 192, height: 24 },
  { x: 720, y: 720, width: 144, height: 24 },
  { x: 1104, y: 720, width: 144, height: 24 },
  { x: 360, y: 744, width: 96, height: 24 },
  { x: 672, y: 744, width: 120, height: 24 },
  { x: 816, y: 744, width: 72, height: 24 },
  { x: 408, y: 768, width: 48, height: 24 },
  { x: 696, y: 768, width: 240, height: 24 },
  { x: 384, y: 792, width: 48, height: 24 },
  { x: 696, y: 792, width: 192, height: 24 },
  { x: 912, y: 792, width: 48, height: 24 },
  { x: 360, y: 816, width: 48, height: 48 },
  { x: 720, y: 816, width: 264, height: 24 },
  { x: 1056, y: 816, width: 96, height: 24 },
  { x: 744, y: 840, width: 408, height: 24 },
  { x: 360, y: 864, width: 96, height: 24 },
  { x: 744, y: 864, width: 312, height: 24 },
  { x: 360, y: 888, width: 120, height: 24 },
  { x: 696, y: 888, width: 336, height: 24 },
  { x: 360, y: 912, width: 168, height: 24 },
  { x: 672, y: 912, width: 336, height: 24 },
  { x: 312, y: 936, width: 240, height: 24 },
  { x: 624, y: 936, width: 384, height: 24 },
  { x: 312, y: 960, width: 120, height: 24 },
  { x: 456, y: 960, width: 480, height: 24 },
  { x: 984, y: 960, width: 24, height: 24 },
  { x: 216, y: 984, width: 24, height: 24 },
  { x: 288, y: 984, width: 48, height: 24 },
  { x: 360, y: 984, width: 24, height: 24 },
  { x: 408, y: 984, width: 480, height: 24 },
  { x: 912, y: 984, width: 24, height: 24 },
  { x: 216, y: 1008, width: 432, height: 16 },
  { x: 672, y: 1008, width: 192, height: 16 },
]

/**
 * Central plaza spawn points keep all initial players on the large island,
 * away from both the river banks and the marked fishing water.
 */
export const FISHING_SPAWN_POINTS = [
  { x: 680, y: 520 },
  { x: 760, y: 520 },
  { x: 840, y: 520 },
  { x: 920, y: 520 },
  { x: 680, y: 600 },
  { x: 760, y: 600 },
  { x: 840, y: 600 },
  { x: 920, y: 600 },
] as const

export const FISHING_PLAYER_COLLISION_RADIUS = 18

export function getFishingSpawnPoint(index: number) {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
  return FISHING_SPAWN_POINTS[safeIndex % FISHING_SPAWN_POINTS.length]
}

/** Server-side point check; the default padding represents the avatar body. */
export function isFishingPositionWalkable(
  x: number,
  y: number,
  padding = FISHING_PLAYER_COLLISION_RADIUS,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return !FISHING_WATER_BLOCKERS.some((rect) => (
    x + padding > rect.x
    && x - padding < rect.x + rect.width
    && y + padding > rect.y
    && y - padding < rect.y + rect.height
  ))
}

// A catch should feel like a small event instead of an immediate button
// response. The server chooses a delay in this range for every cast.
export const FISHING_BITE_DELAY_MIN_MS = 5_000
export const FISHING_BITE_DELAY_MAX_MS = 60_000
export const FISHING_REEL_WINDOW_MIN_MS = 650
export const FISHING_REEL_WINDOW_MAX_MS = 1_000

export const FISHING_TIMING: FishingTiming = {
  castDelaySeconds: 0.35,
  biteDelaySeconds: 5,
  reelDelaySeconds: 0.35,
}

export const DEFAULT_FISHING_SPOT_ID = 'town_pier'

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
  // Shoreline positions stay on the paths/docks; castX/castY are deliberately
  // farther out in the water so the rod animation never drops the bobber at
  // the player's feet.
  { id: 'town_pier', nameKey: 'fishing.spot.town_pier', label: 'TOWN PIER', x: 1040, y: 500, castX: 1140, castY: 500, interactionRadius: 76 },
  { id: 'willow_bend', nameKey: 'fishing.spot.willow_bend', label: 'WILLOW BEND', x: 720, y: 210, castX: 630, castY: 200, interactionRadius: 76 },
  { id: 'old_mill_dock', nameKey: 'fishing.spot.old_mill_dock', label: 'OLD MILL DOCK', x: 500, y: 360, castX: 440, castY: 400, interactionRadius: 76 },
  { id: 'lantern_cove', nameKey: 'fishing.spot.lantern_cove', label: 'LANTERN COVE', x: 260, y: 670, castX: 340, castY: 670, interactionRadius: 76 },
  { id: 'south_landing', nameKey: 'fishing.spot.south_landing', label: 'SOUTH LANDING', x: 580, y: 720, castX: 480, castY: 728, interactionRadius: 76 },
  { id: 'lotus_bend', nameKey: 'fishing.spot.lotus_bend', label: 'LOTUS BEND', x: 1000, y: 780, castX: 900, castY: 780, interactionRadius: 76 },
  { id: 'east_boardwalk', nameKey: 'fishing.spot.east_boardwalk', label: 'EAST BOARDWALK', x: 1190, y: 410, castX: 1240, castY: 500, interactionRadius: 76 },
  { id: 'reed_cove', nameKey: 'fishing.spot.reed_cove', label: 'REED COVE', x: 1300, y: 780, castX: 1230, castY: 700, interactionRadius: 76 },
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
