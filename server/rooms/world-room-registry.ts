import type { PropertySnapshot } from '../../types/Social'

type HomeLayoutListener = (snapshot: PropertySnapshot) => void

/**
 * Process-local bridge between the authenticated property REST API and the
 * Colyseus Home rooms. Durable property data remains in StudioStore; this
 * registry only fans the accepted update out to currently connected guests.
 */
class WorldRoomRegistry {
  private readonly homeRooms = new Map<string, Set<HomeLayoutListener>>()

  registerHome(ownerId: string, listener: HomeLayoutListener): () => void {
    const listeners = this.homeRooms.get(ownerId) || new Set<HomeLayoutListener>()
    listeners.add(listener)
    this.homeRooms.set(ownerId, listeners)
    return () => {
      const current = this.homeRooms.get(ownerId)
      current?.delete(listener)
      if (current && current.size === 0) this.homeRooms.delete(ownerId)
    }
  }

  broadcastHomeLayout(snapshot: PropertySnapshot): void {
    this.homeRooms.get(snapshot.ownerId)?.forEach((listener) => listener(snapshot))
  }
}

export const worldRoomRegistry = new WorldRoomRegistry()
