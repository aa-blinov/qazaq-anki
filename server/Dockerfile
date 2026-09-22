# Multi-stage Dockerfile for the Qazaq API.
#
# Stage 1: install deps + copy source. Stage 2: runtime with prod
# deps only. The result is a small image (~80 MB) with no build
# toolchain, no devDependencies, no source map files.
#
# Usage:
#   docker build -t qazaq-api .
#   docker run --rm -p 3001:3001 \
#     -e PORT=3001 \
#     -e DB_PATH=/data/qazaq.sqlite \
#     -v qazaq-data:/data \
#     qazaq-api
#
# A DB_PATH env var is REQUIRED in production. We refuse to fall back
# to a relative path inside the container so a stale image can never
# silently write into a fresh empty SQLite file.

# ---- Stage 1: deps + source ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Copy manifests first so this layer caches when only source changes.
COPY package.json package-lock.json* ./
# `--include=optional` is needed for sql.js (optional native dep, but
# we ship the WASM build so the optional install is a no-op anyway).
RUN npm ci --omit=dev --include=optional

# Copy the rest of the source. The build context is the repo's
# `server/` directory, so its contents land directly in /app.
COPY . .

# ---- Stage 2: runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Create /data as root (the `node` user can't make top-level dirs),
# then chown it to node so the running process can write to the
# volume that's mounted there in production.
RUN mkdir -p /data && chown node:node /data

# Run as non-root. node:22-bookworm-slim ships with the `node` user
# (uid 1000) ready to go.
USER node

# Copy production node_modules + server source from the build stage.
# In the build context everything lives at the root, so we copy
# straight into /app (no `server/` prefix in the runtime image).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server.js ./server.js
COPY --from=build --chown=node:node /app/db.js ./db.js
COPY --from=build --chown=node:node /app/auth.js ./auth.js
COPY --from=build --chown=node:node /app/cards.js ./cards.js
COPY --from=build --chown=node:node /app/apkg.js ./apkg.js
COPY --from=build --chown=node:node /app/ratelimit.js ./ratelimit.js
COPY --from=build --chown=node:node /app/deck-meta.js ./deck-meta.js
# Deck JSONs — deck-meta.js reads them at boot to build the
# cardId→level map. Without these the per-level stats endpoint
# would throw on startup.
COPY --from=build --chown=node:node /app/src/data/decks ./src/data/decks
COPY --from=build --chown=node:node /app/package.json ./package.json

ENV DB_PATH=/data/qazaq.sqlite
ENV PORT=3001
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3001

# Basic healthcheck — the /api/health endpoint returns {"ok":true,...}.
# We probe it every 30s; three failures mark the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
