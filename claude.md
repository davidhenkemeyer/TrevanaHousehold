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
  - It predates the current stack (it assumed Python/FastAPI/MySQL). Its chore state machine, notification list, and family/PIN model still apply; see the plan for deliberate changes (e.g. "late" is a flag, not a status; the family PIN became per-kid PINs).

## Tech stack (decided)

- **Monorepo:** pnpm workspaces + Turborepo. Node >= 24 (dev machine runs Node 26).
- **App:** Expo (React Native + Expo Router + react-native-web), one codebase for iOS/Android/Web. (`apps/mobile`, Step 5)
- **API:** Node + Fastify 5 + Zod 4 via `fastify-type-provider-zod`. Request/response schemas live in `packages/contracts`. (ts-rest was dropped: unmaintained, Zod 3 only.)
- **DB:** PostgreSQL 16 via Prisma 7 (driver adapter `@prisma/adapter-pg`, config in `apps/api/prisma.config.ts`). Jobs via pg-boss (Step 4).
- **Auth:** argon2id password/PIN hashes (`@node-rs/argon2`), 15-min HS256 access JWTs (`jose`), rotating single-use refresh tokens stored as SHA-256 hashes.
- **Storage / push:** S3-compatible photo storage (MinIO locally); Expo Push Notifications.
- **Pinned on purpose:** TypeScript `~6.0` (typescript-eslint doesn't support TS 7 yet). Prisma `7.10.1` (npm's `latest` tag points at an 8.0 release candidate). Prisma 7 officially lists Node 20/22/24 but works on 26.

## Architecture rules

- **All business rules live in `packages/domain`** (pure TypeScript, no I/O: no DB, network, or clock reads; pass `now` in explicitly). The API enforces them; the app never re-implements them. That way an Alexa skill can be just another API client.
- `packages/contracts` holds every request/response Zod schema. Changing one is changing the public API.
- Each API module (`apps/api/src/modules/<name>/`) has `routes.ts` (HTTP + schemas only) → `service.ts` (logic + Prisma queries), with `*.test.ts` alongside. Services take a `Deps` object (`db`, `config`, `accessTokens`, `now`) and never call `new Date()` directly.
- Services throw `AppError` (see `apps/api/src/errors.ts`) with a stable `code`; every error response is `{ error: { code, message, details? } }`.
- Family-scoped routes authorize via `requireMember` / `requireParent` (`modules/access.ts`). Non-members get 404, not 403.
- Database rows become API responses only through `modules/dto.ts`, so hashes can't leak.

## Layout

```
apps/mobile         Expo app (planned, Step 5)
apps/api            Fastify API (+ background jobs in Step 4)
  prisma/           schema.prisma, migrations/, seed.ts
  src/modules/      auth, families (members, kid profile switching), invites
  src/test/         test harness (useTestApp) and DB setup
packages/domain     recurrence, chore state machine, scheduler, points, defaults
packages/contracts  shared Zod request/response schemas
docs/               plan and design notes
```

## Commands (run from the repo root)

- `pnpm install`: install everything
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`: run across all packages via Turborepo
- `pnpm format` (writes) / `pnpm format:check` (CI)
- `pnpm db:up` / `pnpm db:down`: start/stop Postgres + MinIO (needs Docker Desktop running)
- `pnpm --filter @chores/api dev`: API on http://localhost:3000 (copy `apps/api/.env.example` to `.env` first)
- `pnpm --filter @chores/api db:migrate --name <change>`: create + apply a migration after editing `schema.prisma`
- `pnpm --filter @chores/api db:seed`: demo family (mom@example.com / dad@example.com, password `chores-demo-password`; Billy PIN 1111, Sally PIN 2222)
- Single package: `pnpm --filter @chores/domain test`

API tests need Postgres running. They use a separate `chores_test` database that the test setup creates and migrates automatically, and they wipe it between tests. Use the `useTestApp()` harness; it provides a controllable clock (`t.advance(ms)`). Remember that advancing past 15 minutes expires access tokens, so call `t.refresh(session)` afterwards.

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, and test on every push/PR, with a Postgres service container.

## Conventions

- ESM everywhere (`"type": "module"`); relative imports use the `.js` extension (NodeNext resolution).
- Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Use `import type` for type-only imports.
- Tests: Vitest, `*.test.ts` next to the source.
- Generated Prisma client lives in `apps/api/src/generated/` (gitignored); the api's `dev`/`build`/`typecheck`/`test` scripts regenerate it.
- pnpm enforces a minimum release age on dependencies, in strict mode: an install fails if a version is too new. Pin an older version; don't add `minimumReleaseAgeExclude` entries. Packages allowed to run install scripts are listed under `allowBuilds` in `pnpm-workspace.yaml`.
- Windows/PowerShell 5.1: don't round-trip source files through `Get-Content`/`Set-Content` (they mangle UTF-8). Use the editor tools.
