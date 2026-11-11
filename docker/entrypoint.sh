#!/bin/bash

cd /app/cartvibe-api

# The API runs unprivileged (the image's cartvibe user, or PUID/PGID when set), so a flaw in a program it feeds
# uploads to (ImageMagick, Tesseract, Chromium) does not run as root. It is the only process: it serves the web
# app and answers on port 80 itself. Folders written by an older image (as root) are handed over first; only
# files not already owned are touched, so this is quick after the first start.
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

  # Port 80 as someone who is not root. Docker 20.10 and newer let any user in a container bind any port (the
  # kernel setting below is 0 there), and then nothing more is needed. Where the first free port is higher (an
  # older Docker, or the host's network), the right to bind low ports, which the compose files keep for the
  # container (NET_BIND_SERVICE), is handed to the API as it drops root. It is tried first, so a kernel or a
  # capability set that refuses leaves the plain drop, and the API then says in its log why it cannot listen.
  first_free_port=$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || echo 1024)
  if [ "$first_free_port" -gt 80 ]; then
    BIND=(--inh-caps=+net_bind_service --ambient-caps=+net_bind_service)
    if "${DROP[@]}" "${BIND[@]}" true 2>/dev/null; then
      DROP+=("${BIND[@]}")
    fi
  fi

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

# bash stays PID 1 and the API is its child, for two reasons. PID 1 ignores TERM unless it traps it, and when
# PID 1 exits the kernel kills every other process in the container at once: so a stop has to reach the API and
# WAIT for it. And the programs the API starts (ImageMagick with Ghostscript under it, Chromium with its helpers)
# can leave children behind when one is stopped at its time limit; those are adopted by PID 1, and bash collects
# them where the API would not. The trap only notes the request; the stop below does the work (a trap
# interrupts `wait`, which then returns).
stopping=0
trap 'stopping=1' TERM INT

"${RUN_AS[@]}" ./api --env prod &
api_pid=$!

# Returns when the API ends by itself (its status is the container's, so the restart policy can recover it) or
# when a stop was asked for.
wait "$api_pid"
status=$?

# A stop (docker stop, a redeploy): the API answers the requests it holds, ends the live streams, stops its jobs
# and closes the database. `docker stop` gives this the stack's stop_grace_period before it kills what is still
# running.
kill -TERM "$api_pid" 2>/dev/null
while kill -0 "$api_pid" 2>/dev/null; do
  wait "$api_pid" 2>/dev/null
done

# A requested stop is a clean exit; an API that ended by itself passes its status on.
if [ "$stopping" = "1" ]; then
  exit 0
fi
exit "$status"
