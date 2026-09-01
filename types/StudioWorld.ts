import type { MiniGameMode } from './MiniGame'

export const STUDIO_GAMES_WING_ORIGIN_X = 1280
export const STUDIO_GAMES_WING_WIDTH = 768
export const STUDIO_GAMES_WING_HEIGHT = 896

/**
 * The east-side office exit is deliberately kept as a small, collision-free
 * plaza. Destination portals live here instead of inside the busy Commons so
 * they remain visible and reachable even when the lobby has furniture or
 * several players around the spawn point.
 */
export const STUDIO_DESTINATION_EXIT = {
  x: 960,
  y: 208,
  width: 336,
  height: 80,
  centerY: 248,
} as const

export type StudioRoomId = 'LOBBY' | 'DESIGN' | 'ART' | 'DEVELOPMENT' | 'GAME_LOUNGE' | 'QA' | 'MEETING' | 'ARCADE' | 'CARD_ROOM'

export interface StudioRoomZone {
  id: StudioRoomId
  name: string
  /** Small map title used in the directory and in-world wayfinding. */
  shortName: string
  /** Department/facility summary shown below the room title. */
  subtitle: string
  /** Keeps the world directory grouped into a work wing and a play wing. */
  group: 'WORK' | 'PLAY'
  x: number
  y: number
  width: number
  height: number
  color: number
  /** Access points that belong to this room, shown in the Studio Hub directory. */
  accessPoints: string[]
}

export type InteractiveObjectType =
  | 'TASK_BOARD'
  | 'PROJECT_BOARD'
  | 'MEETING_TABLE'
  | 'ARCADE_MACHINE'
  | 'CARD_TABLE'
  | 'BUILD_MACHINE'
  | 'ASSET_BOARD'
  | 'MY_ROOM'
  | 'JOB_BOARD'
  | 'WORK_STATION'
  | 'CAREER_CENTER'
  | 'PAYROLL_OFFICE'

export const STUDIO_HUB_INTERACTIVE_TYPES: readonly InteractiveObjectType[] = ['TASK_BOARD', 'PROJECT_BOARD', 'ASSET_BOARD', 'BUILD_MACHINE']

export function opensStudioHub(type: InteractiveObjectType): boolean {
  return STUDIO_HUB_INTERACTIVE_TYPES.includes(type)
}

export const WORK_INTERACTIVE_TYPES: readonly InteractiveObjectType[] = ['JOB_BOARD', 'WORK_STATION', 'CAREER_CENTER', 'PAYROLL_OFFICE']

export function isWorkInteractiveObject(type: InteractiveObjectType): boolean {
  return WORK_INTERACTIVE_TYPES.includes(type)
}

export interface StudioInteractiveObject {
  id: string
  type: InteractiveObjectType
  label: string
  /** The room owns the interaction point, even when its map prop is hidden. */
  roomId: StudioRoomId
  x: number
  y: number
  interactionRadius: number
  stationId?: string
  gameMode?: MiniGameMode
  /** PRIMARY points may be signposted; PROXIMITY points use a nearby E hint. */
  accessVisibility?: 'PRIMARY' | 'PROXIMITY'
  /** Short label for a compact map sign and the nearby E hint. */
  accessLabel?: string
}

export interface StudioWorldPortal {
  id: string
  destination: 'FISHING' | 'HOME'
  label: string
  x: number
  y: number
  interactionRadius: number
  color: number
}

/** Entry points are part of the main map only; destination scenes own their exits. */
export const studioWorldPortals: readonly StudioWorldPortal[] = [
  {
    id: 'fishing-portal',
    destination: 'FISHING',
    label: 'FISHING · RIVERBEND',
    x: STUDIO_DESTINATION_EXIT.x + 88,
    y: STUDIO_DESTINATION_EXIT.centerY,
    interactionRadius: 54,
    color: 0x84b8ff,
  },
  {
    id: 'home-portal',
    destination: 'HOME',
    label: 'MY HOME',
    x: STUDIO_DESTINATION_EXIT.x + 248,
    y: STUDIO_DESTINATION_EXIT.centerY,
    interactionRadius: 54,
    color: 0xae91ff,
  },
]

