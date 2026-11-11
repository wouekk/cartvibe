package main

import (
	"cartvibe/api/internal/edge"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/imagetool"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/routers"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/jobs"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
	// Embeds the IANA zone database so the app time zone setting resolves
	// identically on an image without /usr/share/zoneinfo, rather than an
	// accepted name silently falling back to UTC.
	_ "time/tzdata"
)

func main() {
	err := logging.InitLog()
	if err != nil {
		fmt.Println("Failed to initialize log:", err)
		os.Exit(1)
	}

	logging.LogStd(logging.LOG_LEVEL_INFO, "Initializing...")

	err = config.SetConfigs()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	config.CheckRequiredEnvironmentVariables()

	err = repositories.Connect()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	// A short ENCRYPTION_KEY stops a new install and warns an existing one (S12). Development and test runs keep
	// their short keys.
	if config.GetDeployEnv() == "prod" {
		warning, err := repositories.CheckEncryptionKeyOfThisDatabase(config.GetEncryptionKey())
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
		}
		if warning != "" {
			logging.LogStd(logging.LOG_LEVEL_ERROR, warning)
		}
	}

	// A different version starting on existing data: copy the database before the schema is touched, so a release
	// that goes wrong has a snapshot from the moment before it (sqlite/backups). A failed copy is reported and the
	// start goes on: a full disk must not keep the household out of its lists.
	version := os.Getenv("VERSION")
	snapshot, err := repositories.SnapshotBeforeUpgrade(version)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "no snapshot was taken before this upgrade: "+err.Error())
	} else if snapshot != "" {
		logging.LogStd(logging.LOG_LEVEL_INFO, "database snapshot before the upgrade: "+snapshot)
	}

	err = repositories.MakeMigrations()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	err = repositories.InitDB()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	// Only now: a start that died in the migrations takes its snapshot again next time.
	if err := repositories.MarkVersionBooted(version); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "could not record the running version: "+err.Error())
	}

	// Receipts are converted by ImageMagick and read by Tesseract, as programs (internal/imagetool). The image
	// installs both; without one the API still serves everything that is not a HEIC, a PDF or a text-only AI model.
	if magick, tesseract := imagetool.Installed(); !magick || !tesseract {
		logging.LogStd(logging.LOG_LEVEL_ERROR, fmt.Sprintf(
			"image tools missing (magick installed: %t, tesseract installed: %t): photo conversion or text reading will fail",
			magick, tesseract))
	}

	// The job queue and the periodic sweeps. Both live in the database and this process, so there is no other
	// service to reach first; jobs a previous run was in the middle of are put back before the worker starts.
	err = jobs.Start()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("background work could not start: %w", err))
	}

	// Fetch what the logo store lacks now rather than at the first daily run (a fresh volume, a new release's
	// brands). Without a Logo.dev key it does nothing.
	services.StartShopLogoSync()

	// Plan every warranty reminder again, so none depends on this process having seen the change that moved it.
	go func() {
		if err := services.SyncAllWarrantyReminders(time.Now()); err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "warranty reminders: "+err.Error())
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	httpServer := startHttpServer(buildHandler())

	<-stop
	logging.LogStd(logging.LOG_LEVEL_INFO, "Stopping...")

	// New requests stop first, and the ones in flight get their answer. The live shopping-list streams are ended
	// by the hub (RegisterOnShutdown below); a request that still runs at the deadline (a long upload, an MCP
	// stream) is cut by the process ending, which is reported, not fatal.
	ctx, cancel := context.WithTimeout(context.Background(), httpShutdownTimeout)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "http shutdown: "+err.Error())
	}

	// Then the background work: no new job or sweep starts, and what is running is told to stop. A scan cut short
	// goes back on the queue for the next start without losing a try.
	if !jobs.Stop(backgroundShutdownTimeout) {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "background work did not stop in time; the process ends anyway")
	}

	// Last, the database: one checkpoint, so app.db alone holds everything, and the connections are closed.
	if err := repositories.CloseDB(); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "closing the database: "+err.Error())
	}

	logging.LogStd(logging.LOG_LEVEL_INFO, "Stopped")
}

// httpShutdownTimeout is how long requests in flight get to finish when the server stops, and
// backgroundShutdownTimeout how long a running job or sweep gets after that. Together, with the database's last
// checkpoint, they fit the stack's stop_grace_period of 30 seconds.
const (
	httpShutdownTimeout       = 10 * time.Second
	backgroundShutdownTimeout = 10 * time.Second
)

// The image's defaults. A server run from the binary alone can move both.
const (
	// Where the image keeps the built web app (docker/Dockerfile copies it there).
	defaultWebRoot = "/app/cartvibe-web"
	// The container's port; the compose files map a port of the NAS onto it.
	defaultProdListenAddress = ":80"
	devListenAddress         = "0.0.0.0:8081"
)

// buildHandler is what answers a request. In the image that is the edge around the API's router: it serves the
// web app's files and does what nginx used to do in front of the API (request limits, body sizes, security
// headers, compression; internal/edge). A development run is the router alone: the dev server serves the app
// and proxies /api to it.
func buildHandler() http.Handler {
	router := routers.BuildRootRouter()
	if config.GetDeployEnv() != "prod" {
		return router
	}

	webRoot := os.Getenv("WEB_ROOT")
	if webRoot == "" {
		webRoot = defaultWebRoot
	}
	// For test runs only (internal/edge.Config): unset, empty or unreadable is the limits as written.
	limitFactor, _ := strconv.ParseFloat(os.Getenv("REQUEST_LIMIT_FACTOR"), 64)

	return edge.New(router, edge.Config{
		WebRoot:     webRoot,
		LimitFactor: limitFactor,
		Log:         func(message string) { logging.LogStd(logging.LOG_LEVEL_INFO, message) },
	})
}

// listenAddress is where the server listens. In the image it is the container's port 80, on every interface: the
// API is its own front door (LISTEN_ADDRESS moves it, for a server run from the binary alone). A development run
// listens on 8081 for the dev server's proxy.
func listenAddress() string {
	if config.GetDeployEnv() != "prod" {
		return devListenAddress
	}
	if address := os.Getenv("LISTEN_ADDRESS"); address != "" {
		return address
	}
	return defaultProdListenAddress
}

func startHttpServer(handler http.Handler) *http.Server {
	srv := &http.Server{
		Handler: handler,
		Addr:    listenAddress(),
		// The whole request and the whole answer, uploads and downloads included. A live stream lifts its own
		// write deadline (handlers/shopping_list_stream.go).
		WriteTimeout: 5 * time.Minute,
		ReadTimeout:  5 * time.Minute,
		// With no proxy of ours in front, a connection that sends its request line a byte at a time, or sits
		// idle between requests, is this server's to close.
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	// A stream never finishes by itself, so Shutdown would wait for each until its deadline.
	srv.RegisterOnShutdown(services.GetShoppingListHub().Close)

	// Listening is done here, not in the goroutine, so a port that cannot be taken stops the start with its
	// reason instead of leaving a process that serves nothing.
	listener, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Sprintf(
			"cannot listen on %s: %v. In a container the API binds port 80 itself: that needs Docker 20.10 or newer, "+
				"or the NET_BIND_SERVICE capability the compose files keep (docker/entrypoint.sh hands it over where it is needed).",
			srv.Addr, err))
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, "Initialize completed")
	logging.LogStd(logging.LOG_LEVEL_INFO, "Listening on "+srv.Addr)

	go func() {
		err := srv.Serve(listener)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
		}
	}()

	return srv
}
