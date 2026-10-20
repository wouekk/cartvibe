package handlers

import (
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strconv"
	"strings"
)

// GetAppLog returns the newest application log entries for the admin Logs tab (Phase 3 M2). It is a
// GET, gated like System Settings, so only admins see it.
func GetAppLog(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting application log",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			level := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("level")))
			if level != "" && level != "INFO" && level != "ERROR" && level != "FATAL" {
				return http.StatusBadRequest, errBadLogLevel
			}

			limit := 0
			if raw := r.URL.Query().Get("limit"); raw != "" {
				parsed, err := strconv.Atoi(raw)
				if err != nil || parsed < 1 {
					return http.StatusBadRequest, errBadLogLimit
				}
				limit = parsed
			}

			entries, err := services.ReadAppLog(services.AppLogPath, level, limit)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(entries)
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

var errBadLogLevel = errors.New("level must be INFO, ERROR or FATAL")
var errBadLogLimit = errors.New("limit must be a positive number")
