package routers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildSignUpRouter() *chi.Mux {
	signUpRouter := chi.NewRouter()

	signUpRouter.Use(middleware.SetGeneralBodyData("signUpCommand", commands.SignUpCommand{}))
	signUpRouter.Post("/", handlers.SignUp)

	return signUpRouter
}
