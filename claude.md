# Tenara Family - Project Scope & Guidelines

## Overview

**Tenara Family** ("Building Habits, Together.") is a family chore and habit app: recurring tasks, assignments, review, and completion history. It's the first app of the **Tenara suite** (with Tenara Team and Tenara Focus), which will share a common core, the Tenara Engine. See [docs/tenara-suite.md](docs/tenara-suite.md). Packages use the `@tenara/*` npm scope.

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
- Parent Verification & API Specification: https://docs.google.com/document/d/1aVgNC2rhS3Ta8D6B6T9meMqAREGB4k2EIgxjSCcQ6Ys/edit
  - Defines the approval queue, submissions, rework vs. reject, checklists, reference photos, and photo mark-up. The plan's "How the verification spec was adopted" section lists what was taken as-is and what was adapted (identity comes from the token, never the body; camelCase, family-scoped routes).
- Branding Suite (brand, design tokens, icons, behavioral design principles; the doc still uses the old suite name, Titan): https://docs.google.com/document/d/1845bT79N69Hj7VzUnIxRvsugfV8-VF1yaMyqRngnZEQ/edit
  - Its principles are product rules, not just style: routine chores earn XP while extra jobs earn coins (by default), never deduct earned progress as punishment, no sibling leaderboards, daily-digest notifications by default. See the plan's "Branding and behavioral principles".
- Rewards are customizable per family: real money, points, or none, plus optional gamification (XP, levels, badges) that works with any of them. See the plan's "Rewards & gamification".

## Tech stack (decided)

- **Monorepo:** pnpm workspaces + Turborepo. Node >= 24 (dev machine runs Node 26).
- **App:** Expo (React Native + Expo Router + react-native-web), one codebase for iOS/Android/Web. (`apps/mobile`, Step 5)
- **API:** Node + Fastify 5 + Zod 4 via `fastify-type-provider-zod`. Request/response schemas live in `packages/contracts`. (ts-rest was dropped: unmaintained, Zod 3 only.)
- **DB:** PostgreSQL 16 via Prisma 7 (driver adapter `@prisma/adapter-pg`, config in `apps/api/prisma.config.ts`). Jobs via pg-boss (Step 4).
- **Auth:** argon2id password/PIN hashes (`@node-rs/argon2`), 15-min HS256 access JWTs (`jose`), rotating single-use refresh tokens stored as SHA-256 hashes. The web app gets its refresh token as an httpOnly cookie (`tenara_rt`, path `/v1/auth`) instead of in JSON.
- **Storage / push:** S3-compatible photo storage (RustFS locally, pinned in docker-compose; MinIO no longer publishes images); Expo Push Notifications.
- **Payments:** RevenueCat (`react-native-purchases` in the app for App Store, Google Play, and Stripe on the web; its REST API and webhook on the server). **Widgets:** `@bacons/apple-targets` (iPhone, SwiftUI) and `react-native-android-widget`.
- **Deploy:** `apps/api/Dockerfile` (Node 24, built from the repo root) and `fly.toml`; EAS profiles in `apps/mobile/eas.json`; the web build is static. The runbook is [docs/deploy.md](docs/deploy.md).
- **Pinned on purpose:** TypeScript `~6.0` (typescript-eslint doesn't support TS 7 yet). Prisma `7.10.1` (npm's `latest` tag points at an 8.0 release candidate). Prisma 7 officially lists Node 20/22/24 but works on 26.

## Architecture rules

