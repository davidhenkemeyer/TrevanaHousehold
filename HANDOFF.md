# Handoff: Titan Household

State as of 10 Nov 2026, commit `8b1417f` on `main` (pushed to `origin`, https://github.com/davidhenkemeyer/TitanHousehold).

Titan Household is a family chore and habit app for iOS, Android, and the web. It's the first app of the Titan suite. Start with these:

- [CLAUDE.md](CLAUDE.md): stack, architecture rules, layout, commands, and conventions. **Read this first.**
- [docs/mvp-plan.md](docs/mvp-plan.md): data model, state machine, rules, the roadmap with "as built" notes per step, and every product decision made so far.
- [docs/titan-suite.md](docs/titan-suite.md): what the other Titan apps will share, and the Titan Focus AI-coach design.

## What's done

Roadmap Steps 0–10 are built, tested, and committed. One or two commits per step:

| Step | What it added                                                                            | Commit(s)            |
| ---- | ---------------------------------------------------------------------------------------- | -------------------- |
| 0    | Monorepo (pnpm, Turborepo), lint/format/typecheck, docker-compose, CI                    | `0c51fea`            |
| 1    | Domain core: recurrence, chore state machine, capacity-based scheduling                  | `29ff9b4`            |
| 2    | API foundation: database, auth, families, kid profiles with PINs, invites                | `9fc84c6`            |
| 3    | Chores, planning, submissions, reviews (with the verification spec adopted in `d87a515`) | `5f6fa9d`            |
| —    | Rename to Titan Household, branding, icon SVGs                                           | `2428452`, `d0ccfe0` |
| 4    | Background jobs: rolling planning, late marking                                          | `afe8169`            |
| 5    | The app: sign-in, Today view, kid-phone pairing, shared-device mode                      | `00ee56f`, `20f6768` |
| 6    | Parent tools: chore editor, review queue (swipe), week view, daily time                  | `7fc63b4`, `3d81ca5` |
| 7    | Photo proof, reference photos, pin mark-up, 90-day photo cleanup                         | `4fd7a64`            |
| 8    | Rewards: money or points, ledger, payouts, catalog, redemptions, job board               | `291135b`            |
| 9    | XP, levels, streaks with saves, badges, family goal                                      | `de8500e`            |
| 10   | Notifications: in-app inbox, 7:30 AM daily digest, instant pushes, settings              | `8b1417f`            |

Verification at `8b1417f`: format, lint, typecheck, and build all pass. 490 unit and API tests pass (domain 224, API 192, app 65, contracts 5, tokens 4). The 7 Playwright web end-to-end tests pass repeatedly. All of that runs locally; GitHub Actions should run the same checks, minus end-to-end and storage tests. Its result after the first push hasn't been checked (the GitHub CLI isn't installed on this machine).

## In progress

- **Nothing is uncommitted.** The working tree is clean. The empty untracked `src/` and `tests/` folders at the root are leftovers and can be deleted.
- **Step 11 planning is scheduled for 2:00 AM on 11 Nov**, as a one-time task in the Claude Code session that was open on the dev machine. It only exists in that session: if the session was closed, it didn't run, and Step 11 should be started by hand. It was told to plan only: explore the code without changing anything, write the plan, and wait for approval. No accounts, deploys, or spending.

## What's next: Step 11 (deploy and beta)

From the plan, plus deploy items noted during earlier steps.

**Needs the owner's accounts or decisions:**

1. **Hosting:** the API as a container on Fly.io, Railway, or Render; managed Postgres (the plan suggests Neon); Cloudflare R2 or S3 for photos; the web build as a static site.
2. **Photo storage, production setup:** set the `S3_*` env vars and a real `S3_SECRET_KEY` (the API refuses the dev key in production). Add a bucket CORS rule for the web origin and a lifecycle rule as a backstop for the 90-day photo retention.
3. **Expo:** create an account and run `npx eas init` in `apps/mobile`; push tokens need the project ID. iPhone Expo Go then receives pushes; Android needs a development build. Store builds need APNs and FCM credentials, which EAS can create. Set `EXPO_ACCESS_TOKEN` only if enhanced push security is turned on.
4. **App identity:** replace the placeholder bundle ID `com.titansuite.household`, make the final icons from the Titan icon set, and do a trademark check on the "Titan" names before store listings.
5. **Test builds:** TestFlight for iOS and Play internal testing for Android, through EAS.

**Code work that doesn't need accounts:**

- **Web sign-in tokens:** they're in `localStorage`, which other scripts on the page can read. Move to httpOnly cookies before the web app goes public.
- **Production config:** Dockerfile and config for the API, a health check, `prisma migrate deploy` on release, and choosing whether jobs run in the API (`RUN_JOBS`) or the separate worker.
- **Expo delivery receipts:** checking them would find more dead push tokens; only the immediate send response is checked today.

**Known gaps and small follow-ups:**

- **Native untested:** nothing has been tried on a real phone: camera and photo-library permissions, uploads from Expo Go, swipe gestures, haptics, and pushes.
- **Missing app screens:** editing a catalog reward (the API supports it), paying out an old money balance after switching to points (the app offers only a correction), and ending a family goal early (starting a new one replaces it).
- **Seed not re-run:** the demo seed (`db:seed`) was updated for points, a catalog, and a job-board job, but hasn't been re-run against a fresh database.
- **Some tests can't run in CI:** the storage tests skip in CI because there's no storage server there, and the end-to-end tests need a built API and web app running locally.

**After the MVP** (recorded in the plan): freehand drawing and voice notes in photo review; an Alexa skill; a parent-controlled wish list of real products as rewards.

## Things that will trip you up

- **Windows and PowerShell 5.1:**
  - Don't round-trip source files through `Get-Content`/`Set-Content`; they mangle UTF-8.
  - Write commit messages to a file and use `git commit -F`.
  - In each PowerShell command, refresh `PATH` from the Machine and User values.
- **pnpm minimum release age (strict):** new dependency versions must be at least two weeks old. Pin an older version rather than adding exclusions.
- **Migrations that drop data:** `prisma migrate dev` refuses to run without an interactive terminal when a change could lose data. The workaround is in CLAUDE.md.
- **Local storage is RustFS** (`rustfs/rustfs:1.0.4`), because MinIO no longer publishes images. Start it with `pnpm db:up`. In development the API signs photo URLs with this computer's Wi-Fi address so phones can reach them, preferring 192.168.x over VPN addresses.
- **End-to-end tests:** rebuild the API before running them; a stale `dist` fails in confusing ways. Person switching is rate-limited per account (10 a minute), not per IP.
- **The rules that matter most** (details in CLAUDE.md):
  - Business rules live only in `packages/domain`.
  - Change chore status only through `transition()`.
  - Rewards, XP, and badges are written only by `onApproved`.
  - Notifications are created only by `notify()` and sent only by jobs.
  - The app never decides permissions; it shows what the API allows.
