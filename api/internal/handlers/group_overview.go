package handlers

import (
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
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
			query := r.URL.Query()

			overview, err := services.NewGroupOverviewService(nil).GetGroupOverviewForPeriod(
				token.UserId, groupId, query.Get("month"), query.Get("from"), query.Get("to"),
			)
			if errors.Is(err, services.ErrInvalidOverviewPeriod) {
				structs.WriteValidatorErrorResponse(w, structs.ValidatorError{
					Errors: map[string]string{"from": err.Error()},
				}, http.StatusBadRequest)
				return 0, nil
			}
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

// GetOverviewProducts lists the product lines behind a Dashboard tile or category slice for a period
// (Phase 3 D1): ?kind=UNHEALTHY|UNPLANNED|FOODGROUP|TAG (FOODGROUP with categoryId or foodGroup, TAG with
// tagId), then month or from/to as on the overview.
func GetOverviewProducts(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error getting the overview products",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupReceiptsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			query := r.URL.Query()

			filter := repositories.ProductKindFilter{Kind: query.Get("kind"), FoodGroup: query.Get("foodGroup")}
			vErr := structs.ValidatorError{Errors: map[string]string{}}
			if filter.Kind != "UNHEALTHY" && filter.Kind != "UNPLANNED" && filter.Kind != "FOODGROUP" && filter.Kind != "TAG" {
				vErr.Errors["kind"] = "kind must be UNHEALTHY, UNPLANNED, FOODGROUP or TAG"
			}
			if raw := query.Get("categoryId"); raw != "" {
				categoryId, err := utils.StringToUint(raw)
				if err != nil {
					vErr.Errors["categoryId"] = "categoryId must be a number"
				}
				filter.CategoryId = &categoryId
			}
			if raw := query.Get("tagId"); raw != "" {
				tagId, err := utils.StringToUint(raw)
				if err != nil {
					vErr.Errors["tagId"] = "tagId must be a number"
				}
				filter.TagId = &tagId
			} else if filter.Kind == "TAG" {
				vErr.Errors["tagId"] = "tagId is required for kind TAG"
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			products, err := services.NewGroupOverviewService(nil).GetOverviewProducts(
				token.UserId, groupId, filter, query.Get("month"), query.Get("from"), query.Get("to"),
			)
			if errors.Is(err, services.ErrInvalidOverviewPeriod) || errors.Is(err, services.ErrInvalidOverviewMonth) {
				structs.WriteValidatorErrorResponse(w, structs.ValidatorError{
					Errors: map[string]string{"from": err.Error()},
				}, http.StatusBadRequest)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(products)
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
