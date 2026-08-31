import { ArraySchema, MapSchema, Schema } from '@colyseus/schema'
import type { IChatMessage, IPlayer } from './IOfficeState'

export type WorldId = 'FISHING' | 'HOME'

export interface IWorldState extends Schema {
  worldId: WorldId
  ownerId: string
  mapId: string
  layoutVersion: number
  layoutJson: string
  players: MapSchema<IPlayer>
  chatMessages: ArraySchema<IChatMessage>
}

export type WorldRoomOptions =
  | { worldId: 'FISHING'; mapId: 'fishing_riverbend_v1' }
  | { worldId: 'HOME'; ownerId: string; mapId: 'home_room_v1' }

export interface WorldErrorPayload {
  code: string
  message: string
}
