import type { StudioAvatarKey } from './Studio'

export const AVATAR_CONFIG_VERSION = 1 as const
export const LPC_FRAME_SIZE = 64

/**
 * A body profile is also the asset profile used by Universal LPC.  The
 * previous implementation collapsed teen and pregnant silhouettes into the
 * adult male/female profiles.  That made the body sprite change while the
 * clothing layers kept reading the adult sheet, which is exactly the
 * misalignment seen when switching body shapes in the creator.
 */
export type AvatarBodyProfile = 'male' | 'female' | 'teen' | 'pregnant'
export type AvatarSlot = 'body' | 'face' | 'hair' | 'feature' | 'top' | 'bottom' | 'shoes' | 'hat' | 'neck' | 'arms' | 'shoulders' | 'weapon'
export type AvatarWardrobeSlot = 'top' | 'bottom' | 'shoes' | 'hat' | 'neck' | 'arms' | 'shoulders'
export type AvatarShopCategory = 'TOPS' | 'BOTTOMS' | 'HEADWEAR' | 'FOOTWEAR' | 'ACCESSORIES' | 'SETS'
export type AvatarDirection = 'up' | 'left' | 'down' | 'right'
export type AvatarAnimation = 'idle' | 'walk' | 'run' | 'slash' | 'hurt' | 'shoot' | 'thrust' | 'sit'

export const AVATAR_DIRECTIONS: readonly AvatarDirection[] = ['up', 'left', 'down', 'right']
export const AVATAR_ANIMATIONS: readonly AvatarAnimation[] = ['idle', 'walk', 'run', 'slash', 'hurt', 'shoot', 'thrust', 'sit']

export const AVATAR_SHOP_CATEGORY_META: readonly {
  id: AvatarShopCategory
  label: string
  helper: string
  icon: string
}[] = [
  { id: 'TOPS', label: 'Áo', helper: '100 mẫu', icon: '◒' },
  { id: 'BOTTOMS', label: 'Quần', helper: '100 mẫu', icon: '◓' },
  { id: 'HEADWEAR', label: 'Nón', helper: '100 mẫu', icon: '⌂' },
  { id: 'FOOTWEAR', label: 'Giày', helper: '100 mẫu', icon: '⌁' },
  { id: 'ACCESSORIES', label: 'Phụ kiện', helper: '100 mẫu', icon: '✦' },
  { id: 'SETS', label: 'Bộ phối', helper: '100+ bộ', icon: '✧' },
]

/**
 * All curated runtime sheets use the LPC direction order: up, left, down,
 * right. Keeping this map shared is important: the React preview and the
 * Phaser character must never choose different rows for the same animation.
 */
export const LPC_DIRECTION_ROWS: Readonly<Record<AvatarDirection, number>> = {
  up: 0,
  left: 1,
  down: 2,
  right: 3,
}

export const LPC_ANIMATION_FRAME_COUNTS: Readonly<Record<AvatarAnimation, number>> = {
  idle: 2,
  walk: 9,
  run: 8,
  slash: 6,
  hurt: 6,
  shoot: 13,
  thrust: 8,
  sit: 3,
}

export const LPC_ANIMATION_FRAME_DURATIONS: Readonly<Record<AvatarAnimation, number>> = {
  idle: 420,
  walk: 105,
  run: 90,
  slash: 105,
  hurt: 125,
  shoot: 75,
  thrust: 95,
  sit: 360,
}

/**
 * Default render order follows Universal LPC z-positioning. Boots are a
 * special case: tall boots sit in front of the trouser hem, while shoes,
 * sandals and slippers sit behind it. The old fixed `bottom → shoes` order
 * made the ankle seam flicker or reveal the body when outfit layers changed.
 */
export const LPC_LAYER_RENDER_ORDER: readonly AvatarSlot[] = [
  'body',
  'shoes',
  'bottom',
  'top',
  'arms',
  'shoulders',
  'neck',
  'face',
  'feature',
  'hair',
  'hat',
  'weapon',
]

const LPC_LAYER_Z: Readonly<Record<AvatarSlot, number>> = {
  body: 10,
  face: 100,
  hair: 120,
  feature: 115,
  top: 35,
  bottom: 20,
  shoes: 15,
  arms: 40,
  shoulders: 45,
  neck: 48,
  hat: 130,
  weapon: 140,
}

const LPC_TALL_SHOE_IDS = new Set([
  'shoes-boots',
  'shoes-fold-boots',
  'shoes-revised-boots',
])

export function getAvatarLayerZ(slot: AvatarSlot, itemId?: string): number {
  if (slot === 'shoes' && itemId && LPC_TALL_SHOE_IDS.has(itemId)) return 25
  return LPC_LAYER_Z[slot]
}

export interface LpcFrameCoordinates {
  row: number
  column: number
  frameSize: number
}

/**
 * Most LPC layers are laid out as 64×64 frames. The arming-saber attack
 * sheets are one of the upstream custom animations, however, and use a
 * 128×128 canvas per frame so the blade can extend outside the normal body
 * cell. Keeping this decision in shared code prevents Phaser and the React
 * preview from sampling different quadrants of the same sheet.
 */
export function getAvatarSheetFrameSize(animation: AvatarAnimation, assetPath?: string): number {
  if (
    (animation === 'slash' || animation === 'thrust') &&
    assetPath?.includes('/weapon/saber/')
  ) return 128
  return LPC_FRAME_SIZE
}

/**
 * Resolve one frame from an LPC sheet without assuming every source image has
 * exactly the same dimensions. A few upstream sheets contain an extra idle
 * row or only one row for a direction-independent action; both cases are
 * clamped here instead of leaking into a neighbouring frame.
 */
export function getAvatarFrameCoordinates(
  animation: AvatarAnimation,
  direction: AvatarDirection,
  sourceWidth: number,
  sourceHeight: number,
  frame: number,
  frameSize = LPC_FRAME_SIZE,
): LpcFrameCoordinates {
  const safeFrameSize = Math.max(1, Math.floor(frameSize))
  const columns = Math.max(1, Math.floor(sourceWidth / safeFrameSize))
  const rows = Math.max(1, Math.floor(sourceHeight / safeFrameSize))
  const requestedRow = LPC_DIRECTION_ROWS[direction]
  const row = Math.min(requestedRow, rows - 1)
  const maxFrame = Math.max(0, Math.min(LPC_ANIMATION_FRAME_COUNTS[animation], columns) - 1)
  const column = Math.min(Math.max(0, Math.floor(frame)), maxFrame)
  return { row, column, frameSize: safeFrameSize }
}

// LPC's sit sheet contains a short sit-down transition followed by the
// settled pose. The game keeps the settled pose while the player remains on a
// chair instead of looping the transition forever.
export const AVATAR_STATIC_FRAME_INDEX: Partial<Record<AvatarAnimation, number>> = {
  sit: 2,
}

export interface AvatarAssetSet {
  idle: string
  walk: string
  run: string
  slash: string
  hurt: string
  shoot: string
  thrust: string
  sit: string
}

export interface AvatarCatalogItem {
  id: string
  slot: AvatarSlot
  label: string
  description: string
  swatch: string
  supportedProfiles: readonly AvatarBodyProfile[]
  assets: Partial<Record<AvatarBodyProfile, AvatarAssetSet>>
}

