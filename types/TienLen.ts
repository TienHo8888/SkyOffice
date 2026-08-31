export type TienLenMode = 'BOT' | 'LOBBY'
export type TienLenStatus = 'WAITING' | 'PLAYING' | 'COMPLETE'
export type TienLenCombo = 'SINGLE' | 'PAIR' | 'TRIPLE' | 'STRAIGHT' | 'THREE_PAIRS' | 'FOUR_PAIRS' | 'FOUR_KIND'

export interface TienLenPlayer {
  id: string
  name: string
  seat: number
  isBot: boolean
  cards: string[]
  connected: boolean
  passed: boolean
  finished: boolean
  finishRank?: number
}

export interface TienLenPlay {
  playerId: string
  playerName: string
  cards: string[]
  combo: TienLenCombo
  highRank: number
  highSuit: number
}

export interface TienLenPublicPlayer {
  id: string
  name: string
  seat: number
  isBot: boolean
  cardCount: number
  connected: boolean
  passed: boolean
  finished: boolean
  finishRank?: number
}

export interface TienLenPublicState {
  gameId: string
  mode: TienLenMode
  status: TienLenStatus
  hostId: string
  handNumber: number
  players: TienLenPublicPlayer[]
  currentSeat: number
  leadSeat: number
  lastPlay?: TienLenPlay
  pileCount: number
  notice: string
  result: string
  winnerIds: string[]
}

export interface TienLenPrivateState extends TienLenPublicState {
  playerId: string
  hand: string[]
  legalActions: Array<'PLAY' | 'PASS'>
  mustPlayThreeSpades: boolean
}

export interface TienLenGameState {
  gameId: string
  mode: TienLenMode
  status: TienLenStatus
  hostId: string
  handNumber: number
  players: TienLenPlayer[]
  currentSeat: number
  leadSeat: number
  pileCount: number
  notice: string
  result: string
  winnerIds: string[]
  lastPlay?: TienLenPlay
  openingRequired: boolean
  lastPlayerSeat: number
  passCount: number
  deck: string[]
}

export interface TienLenActionPayload {
  action?: 'PLAY_BOT' | 'JOIN_TABLE' | 'LEAVE_TABLE' | 'START_LOBBY' | 'PLAY' | 'PASS'
  cards?: string[]
  actionId?: string
  tableId?: string
}
