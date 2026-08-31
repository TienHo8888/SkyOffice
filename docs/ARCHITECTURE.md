# Studio OS architecture

SkyOffice remains the world layer: Phaser renders the original office map, the separate Games Wing tilemap and avatars, while Colyseus owns realtime room state. STU / AI Hub is the workspace layer rendered by React.

```text
React STU Hub ── REST /api ── StudioStore ── file-backed MVP persistence
      │                              │
      └──── GameBridge/events ── Colyseus StudioRoom (SkyOffice room)
                                      │
                           Phaser office + Games Wing
```

`server/studio/store.ts` is the domain boundary for projects, tasks, quests, XP, bosses and activity. `server/studio/events.ts` publishes completion events to connected Colyseus rooms. The SQL migration under `server/data/migrations` is the PostgreSQL hand-off contract; the local adapter avoids requiring Docker for the first playable.

Social progression is a second domain layer:

```text
Phaser input → direct station popup → SkyOffice authoritative room → round resolver / dice RNG
  → StudioStore wallet + social XP transaction
  → private SOCIAL_REWARD → Redux SocialStore + React receipt
```

Work-Life is a third domain layer that shares only the virtual Coin wallet:

```text
Phaser Job Board / workstation proximity
  → private WORK_SESSION_STARTED(challenge seed + public steps)
  → WORK_ACTION / WORK_SUBMIT
  → SkyOffice server challenge resolver
  → StudioStore work settlement + wallet ledger
  → private WORK_RESULT → Redux WorkStore + SocialStore Coin sync
```

Career selection follows the same physical-world rule: the player walks to the matching workstation and presses `E`; the React Career tab no longer acts as an all-career access board.

The authoritative Work config is shared through `types/Work.ts` and re-exported by `server/studio/work-config.ts`. `server/studio/work-rules.ts` owns deterministic challenge generation, action validation, score normalization, grade mapping and reward multipliers. `StudioStore` owns career selection, per-career XP, rank/certification, daily counters, streaks, salary and idempotent wallet settlement. `StudioHub` remains manager-only; `WorkPanel` is mounted for every authenticated player.

Work XP (`User.xp`), Studio XP/Boss progress and Game XP (`player_progressions.gameXp`) never share a mutation path. Coin is virtual-only and every balance mutation is an idempotent `wallet_transactions` ledger entry. Public presence/profile payloads do not expose another user’s balance or wallet history.

## API surface

- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- `GET /api/studio`, `/api/studio/members`
- `GET/POST /api/projects`, `GET /api/projects/:id`
- `GET/POST /api/resources`
- `GET /api/sprints/:id`
- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/complete`
- `GET /api/quests`, `GET /api/boss/:sprintId`, `GET /api/activity`
- `POST /api/ai/assist`, `POST /api/ai/brainstorm`
- `GET /api/social/me`, `POST /api/social/daily-claim`
- `GET /api/work`, `GET /api/work/history`
- `POST /api/work/career/select`, `POST /api/work/career/change`
- `POST /api/work/salary/claim` (requires live Payroll Office proximity)
- `GET /api/social/catalog`, `POST /api/social/catalog/:itemId/purchase`, `PATCH /api/social/loadout`
- `PATCH /api/auth/profile`
- `POST /api/social/trade`
- `GET /api/social/profiles/:userId`
- `GET/PATCH /api/social/property/me`, `GET /api/social/property/:userId`
- `POST /api/social/property/:userId/like`, `POST /api/social/property/:userId/gift`

The completion endpoint is the vertical-slice transaction: task → quest → personal XP → studio XP → boss damage → activity/realtime events.

Social persistence uses `player_progressions`, `wallet_transactions`, `cosmetic_catalog`, `owned_cosmetics`, `user_loadouts`, `properties`, `property_furniture`, `property_visits`, `property_likes`, `property_gifts`, `social_rounds` and `social_reward_claims`. Work persistence is described by `server/data/migrations/002_work_economy.sql` and uses `work_profiles`, `work_career_progress`, `work_daily_stats`, `work_sessions` and `work_reward_claims`; the local MVP adapter stores the same model in `StudioDbState`. `SkyOffice` validates session, zone and cooldown, while `StudioStore` owns economy settlement. Table-game outcomes, Work challenge results and trade metadata are server-generated or server-validated and auditable.

`SocialLoadout.titleId` is a persisted, optional status label. The server validates the title against the shared catalog and the player's lifetime game-achievement progress before equipping it; game progress is derived from positive net results grouped by game and round in the wallet ledger, while career titles use the active career rank. Live rooms mirror the value as `IPlayer.titleId`.
