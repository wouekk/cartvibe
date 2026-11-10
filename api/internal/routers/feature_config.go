package routers

import (
	"cartvibe/api/internal/handlers"

	"github.com/go-chi/chi/v5"
)

func BuildFeatureConfigRouter() *chi.Mux {
	featureConfigRouter := chi.NewRouter()
	featureConfigRouter.Get("/", handlers.GetFeatureConfig)

	return featureConfigRouter
}
