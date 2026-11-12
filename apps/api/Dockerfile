# Production image for the Tenara Family API (and, with a different command,
# the job worker). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t tenara-api .
# Run migrations before starting a new version:
#   docker run --rm --env-file prod.env tenara-api npm run db:deploy
#
# Node 24: the newest version Prisma 7 officially supports (dev machines run 26).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# Only the API and the packages it uses (not the Expo app).
RUN pnpm install --frozen-lockfile --filter "@tenara/api..."
RUN pnpm --filter "@tenara/api..." run build
# A self-contained folder: the API, its built workspace packages, and
# production dependencies only.
# dist/ is gitignored, so it's copied in explicitly (it includes the compiled
# Prisma client from src/generated).
RUN pnpm deploy --filter @tenara/api --prod /out \
  && rm -rf /out/dist && cp -r apps/api/dist /out/dist

FROM node:24-slim AS runtime
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
# Liveness only (no database), so a database blip doesn't restart the machine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]
