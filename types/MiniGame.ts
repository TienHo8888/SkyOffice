import { MapSchema, Schema } from '@colyseus/schema'

export type MiniGameStatus = 'IDLE' | 'COUNTDOWN' | 'PLAYING' | 'RESULT'

export type MiniGameMode =
  | 'THROWABLES'
  | 'HIDE_SEEK'
  | 'FREEZE_TAG'
  | 'HOT_BOMB'
  | 'CAPTURE_FLAG'
  | 'PAINT_TILES'
  | 'TREASURE_HUNT'
  | 'DODGE_FALLING'
  | 'IMPOSTOR'
  | 'COLOR_CHASE'
  | 'BACCARAT'
  | 'BLACKJACK'
  | 'POKER'
  | 'SICBO'
  | 'BAU_CUA'
  | 'CHESS'
  | 'TIEN_LEN'
  | 'DICE_DUEL'
  | 'LUCKY_DRAW'

export const SOCIAL_MVP_GAME_MODES: MiniGameMode[] = ['TREASURE_HUNT', 'PAINT_TILES', 'DICE_DUEL']

export const MINI_GAME_STARTING_COINS = 1000

export const MINI_GAME_CARD_RULES = {
  BACCARAT: {
    cost: 10,
    choices: ['PLAYER', 'BANKER', 'TIE'] as const,
    payouts: { PLAYER: 20, BANKER: 20, TIE: 80 },
  },
  BLACKJACK: {
    cost: 10,
    winPayout: 20,
    tiePayout: 10,
  },
  POKER: {
    buyIn: 100,
    smallBlind: 5,
    bigBlind: 10,
    seats: 4,
    bots: 3,
  },
  SICBO: {
    cost: 10,
    choices: ['SMALL', 'BIG', 'ODD', 'EVEN'] as const,
    winPayout: 20,
  },
  BAU_CUA: {
    cost: 10,
    choices: ['DEER', 'GOURD', 'ROOSTER', 'FISH', 'CRAB', 'SHRIMP'] as const,
  },
  CHESS: {
    cost: 10,
    winPayout: 18,
    tiePayout: 10,
  },
  DICE_DUEL: {
    cost: 10,
    winPayout: 18,
    tiePayout: 10,
  },
  LUCKY_DRAW: {
    cost: 5,
    rewards: [0, 0, 5, 10, 25] as const,
  },
} as const

export interface MiniGameModeDefinition {
  id: MiniGameMode
  name: string
  icon: string
  description: string
  category: 'LOBBY' | 'CARD_ROOM'
}

export const MINI_GAME_MODES: MiniGameModeDefinition[] = [
  { id: 'THROWABLES', name: 'Ném đồ vui', icon: '🥏', description: 'Ném đá xốp, dép, súng nước, búa xốp và gối bay.', category: 'LOBBY' },
  { id: 'HIDE_SEEK', name: 'Trốn tìm ánh đèn', icon: '🔦', description: 'Một người tìm, cả nhóm chạy và ẩn trong Studio Commons.', category: 'LOBBY' },
  { id: 'FREEZE_TAG', name: 'Đóng băng', icon: '❄️', description: 'Bắt người khác đóng băng, đồng đội chạm để giải cứu.', category: 'LOBBY' },
  { id: 'HOT_BOMB', name: 'Bom hẹn giờ', icon: '💣', description: 'Chuyền bom trước khi đồng hồ về 0.', category: 'LOBBY' },
  { id: 'CAPTURE_FLAG', name: 'Cướp cờ mini', icon: '🚩', description: 'Hai đội lấy cờ đối thủ và mang về căn cứ.', category: 'LOBBY' },
  { id: 'PAINT_TILES', name: 'Chiếm ô màu', icon: '🎨', description: 'Di chuyển trên các ô để sơn màu của đội mình.', category: 'LOBBY' },
  { id: 'TREASURE_HUNT', name: 'Săn kho báu', icon: '💎', description: 'Chạy quanh Studio Commons nhặt kho báu xuất hiện ngẫu nhiên.', category: 'LOBBY' },
  { id: 'DODGE_FALLING', name: 'Né vật rơi', icon: '☔', description: 'Né các vật rơi; người sống sót cuối cùng thắng.', category: 'LOBBY' },
  { id: 'IMPOSTOR', name: 'Kẻ giả mạo', icon: '🕵️', description: 'Crew làm nhiệm vụ, Impostor bí mật phá game.', category: 'LOBBY' },
  { id: 'COLOR_CHASE', name: 'Đuổi bắt theo màu', icon: '🌈', description: 'Màu mục tiêu phải chạy, màu khác sẽ đuổi bắt.', category: 'LOBBY' },
  { id: 'BACCARAT', name: 'Baccarat mini', icon: '♠️', description: 'Cược 10 coin: Player/Banker trả 20, Tie trả 80.', category: 'CARD_ROOM' },
  { id: 'BLACKJACK', name: 'Xì dách', icon: '🂡', description: 'Rút một tay bài nhanh; điểm gần 21 nhất thắng.', category: 'CARD_ROOM' },
  { id: 'POKER', name: "Texas Hold'em", icon: '♣️', description: 'No-Limit cash table 4 ghế: đấu 3 bot hoặc vào bàn chờ người thật.', category: 'CARD_ROOM' },
  { id: 'SICBO', name: 'Sic Bo', icon: '🎲', description: 'Đoán tổng xúc xắc: lớn, nhỏ, chẵn hoặc lẻ.', category: 'CARD_ROOM' },
  { id: 'BAU_CUA', name: 'Bầu cua', icon: '🦀', description: 'Chọn linh vật; 3 viên xúc xắc quyết định thưởng.', category: 'CARD_ROOM' },
  { id: 'CHESS', name: 'Bàn cờ', icon: '♜', description: 'Đấu cờ realtime 1v1 với Coin thưởng cho bên thắng.', category: 'CARD_ROOM' },
  { id: 'TIEN_LEN', name: 'Tiến Lên Miền Nam', icon: '🃏', description: 'Chơi với 3 bot hoặc vào bàn chờ người khác · luật miền Nam.', category: 'CARD_ROOM' },
  { id: 'DICE_DUEL', name: 'Dice Duel', icon: '🎲', description: 'Cược 10 coin: thắng trả 18, hòa hoàn 10.', category: 'CARD_ROOM' },
  { id: 'LUCKY_DRAW', name: 'Lucky Draw', icon: '🎟️', description: 'Cược 5 coin để rút thưởng 0–25 coin.', category: 'CARD_ROOM' },
]

