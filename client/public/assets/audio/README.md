# SkyOffice audio credits

The runtime audio files in this directory are bundled with the game so the
client does not depend on a third-party CDN at play time. `AudioDirector` uses
the files under `kenney/` for action sounds and rotates through the local CC0
tracks under `music/` and `bgm/` for background music. The older `sfx/` folder
is retained for compatibility with earlier local builds.

## Sound effects

- `kenney/casino/` — Kenney Casino Audio, by Kenney Vleugels
  - Source: <https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips>
  - License: Creative Commons Zero (CC0)
- `kenney/interface/` — Kenney Interface Sounds
  - Source: <https://kenney.nl/assets/interface-sounds>
  - License: Creative Commons Zero (CC0)

The original license text is kept next to each extracted pack and is also
mirrored in `licenses/` for the existing selected SFX files.

## Background music

- `music/studio-loop.ogg`, `bgm/calm-track-loop.ogg`,
  `bgm/chill-lofi-loop.ogg`, `bgm/urban-shop.ogg` — local CC0 background
  music playlist; the active track changes by room and advances when a track
  ends.
  - Source: <https://opengameart.org/content/menu-music-1>
  - License: CC0 / public domain attribution notice

## Runtime sound policy

- Casino actions use the casino pack: chip placement, cards, dice, reveal and
  payout cues are deliberately separate. The reel cue uses the local casino
  shuffle texture because the pack does not include a dedicated slot-reel
  sound.
- UI clicks are disabled inside game surfaces. A bet does not play a generic
  button click; it plays the chip cue only after the server broadcasts
  `BET_ACCEPTED`.
- State-only broadcasts such as opening a round, changing turns and finishing
  a social round stay silent. Sounds are attached only to an accepted action or
  to a visible animation and are filtered to the local actor/target where the
  protocol provides that identity.
- Each cue has a volume, cooldown, voice cap and maximum playback duration so
  rapid betting or multiplayer events cannot build up an unpleasant audio
  wall.
