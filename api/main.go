package main

import (
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/routers"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/jobs"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	// Embeds the IANA zone database so the app time zone setting resolves
	// identically on an image without /usr/share/zoneinfo, rather than an
	// accepted name silently falling back to UTC.
	_ "time/tzdata"

	"github.com/go-chi/chi/v5"
	"gopkg.in/gographics/imagick.v3/imagick"
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

	err = repositories.ConnectToValkey()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("redis connection error: %w", err))
	}

	err = jobs.StartEmbeddedAsynqServer()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("asynq worker error: %w", err))
	}

	err = jobs.StartEmbeddedAsynqScheduler()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("asynq server error: %w", err))
	}

	logging.LogStd(logging.LOG_LEVEL_INFO, "Initializing Imagick...")
	imagick.Initialize()
	defer imagick.Terminate()
	err = jobs.StartSystemCleanUpTasks()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
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

	router := routers.BuildRootRouter()
	httpServer := startHttpServer(router)

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

	// Then the background work: no new task is scheduled or taken, and a task that does not finish in asynq's own
	// shutdown window goes back on its queue for the next start.
	jobs.ShutDownEmbeddedAsynqScheduler()
	jobs.ShutDownEmbeddedAsynqServer()
	repositories.ShutdownAsynqClient()

	logging.LogStd(logging.LOG_LEVEL_INFO, "Stopped")
}

// httpShutdownTimeout is how long requests in flight get to finish when the server stops. The whole stop (this, plus
// asynq's eight seconds for running tasks) fits the stack's stop_grace_period of 30 seconds.
const httpShutdownTimeout = 10 * time.Second

// listenAddress is where the API listens. In the image nginx is the only client and sits in the same container, so
// the API answers on the loopback interface only: with host networking it would otherwise be reachable past nginx
// (its request limits and security headers). A development run keeps every interface (the dev server's proxy and
// other tools reach it by name).
func listenAddress() string {
	if config.GetDeployEnv() == "prod" {
		return "127.0.0.1:8081"
	}

	return "0.0.0.0:8081"
}

func startHttpServer(router *chi.Mux) *http.Server {
	srv := &http.Server{
		Handler:      router,
		Addr:         listenAddress(),
		WriteTimeout: 5 * time.Minute,
		ReadTimeout:  5 * time.Minute,
	}
	// A stream never finishes by itself, so Shutdown would wait for each until its deadline.
	srv.RegisterOnShutdown(services.GetShoppingListHub().Close)
	logging.LogStd(logging.LOG_LEVEL_INFO, "Initialize completed")
	logging.LogStd(logging.LOG_LEVEL_INFO, "Listening on port 8081")

	go func() {
		err := srv.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
		}
	}()

	return srv
}
