# Running the API in the Claude Code cloud sandbox

Purpose: boot the API and run the full Go test suite (real cgo bindings) in the ephemeral Claude Code web sandbox. Re-run every session; the container is rebuilt each time.

## Why the normal path does not work

The sandbox is Ubuntu 24.04, while the Docker images and `set-up-dependencies.sh` assume Debian. The cgo binding
`gopkg.in/gographics/imagick.v3` needs ImageMagick 7's MagickWand; Ubuntu ships only ImageMagick 6, so IM7 is built from
source. Install only the native libs below; do not run `set-up-dependencies.sh`.

## Check first: Go and the module downloads

- `go version` must report the `go` line of `go.mod` (1.26.10 at the time of writing). The sandbox image has shipped an
  older Go (1.24.7), and with `GOTOOLCHAIN=auto` the newer toolchain is fetched from `storage.googleapis.com`. If that host
  does not resolve in the session, build the toolchain from its GitHub tag instead (about 3 minutes on 4 cores):
  `git clone --depth 1 --branch go1.26.10 https://github.com/golang/go /opt/go1.26/src-root`, then in `src/`
  `GOROOT_BOOTSTRAP=/usr/local/go ./make.bash`, and put `/opt/go1.26/src-root/bin` first on `PATH` with `GOTOOLCHAIN=local`.
- `go mod download` can fail for single modules for the same reason (the proxy redirects some zips to the same host). Seen
  once: `modernc.org/sqlite`, `modernc.org/libc` and `github.com/segmentio/encoding`. Then `go build ./...` fails and so do
  the tests of every package that imports them (`main`, `mcp`, `routers`, and all that use the database). Say so in the
  results; do not report those packages as passed.
- Last resort to run the database suites anyway: a throwaway module that provides `github.com/glebarez/sqlite` on top of
  `gorm.io/driver/sqlite` (cgo, mattn), switched on with `go test -modfile=<copy of go.mod with a replace>` so `go.mod`
  and `go.sum` stay untouched. It proves the repository logic, not the production driver; label every result that way.

## Steps

1. **A Redis-compatible server** (Redis is installed, not running; Valkey works the same): `redis-server --daemonize yes --save "" --appendonly no`, then `redis-cli ping`.
2. **Tesseract and build tools:**
   `apt-get install -y build-essential pkg-config libtesseract-dev libleptonica-dev tesseract-ocr-eng`
3. **IM7 delegate libs:**
   `apt-get install -y libpng-dev libjpeg-turbo8-dev libtiff-dev libwebp-dev libheif-dev libde265-dev ghostscript libtool`
4. **Build ImageMagick 7** outside the repo (the imagemagick.org archive tarball 404s; clone instead):
   ```bash
   git clone --depth 1 https://github.com/ImageMagick/ImageMagick.git && cd ImageMagick
   ./configure --prefix=/usr/local --with-heic=yes --with-jpeg=yes --with-png=yes \
               --with-tiff=yes --with-webp=yes --with-gslib=yes --disable-docs --without-magick-plus-plus
   make -j"$(nproc)" && make install && ldconfig
   ```
   `ldconfig` is the key step: `/usr/local/lib` is already in the loader config, so afterwards neither
   `PKG_CONFIG_PATH` nor `LD_LIBRARY_PATH` is needed. Check with `magick -version` (7.x, Q16-HDRI).
5. **Copy the private headers.** Git master's public headers include private ones (`MagickCore/image-private.h`, …) that
   `make install` does not install, so every cgo compile fails. From the source tree:
   ```bash
   INC=/usr/local/include/ImageMagick-7
   for d in MagickCore MagickWand; do for f in "$d"/*.h; do
     [ -f "$INC/$f" ] || cp "$f" "$INC/$f"; done; done
   ```
   Do not pipe the loop into `head` (SIGPIPE stops it halfway). Verify with a plain `go build ./...` from `api/`, not
   `go build | tail`, whose exit status hides the failure.
6. **Create `api/data/`** (gitignored). Without it the server starts but `POST /group/` fails with a 500
   (`mkdir .../data/<id>-<name>: no such file or directory` in `logs/app.log`), which breaks every e2e fixture that
   provisions a group and looks like a test bug.
7. **Run from `api/`** (`logs/`, `data/`, `sqlite/` are relative to the working directory):
   ```bash
   DB_ENGINE=sqlite DB_FILENAME=wrangler.db ENCRYPTION_KEY=dev SECRET_KEY=dev \
   VALKEY_HOST=127.0.0.1 go run main.go
   ```
   The two keys only need to be non-empty (`env.CheckRequiredEnvironmentVariables`). `dev/switch-to-sqlite.sh` exports
   `VALKEY_HOST=valkey` (the compose service name); override it for a local server. Ready on `Listening on port 8081`;
   smoke test `curl localhost:8081/api/featureConfig`.

## Logging in

The first start creates `admin` / `admin` (any env except `-env test`; `CreateUserIfNoneExist`). Login is
`POST /api/login/?tokensInBody=true` with `{"username":"admin","password":"admin"}`.

## Tests

The suite compiles after steps 1-5. The HTML-to-PDF tests need Chromium; `/usr/bin/chromium` (the default) does not exist
here, but Playwright's build does:

```bash
CHROMIUM_BINARY_PATH=/opt/pw-browsers/chromium go test -count=1 ./...
```

Without it `internal/services` fails, which looks like a regression and is not. (Seen once even with it set: the five HTML-to-PDF tests fail with `Invalid parameters (-32602)`, a
DevTools protocol error from Playwright's Chromium 1194, on `main` as well. Not investigated.) Do not run `playwright install` (the
download is blocked).

The ImageMagick PDF policy edit in `set-up-dependencies.sh` is not needed: a source build's policy
(`/usr/local/etc/ImageMagick-7/policy.xml`) does not block PDF.

## PDF tests on the Windows PC or the Mac

`api/scripts/install-test-chromium.sh` once (Playwright's headless shell from the repo's pinned `@playwright/test`, after
`npm ci` in `desktop/`), then `api/scripts/test-pdf.sh` (extra `go test` flags pass through). From PowerShell call Git
Bash by path, because `bash` there is WSL: `& "C:\Program Files\Git\bin\bash.exe" api/scripts/test-pdf.sh`.

- The browser goes to `~/tools/ms-playwright`, not `AppData\Local\ms-playwright`: the Claude desktop app runs in a Windows
  package sandbox that redirects AppData, and Chromium started from the redirected copy fails with "side-by-side
  configuration is incorrect".
- With Ghostscript installed (`winget install ArtifexSoftware.GhostScript`) the script shims `gswin64c.exe` as `gs`, so the
  `file://` and SSRF guard tests also check the PDF text; without it those checks skip.
- The ImageMagick PDF tests (rasterizing, file type sniffing, AI image encoding) still need the real binding: CI only.
