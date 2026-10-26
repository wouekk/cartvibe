package corspolicy

import (
	config "cartvibe/api/internal/env"

	"github.com/rs/cors"
)

func GetCorsPolicy() *cors.Cors {
	env := config.GetDeployEnv()
	if env == "dev" {
		return cors.New(cors.Options{
			AllowedOrigins:      []string{"http://localhost:4200", "http://localhost:8100"},
			AllowCredentials:    true,
			AllowPrivateNetwork: true,
			AllowedMethods:      []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:      []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "ngsw-bypass"},
		})
	}

	if env == "prod" {
		return cors.New(cors.Options{
			AllowedOrigins:      []string{"http://localhost:4200", "http://localhost:8100"},
			AllowCredentials:    true,
			AllowPrivateNetwork: true,
			AllowedMethods:      []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:      []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "ngsw-bypass"},
		})
	}

	return cors.Default()
}
