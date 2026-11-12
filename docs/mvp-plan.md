# Tenara Family: MVP Plan

## Context

**Tenara Family** ("Building Habits, Together.") is the family app in the Tenara suite (with Tenara Team and Tenara Focus; see [docs/tenara-suite.md](tenara-suite.md)). It's a family chore app that:

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
- The Branding Suite doc (brand, design tokens, icon specs, and behavioral design principles). See [Branding and behavioral principles](#branding-and-behavioral-principles).
- Decisions made along the way: TypeScript backend, PostgreSQL, photo proof + rewards + push in the MVP, customizable rewards with a routine/extra-job default.

Guiding rule: **all business logic lives on the server and in a shared domain package, never in the UI.** That way an Alexa skill becomes just another API client later.

## Tech stack

| Concern                   | Choice                                                                                                                                | Why                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Monorepo                  | pnpm workspaces + Turborepo                                                                                                           | Shared types and tooling across the app and the server                     |
| App (iOS / Android / Web) | Expo SDK (React Native + Expo Router + react-native-web), TypeScript                                                                  | One codebase for all three platforms. EAS builds the store binaries.       |
| UI data layer             | TanStack Query + typed API client                                                                                                     | Caching, offline-friendly retries                                          |
| API                       | Node + Fastify + Zod via `fastify-type-provider-zod`; request/response schemas shared in `packages/contracts`                         | Typed client for the app. OpenAPI output for Alexa and other clients.      |
| DB / ORM                  | PostgreSQL 16 + Prisma 7 (migrations)                                                                                                 | Strong enums, JSON, and timezone support                                   |
| Background jobs           | pg-boss (job queue that runs inside Postgres)                                                                                         | No Redis needed. Handles scheduled and retryable jobs.                     |
| Auth                      | Email + password (argon2id), JWT access + rotating refresh tokens. Kid profiles are reached by profile switching.                     | Simple now. Can grow into OAuth2 later, which Alexa account linking needs. |
| Photo storage             | S3-compatible: RustFS locally (MinIO stopped publishing images), Cloudflare R2 or S3 in production. Uploads use presigned POST forms. | Image files never pass through the API server                              |
| Push                      | Expo Push Notifications (wraps APNs and FCM)                                                                                          | One API for iOS and Android                                                |
| Tests                     | Vitest for the domain and API (with a test Postgres via Docker), Playwright later for web                                             |                                                                            |
| CI                        | GitHub Actions: format, lint, typecheck, test (with a Postgres service)                                                               | Replaces the Jenkins idea from the old doc; much less to run yourself      |
| Local dev                 | `docker-compose.yml` runs Postgres + RustFS (S3-compatible storage)                                                                   |                                                                            |

## Directory structure

```
FamilyChoresApp/
├─ claude.md                    # stack, commands, conventions
├─ package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├─ docker-compose.yml           # postgres, storage (RustFS)
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

### Branding and behavioral principles

Source: the Branding Suite doc (`claude.md` links it).

- **Name (changed November 2026)**: the suite was renamed from Titan to **Tenara**, because "Titan" is crowded and sounds too forceful for a gentle family product. Store titles: "Tenara Family: Chores & Habits", "Tenara Team: Tasks & Sprints", "Tenara Focus: Goals & Routines". The name under the icon is just "Tenara". The artwork didn't change. Details in [docs/tenara-suite.md](tenara-suite.md).
- **Brand**: Tenara Family, tagline "Building Habits, Together." Accent colors Warm Amber `#D97706`, Soft Emerald `#059669`, Playful Sky Blue `#0284C7`, on the shared Slate neutrals (`#0F172A`, `#334155`, `#F1F5F9`, `#FFFFFF`).
- **Type**: Inter for UI, Roboto Mono for chips, checklist indicators, and data. Scale: 36/24/20/16/12 px.
- **Components**: buttons with 8 px radius (primary, secondary, ghost); cards with 12 px radius, 16 px padding, a soft shadow and a 1 px `#E2E8F0` border; pill-shaped badges in monospace; focus rings in the accent color.
- **App icon**: the geometric "T" mark with a progress ring, on a 135° Amber → Emerald gradient, in a squircle with a 64 px safe zone on a 512 px canvas. Final icon files are needed before Step 11.
- **Design tokens** live in a shared package, so Tenara Team and Tenara Focus can reuse the structure with their own accent palettes.
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
   - **Kid sign-in (as built):** there is no public family join code. A parent signs in on a device once, then hands it to a kid with "switch to Billy" (no PIN needed for a parent). On a shared tablet, a kid switching to a sibling must enter that sibling's PIN, if one is set. Five wrong PINs lock the profile for 15 minutes. A 6-digit family code that anyone could enter would let strangers guess their way into a family, which is why the design doc's family PIN became per-kid PINs behind a parent sign-in. (Step 5 extended this: parents can set a quick-switch PIN too, and kids' own phones are set up with one-time pairing codes. See Step 5.)
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
5. ✅ **App shell + Today view** (`apps/mobile`, Expo SDK 58)
   - `@tenara/tokens` design tokens and the app theme built on them. App name "Tenara Family"; bundle ID placeholder (now `com.gettenara.family`, pending the domain). Icons exported from `assets/brand` to PNG.
   - Sign in, sign up, family onboarding, "Who's using this?", Family tab (add kids, PINs, kid phone setup, invite a parent), Me tab (quick-switch PIN, shared-device setting, sign out).
   - Today view: Needs attention / To do / Waiting for review / Done, a Mine/Family toggle, the day's progress ring, cue text on cards, one-tap completion (a checklist sheet when the chore has steps), confetti and a haptic tap. Buttons come from the API's `availableActions`.
   - Chore detail screen with steps, attempts, feedback, and history.
   - Small API additions: optional `cue` text on chores.
   - Verified with unit tests and a Playwright web smoke test (sign up → family → kid → hand over → complete with a partial checklist). Native devices still need a hands-on check via Expo Go.
   - **How kids use the app (as built):**
     - **Kid with their own phone:** a parent taps "Set up their phone" on the kid's profile and gets a one-time code (`XXXX-XXXX`, single use, 10 minutes, rate-limited). The kid enters it on their phone, which stays signed in as them. The parent's password never touches the kid's phone.
     - **Shared device** (a parent's phone or a family iPad): "Who's using this?" hands the device to a kid. Switching back to a parent uses that parent's quick-switch PIN, checked by the server with the same lockout as kids' PINs; a parent without a PIN signs in with their password. The device never keeps a parent's session while a kid uses it. With "Shared family device" turned on, the app opens on the picker and returns to it after 2 idle minutes.
6. ✅ **Parent tools**
   - Chore editor: recurrence picker, deadline, effort, checklist, review policy, reward, assignment mode.
   - Member capacity editor.
   - Approval queue: cards, swipe gestures, grouping and filters, batch approve.
   - Week view showing where members are over capacity.
   - **As built:**
     - Tabs: parents see Today · Review (badge with the waiting count) · Chores · Family · Me; kids see Today · Family · Me. Hiding tabs is a convenience; the API still enforces parent-only routes.
     - **Chore editor** (`/chore-edit/[id]`, `new` to create), in sections What / When / Due / Who / Steps / Checking it, with a live schedule line from the domain's `describeRecurrence` ("Every 2 weeks on Mon, Thu"). Validation runs the API's own Zod schema; edits send only the changed fields, so saving an untouched chore doesn't re-plan anything. Archive with a confirmation. Dates and times use steppers (no native date-picker dependency).
     - **Review tab**: cards show the child, chore, time, `1/2 STEPS`, the unchecked steps, late and reward chips. Swipe right approves; swipe left opens "Try again" / "Not accepted" with an optional note. Every swipe has a button twin (Approve / Needs work) for mouse, keyboard, and screen readers. Filter chips per child, "Group by child", "Approve all low-stakes (N)" with a result summary, "Load more" paging. The chore detail screen has the same review buttons, plus "Edit chore". Swipes use React Native's `PanResponder` (no gesture-handler dependency).
     - **Week view** (Chores tab → Week): a day × member grid of assigned vs. available minutes, over-capacity cells in amber, previous/next week, tap a cell for that day's chores. Backed by `GET /v1/families/:id/week-load?from=&days=` (parents only), computed by the domain's `summarizeDayLoad`, which shares `loadByDay` with the planner so both count minutes the same way (canceled and rejected work doesn't count). It also lists FIXED chores whose owners have all left.
     - **Daily time** (Family tab → member → "Daily time"): per-weekday steppers in 5-minute steps, presets (Young kid, Kid, Teen, Parent), and a weekly total. Saving re-plans untouched chores.
     - Fixed along the way: the API's CORS setup allowed only GET/HEAD/POST, so the web app couldn't send PATCH or DELETE (e.g. setting a PIN on the web). Now covered by a test.
     - Verified by a second Playwright test: create a chore in the editor, see the week go over capacity, fix it with daily time, kid submits partially, parent switches back with a PIN, sends it back with a note, kid redoes it, parent approves with a swipe.
7. ✅ **Photos**
   - Upload via presigned URL, using the camera or the photo library.
   - Reference ("golden standard") photo per chore, shown side by side in review.
   - Tap-to-pin mark-up on submitted photos.
   - Enforce the `requiresPhoto` rule.
   - **As built:**
     - **Upload flow:** `POST /v1/families/:id/uploads { purpose, contentType }` returns a signed POST form (10 minutes, exact key, JPEG/PNG/WebP, max 8 MB, enforced by storage). The app shrinks photos to ≤ 1600 px JPEG first (which also drops location metadata), uploads straight to storage, then sends only the `uploadId`. On attach the API checks family, uploader, purpose, single use, and the stored file's type and size. Up to 3 photos per submission.
     - **Viewing:** responses carry signed GET URLs (30-minute validity), never keys. Signing time is rounded to 10 minutes so URLs stay stable and images cache.
     - `requiresPhoto` is enforced for kids; a parent's completion needs no photo.
     - **Reference photo** per chore (parents), shown on the kid's "Done" sheet ("Make it look like this"), the chore detail, and next to the submitted photo in review.
     - **Pins:** in "Needs work", "Mark up the photo" opens a full-screen view: tap to drop numbered pins with 60-character comments. The kid's card says "See the spot marked on your photo" and the detail shows the pins. (Pins on approvals: not in the UI yet; the API accepts them.)
     - **Retention (decided):** proof photos are deleted 90 days after review (`photosExpired` in the history); unused uploads after a day; replaced or removed reference photos too. Daily `clean-up-photos` job; `job:cleanup-photos` runs it by hand.
     - **Local storage:** RustFS replaces MinIO, whose community images are no longer published. In development the API creates the bucket, sets its CORS rule for `CORS_ORIGINS`, and signs URLs with this computer's LAN address so phones on the Wi-Fi can reach storage.
     - **Fixed along the way:** the person-switch endpoint was rate-limited per IP, which a household shares (family iPad plus kids' phones on one Wi-Fi). It's now per signed-in account; PIN guessing is still stopped by the per-profile lockout.
8. ✅ **Rewards**
   - Family reward settings (money / points / none). Chore kind (Routine / Extra Job) with the XP-for-routines, coins-for-extra-jobs default.
   - Ledger, balances, and pending amounts. No punitive deductions.
   - Money: payouts. Points: catalog and redemption requests with parent approval.
   - Job Board: `OPEN` extra jobs that kids claim.
   - **Decisions:**
     - Redeeming points: the points are held when the request is made and given back if it's denied or canceled.
     - Unclaimed job-board jobs quietly expire at their deadline (never "late"); recurring ones return on their next date.
     - Anyone in a job's pool can claim it, parents included (an empty pool means everyone).
     - Payouts may exceed the balance (an advance): the balance goes negative and later earnings pay it back.
   - **As built:**
     - **Ledger:** `LedgerEntry` rows (EARNED, PAYOUT, REDEMPTION, REDEMPTION_REFUND, CORRECTION), each recording its own currency. Balances are sums over the ledger, never stored; `Membership.pointsBalance` was removed (it was never written). Approval writes one EARNED entry per assignee (`onApproved`), split in whole units, and a unique (occurrence, member, type) constraint means an approval can never pay twice. Pending amounts are computed from chores waiting for review.
     - **Currency** per family: none, money (USD, CAD, EUR, GBP, AUD, NZD; amounts in cents), or points. Switching converts nothing: earlier balances stay on each person's rewards page until a parent settles them.
     - **Taking amounts back** happens only through a payout, a redemption, or a **correction**, which always needs a note and shows as a correction in the history.
     - **Points catalog and requests:** parents add rewards with a cost; anyone asks for one; the request appears at the top of the Review tab (and in its badge) with Approve / Not now. Spending locks the member's row first, so two requests at once can't spend the same points.
     - **Routine vs. extra job:** set in the chore editor. Routines hide the reward behind "Also pay for this routine" (off by default); extra jobs show it. Amounts are typed in the family's currency ("2.50" or "50").
     - **Job board:** assignment mode `OPEN`. The planner creates the occurrence with no assignee and charges nobody's capacity. `claim` and `release` ("Give back") are state-machine actions that go through `transition()`; the occurrence's `board` state (NONE / OPEN / CLAIMED) is updated with the same guard as status, so of two simultaneous claims exactly one wins (the other gets `ALREADY_CLAIMED`). While a job is on the board, only claim and cancel are possible. The late-marking job also expires unclaimed jobs past their deadline. (The plan called for a boolean `open` column; a three-value `board` state turned out clearer, since "Give back" needs to know a job came from the board.)
     - **App:** a balance chip on Today opens the rewards screen (balance, pending, catalog, requests, history); parents get everyone's balances there, "Record payout", and "Correction". Today shows a "Job board" section with "I'll do it". Rewards settings live under Family. No new tab.
     - XP, levels, and badges are Step 9.
9. ✅ **Gamification**
   - On/off setting, XP on approval, levels.
   - Badge rules in `packages/domain` (including mastery badges for chores done without rework), awarded after each approval; streaks with preservers.
   - Shared family goal progress bar.
   - Badges, level, and the family goal shown on the rewards tab. No leaderboards.
   - **Decisions:**
     - A streak day counts when everything assigned to that person that day was handed in by its deadline (approved later is fine). Days with nothing assigned neither count nor break it; today never breaks it. Rejected work counts as missed; work sent back for rework counts if the first hand-in was on time.
     - Every 7 days in a row earns a save (preserver), holding at most 2; a missed day uses one automatically.
     - Everyone earns XP, levels, and badges, parents included, and everyone's XP fills the family goal.
   - **As built:**
     - **XP:** 1 per minute of effort, at least 5, or the chore's custom XP (1–500, set in the editor). Each person on a shared chore earns the full XP. Stored as `XpEntry` rows (one per approval and person), never deducted.
     - **Levels:** level L needs 25 × L × (L − 1) XP in total (2 at 50, 3 at 150, 5 at 500, 10 at 2,250).
     - **Streaks** are computed from the last 180 days of history every time, never stored, so nothing can wipe one.
     - **Badges** (never removed): First chore, 10 / 50 / 100 chores, 7- and 30-day streaks, Clean week, Right first time (10 in a row without a redo), Helper (a job-board job), and "<chore> master" (the same chore 10 times without a redo). Awarded inside the approval transaction. New badges are code changes in `packages/domain/src/gamification.ts`.
     - **Family goal:** parents start one (name and target XP); XP earned after it starts counts; it's marked reached when crossed; starting a new one closes the old.
     - **Off switch:** hides XP and badges; they keep being recorded, so turning it back on loses nothing.
     - **App:** a level/streak chip and the goal bar on Today, "+XP" on cards, a once-per-device celebration of level-ups and new badges (confetti), and a Progress section (level, streak, saves, badge grid with what each takes) at the top of the rewards screen, now titled "My progress". Settings live in Rewards settings.
10. ✅ **Push notifications**
    - Register device tokens; per-user settings, defaulting to a daily digest.
    - Types: new chore assigned, chore late, submitted for review, approved, needs rework, rejected, canceled, reward request decided, badge earned.
    - **Decisions:**
      - The daily digest goes out at 7:30 AM family time (each person can change it). Kids: today's chores and anything to try again. Parents: what's waiting for review and reward requests. Nothing is sent on an empty day.
      - Instant by default only for "sent back to try again" (kid) and reward requests (parent). Quiet hours 9 PM to 7 AM; instant ones wait until they end. Every kind can be set to Right away, Daily digest, or Off per person.
      - Shared family devices get no pushes; everyone has an in-app inbox.
    - **As built:**
      - Every notification is a `Notification` row (the inbox), created only through `notify()` inside the transaction that caused it; the person who caused it is never told. Pushes are sent only by jobs: `send-instant-notifications` (every minute) and `send-digests` (every 15 minutes, once a day per person). Expo push tokens are in `PushDevice`, one per phone, moving to whoever signs in on it; tokens Expo rejects are deleted. Also added: Goal reached and Someone asks for a reward.
      - "Off" stops the push only; it still lands in the inbox.
      - App: the inbox (Me tab, with an unread badge), notification settings, push registration on personal phones (unregistered on sign-out and in shared-device mode), and tapping a push opens the chore. Web: inbox only.
    - **To get real pushes on a phone (one-time setup, needs your accounts):**
      1. Create a free Expo account and run `npx eas init` in `apps/mobile`. It adds the project id to the app config, which push tokens require.
      2. iPhone: Expo Go can receive pushes once the project id exists. Android: Expo Go no longer receives remote pushes; make a development build (`npx eas build --profile development --platform android`).
      3. Optional: if "enhanced push security" is turned on for the Expo project, set `EXPO_ACCESS_TOKEN` for the API.
      4. Store builds (Step 11) need APNs and FCM credentials, which EAS can create.
11. **Deploy + beta**
    - Final app icons from the icon set; trademark check on the "Tenara" names before store listings.
    - Deploy the API (container on Fly.io, Railway, or Render) with managed Postgres (Neon) and R2 storage. Set `S3_*` env vars, the bucket's CORS rule for the web origin, and a lifecycle rule as a backstop for the 90-day photo retention.
    - Deploy the web build as a static site.
    - Ship test builds through EAS: TestFlight for iOS, Play internal testing for Android.
    - **As built (code, no accounts):** the runbook for every account step is [deploy.md](deploy.md).
      - API container: `apps/api/Dockerfile` (Node 24, `pnpm deploy`, non-root) and an example `fly.toml`. Migrations run as the release command (`npm run db:deploy`). `/health` checks the database; `/health/live` doesn't.
      - Production config checks: the API refuses to start with development secrets, missing or non-https `CORS_ORIGINS`, or a missing or non-https `S3_PUBLIC_URL`. `TRUST_PROXY` is for the host's proxy.
      - Web sign-in: the refresh token is an httpOnly, SameSite=Lax cookie scoped to `/v1/auth`, for requests marked `X-Tenara-Client: web` (that header is also the CSRF guard). The web app keeps no tokens in `localStorage`. Native apps are unchanged.
      - Photo bucket: `storage:setup` applies the CORS rule and lifecycle rules (submission photos expire after 120 days as a backstop). Keys now start with the purpose (`submission/families/...`) so the rule can match them.
      - Push delivery receipts: checked every 15 minutes; dead tokens are removed.
      - App: `eas.json` profiles, `EAS_PROJECT_ID`, `usesNonExemptEncryption: false`, `expo-dev-client`, and an SPA fallback for the static web host.
      - CI also builds the API image and the web export.
    - **Open decisions (owner):** the domain (the web app and API must share a parent domain for the cookie), the bundle ID, hosting accounts, and R2 vs S3 for photos. R2 has no presigned POST, so uploads switch to presigned PUT if R2 is chosen.

- **Right after the MVP:** freehand drawing and 15-second voice notes in photo review.
- **Later:** an Alexa skill (`apps/alexa`, Lambda) with OAuth account linking and intents like "what are my chores today" and "mark dishes done". Also Google Assistant/Home, and smarter scheduling (vacations, swapping chores).
- **Later: real products as rewards (a wish list).** Inspired by gift-exchange apps like drawnames.app, which search real product listings. If the parents turn it on, kids can browse and search products from a retailer catalog and add real items to a wish list, priced in the family's currency (points or money). They can browse ahead of time and see how close they are ("$12 to go"), then ask for an item once they've earned enough. The request goes through the same parent approval as catalog rewards, and the parent does the actual buying.
  - Parents stay in control: on/off, which stores, a price cap, an age-appropriate filter, and approving each item before it appears on a kid's list.
  - Open questions for later: which product source (retailer affiliate APIs vs. a parent-pasted link with a fetched title, image, and price), how points map to real prices, keeping prices current, and keeping kids away from ads and checkout flows (kids never buy directly).

## Verification

- `pnpm test`: domain unit tests (recurrence, transitions, scheduler fairness and capacity cases) and API integration tests against the Postgres in docker-compose.
- `pnpm dev`: starts the API and Expo. Then test:
  1. Seed a family.
  2. Create a weekly AUTO chore with a checklist and a reference photo.
  3. Run the generate job manually.
  4. Confirm instances are spread according to capacity.
  5. As a kid, complete a chore with a photo and a partial checklist. As the parent, request rework with a pin; as the kid, resubmit; as the parent, approve. Confirm the balance, XP, a badge, and a push notification on a device running Expo Go.
- Test the web build in a desktop browser, and the native builds on the iOS simulator and an Android emulator.