export interface CharacterSlots {
  body: string
  face: string
  hair: string
  feature: string
  top: string
  bottom: string
  shoes: string
  hat: string
  neck: string
  arms: string
  shoulders: string
  weapon: string
}

export interface CharacterConfig {
  version: typeof AVATAR_CONFIG_VERSION
  bodyProfile: AvatarBodyProfile
  slots: CharacterSlots
}

export type AvatarOutfitRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'SEASONAL'

/**
 * A shop outfit is a small, deterministic preset made from the same LPC
 * layers that the Avatar Creator uses. Keeping the mapping in shared types
 * means the preview, server validation and in-world renderer cannot drift
 * apart or point at an asset that the creator does not know about.
 */
export interface AvatarOutfitDefinition {
  id: string
  name: string
  description: string
  rarity: AvatarOutfitRarity
  price: number
  color: string
  unlockLevel?: number
  starter?: boolean
  slots: Pick<CharacterSlots, 'top' | 'bottom' | 'shoes'>
}

/**
 * A single shop product that equips one LPC layer. It still carries a
 * complete outfit-shaped slot fallback for the existing store API, while the
 * explicit `slot` and `itemId` fields make mix-and-match validation precise.
 */
export interface AvatarWardrobeDefinition {
  id: string
  name: string
  description: string
  category: AvatarShopCategory
  slot: AvatarWardrobeSlot
  itemId: string
  rarity: AvatarOutfitRarity
  price: number
  color: string
  unlockLevel?: number
  starter?: boolean
  slots: Pick<CharacterSlots, 'top' | 'bottom' | 'shoes'>
}

const CURATED_OUTFIT_BUNDLES: readonly AvatarOutfitDefinition[] = [
  {
    id: 'outfit-starter-green',
    name: 'Mint Starter',
    description: 'Bộ khởi đầu thân thiện cho những ngày đầu ở Studio Commons.',
    rarity: 'COMMON',
    price: 500,
    color: '#c8f267',
    starter: true,
    slots: { top: 'top-tshirt', bottom: 'bottom-pants', shoes: 'shoes-basic' },
  },
  {
    id: 'outfit-art-pastel',
    name: 'Art Pastel',
    description: 'Màu pastel nhẹ cho những buổi phối asset tại Art Studio.',
    rarity: 'COMMON',
    price: 900,
    color: '#d87578',
    unlockLevel: 1,
    slots: { top: 'top-scoop', bottom: 'bottom-short-shorts', shoes: 'shoes-sandals' },
  },
  {
    id: 'outfit-qa-inspector',
    name: 'QA Inspector',
    description: 'Gọn gàng, dễ đọc và luôn sẵn sàng soi ra pixel lỗi cuối cùng.',
    rarity: 'COMMON',
    price: 1400,
    color: '#6eb8ca',
    unlockLevel: 1,
    slots: { top: 'top-buttoned', bottom: 'bottom-pants', shoes: 'shoes-basic' },
  },
  {
    id: 'outfit-neon-night',
    name: 'Neon Night',
    description: 'Bộ phát sáng cho những ca làm muộn và những ván game đêm.',
    rarity: 'RARE',
    price: 2500,
    color: '#ae91ff',
    unlockLevel: 2,
    slots: { top: 'top-vneck', bottom: 'bottom-leggings', shoes: 'shoes-revised' },
  },
  {
    id: 'outfit-animation-motion',
    name: 'Motion Animator',
    description: 'Layer mềm và linh hoạt, hợp với người điều khiển từng nhịp keyframe.',
    rarity: 'RARE',
    price: 2800,
    color: '#a077bd',
    unlockLevel: 2,
    slots: { top: 'top-cardigan', bottom: 'bottom-cuffed', shoes: 'shoes-fold-boots' },
  },
  {
    id: 'outfit-arcade-weekend',
    name: 'Arcade Weekend',
    description: 'Set thoải mái để đi từ Play Lounge sang Arcade Hall.',
    rarity: 'RARE',
    price: 3200,
    color: '#d99c63',
    unlockLevel: 2,
    slots: { top: 'top-sleeveless', bottom: 'bottom-shorts', shoes: 'shoes-slippers' },
  },
  {
    id: 'outfit-backend-night',
    name: 'Backend Night Shift',
    description: 'Áo layer dài và quần rộng cho những luồng event chạy xuyên đêm.',
    rarity: 'RARE',
    price: 3800,
    color: '#6d936f',
    unlockLevel: 2,
    slots: { top: 'top-long-cardigan', bottom: 'bottom-pants2', shoes: 'shoes-revised-boots' },
  },
  {
    id: 'outfit-hr-warm',
    name: 'HR Warm Welcome',
    description: 'Ấm áp và chỉn chu như một lời chào đầu tiên dành cho thành viên mới.',
    rarity: 'RARE',
    price: 4600,
    color: '#e29a54',
    unlockLevel: 2,
    slots: { top: 'top-cardigan', bottom: 'bottom-formal', shoes: 'shoes-ghillies' },
  },
  {
    id: 'outfit-frontend-grid',
    name: 'Frontend Grid',
    description: 'Bộ cân bằng giữa sắc màu và cấu trúc, dành cho người ráp từng component.',
    rarity: 'EPIC',
    price: 5200,
    color: '#6eb8ca',
    unlockLevel: 3,
    slots: { top: 'top-polo', bottom: 'bottom-cuffed', shoes: 'shoes-revised' },
  },
  {
    id: 'outfit-pm-command',
    name: 'PM Command',
    description: 'Silhouette sắc nét cho người giữ nhịp sprint, risk và dependency.',
    rarity: 'EPIC',
    price: 5800,
    color: '#5d79b8',
    unlockLevel: 3,
    slots: { top: 'top-long-polo', bottom: 'bottom-formal-striped', shoes: 'shoes-revised-boots' },
  },
  {
    id: 'outfit-game-design-vision',
    name: 'Design Vision',
    description: 'Một chút nổi bật cho người biến mechanic thành trải nghiệm đáng nhớ.',
    rarity: 'EPIC',
    price: 6800,
    color: '#d26b63',
    unlockLevel: 3,
    slots: { top: 'top-vneck', bottom: 'bottom-leggings', shoes: 'shoes-ghillies' },
  },
  {
    id: 'outfit-sunset-formal',
    name: 'Sunset Formal',
    description: 'Bộ formal bóng chiều, phù hợp cho meeting và các buổi celebration.',
    rarity: 'EPIC',
    price: 7500,
    color: '#ffb86c',
    unlockLevel: 3,
    slots: { top: 'top-longsleeve', bottom: 'bottom-formal', shoes: 'shoes-boots' },
  },
  {
    id: 'outfit-founders-gold',
    name: 'Founders Gold',
    description: 'Bộ trạng thái giới hạn dành cho những người đã đi đến đỉnh ladder.',
    rarity: 'LEGENDARY',
    price: 10000,
    color: '#ffe08a',
    unlockLevel: 5,
    slots: { top: 'top-long-polo', bottom: 'bottom-formal-striped', shoes: 'shoes-ghillies' },
  },
  {
    id: 'outfit-creative-lead',
    name: 'Creative Lead',
    description: 'Áo cài nút dài tay phối quần ống rộng cho những buổi review concept.',
    rarity: 'RARE',
    price: 3400,
    color: '#c47f70',
    unlockLevel: 2,
    slots: { top: 'top-long-buttoned', bottom: 'bottom-pantaloons', shoes: 'shoes-fold-boots' },
  },
  {
    id: 'outfit-indigo-focus',
    name: 'Indigo Focus',
    description: 'Cổ V dài tay và leggings mới, gọn khi di chuyển giữa các phòng.',
    rarity: 'RARE',
    price: 4100,
    color: '#7976c7',
    unlockLevel: 2,
    slots: { top: 'top-long-vneck', bottom: 'bottom-leggings2', shoes: 'shoes-revised' },
  },
  {
    id: 'outfit-sprint-casual',
    name: 'Sprint Casual',
    description: 'Áo tay ngắn form mới phối pantaloons, thoải mái nhưng vẫn có cá tính.',
    rarity: 'EPIC',
    price: 5400,
    color: '#4fa7a0',
    unlockLevel: 3,
    slots: { top: 'top-relaxed-shirt', bottom: 'bottom-pantaloons', shoes: 'shoes-sandals' },
  },
  {
    id: 'outfit-pixel-rebel',
    name: 'Pixel Rebel',
    description: 'Áo sát nách cài nút với quần ôm tương phản cho silhouette mạnh.',
    rarity: 'EPIC',
    price: 6200,
    color: '#cf5f75',
    unlockLevel: 3,
    slots: { top: 'top-sleeveless-buttoned', bottom: 'bottom-leggings2', shoes: 'shoes-boots' },
  },
  {
    id: 'outfit-mixlab-ember',
    name: 'Mixlab Ember',
    description: 'Một phối đồ mới để mở khóa thêm áo và quần cho tủ đồ mix & match.',
    rarity: 'EPIC',
    price: 7000,
    color: '#e58a55',
    unlockLevel: 3,
    slots: { top: 'top-long-buttoned', bottom: 'bottom-leggings2', shoes: 'shoes-revised-boots' },
  },
  {
    id: 'outfit-midnight-draped',
    name: 'Midnight Draped',
    description: 'Form rộng tối màu dành cho người thích phối đồ tối giản.',
    rarity: 'LEGENDARY',
    price: 9000,
    color: '#52617d',
    unlockLevel: 4,
    slots: { top: 'top-long-vneck', bottom: 'bottom-pantaloons', shoes: 'shoes-ghillies' },
  },
]

