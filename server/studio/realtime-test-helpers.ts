import { Room } from 'colyseus.js'

import { Message } from '../../types/Messages'

const WALK_STEP_PX = 55
const WALK_STEP_DELAY_MS = 85

export async function walkPlayerTo(
  room: Room,
  target: { x: number; y: number },
  anim: string,
  start = { x: 705, y: 500 },
) {
  let current = { ...start }
  while (true) {
    const distance = Math.hypot(target.x - current.x, target.y - current.y)
    if (distance <= 0.001) break
    if (distance <= WALK_STEP_PX) current = { ...target }
    else {
      const step = WALK_STEP_PX
      current = {
        x: current.x + ((target.x - current.x) / distance) * step,
        y: current.y + ((target.y - current.y) / distance) * step,
      }
    }
    room.send(Message.UPDATE_PLAYER, { x: current.x, y: current.y, anim })
    await new Promise((resolve) => setTimeout(resolve, WALK_STEP_DELAY_MS))
  }
}
