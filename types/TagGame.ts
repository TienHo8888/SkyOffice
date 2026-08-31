import { MapSchema, Schema } from '@colyseus/schema'

export type TagGameStatus = 'IDLE' | 'COUNTDOWN' | 'PLAYING' | 'RESULT'

export interface ITagGameParticipant extends Schema {
  userId: string
  displayName: string
  tagCount: number
  connected: boolean
}

export interface ITagGameState extends Schema {
  status: TagGameStatus
  gameId: string
  roundId: string
  startedBy: string
  taggerSessionId: string
  score: number
  settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED'
  winnerIds: string[]
  startedAt: number
  endsAt: number
  resultMessage: string
  attendees: MapSchema<ITagGameParticipant>
}

export interface TagGameParticipantSnapshot {
  sessionId: string
  userId: string
  displayName: string
  tagCount: number
  connected: boolean
}

export interface TagGameSnapshot {
  status: TagGameStatus
  gameId: string
  roundId: string
  startedBy: string
  taggerSessionId: string
  score: number
  settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED'
  winnerIds: string[]
  startedAt: number
  endsAt: number
  resultMessage: string
  attendees: TagGameParticipantSnapshot[]
}
