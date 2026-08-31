# STU / AI HUB

STU / AI HUB is the studio layer added on top of SkyOffice. It keeps the virtual office, proximity chat, rooms and collaboration tools, then adds a gamified production deck for a table-game team.

The full STU/AI workspace is restricted to `OWNER` and `ADMIN` accounts. Other roles do not mount the Hub UI and cannot see or activate its Quest Board, Project Board, Asset Board or Build Machine access. Studio work access is handled through physical boards and workstations in the world; public game tables and arcade machines remain available.

## Included in this MVP

- Project control tower for Hero Battle H5 and Neon Roulette, ready to extend to more table-game projects.
- Resource hub for shared GDD, art review, workflow, simulation evidence, links and tags.
- Brainstorm Lab with prompt shortcuts and a first-pass concept generator.
- Daily/weekly/event character quests, work XP, Studio XP/Boss, independent Character EXP/Game XP, Coin wallet, unlocks and a collective scoreboard.
- Work-Life career progression for exactly nine personal tracks: Art, Animation, Game Design, Frontend, Backend, QA, QC, PM and HR. Career Jobs and daily salary are separate from manager-owned Production Tasks and Studio permissions.
- Every career has a deterministic bank of 3,456 profession-specific questions (31,104 total), organized across 16 knowledge areas, 36 production contexts and six difficulty levels. The expanded domain set covers iGaming platform work, Slot/RGS math and presentation, Sports Betting, Table Betting/Live Casino, Card Games, Crash/provably-fair logic, real-money wallet settlement, bonuses, KYC/AML and Responsible Gambling. Regular jobs use the player's current rank; promotion certifications use the target rank, so question depth rises from Intern fundamentals through Lead-level governance and trade-offs.
- Reward-enabled social games: Tag, Treasure Hunt, Paint Tiles, Dice Duel, Baccarat, Blackjack, Texas Hold'em, Sic Bo, Bầu Cua, Chess and Tiến Lên, with server-side settlement and private reward receipts.
- Every game overlay includes a collapsible realtime chat drawer. Each game mode has an isolated channel, bounded recent history, unread count and server-side spam/length guards.
- Fashion Shop / Wardrobe, public social profile inspection and a fixed-template 8×6 Personal Room with visit, like and furniture gift flows.
- Team screen with real role-based account creation for studio managers.
- Pixel assistant UI with context-aware replies for common production questions.
- Real auth session, persistent local MVP store, task CRUD/status/assignment/priority/delete and idempotent rewards.
- Phaser pixel world with a compact two-wing layout: the existing SkyOffice tilemap is reorganized into Game Design Lab, Creative Studio, Engineering Hub, Studio Commons, Quality Lab and People Ops; a separate `games-wing.json` Play Wing contains Play Lounge / Arcade Hall / VIP Games, interactive boards, tables, machines, presence and realtime boss/level-up events.

## Run locally

Production deployment is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
cd client
pnpm install
pnpm run dev
```

The original SkyOffice realtime server is still required for the virtual office layer:

```bash
# from the repository root
pnpm install
pnpm run start
```

For a production client bundle:

```bash
cd client
pnpm run build
pnpm run preview
```

The static output is generated in `client/dist`. When the server is deployed separately, set `VITE_SERVER_URL` to its `ws://` or `wss://` endpoint before building the client.

## Account boundary

The MVP has working server-side auth. Development fixture accounts are generated only outside `NODE_ENV=production`; their credentials are intentionally not documented or bundled in the client. Production requires an explicitly configured `STUDIO_ADMIN_PASSWORD`, Supabase persistence and a real secret manager for `JWT_SECRET`. `OWNER`, `ADMIN` and `PRODUCER` can create member accounts through `POST /api/auth/register`, and all accounts receive signed 14-day sessions. The local adapter persists to `server/data/studio-db.json` (override with `STUDIO_DB_PATH`) so the prototype works without Docker. Social state is included in the same adapter and in the PostgreSQL contract at `server/data/migrations/001_initial.sql`.

## Social MVP flow

