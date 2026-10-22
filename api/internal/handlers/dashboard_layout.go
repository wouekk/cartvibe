package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
)

// GetDashboardLayout returns the caller's own Dashboard layout; an empty layout means the default.
func GetDashboardLayout(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving the dashboard layout",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUserPreferencesRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			layout, err := repositories.NewDashboardLayoutRepository(nil).GetDashboardLayout(token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			layout.CanCustomise = services.CanCustomiseDashboard(token.UserId)

			bytes, err := utils.MarshalResponseData(&layout)
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

// UpdateDashboardLayout saves the caller's own Dashboard layout (`{"layout": "<json>"}`).
func UpdateDashboardLayout(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error saving the dashboard layout",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUserPreferencesUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			if !services.CanCustomiseDashboard(token.UserId) {
				utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
				return 0, nil
			}

			// Read a little more than the cap, so an oversized body is refused rather than cut short.
			body, err := io.ReadAll(io.LimitReader(r.Body, services.MaxDashboardLayoutBytes*2+1024))
			if err != nil {
				return http.StatusBadRequest, err
			}

			var command struct {
				Layout string `json:"layout"`
			}
			if json.Unmarshal(body, &command) != nil || services.ValidateDashboardLayout(command.Layout) != nil {
				utils.WriteCustomErrorResponse(w, "The dashboard layout could not be read.", http.StatusBadRequest)
				return 0, nil
			}

			layout, err := repositories.NewDashboardLayoutRepository(nil).SaveDashboardLayout(token.UserId, command.Layout)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			layout.CanCustomise = true

			bytes, err := utils.MarshalResponseData(&layout)
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
