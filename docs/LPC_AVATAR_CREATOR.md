# LPC avatar creator

SkyOffice now stores the character appearance as a versioned `CharacterConfig` and renders it as composable 64×64 LPC layers. The creator is shown the first time a member enters a room without a saved `characterConfig`.

The curated creator catalog currently contains four LPC body profiles (adult
male, adult female, teen and pregnant), six face silhouettes, 24 hairstyles
and 10 distinctive feature layers (glasses, eyepatch, beard and moustache).
The shop adds 500 individual LPC wardrobe
products: 100 tops, 100 bottoms, 100 hats, 100 shoes and 100 accessories,
plus 100 generated mix-and-match sets and the original curated bundles. The
smaller upstream legs, feet and accessory groups are safely expanded with
different catalog color variants; each SKU still renders a real imported LPC
sheet. Every selectable sheet is imported only after confirming it has a
usable runtime action sheet, with idle used as the fallback for an action that
the source layer does not provide.

## Data flow

1. `types/Avatar.ts` owns the catalog, slot schema, defaults, legacy avatar migration and validation.
2. `AvatarCreator` lets the player choose a gender/body profile, face, hair, distinctive feature and weapon, then apply one of three starter outfit presets. Body changes automatically reconcile incompatible layers and keep teen/pregnant silhouettes on the matching LPC clothing sheets.
3. `LpcAvatarPreview` draws the selected layers to a pixelated canvas and previews idle, walk, run, slash and hurt animations from four directions.
4. `LoginDialog` saves the normalized config through `PATCH /api/auth/profile` together with the legacy `avatarKey` used by older clients.
5. The room stores the config in `characterConfigJson`. A live `UPDATE_PLAYER_CHARACTER_CONFIG` message updates the Colyseus schema so other clients rebuild the same avatar.
6. `LpcLayeredCharacterRenderer` is attached to the existing Phaser `Player`; the legacy 32×48 sprite remains as a fallback for players without a config.

## Outfit shop

`AVATAR_OUTFIT_BUNDLES` in `types/Avatar.ts` remains the shared source of
truth for complete sets. `AVATAR_WARDROBE_ITEMS` is the source of truth for
single-layer products and assigns each product to one of the shop tabs:
`TOPS`, `BOTTOMS`, `HEADWEAR`, `FOOTWEAR` or `ACCESSORIES`. Both definitions
reference catalog IDs instead of copying image paths, so a product can be
previewed in `StorePanel`, shown in `InventoryPanel` and rendered in Phaser
with exactly the same layers as the Avatar Creator.

`server/studio/config.ts` exposes both sets and single-layer products as
`OUTFIT` social cosmetics. Purchase still uses the existing Coin wallet ledger
and the idempotency key `purchase:{userId}:{itemId}`. `PATCH
/api/social/loadout` validates ownership, applies a complete set or a single
selected layer (`topId`, `bottomId`, `shoesId`, `hatId`, `neckId`, `armsId`,
`shouldersId`) to the saved `characterConfig`, derives the legacy `avatarKey`,
and persists the loadout. The client then refreshes the auth user and sends
the normal character-config realtime update, so the change is immediately
visible to the whole room. Equipping one product never overwrites unrelated
layers; `outfitId` is cleared when the resulting combination is no longer one
of the owned complete sets.

The inventory keeps utility items and owned wardrobe products together. They
are non-tradeable, persistent ownership records; they do not create a new
currency or a new permission role. The catalog can grow by importing valid
layer sheets, registering their IDs in `AVATAR_CATALOG`, and composing them in
`AVATAR_OUTFIT_BUNDLES` or `AVATAR_WARDROBE_ITEMS` without changing the saved
character schema. The catalog UI includes search, per-tab counts and a
scrollable grid so all 100 products in a category remain discoverable on
desktop and mobile.

## Movement rendering

The legacy Arcade sprite remains the authoritative collision body. The layered
LPC visual and the name/dialog container are presentation-only: they sync during
the Scene `POST_UPDATE` phase, after Arcade has resolved collisions, and snap to
integer world pixels. The game camera uses an integer zoom and rounded follow
pixels as well, preventing the half-pixel shimmer that was visible with the
previous fractional zoom.

## Adding assets

The runtime bundle contains the curated creator sheets plus the indexed shop
subset under `client/public/assets/avatar/lpc`. To re-import it after changing
the catalog, clone the upstream generator into `external/universal-lpc` and
run:

```sh
./scripts/import-lpc-avatar-assets.sh
```

The importer copies the first 100 sorted source layers from `torso` and `hat`,
34 from `legs` and `feet`, and the available `neck`, `arms` and `shoulders`
groups into the indexed `shop/<category>/<index>/<body-profile>/` paths used
by the shared catalog. Each indexed product receives the closest available
`male`, `female`, `teen` and `pregnant` source variant, so changing the body
shape cannot accidentally reuse the first adult sheet. It expects
the action sheets `idle`, `walk`, `run`, `slash`, `hurt`, `shoot`, `thrust`
and `sit`; if an optional action is absent, that layer's `idle.png` is copied
to the missing action path. It deliberately does not package the complete
generator repository into the web build. After importing,
`repair-lpc-bottom-coverage.py` fills only transparent lower-leg pixels where
the body would otherwise leak through between long trousers and boots. Shorts
and short-shorts are excluded so their exposed-leg silhouette remains
intentional.

The upstream commit and selected source paths are recorded in `data/lpc_asset_credits.json`. The upstream `CREDITS.csv` is the canonical per-file attribution and license record; preserve those notices when adding or redistributing more layers.

## Compatibility

Legacy `adam`, `ash`, `lucy` and `nancy` values are mapped into an equivalent LPC configuration. Existing users can therefore enter the world before migration, while the next profile save persists the new modular appearance. `CharacterConfig.version` is reserved for future catalog migrations.