1. Claim the daily reward once per UTC date for 100 Coin + 50 Game XP.
2. Play a server-settled game to receive Character EXP: every eligible round grants a play amount, with an additional win amount; a loss still counts as participation. Completing a production mission/task grants its quest XP to the character track as well.
3. Open the Quest Log to inspect daily, weekly and special character missions. They progress automatically from game settlements and completed tasks, and their EXP reward is auto-claimed exactly once when the target is reached.
4. Character levels use thresholds 0 / 100 / 250 / 500 / 900 EXP; after Level 5, the next threshold grows from the previous one by 1.5×. The server applies a 500 Character EXP daily cap to keep the loop grindable without enabling unbounded bot farming.
5. Open My World to inspect Game XP, Coin, Wardrobe and Personal Room.
6. Open the trophy button in the in-world utility controls to view the studio leaderboard, sorted by current Coin balance with avatar, level, online state and current room.
7. Walk between Studio Commons, Play Lounge, Arcade Hall and VIP Games; press `E` at a table or machine to open that station's large game popup directly. Work access points are grouped by department: Game Design in Game Design Lab, Art/Animation in Creative Studio, Frontend/Backend in Engineering Hub, QA/QC in Quality Lab and PM/HR/Payroll in People Ops.
8. Owner/Admin can open a round from the station popup; the popup contains the real server-backed betting/action controls, countdown, live status, result and private Coin receipt. Baccarat and Sic Bo expose every current bettor, their selected outcomes, shared chip totals per betting spot and realtime seat-to-spot chip animation. Texas Hold'em additionally shows whose turn it is, a 15-second human deadline, a realistic 1.1–2.8-second bot thinking delay, and a 2–4 player lobby with per-player private hole cards. A multiplayer table auto-starts after a 5-second countdown once at least two players have joined, then automatically deals the next hand after a 5-second result pause while at least two seated players still have chips. Tiến Lên provides eight numbered rooms across free, 10, 25 and 50 Coin tiers; selecting a full/running room automatically routes the player to an available room at the same tier, while paid rooms lock the entry stake server-side and award the combined pot to the winner.
9. Receive the private server reward receipt; Redux updates Coin, Character EXP, level and Quest Log without a full-page reload.
10. Create a character name/avatar, equip a Nameplate, inspect another public profile, transfer Coin to another player, visit/like the room or gift paid furniture.
11. Walk close to another player and press `E` to open the interaction panel. Choose Oản Tù Xì, select a shared wager, accept the incoming invite, then both players choose Búa/Kéo/Bao and press `READY`; the server hides moves until both are ready, resolves the round, and settles the Coin pot.
12. Open the chat dock inside any game. Messages are shared only with that game's channel—for example, Poker chat never appears in Tiến Lên—and the last 60 messages are restored when reopening the channel.

Character EXP/Game XP is independent from work XP and Studio XP. Game settlement and production task completion both call the same server-side character progression rules; Coin remains server-settled and idempotent. Work Career XP is stored separately per career, uses server-authoritative realtime mini-games, and pays only virtual Coin through `WORK_JOB` / `DAILY_SALARY` ledger entries. The daily/weekly/event quest progress is persisted beside the player progression and the PostgreSQL migration includes its own `game_quest_progress` table; Work persistence is specified in `server/data/migrations/002_work_economy.sql`.

The server emits the operational social metrics `social_daily_claim`, `social_round_started`, `social_round_finished`, `social_round_abandoned`, `social_reward_granted`, `social_reward_duplicate`, `social_wallet_rejected`, `social_trade`, `cosmetic_purchase`, `property_visit`, `property_like` and `property_gift`. The local MVP keeps a bounded in-memory counter/event buffer; production should forward these events to the observability pipeline.

## CI baseline

The repository includes `.npmrc` with `confirmModulesPurge=false` so non-interactive pnpm installs do not stop at the dependency purge prompt. CI commands should still set `CI=true`:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm --dir client install --frozen-lockfile
pnpm run test:studio
pnpm run typecheck:server
pnpm --dir client run typecheck
pnpm --dir client run build
```

## MVP acceptance flow

1. Set local-only credentials through environment variables, then log in with the configured account; production credentials are never included in the repository or client bundle.
2. Connect to the public studio and open the STU / AI Hub.
3. Open Task Board, move a task through the pipeline and complete it.
4. Verify personal work XP, Character EXP, Studio XP, Sprint Boss HP, activity and the realtime event in another connected client.
5. Log in with a local account that has the required role to create a task, assign it, edit title/description and change priority.
