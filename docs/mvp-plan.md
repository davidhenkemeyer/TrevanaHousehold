# Family Chores App: MVP Plan

## Context

This is a new project: the repo contains only `claude.md`. The goal is a family chore app that:

- runs on iOS, Android, and the web (PC);
- assigns recurring chores (daily, weekly, monthly, quarterly, annual) automatically, based on each member's capacity;
- shows what's due today;
- tracks chores through a status workflow with parent verification;
- supports photo proof, rewards/points, and push notifications.

Later it should work with Alexa and other voice assistants.

Inputs: the old Google design doc (state machine, notification list, family/PIN model, REST resources) and the choices you just made: **TypeScript backend, PostgreSQL, and all three optional features in the MVP**.

Guiding rule: **all business logic lives on the server and in a shared domain package, never in the UI.** That way an Alexa skill becomes just another API client later.

## Tech stack

| Concern                   | Choice                                                                                                                                          | Why                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Monorepo                  | pnpm workspaces + Turborepo                                                                                                                     | Shared types and tooling across the app and the server                     |
| App (iOS / Android / Web) | Expo SDK (React Native + Expo Router + react-native-web), TypeScript                                                                            | One codebase for all three platforms. EAS builds the store binaries.       |
| UI data layer             | TanStack Query + typed API client                                                                                                               | Caching, offline-friendly retries                                          |
| API                       | Node 22 + Fastify + Zod, REST contract via `ts-rest`                                                                                            | Typed client for the app. OpenAPI output for Alexa and other clients.      |
| DB / ORM                  | PostgreSQL 16 + Prisma (migrations)                                                                                                             | Strong enums, JSON, and timezone support                                   |
| Background jobs           | pg-boss (job queue that runs inside Postgres)                                                                                                   | No Redis needed. Handles scheduled and retryable jobs.                     |
| Auth                      | Email + password (argon2) with JWT access/refresh tokens for parents and teens. A kid profile can sign in on a shared device with a member PIN. | Simple now. Can grow into OAuth2 later, which Alexa account linking needs. |
| Photo storage             | S3-compatible: MinIO locally, Cloudflare R2 or S3 in production. Uploads use presigned URLs.                                                    | Image files never pass through the API server                              |
| Push                      | Expo Push Notifications (wraps APNs and FCM)                                                                                                    | One API for iOS and Android                                                |
| Tests                     | Vitest for the domain and API (with a test Postgres via Docker), Playwright later for web                                                       |                                                                            |
| CI                        | GitHub Actions: lint, typecheck, test                                                                                                           | Replaces the Jenkins idea from the old doc; much less to run yourself      |
| Local dev                 | `docker-compose.yml` runs Postgres + MinIO                                                                                                      |                                                                            |

## Directory structure

```
FamilyChoresApp/
├─ claude.md                    # updated with the stack & conventions in Step 0
├─ package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├─ docker-compose.yml           # postgres, minio
├─ .github/workflows/ci.yml
├─ apps/
│  ├─ mobile/                   # Expo app (iOS/Android/Web)
│  │  ├─ app/                   # Expo Router routes
│  │  │  ├─ (auth)/             # sign-in, sign-up, join-family, kid-pin
│  │  │  ├─ (tabs)/today.tsx    # daily view
│  │  │  ├─ (tabs)/chores/      # list, [id] detail, editor (parent)
│  │  │  ├─ (tabs)/review.tsx   # parent verification queue
│  │  │  ├─ (tabs)/rewards.tsx
│  │  │  └─ (tabs)/family/      # members, capacity, invites, settings
│  │  └─ src/{components,features,api,hooks,theme}/
│  └─ api/                      # Fastify server
│     ├─ prisma/schema.prisma (+ migrations, seed.ts)
│     └─ src/
│        ├─ modules/{auth,families,members,chores,instances,photos,rewards,notifications}/
│        │     # each: routes.ts, service.ts, repo.ts, *.test.ts
│        ├─ jobs/{generateInstances,markLate,sendNotifications}.ts
│        ├─ plugins/            # auth, prisma, error handling
│        └─ server.ts
└─ packages/
   ├─ domain/                   # PURE TS, no I/O: recurrence, state machine, scheduler, points
   └─ contracts/                # Zod schemas + ts-rest API contract (shared by api & mobile)
```

Shared lint, format, and TS settings live at the repo root (`eslint.config.js`, `.prettierrc.json`, `tsconfig.base.json`) rather than in a separate config package.

`apps/alexa/` comes after the MVP.

## Data models (Prisma sketch)