export const studioRoomZones: StudioRoomZone[] = [
  {
    id: 'DESIGN',
    name: 'Game Design Lab',
    shortName: 'Design Lab',
    subtitle: 'Game Design · mechanics, flow & balance',
    group: 'WORK',
    x: 160,
    y: 128,
    width: 240,
    height: 224,
    color: 0x9d7cff,
    accessPoints: ['GAME DESIGN STATION'],
  },
  {
    id: 'ART',
    name: 'Creative Studio',
    shortName: 'Creative Studio',
    subtitle: 'Art + Animation · visuals & motion',
    group: 'WORK',
    x: 416,
    y: 128,
    width: 240,
    height: 224,
    color: 0xf28bb4,
    accessPoints: ['ART STATION', 'ANIMATION STATION', 'ASSET BOARD'],
  },
  {
    id: 'DEVELOPMENT',
    name: 'Engineering Hub',
    shortName: 'Engineering Hub',
    subtitle: 'Frontend + Backend · UI, APIs & builds',
    group: 'WORK',
    x: 672,
    y: 128,
    // The connector to the Games Wing begins at x=960. Keeping the room
    // boundary here makes Backend a real desk inside Engineering, not a desk
    // placed in the hallway entrance.
    width: 288,
    height: 224,
    color: 0x6fc8ff,
    accessPoints: ['FRONTEND STATION', 'BACKEND STATION', 'BUILD MACHINE'],
  },
  {
    id: 'LOBBY',
    name: 'Studio Commons',
    shortName: 'Studio Commons',
    subtitle: 'Reception · team boards · daily jobs',
    group: 'WORK',
    x: 416,
    y: 352,
    width: 240,
    height: 160,
    color: 0xc8f267,
    accessPoints: ['PROJECT BOARD', 'QUEST BOARD', 'JOB BOARD'],
  },
  {
    id: 'QA',
    name: 'Quality Lab',
    shortName: 'Quality Lab',
    subtitle: 'QA + QC · test runs & quality gates',
    group: 'WORK',
    x: 160,
    y: 512,
    width: 240,
    height: 288,
    color: 0x94a0ff,
    accessPoints: ['QA STATION', 'QC STATION'],
  },
  {
    id: 'MEETING',
    name: 'People Ops',
    shortName: 'People Ops',
    subtitle: 'PM + HR · planning, support & payroll',
    group: 'WORK',
    x: 416,
    y: 512,
    width: 240,
    height: 288,
    color: 0xffb86c,
    accessPoints: ['CAREER CENTER', 'PAYROLL OFFICE', 'PM STATION', 'HR STATION'],
  },
  {
    id: 'GAME_LOUNGE',
    name: 'Play Lounge',
    shortName: 'Play Lounge',
    subtitle: 'Live tables · casual dealer games',
    group: 'PLAY',
    x: 1312,
    y: 96,
    width: 320,
    height: 288,
    color: 0xff78c8,
    accessPoints: ['BLACKJACK', 'BACCARAT', 'BẦU CUA', 'SIC BO'],
  },
  {
    id: 'ARCADE',
    name: 'Arcade Hall',
    shortName: 'Arcade Hall',
    subtitle: 'Cabinets · quick coin mini-games',
    group: 'PLAY',
    x: 1664,
    y: 96,
    width: 320,
    height: 288,
    color: 0x6fe0b0,
    accessPoints: ['DICE DUEL', 'RHYTHM', 'PRIZE DRAW'],
  },
  {
    id: 'CARD_ROOM',
    name: 'VIP Games',
    shortName: 'VIP Games',
    subtitle: 'Poker · multiplayer tables · chess',
    group: 'PLAY',
    x: 1312,
    y: 416,
    width: 672,
    height: 416,
    color: 0xffb86c,
    accessPoints: ['POKER', 'BACCARAT', 'TIẾN LÊN', 'CỜ VUA'],
  },
]