const LPC_ROOT = '/assets/avatar/lpc'

function assetSet(path: string): AvatarAssetSet {
  return {
    idle: `${LPC_ROOT}/${path}/idle.png`,
    walk: `${LPC_ROOT}/${path}/walk.png`,
    run: `${LPC_ROOT}/${path}/run.png`,
    slash: `${LPC_ROOT}/${path}/slash.png`,
    hurt: `${LPC_ROOT}/${path}/hurt.png`,
    shoot: `${LPC_ROOT}/${path}/shoot.png`,
    thrust: `${LPC_ROOT}/${path}/thrust.png`,
    sit: `${LPC_ROOT}/${path}/sit.png`,
  }
}

// The importer flattens the upstream shadow/adult folder to keep the public
// asset path consistent with the catalog layer folders.
export const LPC_SHADOW_ASSETS = assetSet('shadow')

function profiles(
  malePath: string,
  femalePath = malePath,
  teenPath = malePath,
  pregnantPath = femalePath,
): Partial<Record<AvatarBodyProfile, AvatarAssetSet>> {
  return {
    male: assetSet(malePath),
    female: assetSet(femalePath),
    teen: assetSet(teenPath),
    pregnant: assetSet(pregnantPath),
  }
}

/**
 * Shop imports put one profile-specific folder below each generated item.
 * Keeping this helper beside `profiles` makes it impossible for a generated
 * item to accidentally point all four body shapes at the first source sheet.
 */
function shopProfiles(sourcePath: string): Partial<Record<AvatarBodyProfile, AvatarAssetSet>> {
  return profiles(
    `${sourcePath}/male`,
    `${sourcePath}/female`,
    `${sourcePath}/teen`,
    `${sourcePath}/pregnant`,
  )
}

const bothProfiles: readonly AvatarBodyProfile[] = ['male', 'female']

export function getAvatarBaseBodyProfile(bodyProfile: AvatarBodyProfile): 'male' | 'female' {
  return bodyProfile === 'female' || bodyProfile === 'pregnant' ? 'female' : 'male'
}

/**
 * Body entries are exact silhouettes.  Clothing and equipment, on the other
 * hand, may legitimately reuse an adult sheet when LPC does not publish a
 * dedicated variant (for example, most hats).  Keeping that distinction here
 * means every consumer applies the same compatibility rule.
 */
export function avatarCatalogItemSupportsProfile(item: AvatarCatalogItem, bodyProfile: AvatarBodyProfile): boolean {
  if (item.slot === 'body') return item.supportedProfiles.includes(bodyProfile)
  const baseProfile = getAvatarBaseBodyProfile(bodyProfile)
  return item.supportedProfiles.includes(bodyProfile) || item.supportedProfiles.includes(baseProfile)
}

const SHOP_PALETTE: readonly string[] = [
  '#56a895',
  '#6f77bd',
  '#d26b63',
  '#e29a54',
  '#ae91ff',
  '#c8f267',
  '#4fa7a0',
  '#cf5f75',
  '#ffb86c',
  '#5d79b8',
]

function formatShopIndex(index: number): string {
  return String(index).padStart(3, '0')
}

function createGeneratedShopLayerItem(
  slot: AvatarWardrobeSlot,
  category: Exclude<AvatarShopCategory, 'SETS'>,
  index: number,
  sourcePath: string,
  labelPrefix: string,
): AvatarCatalogItem {
  const displayIndex = formatShopIndex(index)
  return {
    id: `shop-${slot}-${displayIndex}`,
    slot,
    label: `${labelPrefix} LPC ${displayIndex}`,
    description: `Mẫu ${labelPrefix.toLowerCase()} ${displayIndex} từ thư viện Universal LPC, có thể phối riêng trong tủ đồ.`,
    swatch: SHOP_PALETTE[(index - 1) % SHOP_PALETTE.length],
    supportedProfiles: bothProfiles,
    assets: shopProfiles(sourcePath),
  }
}

const GENERATED_TOP_ITEMS: readonly AvatarCatalogItem[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  return createGeneratedShopLayerItem('top', 'TOPS', index, `shop/top/${formatShopIndex(index)}`, 'Áo')
})

const GENERATED_BOTTOM_ITEMS: readonly AvatarCatalogItem[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  const sourceIndex = (offset % 34) + 1
  return createGeneratedShopLayerItem('bottom', 'BOTTOMS', index, `shop/bottom/${formatShopIndex(sourceIndex)}`, 'Quần')
})

const GENERATED_HAT_ITEMS: readonly AvatarCatalogItem[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  return createGeneratedShopLayerItem('hat', 'HEADWEAR', index, `shop/hat/${formatShopIndex(index)}`, 'Nón')
})

const GENERATED_SHOE_ITEMS: readonly AvatarCatalogItem[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  const sourceIndex = (offset % 34) + 1
  return createGeneratedShopLayerItem('shoes', 'FOOTWEAR', index, `shop/shoes/${formatShopIndex(sourceIndex)}`, 'Giày')
})

