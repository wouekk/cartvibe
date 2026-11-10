#!/usr/bin/env bash
# Raises nginx's request limits in a running test container:  e2e/relax-rate-limits.sh [container]
#
# The specs run from one address, two at a time, and a spec provisions its data through the API before it opens a
# page, so together they pass the production limits (10 requests a second, 30 logins a minute). The app does not
# retry a 429: the page a spec is waiting for then comes up empty, or a save stays on its form. One person's page
# load is 2 to 11 requests and never gets near the limit, so the limits are right for the product and wrong for a
# test run. The limits themselves are proved elsewhere (ci.yml, "The request limit answers 429").
#
# It edits the config the image ships, so everything else nginx does is what runs on the NAS.
set -euo pipefail
export MSYS_NO_PATHCONV=1
container=${1:-cartvibe}
conf=/etc/nginx/conf.d/default.conf

docker exec "$container" sed -i \
  -e 's|zone=api:10m rate=10r/s|zone=api:10m rate=1000r/s|' \
  -e 's|zone=login:10m rate=30r/m|zone=login:10m rate=3000r/m|' "$conf"
# A config that no longer has those two lines must fail here, not come back as specs that need a retry.
docker exec "$container" grep -q 'zone=api:10m rate=1000r/s' "$conf"
docker exec "$container" grep -q 'zone=login:10m rate=3000r/m' "$conf"
docker exec "$container" nginx -s reload
echo "$container: nginx request limits raised for the test run"
