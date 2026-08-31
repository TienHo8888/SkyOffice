import { EventEmitter } from 'events'
import { CompletionResponse, Studio } from '../../types/Studio'

export const studioEvents = new EventEmitter()

export interface StudioEventPayload {
  type: string
  studioId: string
  actorId?: string
  completion?: CompletionResponse
  studio?: Studio
  createdAt: string
}

export function publishStudioCompletion(studioId: string, actorId: string, completion: CompletionResponse) {
  const base = { studioId, actorId, completion, createdAt: new Date().toISOString() }
  studioEvents.emit('TASK_COMPLETED', { type: 'TASK_COMPLETED', ...base } as StudioEventPayload)
  studioEvents.emit('BOSS_DAMAGED', { type: 'BOSS_DAMAGED', ...base } as StudioEventPayload)
  if (completion.boss?.status === 'DEFEATED') studioEvents.emit('BOSS_DEFEATED', { type: 'BOSS_DEFEATED', ...base } as StudioEventPayload)
  studioEvents.emit('STUDIO_XP_CHANGED', { type: 'STUDIO_XP_CHANGED', ...base } as StudioEventPayload)
  if (completion.events.some((event) => event.type === 'STUDIO_LEVEL_UP')) studioEvents.emit('STUDIO_LEVEL_UP', { type: 'STUDIO_LEVEL_UP', ...base } as StudioEventPayload)
}
