#!/bin/bash

cd /app/cartvibe-api

# The API runs unprivileged (the image's cartvibe user, or PUID/PGID when set), so a flaw in a library it feeds
# uploads to (ImageMagick, Tesseract, Chromium) does not run as root. nginx stays as it is: its master binds :80
# and its workers are www-data. Folders written by an older image (as root) are handed over first; only files
# not already owned are touched, so this is quick after the first start.
#
# A NAS folder can still refuse that user: on a Synology shared folder the DSM ACL decides, and chown does not
# change it. So the folders are checked as that user. When anything is not writable the container does not start
# and says what to set: PUID/PGID to the DSM user that owns the folders (for example 1026 and 100), which is the
# fix, or ALLOW_ROOT=1 to run the API as root as images before 2026-11-10 did without asking. Running the API, and
# through it ImageMagick, Ghostscript and Chromium, as root is a choice someone makes, never a fallback.
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
  elif [ "${ALLOW_ROOT:-}" = "1" ]; then
    echo "cartvibe: the data, temp, logs or sqlite folder is not writable by uid $APP_UID (a NAS folder permission?)," \
      "so the API runs as root, because ALLOW_ROOT=1 is set. Set PUID and PGID to the user that owns those folders" \
      "to run it unprivileged, then remove ALLOW_ROOT." >&2
  else
    echo "cartvibe: not starting. The data, temp, logs or sqlite folder is not writable by uid $APP_UID (a NAS folder" \
      "permission?). Set PUID and PGID to the user that owns those folders (README, Synology: step 2). To run the" \
      "API as root instead, as older versions did by themselves, set ALLOW_ROOT=1." >&2
    # 78 is EX_CONFIG: a restart will not help until the stack's variables change.
    exit 78
  fi
fi

# bash is PID 1 here. PID 1 ignores TERM unless it traps it, and when PID 1 exits the kernel kills every other
# process in the container at once. So a stop has to do two things: reach the children, and WAIT for them. The trap
# only notes the request; the ordered stop below does the work (a trap interrupts `wait`, which then returns).
stopping=0
trap 'stopping=1' TERM INT

# The API and nginx run as background jobs, and the container ends when EITHER one exits, so the restart policy can
# recover it (an API that crashed behind a running nginx would otherwise leave the container "up" serving 502s).
"${RUN_AS[@]}" ./api --env prod &
api_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

wait -n
status=$?

# Either a stop was asked for (docker stop, a redeploy) or one of the two ended on its own. Both are stopped in
# order: the API first, so it can answer the requests it holds, end the live streams and stop its jobs; nginx after
# it, once nothing is left to proxy. `docker stop` gives this the stack's stop_grace_period before it kills what is
# still running.
kill -TERM "$api_pid" 2>/dev/null
while kill -0 "$api_pid" 2>/dev/null; do
  wait "$api_pid" 2>/dev/null
done
kill -QUIT "$nginx_pid" 2>/dev/null
while kill -0 "$nginx_pid" 2>/dev/null; do
  wait "$nginx_pid" 2>/dev/null
done

# A requested stop is a clean exit; a child that ended by itself passes its status on.
if [ "$stopping" = "1" ]; then
  exit 0
fi
exit "$status"