export const studioInteractiveObjects: StudioInteractiveObject[] = [
  // Lobby access is kept in one horizontal row. The smaller radius prevents
  // adjacent boards from competing when a player presses E.
  { id: 'project-board', type: 'PROJECT_BOARD', label: 'Project Board', roomId: 'LOBBY', x: 468, y: 430, interactionRadius: 38, accessLabel: 'PROJECTS' },
  { id: 'quest-board', type: 'TASK_BOARD', label: 'Quest Board', roomId: 'LOBBY', x: 536, y: 430, interactionRadius: 38, accessLabel: 'QUESTS' },
  { id: 'job-board', type: 'JOB_BOARD', label: 'Job Board · Daily Jobs', roomId: 'LOBBY', x: 604, y: 430, interactionRadius: 38, stationId: 'JOB_BOARD', accessLabel: 'JOB BOARD' },
  { id: 'game-design-station', type: 'WORK_STATION', label: 'Game Design Lab', roomId: 'DESIGN', x: 280, y: 275, interactionRadius: 48, stationId: 'GAME_DESIGN_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'GAME DESIGN' },
  { id: 'art-station', type: 'WORK_STATION', label: 'Art Studio', roomId: 'ART', x: 450, y: 275, interactionRadius: 48, stationId: 'ART_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'ART' },
  { id: 'asset-board', type: 'ASSET_BOARD', label: 'Asset Board', roomId: 'ART', x: 530, y: 275, interactionRadius: 48, accessLabel: 'ASSETS' },
  { id: 'animation-station', type: 'WORK_STATION', label: 'Animation Studio', roomId: 'ART', x: 610, y: 275, interactionRadius: 48, stationId: 'ANIMATION_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'ANIMATION' },
  { id: 'frontend-station', type: 'WORK_STATION', label: 'Frontend Desk', roomId: 'DEVELOPMENT', x: 745, y: 275, interactionRadius: 48, stationId: 'FRONTEND_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'FRONTEND' },
  { id: 'backend-station', type: 'WORK_STATION', label: 'Backend Desk', roomId: 'DEVELOPMENT', x: 885, y: 275, interactionRadius: 48, stationId: 'BACKEND_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'BACKEND' },
  { id: 'build-machine', type: 'BUILD_MACHINE', label: 'Build Machine', roomId: 'DEVELOPMENT', x: 820, y: 275, interactionRadius: 48, accessVisibility: 'PRIMARY', accessLabel: 'BUILD' },
  { id: 'qa-station', type: 'WORK_STATION', label: 'QA Lab', roomId: 'QA', x: 240, y: 680, interactionRadius: 48, stationId: 'QA_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'QA' },
  { id: 'qc-station', type: 'WORK_STATION', label: 'QC Lab', roomId: 'QA', x: 320, y: 680, interactionRadius: 48, stationId: 'QC_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'QC' },
  { id: 'career-center', type: 'CAREER_CENTER', label: 'Career Center', roomId: 'MEETING', x: 470, y: 610, interactionRadius: 48, stationId: 'CAREER_CENTER', accessVisibility: 'PROXIMITY', accessLabel: 'CAREER CENTER' },
  { id: 'payroll-office', type: 'PAYROLL_OFFICE', label: 'Payroll Office', roomId: 'MEETING', x: 610, y: 610, interactionRadius: 48, stationId: 'PAYROLL_OFFICE', accessVisibility: 'PROXIMITY', accessLabel: 'PAYROLL' },
  { id: 'pm-station', type: 'WORK_STATION', label: 'PM War Room', roomId: 'MEETING', x: 470, y: 720, interactionRadius: 48, stationId: 'PM_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'PM' },
  { id: 'hr-station', type: 'WORK_STATION', label: 'HR Desk', roomId: 'MEETING', x: 610, y: 720, interactionRadius: 48, stationId: 'HR_STATION', accessVisibility: 'PROXIMITY', accessLabel: 'HR' },
  { id: 'meeting-table', type: 'MEETING_TABLE', label: 'Meeting Table', roomId: 'MEETING', x: 540, y: 760, interactionRadius: 58, accessVisibility: 'PROXIMITY' },
  { id: 'arcade-machine', type: 'ARCADE_MACHINE', label: 'Arcade Cabinet', roomId: 'ARCADE', x: 1740, y: 216, interactionRadius: 62, gameMode: 'DICE_DUEL', accessLabel: 'DICE DUEL' },
  { id: 'arcade-rhythm', type: 'ARCADE_MACHINE', label: 'Rhythm Machine', roomId: 'ARCADE', x: 1824, y: 216, interactionRadius: 62, gameMode: 'DICE_DUEL', accessLabel: 'RHYTHM' },
  { id: 'arcade-claw', type: 'ARCADE_MACHINE', label: 'Prize Claw', roomId: 'ARCADE', x: 1908, y: 216, interactionRadius: 62, gameMode: 'LUCKY_DRAW', accessLabel: 'PRIZE DRAW' },
  { id: 'vip-card-table', type: 'CARD_TABLE', label: 'VIP Baccarat Table', roomId: 'CARD_ROOM', x: 1432, y: 560, interactionRadius: 66, gameMode: 'BACCARAT', accessLabel: 'BACCARAT' },
  { id: 'high-roller-table', type: 'CARD_TABLE', label: "Texas Hold'em Table", roomId: 'CARD_ROOM', x: 1648, y: 560, interactionRadius: 66, gameMode: 'POKER', accessLabel: 'POKER' },
  { id: 'blackjack-table', type: 'CARD_TABLE', label: 'Xì dách Table', roomId: 'GAME_LOUNGE', x: 1384, y: 216, interactionRadius: 66, gameMode: 'BLACKJACK', accessLabel: 'XÌ DÁCH' },
  { id: 'baccarat-table', type: 'CARD_TABLE', label: 'Baccarat Table', roomId: 'GAME_LOUNGE', x: 1552, y: 216, interactionRadius: 66, gameMode: 'BACCARAT', accessLabel: 'BACCARAT' },
  // The upper-left Play Zone station is reserved for Bầu Cua; keep the extra
  // Poker table out so the row has one clear game per station.
  { id: 'bau-cua-table', type: 'CARD_TABLE', label: 'Bầu Cua Table', roomId: 'GAME_LOUNGE', x: 1384, y: 316, interactionRadius: 66, gameMode: 'BAU_CUA', accessLabel: 'BẦU CUA' },
  { id: 'sicbo-machine', type: 'ARCADE_MACHINE', label: 'Sic Bo Machine', roomId: 'GAME_LOUNGE', x: 1552, y: 316, interactionRadius: 62, gameMode: 'SICBO', accessLabel: 'SIC BO' },
  { id: 'tien-len-table', type: 'CARD_TABLE', label: 'Tiến Lên Table', roomId: 'CARD_ROOM', x: 1864, y: 560, interactionRadius: 66, gameMode: 'TIEN_LEN', accessLabel: 'TIẾN LÊN' },
  { id: 'chess-table', type: 'CARD_TABLE', label: 'Chess Table', roomId: 'CARD_ROOM', x: 1760, y: 728, interactionRadius: 66, gameMode: 'CHESS', accessLabel: 'CỜ VUA' },
]

export function getRoomForPosition(x: number, y: number): StudioRoomZone {
  return studioRoomZones.find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) || {
    id: 'LOBBY',
    name: 'Studio Commons',
    shortName: 'Studio Commons',
    subtitle: 'Reception · team boards · daily jobs',
    group: 'WORK',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    color: 0xc8f267,
    accessPoints: ['PROJECT BOARD', 'QUEST BOARD', 'JOB BOARD'],
  }
}

export function getStudioRoom(roomId: string): StudioRoomZone | undefined {
  return studioRoomZones.find((zone) => zone.id === roomId)
}

export function studioRoomName(roomId: string): string {
  return getStudioRoom(roomId)?.name || roomId.replace(/_/g, ' ')
}