- **All business rules live in `packages/domain`** (pure TypeScript, no I/O: no DB, network, or clock reads; pass `now` in explicitly). The API enforces them; the app never re-implements them. That way an Alexa skill can be just another API client.
- `packages/contracts` holds every request/response Zod schema. Changing one is changing the public API.
- Each API module (`apps/api/src/modules/<name>/`) has `routes.ts` (HTTP + schemas only) → `service.ts` (logic + Prisma queries), with `*.test.ts` alongside. Services take a `Deps` object (`db`, `config`, `accessTokens`, `now`) and never call `new Date()` directly.
- Services throw `AppError` (see `apps/api/src/errors.ts`) with a stable `code`; every error response is `{ error: { code, message, details? } }`.
- Family-scoped routes authorize via `requireMember` / `requireParent` (`modules/access.ts`). Non-members get 404, not 403.
- Database rows become API responses only through `modules/dto.ts` (accounts/families) and `modules/instances/views.ts` (chores), so hashes can't leak and shapes stay consistent.
- **The app never decides permissions.** Buttons come from each instance's `availableActions`, PIN prompts are hints, and the API enforces everything. Shared-device rules: a parent switches to a kid freely; switching to a parent always needs that parent's PIN; kids' own phones are set up with one-time pairing codes.
- App screens use the components in `apps/mobile/src/components` and colors/type from `@tenara/tokens` (via `src/theme.ts`); no hard-coded hex values in screens.
- Every swipe gesture has a visible button that does the same thing (mouse, keyboard, screen readers). On the web, ignore taps that end a drag (see `features/review/ReviewCard.tsx`).
- The API lists CORS methods explicitly (`app.ts`). A new HTTP method needs adding there, or the web app can't call it.
- **Photos:** clients never send or receive storage keys. They upload with a form from `POST /uploads` and refer to the photo by `uploadId`; responses carry signed URLs, made only in `instances/views.ts` (`photoSigner`) and the chore DTO. Storage is `Deps.storage` (`lib/storage`); tests use the in-memory fake (`t.storage`, `t.uploadPhoto`), so CI needs no storage server. Check uploads (`checkUploads`) outside transactions and claim them (`claimUploads`) inside.
- **Rewards:** balances are never stored; they're sums over `LedgerEntry`, per member and currency. Entries are only added: chore rewards by `modules/rewards/hooks.ts` (`onApproved`), everything else by `modules/rewards/service.ts`. An amount only goes down through a payout, a redemption, or a correction (which needs a note). Spending points locks the member's row first. The arithmetic and formatting live in `packages/domain/src/rewards.ts`.
- **XP and badges:** written only by `onApproved` (`modules/rewards/hooks.ts`), inside the approval transaction; never deducted or removed. Streaks are computed from history (`modules/progress/history.ts`), never stored. Rules (XP formula, level curve, streaks, badges) live in `packages/domain/src/gamification.ts`. Kids see only their own progress; there is no leaderboard.
- **Notifications:** created only with `notify()` (`modules/notifications/service.ts`), inside the caller's transaction; it never sends anything and never tells the person who caused the event. Pushes are sent only by jobs (`jobs/notifications.ts`) through `Deps.push`; tests use the in-memory fake (`t.push`). Kinds, defaults, quiet hours, and wording live in `packages/domain/src/notifications.ts`.
- **Job board:** `OPEN` chores create occurrences with `board: OPEN` and no assignee. `claim` / `release` go through `transition()` like any action; never change `board` or assignees for them anywhere else. Unclaimed jobs expire (`expireOpenInstance`), they don't go late.
- **Web tokens:** requests from the web app send `X-Tenara-Client: web`. Routes that issue tokens pass them through `deliverTokens()` (`plugins/webSession.ts`), which turns the refresh token into the cookie; refresh and logout read it with `presentedRefreshToken()`. The web app never stores a token in `localStorage` (`persistable()` in `auth/session.ts`). Services return `IssuedAuth`/`IssuedTokens` (always with the refresh token); only the route decides where it goes.
- **Plans (Basic vs Pro):** limits, features, the trial, and what pauses when Pro ends live only in `packages/domain/src/plans.ts`. The API enforces them only through `modules/plans/service.ts` (`requirePro`, `requireRoomFor`, which throw `PRO_REQUIRED`) and the downgrade helpers (`photoRequired`, `earnsCoins`, `boardOpen`, `historyStart`) at the places they apply. Pro ending never deletes or deducts anything; turning a Pro setting off is always allowed. The app shows locks from `family.plan` (`ProBadge`) and never decides. Test families are Pro unless `t.createFamily(parent, name, { plan })` says otherwise.
- **Billing:** the RevenueCat customer id is the family id. `Subscription` rows are written only by `modules/billing/service.ts` (`syncSubscription`), which asks RevenueCat through `Deps.billing`; the webhook body only says whom to look up. Tests use the in-memory fake (`t.billing`).
- **Widgets:** never call the API or hold a token. The Today screen writes a snapshot (`features/widgets/snapshot.ts`) and `publishWidget()` hands it over (`publish.ios.ts`: App Group; `publish.android.tsx`: storage plus a redraw; web: nothing). Native widget libraries are loaded lazily so Expo Go and the web keep working.
- **Starter chores:** templates are data in `packages/domain/src/starterChores.ts`; adding them goes through `modules/chores/starter.ts`, which pools each chore to members old enough and skips templates the family already has (`Chore.templateId`).
- **Production config:** `loadConfig()` refuses development secrets and non-https origins or photo URLs when `NODE_ENV=production`. A new required production setting belongs in `productionProblems()` and `.env.production.example`.
- **Never update a chore instance's `status` directly.** Use `transition()` in `modules/instances/transitions.ts`: it applies the domain rules, rejects stale concurrent updates, writes the audit event, and releases rewards.
- Planning (`modules/instances/generate.ts`) is idempotent. After anything that changes who should get what, call `replanUntouched()`; it only replaces occurrences nobody has touched.
- Inside a Prisma transaction, run queries one at a time (no `Promise.all` on `tx`): a transaction has one connection. Prisma 7 itself still triggers a `pg` "client.query() while executing" deprecation warning internally; it's harmless on pg 8.

