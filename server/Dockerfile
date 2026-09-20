# API service — Node 22 + sql.js (no native SQLite binary
# needed; the whole DB engine ships as a WASM blob and is
# snapshotted to /data/qazaq.sqlite by the persist() call in
# db.js).
#
# Production-only: dev runs `node --watch server.js` directly on
# the host. The Dockerfile doesn't run `npm ci` against an
# existing node_modules — we copy the lockfile-free
# package.json and install fresh on each build so a stale
# module cache can't leak into the image.

FROM node:22-alpine

WORKDIR /app

# Install prod-only deps in a separate layer so a code change
# doesn't re-download the world.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Then the source. node_modules is excluded by the .dockerignore.
COPY server.js auth.js db.js cards.js ratelimit.js apkg.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

# Tini for clean SIGTERM propagation so sql.js can flush its
# in-memory state to disk before the process exits. The DB is
# small (a few MB) and persists on every write via the
# writeQueue → persist() chain, so an unclean kill only loses
# in-flight writes, not the whole file.
USER node

ENTRYPOINT ["/sbin/tini", "--", "node", "server.js"]
