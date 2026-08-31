export type TexasStreet = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'COMPLETE'
export type TexasTurnStatus = 'WAITING' | 'HUMAN_TURN' | 'BOT_THINKING' | 'COMPLETE'
export type TexasGameVariant = 'BOT' | 'MULTIPLAYER'

export interface TexasPlayerState {
  id: string
  name: string
  seat: number
  isBot: boolean
  cards: string[]
  stack: number
  streetBet: number
  totalBet: number
  folded: boolean
  allIn: boolean
  acted: boolean
  lastAction: string
  revealed: boolean
  /** Hand category shown after showdown. Empty until the hand is settled. */
  handRank?: string
  /** The cards that make up the best five-card hand at showdown. */
  winningCards?: string[]
  /** Chips awarded from the pot to this player for the settled hand. */
  payout?: number
}

export interface TexasHoldemState {
  handId: string
  variant: TexasGameVariant
  street: TexasStreet
  dealerSeat: number
  smallBlind: number
  bigBlind: number
  actingSeat: number
  turnStatus: TexasTurnStatus
  turnStartedAt: number
  turnEndsAt: number
  turnTimeLimitMs: number
  botThinkingUntil: number
  currentBet: number
  minRaise: number
  pot: number
  community: string[]
  deck: string[]
  players: TexasPlayerState[]
  actionLog: string[]
  winners: string[]
  result: string
  complete: boolean
  processedActionIds: string[]
}

export interface TexasHoldemPublicState extends Omit<TexasHoldemState, 'deck' | 'processedActionIds'> {
  viewerId: string
  legalActions: string[]
  callAmount: number
  minRaiseTo: number
  maxRaiseTo: number
}

export interface TexasAction {
  action: 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'FOLD'
  amount?: number
}