## Layout

```
apps/mobile         Expo app (iOS / Android / web), Expo Router
  app/              routes: (auth) sign-in, sign-up, pair; (app) onboarding (4-step setup), who,
                    chore/[id], chore-edit/[id] ("new" creates), starter*, pro*, rewards,
                    rewards-settings*;
                    (tabs) Today, Review*, Chores*, Family, Me
                    (* parents only)
  src/api/          typed HTTP client + one function per endpoint
  src/auth/         session manager (single-flight refresh), token storage
  src/components/   Tenara UI building blocks (ui.tsx, forms.tsx, brand.tsx, PinPad, Celebration)
  src/features/     screen logic; the pure parts are unit-tested (today/sections, chores/form,
                    review/queue, week/week, photos/pins + upload, rewards/format,
                    progress/celebrate, notifications/settings, starter/selection, setup/flow,
                    pro/plan, widgets/snapshot)
  targets/widget/   the iPhone widget (SwiftUI), built by @bacons/apple-targets on EAS
  index.ts          app entry: Expo Router, plus the Android widget task
  e2e/              Playwright web smoke test (uses installed Edge)
packages/tokens     Tenara design tokens and per-app themes
apps/api            Fastify API + background jobs
  prisma/           schema.prisma, migrations/, seed.ts
  src/modules/      auth, families (members, kid profile switching), invites,
                    chores (+ starter list), instances (planning, agenda, actions, submissions),
                    reviews, plans (Basic vs Pro, trial), billing (RevenueCat webhook, refresh),
                    uploads (photo upload forms, attach checks),
                    rewards (ledger, payouts, catalog, redemptions, job board listing),
                    progress (XP, levels, streaks, badges, family goal),
                    notifications (notify, inbox, settings, devices; hooks.ts maps events)
  src/lib/storage/  PhotoStorage interface + S3 adapter (s3.test.ts runs against local storage)
  src/lib/push/     PushSender interface + Expo adapter
  src/lib/billing/  Billing interface + RevenueCat adapter
  src/jobs/         pg-boss scheduling; planning.ts, lateness.ts, photoCleanup.ts hold the job logic
  src/worker.ts     optional standalone job worker (no HTTP)
  src/test/         test harness (useTestApp) and DB setup
packages/domain     recurrence (+ describeRecurrence), chore state machine, scheduler and
                    day load (summarizeDayLoad), points, defaults, starter chores, plans
packages/contracts  shared Zod request/response schemas
assets/brand/       app icons per Tenara app (SVG masters; see each folder's README)
docs/               plan, Tenara suite notes
```