```
Family        id, name, timezone, joinCode(unique, 6 digits), createdAt
User          id, email?(unique), passwordHash?, displayName, avatarColor, createdAt
              # kids may have no email: they are created by a parent and use PIN login
Membership    id, familyId, userId, role(PARENT|CHILD), pinHash?,
              capacity Json  # minutes per weekday, e.g. {mon:30,...,sun:60}
              pointsBalance Int, active Bool         @@unique(familyId,userId)
Invite        id, familyId, email, role, tokenHash, expiresAt, acceptedAt?

Chore         id, familyId, name, description, completionCriteria,
(template)    effortMinutes, rewardPoints, defaultPriority(LOW|NORMAL|HIGH),
              requiresPhoto Bool, active Bool,
              recurrence Json   # {freq:DAILY|WEEKLY|MONTHLY|QUARTERLY|ANNUAL,
                                #  interval, byWeekday?, byMonthDay?, startDate, endDate?,
                                #  timeOfDay?}  — see packages/domain/src/recurrence.ts
              deadlineMinutes Int  # "due N after assignment", e.g. 1 week
              assignMode(FIXED|ROTATE|AUTO), createdById
ChoreEligible choreId, membershipId   # FIXED: these owners, ROTATE/AUTO: the candidate pool

ChoreInstance id, choreId, familyId, occurrenceDate(date), availableAt, dueAt,
(occurrence)  status, isLate Bool, priority, completedAt?, verifiedAt?, verifiedById?,
              reviewNote?             @@unique(choreId, occurrenceDate, ...) for idempotency
InstanceAssignee instanceId, membershipId    # supports "Billy and Sally"
ChoreEvent    id, instanceId, actorId, fromStatus, toStatus, note, createdAt  # audit trail
CompletionPhoto id, instanceId, storageKey, uploadedById, createdAt

Reward        id, familyId, name, costPoints, active
PointsLedger  id, membershipId, delta, reason(CHORE_VERIFIED|REDEMPTION|ADJUSTMENT),
              instanceId?, redemptionId?, createdAt   # balance = sum; cached on Membership
Redemption    id, rewardId, membershipId, status(REQUESTED|APPROVED|DENIED), decidedById?

DeviceToken   id, userId, expoPushToken, platform
Notification  id, userId, type, payload Json, sentAt?, readAt?
```

### Chore instance state machine (in `packages/domain`)

Statuses: `NEW, IN_PROGRESS, DEFERRED, COMPLETED, VERIFIED, NOT_APPROVED, CANCELED`.

"Late" is a **flag** (`isLate`) plus a forced HIGH priority, not separate statuses. The old doc's `Late-Not Started` and `Late-WIP` are the same as `NEW+late` and `IN_PROGRESS+late`. Using a flag avoids doubling the number of states.

- NEW → IN_PROGRESS | DEFERRED | COMPLETED | CANCELED (completing straight from NEW allows a one-tap "done", including by voice)
- DEFERRED → NEW | IN_PROGRESS | CANCELED
- IN_PROGRESS → COMPLETED | NEW | CANCELED
- COMPLETED → VERIFIED | NOT_APPROVED (parent only)
- NOT_APPROVED → IN_PROGRESS | COMPLETED (priority is set to HIGH)
- A parent who completes any chore (their own or a child's) sends it straight to VERIFIED, per the design doc ("if a parent says a chore is complete, no verification is needed").
- A chore with `requiresPhoto` cannot reach COMPLETED without a photo. This applies to children only; a parent's completion needs no proof.
- Only a parent can cancel, and they can cancel from any non-terminal status (including COMPLETED and NOT_APPROVED).
- Children can only act on chores assigned to them; parents can act on any chore.
- Reaching VERIFIED writes a PointsLedger entry. Points are split across assignees as whole numbers; any remainder goes to the first assignees by id.
- Only outstanding chores (NEW, IN_PROGRESS, DEFERRED, NOT_APPROVED) can become late. A COMPLETED chore awaiting review is never marked late.

Implemented in `packages/domain/src/stateMachine.ts` and `lateness.ts`.

### Recurrence rules (implemented in `packages/domain/src/recurrence.ts`)

- Weekly intervals ("every 2 weeks") count Monday–Sunday weeks from the week containing the start date.
- Monthly, quarterly, and annual chores **clamp** to the month's end: "the 31st" falls on Feb 28/29, Apr 30, and so on, and an annual Feb 29 chore falls on Feb 28 in non-leap years. `byMonthDay: -1` means the last day of the month.
- Each chore has a local `timeOfDay` when it becomes available (default 00:00). Whole days of a deadline are added on the local calendar, so "due in 1 week" keeps the same local time across DST changes.
- DST: a local time that doesn't exist (spring forward) moves ahead by the gap; a time that happens twice (fall back) uses the earlier one.

### Scheduling algorithm (in `packages/domain`)

1. A nightly job runs for each family, in that family's timezone. It expands every active chore's recurrence over a rolling 7-day window and creates the instances that don't exist yet. A unique key prevents duplicates.
2. Assignment depends on the chore's mode:
   - **FIXED**: assign to the chore's listed owners. Each owner's day is charged their share of the effort (rounded up).
   - **ROTATE**: assign to the next person in the candidate pool, in turn.
   - For ROTATE and AUTO, an empty pool means "any family member". Within a day, FIXED chores are planned first, then ROTATE, then AUTO, so flexible chores fill in around fixed ones.
   - **AUTO**: for each day, sort that day's chores by priority, then by effort (largest first). Give each chore to the eligible member with the highest _remaining capacity ratio_ (remaining minutes ÷ that day's capacity). On a tie, pick whoever did this chore least recently. If nobody has room, assign to the member with the most room anyway and mark the day "over capacity" so parents can see it.
