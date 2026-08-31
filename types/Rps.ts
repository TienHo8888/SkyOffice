export type RpsMove = 'ROCK' | 'PAPER' | 'SCISSORS'

export type RpsAction = 'CREATE' | 'ACCEPT' | 'DECLINE' | 'SELECT_MOVE' | 'READY' | 'CANCEL'

export type RpsChallengeStatus = 'PENDING' | 'READY' | 'RESOLVED' | 'DECLINED' | 'CANCELLED'

export type RpsRole = 'CHALLENGER' | 'CHALLENGED'

export interface RpsActionPayload {
  action?: RpsAction
  targetSessionId?: string
  challengeId?: string
  wager?: number
  move?: RpsMove
  actionId?: string
}

export interface RpsChallengeState {
  id: string
  status: RpsChallengeStatus
  challengerSessionId: string
  challengerName: string
  challengedSessionId: string
  challengedName: string
  wager: number
  challengerMove?: RpsMove
  challengedMove?: RpsMove
  challengerReady: boolean
  challengedReady: boolean
  winnerSessionId?: string
  resultText?: string
  createdAt: number
}

export interface RpsPrivateState {
  challengeId: string
  status: RpsChallengeStatus
  role: RpsRole
  opponentSessionId: string
  opponentName: string
  wager: number
  myMove?: RpsMove
  opponentMove?: RpsMove
  myReady: boolean
  opponentReady: boolean
  winnerSessionId?: string
  resultText?: string
  createdAt: number
}
