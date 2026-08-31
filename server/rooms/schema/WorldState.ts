import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema'
import type { IWorldState, WorldId } from '../../../types/IWorldState'
import type { IChatMessage, IPlayer } from '../../../types/IOfficeState'
import { ChatMessage, Player } from './OfficeState'

/** Shared presence/movement schema for destination worlds. */
export class WorldState extends Schema implements IWorldState {
  @type('string') worldId: WorldId = 'FISHING'
  @type('string') ownerId = ''
  @type('string') mapId = ''
  @type('number') layoutVersion = 1
  @type('string') layoutJson = '{}'
  @type({ map: Player }) players = new MapSchema<IPlayer>()
  @type([ChatMessage]) chatMessages = new ArraySchema<IChatMessage>()
}
