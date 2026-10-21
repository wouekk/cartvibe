#!/bin/bash

# Source venv
source /app/cartvibe-api/wranglervenv/bin/activate

cd /app/cartvibe-api

# The API runs as the unprivileged cartvibe user, so a flaw in a library it feeds uploads to (ImageMagick,
# Tesseract, Chromium) does not run as root. nginx stays as it is: its master binds :80 and its workers are
# www-data. Folders written by an older image (as root) are handed over first; only files not already owned
# are touched, so this is quick after the first start.
RUN_AS=()
if [ "$(id -u)" = "0" ] && id cartvibe >/dev/null 2>&1; then
  mkdir -p data temp logs sqlite
  find data temp logs sqlite \! -user cartvibe -exec chown cartvibe:cartvibe {} +
  RUN_AS=(setpriv --reuid=cartvibe --regid=cartvibe --init-groups env HOME=/home/cartvibe)
fi

# Forward TERM/INT to the children: bash runs as PID 1 here, and PID 1 ignores
# SIGTERM by default, so `docker stop` previously waited out the full grace
# period and then SIGKILLed everything.
trap 'kill $(jobs -p) 2>/dev/null' TERM INT

# Run the API and nginx as background jobs and exit the container if EITHER one
# exits, so the restart policy / orchestrator can recover it. Previously the API
# ran in the background while only nginx held the foreground, so a crashed API
# left the container "up" serving 502s and the restart policy never fired.
"${RUN_AS[@]}" ./api --env prod &
nginx -g 'daemon off;' &

wait -n
exit $?