const ACCESSORY_SOURCE_GROUPS: readonly {
  slot: Extract<AvatarWardrobeSlot, 'neck' | 'arms' | 'shoulders'>
  folder: string
  count: number
}[] = [
  { slot: 'neck', folder: 'neck', count: 21 },
  { slot: 'arms', folder: 'arms', count: 12 },
  { slot: 'shoulders', folder: 'shoulders', count: 10 },
]

const ACCESSORY_SOURCE_COUNT = ACCESSORY_SOURCE_GROUPS.reduce((total, group) => total + group.count, 0)

function getAccessorySource(index: number): {
  slot: Extract<AvatarWardrobeSlot, 'neck' | 'arms' | 'shoulders'>
  path: string
} {
  let sourceIndex = (index - 1) % ACCESSORY_SOURCE_COUNT
  for (const group of ACCESSORY_SOURCE_GROUPS) {
    if (sourceIndex < group.count) {
      return {
        slot: group.slot,
        path: `shop/accessory/${group.folder}/${formatShopIndex(sourceIndex + 1)}`,
      }
    }
    sourceIndex -= group.count
  }
  return { slot: 'neck', path: 'shop/accessory/neck/001' }
}

const GENERATED_ACCESSORY_ITEMS: readonly AvatarCatalogItem[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  const source = getAccessorySource(index)
  return createGeneratedShopLayerItem(source.slot, 'ACCESSORIES', index, source.path, 'Phụ kiện')
})

const GENERATED_SHOP_LAYER_ITEMS: readonly AvatarCatalogItem[] = [
  ...GENERATED_TOP_ITEMS,
  ...GENERATED_BOTTOM_ITEMS,
  ...GENERATED_HAT_ITEMS,
  ...GENERATED_SHOE_ITEMS,
  ...GENERATED_ACCESSORY_ITEMS,
]

