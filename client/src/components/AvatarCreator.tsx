import React, { useMemo, useState } from 'react'
import {
  avatarCatalogItemSupportsProfile,
  cloneCharacterConfig,
  DEFAULT_CHARACTER_CONFIG,
  getAvatarBaseBodyProfile,
  getAvatarCatalogItem,
  getAvatarCatalogItems,
} from '../../../types/Avatar'
import type { AvatarAnimation, AvatarBodyProfile, AvatarDirection, AvatarSlot, CharacterConfig } from '../../../types/Avatar'
import LpcAvatarPreview from './LpcAvatarPreview'

const ALL_AVATAR_SLOTS: readonly AvatarSlot[] = ['body', 'face', 'hair', 'feature', 'top', 'bottom', 'shoes', 'hat', 'neck', 'arms', 'shoulders', 'weapon']

const SLOT_DEFINITIONS: Array<{ slot: AvatarSlot; label: string; helper: string }> = [
  { slot: 'body', label: 'Dáng', helper: 'Body' },
  { slot: 'face', label: 'Mặt', helper: 'Face' },
  { slot: 'hair', label: 'Tóc', helper: 'Hair' },
  { slot: 'feature', label: 'Điểm nhấn', helper: 'Feature' },
  { slot: 'weapon', label: 'Tay', helper: 'Weapon' },
]

const BODY_PROFILE_OPTIONS: readonly AvatarBodyProfile[] = ['male', 'female']

const OUTFIT_PRESETS = [
  {
    id: 'studio-casual',
    label: 'Studio casual',
    description: 'Áo thun · quần dài · giày basic',
    swatch: '#56a895',
    top: 'top-tshirt',
    bottom: 'bottom-pants',
    shoes: 'shoes-basic',
  },
  {
    id: 'night-shift',
    label: 'Night shift',
    description: 'Áo dài tay · quần formal · boots',
    swatch: '#6f77bd',
    top: 'top-longsleeve',
    bottom: 'bottom-formal',
    shoes: 'shoes-boots',
  },
  {
    id: 'social-weekend',
    label: 'Social weekend',
    description: 'Polo · quần short · sandals',
    swatch: '#e29a54',
    top: 'top-polo',
    bottom: 'bottom-shorts',
    shoes: 'shoes-sandals',
  },
] as const

const PREVIEW_ACTIONS: Array<{ value: AvatarAnimation; label: string }> = [
  { value: 'idle', label: 'Đứng' },
  { value: 'walk', label: 'Đi' },
  { value: 'run', label: 'Chạy' },
  { value: 'slash', label: 'Đánh' },
  { value: 'hurt', label: 'Trúng đòn' },
]

const PREVIEW_DIRECTIONS: Array<{ value: AvatarDirection; label: string }> = [
  { value: 'down', label: 'Nam' },
  { value: 'left', label: 'Tây' },
  { value: 'right', label: 'Đông' },
  { value: 'up', label: 'Bắc' },
]

const BODY_PROFILES: Record<AvatarBodyProfile, string> = {
  male: 'Nam',
  female: 'Nữ',
  teen: 'Trẻ',
  pregnant: 'Bầu',
}

function randomItem(slot: AvatarSlot, bodyProfile: AvatarBodyProfile) {
  const items = getAvatarCatalogItems(slot, bodyProfile)
  return items[Math.floor(Math.random() * items.length)]
}

function getBodyProfileForSelection(itemId: string): AvatarBodyProfile {
  if (itemId === 'body-female') return 'female'
  if (itemId === 'body-teen') return 'teen'
  if (itemId === 'body-pregnant') return 'pregnant'
  return 'male'
}

function reconcileSlots(config: CharacterConfig): CharacterConfig {
  const next = cloneCharacterConfig(config)
  ALL_AVATAR_SLOTS.forEach((slot) => {
    const item = getAvatarCatalogItem(next.slots[slot], slot)
    if (!item || !avatarCatalogItemSupportsProfile(item, next.bodyProfile)) {
      next.slots[slot] = getAvatarCatalogItems(slot, next.bodyProfile)[0]?.id || next.slots[slot]
    }
  })
  return next
}

interface AvatarCreatorProps {
  config: CharacterConfig
  onChange: (config: CharacterConfig) => void
  title?: string
  description?: string
}

