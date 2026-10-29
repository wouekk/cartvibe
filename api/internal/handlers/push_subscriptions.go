package handlers

import (
	"errors"
	"net/http"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// SavePushSubscription stores the calling browser's Web Push subscription for the signed-in person.
func SavePushSubscription(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error saving the push subscription",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppNotificationsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			if services.WebPushPublicKey() == "" {
				return http.StatusNotFound, errors.New("push notifications are not set up on this server")
			}

			command := commands.UpsertPushSubscriptionCommand{}
			if err := command.LoadDataFromRequest(w, r); err != nil {
				return http.StatusBadRequest, err
			}

			token := structs.GetClaims(r)
			err := services.SavePushSubscription(token.UserId, command.Endpoint, command.Keys.P256dh, command.Keys.Auth)
			if errors.Is(err, services.ErrInvalidPushSubscription) {
				utils.WriteCustomErrorResponse(w, err.Error(), http.StatusBadRequest)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// RemovePushSubscription forgets one of the signed-in person's browsers. Removing one that is not stored is fine.
func RemovePushSubscription(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error removing the push subscription",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppNotificationsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertPushSubscriptionCommand{}
			if err := command.LoadDataFromRequest(w, r); err != nil {
				return http.StatusBadRequest, err
			}

			token := structs.GetClaims(r)
			if err := services.DeletePushSubscription(token.UserId, command.Endpoint); err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
