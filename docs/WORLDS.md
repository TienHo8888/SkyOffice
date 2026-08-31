# Destination worlds

SkyOffice has two destination worlds in addition to the existing public office
room. The world boundary is explicit in both the client and the server:

| Destination | Phaser scene | Colyseus room | Access model |
| --- | --- | --- | --- |
| Main SkyOffice | `Game` | `RoomType.PUBLIC` | Existing office behavior |
| Riverbend Fishing | `FishingWorldScene` | `RoomType.FISHING` | Any authenticated user in the studio |
| Player Home | `HomeWorldScene` | `RoomType.HOME` filtered by `ownerId` | Owner, accepted friend, or public visitor according to property policy |

## Room lifecycle

`Network.joinFishing()`, `Network.joinHome(ownerId)`, and
`Network.returnToPublic()` all use the same transition sequence:

1. Lock movement input.
2. Invalidate the previous room generation and leave the old room.
3. Join the requested room with the authenticated session.
4. Bind the new room state and events.
5. Start the matching Phaser scene.
6. Unlock movement after the scene is ready.

Every room callback captures a generation guard. A late state patch or message
from the room being left therefore cannot mutate the active destination.

Fishing is a single public world contract and does not carry `ownerId`, party,
friendship, property visibility, or source-game group-size rules. Its initial
Colyseus capacity is `maxClients = 100`; this is a server-safety limit, not an
access restriction. Anonymous users remain blocked by the existing session
authentication boundary.

Home rooms use the same presence, movement, chat, and emote implementation, but
are keyed by the owner's ID. The server keeps the Home ACL authoritative:
`FRIENDS` is the default, `PUBLIC` permits visitors, blocked users are always
denied, and only the owner can mutate layout or access settings. The current
SkyOffice-compatible layout grid is 8 × 6.

## Fishing authority and persistence

The client only animates the reference timing (cast 0.35 s, bite 0.55 s, reel
0.35 s) and sends `FISHING_CATCH_REQUEST`. `WorldRoom` validates session,
world, spot, distance, cooldown, request ID, and the UTC daily limit before
`StudioStore.claimFishingCatch()` performs the idempotent inventory write.

Fish selection is server-side and uses the shared catalog weights:

| Fish | Rarity | Weight |
| --- | --- | ---: |
| `pond_minnow` | common | 60 |
| `leaf_carp` | uncommon | 30 |
| `moon_koi` | rare | 10 |

Inventory is stored in `playerInventory` and `inventoryTransactions`, separate
from `ownedCosmetics`. A retry with the same
`fishing:{userId}:{utcDate}:{requestId}` key returns the original receipt and
does not increment the stack again. V1 grants no Coin, character EXP, or quest
progress; `sellValue` is retained in the catalog for a future selling system.

## Source assets and attribution

The selected backdrop, fish icons, housing prop sheet, and reference config are
listed in `client/public/assets/world/asset-manifest.json`. They are pinned to
Pixel Social World's commit
`f9f0f18764ab3f9c5bdf4e5090cd6dd9fa952a0f` and accompanied by the Apache-2.0
license notice at
`client/public/assets/world/licenses/pixel-social-world-Apache-2.0.txt`.

Only selected raster/config assets are used. The source repository's Godot
`.tscn`/`.gd`, Go backend, persistence runtime, portal framework, main city,
creator mini-game framework, and `SaveSystem` are not part of the SkyOffice
runtime. Fishing collision rectangles and Home interaction/layout validation
are authored in SkyOffice's Phaser/server contracts.
