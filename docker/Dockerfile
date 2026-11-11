# Four stages: the desktop build (Node), the API build (Go, no C code), a throwaway stage that makes a test file
# for the runtime checks, and a slim Debian runtime that receives only what runs: the API binary and the desktop's
# static files, which the API serves itself (there is no nginx: api/internal/edge). The Go toolchain and the API's
# source stay behind in the build stages. .dockerignore keeps local build output and data out of the build context.
#
# Layer order matters for build time: each stage installs its dependencies from the few files that declare them
# BEFORE copying the source, so a code-only change reuses the cached dependency layers (npm packages; Go modules).
# Keep anything that changes per build (VERSION, BUILD_DATE, source) below them.
# The weekly publish run builds without the cache, so the apt layers pick up Debian's security updates.

# ---- Desktop: dependencies, then source
# The Node major CI builds with (ci.yml node-version); the weekly no-cache rebuild picks up its patch releases.
FROM node:26-alpine AS node
WORKDIR /app/cartvibe-desktop

COPY desktop/package.json desktop/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY desktop/ ./
RUN npm run build

# ---- API: Go modules, then the source
FROM golang:1.27-trixie AS api-build

ENV BASE_PATH="/app/cartvibe-api"
WORKDIR /app/cartvibe-api

# No C code: ImageMagick and Tesseract are programs the runtime stage installs and the API starts
# (api/internal/imagetool), not libraries the binary links. So this stage installs nothing, and the binary is static.
ENV CGO_ENABLED=0

COPY api/go.mod api/go.sum ./
RUN go mod download

# -trimpath leaves the build machine's paths out of the binary; -s -w drop the symbol table and debug data (a panic
# still prints function names and lines).
COPY api/ ./
RUN go build -trimpath -ldflags "-s -w" -o api .

# The binary must stay static: a shared library it asked for would have to be one the runtime stage installs.
RUN if ldd ./api > /tmp/api-libs.txt 2>&1; then cat /tmp/api-libs.txt; echo "the API binary links shared libraries" >&2; exit 1; fi

# ---- Check fixtures: a tiny HEIC made with a full toolchain (the runtime image has no encoder), so the runtime checks
# decode a real file rather than only listing the format.
FROM debian:trixie-slim AS fixtures
RUN apt-get update \
    && apt-get install -y imagemagick-7.q16 libheif-plugin-x265 \
    && mkdir /out \
    && magick -size 16x16 gradient:white-black /out/tiny.heic \
    && test -s /out/tiny.heic

# ---- Runtime
FROM debian:trixie-slim

ENV ENV="prod"
ENV BASE_PATH="/app/cartvibe-api"

# What the API runs at run time, the programs it starts: ImageMagick (`magick`, with HEIC and PDF
# support), Tesseract (`tesseract`, with its data for the five languages the app ships in) and Chromium (report
# PDFs); certificates for HTTPS calls and time zone data for the app time zone.
# Recommended packages are off: Tesseract, ghostscript (PDF to image) and the fonts (Helvetica for ImageMagick,
# Liberation for Arial in reports) are named below because they only used to arrive as Recommends.
# docker/checks/runtime-check.sh proves each one, with the very commands the API runs, so a missing
# package fails the build; add the package it names rather than switching Recommends back on.
# The upgrade takes Debian's security fixes released since the base image was built.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && apt-get install -y --no-install-recommends imagemagick-7.q16 libheif1 libde265-0 tesseract-ocr tesseract-ocr-eng tesseract-ocr-pol tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa ghostscript fonts-urw-base35 fonts-liberation chromium \
    && rm -rf /var/lib/apt/lists/*

# The API runs as this user (entrypoint.sh drops to it).
RUN useradd --system --uid 10001 --user-group --create-home --home-dir /home/cartvibe --shell /usr/sbin/nologin cartvibe

# ImageMagick picks a decoder from a file's content, not its name, so an upload could reach any library it links.
# Our own policy replaces Debian's: only receipt formats (JPEG, PNG, WebP, GIF, HEIC, TIFF, PDF), Ghostscript as the
# only external program, resource limits sized for phone photos, and no risky paths. The check below proves it.
COPY docker/imagemagick/policy.xml /etc/ImageMagick-7/policy.xml

# The binary alone: the translations and the brand list are compiled into it, and it creates what it writes.
WORKDIR /app/cartvibe-api
COPY --from=api-build /app/cartvibe-api/api /app/cartvibe-api/api

# Fail the build, not the NAS, when something the API needs is missing at run time (HEIC and PDF conversion,
# fonts, OCR, Chromium printing a PDF). The script lists every failure in one build.
COPY --from=fixtures /out/tiny.heic /tmp/checks/tiny.heic
COPY docker/checks/runtime-check.sh /tmp/checks/runtime-check.sh
RUN sh /tmp/checks/runtime-check.sh && rm -rf /tmp/checks

ARG VERSION
ARG BUILD_DATE
ENV BUILD_DATE=${BUILD_DATE}
ENV VERSION=${VERSION}

# Volumes: data, temp files, sqlite, logs. Owned by the API's user; entrypoint.sh hands over what a mounted
# folder from an older image (written as root) still holds.
RUN mkdir -p data temp logs sqlite && chown -R cartvibe:cartvibe data temp logs sqlite
VOLUME /app/cartvibe-api/data
VOLUME /app/cartvibe-api/sqlite
VOLUME /app/cartvibe-api/logs

# The entrypoint: drops root and starts the API, the container's one process.
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh

# The desktop's static files
# The API serves them from here (WEB_ROOT's default in api/main.go), read-only: they belong to root.
COPY --from=node /app/cartvibe-desktop/dist/cartvibe/browser /app/cartvibe-web
# The notice file the Angular build writes next to the app (About links to it).
COPY --from=node /app/cartvibe-desktop/dist/cartvibe/3rdpartylicenses.txt /app/cartvibe-web/3rdpartylicenses.txt

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 80

# Healthy when the API answers on port 80 with the public feature config (no login needed). The image has
# no curl or wget, so bash's /dev/tcp sends the request (runtime-check.sh proves bash can). Metadata only: it adds no
# layer, so it sits at the end.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/80 && printf 'GET /api/featureConfig HTTP/1.0\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && read -r _ code _ <&3 && [ \"$code\" = 200 ]"]
