package wranglerasynq

import (
	"github.com/hibiken/asynq"
	config "cartvibe/api/internal/env"
)

func GetAsynqInspector() (*asynq.Inspector, error) {
	opts, err := config.GetAsynqRedisClientConnectionOptions()
	if err != nil {
		return nil, err
	}

	return asynq.NewInspector(opts), nil
}