3. A job every 15 minutes finds instances with `dueAt < now` that aren't in a terminal state. It sets `isLate`, raises priority to HIGH, and queues the "late" notification.

## Roadmap (each step ends green in CI)

0. **Foundation**
   - Set up the monorepo: pnpm, Turborepo, TypeScript, ESLint, Prettier.
   - Add `docker-compose.yml` and the GitHub Actions CI workflow.
   - Rewrite `claude.md` with the stack, commands, and conventions.
1. **Domain core** (`packages/domain`)
   - Recurrence expansion, including month-end, leap-year, and DST edge cases.
   - The state machine and the auto-assignment algorithm.
   - Heavy unit tests: this is where most bugs would come from.
2. **DB + auth + families** (`apps/api`)
   - Prisma schema and migrations, plus seed data (the Billy/Sally example family).
   - Parent sign-up and login, refresh tokens.
   - Create a family, invite members by email, join by code, kid profiles with PIN.
   - Edit member capacity.
3. **Chores API**
   - CRUD for chores and their eligible members.
   - Instance list: today's, by member, and the review queue.
   - Status-change endpoints that enforce the domain state machine, and write ChoreEvent records.
4. **Jobs**
   - pg-boss setup, the instance-generation job, and the late-marking job.
   - Integration tests run against a real Postgres.
5. **App shell + Today view**
   - Expo app with auth screens and family onboarding.
   - Today view: chores grouped by status, with actions to start, defer, and complete.
   - Chore detail screen with history.
   - Runs on web, iOS simulator, and Android emulator from day one.
6. **Parent tools**
   - Chore editor: recurrence picker, deadline, effort, points, assignment mode.
   - Member capacity editor.
   - Review queue: verify, or reject with a note.
   - Week view showing where members are over capacity.
7. **Photo proof**
   - Upload via presigned URL, using the camera or the photo library.
   - Thumbnail in the review queue.
   - Enforce the `requiresPhoto` rule.
8. **Rewards/points**
   - Points ledger, balance display, and the reward catalog.
   - Redemption requests, with parent approval.
9. **Push notifications**
   - Register device tokens.
   - Send the six notification types from the design doc (assigned, late, completed, verified, not approved, canceled) through the Expo Push API.
   - Per-user mute settings.
10. **Deploy + beta**
    - Deploy the API (container on Fly.io, Railway, or Render) with managed Postgres (Neon) and R2 storage.
    - Deploy the web build as a static site.
    - Ship test builds through EAS: TestFlight for iOS, Play internal testing for Android.

- **Post-MVP:** an Alexa skill (`apps/alexa`, Lambda) with OAuth account linking and intents like "what are my chores today" and "mark dishes done". Also Google Assistant/Home, and smarter scheduling (vacations, swapping chores).

## Verification

- `pnpm test`: domain unit tests (recurrence, transitions, scheduler fairness and capacity cases) and API integration tests against the Postgres in docker-compose.
- `pnpm dev`: starts the API and Expo. Then test:
  1. Seed a family.
  2. Create a weekly AUTO chore.
  3. Run the generate job manually (`pnpm --filter api job:generate`).
  4. Confirm instances are spread according to capacity.
  5. Complete a chore as a kid, with a photo, then verify it as the parent. Confirm the points balance and a push notification on a device running Expo Go.
- Test the web build in a desktop browser, and the native builds on the iOS simulator and an Android emulator.
