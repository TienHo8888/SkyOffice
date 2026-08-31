import phaserGame from '../PhaserGame'
import type Network from '../services/Network'
import type MyPlayer from '../characters/MyPlayer'

export interface ActiveWorldSceneHandle {
  network?: Network
  myPlayer?: MyPlayer
  disableKeys?: (lock?: string) => void
  enableKeys?: (lock?: string) => void
}

const WORLD_SCENE_KEYS = ['game', 'fishing-world', 'home-world'] as const

/**
 * The room transition keeps the Phaser scene alive while the destination
 * scene is being loaded. Always prefer the scene that Phaser reports active;
 * falling back to a keyed scene keeps UI actions usable during the first
 * frame of a transition.
 */
export function getActiveWorldScene(): ActiveWorldSceneHandle | undefined {
  for (const key of WORLD_SCENE_KEYS) {
    const scene = phaserGame.scene.keys[key] as ActiveWorldSceneHandle | undefined
    if (scene && phaserGame.scene.isActive(key)) return scene
  }
  return WORLD_SCENE_KEYS.map((key) => phaserGame.scene.keys[key] as ActiveWorldSceneHandle | undefined).find(Boolean)
}

export function getActiveWorldNetwork(): Network | undefined {
  // Bootstrap owns the canonical connection for the whole Phaser lifecycle.
  // Prefer it over scene fields because Vite/Phaser hot reload can leave an
  // inactive scene instance mounted with an old Network object.
  const bootstrap = phaserGame.scene.keys.bootstrap as { network?: Network } | undefined
  if (bootstrap?.network) return bootstrap.network
  return getActiveWorldScene()?.network
}
