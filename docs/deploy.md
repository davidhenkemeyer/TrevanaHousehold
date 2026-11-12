# Deploying Tenara Family

This runbook covers putting the API, database, photo storage, and web app online, and shipping test builds to phones. The code is ready for every step here; each step needs an account, a payment, or a decision, so it's done by the owner. Steps are in order, and each lists what it produces for the next one.

Recommended setup for the beta (any equivalent works, since the API is a plain container):

| Piece        | Service                                | Cost at beta scale                      |
| ------------ | -------------------------------------- | --------------------------------------- |
| Domain       | Any registrar (Cloudflare is simplest) | about $10/year                          |
| API and jobs | Fly.io, one machine                    | a few dollars a month                   |
| Database     | Neon Postgres 16 (Launch plan)         | about $19/month                         |
| Photos       | Cloudflare R2 (or AWS S3; see step 3)  | free tier                               |
| Web app      | Cloudflare Pages                       | free                                    |
| Phone builds | Expo EAS                               | free tier                               |
| iOS beta     | Apple Developer Program                | $99/year                                |
| Android beta | Google Play Console                    | $25 once                                |
| Payments     | RevenueCat                             | free to $2.5k/month in revenue, then 1% |

The database isn't free: the background-job queue checks it every few seconds, so it never pauses, and a month of the smallest size is about 180 compute-hours (Neon's free plan has 100). A cheaper alternative is Postgres on a small Fly machine with a volume (a few dollars a month, with backups up to you). The stores keep 15% of subscription revenue for small businesses (Apple's Small Business Program and Google's 15% tier both need signing up for).

## 0. Decisions to make first

1. **Domain.** Put the web app and the API under one domain, such as `app.<domain>` and `api.<domain>`. The web app's sign-in cookie only works reliably when both share a parent domain; Safari blocks cookies between unrelated domains such as `*.fly.dev` and `*.pages.dev`.
2. **Bundle ID.** Usually `com.<domain>.family`; the code assumes `com.gettenara.family`. It can't change after the first store release. Set `BUNDLE_ID` in [apps/mobile/app.config.ts](../apps/mobile/app.config.ts).
3. **Photo uploads on R2.** The app uploads photos with presigned POST forms, which AWS S3 supports and Cloudflare R2 doesn't. Either use S3, or have the code switched to presigned PUT uploads first. That switch is small, and CORS already allows PUT.

## 1. Database (Neon)

1. Create a Neon project with Postgres 16, in the region closest to your Fly region.
2. Copy two connection strings: the **pooled** one becomes the API's `DATABASE_URL`. Keep the **direct** one for running migrations by hand if you ever need to.
3. Make sure both end with `?sslmode=require`.

Produces: `DATABASE_URL`.

## 2. Secrets you generate

- `JWT_SECRET`: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Never reuse the development value; the API refuses it in production.

## 3. Photo storage (R2 or S3)

1. Create a private bucket named `tenara-photos` (never public: photos are only reached through signed URLs).
2. Create an API token or access key that can read and write that bucket only.
3. Endpoint and region: on R2, the endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` and the region is `auto`. On S3, the endpoint is `https://s3.<region>.amazonaws.com` and the region is your bucket's region.
4. Apply the bucket's CORS and lifecycle rules once, from this computer:

   ```sh
   cd apps/api
   # A temporary env file with the API's production values (step 4's secrets,
   # including S3_*, CORS_ORIGINS, DATABASE_URL, JWT_SECRET). Never commit it; delete it after.
   npx tsx --env-file=prod.env src/jobs/run-once.ts storage-setup
   ```

   This allows the web origin to upload and view photos, expires submission photos after 120 days (a backstop: the cleanup job deletes them 90 days after review), and aborts stale multipart uploads.

Produces: `S3_ENDPOINT`, `S3_PUBLIC_URL` (usually the same as the endpoint), `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.

## 4. API (Fly.io)

The image is built from [apps/api/Dockerfile](../apps/api/Dockerfile), and [fly.toml](../fly.toml) at the repo root configures it. Every variable is explained in [apps/api/.env.production.example](../apps/api/.env.production.example).

```sh
fly launch --no-deploy --copy-config   # from the repo root; pick an app name and region, then update fly.toml
fly secrets set DATABASE_URL=... JWT_SECRET=... CORS_ORIGINS=https://app.<domain> \
  S3_ENDPOINT=... S3_PUBLIC_URL=... S3_BUCKET=tenara-photos S3_REGION=auto \
  S3_ACCESS_KEY=... S3_SECRET_KEY=...
fly deploy                             # runs `npm run db:deploy` (migrations) before switching over
fly certs add api.<domain>             # then add the DNS record Fly shows
curl https://api.<domain>/health       # {"status":"ok"}
```

Notes:

- One machine runs the API and the background jobs (`RUN_JOBS=true`). To scale beyond one machine, run the jobs as a separate Fly process with `node dist/worker.js`, and set `RUN_JOBS=false` on the web machines.
- The API refuses to start in production with development secrets, an empty or non-https `CORS_ORIGINS`, or a missing or non-https `S3_PUBLIC_URL`. The error lists every problem.
- Health checks: `/health` checks the database; `/health/live` only checks that the process answers.
- Railway or Render: use the same Dockerfile, set the same variables, set the release or pre-deploy command to `npm run db:deploy`, and keep `TRUST_PROXY=1`.

## 5. Web app (Cloudflare Pages)

1. Create a Pages project connected to the GitHub repository.
2. Build command: `pnpm install --frozen-lockfile && pnpm --filter @tenara/mobile export:web`. Output directory: `apps/mobile/dist`. Environment: `EXPO_PUBLIC_API_URL=https://api.<domain>` and `NODE_VERSION=24`.
3. Add the custom domain `app.<domain>`.
4. Check: sign up on the web app, reload, and confirm you stay signed in. Deep links like `/chore/<id>` load thanks to `public/_redirects`.

