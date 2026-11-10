#!/usr/bin/env bash
# The restore drill for the Litestream setup of docker-compose.vps.yml, against a throwaway S3 server (S3Mock).
#
#   deploy/vps/restore-drill.sh start     the app is running: start replicating its live database
#   deploy/vps/restore-drill.sh finish    the app has been stopped: restore the replica and compare the two
#
# It uses the Litestream image named in docker-compose.vps.yml and the shipped deploy/vps/litestream.yml, so it
# proves what a VPS runs. The CI job e2e-smoke runs it around its "A stop is clean" step, with the app's sqlite
# folder in the volume DRILL_VOLUME on the network DRILL_NETWORK. It needs Docker and curl, nothing else.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here=$(cd "$(dirname "$0")" && pwd)
image=$(grep -m1 -oE 'litestream/litestream:[0-9.]+' "$here/../../docker-compose.vps.yml")
network=${DRILL_NETWORK:-e2e}
volume=${DRILL_VOLUME:-cartvibe-sqlite}
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
  docker run -d --name "$s3" --network "$network" -p 9100:9090 \
    -e "COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=$bucket" adobe/s3mock:5.2.3 > /dev/null
  for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:9100/$bucket?list-type=2" > /dev/null 2>&1; then break; fi
    sleep 1
  done
  curl -fsS "http://localhost:9100/$bucket?list-type=2" > /dev/null

  # TEMPORARY (one CI run): the same database replicated by the old version first, to the same bucket path, to see
  # what an upgrade in place meets.
  if [ -n "${UPGRADE_FROM:-}" ]; then
    old_config=${RUNNER_TEMP:-/tmp}/litestream-old.yml
    printf 'dbs:\n  - path: /data/sqlite/app.db\n    replicas:\n      - type: s3\n        bucket: %s\n        path: litestream/app.db\n        endpoint: http://%s:9090\n        region: us-east-1\n        snapshot-interval: 24h\n        retention: 168h\n        sync-interval: 1s\n' "$bucket" "$s3" > "$old_config"
    docker run -d --name drill-old --network "$network" --user 10001:10001 \
      -e "LITESTREAM_ACCESS_KEY_ID=$key" -e "LITESTREAM_SECRET_ACCESS_KEY=$secret" \
      -v "$old_config:/etc/litestream.yml:ro" -v "$volume:/data/sqlite" "litestream/litestream:$UPGRADE_FROM" replicate -config /etc/litestream.yml > /dev/null
    sleep 15
    docker stop --time 20 drill-old > /dev/null
    docker logs drill-old 2>&1 | tail -15
    echo "drill: what $UPGRADE_FROM left in the bucket:"
    listing=$(keys)
    printf '%s\n' "$listing" | tail -20
    echo "drill: and beside the database:"
    docker run --rm -v "$volume:/data/sqlite:ro" alpine:3 sh -c 'ls -la /data/sqlite; find /data/sqlite/.app.db-litestream -maxdepth 3 | head -20'
  fi

  docker run -d --name drill-litestream "${common[@]}" -v "$volume:/data/sqlite" "$image" replicate -config /etc/litestream.yml > /dev/null
  for _ in $(seq 1 60); do
    listing=$(keys)
    case "$listing" in
      *ltx*)
        echo "drill: the first files are in the bucket"
        printf '%s\n' "$listing" | tail -10
        return 0
        ;;
    esac
    sleep 1
  done
  docker logs drill-litestream --tail 50
  echo "drill: nothing reached the bucket in 60 seconds" >&2
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
