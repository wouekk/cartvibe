package wranglerasynq

import (
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"github.com/hibiken/asynq"
)

var scheduler *asynq.Scheduler

func StartEmbeddedAsynqScheduler() error {
	opts, err := config.GetAsynqClientOptions()
	if err != nil {
		return err
	}

	schedulerOpts := asynq.SchedulerOpts{}

	scheduler = asynq.NewScheduler(
		opts,
		&schedulerOpts,
	)

	go func() {
		err = scheduler.Start()
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
		}
	}()

	return nil
}

func GetAsynqScheduler() *asynq.Scheduler {
	return scheduler
}

func ShutDownEmbeddedAsynqScheduler() {
	scheduler.Shutdown()
}
