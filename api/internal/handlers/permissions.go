package handlers

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"net/http"
)

func GetPermissions(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting permissions.",
		Writer:       w,
		Request:      r,
		ResponseType: constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			bytes, err := utils.MarshalResponseData(permissions.All())
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(200)
			w.Write(bytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
