#!/usr/bin/env bash
# The restore drill for the Litestream setup of docker-compose.vps.yml, against a throwaway S3 server (MinIO).
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
bucket_dir=${RUNNER_TEMP:-/tmp}/cartvibe-drill-s3
s3=drill-s3
key=drill-access-key
secret=drill-secret-key

# What docker-compose.vps.yml gives its two Litestream services.
common=(--network "$network" --user 10001:10001
  -e "LITESTREAM_ACCESS_KEY_ID=$key" -e "LITESTREAM_SECRET_ACCESS_KEY=$secret"
  -e S3_BUCKET=cartvibe -e "S3_ENDPOINT=http://$s3:9000" -e S3_REGION=us-east-1
  -v "$here/litestream.yml:/etc/litestream.yml:ro")

start() {
  echo "drill: $image"
  # A folder under the server's data folder is a bucket.
  mkdir -p "$bucket_dir/cartvibe"
  docker run -d --name "$s3" --network "$network" -p 9100:9000 -v "$bucket_dir:/data" \
    -e "MINIO_ROOT_USER=$key" -e "MINIO_ROOT_PASSWORD=$secret" minio/minio:latest server /data > /dev/null
  for _ in $(seq 1 30); do
    if curl -fsS http://localhost:9100/minio/health/live > /dev/null 2>&1; then break; fi
    sleep 1
  done
  curl -fsS http://localhost:9100/minio/health/live > /dev/null

  # TEMPORARY (one CI run): the same database replicated by the old version first, to the same bucket path, to see
  # what an upgrade in place meets.
  if [ -n "${UPGRADE_FROM:-}" ]; then
    old_config=${RUNNER_TEMP:-/tmp}/litestream-old.yml
    printf 'dbs:\n  - path: /data/sqlite/app.db\n    replicas:\n      - type: s3\n        bucket: cartvibe\n        path: litestream/app.db\n        endpoint: http://%s:9000\n        region: us-east-1\n        snapshot-interval: 24h\n        retention: 168h\n        sync-interval: 1s\n' "$s3" > "$old_config"
    docker run -d --name drill-old --network "$network" --user 10001:10001 \
      -e "LITESTREAM_ACCESS_KEY_ID=$key" -e "LITESTREAM_SECRET_ACCESS_KEY=$secret" \
      -v "$old_config:/etc/litestream.yml:ro" -v "$volume:/data/sqlite" "litestream/litestream:$UPGRADE_FROM" replicate -config /etc/litestream.yml > /dev/null
    sleep 15
    docker stop --time 20 drill-old > /dev/null
    docker logs drill-old 2>&1 | tail -15
    echo "drill: what $UPGRADE_FROM left in the bucket and beside the database:"
    find "$bucket_dir/cartvibe/litestream" -maxdepth 4 | head -20
    docker run --rm -v "$volume:/data/sqlite:ro" alpine:3 sh -c 'ls -la /data/sqlite; find /data/sqlite/.app.db-litestream -maxdepth 3 | head -20'
  fi

  docker run -d --name drill-litestream "${common[@]}" -v "$volume:/data/sqlite" "$image" replicate -config /etc/litestream.yml > /dev/null
  for _ in $(seq 1 60); do
    if [ -n "$(find "$bucket_dir/cartvibe/litestream" -path '*ltx*' -type f 2> /dev/null | head -1)" ]; then
      echo "drill: the first files are in the bucket"
      return 0
    fi
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
