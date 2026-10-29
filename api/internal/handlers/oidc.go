package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/oidc"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// GetOidcConnections lists the calling user's linked providers.
func GetOidcConnections(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting connected accounts",
		Writer:         w,
		Request:        r,
		ResponseType:   constants.ApplicationJson,
		AppPermissions: []string{permissions.AppAccountRead},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)

			identities, err := repositories.NewOidcIdentityRepository(nil).GetIdentitiesForUser(token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := json.Marshal(services.BuildOidcConnectionViews(identities))
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

// DeleteOidcConnection unlinks one of the caller's providers.
func DeleteOidcConnection(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error disconnecting account",
		Writer:         w,
		Request:        r,
		ResponseType:   constants.ApplicationJson,
		AppPermissions: []string{permissions.AppAccountUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)

			err := oidc.UnlinkIdentity(token.UserId, chi.URLParam(r, "name"))
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return http.StatusNotFound, err
				}

				if errors.Is(err, oidc.ErrWouldLockOut) {
					structs.WriteValidatorErrorResponse(w, structs.ValidatorError{
						Errors: map[string]string{
							"providerName": "This account was created by this provider and has no password to sign in with. Ask an administrator to set one before disconnecting.",
						},
					}, http.StatusBadRequest)

					return 0, nil
				}

				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
