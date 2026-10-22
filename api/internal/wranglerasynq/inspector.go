package wranglerasynq

import (
	config "cartvibe/api/internal/env"
	"github.com/hibiken/asynq"
)

func GetAsynqInspector() (*asynq.Inspector, error) {
	opts, err := config.GetAsynqRedisClientConnectionOptions()
	if err != nil {
		return nil, err
	}

	return asynq.NewInspector(opts), nil
}