export const AVATAR_CATALOG: readonly AvatarCatalogItem[] = [
  {
    id: 'body-male',
    slot: 'body',
    label: 'Classic body',
    description: 'LPC adult base với dáng đứng cân đối.',
    swatch: '#5c8eb8',
    supportedProfiles: ['male'],
    assets: { male: assetSet('body/male') },
  },
  {
    id: 'body-female',
    slot: 'body',
    label: 'Soft body',
    description: 'LPC adult base với silhouette mềm hơn.',
    swatch: '#d18aa4',
    supportedProfiles: ['female'],
    assets: { female: assetSet('body/female') },
  },
  {
    id: 'body-teen',
    slot: 'body',
    label: 'Young silhouette',
    description: 'Dáng trẻ, nhỏ gọn với bộ sprite teen tương thích.',
    swatch: '#8bb6d2',
    supportedProfiles: ['teen'],
    assets: { teen: assetSet('body/teen') },
  },
  {
    id: 'body-pregnant',
    slot: 'body',
    label: 'Soft silhouette',
    description: 'Silhouette mềm với bụng bầu và bộ sprite riêng.',
    swatch: '#e8a8a1',
    supportedProfiles: ['pregnant'],
    assets: { pregnant: assetSet('body/pregnant') },
  },
  {
    id: 'face-human',
    slot: 'face',
    label: 'Human',
    description: 'Gương mặt human mặc định, cân với cả hai body.',
    swatch: '#f0c49b',
    supportedProfiles: bothProfiles,
    assets: profiles('head/male', 'head/female'),
  },
  {
    id: 'face-gaunt',
    slot: 'face',
    label: 'Gaunt',
    description: 'Gương mặt góc cạnh, cá tính hơn.',
    swatch: '#c79c78',
    supportedProfiles: ['male'],
    assets: { male: assetSet('head/male-gaunt') },
  },
  {
    id: 'face-small',
    slot: 'face',
    label: 'Small face',
    description: 'Gương mặt nhỏ, phong cách LPCR.',
    swatch: '#e2ad90',
    supportedProfiles: ['female'],
    assets: { female: assetSet('head/female-small') },
  },
  {
    id: 'face-elderly',
    slot: 'face',
    label: 'Elderly',
    description: 'Gương mặt trưởng thành với nét riêng rõ hơn.',
    swatch: '#e1ad8c',
    supportedProfiles: bothProfiles,
    assets: profiles('head/male-elderly', 'head/female-elderly'),
  },
  {
    id: 'face-plump',
    slot: 'face',
    label: 'Round face',
    description: 'Mặt tròn vui nhộn cho nhân vật nổi bật.',
    swatch: '#efbd97',
    supportedProfiles: ['male'],
    assets: { male: assetSet('head/male-plump') },
  },
  {
    id: 'face-small-male',
    slot: 'face',
    label: 'Small face',
    description: 'Gương mặt nhỏ, tạo cảm giác avatar trẻ hơn.',
    swatch: '#f0c19b',
    supportedProfiles: ['male'],
    assets: { male: assetSet('head/male-small') },
  },
  {
    id: 'feature-none',
    slot: 'feature',
    label: 'Không có',
    description: 'Giữ gương mặt nguyên bản, không thêm phụ kiện.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  {
    id: 'feature-glasses',
    slot: 'feature',
    label: 'Kính gọng vuông',
    description: 'Gọng kính pixel rõ, hợp phong cách studio.',
    swatch: '#6f8da9',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/glasses'),
  },
  {
    id: 'feature-round-glasses',
    slot: 'feature',
    label: 'Kính tròn',
    description: 'Kính tròn tạo điểm nhấn thân thiện và dễ nhận diện.',
    swatch: '#a77d53',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/round-glasses'),
  },
  {
    id: 'feature-nerd-glasses',
    slot: 'feature',
    label: 'Kính học giả',
    description: 'Gọng kính dày cho một diện mạo khác biệt.',
    swatch: '#45536d',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/nerd-glasses'),
  },
  {
    id: 'feature-shades',
    slot: 'feature',
    label: 'Kính râm',
    description: 'Phụ kiện cá tính cho khu social và sảnh game.',
    swatch: '#2c3544',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/shades'),
  },
  {
    id: 'feature-eyepatch',
    slot: 'feature',
    label: 'Bịt mắt',
    description: 'Dấu ấn phiêu lưu, nổi bật từ xa trên map.',
    swatch: '#5e3d50',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/eyepatch'),
  },
  {
    id: 'feature-beard',
    slot: 'feature',
    label: 'Râu đầy',
    description: 'Râu dày tạo silhouette trưởng thành.',
    swatch: '#72503b',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/beard'),
  },
  {
    id: 'feature-medium-beard',
    slot: 'feature',
    label: 'Râu vừa',
    description: 'Râu vừa phải, dễ phối với nhiều kiểu tóc.',
    swatch: '#8b6045',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/medium-beard'),
  },
  {
    id: 'feature-trimmed-beard',
    slot: 'feature',
    label: 'Râu gọn',
    description: 'Râu tỉa gọn cho diện mạo công sở.',
    swatch: '#65483a',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/trimmed-beard'),
  },
  {
    id: 'feature-five-oclock',
    slot: 'feature',
    label: 'Râu lún phún',
    description: 'Một lớp râu nhẹ để tạo nét riêng tinh tế.',
    swatch: '#4e3d38',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/five-oclock'),
  },
  {
    id: 'feature-mustache',
    slot: 'feature',
    label: 'Ria mép',
    description: 'Ria mép pixel vui mắt và dễ nhận diện.',
    swatch: '#79563f',
    supportedProfiles: bothProfiles,
    assets: profiles('feature/mustache'),
  },
  {
    id: 'hair-plain',
    slot: 'hair',
    label: 'Plain hair',
    description: 'Tóc ngắn gọn, dễ đọc khi di chuyển.',
    swatch: '#7d4c34',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/plain', 'hair/plain'),
  },
  {
    id: 'hair-bob',
    slot: 'hair',
    label: 'Bob cut',
    description: 'Tóc bob pixel mềm và rõ form.',
    swatch: '#b36d47',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/bob', 'hair/bob'),
  },
  {
    id: 'hair-messy',
    slot: 'hair',
    label: 'Messy',
    description: 'Tóc rối năng động cho avatar game.',
    swatch: '#46362f',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/messy2', 'hair/messy2'),
  },
  {
    id: 'hair-pixie',
    slot: 'hair',
    label: 'Pixie',
    description: 'Tóc pixie gọn, nổi bật silhouette.',
    swatch: '#d09b58',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/pixie', 'hair/pixie'),
  },
  {
    id: 'hair-afro',
    slot: 'hair',
    label: 'Afro',
    description: 'Tóc afro tròn, silhouette rất dễ nhận diện.',
    swatch: '#d57621',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/afro', 'hair/afro'),
  },
  {
    id: 'hair-bangs',
    slot: 'hair',
    label: 'Bangs',
    description: 'Tóc mái gọn, hợp phong cách casual.',
    swatch: '#8c542f',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/bangs', 'hair/bangs'),
  },
  {
    id: 'hair-bedhead',
    slot: 'hair',
    label: 'Bedhead',
    description: 'Tóc rối tự nhiên, trông năng động khi chạy.',
    swatch: '#5a392b',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/bedhead', 'hair/bedhead'),
  },
  {
    id: 'hair-bob-side-part',
    slot: 'hair',
    label: 'Side-part bob',
    description: 'Bob rẽ ngôi với khối tóc rõ ở hai bên.',
    swatch: '#a25a3e',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/bob-side-part', 'hair/bob-side-part'),
  },
  {
    id: 'hair-buzzcut',
    slot: 'hair',
    label: 'Buzz cut',
    description: 'Tóc húi ngắn, gọn và mạnh mẽ.',
    swatch: '#4a342b',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/buzzcut', 'hair/buzzcut'),
  },
  {
    id: 'hair-cornrows',
    slot: 'hair',
    label: 'Cornrows',
    description: 'Tóc tết sát đầu với texture pixel đặc trưng.',
    swatch: '#563425',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/cornrows', 'hair/cornrows'),
  },
  {
    id: 'hair-curly-long',
    slot: 'hair',
    label: 'Long curls',
    description: 'Tóc xoăn dài có chuyển động rõ khi đi.',
    swatch: '#b96931',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/curly-long', 'hair/curly-long'),
  },
  {
    id: 'hair-curly-short',
    slot: 'hair',
    label: 'Short curls',
    description: 'Tóc xoăn ngắn, gọn và có texture.',
    swatch: '#6c412d',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/curly-short', 'hair/curly-short'),
  },
  {
    id: 'hair-curtains',
    slot: 'hair',
    label: 'Curtains',
    description: 'Tóc curtain rẽ giữa cho dáng hiện đại.',
    swatch: '#d28136',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/curtains', 'hair/curtains'),
  },
  {
    id: 'hair-dreadlocks',
    slot: 'hair',
    label: 'Dreadlocks',
    description: 'Tóc dreadlocks dài, tạo hình khác biệt.',
    swatch: '#8c4b2b',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/dreadlocks-long', 'hair/dreadlocks-long'),
  },
  {
    id: 'hair-long',
    slot: 'hair',
    label: 'Long hair',
    description: 'Tóc dài rủ sau vai, nổi bật theo hướng di chuyển.',
    swatch: '#b45a39',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/long', 'hair/long'),
  },
  {
    id: 'hair-long-messy',
    slot: 'hair',
    label: 'Long messy',
    description: 'Tóc dài rối với cảm giác phiêu lưu.',
    swatch: '#5c3c34',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/long-messy', 'hair/long-messy'),
  },
  {
    id: 'hair-mop',
    slot: 'hair',
    label: 'Mop top',
    description: 'Mái dày mềm, hợp nhân vật trẻ.',
    swatch: '#713e2d',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/mop', 'hair/mop'),
  },
  {
    id: 'hair-flat-top',
    slot: 'hair',
    label: 'Flat top fade',
    description: 'Tóc fade góc cạnh cho avatar cá tính.',
    swatch: '#3f302d',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/flat-top-fade', 'hair/flat-top-fade'),
  },
  {
    id: 'hair-half-up',
    slot: 'hair',
    label: 'Half-up',
    description: 'Tóc buộc nửa đầu với silhouette gọn.',
    swatch: '#96573d',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/half-up', 'hair/half-up'),
  },
  {
    id: 'hair-pigtails',
    slot: 'hair',
    label: 'Tóc buộc hai bên',
    description: 'Hai lọn tóc chuyển động rõ khi nhân vật chạy.',
    swatch: '#b56c43',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/pigtails', 'hair/pigtails'),
  },
  {
    id: 'hair-spiked',
    slot: 'hair',
    label: 'Tóc dựng',
    description: 'Tóc dựng góc cạnh cho avatar nổi bật.',
    swatch: '#4c3b35',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/spiked', 'hair/spiked'),
  },
  {
    id: 'hair-bangs-bun',
    slot: 'hair',
    label: 'Mái búi',
    description: 'Tóc mái kết hợp búi gọn, đọc tốt trên map.',
    swatch: '#92543c',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/bangs-bun', 'hair/bangs-bun'),
  },
  {
    id: 'hair-loose',
    slot: 'hair',
    label: 'Tóc xoã',
    description: 'Tóc xoã tự nhiên với silhouette mềm.',
    swatch: '#73452f',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/loose', 'hair/loose'),
  },
  {
    id: 'hair-jewfro',
    slot: 'hair',
    label: 'Tóc xoăn phồng',
    description: 'Khối tóc xoăn lớn tạo điểm nhấn mạnh.',
    swatch: '#563729',
    supportedProfiles: bothProfiles,
    assets: profiles('hair/jewfro', 'hair/jewfro'),
  },
  {
    id: 'top-tshirt',
    slot: 'top',
    label: 'T-shirt',
    description: 'Áo thun cơ bản cho đời sống trong hub.',
    swatch: '#56a895',
    supportedProfiles: bothProfiles,
    assets: profiles('top/tshirt/male', 'top/tshirt/female', 'top/tshirt/teen', 'top/tshirt/female'),
  },
  {
    id: 'top-longsleeve',
    slot: 'top',
    label: 'Long sleeve',
    description: 'Áo dài tay với form rõ ràng.',
    swatch: '#6f77bd',
    supportedProfiles: bothProfiles,
    assets: profiles('top/longsleeve/male', 'top/longsleeve/female', 'top/longsleeve/teen', 'top/longsleeve/pregnant'),
  },
  {
    id: 'top-vneck',
    slot: 'top',
    label: 'V-neck',
    description: 'Áo cổ V nhẹ, tạo điểm nhấn thân trên.',
    swatch: '#d26b63',
    supportedProfiles: bothProfiles,
    assets: profiles('top/vneck/male', 'top/vneck/female', 'top/vneck/teen', 'top/vneck/female'),
  },
  {
    id: 'top-polo',
    slot: 'top',
    label: 'Polo shirt',
    description: 'Áo polo gọn gàng, hợp khu vực social.',
    swatch: '#e29a54',
    supportedProfiles: bothProfiles,
    assets: profiles('top/polo/male', 'top/polo/female', 'top/polo/teen', 'top/polo/female'),
  },
  {
    id: 'top-cardigan',
    slot: 'top',
    label: 'Cardigan',
    description: 'Áo cardigan thêm khối layer cho outfit.',
    swatch: '#a077bd',
    supportedProfiles: bothProfiles,
    assets: profiles('top/cardigan/male', 'top/cardigan/female', 'top/cardigan/teen', 'top/cardigan/female'),
  },
  {
    id: 'top-buttoned',
    slot: 'top',
    label: 'Buttoned tee',
    description: 'Áo cài nút với chi tiết pixel rõ.',
    swatch: '#6eb8ca',
    supportedProfiles: bothProfiles,
    assets: profiles('top/buttoned/male', 'top/buttoned/female', 'top/buttoned/teen', 'top/buttoned/female'),
  },
  {
    id: 'top-scoop',
    slot: 'top',
    label: 'Scoop neck',
    description: 'Cổ scoop đơn giản, nhẹ hơn áo dài tay.',
    swatch: '#d87578',
    supportedProfiles: bothProfiles,
    assets: profiles('top/scoop/male', 'top/scoop/female', 'top/scoop/teen', 'top/scoop/female'),
  },
  {
    id: 'top-long-polo',
    slot: 'top',
    label: 'Long polo',
    description: 'Polo dài tay cho outfit chỉn chu.',
    swatch: '#5d79b8',
    supportedProfiles: bothProfiles,
    assets: profiles('top/long-polo/male', 'top/long-polo/female', 'top/long-polo/teen', 'top/long-polo/female'),
  },
  {
    id: 'top-long-cardigan',
    slot: 'top',
    label: 'Long cardigan',
    description: 'Cardigan dài tay tạo lớp áo nổi bật.',
    swatch: '#6d936f',
    supportedProfiles: bothProfiles,
    assets: profiles('top/long-cardigan/male', 'top/long-cardigan/female', 'top/long-cardigan/teen', 'top/long-cardigan/female'),
  },
  {
    id: 'top-sleeveless',
    slot: 'top',
    label: 'Sleeveless',
    description: 'Áo sát nách thoáng cho khu social.',
    swatch: '#d99c63',
    supportedProfiles: bothProfiles,
    assets: profiles('top/sleeveless/male', 'top/sleeveless/female', 'top/sleeveless/teen', 'top/sleeveless/female'),
  },
  {
    id: 'top-long-buttoned',
    slot: 'top',
    label: 'Long buttoned',
    description: 'Áo dài tay cài nút từ source LPC, hợp phong cách creative formal.',
    swatch: '#c47f70',
    supportedProfiles: bothProfiles,
    assets: profiles('top/long-buttoned/male', 'top/long-buttoned/female', 'top/long-buttoned/teen', 'top/long-buttoned/female'),
  },
  {
    id: 'top-long-vneck',
    slot: 'top',
    label: 'Long V-neck',
    description: 'Áo cổ V dài tay, silhouette mới rõ ở cả bốn hướng.',
    swatch: '#7976c7',
    supportedProfiles: bothProfiles,
    assets: profiles('top/long-vneck/male', 'top/long-vneck/female', 'top/long-vneck/teen', 'top/long-vneck/female'),
  },
  {
    id: 'top-relaxed-shirt',
    slot: 'top',
    label: 'Relaxed shirt',
    description: 'Áo tay ngắn form rộng lấy trực tiếp từ thư viện LPC.',
    swatch: '#4fa7a0',
    supportedProfiles: bothProfiles,
    assets: profiles('top/relaxed-shirt/male', 'top/relaxed-shirt/female', 'top/relaxed-shirt/teen', 'top/relaxed-shirt/female'),
  },
  {
    id: 'top-sleeveless-buttoned',
    slot: 'top',
    label: 'Buttoned tank',
    description: 'Áo sát nách cài nút, tạo lựa chọn nổi bật hơn cho shop.',
    swatch: '#cf5f75',
    supportedProfiles: bothProfiles,
    assets: profiles('top/sleeveless-buttoned/male', 'top/sleeveless-buttoned/female', 'top/sleeveless-buttoned/teen', 'top/sleeveless-buttoned/female'),
  },
  {
    id: 'bottom-pants',
    slot: 'bottom',
    label: 'Pants',
    description: 'Quần dài cân đối với base adult.',
    swatch: '#3c496e',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/pants/male', 'bottom/pants/female', 'bottom/pants/teen', 'bottom/pants/pregnant'),
  },
  {
    id: 'bottom-shorts',
    slot: 'bottom',
    label: 'Shorts',
    description: 'Quần short cho phong cách casual.',
    swatch: '#9b714b',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/shorts/male', 'bottom/shorts/female', 'bottom/shorts/teen', 'bottom/shorts/pregnant'),
  },
  {
    id: 'bottom-formal',
    slot: 'bottom',
    label: 'Formal pants',
    description: 'Quần formal cho outfit gọn gàng.',
    swatch: '#635b61',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/formal/male', 'bottom/formal/female', 'bottom/formal/teen', 'bottom/formal/pregnant'),
  },
  {
    id: 'bottom-cuffed',
    slot: 'bottom',
    label: 'Cuffed pants',
    description: 'Quần xắn gấu tạo điểm nhấn ở chân.',
    swatch: '#657a91',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/cuffed/male', 'bottom/cuffed/female', 'bottom/cuffed/teen', 'bottom/cuffed/pregnant'),
  },
  {
    id: 'bottom-pants2',
    slot: 'bottom',
    label: 'Wide pants',
    description: 'Quần dài form rộng hơn, silhouette khác biệt.',
    swatch: '#4d5c7c',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/pants2/male', 'bottom/pants2/female', 'bottom/pants2/teen', 'bottom/pants2/pregnant'),
  },
  {
    id: 'bottom-formal-striped',
    slot: 'bottom',
    label: 'Striped formal',
    description: 'Quần formal có sọc nhẹ, hợp avatar công sở.',
    swatch: '#756c7a',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/formal-striped/male', 'bottom/formal-striped/female', 'bottom/formal-striped/teen', 'bottom/formal-striped/pregnant'),
  },
  {
    id: 'bottom-leggings',
    slot: 'bottom',
    label: 'Leggings',
    description: 'Quần ôm gọn cho outfit thể thao.',
    swatch: '#393d68',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/leggings/male', 'bottom/leggings/female', 'bottom/leggings/teen', 'bottom/leggings/pregnant'),
  },
  {
    id: 'bottom-short-shorts',
    slot: 'bottom',
    label: 'Short shorts',
    description: 'Quần short ngắn, tạo dáng trẻ trung.',
    swatch: '#9b714b',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/short-shorts/male', 'bottom/short-shorts/female', 'bottom/short-shorts/teen', 'bottom/short-shorts/pregnant'),
  },
  {
    id: 'bottom-pantaloons',
    slot: 'bottom',
    label: 'Pantaloons',
    description: 'Quần ống rộng có nếp, tạo silhouette khác hẳn quần cơ bản.',
    swatch: '#52617d',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/pantaloons/male', 'bottom/pantaloons/female', 'bottom/pantaloons/teen', 'bottom/pantaloons/pregnant'),
  },
  {
    id: 'bottom-leggings2',
    slot: 'bottom',
    label: 'Panel leggings',
    description: 'Leggings biến thể với mảng pixel rõ hơn khi chạy.',
    swatch: '#4b466f',
    supportedProfiles: bothProfiles,
    assets: profiles('bottom/leggings2/male', 'bottom/leggings2/female', 'bottom/leggings2/teen', 'bottom/leggings2/pregnant'),
  },
  {
    id: 'shoes-basic',
    slot: 'shoes',
    label: 'Basic shoes',
    description: 'Giày cơ bản phù hợp mọi outfit.',
    swatch: '#715846',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/basic/male', 'shoes/basic/female', 'shoes/basic/teen', 'shoes/basic/pregnant'),
  },
  {
    id: 'shoes-boots',
    slot: 'shoes',
    label: 'Boots',
    description: 'Boots chắc chân với viền pixel rõ.',
    swatch: '#533d35',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/boots/male', 'shoes/boots/female', 'shoes/boots/teen', 'shoes/boots/pregnant'),
  },
  {
    id: 'shoes-sandals',
    slot: 'shoes',
    label: 'Sandals',
    description: 'Sandal nhẹ cho khu vực social.',
    swatch: '#c09262',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/sandals/male', 'shoes/sandals/female', 'shoes/sandals/teen', 'shoes/sandals/pregnant'),
  },
  {
    id: 'shoes-fold-boots',
    slot: 'shoes',
    label: 'Fold boots',
    description: 'Boots gập cổ, tăng chất phiêu lưu.',
    swatch: '#76513b',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/fold-boots/male', 'shoes/fold-boots/female', 'shoes/fold-boots/teen', 'shoes/fold-boots/pregnant'),
  },
  {
    id: 'shoes-revised-boots',
    slot: 'shoes',
    label: 'Rim boots',
    description: 'Boots viền đậm, đọc tốt trên nền map.',
    swatch: '#493b40',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/revised-boots/male', 'shoes/revised-boots/female', 'shoes/revised-boots/teen', 'shoes/revised-boots/pregnant'),
  },
  {
    id: 'shoes-revised',
    slot: 'shoes',
    label: 'Revised shoes',
    description: 'Giày form mới với mũi rõ hơn.',
    swatch: '#88705d',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/revised/male', 'shoes/revised/female', 'shoes/revised/teen', 'shoes/revised/pregnant'),
  },
  {
    id: 'shoes-ghillies',
    slot: 'shoes',
    label: 'Ghillies',
    description: 'Giày dây chéo cho phong cách fantasy nhẹ.',
    swatch: '#5d493d',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/ghillies/male', 'shoes/ghillies/female', 'shoes/ghillies/teen', 'shoes/ghillies/pregnant'),
  },
  {
    id: 'shoes-slippers',
    slot: 'shoes',
    label: 'Slippers',
    description: 'Dép đi trong nhà cho khu lounge.',
    swatch: '#c58276',
    supportedProfiles: bothProfiles,
    assets: profiles('shoes/slippers/male', 'shoes/slippers/female', 'shoes/slippers/teen', 'shoes/slippers/pregnant'),
  },
  {
    id: 'weapon-none',
    slot: 'weapon',
    label: 'No weapon',
    description: 'Để tay trống trong sảnh.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  {
    id: 'weapon-saber',
    slot: 'weapon',
    label: 'Saber',
    description: 'Kiếm saber LPC, hiện rõ khi walk/attack.',
    swatch: '#d9d5cb',
    supportedProfiles: bothProfiles,
    assets: profiles('weapon/saber', 'weapon/saber'),
  },
  {
    id: 'hat-none',
    slot: 'hat',
    label: 'Không đội nón',
    description: 'Để đầu trống trong tủ đồ.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  {
    id: 'neck-none',
    slot: 'neck',
    label: 'Không có phụ kiện cổ',
    description: 'Không thêm layer ở cổ.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  {
    id: 'arms-none',
    slot: 'arms',
    label: 'Không có phụ kiện tay',
    description: 'Không thêm layer ở tay.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  {
    id: 'shoulders-none',
    slot: 'shoulders',
    label: 'Không có phụ kiện vai',
    description: 'Không thêm layer ở vai.',
    swatch: '#718095',
    supportedProfiles: bothProfiles,
    assets: {},
  },
  ...GENERATED_SHOP_LAYER_ITEMS,
]

