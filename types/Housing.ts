export type PropertyVisibility = 'FRIENDS' | 'PUBLIC'

export interface PropertyStyles {
  wallStyleId: string
  floorStyleId: string
}

export interface HousingItemDefinition {
  id: string
  width: number
  height: number
  kind: 'FURNITURE' | 'WALL_STYLE' | 'FLOOR_STYLE'
}

export const HOME_MAP_ID = 'home_room_v1'
export const HOME_GRID_WIDTH = 8
export const HOME_GRID_HEIGHT = 6
export const HOME_MAX_FURNITURE = 24

export const DEFAULT_PROPERTY_STYLES: PropertyStyles = {
  wallStyleId: 'starter_wallpaper',
  floorStyleId: 'wooden_floor',
}

export const HOUSING_ITEM_DEFINITIONS: readonly HousingItemDefinition[] = [
  { id: 'furniture-starter-chair', width: 1, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-starter-plant', width: 1, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-plaza-lamp', width: 1, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-arcade-cabinet', width: 1, height: 2, kind: 'FURNITURE' },
  { id: 'furniture-trophy-case', width: 2, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-tiny-table', width: 2, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-cozy-rug', width: 2, height: 1, kind: 'FURNITURE' },
  { id: 'furniture-wall-shelf', width: 1, height: 1, kind: 'FURNITURE' },
  { id: 'starter_wallpaper', width: 1, height: 1, kind: 'WALL_STYLE' },
  { id: 'wooden_floor', width: 1, height: 1, kind: 'FLOOR_STYLE' },
  { id: 'blue_wallpaper', width: 1, height: 1, kind: 'WALL_STYLE' },
  { id: 'stone_floor', width: 1, height: 1, kind: 'FLOOR_STYLE' },
]

export function getHousingItemDefinition(itemId: string): HousingItemDefinition | undefined {
  return HOUSING_ITEM_DEFINITIONS.find((item) => item.id === itemId)
}

export function isValidPropertyStyles(styles: PropertyStyles): boolean {
  return getHousingItemDefinition(styles.wallStyleId)?.kind === 'WALL_STYLE'
    && getHousingItemDefinition(styles.floorStyleId)?.kind === 'FLOOR_STYLE'
}
