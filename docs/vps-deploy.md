# Running CartVibe on a VPS

How to run CartVibe on a rented Linux server (written for OVH, works on any host with Docker) with HTTPS and off-site
backups. The family NAS keeps using the root `docker-compose.yml`; this guide uses `docker-compose.vps.yml`.

## What runs

| Service | What it does |
|---|---|
| `caddy` | The only public service (ports 80 and 443). Gets a Let's Encrypt certificate for your domain and forwards to the app. |
| `cartvibe` | The app image from GHCR (nginx + Go API), unchanged from the NAS. |
| `litestream-restore` | Runs once before the app: restores the database from the bucket if there is none on disk yet. |
| `litestream` | Copies every database change to the bucket about a second after it commits, plus a daily snapshot, kept 7 days. |
| `restic` | Every 6 hours backs up receipt images, trip photos, logos and logs; keeps 14 daily, 8 weekly, 6 monthly. |

Litestream only covers the SQLite database. The files go through restic, so you need both for a full restore.

## One-time setup

1. **Server:** an OVH VPS with Debian or Ubuntu, Docker Engine and the compose plugin. Open ports 22, 80 and 443 only.
   Point a DNS A (and AAAA) record for your domain at the server.
2. **Bucket:** create an OVH Object Storage container (S3 API) and an S3 user with access to it. Note the endpoint
   (for example `https://s3.gra.io.cloud.ovh.net`), the region (`gra`), the bucket name and the key pair.
3. **Files:** clone the repository (or copy `docker-compose.vps.yml` and the `deploy/vps/` folder) into, say,
   `/srv/cartvibe`, then create `.env` next to the compose file and run `chmod 600 .env`:

   ```
   CARTVIBE_DOMAIN=cartvibe.example.com
   TZ=Europe/Warsaw
   SECRET_KEY=<64 random letters and digits>
   ENCRYPTION_KEY=<64 random letters and digits>
   S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
   S3_REGION=gra
   S3_BUCKET=cartvibe-backups
   S3_ACCESS_KEY_ID=<key>
   S3_SECRET_ACCESS_KEY=<secret>
   RESTIC_PASSWORD=<a long passphrase; without it the file backups cannot be read>
   VAPID_PUBLIC_KEY=<optional, for warranty reminders on devices: npx web-push generate-vapid-keys>
   VAPID_PRIVATE_KEY=<the private half of the same pair>
   VAPID_SUBJECT=mailto:you@example.com
   ```

   No `$` in any value: compose reads it as a variable. `SECRET_KEY` and `ENCRYPTION_KEY` are required: compose stops
   with "must be set" when either is missing. `openssl rand -hex 32` gives a safe 64-character value. Keep
   `ENCRYPTION_KEY` and `RESTIC_PASSWORD` somewhere other than the server too: a restore needs them.
4. **Folders:** `mkdir -p data/sqlite data/files data/logs && chown -R 10001:10001 data`. The app and Litestream run as
   uid 10001; set `PUID` / `PGID` in `.env` if you use another owner.
5. **Start:** `docker compose -f docker-compose.vps.yml up -d`, then follow
   `docker compose -f docker-compose.vps.yml logs -f cartvibe` until the API logs `sqlite journal mode: wal`. Caddy
   starts once the app's health check passes, so `docker compose -f docker-compose.vps.yml ps` shows `cartvibe` as
   `healthy` first.
6. **In the app** (System Settings): switch **Secure cookies** on (the site is HTTPS only now) and set the public URL
   fields to `https://<your domain>`.

The image's nginx trusts `X-Forwarded-For` from private networks only, so the login and sign-up rate limits apply to
each visitor's real address behind Caddy.

## Updating

`docker compose -f docker-compose.vps.yml pull && docker compose -f docker-compose.vps.yml up -d`. Nothing has to be
backed up by hand first: a new version copies the database to `data/sqlite/backups` before it changes anything (the
[FAQ](faq.md#how-do-i-go-back-to-an-earlier-copy-of-the-database) shows how to go back to a copy), and Litestream has
every change up to a second ago in the bucket. To list what the bucket holds:
`docker compose -f docker-compose.vps.yml exec litestream litestream snapshots -config /etc/litestream.yml /data/sqlite/app.db`

**Coming from a stack with a `valkey` service:** take the current `docker-compose.vps.yml`, remove `VALKEY_PASSWORD`
from `.env`, then `docker compose -f docker-compose.vps.yml up -d --remove-orphans` and delete the leftover volume
(`docker volume ls | grep valkey-data`, then `docker volume rm <name>`). Background jobs are kept in the database now.

To roll back, or to stay on a known version, replace `:latest` in the compose file with the `:sha-<commit>` tag of
that build (each published image carries both; the About page shows the one you run), then `up -d` again. A rollback
across a schema change also needs the database from before it.

## Restore drill (do it once after setup, then every few months)

Restore to a scratch folder, never over the live data:

```bash
mkdir -p /tmp/cv-restore && chown 10001:10001 /tmp/cv-restore
```

```bash
docker compose -f docker-compose.vps.yml run --rm -v /tmp/cv-restore:/out litestream-restore restore -config /etc/litestream.yml -o /out/app.db /data/sqlite/app.db
```

```bash
docker compose -f docker-compose.vps.yml exec restic restic restore latest --target /tmp/restore-check --include /backup/files
```

Open `/tmp/cv-restore/app.db` with `sqlite3` and run `PRAGMA integrity_check;` and `SELECT count(*) FROM receipts;`.
Then compare a few receipt images under `/tmp/restore-check` (inside the restic container) with the live ones.

**A real disaster** (new server): do the one-time setup with the same `.env`, then bring the files back before
`up -d`:

```bash
docker compose -f docker-compose.vps.yml run --rm --no-deps -v "$PWD/data:/restore" --entrypoint restic restic restore latest --target /restore
```

That writes `data/backup/files` and `data/backup/logs`; move their contents into `data/files` and `data/logs`, run
`chown -R 10001:10001 data`, then `up -d`. The `litestream-restore` step brings the database back on its own, because
there is no `app.db` yet.

## Keeping an eye on it

- Disk: alert at 80% (OVH monitoring or a cron `df` check). The database, the WAL and the receipt images grow on the
  same disk.
- `docker compose -f docker-compose.vps.yml logs --since 24h restic | grep FAILED` should print nothing.
- `litestream` logs a line per snapshot. No lines means replication has stopped; restart the service.
- Background work needs no tuning: scans are read one at a time, and SQLite writes one thing at a time anyway.
