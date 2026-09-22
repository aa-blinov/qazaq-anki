# Web tier — multi-stage build that runs `vite build` inside the
# image and serves the output via nginx. Doing the build inside
# the image (vs. requiring a pre-built dist/ on the host) makes
# the image fully self-contained — `docker compose build qazaq-web`
# is the only command anyone needs.
#
# Why nginx and not the Vite dev server? Because nginx reads
# the env-substituted /etc/nginx/templates/default.conf.template
# at startup, so the same image works for dev (no TLS) and
# prod (with Caddy in front terminating TLS).

# ---- Stage 1: build the Vite bundle ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Copy only what's needed for `npm ci` first so this layer caches
# when only source changes.
COPY package.json package-lock.json* ./
RUN npm ci --include=optional

# Copy the frontend source.
COPY src ./src
COPY public ./public
COPY index.html tsconfig*.json vite*.config.ts ./

# Vite needs VITE_BASE — for self-hosting we serve from root,
# so the production prefix is the same as dev. Override at build
# time with --build-arg VITE_BASE=/anki-qazaq/ to deploy to
# GitHub Pages-style subpaths.
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npx vite build

# ---- Stage 2: nginx runtime ----
FROM nginx:1.27-alpine

# Strip the default config so our reverse-proxy + SPA fallback
# rule is the only one in play.
RUN rm /etc/nginx/conf.d/default.conf

COPY web/default.conf.template /etc/nginx/templates/default.conf.template

# The Vite build output from stage 1.
COPY --from=build /app/dist/ /usr/share/nginx/html/

# Audio chunks produced by the TTS service are bind-mounted
# from the host at /usr/share/nginx/html/audio. The container
# doesn't bake them in (they're user-specific, lazily
# generated, can be hundreds of MB).
RUN mkdir -p /usr/share/nginx/html/audio

ENV QAZAQ_API=qazaq-api:3001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
