#!/bin/bash

cd /app/cartvibe-api

# The API runs unprivileged (the image's cartvibe user, or PUID/PGID when set), so a flaw in a library it feeds
# uploads to (ImageMagick, Tesseract, Chromium) does not run as root. nginx stays as it is: its master binds :80
# and its workers are www-data. Folders written by an older image (as root) are handed over first; only files
# not already owned are touched, so this is quick after the first start.
#
# A NAS folder can still refuse that user: on a Synology shared folder the DSM ACL decides, and chown does not
# change it. So the folders are checked as that user, and when anything is not writable the API runs as root
# (as before) and says why, instead of failing to start. PUID/PGID set to the DSM user that owns the folders
# (for example 1026 and 100) avoids that.
RUN_AS=()
if [ "$(id -u)" = "0" ] && id cartvibe >/dev/null 2>&1; then
  APP_UID="${PUID:-$(id -u cartvibe)}"
  APP_GID="${PGID:-$(id -g cartvibe)}"
  mkdir -p data temp logs sqlite /home/cartvibe
  find data temp logs sqlite \! -user "$APP_UID" -exec chown "$APP_UID:$APP_GID" {} + 2>/dev/null
  chown "$APP_UID:$APP_GID" /home/cartvibe

  DROP=(setpriv --reuid="$APP_UID" --regid="$APP_GID" --clear-groups)
  if "${DROP[@]}" sh -c 'out=$(find data temp logs sqlite \! -writable -print -quit 2>&1) && [ -z "$out" ]'; then
    RUN_AS=("${DROP[@]}" env HOME=/home/cartvibe)
  else
    echo "cartvibe: the data, temp, logs or sqlite folder is not writable by uid $APP_UID (a NAS folder permission?)," \
      "so the API runs as root. Set PUID and PGID to the user that owns those folders to run it unprivileged." >&2
  fi
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
