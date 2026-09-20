#!/usr/bin/env bash
# backup/backup.sh — runs inside the backup container.
#
# The script does three things on a schedule (or once, if
# CRON_SCHEDULE=off):
#   1. POST /api/admin/checkpoint so sql.js flushes its
#      in-memory state to /data/qazaq.sqlite.
#   2. Copy /data/qazaq.sqlite to /backups/qazaq-<UTC>.sqlite.
#   3. Run `sqlite3 PRAGMA integrity_check` and refuse to
#      delete old backups if the new one is corrupted (so a
#      silent disk-rot doesn't nuke all our history).
#
# Off-site sync is intentionally OUT of this script — mount
# /backups on the host with your favourite tool (rclone,
# restic, borg, rsync) and let cron on the host do the rest.
# Keeping off-site out of the container means the same image
# works whether you back up to S3, B2, a NAS, or nothing.
set -euo pipefail

API_URL="${API_URL:-http://qazaq-api:3001}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_LOCAL="${KEEP_LOCAL:-24}"   # number of local snapshots to keep
CRON_SCHEDULE="${CRON_SCHEDULE:-0 * * * *}"
ADMIN_TOKEN="$(cat "${ADMIN_TOKEN_FILE:-/run/secrets/admin_token}" 2>/dev/null || true)"

mkdir -p "$BACKUP_DIR"

run_backup() {
  local stamp ts_path size_bytes integ
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  ts_path="$BACKUP_DIR/qazaq-${stamp}.sqlite"

  echo "[backup] $(date -u +%FT%TZ) start"

  if [[ -z "$ADMIN_TOKEN" ]]; then
    echo "[backup] FATAL: ADMIN_TOKEN_FILE points at an empty file." >&2
    echo "[backup] Set ADMIN_TOKEN on the api service and pass it as a" >&2
    echo "[backup] shared secret to this container." >&2
    exit 1
  fi

  # 1. Force the API to flush + checkpoint. This returns once
  #    sql.js has written the latest snapshot to disk. Without
  #    this step we'd risk copying the main file mid-write and
  #    ending up with a half-flushed snapshot.
  if ! curl -fsS --max-time 30 \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${API_URL}/api/admin/checkpoint" >/dev/null; then
    echo "[backup] FATAL: checkpoint endpoint failed — skipping snapshot." >&2
    exit 1
  fi

  # 2. Snapshot. Use cp -f to overwrite if the timestamp
  #    collides (cron running at second boundaries).
  cp -f /data/qazaq.sqlite "$ts_path"
  size_bytes=$(stat -c '%s' "$ts_path")

  # 3. Integrity check. PRAGMA integrity_check returns one
  #    row per check; we want a single "ok" line.
  integ="$(sqlite3 "$ts_path" 'PRAGMA integrity_check;')"
  if [[ "$integ" != "ok" ]]; then
    echo "[backup] FATAL: integrity_check failed:" >&2
    echo "$integ" >&2
    # Don't delete the corrupted file — it's a forensic
    # artifact for the human to inspect.
    exit 1
  fi

  echo "[backup] $(date -u +%FT%TZ) ok $stamp ${size_bytes} bytes"

  # 4. Rotate. Keep the last KEEP_LOCAL snapshots; delete older.
  #    ls -1tr lists oldest-first; head -n -KEEP_LOCAL gives us
  #    everything that's beyond the keep window.
  deleted=0
  while IFS= read -r old; do
    [[ "$old" == "$ts_path" ]] && continue
    rm -f -- "$old"
    deleted=$((deleted + 1))
  done < <(ls -1tr "$BACKUP_DIR"/qazaq-*.sqlite 2>/dev/null | head -n -"$KEEP_LOCAL" || true)
  [[ $deleted -gt 0 ]] && echo "[backup] rotated $deleted old snapshot(s)"
}

if [[ "$CRON_SCHEDULE" == "off" ]]; then
  run_backup
  exit 0
fi

# Cron mode. Write the schedule, start crond in the foreground.
echo "$CRON_SCHEDULE /scripts/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
chmod 600 /etc/crontabs/root
touch /var/log/backup.log

# Initial run so we have a snapshot right after the stack comes
# up, not only after the first cron tick.
run_backup

# exec so SIGTERM from docker stop propagates to crond.
exec crond -f -L /dev/stdout
