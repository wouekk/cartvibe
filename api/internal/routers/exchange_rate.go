package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildExchangeRateRouter() *chi.Mux {
	exchangeRateRouter := chi.NewRouter()

	exchangeRateRouter.Use(middleware.UnifiedAuthMiddleware)

	exchangeRateRouter.Get("/", handlers.GetExchangeRates)
	exchangeRateRouter.Put("/", handlers.UpdateExchangeRates)

	return exchangeRateRouter
}
