package handlers

import (
	"net/http"
	"time"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// aiUsageMonths is how far back the AI page looks: this month and the one before.
const aiUsageMonths = 2

// GetAiUsage answers what each model was asked and wrote, per month (B5.7): the calls and the tokens the providers
// counted. For whoever may read the AI settings.
func GetAiUsage(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting the AI usage",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			months, err := repositories.NewAiUsageRepository(nil).MonthsSince(time.Now(), aiUsageMonths)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			// A list, never null.
			if months == nil {
				months = []models.AiUsageMonth{}
			}

			responseBytes, err := utils.MarshalResponseData(months)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
