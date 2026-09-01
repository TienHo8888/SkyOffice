import type { IPlayer } from '../../../types/IOfficeState'
import { characterConfigToLegacyAvatar, isCharacterConfig } from '../../../types/Avatar'
import type { CharacterConfig } from '../../../types/Avatar'
import type { SocialSnapshot } from '../../../types/Social'
import type { StudioAvatarKey, User } from '../../../types/Studio'

const LEGACY_AVATAR_KEYS: readonly StudioAvatarKey[] = ['adam', 'ash', 'lucy', 'nancy']

function parseNetworkCharacterConfig(raw?: string): CharacterConfig | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return isCharacterConfig(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function avatarKeyFromAnimation(animation?: string): StudioAvatarKey | undefined {
  const candidate = animation?.split('_')[0] as StudioAvatarKey | undefined
  return candidate && LEGACY_AVATAR_KEYS.includes(candidate) ? candidate : undefined
}

/**
 * Resolve the avatar used when a Phaser world creates its local player.
 *
 * Auth state can arrive a few frames after a Colyseus room has already
 * hydrated. The room's own player record is therefore a safe last-resort
 * source, and avoids showing the legacy Adam sprite during world transitions.
 */
export function resolvePlayerAppearance(options: {
  user?: User | null
  social?: SocialSnapshot | null
  networkPlayer?: Pick<IPlayer, 'anim' | 'characterConfigJson'> | null
}) {
  const characterConfig = options.user?.characterConfig
    || options.social?.identity?.characterConfig
    || parseNetworkCharacterConfig(options.networkPlayer?.characterConfigJson)
  const avatarKey = options.user?.avatarKey
    || options.social?.identity?.avatarKey
    || options.social?.loadout.avatarKey
    || (characterConfig ? characterConfigToLegacyAvatar(characterConfig) : undefined)
    || avatarKeyFromAnimation(options.networkPlayer?.anim)
    || 'adam'

  return { avatarKey, characterConfig }
}
