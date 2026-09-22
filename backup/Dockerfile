# Off-site backup container.
#
# Two modes:
#   1. CRON_SCHEDULE set (default hourly): wakes up on cron,
#      calls the API admin checkpoint endpoint, then copies
#      /data/qazaq.sqlite to /backups (a host bind-mount).
#   2. CRON_SCHEDULE=off: just runs once and exits. Useful for
#      manual `docker compose run --rm backup` invocations.
#
# Why not just `cp /data/qazaq.sqlite`?
#   sql.js flushes in-memory state to disk on every persist()
#   call, but the on-disk file is the "main" snapshot — there
#   may still be an open WAL with uncheckpointed pages. The
#   /api/admin/checkpoint endpoint forces a final flush +
#   snapshot so what we copy is guaranteed coherent.
#
# Why alpine?
#   Small, has cronie in the package repo, has sqlite3 CLI
#   (handy for integrity-check via `PRAGMA integrity_check`).

FROM alpine:3.20

RUN apk add --no-cache bash curl sqlite cronie tini

# Default schedule: every hour at minute 0. Set
# CRON_SCHEDULE=off to run once and exit.
ENV CRON_SCHEDULE="0 * * * *"
ENV API_URL=http://qazaq-api:3001
ENV ADMIN_TOKEN_FILE=/run/secrets/admin_token
ENV BACKUP_DIR=/backups
ENV KEEP_LOCAL=24

# The script lives in /scripts so it survives container restarts.
COPY backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh

# We run as root because cronie refuses to start as non-root
# without /etc/crontabs being writable; root is fine in a
# single-tenant container where the only privilege is writing
# to BACKUP_DIR (also root-owned at the bind-mount).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/scripts/backup.sh"]
