# Deploying Qazaq

Two modes: **dev** (plain HTTP, no TLS) and **prod** (Caddy in
front, Let's Encrypt auto-renewal, hourly off-site backups).

## Dev — local-only, no TLS

```bash
# One-time: bring up the api + web + tts containers and
# the named qazaq-data volume. Plain HTTP on :8080.
docker compose up -d --build

# Open http://localhost:8080, register an account, study.
```

The web container publishes :8080 directly. No Caddy, no
backup container.

## Prod — public DNS, HTTPS, backups

### One-time host setup

1. Point an A/AAAA record at this host:
   `anki.example.com → <your-public-IP>`
2. Open TCP ports 80 and 443 to the internet. Caddy uses
   port 80 for the Let's Encrypt http-01 challenge; once
   the cert is issued it serves on 443.
3. Pick where off-site backups go (S3, B2, a NAS, etc.) —
   this guide assumes `./backups/` is sync'd by something
   external to this app (rclone cron on the host, restic,
   whatever you already use).

### First-time deploy

```bash
# 1. Create the secrets file. openssl rand -hex 32 gives 64
#    hex chars; the api reads it as the ADMIN_TOKEN env var,
#    the backup container reads it as /run/secrets/admin_token.
openssl rand -hex 32 > secrets/admin_token.txt
chmod 600 secrets/admin_token.txt

# 2. Create ./backups/. The backup container bind-mounts
#    this and writes snapshots here. Whatever sync tool you
#    use should pull from this directory off-site.
mkdir -p backups && touch backups/.gitkeep

# 3. Copy the env template and fill it in.
cp .env.production.example .env.production
$EDITOR .env.production   # set CADDY_DOMAIN, CADDY_EMAIL

# 4. Bring up the prod stack. Caddy is gated by the "prod"
#    profile so dev sessions don't accidentally expose :80/:443.
docker compose --profile prod up -d --build
```

That's it. Caddy will auto-issue the Let's Encrypt cert the
first time it sees traffic on :80, then redirect to HTTPS.
Renewals are automatic.

### Verifying

```bash
# Health-check the API directly.
curl -fsS http://localhost:8080/api/health

# Verify HTTPS is live (should 200 or 308).
curl -fsSI https://anki.example.com

# Trigger an immediate backup (uses the same shared token
# as the cron job).
curl -fsS -X POST -H "Authorization: Bearer $(cat secrets/admin_token.txt)" \
  http://localhost:8080/api/admin/backup-now \
  -o backups/manual-$(date +%Y%m%dT%H%M%SZ).sqlite

# Inspect backup container logs (cron + integrity checks).
docker compose logs qazaq-backup --tail=50
```

### Restoring from a backup

The SQLite file in `./backups/qazaq-*.sqlite` is a plain
`application/x-sqlite3` blob — copy it to the volume and
restart the api:

```bash
# 1. Stop the api so it doesn't hold the file open.
docker compose stop qazaq-api

# 2. Drop the current DB and substitute the snapshot.
docker run --rm \
  -v anki-qazaq_qazaq-data:/data \
  -v "$PWD/backups":/backups:ro \
  alpine:3.20 sh -c \
    'rm /data/qazaq.sqlite && cp /backups/qazaq-20260101T000000Z.sqlite /data/qazaq.sqlite'

# 3. Bring the api back up. Schema migrations run on boot,
#    so an older snapshot on a newer schema version still
#    works.
docker compose start qazaq-api
```

### Backups off-site

Anything that can pull from a local directory works. A
minimal rclone cron:

```cron
*/30 * * * * /usr/bin/rclone sync \
  /home/deploy/anki-qazaq/backups \
  b2:my-backups-bucket/anki-qazaq \
  --transfers 4 --checkers 8 \
  --log-file=/var/log/rclone-anki.log
```

The container writes snapshots once an hour; rclone runs
every 30 minutes so off-site has at most 30 minutes of lag.

## Operational notes

### Memory limits

The api container is capped at 512M; if you import a huge
.apkg (>50MB) and process it through sql.js, the in-memory
DB grows. Watch `docker stats` for sustained >400M and
raise the limit if needed. The tts container holds Piper
voice models (~1.5GB) so its limit is set to 2G.

### Restart policy

All services are `restart: unless-stopped`. If you take
the host down for maintenance, `docker compose up -d` after
boot brings everything back up — Caddy reads the certs from
the caddy-data volume, the api re-opens the SQLite file, the
backup container picks up where it left off.

### Updating

```bash
git pull
docker compose --profile prod up -d --build
```

The api container has tini as PID 1 so SIGTERM propagates
cleanly — sql.js flushes its in-memory state to disk before
exit. As long as you don't `kill -9` the api, you won't
lose in-flight writes.
