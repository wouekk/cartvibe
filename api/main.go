package main

import (
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/routers"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/jobs"
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

	"golang.org/x/net/context"

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

	// worker and imgproc are reserved for the hosted plan. Refuse them rather than run as standalone:
	// a hosted process quietly serving one database is the failure the mode exists to prevent.
	mode, err := config.GetCellMode()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}
	if !mode.Implemented() {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Sprintf("CARTVIBE_MODE=%s is reserved and not implemented in this build", mode))
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("Mode: %s", mode))

	err = repositories.Connect()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	err = repositories.MakeMigrations()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	err = repositories.InitDB()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}

	err = repositories.ConnectToValkey()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("redis connection error: %w", err))
	}
	defer repositories.ShutdownAsynqClient()

	err = jobs.StartEmbeddedAsynqServer()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("asynq worker error: %w", err))
	}
	defer jobs.ShutDownEmbeddedAsynqServer()

	err = jobs.StartEmbeddedAsynqScheduler()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, fmt.Errorf("asynq server error: %w", err))
	}
	defer jobs.ShutDownEmbeddedAsynqScheduler()

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

	jobs.ShutDownEmbeddedAsynqServer()
	jobs.ShutDownEmbeddedAsynqScheduler()
	repositories.ShutdownAsynqClient()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err = httpServer.Shutdown(ctx)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}
}

func startHttpServer(router *chi.Mux) *http.Server {
	srv := &http.Server{
		Handler:      router,
		Addr:         "0.0.0.0:8081",
		WriteTimeout: 5 * time.Minute,
		ReadTimeout:  5 * time.Minute,
	}
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