## Commands (run from the repo root)

- `pnpm install`: install everything
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`: run across all packages via Turborepo
- `pnpm format` (writes) / `pnpm format:check` (CI)
- `pnpm db:up` / `pnpm db:down`: start/stop Postgres + photo storage (RustFS; needs Docker Desktop running)
- `pnpm --filter @tenara/api dev`: API on http://localhost:3000 (copy `apps/api/.env.example` to `.env` first)
- `pnpm --filter @tenara/api db:migrate --name <change>`: create + apply a migration after editing `schema.prisma`. It needs an interactive terminal when a change could lose data (e.g. dropping a column). From a script: write the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `pnpm --filter @tenara/api db:deploy`.
- `pnpm --filter @tenara/api db:seed`: demo family (mom@example.com / dad@example.com, password `chores-demo-password`; Billy PIN 1111, Sally PIN 2222), using points, with a small rewards catalog and a "Wash the car" job on the job board
- `pnpm --filter @tenara/api job:plan` / `job:mark-late` (also expires unclaimed job-board jobs) / `job:cleanup-photos` / `job:send-instant` / `job:send-digests` / `job:check-push-receipts`: run a background job once, now
- `pnpm --filter @tenara/api storage:setup`: apply the photo bucket's CORS and lifecycle rules (production setup; see docs/deploy.md)
- `docker build -f apps/api/Dockerfile -t tenara-api .`: the production API image (migrations: `npm run db:deploy` inside it)
- `pnpm --filter @tenara/api worker`: run jobs in a separate process (then set `RUN_JOBS=false` on the API)
- `pnpm --filter @tenara/mobile start`: Expo dev server (scan the QR code with Expo Go; the phone finds the API on this computer's LAN address). `web` opens it in a browser.
- `pnpm --filter @tenara/mobile export:web` then `pnpm --filter @tenara/mobile exec expo serve --port 8081`: static web build
- `pnpm --filter @tenara/mobile e2e`: Playwright smoke tests (family setup + kid; parent tools) (needs the built API on :3000 and the web app on :8081; rebuild the API first, a stale `dist` fails in confusing ways)
- `pnpm --filter @tenara/mobile icons`: re-export icon PNGs after editing `assets/brand`
- Single package: `pnpm --filter @tenara/domain test`

API tests need Postgres running. They use a separate `chores_test` database that the test setup creates and migrates automatically, and they wipe it between tests. Use the `useTestApp()` harness; it provides a controllable clock (`t.advance(ms)`). Remember that advancing past 15 minutes expires access tokens, so call `t.refresh(session)` afterwards.

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, and test on every push/PR, with a Postgres service container.

## Conventions

- ESM everywhere (`"type": "module"`); relative imports use the `.js` extension (NodeNext resolution).
- Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Use `import type` for type-only imports.
- Tests: Vitest, `*.test.ts` next to the source.
- Generated Prisma client lives in `apps/api/src/generated/` (gitignored); the api's `dev`/`build`/`typecheck`/`test` scripts regenerate it.
- pnpm enforces a minimum release age on dependencies, in strict mode: an install fails if a version is too new. Pin an older version; don't add `minimumReleaseAgeExclude` entries. Packages allowed to run install scripts are listed under `allowBuilds` in `pnpm-workspace.yaml`.
- Windows/PowerShell 5.1: don't round-trip source files through `Get-Content`/`Set-Content` (they mangle UTF-8). Use the editor tools.
