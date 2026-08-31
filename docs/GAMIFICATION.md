# Gamification rules

Task completion is idempotent. A task can be rewarded once; a second completion returns `TASK_ALREADY_COMPLETED` and does not change XP, Studio XP or boss HP.

- Normal task → side quest.
- High-priority task → main quest.
- Critical task → elite quest.
- Default priority weights are `50 / 100 / 200 / 500`; the task creator may override boss damage.
- Personal XP and Studio XP are separate values.
- Boss HP never goes below zero; zero changes status to `DEFEATED`.
- Studio levels are data-driven in `server/studio/config.ts` and unlock world cosmetics.

The product intentionally does not use employee performance ranking, hours worked, keystroke monitoring or surveillance. The UI can show collective studio progress and a lightweight daily challenge without turning work into a productivity contest.

## Work-Life progression and shared Coin

Work-Life is a personal career layer, separate from account permissions and the existing production workflow. The v1 career catalog is intentionally fixed to these nine tracks: `ART` (Art), `ANIMATION` (Animation), `GAME_DESIGN` (Game Design), `FRONTEND` (Frontend), `BACKEND` (Backend), `QA`, `QC`, `PM` and `HR`. `Frontend` is the canonical spelling; there is no `forntend` identifier. These IDs are career data, not additions to `StudioRole`: a `MEMBER` may choose any track, while an `ARTIST`, `DEVELOPER`, `QA`, `OWNER` or `ADMIN` keeps the current account permissions independently.

There are three deliberately different kinds of work:

- `Production Tasks` / `Studio Tasks` live in STU / AI Hub. Managers create them, assignees complete them, and completion grants Production XP, Studio XP and Sprint Boss damage. They do not automatically grant Coin.
- `Career Jobs` / `Daily Jobs` live on the Job Board and workstations. They are 30–90 second server-authoritative puzzle sessions that grant virtual Coin and career-specific XP. They never close a production task.
- `Certification Challenges` open at Career Center. They do not grant Coin or daily-job credit; they verify promotion eligibility at 70/100 or higher. A failed attempt does not remove XP. Career selection is done at the matching physical workstation; Career Center is not an all-career access board.

The launch catalog includes the general `Inbox Triage` tutorial plus one deterministic job per career: `Palette Match`, `Keyframe Timing`, `Mechanic Blueprint`, `UI Component Assembly`, `API Flow Routing`, `Bug Hunt`, `Checklist Audit`, `Sprint Planning` and `Onboarding Desk`. The server creates a seeded challenge, stores only the private solution, validates every action and computes the normalized score from accuracy (70%), speed (20%) and completion (10%). The client never submits a score, grade, Coin delta or Career XP delta.

Each career now exposes two career-specific contracts at Intern, so a new player can complete the three-job paycheck loop without repeating `Inbox Triage`. Apprentice unlocks the first cross-discipline contracts (`Build Verification`, `Release Check`, `Feature Handoff`, `Team Kickoff`, `Asset Delivery`). The Job Board only shows the general contract and the active career by default; locked contracts can be expanded as a progression preview.

Each career has its own Intern → Apprentice → Junior → Specialist → Senior → Lead ladder. Career XP is stored by `(user_id, career_id)`, so switching from Art to Animation preserves both tracks. The active career can be changed at most once per 24 hours after the first change. A daily shift allows up to 8 Coin-paying jobs and 12 total sessions; a single job is limited to two sessions, practice after the paid cap gives no Coin and at most 25% XP, and Career XP is capped at 500 per UTC day. Completing three valid jobs unlocks one daily paycheck at Payroll Office. The paycheck uses the active rank and a streak bonus of +5% from day 3 and +10% from day 7, capped at +10%. An unclaimed previous-day paycheck becomes `EXPIRED` after the UTC reset and is never carried forward.

The WorkPanel is mounted for every authenticated player and has `Job Board`, `Career`, `Paycheck` and private `Work History` tabs. A player may inspect the panel from the HUD, but choosing or changing a career requires proximity to that career's workstation, starting a job requires proximity to Job Board or the matching workstation, and claiming salary requires proximity to Payroll Office. Career Center only shows the active career and certification progress; it no longer exposes an all-career access board. The current map is reused as a two-wing layout: Game Design lives in Game Design Lab; Art and Animation share Creative Studio; Frontend and Backend share Engineering Hub; QA and QC share Quality Lab; and PM, HR, Career Center and Payroll share People Ops. Studio Commons is the reception and board area, while Play Lounge, Arcade Hall and VIP Games form the social wing. No real employee names, emails, salaries or internal data are used by PM/HR challenges.

