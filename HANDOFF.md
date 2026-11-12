# Handoff: Tenara Family

State as of 11 Nov 2026, on `main` (`origin` is https://github.com/davidhenkemeyer/TitanHousehold; the GitHub repo still has the old name, and the Step 11 and rename commits aren't pushed yet).

Tenara Family is a family chore and habit app for iOS, Android, and the web. It's the first app of the Tenara suite. Start with these:

- [CLAUDE.md](CLAUDE.md): stack, architecture rules, layout, commands, and conventions. **Read this first.**
- [docs/mvp-plan.md](docs/mvp-plan.md): data model, state machine, rules, the roadmap with "as built" notes per step, and every product decision made so far.
- [docs/tenara-suite.md](docs/tenara-suite.md): what the other Tenara apps will share, and the Tenara Focus AI-coach design.
- [docs/deploy.md](docs/deploy.md): the deploy and beta runbook (accounts, secrets, store builds).

## What's done

Roadmap Steps 0–10 are built, tested, and committed, and Step 11 is done as far as code goes. One or more commits per step:

| Step | What it added                                                                                                             | Commit(s)                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0    | Monorepo (pnpm, Turborepo), lint/format/typecheck, docker-compose, CI                                                     | `0c51fea`                                             |
| 1    | Domain core: recurrence, chore state machine, capacity-based scheduling                                                   | `29ff9b4`                                             |
| 2    | API foundation: database, auth, families, kid profiles with PINs, invites                                                 | `9fc84c6`                                             |
| 3    | Chores, planning, submissions, reviews (with the verification spec adopted in `d87a515`)                                  | `5f6fa9d`                                             |
| —    | Rename to Titan Household, branding, icon SVGs                                                                            | `2428452`, `d0ccfe0`                                  |
| 4    | Background jobs: rolling planning, late marking                                                                           | `afe8169`                                             |
| 5    | The app: sign-in, Today view, kid-phone pairing, shared-device mode                                                       | `00ee56f`, `20f6768`                                  |
| 6    | Parent tools: chore editor, review queue (swipe), week view, daily time                                                   | `7fc63b4`, `3d81ca5`                                  |
| 7    | Photo proof, reference photos, pin mark-up, 90-day photo cleanup                                                          | `4fd7a64`                                             |
| 8    | Rewards: money or points, ledger, payouts, catalog, redemptions, job board                                                | `291135b`                                             |
| 9    | XP, levels, streaks with saves, badges, family goal                                                                       | `de8500e`                                             |
| 10   | Notifications: in-app inbox, 7:30 AM daily digest, instant pushes, settings                                               | `8b1417f`                                             |
| 11   | Deploy prep (code only): container, production config checks, web cookie sign-in, bucket setup, push receipts, EAS config | `9658555`, `6f1f84b`, `17ae521`, `6b6b1a8`, `87a38c2` |
| —    | Rename Titan to Tenara: Tenara Family (this app), Tenara Team, Tenara Focus; `@tenara/*` packages; artwork unchanged      | the rename commit                                     |

Verification for Step 11: format, lint, typecheck, and build pass; 507 unit and API tests (domain 224, API 205, app 69, contracts 5, tokens 4) and 8 Playwright web tests pass. The production Docker image was built and run locally against Postgres with `NODE_ENV=production`: migrations, `/health`, sign-up, and a clean SIGTERM shutdown all work. GitHub Actions passed on the earlier pushes; it now also builds the Docker image and the web export.

## In progress

- **Step 11 is code-complete up to the account steps.** Everything left needs the owner: see [docs/deploy.md](docs/deploy.md), step 0 first.
- **Waiting on a decision: R2 or S3 for photos.** Cloudflare R2 doesn't support presigned POST uploads, which the app uses today. Choosing S3 needs no code change. Choosing R2 needs a small switch to presigned PUT (sign the content type and length; the bucket CORS rule already allows PUT).

## What's next

**Needs the owner's accounts or decisions** (in the order of docs/deploy.md):

1. Pick a domain, with the web app and the API under it (the sign-in cookie needs a shared parent domain), and confirm the bundle ID (the code assumes `com.gettenara.family`).
2. Neon, R2 or S3 (then `storage:setup`), Fly.io (`fly launch`, secrets, `fly deploy`), and Cloudflare Pages.
3. Expo: `eas init` to get the project id, then set `EAS_PROJECT_ID` and the API URL in `eas.json`.
4. Apple Developer and Google Play accounts, then TestFlight and internal testing builds through EAS.
5. Before listings: final icons, a trademark check on "Tenara" (see docs/deploy.md step 9), a privacy policy, and the store privacy forms.

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
- **Production mode locally:** `NODE_ENV=production` makes the API refuse development secrets and http URLs. To try the image, use an env file like `apps/api/.env.production.example` with throwaway values and https placeholders, and `host.docker.internal` for local Postgres.
- **Web sign-in cookie:** it's scoped to `/v1/auth`. In browser tools and Playwright, look it up for an `/v1/auth/...` URL, not the API root.
- **The rules that matter most** (details in CLAUDE.md):
  - Business rules live only in `packages/domain`.
  - Change chore status only through `transition()`.
  - Rewards, XP, and badges are written only by `onApproved`.
  - Notifications are created only by `notify()` and sent only by jobs.
  - The app never decides permissions; it shows what the API allows.