function getShopRarity(index: number): AvatarOutfitRarity {
  if (index <= 50) return 'COMMON'
  if (index <= 80) return 'RARE'
  if (index <= 95) return 'EPIC'
  return 'LEGENDARY'
}

function getShopCategory(slot: AvatarWardrobeSlot): Exclude<AvatarShopCategory, 'SETS'> {
  if (slot === 'top') return 'TOPS'
  if (slot === 'bottom') return 'BOTTOMS'
  if (slot === 'hat') return 'HEADWEAR'
  if (slot === 'shoes') return 'FOOTWEAR'
  return 'ACCESSORIES'
}

function createWardrobeDefinition(item: AvatarCatalogItem, index: number): AvatarWardrobeDefinition {
  const slot = item.slot as AvatarWardrobeSlot
  const category = getShopCategory(slot)
  const slots: Pick<CharacterSlots, 'top' | 'bottom' | 'shoes'> = {
    top: 'top-tshirt',
    bottom: 'bottom-pants',
    shoes: 'shoes-basic',
  }
  if (slot === 'top' || slot === 'bottom' || slot === 'shoes') slots[slot] = item.id
  return {
    id: `wardrobe-${category.toLowerCase()}-${formatShopIndex(index)}`,
    name: item.label,
    description: item.description,
    category,
    slot,
    itemId: item.id,
    rarity: getShopRarity(((index - 1) % 100) + 1),
    price: 650 + (((index - 1) % 10) * 125),
    color: item.swatch,
    unlockLevel: index > 80 ? 3 : index > 50 ? 2 : 1,
    slots,
  }
}