## 6. Expo and push notifications

1. Create a free Expo account. In `apps/mobile`, run `npx eas init`. It prints a project id: set it as `EAS_PROJECT_ID` in `app.config.ts` (or as an EAS environment variable). Push tokens need it.
2. In [apps/mobile/eas.json](../apps/mobile/eas.json), replace `https://api.example.com` with `https://api.<domain>` in each profile.
3. Android push testing: `npx eas build --profile development --platform android`, then install it on a phone (Expo Go on Android no longer receives remote pushes). On iPhone, Expo Go receives pushes once the project id exists.
4. Optional: if you turn on "enhanced push security" for the Expo project, add `EXPO_ACCESS_TOKEN` to the API's secrets.

## 7. iOS beta (TestFlight)

1. Join the Apple Developer Program, then create the app in App Store Connect with the bundle ID from step 0.
2. Set `APPLE_TEAM_ID` (Apple Developer > Membership) as an EAS environment variable: the home-screen widget is a separate target that needs it to be signed. Both the app and the widget use the App Group `group.com.gettenara.family`; EAS registers it when asked.
3. Run `npx eas build --platform ios --profile production`. EAS creates the signing certificates (app and widget) and the push key (APNs) when asked.
4. Run `npx eas submit --platform ios`, then add testers in TestFlight. Internal testers need no review; external testers need a short beta review.

## 8. Android beta (Play internal testing)

1. Create a Google Play Console account and the app.
2. Push on Android needs Firebase Cloud Messaging: create a Firebase project and add the Android app with the same package name. Upload the FCM V1 service-account key to EAS (`npx eas credentials`).
3. Run `npx eas build --platform android --profile production`, then `npx eas submit --platform android` to the internal testing track.
4. New personal developer accounts must run a closed test with at least 12 testers for 14 days before a production release.

## 9. Subscriptions (RevenueCat)

Pro is $4.99 a month or $34.99 a year. The 14-day trial is the app's own, so don't add a store free-trial offer.

1. **App Store Connect:** create a subscription group "Tenara Pro" with two auto-renewing subscriptions, `tenara_pro_monthly` ($4.99, 1 month) and `tenara_pro_yearly` ($34.99, 1 year). Fill in their display names and review screenshots (the Pro screen). Join the Small Business Program (15% instead of 30%).
2. **Google Play Console:** create subscriptions with the same product ids and base plans (monthly and yearly).
3. **RevenueCat:** create a project with an iOS app, an Android app, and a Web Billing app (connect Stripe for the web). Add the products, an entitlement named exactly `pro` attached to both, and a default offering with a Monthly and an Annual package.
4. **Keys:**
   - The API: `REVENUECAT_SECRET_KEY` (a secret API key) and `REVENUECAT_WEBHOOK_AUTH` (make up a long value such as `Bearer <random>`), with `fly secrets set`. The API won't start in production without them.
   - The apps: the public SDK keys as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` in `eas.json`, and `EXPO_PUBLIC_REVENUECAT_WEB_KEY` (the Web Billing key) in the web host's build settings.
5. **Webhook:** in RevenueCat, Integrations > Webhooks: URL `https://api.<domain>/v1/billing/revenuecat`, Authorization header exactly the `REVENUECAT_WEBHOOK_AUTH` value.
6. **Check:** in a TestFlight build (a sandbox account) and on the web (Stripe test mode), buy Pro on a family past its trial, and confirm the Family tab says "Pro · renews ...". Cancel, and confirm it says "Pro · ends ...". Give a friend-and-family account Pro with a RevenueCat "promotional" grant, never in the database.

## 10. Before public store listings

- **Icons:** final icons from the icon set go in `assets/brand/tenara-family/`; then run `pnpm --filter @tenara/mobile icons`.
- **Name:** do a trademark search on "Tenara" and "Tenara Family" (USPTO; classes 9 and 42) before listings and marketing. Ask about two filings found in November 2026: a UK application for TENARA (UK00004255778, classes 36 and 42, owner not shown) and a pending US application for TENARAI (serial 99585021, Infogain, classes 35 and 42).
- **Privacy policy:** a public URL is required by both stores. The app stores children's names and photos, so the policy should cover what's collected, who sees it (only the family), photo deletion after 90 days, and how to delete an account. Apple's Kids category is optional and adds rules (no third-party analytics or ads); the app doesn't need to be in it.
- **Store privacy forms:** App Store "App Privacy" and Play "Data safety". The app collects names, email addresses (parents), photos, and push tokens, with no tracking and no ads.

## Don'ts

- Don't run `db:seed` against production; the real family signs up in the app.
- Don't commit env files with real values (`.gitignore` blocks `.env*` except the examples).
- Don't make the photo bucket public.
- Don't edit `Subscription` rows or `trialEndsAt` by hand to give someone Pro; grant it in RevenueCat, and the webhook does the rest.