First-session guidance is state-derived rather than a disposable slideshow: Inbox tutorial → walk to a career workstation and select a career → three career jobs → Payroll → Play Wing. Every step points to the relevant room or station; the player walks there with WASD and presses `E` at the physical interaction point. Work requests remain protected by server-side proximity checks. The HUD CTA mirrors the same state (`Bắt đầu` → `Chọn nghề` → `Làm job` → `Nhận lương`). The Inbox tutorial is intentionally four questions in 60 seconds. Casino/table games and world mini-games expose a compact rules flow before the first play; guides remain reopenable.

The guide also distinguishes the three commonly confused systems: Career Jobs pay Coin and Career XP, Game Quests progress automatically and pay Character XP, and Production Tasks progress the studio/boss without paying Coin. Daily Claim is available directly to every authenticated player in the guide instead of being reachable only through manager-facing Studio Hub screens.

The client audio director uses a curated CC0 file-based sound palette: three rotating chill/urban background tracks, Kenney interface feedback and Kenney casino/card/dice effects. Audio preloads after the first interaction to respect browser autoplay rules, and small SFX pools allow overlapping rapid cues without clipping each other off. It provides BGM plus UI, interaction, room, card deal, dice/shake, reward, win and loss cues. SFX and BGM have independent persistent toggles. Asset provenance and source links live in `client/public/assets/audio/CREDITS.md`.

Work rewards and salary use wallet ledger sources `WORK_JOB` and `DAILY_SALARY`, with idempotency keys `work:{sessionId}` and `salary:{userId}:{utcDate}`. Coin remains virtual-only and can be spent on the existing wardrobe, nameplates, titles, furniture, Personal Room and social games. Public profiles may show career name, rank and certification status, but never work earnings, accuracy, job score, completion time or wallet history. There is no cash-out, forced rent, forced energy or personal productivity leaderboard.

## Social progression and Coin

Social progression is independent from both work progression and production progression:

- `gameXp` / `gameLevel` are player social status only.
- `coinBalance` is a virtual-only wallet; there is no cash-out or real-money currency. P2P Coin transfers are supported, but they are not real-money wagers.
- New accounts receive 1,000 Coin once. Daily claim grants 100 Coin + 50 Game XP once per UTC date.
- Level thresholds are 0 / 100 / 250 / 500 / 900 XP, unlocking Social Plaza, Fashion Shop, VIP Games, Personal Room and a tournament placeholder.
- Daily free-game rewards are capped at three rounds and Game XP is capped at 150 per day.

Social values live in `server/studio/config.ts`; Work values live in `server/studio/work-config.ts` and `types/Work.ts`. Purchases, claims and rewards use idempotency keys (`daily:*`, `purchase:*`, `round:*`, `gift:*`, `work:*`, `salary:*`) and are written to the wallet ledger; the client cannot submit a replacement balance.

## Social vertical slice

The first reward-enabled games are:

- `Tag Game`: free; participation 25 Coin + 25 Game XP, top performer receives an additional 25 + 25.
- `Treasure Hunt`: same free participation/winner policy.
- `Paint Tiles`: same free participation/winner policy, with the winning team receiving the bonus.
- `Dice Duel`: 10 Coin entry, loss 0 return, tie returns 10, win returns 18; maximum three rolls per player per round.
- `Baccarat`: 10 Coin entry; server resolves the hand and pays 20 on a win or 10 on a tie.
- `Blackjack`: 10 Coin entry; server resolves player versus dealer totals and pays 20 on a win or 10 on a tie.
- `Texas Hold'em`: fixed 100 Coin buy-in, 5/10 blinds and a four-seat No-Limit cash hand. Choose three strategy bots or join a 2–4 player waiting table; the server deals cards, validates legal actions, keeps each player's hole cards private, controls the shared turn deadline and settles the remaining stack on cash out.
- `Sic Bo`: 10 Coin entry with Small/Big/Odd/Even choices; a correct choice pays 20.
- `Bầu Cua`: 10 Coin entry with six animal choices; matching results pay according to the number of matches.
- `Chess`: two-player turn-based room game with a 10 Coin entry and server-validated movement.
- `Tiến Lên Miền Nam`: free four-seat Southern-rule card table with a 3♠ opening rule, bot mode and a server-synchronized human waiting table.

The games share a countdown/participants/objective/timer/score/result/reward overlay. `MINI_GAME_CHEER` only emits feedback. Persistent Coin is never represented by public mini-game `coins`; table games use server-side settlement and send the wallet receipt privately.

## Studio Commons game: Tag Game

