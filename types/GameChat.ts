import { CasinoGameMode } from './Casino'
import { MiniGameMode } from './MiniGame'

export type GameChatChannel = CasinoGameMode | MiniGameMode | 'TAG' | 'RPS'

export interface GameChatMessage {
  id: string
  channel: GameChatChannel
  sessionId: string
  author: string
  content: string
  createdAt: number
}

export type GameChatClientPayload =
  | { action: 'LOAD'; channel: GameChatChannel }
  | { action: 'SEND'; channel: GameChatChannel; content: string }

export type GameChatServerPayload =
  | { action: 'HISTORY'; channel: GameChatChannel; messages: GameChatMessage[] }
  | { action: 'MESSAGE'; channel: GameChatChannel; message: GameChatMessage }
  | { action: 'ERROR'; channel: GameChatChannel; message: string }
