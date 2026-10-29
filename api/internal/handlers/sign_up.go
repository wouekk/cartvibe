package handlers

import (
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"errors"
	"net/http"
)

func SignUp(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error signing up.",
		Writer:       w,
		Request:      r,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			systemSettingsService := services.NewSystemSettingsService(nil)
			featureConfig, err := systemSettingsService.GetFeatureConfig()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			if !featureConfig.EnableLocalSignUp {
				return http.StatusNotFound, errors.New("Local sign up is disabled")
			}

			userData := r.Context().Value("signUpCommand").(commands.SignUpCommand)
			// Public sign-up must never let the caller choose their own role: the
			// role is decided by CreateUser (the first user becomes the bootstrap
			// admin, everyone else gets the default app role). Only the
			// admin-protected POST /user endpoint may set a role explicitly, so
			// strip the caller-supplied app role id from the command.
			userData.AppRoleID = nil
			userRepository := repositories.NewUserRepository(nil)
			createdUser, err := userRepository.CreateUser(userData)

			if err != nil {
				return http.StatusInternalServerError, err
			}
			// A new household member is reminded of the warranties already running there.
			if err := services.SyncWarrantyRemindersForUser(createdUser.ID, time.Now()); err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "warranty reminders: "+err.Error())
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)

}

func validateSignUpData(userData models.User) structs.ValidatorError {
	db := repositories.GetDB()
	err := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	if len(userData.Username) == 0 {
		err.Errors["username"] = "Username is required"
	} else {
		var count int64
		db.Model(&models.User{}).Where("username = ?", userData.Username).Count(&count)

		if count > 0 {
			err.Errors["username"] = "Username must be unique"
		}
	}

	if len(userData.Password) == 0 {
		err.Errors["password"] = "Password is required"
	}

	if len(userData.DisplayName) == 0 {
		err.Errors["displayName"] = "Displayname is required"
	}

	return err
}
