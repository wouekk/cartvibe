# Layer order matters for build time: each stage installs its dependencies from the few files
# that declare them BEFORE copying the source, so a code-only change reuses the cached dependency
# layers (npm packages; PyTorch, Chromium, ImageMagick, Tesseract; Go modules) instead of
# reinstalling them. Keep anything that changes per build (VERSION, BUILD_DATE, source) below them.

FROM node:lts-alpine as node
WORKDIR /app/receipt-wrangler-desktop

RUN npm install -g @angular/cli

# Setup Desktop: dependencies, then source
COPY desktop/package.json desktop/package-lock.json ./
RUN npm ci

COPY desktop/ ./
RUN npm run build

# Setup API
FROM golang:1.26-trixie

# Add local bin to path for python dependencies
ENV PATH="~/.local/bin:${PATH}"

# Set env
ENV ENV="prod"

# Set base path
ENV BASE_PATH="/app/receipt-wrangler-api"

# Set pythonpath
ENV PYTHONPATH="/app/receipt-wrangler-api/wranglervenv/lib/python3.11/site-packages"

WORKDIR /app/receipt-wrangler-api

# Install tesseract, ImageMagick, Chromium and the Python OCR dependencies. Only the script and the
# requirements file it reads are copied first, so this (by far the slowest) layer survives code changes.
COPY api/set-up-dependencies.sh ./
COPY api/imap-client/requirements.txt ./imap-client/requirements.txt
RUN bash set-up-dependencies.sh

# Install nginx
RUN apt update
RUN apt install nginx -y

# Remove default configs
RUN rm /etc/nginx/sites-enabled/*
RUN rm /etc/nginx/sites-available/*

# Go modules, then the API source
COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ ./

# Build api
RUN go build

# Define build arguments
ARG VERSION
ARG BUILD_DATE

# Set build date
ENV BUILD_DATE=${BUILD_DATE}

# Set version
ENV VERSION=${VERSION}

# Set up data volume
RUN mkdir data
VOLUME /app/receipt-wrangler-api/data

# Set up temp directory
RUN mkdir temp

# Set up sqlite volume
VOLUME /app/receipt-wrangler-api/sqlite

# Add logs volume
RUN mkdir logs
VOLUME /app/receipt-wrangler-api/logs

# Setup nginx
WORKDIR /app/receipt-wrangler-api/docker
COPY docker/ .
COPY docker/entrypoint.sh /app
RUN chmod 777 /app/entrypoint.sh
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# Copy desktop dist
COPY --from=node /app/receipt-wrangler-desktop/dist/receipt-wrangler/browser /usr/share/nginx/html

# Clean up
WORKDIR /app

# Set up entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Expose http port
EXPOSE 80
