# Web tier — nginx serving the prebuilt Vite bundle. The
# bundle itself is built by `VITE_BASE=/anki-qazaq/ npm run build`
# on the host (or in a builder stage we don't keep around) and
# copied into /usr/share/nginx/html.
#
# Why nginx and not the Vite dev server? Because nginx reads
# the env-substituted /etc/nginx/templates/default.conf.template
# at startup, so the same image works for dev (no TLS) and
# prod (with Caddy in front terminating TLS).

FROM nginx:1.27-alpine

# Strip the default config so our reverse-proxy + SPA fallback
# rule is the only one in play.
RUN rm /etc/nginx/conf.d/default.conf

COPY default.conf.template /etc/nginx/templates/default.conf.template

# The Vite build output. ./dist/ is gitignored; this assumes
# the image is built locally with `docker build -f web/Dockerfile
# . -t qazaq-web:latest` after `VITE_BASE=/anki-qazaq/ npm run build`.
COPY dist/ /usr/share/nginx/html/

# Audio chunks produced by the TTS service are bind-mounted
# from the host at /usr/share/nginx/html/audio. The container
# doesn't bake them in (they're user-specific, lazily
# generated, can be hundreds of MB).
RUN mkdir -p /usr/share/nginx/html/audio

ENV QAZAQ_API=qazaq-api:3001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
