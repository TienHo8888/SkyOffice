import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'
import { StudioRole } from './Studio'
import { ITagGameState } from './TagGame'
import { IMiniGameState } from './MiniGame'
import { ICasinoTableState } from './Casino'

export interface IPlayer extends Schema {
  userId: string
  name: string
  role: StudioRole
  x: number
  y: number
  anim: string
  currentRoom: string
  online: boolean
  readyToConnect: boolean
  videoConnected: boolean
  nameplateId: string
  titleId: string
  characterConfigJson: string
  avatarRevision: number
}

export interface IComputer extends Schema {
  connectedUser: SetSchema<string>
}

export interface IWhiteboard extends Schema {
  roomId: string
  connectedUser: SetSchema<string>
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>
  computers: MapSchema<IComputer>
  whiteboards: MapSchema<IWhiteboard>
  chatMessages: ArraySchema<IChatMessage>
  tagGame: ITagGameState
  miniGame: IMiniGameState
  casinoTables: MapSchema<ICasinoTableState>
}
