# Chores App - Project Scope & Guidelines

## Overview

A task and household chore tracking application designed to manage recurring tasks, assignments, and completion history.

## Core Requirements for Claude

- Default to **Plan Mode** before implementing major features or structural changes.
- Keep code clean, well-commented, and robust against edge cases.
- Follow existing patterns established in the workspace.
- The MVP plan and roadmap live in [docs/mvp-plan.md](docs/mvp-plan.md). Keep it current when a decision changes.

## Project specification and notes

- Concept: A smartphone app that assigns recurring chores (daily, weekly, monthly, quarterly, annual) across family members, with automatic scheduling based on each person's capacity to work on a given day — so parents get more, young kids get less. Includes notifications, a daily view of what's due, photo proof of completion, and a reward system.
- Targets: iOS and Android apps, plus a web app usable from a PC. Later: Alexa and other home voice assistants.
- Design doc (written a few years ago): https://docs.google.com/document/d/1NUgHOPljbSg3imJQP0QCEWl8fTwJYWRAwgRPFyA8NKY/edit?tab=t.0#heading=h.1dhklcnv7cfk
  - It predates the current stack (it assumed Python/FastAPI/MySQL). Its chore state machine, notification list, and family/PIN model still apply; see the plan for deliberate changes (e.g. "late" is a flag, not a status).

## Tech stack (decided)

- **Monorepo:** pnpm workspaces + Turborepo. Node >= 24 (dev machine runs Node 26).
- **App:** Expo (React Native + Expo Router + react-native-web), one codebase for iOS/Android/Web. (`apps/mobile`, Step 5)
- **API:** Node + Fastify + Zod, REST contract shared via `ts-rest`. (`apps/api`, Step 2)
- **DB:** PostgreSQL 16 via Prisma. Jobs via pg-boss (runs inside Postgres, no Redis).
- **Storage / push:** S3-compatible photo storage (MinIO locally); Expo Push Notifications.
- **TypeScript is pinned to `~6.0`**: typescript-eslint does not support TS 7 yet. Don't bump it without checking that.

## Architecture rules

- **All business rules live in `packages/domain`** (pure TypeScript, no I/O: no DB, network, or clock reads; pass `now` in explicitly). The API enforces them; the app never re-implements them. That way an Alexa skill can be just another API client.
- `packages/contracts` (Step 2+) holds the Zod schemas and API contract shared by the API and the app.
- Each API module (`apps/api/src/modules/<name>/`) is split into `routes.ts` → `service.ts` → `repo.ts`, with tests next to the code.

## Layout

```
apps/mobile      Expo app (planned)
apps/api         Fastify API + background jobs (planned)
packages/domain  recurrence, chore state machine, scheduler, points
packages/contracts  shared Zod schemas / API contract (planned)
docs/            plan and design notes
```

## Commands (run from the repo root)

- `pnpm install`: install everything
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`: run across all packages via Turborepo
- `pnpm format` (writes) / `pnpm format:check` (CI)
- `pnpm db:up` / `pnpm db:down`: start/stop Postgres + MinIO (needs Docker Desktop running)
- Single package: `pnpm --filter @chores/domain test`

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, and test on every push/PR.

## Conventions

- ESM everywhere (`"type": "module"`); relative imports use the `.js` extension (NodeNext resolution).
- Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Use `import type` for type-only imports.
- Tests: Vitest, `*.test.ts` next to the source.
- pnpm enforces a minimum release age on dependencies. If an install complains a version is too new, pin an older version; don't add `minimumReleaseAgeExclude` entries.
