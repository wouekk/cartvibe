package handlers

import (
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

// GetGroupOverview serves the landing page's month at a glance. It is a GET (not a POST like the
// receipt summary) so a read-only API key may call it. The "All" group is allowed: like the
// receipts table, it spans every group the caller can read.
func GetGroupOverview(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error getting group overview",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupReceiptsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			month := r.URL.Query().Get("month")

			overview, err := services.NewGroupOverviewService(nil).GetGroupOverview(token.UserId, groupId, month)
			if errors.Is(err, services.ErrInvalidOverviewMonth) {
				structs.WriteValidatorErrorResponse(w, structs.ValidatorError{
					Errors: map[string]string{"month": err.Error()},
				}, http.StatusBadRequest)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(overview)
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
