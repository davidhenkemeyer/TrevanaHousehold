# Titan Household: MVP Plan

## Context

**Titan Household** ("Building Habits, Together.") is the family app in the Titan suite (with Titan Agile and Titan Focus; see [docs/titan-suite.md](titan-suite.md)). It's a family chore app that:

- runs on iOS, Android, and the web (PC);
- assigns recurring chores (daily, weekly, monthly, quarterly, annual) automatically, based on each member's capacity;
- shows what's due today;
- tracks chores through a status workflow with fast parent review (photo proof, checklists, mark-up);
- pays out in the family's choice of reward (real money, points, or nothing), with optional XP, badges, and achievements;
- sends push notifications.

Later it should work with Alexa and other voice assistants.

Inputs:

- The original design doc (state machine, notification list, family/PIN model, REST resources).
- The "Parent Verification & API Specification" doc (approval queue, submissions, rework vs. reject, checklists, golden-standard photos, photo mark-up, pending rewards). See [How the verification spec was adopted](#how-the-verification-spec-was-adopted).
- The Titan Branding Suite doc (brand, design tokens, icon specs, and behavioral design principles). See [Titan branding and behavioral principles](#titan-branding-and-behavioral-principles).
- Decisions made along the way: TypeScript backend, PostgreSQL, photo proof + rewards + push in the MVP, customizable rewards with a routine/extra-job default.

Guiding rule: **all business logic lives on the server and in a shared domain package, never in the UI.** That way an Alexa skill becomes just another API client later.

## Tech stack

| Concern                   | Choice                                                                                                            | Why                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Monorepo                  | pnpm workspaces + Turborepo                                                                                       | Shared types and tooling across the app and the server                     |
| App (iOS / Android / Web) | Expo SDK (React Native + Expo Router + react-native-web), TypeScript                                              | One codebase for all three platforms. EAS builds the store binaries.       |
| UI data layer             | TanStack Query + typed API client                                                                                 | Caching, offline-friendly retries                                          |
| API                       | Node + Fastify + Zod via `fastify-type-provider-zod`; request/response schemas shared in `packages/contracts`     | Typed client for the app. OpenAPI output for Alexa and other clients.      |
| DB / ORM                  | PostgreSQL 16 + Prisma 7 (migrations)                                                                             | Strong enums, JSON, and timezone support                                   |
| Background jobs           | pg-boss (job queue that runs inside Postgres)                                                                     | No Redis needed. Handles scheduled and retryable jobs.                     |
| Auth                      | Email + password (argon2id), JWT access + rotating refresh tokens. Kid profiles are reached by profile switching. | Simple now. Can grow into OAuth2 later, which Alexa account linking needs. |
| Photo storage             | S3-compatible: MinIO locally, Cloudflare R2 or S3 in production. Uploads use presigned URLs.                      | Image files never pass through the API server                              |
| Push                      | Expo Push Notifications (wraps APNs and FCM)                                                                      | One API for iOS and Android                                                |
| Tests                     | Vitest for the domain and API (with a test Postgres via Docker), Playwright later for web                         |                                                                            |
| CI                        | GitHub Actions: format, lint, typecheck, test (with a Postgres service)                                           | Replaces the Jenkins idea from the old doc; much less to run yourself      |
| Local dev                 | `docker-compose.yml` runs Postgres + MinIO                                                                        |                                                                            |

## Directory structure

```
FamilyChoresApp/
├─ claude.md                    # stack, commands, conventions
├─ package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├─ docker-compose.yml           # postgres, minio
├─ .github/workflows/ci.yml
├─ apps/
│  ├─ mobile/                   # Expo app (iOS/Android/Web)
│  │  ├─ app/                   # Expo Router routes
│  │  │  ├─ (auth)/             # sign-in, sign-up, accept invite, "who's using this device?"
│  │  │  ├─ (tabs)/today.tsx    # daily view
│  │  │  ├─ (tabs)/chores/      # list, [id] detail, editor (parent)
│  │  │  ├─ (tabs)/review.tsx   # parent approval queue + photo mark-up
│  │  │  ├─ (tabs)/rewards.tsx  # balance/wallet, catalog, badges & level
│  │  │  └─ (tabs)/family/      # members, capacity, invites, reward settings
│  │  └─ src/{components,features,api,hooks,theme}/
│  └─ api/                      # Fastify server
│     ├─ prisma/schema.prisma (+ migrations, seed.ts)
│     └─ src/
│        ├─ modules/{auth,families,invites,chores,instances,reviews,photos,rewards,
│        │           gamification,notifications}/   # each: routes.ts, service.ts, *.test.ts
│        ├─ jobs/{generateInstances,markLate,sendNotifications}.ts
│        ├─ plugins/            # authentication
│        └─ server.ts
└─ packages/
   ├─ domain/                   # PURE TS, no I/O: recurrence, state machine, scheduler,
   │                            #   rewards math, XP/levels, badge rules
   └─ contracts/                # Zod request/response schemas (shared by api & mobile)
```

Shared lint, format, and TS settings live at the repo root (`eslint.config.js`, `.prettierrc.json`, `tsconfig.base.json`). `apps/alexa/` comes after the MVP.

## Data models (Prisma sketch)

Built in Step 2:

```
Family        id, name, timeZone, createdAt
User          id, email?(unique), passwordHash?, displayName, avatarColor, createdAt
              # kids may have no email: they are created by a parent (see "Kid sign-in")
Membership    id, familyId, userId, role(PARENT|CHILD), pinHash?, pinFailedAttempts,
              pinLockedUntil?, capacity Json  # minutes per weekday, e.g. {mon:30,...,sun:60}
              pointsBalance Int, active Bool   @@unique(familyId,userId)
              # pointsBalance is replaced by RewardBalance in Step 8
Invite        id, familyId, email, role, tokenHash, expiresAt, acceptedAt?, revokedAt?
RefreshToken  id, userId, tokenHash, expiresAt, revokedAt?, replacedById?
              # single-use, rotated on every refresh; replaying a used one revokes all sessions
```

Planned:

```
Chore         id, familyId, name, description, effortMinutes, defaultPriority(LOW|NORMAL|HIGH),
(template)    requiresPhoto Bool, reviewPolicy(REVIEW_EACH|BATCH_OK|AUTO_APPROVE),
              referencePhotoKey?   # "golden standard" photo of what done looks like
              rewardAmount Int     # in the family's currency: cents for money, points for points
              xpOverride Int?      # default XP is derived from effort
              recurrence Json      # see packages/domain/src/recurrence.ts
              deadlineMinutes Int  # "due N after assignment", e.g. 1 week
              assignMode(FIXED|ROTATE|AUTO), active Bool, createdById
ChoreChecklistItem  id, choreId, position, text   # sub-tasks: "3/3 tasks completed"
ChoreEligible choreId, membershipId   # FIXED: these owners, ROTATE/AUTO: the candidate pool

ChoreInstance id, choreId, familyId, occurrenceDate(date), availableAt, dueAt,
(occurrence)  status, isLate Bool, priority     @@unique(choreId, occurrenceDate)
InstanceAssignee instanceId, membershipId        # supports "Billy and Sally"
InstanceEvent id, instanceId, actorId, action, fromStatus, toStatus, createdAt  # audit trail

Submission    id, instanceId, submittedById, submittedAt,
              checklistState Json   # [{itemId, checked}]; partial submissions are allowed
              photoKeys String[]    # storage keys issued by the upload flow, never client URLs
Review        id, submissionId, reviewerId, action(APPROVE|REQUEST_REWORK|REJECT),
              note?, annotations Json?   # tap-to-pin comments: [{pin, xPercent, yPercent, comment}]
              batch Bool, createdAt
              # post-MVP: drawings (freehand strokes) and audioKey (15-second voice note)

RewardSettings  familyId, currency(MONEY|POINTS|NONE), currencyCode? (e.g. "USD"),
                gamificationEnabled Bool
RewardLedger    id, membershipId, currency(MONEY|POINTS), delta Int,
                reason(CHORE_APPROVED|PAYOUT|REDEMPTION|ADJUSTMENT), instanceId?, createdAt
RewardBalance   membershipId, currency, balance Int   # cache of the ledger sum
Reward          id, familyId, name, cost Int, active      # catalog, POINTS families
Redemption      id, rewardId, membershipId, status(REQUESTED|APPROVED|DENIED), decidedById?
Payout          id, membershipId, amountCents, paidById, note?, createdAt   # MONEY families

XpLedger        id, membershipId, delta Int, reason, instanceId?, createdAt
BadgeAward      id, membershipId, badgeId, awardedAt   @@unique(membershipId, badgeId)
                # badge definitions live in packages/domain, not the database

DeviceToken   id, userId, expoPushToken, platform
Notification  id, userId, type, payload Json, sentAt?, readAt?
```

### Chore instance state machine (in `packages/domain`)

Statuses: `NEW, IN_PROGRESS, DEFERRED, PENDING_REVIEW, APPROVED, NEEDS_REWORK, REJECTED, CANCELED`. Final statuses: APPROVED, REJECTED, CANCELED.

"Late" is a **flag** (`isLate`) plus a forced HIGH priority, not separate statuses. The old doc's `Late-Not Started` and `Late-WIP` are the same as `NEW+late` and `IN_PROGRESS+late`.

| Action        | From                           | To             | Who                |
| ------------- | ------------------------------ | -------------- | ------------------ |
| start         | NEW, DEFERRED, NEEDS_REWORK    | IN_PROGRESS    | assignee or parent |
| defer         | NEW                            | DEFERRED       | assignee or parent |
| reset         | IN_PROGRESS, DEFERRED          | NEW            | assignee or parent |
| complete      | NEW, IN_PROGRESS, NEEDS_REWORK | PENDING_REVIEW | assignee or parent |
| approve       | PENDING_REVIEW                 | APPROVED       | parent             |
| requestRework | PENDING_REVIEW                 | NEEDS_REWORK   | parent             |
| reject        | PENDING_REVIEW                 | REJECTED       | parent             |
| cancel        | any non-final                  | CANCELED       | parent             |

- Completing goes straight to APPROVED when a parent does it (design doc: "if a parent says a chore is complete, no verification is needed") or when the chore's review policy is AUTO_APPROVE.
- Completing straight from NEW allows a one-tap "done", including by voice.
- A chore with `requiresPhoto` can't be completed by a child without a photo, even under AUTO_APPROVE. A parent's completion needs no proof.
- NEEDS_REWORK forces HIGH priority.
- REJECTED and CANCELED are both final but mean different things. Cancel withdraws the chore itself. Reject declines submitted work and forfeits its reward; it stays in the family history.
- Children can only act on chores assigned to them; parents can act on any chore.
- Reaching APPROVED releases rewards (see [Rewards & gamification](#rewards--gamification)).
- Only outstanding chores (NEW, IN_PROGRESS, DEFERRED, NEEDS_REWORK) can become late. A chore awaiting review is never marked late.

Implemented in `packages/domain/src/stateMachine.ts` and `lateness.ts`.

### Review workflow

- Each `complete` by a child creates a **Submission**: the checklist state and photo(s). A chore that goes through rework has several submissions, so the history shows every attempt and the feedback on each.
- Each parent decision creates a **Review**: approve, request rework, or reject, plus an optional note and pins on the photo.
- **Review policy per chore**:
  - REVIEW_EACH: every submission is reviewed individually (paid or high-stakes chores).
  - BATCH_OK: reviewed, but included in "Approve all low-stakes".
  - AUTO_APPROVE: no review at all.
- **Checklists**: kids may submit with items unchecked. The parent sees "2/3" and decides.
- **Approval queue** (parent): pending submissions, newest first or grouped by child, filterable by child. Each card shows the child, chore, submission time, reward, checklist summary, and the photo next to the chore's reference photo. Swipe right to approve; swipe left for rework or reject. A header button batch-approves everything eligible (`canBatchApprove`).
- **Photo mark-up (MVP)**: tap to drop numbered pins with short comments (60 characters). Freehand circles and 15-second voice notes come right after the MVP.
- **Speed target** (from the spec): under 10 seconds per item, and a typical daily queue cleared in under a minute.

### Rewards & gamification

Two independent settings per family:

1. **Reward currency**, one of:
   - **Real money**: amounts in integer cents (with a currency code, e.g. USD). Parents record payouts ("paid Billy $5"), which reduce the balance. There's no catalog.
   - **Points**: redeemed against a catalog of non-monetary rewards the parents define (screen time, pick dinner). Kids request a reward; a parent approves or denies it.
   - **None**: no currency. Useful with gamification only.
2. **Gamification** (on/off), alongside any currency: XP, levels, badges, and achievements.
   - XP is earned on approval and derived from effort (e.g. 1 XP per minute, minimum 5), with an optional per-chore override.
   - Levels follow a gentle curve defined in `packages/domain`.
   - Badges are pure rule functions over a member's history, in `packages/domain` (e.g. first chore, 7-day streak, a week with nothing late, 10 approvals in a row without rework, 100 chores). New badges are code changes, not data.

**Routine chores vs. extra jobs** (from the branding doc's dual-currency principle; flexible by family decision):

- Every chore is either a **Routine** (baseline duty, e.g. "after dinner, clear the table") or an **Extra Job** (optional, e.g. "wash the car").
- By default, routines earn **XP only**, and extra jobs earn **coins**: the family's currency, money or points. This avoids paying kids for baseline duties, which research shows erodes their own motivation.
- Parents can still attach a coin reward to a routine chore. It's a deliberate override, not the default.
- Extra jobs can be posted to an open **Job Board**, where kids claim them themselves (an `OPEN` assignment mode with a `claim` action). Built in Step 8 with coins.

Rules:

- **Never take earned progress away as punishment**: no deducting coins or XP, no wiping streaks. Corrections of genuine mistakes are allowed, labeled as corrections. Missed days don't break streaks outright ("streak preservers").
- **No sibling leaderboards.** Progress is personal, plus a **shared family goal** bar (combined XP toward a non-material event like "Pizza & Movie Night").
- **Pending rewards**: while a submission waits for review, its reward shows as _pending_ (computed from PENDING_REVIEW instances, not written to the ledger). Approval writes the ledger entry. Rejection simply leaves nothing pending, so there's nothing to undo.
- Shared chores split money and points as whole units (cents or points); any remainder goes to the first assignees by id. XP is not split: each assignee earns the full XP.
- **Changing currency** never converts or erases anything. Every ledger entry records its currency, and old balances stay visible so a parent can settle them. XP and badges don't depend on the currency.

### Titan branding and behavioral principles

Source: the Titan Branding Suite doc (`claude.md` links it).

- **Brand**: Titan Household, tagline "Building Habits, Together." Accent colors Warm Amber `#D97706`, Soft Emerald `#059669`, Playful Sky Blue `#0284C7`, on the shared Slate neutrals (`#0F172A`, `#334155`, `#F1F5F9`, `#FFFFFF`).
- **Type**: Inter for UI, Roboto Mono for chips, checklist indicators, and data. Scale: 36/24/20/16/12 px.
- **Components**: buttons with 8 px radius (primary, secondary, ghost); cards with 12 px radius, 16 px padding, a soft shadow and a 1 px `#E2E8F0` border; pill-shaped badges in monospace; focus rings in the accent color.
- **App icon**: the geometric "T" mark with a progress ring, on a 135° Amber → Emerald gradient, in a squircle with a 64 px safe zone on a 512 px canvas. Final icon files are needed before Step 11.
- **Design tokens** live in a shared package, so Titan Agile and Titan Focus can reuse the structure with their own accent palettes.
- **Behavioral principles adopted**:
  - Chores can carry an optional **situational cue** ("WHEN dinner finishes") shown on the card, in addition to the scheduled time.
  - Short checklists (3–5 steps): the editor suggests one for chores that have none.
  - One-tap or swipe completion, with an immediate celebration (confetti, haptics, sound).
  - Notifications default to a **daily digest**, not instant alerts.
  - Batch, asynchronous review so parents never become the bottleneck (already built in Step 3).
  - The rewards rules above (routine vs. extra job, never deducting progress, no leaderboards, a shared family goal).

### How the verification spec was adopted

Adopted: submissions as their own records, three review outcomes (approve / rework / reject), the spec's status names, checklists, golden-standard reference photos, pin annotations (same JSON idea), the approval queue with swipe gestures and batch approval, customizable review rules, and pending rewards.

Adapted rather than copied:

- **Identity comes from the sign-in token, never the request body.** The spec's `child_id` and `parent_id` body fields would let a kid submit as a sibling, or approve their own work by sending a parent's id.
- **Photos use the upload flow**: the server issues a presigned upload and records the storage key. The spec's client-supplied `media_url` could point anywhere.
- **API conventions stay consistent** with the existing routes: camelCase JSON and family-scoped paths (e.g. `GET /v1/families/{familyId}/review-queue`, `POST /v1/families/{familyId}/submissions/{id}/review`) instead of snake_case and `?family_id=` query parameters. The review queue is paginated.
- **Rewards** follow the customizable design above, instead of the spec's fixed XP + coins pair.
- **Deferred to right after the MVP**: freehand drawing and voice notes.

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
   - **AUTO**: for each day, sort that day's chores by priority, then by effort (largest first). Give each chore to the eligible member with the highest _remaining capacity ratio_ (remaining minutes ÷ that day's capacity). On a tie, pick whoever did this chore least recently. If nobody has room, assign to the member with the most room anyway and mark the day "over capacity" so parents can see it.
   - For ROTATE and AUTO, an empty pool means "any family member". Within a day, FIXED chores are planned first, then ROTATE, then AUTO, so flexible chores fill in around fixed ones.
3. A job every 15 minutes finds instances with `dueAt < now` that are still outstanding. It sets `isLate`, raises priority to HIGH, and queues the "late" notification.

## Roadmap (each step ends green in CI)

0. ✅ **Foundation**: monorepo, lint/format/typecheck, docker-compose, CI, `claude.md`.
1. ✅ **Domain core** (`packages/domain`): recurrence, state machine (updated for the verification spec), auto-assignment, lateness, points splitting.
2. ✅ **DB + auth + families** (`apps/api`)
   - Prisma schema and migrations, plus seed data (the Billy/Sally example family).
   - Sign-up, login, rotating refresh tokens.
   - Families, kid profiles with PINs, member capacity, email invites.
   - **Kid sign-in (as built):** there is no public family join code. A parent signs in on a device once, then hands it to a kid with "switch to Billy" (no PIN needed for a parent). On a shared tablet, a kid switching to a sibling must enter that sibling's PIN, if one is set. Five wrong PINs lock the profile for 15 minutes. A 6-digit family code that anyone could enter would let strangers guess their way into a family, which is why the design doc's family PIN became per-kid PINs behind a parent sign-in.
   - Families always keep at least one parent. Only members with an email login can be parents.
3. ✅ **Chores, submissions, and reviews API**
   - CRUD for chores: checklist items, eligible members, review policy, reward amount, recurrence (now including one-time `ONCE` chores).
   - Agenda (Today view, carrying over unfinished chores from earlier days), range listing, and instance detail with full history.
   - Status changes all go through one transition helper that enforces the domain state machine, rejects stale concurrent updates (409), and writes audit events.
   - Submissions (with checklist state) and reviews (approve / rework / reject, note, pin annotations); paginated review queue and batch approve.
   - **As built:** planning (turning chores into dated, assigned occurrences for the next 7 days) lives in Step 3, so a new chore appears immediately. Edits re-plan only untouched future occurrences (still NEW, never acted on); archiving removes those and keeps history. Capacity changes and member removal also re-plan.
4. ✅ **Jobs** (pg-boss, in its own `pgboss` schema)
   - Planning runs **hourly** for every family (idempotent, so it covers each family's local midnight without per-time-zone schedules), one transaction per family so one failure never blocks the rest.
   - Late marking runs every 5 minutes: flags overdue outstanding chores once, records a system event, and calls the notification hook (filled in by Step 10).
   - Jobs run inside the API by default (`RUN_JOBS=true`) or in a separate worker process; pg-boss's singleton queues keep runs from overlapping across processes. `job:plan` and `job:mark-late` run them by hand.
5. **App shell + Today view**
   - Titan design tokens package (colors, type, spacing, component styles) and the app theme built on it. App name "Titan Household" and store bundle IDs.
   - Expo app with auth screens, family onboarding, and "who's using this device?".
   - Today view: chores grouped by status, with start, defer, and complete (with the checklist), situational cues on cards, and a completion celebration.
   - Chore detail screen with submission and feedback history.
   - Runs on web, iOS simulator, and Android emulator from day one.
6. **Parent tools**
   - Chore editor: recurrence picker, deadline, effort, checklist, review policy, reward, assignment mode.
   - Member capacity editor.
   - Approval queue: cards, swipe gestures, grouping and filters, batch approve.
   - Week view showing where members are over capacity.
7. **Photos**
   - Upload via presigned URL, using the camera or the photo library.
   - Reference ("golden standard") photo per chore, shown side by side in review.
   - Tap-to-pin mark-up on submitted photos.
   - Enforce the `requiresPhoto` rule.
8. **Rewards**
   - Family reward settings (money / points / none). Chore kind (Routine / Extra Job) with the XP-for-routines, coins-for-extra-jobs default.
   - Ledger, balances, and pending amounts. No punitive deductions.
   - Money: payouts. Points: catalog and redemption requests with parent approval.
   - Job Board: `OPEN` extra jobs that kids claim.
9. **Gamification**
   - On/off setting, XP on approval, levels.
   - Badge rules in `packages/domain` (including mastery badges for chores done without rework), awarded after each approval; streaks with preservers.
   - Shared family goal progress bar.
   - Badges, level, and the family goal shown on the rewards tab. No leaderboards.
10. **Push notifications**
    - Register device tokens; per-user settings, defaulting to a daily digest.
    - Types: new chore assigned, chore late, submitted for review, approved, needs rework, rejected, canceled, reward request decided, badge earned.
11. **Deploy + beta**
    - Final app icons from the Titan icon set; trademark check on the "Titan" names before store listings.
    - Deploy the API (container on Fly.io, Railway, or Render) with managed Postgres (Neon) and R2 storage.
    - Deploy the web build as a static site.
    - Ship test builds through EAS: TestFlight for iOS, Play internal testing for Android.

- **Right after the MVP:** freehand drawing and 15-second voice notes in photo review.
- **Later:** an Alexa skill (`apps/alexa`, Lambda) with OAuth account linking and intents like "what are my chores today" and "mark dishes done". Also Google Assistant/Home, and smarter scheduling (vacations, swapping chores).

## Verification

- `pnpm test`: domain unit tests (recurrence, transitions, scheduler fairness and capacity cases) and API integration tests against the Postgres in docker-compose.
- `pnpm dev`: starts the API and Expo. Then test:
  1. Seed a family.
  2. Create a weekly AUTO chore with a checklist and a reference photo.
  3. Run the generate job manually.
  4. Confirm instances are spread according to capacity.
  5. As a kid, complete a chore with a photo and a partial checklist. As the parent, request rework with a pin; as the kid, resubmit; as the parent, approve. Confirm the balance, XP, a badge, and a push notification on a device running Expo Go.
- Test the web build in a desktop browser, and the native builds on the iOS simulator and an Android emulator.