export default function AvatarCreator({ config, onChange, title = 'Tạo nhân vật của bạn', description = 'Lắp từng layer pixel và xem ngay cách nhân vật chuyển động trong thế giới.' }: AvatarCreatorProps) {
  const [activeSlot, setActiveSlot] = useState<AvatarSlot>('body')
  const [previewAnimation, setPreviewAnimation] = useState<AvatarAnimation>('idle')
  const [previewDirection, setPreviewDirection] = useState<AvatarDirection>('down')
  const currentItems = useMemo(
    () => getAvatarCatalogItems(activeSlot, config.bodyProfile),
    [activeSlot, config.bodyProfile]
  )
  const selectedOutfitId = useMemo(() => {
    const selected = OUTFIT_PRESETS.find((preset) => (
      preset.top === config.slots.top && preset.bottom === config.slots.bottom && preset.shoes === config.slots.shoes
    ))
    return selected?.id || ''
  }, [config.slots.bottom, config.slots.shoes, config.slots.top])

  const updateBodyProfile = (bodyProfile: AvatarBodyProfile) => {
    const next = cloneCharacterConfig(config)
    const body = getAvatarCatalogItems('body', bodyProfile)[0]
    next.bodyProfile = bodyProfile
    next.slots.body = body?.id || (bodyProfile === 'female' || bodyProfile === 'pregnant' ? 'body-female' : 'body-male')
    onChange(reconcileSlots(next))
  }

  const updateSlot = (slot: AvatarSlot, itemId: string) => {
    const next = cloneCharacterConfig(config)
    next.slots[slot] = itemId
    if (slot === 'body') {
      next.bodyProfile = getBodyProfileForSelection(itemId)
      onChange(reconcileSlots(next))
      return
    }
    onChange(next)
  }

  const randomize = () => {
    const fallbackBodyId = config.bodyProfile === 'female' || config.bodyProfile === 'pregnant' ? 'body-female' : 'body-male'
    const body = randomItem('body', config.bodyProfile) || getAvatarCatalogItem(fallbackBodyId, 'body')
    const next = cloneCharacterConfig(config)
    next.bodyProfile = getBodyProfileForSelection(body?.id || fallbackBodyId)
    next.slots.body = body?.id || fallbackBodyId
    ;(['face', 'hair', 'feature', 'weapon'] as AvatarSlot[]).forEach((slot) => {
      next.slots[slot] = randomItem(slot, next.bodyProfile)?.id || next.slots[slot]
    })
    const outfit = OUTFIT_PRESETS[Math.floor(Math.random() * OUTFIT_PRESETS.length)]
    next.slots.top = outfit.top
    next.slots.bottom = outfit.bottom
    next.slots.shoes = outfit.shoes
    onChange(reconcileSlots(next))
  }

  const applyOutfit = (outfit: typeof OUTFIT_PRESETS[number]) => {
    const next = cloneCharacterConfig(config)
    next.slots.top = outfit.top
    next.slots.bottom = outfit.bottom
    next.slots.shoes = outfit.shoes
    onChange(reconcileSlots(next))
  }

  const reset = () => onChange(cloneCharacterConfig(DEFAULT_CHARACTER_CONFIG))

  const hairLabel = getAvatarCatalogItem(config.slots.hair, 'hair')?.label || 'Avatar'
  const featureLabel = getAvatarCatalogItem(config.slots.feature, 'feature')?.label || 'Không có điểm nhấn'
  const equipmentLabel = config.slots.weapon === 'weapon-none' ? 'Tay trống' : 'Đã trang bị vũ khí'

  return (
    <section className="avatar-creator" aria-label="LPC avatar creator">
      <div className="avatar-creator-header">
        <div>
          <span className="avatar-creator-kicker">LPC / CHARACTER CREATOR</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="avatar-creator-header-badge">
          <span className="avatar-creator-status-dot" />
          <span>{BODY_PROFILES[config.bodyProfile]} profile</span>
        </div>
      </div>

      <div className="avatar-creator-profile-picker">
        <div className="avatar-creator-profile-copy">
          <span>GENDER / BODY PROFILE</span>
          <small>Chọn giới tính hiển thị và silhouette nền cho nhân vật.</small>
        </div>
        <div className="avatar-creator-profile-actions" role="group" aria-label="Chọn giới tính nhân vật">
          {BODY_PROFILE_OPTIONS.map((profile) => (
            <button
              key={profile}
              type="button"
              className={`avatar-creator-profile-button${getAvatarBaseBodyProfile(config.bodyProfile) === profile ? ' is-active' : ''}`}
              onClick={() => updateBodyProfile(profile)}
              aria-pressed={getAvatarBaseBodyProfile(config.bodyProfile) === profile}
            >
              <strong>{profile === 'male' ? '♂' : '♀'}</strong>
              <span>{BODY_PROFILES[profile]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="avatar-creator-main">
        <div className="avatar-creator-preview-panel">
          <div className="avatar-creator-preview-label">
            <span>LIVE PREVIEW</span>
            <small>64 × 64 LPC</small>
          </div>
          <LpcAvatarPreview
            config={config}
            animation={previewAnimation}
            direction={previewDirection}
            // Keep clothing and body silhouettes unobstructed while editing a
            // non-weapon slot. The weapon remains available in its own tab.
            showWeapon={activeSlot === 'weapon'}
          />
          <div className="avatar-creator-preview-meta">
            <strong>{hairLabel}</strong>
            <span>{featureLabel} · {equipmentLabel}</span>
          </div>
          <div className="avatar-creator-preview-group">
            <span>Animation</span>
            <div className="avatar-creator-compact-actions">
              {PREVIEW_ACTIONS.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  className={previewAnimation === action.value ? 'is-active' : ''}
                  onClick={() => setPreviewAnimation(action.value)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
          <div className="avatar-creator-preview-group">
            <span>Hướng nhìn</span>
            <div className="avatar-creator-compact-actions avatar-creator-direction-actions">
              {PREVIEW_DIRECTIONS.map((direction) => (
                <button
                  key={direction.value}
                  type="button"
                  className={previewDirection === direction.value ? 'is-active' : ''}
                  onClick={() => setPreviewDirection(direction.value)}
                >
                  {direction.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="avatar-creator-editor">
          <div className="avatar-creator-outfit-section">
            <div className="avatar-creator-section-heading">
              <div>
                <span>STARTER OUTFITS</span>
                <strong>3 bộ mặc định</strong>
              </div>
              <small>Shop trang phục sẽ mở rộng sau</small>
            </div>
            <div className="avatar-creator-outfit-grid">
              {OUTFIT_PRESETS.map((outfit, index) => {
                const selected = selectedOutfitId === outfit.id
                return (
                  <button
                    key={outfit.id}
                    type="button"
                    className={`avatar-creator-outfit-card${selected ? ' is-selected' : ''}`}
                    onClick={() => applyOutfit(outfit)}
                    aria-pressed={selected}
                  >
                    <span className="avatar-creator-outfit-swatch" style={{ backgroundColor: outfit.swatch }}>{String(index + 1).padStart(2, '0')}</span>
                    <span className="avatar-creator-outfit-copy">
                      <strong>{outfit.label}</strong>
                      <small>{outfit.description}</small>
                      <em>{selected ? 'ĐANG DÙNG' : 'CHỌN BỘ'}</em>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="avatar-creator-slots" role="tablist" aria-label="Avatar layers">
            {SLOT_DEFINITIONS.map((definition) => (
              <button
                key={definition.slot}
                type="button"
                role="tab"
                aria-selected={activeSlot === definition.slot}
                className={`avatar-creator-slot${activeSlot === definition.slot ? ' is-active' : ''}`}
                onClick={() => setActiveSlot(definition.slot)}
              >
                <span>{definition.label}</span>
                <small>{definition.helper}</small>
              </button>
            ))}
          </div>
          <div className="avatar-creator-item-heading">
            <div>
              <span>CHỌN LAYER</span>
              <strong>{SLOT_DEFINITIONS.find((definition) => definition.slot === activeSlot)?.label}</strong>
            </div>
            <small>{currentItems.length} lựa chọn</small>
          </div>
          <div className="avatar-creator-items">
            {currentItems.map((item) => {
              const selected = config.slots[activeSlot] === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`avatar-creator-item${selected ? ' is-selected' : ''}`}
                  onClick={() => updateSlot(activeSlot, item.id)}
                  aria-pressed={selected}
                >
                  <span className="avatar-creator-item-swatch" style={{ backgroundColor: item.swatch }} />
                  <span className="avatar-creator-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {selected && <span className="avatar-creator-item-check">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="avatar-creator-footer-actions">
            <button type="button" className="avatar-creator-secondary-button" onClick={reset}>Đặt lại mặc định</button>
            <button type="button" className="avatar-creator-random-button" onClick={randomize}>✦ Random look</button>
          </div>
        </div>
      </div>
    </section>
  )
}
