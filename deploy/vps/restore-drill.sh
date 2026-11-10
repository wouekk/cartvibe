#!/usr/bin/env bash
# The restore drill for the Litestream setup of docker-compose.vps.yml, against a throwaway S3 server (S3Mock).
#
#   deploy/vps/restore-drill.sh start     the app is running: start replicating its live database
#   deploy/vps/restore-drill.sh finish    the app has been stopped: restore the replica and compare the two
#
# It uses the Litestream image named in docker-compose.vps.yml and the shipped deploy/vps/litestream.yml, so it
# proves what a VPS runs. The CI job e2e-smoke runs it around its "A stop is clean" step, with the app's sqlite
# folder in the volume DRILL_VOLUME on the network DRILL_NETWORK. It needs Docker and curl, nothing else.
#
# What it showed on 2026-11-10, with 0.3.13 run first on the same database and bucket path: 0.5.18 starts beside
# what 0.3 left behind (its generations/ folder in the bucket and under .app.db-litestream), takes its own first
# snapshot, and the restore gives back every table and row. So an upgrade needs no clean-up first.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here=$(cd "$(dirname "$0")" && pwd)
image=$(grep -m1 -oE 'litestream/litestream:[0-9.]+' "$here/../../docker-compose.vps.yml")
network=${DRILL_NETWORK:-e2e}
volume=${DRILL_VOLUME:-cartvibe-sqlite}
# Where the running app answers, and an account to sign in with (E2E_USER_USERNAME / E2E_USER_PASSWORD).
app_url=${DRILL_APP_URL:-http://localhost:8091}
s3=drill-s3
bucket=cartvibe
# S3Mock checks no credentials; Litestream still wants a pair.
key=drill-access-key
secret=drill-secret-key

# What docker-compose.vps.yml gives its two Litestream services.
common=(--network "$network" --user 10001:10001
  -e "LITESTREAM_ACCESS_KEY_ID=$key" -e "LITESTREAM_SECRET_ACCESS_KEY=$secret"
  -e "S3_BUCKET=$bucket" -e "S3_ENDPOINT=http://$s3:9090" -e S3_REGION=us-east-1
  -v "$here/litestream.yml:/etc/litestream.yml:ro")

# The keys under the replica's path, one per line.
keys() {
  curl -fsS "http://localhost:9100/$bucket?list-type=2&prefix=litestream/" | grep -oE '<Key>[^<]+' | sed 's/<Key>//' || true
}

start() {
  echo "drill: $image"
  docker run -d --quiet --name "$s3" --network "$network" -p 9100:9090 \
    -e "COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=$bucket" adobe/s3mock:5.2.3 > /dev/null
  for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:9100/$bucket?list-type=2" > /dev/null 2>&1; then break; fi
    sleep 1
  done
  curl -fsS "http://localhost:9100/$bucket?list-type=2" > /dev/null

  docker run -d --quiet --name drill-litestream "${common[@]}" -v "$volume:/data/sqlite" "$image" replicate -config /etc/litestream.yml > /dev/null
  # 0.5 keeps its files as <path>/<level>/<first>-<last>.ltx.
  for _ in $(seq 1 60); do
    listing=$(keys)
    case "$listing" in
      *.ltx*)
        echo "drill: the first snapshot is in the bucket"
        break
        ;;
    esac
    sleep 1
  done
  case "$listing" in
    *.ltx*) ;;
    *)
      docker logs drill-litestream --tail 50
      echo "drill: nothing reached the bucket in 60 seconds" >&2
      exit 1
      ;;
  esac

  # A write after the snapshot (a sign-in stores a session), so the restore has to bring back a change that was
  # streamed, not only the snapshot. The second file in the bucket is that change.
  before=$(printf '%s\n' "$listing" | grep -c '\.ltx')
  curl -fsS -o /dev/null -X POST "$app_url/api/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$E2E_USER_USERNAME\",\"password\":\"$E2E_USER_PASSWORD\"}"
  for _ in $(seq 1 30); do
    listing=$(keys)
    if [ "$(printf '%s\n' "$listing" | grep -c '\.ltx')" -gt "$before" ]; then
      echo "drill: a change made after the snapshot is in the bucket"
      printf '%s\n' "$listing"
      return 0
    fi
    sleep 1
  done
  docker logs drill-litestream --tail 50
  echo "drill: the change made after the snapshot did not reach the bucket in 30 seconds" >&2
  exit 1
}

finish() {
  # A moment for the last pages (the sync interval is a second), then a stop: Litestream sends what is left first.
  sleep 3
  docker stop --time 40 drill-litestream > /dev/null
  docker logs drill-litestream 2>&1 | tail -15

  docker volume create drill-restored > /dev/null
  docker run --rm -v drill-restored:/out alpine:3 chown 10001:10001 /out
  docker run --rm "${common[@]}" -v drill-restored:/out "$image" restore -config /etc/litestream.yml -o /out/app.db /data/sqlite/app.db

  docker run --rm -v "$volume:/live" -v drill-restored:/restored:ro -v "$here/compare-databases.py:/compare.py:ro" \
    python:3-alpine python /compare.py /live/app.db /restored/app.db
  docker rm -f "$s3" > /dev/null
}

case "${1:-}" in
  start) start ;;
  finish) finish ;;
  *)
    echo "usage: $0 start|finish" >&2
    exit 2
    ;;
esac
