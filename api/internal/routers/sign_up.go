package routers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/go-chi/chi/v5"
)

func BuildSignUpRouter(tokenValidator *jwtmiddleware.JWTMiddleware) *chi.Mux {
	signUpRouter := chi.NewRouter()

	signUpRouter.Use(middleware.SetGeneralBodyData("signUpCommand", commands.SignUpCommand{}))
	signUpRouter.Post("/", handlers.SignUp)

	return signUpRouter
}