export interface IMiniGameParticipant extends Schema {
  userId: string
  displayName: string
  role: string
  team: string
  color: string
  score: number
  coins: number
  wins: number
  connected: boolean
  alive: boolean
  frozen: boolean
  hidden: boolean
  found: boolean
  hasBomb: boolean
  carryingFlag: string
  choice: string
}

export interface IMiniGameItem extends Schema {
  kind: string
  x: number
  y: number
  value: number
  active: boolean
  collectedBy: string
  team: string
  homeX: number
  homeY: number
}

export interface IMiniGameCell extends Schema {
  index: number
  ownerSessionId: string
  team: string
}

export interface IMiniGameState extends Schema {
  mode: MiniGameMode | ''
  gameId: string
  status: MiniGameStatus
  roundId: string
  startedBy: string
  leaderSessionId: string
  targetColor: string
  turnTeam: string
  teamRedScore: number
  teamBlueScore: number
  startedAt: number
  endsAt: number
  score: number
  totalTasks: number
  completedTasks: number
  minPlayers: number
  maxPlayers: number
  spectatorCount: number
  settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED'
  winnerIds: string[]
  resultMessage: string
  notice: string
  attendees: MapSchema<IMiniGameParticipant>
  items: MapSchema<IMiniGameItem>
  boardCells: MapSchema<IMiniGameCell>
}

export interface MiniGameParticipantSnapshot {
  sessionId: string
  userId: string
  displayName: string
  role: string
  team: string
  color: string
  score: number
  coins: number
  wins: number
  connected: boolean
  alive: boolean
  frozen: boolean
  hidden: boolean
  found: boolean
  hasBomb: boolean
  carryingFlag: string
  choice: string
}

export interface MiniGameItemSnapshot {
  id: string
  kind: string
  x: number
  y: number
  value: number
  active: boolean
  collectedBy: string
  team: string
  homeX: number
  homeY: number
}

export interface MiniGameCellSnapshot {
  index: number
  ownerSessionId: string
  team: string
}

export interface MiniGameSnapshot {
  mode: MiniGameMode | ''
  gameId: string
  status: MiniGameStatus
  roundId: string
  startedBy: string
  leaderSessionId: string
  targetColor: string
  turnTeam: string
  teamRedScore: number
  teamBlueScore: number
  startedAt: number
  endsAt: number
  score: number
  totalTasks: number
  completedTasks: number
  minPlayers: number
  maxPlayers: number
  spectatorCount: number
  settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED'
  winnerIds: string[]
  resultMessage: string
  notice: string
  attendees: MiniGameParticipantSnapshot[]
  items: MiniGameItemSnapshot[]
  boardCells: MiniGameCellSnapshot[]
}

export interface MiniGameEventPayload {
  type: string
  message: string
  mode?: MiniGameMode | ''
  sessionId?: string
  targetSessionId?: string
  item?: string
  score?: number
  team?: string
}

export interface MiniGameActionPayload {
  action?: string
  item?: string
  choice?: string
  targetSessionId?: string
  fromX?: number
  fromY?: number
  toX?: number
  toY?: number
}
