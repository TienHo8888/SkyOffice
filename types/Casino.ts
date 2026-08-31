import { MapSchema, Schema } from '@colyseus/schema'
import { TexasHoldemPublicState } from './TexasHoldem'
import { TienLenPublicState } from './TienLen'

export type CasinoGameMode = 'BACCARAT' | 'BLACKJACK' | 'POKER' | 'SICBO' | 'BAU_CUA' | 'CHESS' | 'TIEN_LEN' | 'DICE_DUEL' | 'LUCKY_DRAW'

export type PvpTableMode = 'POKER' | 'TIEN_LEN'
export type PvpTableStatus = 'OPEN' | 'WAITING' | 'RUNNING' | 'FULL'

export interface PvpTableConfig {
  id: string
  roomCode: string
  mode: PvpTableMode
  name: string
  stakesLabel: string
  buyIn: number
  minPlayers: number
  maxPlayers: number
}

export interface PvpTableSnapshot extends PvpTableConfig {
  playerCount: number
  status: PvpTableStatus
  pot: number
  roundId: string
  hostName?: string
}

export const PVP_TABLE_CATALOG: Record<PvpTableMode, readonly PvpTableConfig[]> = {
  POKER: [
    { id: 'poker-micro', roomCode: 'P101', mode: 'POKER', name: 'Pixel Micro', stakesLabel: '5 / 10', buyIn: 100, minPlayers: 2, maxPlayers: 4 },
    { id: 'poker-classic', roomCode: 'P102', mode: 'POKER', name: 'Studio Classic', stakesLabel: '5 / 10', buyIn: 100, minPlayers: 2, maxPlayers: 4 },
    { id: 'poker-vip', roomCode: 'P103', mode: 'POKER', name: 'VIP Deep Stack', stakesLabel: '5 / 10', buyIn: 100, minPlayers: 2, maxPlayers: 4 },
  ],
  TIEN_LEN: [
    { id: 'tienlen-free-101', roomCode: '101', mode: 'TIEN_LEN', name: 'Bàn Tự Do 101', stakesLabel: 'MIỄN PHÍ', buyIn: 0, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-free-102', roomCode: '102', mode: 'TIEN_LEN', name: 'Bàn Tự Do 102', stakesLabel: 'MIỄN PHÍ', buyIn: 0, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-coin-201', roomCode: '201', mode: 'TIEN_LEN', name: 'Bàn Coin 201', stakesLabel: '10 COIN', buyIn: 10, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-coin-202', roomCode: '202', mode: 'TIEN_LEN', name: 'Bàn Coin 202', stakesLabel: '10 COIN', buyIn: 10, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-coin-301', roomCode: '301', mode: 'TIEN_LEN', name: 'Bàn Coin 301', stakesLabel: '25 COIN', buyIn: 25, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-coin-302', roomCode: '302', mode: 'TIEN_LEN', name: 'Bàn Coin 302', stakesLabel: '25 COIN', buyIn: 25, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-vip-501', roomCode: '501', mode: 'TIEN_LEN', name: 'Bàn VIP 501', stakesLabel: '50 COIN', buyIn: 50, minPlayers: 2, maxPlayers: 4 },
    { id: 'tienlen-vip-502', roomCode: '502', mode: 'TIEN_LEN', name: 'Bàn VIP 502', stakesLabel: '50 COIN', buyIn: 50, minPlayers: 2, maxPlayers: 4 },
  ],
}

export type CasinoPhase =
  | 'BETTING'
  | 'BETTING_CLOSED'
  | 'DEALING'
  | 'PLAYER_TURN'
  | 'SHAKING'
  | 'REVEAL'
  | 'RESULT'

export const CASINO_GAME_MODES: CasinoGameMode[] = ['BACCARAT', 'BLACKJACK', 'POKER', 'SICBO', 'BAU_CUA', 'CHESS', 'TIEN_LEN', 'DICE_DUEL', 'LUCKY_DRAW']
export const CASINO_CHIPS = [5, 10, 25, 50, 100, 500] as const

