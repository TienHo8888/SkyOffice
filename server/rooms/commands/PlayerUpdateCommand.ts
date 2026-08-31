import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState } from '../../../types/IOfficeState'

type Payload = {
  client: Client
  x: number
  y: number
  anim: string
}

export default class PlayerUpdateCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, x, y, anim } = data

    const player = this.room.state.players.get(client.sessionId)

    if (!player) return
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    player.x = x
    player.y = y
    if (typeof anim === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(anim)) player.anim = anim
  }
}
