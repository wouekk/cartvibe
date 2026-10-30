# Three stages: the desktop build (Node), the API build (Go with the compiler and the -dev libraries), and a slim Debian
# runtime that receives only what runs: the binary, the API's files and the desktop's static files. The Go toolchain, the compilers and the *-dev packages stay behind in the build stages.
#
# Layer order matters for build time: each stage installs its dependencies from the few files that declare them
# BEFORE copying the source, so a code-only change reuses the cached dependency layers (npm packages;
# ImageMagick, Tesseract; Go modules). Keep anything that changes per build (VERSION, BUILD_DATE, source) below them.
# The weekly publish run builds without the cache, so the apt layers pick up Debian's security updates.

# ---- Desktop: dependencies, then source
FROM node:lts-alpine AS node
WORKDIR /app/cartvibe-desktop

COPY desktop/package.json desktop/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY desktop/ ./
RUN npm run build

# The inline theme script in the built index.html must be allowed by the CSP in default.conf (a wrong hash blocks it).
COPY docker/default.conf /tmp/default.conf
RUN node tools/check-csp-hash.cjs dist/cartvibe/browser/index.html /tmp/default.conf

# ---- API: system libraries, Go modules, then the source
FROM golang:1.26-trixie AS api-build

ENV BASE_PATH="/app/cartvibe-api"
WORKDIR /app/cartvibe-api

# Tesseract, ImageMagick (with HEIC) and Chromium. Only the script is copied first, so this (by far the slowest)
# layer survives code changes.
COPY api/set-up-dependencies.sh ./
RUN bash set-up-dependencies.sh

COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ ./
RUN go build

# Every shared library the binary links must be one the runtime stage installs (checked there too).
RUN ldd ./api | tee /tmp/api-libs.txt && ! grep "not found" /tmp/api-libs.txt

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

# What the API runs at run time: nginx, Tesseract and its English data, ImageMagick with HEIC and PDF support, Chromium
# (report PDFs), certificates for HTTPS calls and time zone data for the app time zone.
# Recommended packages are off: Tesseract, ghostscript, the fonts and the HEIC plugin are named below because the API
# needs them and they only used to arrive as Recommends. docker/checks/runtime-check.sh proves each one, so a missing
# package fails the build; add the package it names rather than switching Recommends back on.
# The upgrade takes Debian's security fixes released since the base image was built.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates tzdata nginx \
    && apt-get install -y --no-install-recommends imagemagick-7.q16 libheif1 libde265-0 tesseract-ocr-eng chromium \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*

# The API runs as this user (entrypoint.sh drops to it); nginx keeps its own www-data workers.
RUN useradd --system --uid 10001 --user-group --create-home --home-dir /home/cartvibe --shell /usr/sbin/nologin cartvibe

# ImageMagick picks a decoder from a file's content, not its name, so an upload could reach any library it links.
# Allow PDF conversion, and refuse what receipts never are: EXR, vector and script formats (SVG, MVG, MSL,
# PostScript, XPS), remote URLs and reading a file named after "@". Photos (JPEG, PNG, WebP, HEIC, TIFF, GIF) and
# PDF stay; the check below converts a PDF so a policy that breaks it fails the build.
RUN POLICY_FILE="/etc/ImageMagick-7/policy.xml"; \
    test -f "$POLICY_FILE" \
    && sed -i 's|<policy domain="coder" rights="none" pattern="PDF" />|<policy domain="coder" rights="read\|write" pattern="PDF" />|g' "$POLICY_FILE" \
    && sed -i 's|</policymap>|  <policy domain="coder" rights="none" pattern="{EXR,SVG,SVGZ,MSVG,RSVG,MVG,MSL,PS,PS2,PS3,EPS,EPI,EPSF,EPSI,EPT,XPS,PCL,URL,HTTP,HTTPS,FTP,TEXT,SHOW,WIN,X}" />\n  <policy domain="path" rights="none" pattern="@*" />\n</policymap>|' "$POLICY_FILE" \
    && grep -q 'pattern="{EXR,' "$POLICY_FILE"

WORKDIR /app/cartvibe-api
COPY --from=api-build /app/cartvibe-api /app/cartvibe-api

# Fail the build, not the NAS, when something the API needs is missing at run time (libraries, HEIC and PDF
# conversion, fonts, OCR, Chromium printing a PDF). The script lists every failure in one build.
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

# nginx and the entrypoint
WORKDIR /app/cartvibe-api/docker
COPY docker/ .
COPY docker/entrypoint.sh /app
RUN chmod 755 /app/entrypoint.sh
COPY docker/default.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

# The desktop's static files
COPY --from=node /app/cartvibe-desktop/dist/cartvibe/browser /usr/share/nginx/html
# The notice file the Angular build writes next to the app (About links to it).
COPY --from=node /app/cartvibe-desktop/dist/cartvibe/3rdpartylicenses.txt /usr/share/nginx/html/3rdpartylicenses.txt

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]
EXPOSE 80