export const CASINO_RULES = {
  BACCARAT: {
    minBet: 10,
    maxBet: 10_000,
    playerProfit: 1,
    bankerProfit: 0.95,
    tieProfit: 8,
  },
  BLACKJACK: {
    minBet: 10,
    maxBet: 10_000,
    seats: 4,
    blackjackProfit: 1.5,
    dealerStandsSoft17: true,
  },
  POKER: {
    minBet: 100,
    maxBet: 100,
    buyIn: 100,
    smallBlind: 5,
    bigBlind: 10,
    seats: 4,
  },
  SICBO: {
    minBet: 10,
    maxBet: 10_000,
  },
  BAU_CUA: {
    minBet: 10,
    maxBet: 10_000,
    choices: ['DEER', 'GOURD', 'ROOSTER', 'FISH', 'CRAB', 'SHRIMP'] as const,
  },
  CHESS: {
    minBet: 10,
    maxBet: 10,
    winPayout: 18,
    drawPayout: 10,
  },
  TIEN_LEN: {
    minBet: 0,
    maxBet: 50,
    seats: 4,
  },
  DICE_DUEL: {
    minBet: 10,
    maxBet: 5_000,
  },
  LUCKY_DRAW: {
    minBet: 5,
    maxBet: 500,
    rewards: [0, 0, 1, 2, 5] as const,
  },
} as const

export interface ICasinoSeat extends Schema {
  userId: string
  displayName: string
  seatIndex: number
  wagersJson: string
  cards: string
  status: string
  result: string
  stake: number
  payout: number
  net: number
  handValue: number
  acted: boolean
  doubled: boolean
  folded: boolean
  win: boolean
  board: string
  lastMove: string
  turn: string
  moveCount: number
  matchId: string
  pokerStateJson: string
  pokerMode: string
  pvpTableId: string
}

export interface ICasinoTableState extends Schema {
  mode: CasinoGameMode
  phase: CasinoPhase
  roundId: string
  roundNumber: number
  phaseStartedAt: number
  phaseEndsAt: number
  dealerName: string
  statusText: string
  outcome: string
  playerCards: string
  bankerCards: string
  dealerCards: string
  communityCards: string
  dice: string
  playerTotal: number
  bankerTotal: number
  dealerTotal: number
  resultDetail: string
  history: string
  totalWagered: number
  activePlayers: number
  shoeRemaining: number
  pvpLobbyJson: string
  tienLenPublicJson: string
  seats: MapSchema<ICasinoSeat>
}

export interface CasinoSeatSnapshot {
  sessionId: string
  userId: string
  displayName: string
  seatIndex: number
  wagers: Record<string, number>
  cards: string[]
  status: string
  result: string
  stake: number
  payout: number
  net: number
  handValue: number
  acted: boolean
  doubled: boolean
  folded: boolean
  win: boolean
  board: string
  lastMove: string
  turn: string
  moveCount: number
  matchId: string
  pokerMode: string
  pvpTableId: string
  pokerState?: TexasHoldemPublicState
}

export interface CasinoTableSnapshot {
  mode: CasinoGameMode
  phase: CasinoPhase
  roundId: string
  roundNumber: number
  phaseStartedAt: number
  phaseEndsAt: number
  dealerName: string
  statusText: string
  outcome: string
  playerCards: string[]
  bankerCards: string[]
  dealerCards: string[]
  communityCards: string[]
  dice: string[]
  playerTotal: number
  bankerTotal: number
  dealerTotal: number
  resultDetail: string
  history: string[]
  totalWagered: number
  activePlayers: number
  shoeRemaining: number
  pvpLobby?: PvpTableSnapshot[]
  tienLenPublic?: TienLenPublicState
  seats: CasinoSeatSnapshot[]
}

export interface CasinoActionPayload {
  mode?: CasinoGameMode
  action?: string
  choice?: string
  amount?: number
  seatIndex?: number
  actionId?: string
  tableId?: string
  move?: string
  promotion?: string
}

export interface CasinoEventPayload {
  type: string
  mode: CasinoGameMode
  roundId: string
  message: string
  sessionId?: string
  outcome?: string
  amount?: number
  payout?: number
}
