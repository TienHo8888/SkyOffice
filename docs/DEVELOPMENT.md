# Development

## Local demo

```bash
pnpm install
cd client && pnpm install
cd ..
pnpm run test:studio
pnpm run test:work
pnpm run test:work-realtime # cần một server Colyseus đang chạy ở STUDIO_WS_URL
pnpm run typecheck:server
pnpm --dir client run typecheck
cd client && pnpm run build
```

Start the realtime/API server from the repository root:

```bash
pnpm run start
```

In another terminal run the Vite client:

```bash
cd client
pnpm run dev
```

Development fixtures are generated only outside `NODE_ENV=production`. Set `STUDIO_ADMIN_PASSWORD` and, if needed, `STUDIO_TEST_PASSWORD` in a local uncommitted `.env`; credentials are intentionally omitted from this document and from the client bundle.

| Fixture identity | Role |
| --- | --- |
| Generated admin fixture | Administrator |
| Generated player fixtures | Developer / Artist / QA / Game Designer |

The first production flow is: login → connect to public studio → open Task Board → complete an open quest → verify personal XP, Studio XP, boss HP, activity and the realtime event. The Work-Life vertical slice is: login → Job Board → Inbox Triage → walk to the matching career workstation and choose a career → complete three valid Career Jobs → Payroll Office → claim paycheck. `server/studio/work.test.ts` covers the nine career definitions, deterministic challenge scoring, career-specific XP, career switching, grade rewards, abandoned sessions, certification and idempotency. `server/studio/work-realtime.test.ts` additionally checks private challenge/result delivery, sanitized activity, fake payout fields and disconnect abandonment against a live Colyseus server. A second connected client receives the existing production completion event without refresh; Work challenge data and Work receipts remain private to the actor.

The API uses a file-backed adapter for local MVP speed. `server/data/migrations/001_initial.sql` is the relational schema contract for a production PostgreSQL adapter; do not commit `server/data/studio-db.json`.