Owner/Admin can open a live `Đuổi bắt đổi vai` round from the Mini game feature window. The server automatically records players currently in `LOBBY` as attendees, starts a 3-second countdown, then runs a 60-second round. The current tagger changes when the tagger gets close to another attendee; the room state and tag events are broadcast to every connected client. Attendance and the round score are room-scoped and reset after the result panel closes; they do not award work XP or damage the Sprint Boss.

## Direct game stations

The original SkyOffice tilemap remains the visual base. The client adds a compact Work Wing directory/signage layer and renders `client/public/assets/map/games-wing.json` as a separate Play Wing beside it, with `Play Lounge`, `Arcade Hall` and `VIP Games` zones. Pressing `E` near a table or machine opens a large station popup directly; it does not navigate to the Mini Game Hub. Owner/Admin can start the selected round from that popup, while every player in the zone is automatically recorded as an attendee. The server starts a 3-second countdown, runs a 45-second round and broadcasts actions/results to every client.

The registry still contains experimental modes for regression and future milestones, but the launcher feature-flags them off in MVP. The reward-enabled vertical slices are:

- `Tag Game`: free lobby round with participation and top-performer rewards.
- `Treasure Hunt`: free collection round with participation and leader rewards.
- `Paint Tiles`: free team territory round with participation and winning-team rewards.
- `Dice Duel`: VIP Games round using the 10-Coin entry and server-settled payout rules.
- `Baccarat`, `Blackjack`, `Poker`, `Sic Bo`, `Bầu Cua`: VIP Games RNG rounds with fixed Coin entry and payout rules.
- `Chess`: two-player VIP Games board game with server-validated turns and settlement.
- `Lucky Draw`: 5-Coin prize-station RNG round.

The other playful lobby modes remain in the registry for later phases and cannot be started through the MVP launcher.

These actions are intentionally playful and non-violent in the product rules: hits only create score/events, never health, injury or work consequences.

## VIP Games

The separate Play Wing includes a decorated `Play Lounge`, `Arcade Hall` and `VIP Games` with dedicated table/machine interaction points. Admin can open the table modes when online players are in an entertainment room; the same direct popup is used for the Arcade stations:

- `Dice Duel`: bet 10 coins; a higher roll returns 18 coins and a tie returns the 10-coin stake. Each player may roll up to three times per round.
- `Baccarat`, `Blackjack`, `Sic Bo` and `Bầu Cua`: fixed-entry RNG tables with server-generated outcomes.
- `Texas Hold'em`: four-seat No-Limit table with either three bots or 2–4 real players. The active player is shown on the felt with a server-issued countdown; bots pause for 1.1–2.8 seconds to evaluate equity, pot odds and position before each action. A human turn lasts 15 seconds and automatically folds when it expires. Multiplayer clients receive a redacted shared state plus only their own hole cards.
- `Chess`: a two-player board with basic legal move validation, turn ownership and capture.

Lucky Draw is available at the Prize Claw station and from the fallback launcher.

Dice Duel uses each player’s persistent virtual Coin wallet (new accounts start with 1,000 Coin). Every roll is settled server-side with idempotency protection, so reconnects cannot duplicate a payout. There is no real-money wagering, cash-out or financial reward.

## Cosmetics and Personal Room

The catalog has Outfit, Nameplate and Furniture slots with Common/Rare/Epic/Legendary/Seasonal rarity. Cosmetics only express identity/status. The Personal Room uses a server-validated `room_template_v1` on an 8×6 grid, has a furniture cap, and supports read-only visits, one-like-per-viewer-per-UTC-day and furniture gifting with a three-gift daily cap. Gift does not transfer Coin directly.

### Player titles

The in-world `Nhân vật` button opens the player's basic profile and a title tab. The catalog has one starter title, nine game-achievement titles and one short career title for each of the nine careers in `types/Social.ts`; every title has a highlight color. Game titles are unlocked by lifetime positive net winnings in their specific game, read from the wallet ledger (for example, `Cao thủ Poker` requires 1,000 Coin won in Poker). The default loadout has no equipped title. A player may equip a game title after reaching its game-specific winning target, or equip the title belonging to the currently active career after reaching that career's required rank (`APPRENTICE` in v1). Titles can be removed at any time. When a player changes career, the server clears the previous career title and the live Colyseus player label updates for everyone in the room. The `titleId` is persisted through `PATCH /api/social/loadout` and is separate from purchasable nameplates.

## Exploit controls

The server owns participant identity, zone, score, dice outcome and settlement. It applies action cooldowns, online/zone checks, non-negative balance checks, free-game and per-round caps, rate limits on social REST mutations, and duplicate settlement detection. No personal performance leaderboard is exposed in MVP.
