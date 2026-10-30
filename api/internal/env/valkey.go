package env

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"fmt"
	"github.com/hibiken/asynq"
	"os"
)

// The compose files name the job queue's service "valkey" and it listens on the standard port, so neither variable
// has to be set there. Valkey speaks the Redis protocol, which is why asynq's Redis client connects to it.
const (
	defaultValkeyHost = "valkey"
	defaultValkeyPort = 6379
)

func GetAsynqClientOptions() (asynq.RedisClientOpt, error) {
	valkeyConfig, err := GetValkeyConfig()
	if err != nil {
		return asynq.RedisClientOpt{}, err
	}

	return asynq.RedisClientOpt{
			Addr:     fmt.Sprintf("%s:%d", valkeyConfig.Host, valkeyConfig.Port),
			Username: valkeyConfig.Username,
			Password: valkeyConfig.Password,
		},
		nil
}

func GetValkeyConfig() (structs.ValkeyConfig, error) {
	host := os.Getenv(string(constants.ValkeyHost))
	if len(host) == 0 {
		host = defaultValkeyHost
	}

	port := defaultValkeyPort
	if raw := os.Getenv(string(constants.ValkeyPort)); len(raw) > 0 {
		parsed, err := utils.StringToInt(raw)
		if err != nil {
			return structs.ValkeyConfig{}, fmt.Errorf("invalid VALKEY_PORT environment variable: %w", err)
		}
		port = parsed
	}

	return structs.ValkeyConfig{
		Host:     host,
		Port:     port,
		Username: os.Getenv(string(constants.ValkeyUser)),
		Password: os.Getenv(string(constants.ValkeyPassword)),
	}, nil
}
