# Three stages: the desktop build (Node), the API build (Go with the compiler, the -dev libraries and the Python venv
# for OCR), and a slim Debian runtime that receives only what runs: the binary, the API's files, the venv and the
# desktop's static files. The Go toolchain, the compilers and the *-dev packages stay behind in the build stages.
#
# Layer order matters for build time: each stage installs its dependencies from the few files that declare them
# BEFORE copying the source, so a code-only change reuses the cached dependency layers (npm packages; PyTorch,
# ImageMagick, Tesseract; Go modules). Keep anything that changes per build (VERSION, BUILD_DATE, source) below them.

# ---- Desktop: dependencies, then source
FROM node:lts-alpine AS node
WORKDIR /app/cartvibe-desktop

COPY desktop/package.json desktop/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY desktop/ ./
RUN npm run build

# ---- API: system libraries, Python venv, Go modules, then the source
FROM golang:1.26-trixie AS api-build

ENV BASE_PATH="/app/cartvibe-api"
WORKDIR /app/cartvibe-api

# Tesseract, ImageMagick (with HEIC), Chromium and the Python OCR dependencies. Only the script and the requirements
# file it reads are copied first, so this (by far the slowest) layer survives code changes.
COPY api/set-up-dependencies.sh ./
COPY api/imap-client/requirements.txt ./imap-client/requirements.txt
RUN bash set-up-dependencies.sh

COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ ./
RUN go build

# Every shared library the binary links must be one the runtime stage installs (checked there too).
RUN ldd ./api | tee /tmp/api-libs.txt && ! grep "not found" /tmp/api-libs.txt

# ---- Runtime
FROM debian:trixie-slim

ENV ENV="prod"
ENV BASE_PATH="/app/cartvibe-api"
ENV PYTHONPATH="/app/cartvibe-api/wranglervenv/lib/python3.13/site-packages"

# What the API runs at run time: nginx, Tesseract and its English data, ImageMagick with HEIC and PDF support, Chromium
# (HTML to PDF), Python for the OCR scripts, certificates for HTTPS calls and time zone data for the app time zone.
# Recommended packages stay on for the ones that bring codec plugins and fonts (ImageMagick, Chromium).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata nginx python3 \
    && apt-get install -y imagemagick-7.q16 libheif1 libde265-0 tesseract-ocr-eng chromium \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*

# Allow PDF conversion in ImageMagick (the same policy edit the build stage makes).
RUN POLICY_FILE="/etc/ImageMagick-7/policy.xml"; \
    if [ -f "$POLICY_FILE" ]; then \
      sed -i 's|<policy domain="coder" rights="none" pattern="PDF" />|<policy domain="coder" rights="read\|write" pattern="PDF" />|g' "$POLICY_FILE"; \
    fi

WORKDIR /app/cartvibe-api
COPY --from=api-build /app/cartvibe-api /app/cartvibe-api

# Fail the build, not the NAS, when something the API needs is missing at run time.
RUN ! ldd ./api | grep "not found" \
    && magick -list format | grep -i heic \
    && chromium --version \
    && ./wranglervenv/bin/python -c "import easyocr, imapclient" \
    && tesseract --list-langs | grep -q eng

ARG VERSION
ARG BUILD_DATE
ENV BUILD_DATE=${BUILD_DATE}
ENV VERSION=${VERSION}

# Volumes: data, temp files, sqlite, logs
RUN mkdir -p data temp logs
VOLUME /app/cartvibe-api/data
VOLUME /app/cartvibe-api/sqlite
VOLUME /app/cartvibe-api/logs

# nginx and the entrypoint
WORKDIR /app/cartvibe-api/docker
COPY docker/ .
COPY docker/entrypoint.sh /app
RUN chmod 755 /app/entrypoint.sh
COPY docker/default.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

# The desktop's static files
COPY --from=node /app/cartvibe-desktop/dist/receipt-wrangler/browser /usr/share/nginx/html

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 80