export const AVATAR_WARDROBE_ITEMS: readonly AvatarWardrobeDefinition[] = GENERATED_SHOP_LAYER_ITEMS.map((item, index) => {
  const categoryIndex = (index % 100) + 1
  return createWardrobeDefinition(item, categoryIndex)
})

const GENERATED_OUTFIT_BUNDLES: readonly AvatarOutfitDefinition[] = Array.from({ length: 100 }, (_, offset) => {
  const index = offset + 1
  const displayIndex = formatShopIndex(index)
  return {
    id: `outfit-collection-${displayIndex}`,
    name: `LPC Collection ${displayIndex}`,
    description: `Bộ phối ${displayIndex} kết hợp ba món từ tủ đồ Universal LPC.`,
    rarity: getShopRarity(index),
    price: 2200 + ((index - 1) % 10) * 250,
    color: SHOP_PALETTE[offset % SHOP_PALETTE.length],
    unlockLevel: index > 80 ? 3 : index > 50 ? 2 : 1,
    slots: {
      top: `shop-top-${displayIndex}`,
      bottom: `shop-bottom-${displayIndex}`,
      shoes: `shop-shoes-${displayIndex}`,
    },
  }
})

export const AVATAR_OUTFIT_BUNDLES: readonly AvatarOutfitDefinition[] = [
  ...CURATED_OUTFIT_BUNDLES,
  ...GENERATED_OUTFIT_BUNDLES,
]

