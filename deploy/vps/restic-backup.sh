#!/bin/sh
# Backs up CartVibe's files (receipt images, trip photos, logos, logs) with restic every BACKUP_INTERVAL_SECONDS,
# and prunes once a day. The database is not here: Litestream replicates it. Restore drill: docs/vps-deploy.md.
set -u

interval="${BACKUP_INTERVAL_SECONDS:-21600}"

# The first run creates the repository; later runs find it already there.
restic cat config >/dev/null 2>&1 || restic init || exit 1

last_prune=0
while true; do
  if restic backup --host cartvibe --tag files /backup/files /backup/logs; then
    echo "restic: backup done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    echo "restic: backup FAILED $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi

  now=$(date +%s)
  if [ $((now - last_prune)) -ge 86400 ]; then
    restic forget --host cartvibe --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune \
      && last_prune=$now
  fi

  sleep "$interval"
done
