# Caddy reverse proxy + automatic Let's Encrypt.
#
# Why Caddy over nginx-front-of-nginx? Caddy ships with
# ACME (Let's Encrypt) built in, no certbot cron, no
# separate nginx config to maintain for TLS. We still keep
# nginx inside the web container for its routing rules
# (SPA fallback, /api/ proxy, security headers) and put
# Caddy in front for TLS termination.
#
# The two layers add a hop, but it lets us flip between
# HTTP-only dev mode (just docker compose up) and HTTPS
# prod (set CADDY_DOMAIN + open ports 80/443) without
# touching the web container.

FROM caddy:2.8-alpine

# Drop the default Caddyfile so we ship ours.
RUN rm /etc/caddy/Caddyfile

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

# Healthcheck via the on-dashboard port. Caddy answers 200 on
# / for HTTP-only mode and 308 on HTTPS-only mode — both fine.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
