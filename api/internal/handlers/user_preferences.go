package handlers

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"net/http"
	"time"
)

func GetUserPreferences(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving user prefernces",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUserPreferencesRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			userPreferencesRepository := repositories.NewUserPreferencesRepository(nil)
			token := structs.GetClaims(r)

			userPreferences, err := userPreferencesRepository.GetUserPreferencesOrCreate(token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(&userPreferences)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(bytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func UpdateUserPreferences(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error updating user prefernces",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUserPreferencesUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			userPreferences := models.UserPrefernces{}
			userPreferences.LoadDataFromRequest(w, r)
			token := structs.GetClaims(r)

			userPreferencesRepository := repositories.NewUserPreferencesRepository(nil)
			updatedUserPreferences, err := userPreferencesRepository.UpdateUserPreferences(token.UserId, userPreferences)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			// A new lead time moves this person's pending warranty reminders.
			if err := services.SyncWarrantyRemindersForUser(token.UserId, time.Now()); err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "warranty reminders: "+err.Error())
			}

			bytes, err := utils.MarshalResponseData(&updatedUserPreferences)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(bytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