export function getAvatarOutfitDefinition(id?: string): AvatarOutfitDefinition | undefined {
  return AVATAR_OUTFIT_BUNDLES.find((outfit) => outfit.id === id)
}

export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  version: AVATAR_CONFIG_VERSION,
  bodyProfile: 'male',
  slots: {
    body: 'body-male',
    face: 'face-human',
    hair: 'hair-messy',
    feature: 'feature-none',
    top: 'top-tshirt',
    bottom: 'bottom-pants',
    shoes: 'shoes-basic',
    hat: 'hat-none',
    neck: 'neck-none',
    arms: 'arms-none',
    shoulders: 'shoulders-none',
    weapon: 'weapon-none',
  },
}

export function cloneCharacterConfig(config: CharacterConfig): CharacterConfig {
  return {
    version: config.version,
    bodyProfile: config.bodyProfile,
    slots: {
      ...config.slots,
      feature: config.slots.feature || 'feature-none',
      hat: config.slots.hat || 'hat-none',
      neck: config.slots.neck || 'neck-none',
      arms: config.slots.arms || 'arms-none',
      shoulders: config.slots.shoulders || 'shoulders-none',
    },
  }
}

export function getAvatarCatalogItem(id: string, slot?: AvatarSlot): AvatarCatalogItem | undefined {
  return AVATAR_CATALOG.find((item) => item.id === id && (!slot || item.slot === slot))
}

export function getAvatarCatalogItems(slot: AvatarSlot, bodyProfile: AvatarBodyProfile): AvatarCatalogItem[] {
  // The body tab is a gender/shape picker: keep the adult and matching
  // alternate silhouette together even after the alternate is selected. The
  // active shape is sorted first so normalization also chooses the correct
  // exact body instead of silently falling back to an adult sprite.
  if (slot === 'body') {
    const shapeProfiles: readonly AvatarBodyProfile[] = bodyProfile === 'teen'
      ? ['teen', 'male']
      : bodyProfile === 'pregnant'
        ? ['pregnant', 'female']
        : bodyProfile === 'female'
          ? ['female', 'pregnant']
          : ['male', 'teen']
    return AVATAR_CATALOG
      .filter((item) => item.slot === slot && shapeProfiles.some((profile) => item.supportedProfiles.includes(profile)))
      .sort((left, right) => (
        shapeProfiles.findIndex((profile) => left.supportedProfiles.includes(profile)) -
        shapeProfiles.findIndex((profile) => right.supportedProfiles.includes(profile))
      ))
  }
  return AVATAR_CATALOG.filter((item) => item.slot === slot && avatarCatalogItemSupportsProfile(item, bodyProfile))
}

export function getAvatarAssetSet(item: AvatarCatalogItem | undefined, bodyProfile: AvatarBodyProfile): AvatarAssetSet | undefined {
  if (!item) return undefined
  const baseProfile = getAvatarBaseBodyProfile(bodyProfile)
  return item.assets[bodyProfile] || item.assets[baseProfile]
}

export function getAvatarAssetPath(item: AvatarCatalogItem | undefined, bodyProfile: AvatarBodyProfile, animation: AvatarAnimation): string | undefined {
  const assets = getAvatarAssetSet(item, bodyProfile)
  return assets?.[animation] || assets?.idle
}

export function getAvatarAssetKey(path: string): string {
  return `lpc_${path.replace(/^\/assets\/avatar\/lpc\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`
}

export function characterConfigFromLegacyAvatar(avatarKey?: StudioAvatarKey): CharacterConfig {
  const config = cloneCharacterConfig(DEFAULT_CHARACTER_CONFIG)
  if (avatarKey === 'lucy' || avatarKey === 'nancy') {
    config.bodyProfile = 'female'
    config.slots.body = 'body-female'
    config.slots.face = 'face-human'
    config.slots.hair = avatarKey === 'nancy' ? 'hair-bob' : 'hair-plain'
    config.slots.top = 'top-vneck'
  } else if (avatarKey === 'ash') {
    config.slots.hair = 'hair-plain'
    config.slots.top = 'top-longsleeve'
  }
  return config
}

export function characterConfigToLegacyAvatar(config: CharacterConfig): StudioAvatarKey {
  if (getAvatarBaseBodyProfile(config.bodyProfile) === 'female') return config.slots.hair === 'hair-bob' ? 'nancy' : 'lucy'
  return config.slots.top === 'top-longsleeve' ? 'ash' : 'adam'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeCharacterConfig(input: unknown, legacyAvatar?: StudioAvatarKey): CharacterConfig {
  const fallback = characterConfigFromLegacyAvatar(legacyAvatar)
  if (!isRecord(input)) return fallback
  const bodyProfile: AvatarBodyProfile = input.bodyProfile === 'female'
    ? 'female'
    : input.bodyProfile === 'teen'
      ? 'teen'
      : input.bodyProfile === 'pregnant'
        ? 'pregnant'
        : input.bodyProfile === 'male'
          ? 'male'
          : fallback.bodyProfile
  const rawSlots = isRecord(input.slots) ? input.slots : {}
  const slots = { ...fallback.slots }
  ;(['body', 'face', 'hair', 'feature', 'top', 'bottom', 'shoes', 'hat', 'neck', 'arms', 'shoulders', 'weapon'] as AvatarSlot[]).forEach((slot) => {
    const itemId = typeof rawSlots[slot] === 'string' ? rawSlots[slot] as string : ''
    const item = getAvatarCatalogItem(itemId, slot)
    if (item && avatarCatalogItemSupportsProfile(item, bodyProfile)) slots[slot] = item.id
  })
  const bodyItem = getAvatarCatalogItem(slots.body, 'body')
  if (!bodyItem || !avatarCatalogItemSupportsProfile(bodyItem, bodyProfile)) {
    slots.body = getAvatarCatalogItems('body', bodyProfile)[0]?.id || (getAvatarBaseBodyProfile(bodyProfile) === 'female' ? 'body-female' : 'body-male')
  }
  return { version: AVATAR_CONFIG_VERSION, bodyProfile, slots }
}

export function isCharacterConfig(value: unknown): value is CharacterConfig {
  if (!isRecord(value) || value.version !== AVATAR_CONFIG_VERSION || !['male', 'female', 'teen', 'pregnant'].includes(value.bodyProfile as string)) return false
  const slots = value.slots
  if (!isRecord(slots)) return false
  const requiredSlots = ['body', 'face', 'hair', 'top', 'bottom', 'shoes', 'weapon'] as AvatarSlot[]
  const requiredSlotsValid = requiredSlots.every((slot) => {
    const item = getAvatarCatalogItem(String(slots[slot] || ''), slot)
    return Boolean(item && avatarCatalogItemSupportsProfile(item, value.bodyProfile as AvatarBodyProfile))
  })
  if (!requiredSlotsValid) return false
  const optionalSlots = ['feature', 'hat', 'neck', 'arms', 'shoulders'] as AvatarSlot[]
  return optionalSlots.every((slot) => {
    if (typeof slots[slot] === 'undefined') return true
    const item = getAvatarCatalogItem(String(slots[slot] || ''), slot)
    return Boolean(item && avatarCatalogItemSupportsProfile(item, value.bodyProfile as AvatarBodyProfile))
  })
}
